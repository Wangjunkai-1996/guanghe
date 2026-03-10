const { AppError } = require('./errors')
const {
  DATE_CANDIDATES,
  CONTENT_DATA_CANDIDATES,
  WORK_ANALYSIS_CANDIDATES,
  METRIC_TRIGGER_CANDIDATES,
  QUERY_BUTTON_CANDIDATES,
  OVERLAY_CLOSE_CANDIDATES,
  METRIC_FIELD_MAP,
  DEFAULT_METRICS,
  LOGIN_SESSION_STATUS
} = require('./constants')

function parseQrGenerateResponse(payloadText) {
  const payload = JSON.parse(payloadText)
  const data = payload?.content?.data
  if (!data?.codeContent) {
    throw new AppError(500, 'QR_PAYLOAD_INVALID', '二维码响应不完整')
  }
  return {
    qrCodeUrl: data.codeContent,
    ck: data.ck || null,
    resultCode: data.resultCode || null
  }
}

function parseJsonpPayload(text) {
  const match = String(text || '').match(/^\s*\w+\((.*)\)\s*;?\s*$/s)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch (error) {
    return null
  }
}

function findApiRecord(networkLog, contentId) {
  for (let index = networkLog.length - 1; index >= 0; index -= 1) {
    const entry = networkLog[index]
    if (!/kind\.pagelist/.test(entry.url || '')) continue
    const parsed = parseJsonpPayload(entry.text || '')
    const result = (((parsed || {}).data || {}).model || {}).result || []
    for (const item of result) {
      const candidateId = String(item?.contentId?.absolute || item?.contentInfo?.contentId || item?.contentInfo?.content?.id || '')
      if (candidateId === String(contentId)) return item
    }
  }
  return null
}

function extractMetricFromApiRecord(metric, apiRecord) {
  const field = METRIC_FIELD_MAP[metric]
  const rawValue = apiRecord?.[field]?.absolute
  return {
    field,
    value: rawValue === undefined || rawValue === null || rawValue === '' ? null : String(rawValue),
    source: `API (${field})`
  }
}

async function waitForLoginState(page, timeoutMs = 180000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const status = await detectLoginStatus(page)
    if (status === LOGIN_SESSION_STATUS.LOGGED_IN) return status
    await page.waitForTimeout(1500)
  }
  return LOGIN_SESSION_STATUS.FAILED
}

async function detectLoginStatus(page) {
  const url = page.url()
  if (/creator\.guanghe\.taobao\.com/i.test(url) && !/login\.taobao\.com/i.test(url)) {
    return LOGIN_SESSION_STATUS.LOGGED_IN
  }

  const visibleText = await page.evaluate(() => (document.body && document.body.innerText) || '').catch(() => '')
  const expiredVisible = await page.locator('text=/二维码已失效|已失效|刷新/').first().isVisible().catch(() => false)
  const confirmVisible = await page.locator('text=/扫描成功|请在手机上确认登录|请在手机上确认|确认登录/').first().isVisible().catch(() => false)
  const qrVisible = await page.locator('.qrcode-login, #qrcode-img canvas, #qrcode-img').first().isVisible().catch(() => false)

  if (expiredVisible && /二维码已失效|已失效/.test(visibleText)) return LOGIN_SESSION_STATUS.EXPIRED
  if (confirmVisible || /请在手机上确认登录|请在手机上确认|确认登录|扫描成功/.test(visibleText)) return LOGIN_SESSION_STATUS.WAITING_CONFIRM
  if (qrVisible) return LOGIN_SESSION_STATUS.WAITING_QR
  return LOGIN_SESSION_STATUS.WAITING_QR
}

