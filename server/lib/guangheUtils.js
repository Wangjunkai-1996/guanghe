const { AppError } = require('./errors')
const {
  DATE_CANDIDATES,
  CONTENT_DATA_CANDIDATES,
  WORK_ANALYSIS_CANDIDATES,
  CONTENT_MANAGE_CANDIDATES,
  WORKS_MANAGE_CANDIDATES,
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

function findWorksManagementApiRecord(networkLog, contentId) {
  for (let index = networkLog.length - 1; index >= 0; index -= 1) {
    const entry = networkLog[index]
    if (!/mtop\.taobao\.gcm\.content\.admin\.list/.test(entry.url || '')) continue
    const parsed = parseJsonpPayload(entry.text || '')
    const items = (((parsed || {}).data || {}).model || {}).data || []
    for (const item of items) {
      const candidateId = String(item?.baseInfo?.id || item?.contentId || item?.id || '')
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

function formatWanValue(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return '-'
  if (numeric >= 10000) {
    return `${(numeric / 10000).toFixed(2)}w`
  }
  return String(numeric)
}

function extractWorksManagementMetrics(apiRecord) {
  const interactive = apiRecord?.interactiveInfo || {}
  const viewRaw = interactive.pvCount ?? interactive.platformPvCount ?? interactive.campaignPvCount
  return {
    viewCount: formatWanValue(viewRaw),
    likeCount: formatWanValue(interactive.likeCount),
    collectCount: formatWanValue(interactive.collectCount),
    commentCount: formatWanValue(interactive.commentCount),
    source: 'api'
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
  const smsVisible = await page.locator('input[placeholder*="验证码"], input[id*="sms"], input[name*="sms"], input[type="tel"]').first().isVisible().catch(() => false)

  if (expiredVisible && /二维码已失效|已失效/.test(visibleText)) return LOGIN_SESSION_STATUS.EXPIRED
  if (confirmVisible || /请在手机上确认登录|请在手机上确认|确认登录|扫描成功/.test(visibleText)) return LOGIN_SESSION_STATUS.WAITING_CONFIRM
  if (smsVisible || /手机验证码|短信验证码|请输入验证码|安全验证|输入验证码/.test(visibleText)) return LOGIN_SESSION_STATUS.WAITING_SMS
  if (qrVisible) return LOGIN_SESSION_STATUS.WAITING_QR
  return LOGIN_SESSION_STATUS.WAITING_QR
}

async function submitSmsCode(page, code) {
  try {
    console.log(`[submitSmsCode] 开始提交验证码: ${code}, URL: ${page.url()}`)
    const input = page.locator('input[placeholder*="验证码"], input[id*="sms"], input[name*="sms"], input[type="tel"]').first()

    if (!(await input.isVisible().catch(() => false))) {
      console.error('[submitSmsCode] 未找到验证码输入框, 页面源码:', await page.content().catch(() => '无法获取源码'))
      await page.screenshot({ path: 'artifacts/web/sms-input-not-found.png' }).catch(() => { })
      return false
    }
    await input.fill('')
    // 改用 pressSequentially(也就是慢慢模拟打字输入)以强行触发前端框架的 onChange 侦听器，防止提交按钮死活不亮
    await input.pressSequentially(String(code), { delay: 50 })
    await input.evaluate(node => node.blur()).catch(() => {})
    await page.waitForTimeout(500)

    // 点击确认/提交按钮
    // 增加多种选择器回退机制，避免由于前序存在隐藏的 submit 导致 .first() 查找到不可见元素
    let clicked = false;
    const locators = [
      page.locator('#submitBtn').first(),
      page.locator('input[type="submit"][value="确定"]').first(),
      page.locator('button[type="submit"], input[type="button"][value="确定"]').first(),
      page.getByRole('button', { name: /确定|提交|确认|验证|登录/ }).first()
    ]

    for (const locator of locators) {
      if (await locator.isVisible().catch(() => false)) {
        console.log(`[submitSmsCode] 找到可见的提交按钮: ${locator.toString()}, 准备点击`)
        
        // 如果前端开发人员在元素上写死了 disabled，我们强行把它移除掉（因为已经输入完毕了）
        await locator.evaluate((node) => node.removeAttribute('disabled')).catch(() => {})
        
        // 带上 force: true 强制点击，且缩短这里无意义的死等超时
        await locator.click({ force: true, timeout: 5000 }).catch(e => console.warn('[submitSmsCode] 点击警告:', e.message))
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.error('[submitSmsCode] 遍历所有特征仍未找到可见的验证码提交按钮, 页面源码:', await page.content().catch(() => '无法获取源码'))
      await page.screenshot({ path: 'artifacts/web/sms-btn-not-found.png' }).catch(() => { })
      return false
    }

    // 等待页面响应
    await page.waitForTimeout(2000)

    // 判断是否还在验证码页面（说明验证码错误）
    const statusAfter = await detectLoginStatus(page)
    console.log(`[submitSmsCode] 点击提交后, 页面状态检测为: ${statusAfter}, URL: ${page.url()}`)

    if (statusAfter === LOGIN_SESSION_STATUS.WAITING_SMS) {
      console.warn('[submitSmsCode] 验证码可能错误，页面未跳转')
      await page.screenshot({ path: 'artifacts/web/sms-submit-failed.png' }).catch(() => { })
      const errorMsg = await page.locator('.err-msg, .error, [class*="error"]').first().textContent().catch(() => '')
      if (errorMsg) {
        console.warn(`[submitSmsCode] 发现页面可能的错误提示文字: ${errorMsg}`)
      }
      return false
    }

    console.log('[submitSmsCode] 验证码提交成功，页面状态发生变化')
    return true
  } catch (err) {
    console.error('[submitSmsCode] 提交验证码过程中发生异常:', err.message, err.stack)
    await page.screenshot({ path: 'artifacts/web/sms-submit-exception.png' }).catch(() => { })
    return false
  }
}

async function triggerSmsIfNeeded(page) {
  try {
    // 扩大选择器范围，防止淘宝使用 input 标签
    const getCodeBtn = page.locator('button:has-text("获取短信校验码"), button:has-text("获取验证码"), a:has-text("验证码"), a:has-text("校验码"), input[value*="获取短信校验码"], input[value*="获取验证码"]').first()
    
    if (await getCodeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      const isDisabled = await getCodeBtn.evaluate((b) => b.disabled || b.classList.contains('disabled')).catch(() => true)
      if (!isDisabled) {
        console.log(`[triggerSmsIfNeeded] 未禁用，开始点击获取验证码按钮... URL: ${page.url()}`)
        await getCodeBtn.click()
        await page.waitForTimeout(1000)
        console.log('[triggerSmsIfNeeded] 点击获取验证码按钮完毕')
      } else {
        console.log('[triggerSmsIfNeeded] 验证码按钮处于禁用状态（可能已经发送或倒计时中）')
      }
    } else {
      console.log('[triggerSmsIfNeeded] 未在当前页面找到"获取短信校验码"按钮')
    }
  } catch (err) {
    console.warn('[triggerSmsIfNeeded] 尝试点击获取短信校验码时发生异常:', err.message)
  }
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

  const alreadyThere = /unify\/work-analysis/i.test(page.url())
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


async function navigateToWorksManagement(page) {
  await settle(page)
  await dismissInterferingOverlays(page)

  const alreadyThere = /content-manage\/works-manage|page\/workspace\/tb/i.test(page.url())
  if (alreadyThere) return true

  let firstStep = await clickAnyText(page, CONTENT_MANAGE_CANDIDATES)
  if (!firstStep) firstStep = await clickSidebarMenu(page, CONTENT_MANAGE_CANDIDATES)
  if (firstStep) {
    await settle(page)
    await dismissInterferingOverlays(page)
  }

  let secondStep = await clickAnyText(page, WORKS_MANAGE_CANDIDATES)
  if (!secondStep) secondStep = await clickSidebarMenu(page, WORKS_MANAGE_CANDIDATES)
  
  if (!secondStep) return false
  await settle(page)
  await dismissInterferingOverlays(page)
  return true
}

async function searchWorkInList(page, contentId) {
  // Wait for the page to be stable
  await settle(page)

  const input = await findSearchInput(page)
  if (!input) {
    console.warn('[searchWorkInList] 未找到搜索框')
    return { ok: false, reason: 'INPUT_NOT_FOUND' }
  }

  await input.click({ timeout: 5000 })
  await input.fill('')
  await page.keyboard.press('Meta+A').catch(() => { })
  await page.keyboard.press('Backspace').catch(() => { })

  // Use pressSequentially to ensure React picks up the value
  await input.pressSequentially(String(contentId), { delay: 50 })
  await page.waitForTimeout(500)

  let trigger = 'enter'
  const clicked = await clickAnyText(page, QUERY_BUTTON_CANDIDATES)
  if (clicked) {
    trigger = 'button'
  } else {
    await page.keyboard.press('Enter').catch(() => { })
  }

  const debug = await waitForWorksSearchResult(page, contentId)
    || { hasTextHit: false, rowCount: 0, cellCount: 0 }

  return {
    ok: true,
    trigger,
    foundId: debug.hasTextHit,
    rowCount: debug.rowCount,
    cellCount: debug.cellCount
  }
}

async function waitForWorksSearchResult(page, contentId, timeoutMs = 4500) {
  const startedAt = Date.now()
  let previousSignature = ''
  let stableRounds = 0

  while (Date.now() - startedAt < timeoutMs) {
    await settle(page)
    const snapshot = await page.evaluate((targetId) => {
      const id = String(targetId || '').trim()
      const bodyText = (document.body && document.body.innerText) || ''
      const rowCount = document.querySelectorAll('tr, [role="row"], .next-table-row, [class*="table-row"], [class*="TableRow"], [class*="list-row"], [class*="ListRow"]').length
      const cellCount = document.querySelectorAll('td, [role="gridcell"], .next-table-cell, [class*="cell"], [class*="Cell"]').length
      const hasTextHit = !!id && bodyText.includes(id)
      return {
        hasTextHit,
        rowCount,
        cellCount,
        signature: `${hasTextHit}:${rowCount}:${cellCount}`
      }
    }, String(contentId)).catch(() => null)

    if (!snapshot) {
      await page.waitForTimeout(200)
      continue
    }

    if (snapshot.signature === previousSignature) {
      stableRounds += 1
    } else {
      previousSignature = snapshot.signature
      stableRounds = 0
    }

    if (snapshot.hasTextHit || stableRounds >= 1) {
      return snapshot
    }

    await page.waitForTimeout(200)
  }

  return null
}

async function extractWorksManagementData(page, contentId) {
  return page.evaluate((targetId) => {
    const sid = String(targetId).trim()
    const isValidRect = (r) => r.width > 180 && r.height > 40 && r.width < 2000 && r.height < 800
    const hasIdText = (text) => {
      const compact = String(text || '').replace(/\s+/g, '')
      return compact.includes(`ID:${sid}`) || compact.includes(`ID：${sid}`) || compact.includes(sid)
    }

    const rowSelectors = [
      'tr',
      '[role="row"]',
      '.next-table-row',
      '[class*="table-row"]',
      '[class*="TableRow"]',
      '[class*="list-row"]',
      '[class*="ListRow"]',
      '[class*="card"]',
      '[class*="Card"]'
    ].join(',')

    const rows = Array.from(document.querySelectorAll(rowSelectors))
    let targetCell = rows.find((el) => {
      const text = el.innerText || ''
      if (!hasIdText(text)) return false
      const r = el.getBoundingClientRect()
      return isValidRect(r)
    }) || null

    if (!targetCell) {
      // Fallback: cell-level candidates (avoid scanning all divs to reduce false positives)
      const cellSelectors = [
        'td',
        '[role="gridcell"]',
        '.next-table-cell',
        '[class*="cell"]',
        '[class*="Cell"]'
      ].join(',')
      const cells = Array.from(document.querySelectorAll(cellSelectors))
      targetCell = cells.find((el) => {
        const text = el.innerText || ''
        if (!hasIdText(text)) return false
        const r = el.getBoundingClientRect()
        return isValidRect(r)
      }) || null
    }

    if (!targetCell) {
      return null
    }

    // 2. 提取数据
    let stats = { viewCount: '-', likeCount: '-', collectCount: '-', commentCount: '-', source: '' }

    const messageNumbers = Array.from(
      targetCell.querySelectorAll('.messageNumber, [class*="messageNumber"], .message-number, [class*="message-number"]')
    )
      .map((node) => (node.textContent || '').trim())
      .filter((text) => text)

    if (messageNumbers.length >= 4) {
      stats.viewCount = messageNumbers[0]
      stats.likeCount = messageNumbers[1]
      stats.collectCount = messageNumbers[2]
      stats.commentCount = messageNumbers[3]
      stats.source = 'messageNumber'
    }

    if (stats.viewCount === '-') {
      const quantityDiv = targetCell.querySelector('[class*="quantity"], [class*="Quantity"], [class*="stats"], [class*="Stats"]')
      if (quantityDiv) {
        const nums = (quantityDiv.innerText || '').match(/[0-9.]+(?:[wW万])?/g) || []
        if (nums.length >= 4) {
          stats.viewCount = nums[0]
          stats.likeCount = nums[1]
          stats.collectCount = nums[2]
          stats.commentCount = nums[3]
          stats.source = 'quantityText'
        }
      }
    }

    if (stats.viewCount === '-') {
      let afterIdText = (targetCell.innerText || '').split(sid)[1] || ''
      afterIdText = afterIdText.replace(/\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}(:\d{2})?/g, '')
      const nums = afterIdText.match(/[0-9.]+(?:[wW万])?/g) || []
      if (nums.length >= 4) {
        stats.viewCount = nums[0]
        stats.likeCount = nums[1]
        stats.collectCount = nums[2]
        stats.commentCount = nums[3]
        stats.source = 'afterIdText'
      }
    }

    const rect = targetCell.getBoundingClientRect()
    return {
      ...stats,
      rect: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height
      }
    }
  }, String(contentId))
}


async function fillContentId(page, contentId) {
  const input = await findSearchInput(page)
  if (!input) {
    throw new AppError(500, 'CONTENT_ID_INPUT_NOT_FOUND', '没有找到内容 ID 输入框')
  }

  await input.click({ timeout: 5000 })
  await input.fill('')
  // Clear any existing text
  await page.keyboard.press('Meta+A').catch(() => { })
  await page.keyboard.press('Backspace').catch(() => { })
  
  await input.pressSequentially(String(contentId), { delay: 50 })

  // Wait for React to process the input change
  await page.waitForTimeout(300)

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
      if (!isIgnorableNetworkRecorderError(error)) {
        const url = typeof response?.url === 'function' ? response.url() : 'unknown'
        console.warn(`[network-recorder] failed to capture response body: ${url} ${error?.message || error}`)
      }
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

async function findSearchInput(page) {
  const placeholders = [
    /请输入.*ID/i,
    /作品ID/i,
    /关键字/i,
    /内容ID/i,
    /ID/i,
    /搜索/i
  ]
  
  for (const p of placeholders) {
    const loc = page.getByPlaceholder(p).filter({ visible: true }).first()
    if (await loc.isVisible({ timeout: 1000 }).catch(() => false)) {
      console.log(`[findSearchInput] 匹配到占位符: ${p}`)
      return loc
    }
  }

  // Fallback to searching for inputs in the search section or main area
  const searchAreaLocators = [
    '.micro-gg-search-section input:visible',
    '.SearchInput_searchSpace__1QJ4L input:visible',
    'input[type="search"]:visible',
    'input[type="text"]:visible'
  ]

  for (const selector of searchAreaLocators) {
    const loc = page.locator(selector).first()
    if (await loc.isVisible({ timeout: 500 }).catch(() => false)) {
      console.log(`[findSearchInput] 匹配到选择器: ${selector}`)
      return loc
    }
  }

  // Fallback to role-based textbox/searchbox if only one is visible
  const textbox = page.getByRole('textbox').filter({ visible: true })
  if (await textbox.count().catch(() => 0) === 1) {
    console.log('[findSearchInput] 使用唯一可见的 textbox')
    return textbox.first()
  }

  const searchbox = page.getByRole('searchbox').filter({ visible: true })
  if (await searchbox.count().catch(() => 0) === 1) {
    console.log('[findSearchInput] 使用唯一可见的 searchbox')
    return searchbox.first()
  }

  return null
}

async function findInputByKeywords(page, keywords) {
  return findSearchInput(page)
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => { })
  const softWaitStartedAt = Date.now()
  await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => { })
  const remainingMs = 600 - (Date.now() - softWaitStartedAt)
  if (remainingMs > 0) {
    await page.waitForTimeout(remainingMs)
  }
}

function isIgnorableNetworkRecorderError(error) {
  const message = String(error?.message || error || '')
  return /body.*used already|No resource with given identifier found|Target page, context or browser has been closed|Target closed|Session closed|Browser has been closed/i.test(message)
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
  findWorksManagementApiRecord,
  extractMetricFromApiRecord,
  extractWorksManagementMetrics,
  waitForLoginState,
  detectLoginStatus,
  extractAccountProfile,
  dismissInterferingOverlays,
  navigateToWorkAnalysis,
  navigateToWorksManagement,
  searchWorkInList,
  extractWorksManagementData,
  fillContentId,
  pickDateRange30Days,
  chooseMetrics,
  createNetworkRecorder,
  settle,
  submitSmsCode,
  triggerSmsIfNeeded
}