async function extractAccountProfile(page) {
  const payload = await page.evaluate(() => {
    const fromWindow = window.GH_UserInfo?.accountCard
    if (fromWindow?.id) {
      return {
        accountId: String(fromWindow.id),
        nickname: fromWindow.nickName || '',
        avatar: fromWindow.avatar || '',
        certDesc: fromWindow.certDesc || ''
      }
    }

    const avatar = document.querySelector('img[alt="头像"], img[src*="ggpersonal"], img[src*="sns_logo"]')?.src || ''
    const nickname = Array.from(document.querySelectorAll('body *'))
      .map((node) => (node.textContent || '').trim())
      .find((text) => text && text.length <= 20 && !/首页|内容数据|发布作品|创作者服务/.test(text)) || ''

    return { accountId: '', nickname, avatar, certDesc: '' }
  })

  if (!payload?.accountId || !payload?.nickname) {
    throw new AppError(500, 'ACCOUNT_PROFILE_MISSING', '登录成功，但未能提取账号信息')
  }

  return payload
}

async function dismissInterferingOverlays(page) {
  for (let round = 0; round < 4; round += 1) {
    let clicked = false
    for (const text of OVERLAY_CLOSE_CANDIDATES) {
      const didClick = await clickAnyText(page, [text])
      if (didClick) {
        clicked = true
        // Allow fade out animation to finish
        await page.waitForTimeout(100)
      }
    }

    const closedByIcon = await page.evaluate(() => {
      const selectors = ['[class*=close]', '[class*=Close]', '.icon-close', '.close', '.next-icon-close', '[aria-label="关闭"]']
      for (const selector of selectors) {
        const node = document.querySelector(selector)
        if (node) {
          node.dispatchEvent(new MouseEvent('click', { bubbles: true }))
          return true
        }
      }
      return false
    }).catch(() => false)

    if (closedByIcon) {
      clicked = true
      await page.waitForTimeout(100)
    }
    if (!clicked) break
  }
}

async function navigateToWorkAnalysis(page) {
  await settle(page)
  await dismissInterferingOverlays(page)

  const alreadyThere = await page.getByText(/作品分析/).first().isVisible().catch(() => false)
  if (alreadyThere) return true

  let firstStep = await clickAnyText(page, CONTENT_DATA_CANDIDATES)
  if (!firstStep) firstStep = await clickSidebarMenu(page, CONTENT_DATA_CANDIDATES)
  if (firstStep) {
    await settle(page)
    await dismissInterferingOverlays(page)
  }

  let secondStep = await clickAnyText(page, WORK_ANALYSIS_CANDIDATES)
  if (!secondStep) secondStep = await clickSidebarMenu(page, WORK_ANALYSIS_CANDIDATES)
  if (!secondStep) {
    secondStep = await page.evaluate((candidates) => {
      const nodes = [...document.querySelectorAll('span,div,a,li')]
      for (const candidate of candidates) {
        const el = nodes.find((node) => (node.textContent || '').replace(/\s+/g, ' ').includes(candidate))
        if (el) {
          el.click()
          return true
        }
      }
      return false
    }, WORK_ANALYSIS_CANDIDATES).catch(() => false)
  }

  if (!secondStep) return false
  await settle(page)
  await dismissInterferingOverlays(page)
  return true
}

async function fillContentId(page, contentId) {
  const input = await findInputByKeywords(page, ['内容ID', '内容 Id', '内容id', '作品ID', '作品id', 'ID'])
  if (!input) {
    throw new AppError(500, 'CONTENT_ID_INPUT_NOT_FOUND', '没有找到内容 ID 输入框')
  }

  await input.click({ timeout: 5000 })
  await input.fill('')
  await input.fill(String(contentId))

  // Wait for React to process the input change
  await page.waitForTimeout(200)

  const clicked = await clickAnyText(page, QUERY_BUTTON_CANDIDATES)
  if (!clicked) {
    await page.keyboard.press('Enter').catch(() => { })
  }
  await settle(page)
}

async function pickDateRange30Days(page) {
  const clicked = await clickAnyText(page, DATE_CANDIDATES)
  if (!clicked) {
    throw new AppError(500, 'DATE_FILTER_NOT_FOUND', '没有找到 30 日筛选项')
  }
  await settle(page)
}

async function chooseMetrics(page, metrics = DEFAULT_METRICS) {
  const opened = await clickAnyText(page, METRIC_TRIGGER_CANDIDATES)
  if (!opened) return false

  // Wait for the dropdown or popover to be visible
  await settle(page)

  for (const metric of metrics) {
    const clicked = await clickAnyText(page, [metric]).catch(() => false)
    if (clicked) {
      // Small pause to allow React state to settle after clicking a checkbox
      await page.waitForTimeout(100)
    }
  }

  await clickAnyText(page, ['确定', '完成', '应用', '确认']).catch(() => false)
  await settle(page)
  return true
}

async function createNetworkRecorder(page) {
  const networkLog = []
  page.on('response', async (response) => {
    try {
      const url = response.url()
      const status = response.status()
      const headers = response.headers()
      const contentType = headers['content-type'] || headers['Content-Type'] || ''
      if (!/taobao|alicdn|guanghe/i.test(url)) return
      if (!/json|javascript|text\//i.test(contentType)) return
      const text = await response.text()
      if (!text || text.length > 300000) return
      networkLog.push({
        time: new Date().toISOString(),
        url,
        status,
        contentType,
        text
      })
      if (networkLog.length > 160) networkLog.shift()
    } catch (error) {
      // ignore
    }
  })
  return networkLog
}

async function clickSidebarMenu(page, candidates) {
  for (const candidate of candidates) {
    const clicked = await page.evaluate((text) => {
      const nodes = [...document.querySelectorAll('aside *, nav *, [class*=menu] *, [class*=Menu] *')]
      const target = nodes.find((node) => {
        const value = (node.textContent || '').replace(/\s+/g, ' ').trim()
        return value && value.includes(text)
      })
      if (!target) return false
      target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return true
    }, candidate).catch(() => false)

    if (clicked) {
      await settle(page)
      return true
    }
  }
  return false
}

async function clickAnyText(page, texts) {
  for (const text of texts) {
    const escaped = escapeRegExp(text)
    const patterns = [new RegExp(`^\\s*${escaped}\\s*$`), new RegExp(escaped)]
    const locators = [
      page.getByRole('button', { name: patterns[0] }).first(),
      page.getByRole('button', { name: patterns[1] }).first(),
      page.getByRole('tab', { name: patterns[1] }).first(),
      page.getByRole('link', { name: patterns[1] }).first(),
      page.getByRole('menuitem', { name: patterns[1] }).first(),
      page.getByRole('option', { name: patterns[1] }).first(),
      page.getByText(patterns[0]).first(),
      page.getByText(patterns[1]).first()
    ]

    for (const locator of locators) {
      try {
        if (await locator.isVisible({ timeout: 500 })) {
          await locator.click({ timeout: 2000 })
          return true
        }
      } catch (error) {
        // continue trying
      }
    }
  }
  return false
}

async function findInputByKeywords(page, keywords) {
  for (const keyword of keywords) {
    const regex = new RegExp(escapeRegExp(keyword), 'i')
    const locators = [
      page.getByLabel(regex).first(),
      page.locator(`input[placeholder*="${keyword}"]`).first(),
      page.locator(`textarea[placeholder*="${keyword}"]`).first(),
      page.locator(`xpath=//*[contains(normalize-space(), "${keyword}")]/following::input[1]`).first(),
      page.locator('input[type="text"]').first(),
      page.locator('input').first()
    ]

    for (const locator of locators) {
      try {
        if (await locator.isVisible({ timeout: 1000 })) return locator
      } catch (error) {
        // ignore
      }
    }
  }
  return null
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => { })
  await page.waitForTimeout(1200)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

module.exports = {
  DEFAULT_METRICS,
  METRIC_FIELD_MAP,
  LOGIN_SESSION_STATUS,
  parseQrGenerateResponse,
  parseJsonpPayload,
  findApiRecord,
  extractMetricFromApiRecord,
  waitForLoginState,
  detectLoginStatus,
  extractAccountProfile,
  dismissInterferingOverlays,
  navigateToWorkAnalysis,
  fillContentId,
  pickDateRange30Days,
  chooseMetrics,
  createNetworkRecorder,
  settle
}
