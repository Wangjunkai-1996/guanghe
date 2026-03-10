const crypto = require('crypto')
const path = require('path')
const { chromium } = require('playwright-core')
const { ensureDir, toArtifactUrl } = require('../../lib/files')
const { createTencentDocsError, ERROR_CODES } = require('./errors')

const WAITING_TEXT_CANDIDATES = ['扫码登录', '微信登录', 'QQ登录', '登录后继续', '登录后可继续']
const CONFIRM_TEXT_CANDIDATES = ['请在手机上确认', '已扫码', '确认登录', '请在微信中确认']
const EXPIRED_TEXT_CANDIDATES = ['二维码已失效', '二维码已过期', '请刷新二维码', '刷新二维码']
const LOGIN_PROMPT_TEXT_CANDIDATES = ['登录腾讯文档', '立即登录', '只能查看', '若要编辑文档，请登录后编辑', '请选择登录方式', '微信快捷登录']
const LOGGED_IN_SELECTOR_CANDIDATES = ['.desktop-avatar-pc:not(.desktop-avatar-not-logged-in-pc)', '.user-avatar', '.header-user-avatar', '#header-user-avatar', '.top-bar-user-info', '.pc_workbench-pc__2qtjl']

class TencentDocsLoginService {
  constructor({ browserExecutablePath, profileDir, artifactsRootDir, headless = true, defaultDocUrl = '', onStateChange = () => { } }) {
    this.browserExecutablePath = browserExecutablePath
    this.profileDir = profileDir
    this.artifactsRootDir = artifactsRootDir
    this.headless = headless
    this.defaultDocUrl = defaultDocUrl
    this.onStateChange = onStateChange
    this.sessions = new Map()
  }

  hasActiveSession() {
    return Array.from(this.sessions.values()).some((session) => ['WAITING_QR', 'WAITING_CONFIRM'].includes(session.status))
  }

  async createLoginSession({ docUrl, force = true } = {}) {
    const activeSession = Array.from(this.sessions.values()).find((session) => ['WAITING_QR', 'WAITING_CONFIRM'].includes(session.status))
    if (activeSession) {
      if (!force) {
        return this.getLoginSession(activeSession.loginSessionId)
      }
      await this.discardLoginSession(activeSession.loginSessionId).catch(() => { })
    }

    const loginSessionId = crypto.randomUUID()
    // 登录时始终导航到腾讯文档主页，避免打开只读表格后截图背景是表格而非二维码
    const targetUrl = 'https://docs.qq.com/desktop/'
    ensureDir(this.profileDir)

    let context
    try {
      context = await chromium.launchPersistentContext(this.profileDir, {
        headless: this.headless,
        executablePath: this.browserExecutablePath,
        viewport: { width: 1440, height: 1080 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox'
        ]
      })
    } catch (error) {
      throw mapTencentDocsBrowserError(error)
    }
    const page = context.pages()[0] || await context.newPage()
    // 使用 networkidle 等待页面完全加载（SPA 需要时间初始化用户状态）
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => { })
    await page.waitForTimeout(2000)

    // 先检测是否已经登录，如果已登录就不要再点登录按钮了
    const earlyStatus = await detectTencentDocsLoginStatus(page)
    if (earlyStatus === 'LOGGED_IN') {
      const session = {
        loginSessionId,
        targetUrl,
        status: 'LOGGED_IN',
        qrImageUrl: '',
        error: null,
        updatedAt: new Date().toISOString(),
        context,
        page
      }
      this.sessions.set(loginSessionId, session)
      this.emitState(session)
      await this.finalizeSession(loginSessionId, { status: 'LOGGED_IN', error: null })
      return this.getLoginSession(loginSessionId)
    }

    await openTencentDocsLoginPrompt(page)

    const session = {
      loginSessionId,
      targetUrl,
      status: 'WAITING_QR',
      qrImageUrl: '',
      error: null,
      updatedAt: new Date().toISOString(),
      context,
      page
    }

    this.sessions.set(loginSessionId, session)

    try {
      session.status = await detectTencentDocsLoginStatus(page)
      session.qrImageUrl = await captureTencentDocsLoginScreenshot({ artifactsRootDir: this.artifactsRootDir, loginSessionId, page })
      session.updatedAt = new Date().toISOString()
      this.emitState(session)
      if (session.status === 'LOGGED_IN') {
        await this.finalizeSession(loginSessionId, { status: 'LOGGED_IN', error: null })
      } else {
        this.startPolling(loginSessionId)
      }
    } catch (error) {
      await this.finalizeSession(loginSessionId, {
        status: 'FAILED',
        error: {
          code: error.code || 'TENCENT_DOCS_LOGIN_FAILED',
          message: error.message || '腾讯文档登录初始化失败',
          details: error.details || null
        }
      })
    }

    return this.getLoginSession(loginSessionId)
  }

  getLoginSession(loginSessionId) {
    const session = this.sessions.get(loginSessionId)
    if (!session) {
      throw createTencentDocsError(404, ERROR_CODES.LOGIN_SESSION_NOT_FOUND, '腾讯文档登录会话不存在')
    }

    return {
      loginSessionId: session.loginSessionId,
      status: session.status,
      qrImageUrl: withCacheBust(session.qrImageUrl, session.updatedAt),
      error: session.error,
      updatedAt: session.updatedAt
    }
  }

  async discardLoginSession(loginSessionId) {
    const session = this.sessions.get(loginSessionId)
    if (!session) return
    this.sessions.delete(loginSessionId)
    await closeSessionContext(session)
  }

  startPolling(loginSessionId) {
    const loop = async () => {
      const session = this.sessions.get(loginSessionId)
      if (!session) return

      try {
        const nextStatus = await detectTencentDocsLoginStatus(session.page)
        session.status = nextStatus
        session.updatedAt = new Date().toISOString()
        if (nextStatus === 'WAITING_QR' || nextStatus === 'WAITING_CONFIRM') {
          session.qrImageUrl = await captureTencentDocsLoginScreenshot({
            artifactsRootDir: this.artifactsRootDir,
            loginSessionId,
            page: session.page
          }).catch(() => session.qrImageUrl)
          this.emitState(session)
          setTimeout(loop, 2000)
          return
        }

        await this.finalizeSession(loginSessionId, {
          status: nextStatus,
          error: nextStatus === 'EXPIRED'
            ? { code: ERROR_CODES.LOGIN_REQUIRED, message: '腾讯文档登录二维码已过期，请重新生成', details: null }
            : null
        })
      } catch (error) {
        await this.finalizeSession(loginSessionId, {
          status: 'FAILED',
          error: {
            code: error.code || 'TENCENT_DOCS_LOGIN_FAILED',
            message: error.message || '腾讯文档登录轮询失败',
            details: error.details || null
          }
        })
      }
    }

    setTimeout(loop, 1500)
  }

  async finalizeSession(loginSessionId, { status, error }) {
    const session = this.sessions.get(loginSessionId)
    if (!session) return
    session.status = status
    session.error = error || null
    session.updatedAt = new Date().toISOString()
    this.emitState(session)
    await closeSessionContext(session)
  }

  emitState(session) {
    this.onStateChange({
      status: session.status,
      loginSessionId: session.loginSessionId,
      qrImageUrl: withCacheBust(session.qrImageUrl, session.updatedAt),
      updatedAt: session.updatedAt,
      error: session.error
    })
  }
}

function withCacheBust(url, updatedAt) {
  if (!url) return ''
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${encodeURIComponent(updatedAt || '')}`
}

function mapTencentDocsBrowserError(error) {
  const message = String(error?.message || '')
  if (message.includes('ProcessSingleton')) {
    return createTencentDocsError(409, ERROR_CODES.BROWSER_PROFILE_BUSY, '腾讯文档浏览器正被其他任务占用，请稍后重试')
  }
  return error
}

async function closeSessionContext(session) {
  if (!session?.context) return
  const context = session.context
  session.context = null
  session.page = null
  await Promise.race([
    context.close().catch(() => { }),
    new Promise(r => setTimeout(r, 2000))
  ])
}

async function detectTencentDocsLoginStatus(page) {
  const bodyText = await readBodyText(page)
  if (hasAnyText(bodyText, EXPIRED_TEXT_CANDIDATES)) return 'EXPIRED'

  // ★ 关键修复：先检测已登录的 DOM 元素（如用户头像、工作表容器），再检测登录提示文字。
  // 因为腾讯文档主页即使已登录，页面上也可能残留"立即登录"之类的广告文案，
  // 如果先检查文字就会被误判为未登录。
  for (const selector of LOGGED_IN_SELECTOR_CANDIDATES) {
    const exists = await page.locator(selector).first().isVisible().catch(() => false)
    if (exists) return 'LOGGED_IN'
  }

  // 然后再检查是否有登录提示（说明确实未登录）
  if (await hasTencentDocsLoginPrompt(page, bodyText) || /login|signin/i.test(page.url()) || hasAnyText(bodyText, WAITING_TEXT_CANDIDATES)) {
    if (hasAnyText(bodyText, CONFIRM_TEXT_CANDIDATES)) return 'WAITING_CONFIRM'
    return 'WAITING_QR'
  }

  // 如果既没找到登录按钮，也没看到登录成功的标志，说明处于加载中或中间态，保持等待
  return 'WAITING_QR'
}

async function openTencentDocsLoginPrompt(page) {
  // 如果已经登录了（能看到用户头像），直接跳过，不去点登录按钮
  for (const selector of LOGGED_IN_SELECTOR_CANDIDATES) {
    const exists = await page.locator(selector).first().isVisible().catch(() => false)
    if (exists) return
  }

  const candidates = [
    page.locator('.header-login-btn').first(),
    page.locator('text=登录腾讯文档').first(),
    page.getByRole('button', { name: /登录腾讯文档/ }).first(),
    page.locator('text=立即登录').first()
  ]

  for (const locator of candidates) {
    const visible = await locator.isVisible().catch(() => false)
    if (!visible) continue
    await locator.click({ timeout: 3000 }).catch(() => { })
    await page.waitForTimeout(1200)
    break
  }

  await prepareTencentDocsQrLogin(page)
}

async function prepareTencentDocsQrLogin(page) {
  const agreementCheckbox = page.locator('input[type="checkbox"]').last()
  const checkboxVisible = await agreementCheckbox.isVisible().catch(() => false)
  if (checkboxVisible) {
    const checked = await agreementCheckbox.isChecked().catch(() => false)
    if (!checked) {
      await agreementCheckbox.check().catch(async () => {
        await agreementCheckbox.click({ force: true }).catch(() => { })
      })
      await page.waitForTimeout(300)
    }
  }

  const wechatTabCandidates = [
    page.getByRole('button', { name: /微信登录/ }).first(),
    page.locator('text=微信登录').first()
  ]
  for (const locator of wechatTabCandidates) {
    const visible = await locator.isVisible().catch(() => false)
    if (!visible) continue
    await locator.click({ timeout: 3000 }).catch(() => { })
    await page.waitForTimeout(400)
    break
  }

  const immediateCandidates = [
    page.getByRole('button', { name: /^立即登录$/ }).first(),
    page.locator('text=立即登录').first()
  ]
  for (const locator of immediateCandidates) {
    const visible = await locator.isVisible().catch(() => false)
    if (!visible) continue
    await locator.click({ timeout: 3000 }).catch(() => { })
    await page.waitForTimeout(1200)
    break
  }

  const quickLoginCandidates = [
    page.getByRole('button', { name: /微信快捷登录/ }).first(),
    page.locator('text=微信快捷登录').first()
  ]
  for (const locator of quickLoginCandidates) {
    const visible = await locator.isVisible().catch(() => false)
    if (!visible) continue
    await locator.click({ timeout: 3000 }).catch(() => { })
    await page.waitForTimeout(1500)
    break
  }
}

async function hasTencentDocsLoginPrompt(page, bodyText = '') {
  if (hasAnyText(bodyText, LOGIN_PROMPT_TEXT_CANDIDATES)) return true
  return page.frames().some((frame) => /open\.weixin\.qq\.com\/connect\/qrconnect|bind-wx-quick-login/i.test(frame.url()))
}

async function captureTencentDocsLoginScreenshot({ artifactsRootDir, loginSessionId, page }) {
  const relativePath = path.join('tencent-docs', 'login-sessions', loginSessionId, 'qr.png')
  const fullPath = path.join(artifactsRootDir, relativePath)
  ensureDir(path.dirname(fullPath))

  // 优先截取微信二维码 iframe 元素，避免截到背景表格
  const qrFrame = page.frames().find((frame) => /open\.weixin\.qq\.com\/connect\/qrconnect/i.test(frame.url()))
  if (qrFrame) {
    const qrImg = qrFrame.locator('img.qrcode, img[src*="qrcode"], .wrp_code img, .qrcode').first()
    const qrVisible = await qrImg.isVisible().catch(() => false)
    if (qrVisible) {
      await qrImg.screenshot({ path: fullPath })
      return toArtifactUrl(relativePath)
    }
    // 如果二维码 img 找不到，截整个 iframe
    const frameElement = await qrFrame.frameElement().catch(() => null)
    if (frameElement) {
      await frameElement.screenshot({ path: fullPath })
      return toArtifactUrl(relativePath)
    }
  }

  // 尝试截取登录弹窗区域
  const loginModal = page.locator('.login-dialog, .auth-dialog, .dui-dialog, [class*="login-modal"], [class*="auth-modal"]').first()
  const modalVisible = await loginModal.isVisible().catch(() => false)
  if (modalVisible) {
    await loginModal.screenshot({ path: fullPath })
    return toArtifactUrl(relativePath)
  }

  // 最后兜底：截取整个视口（非 fullPage，避免截到背景滚动区域）
  await page.screenshot({ path: fullPath })
  return toArtifactUrl(relativePath)
}

async function readBodyText(page) {
  return page.locator('body').innerText().catch(() => '')
}

function hasAnyText(content, candidates) {
  const normalized = String(content || '')
  return candidates.some((candidate) => normalized.includes(candidate))
}

module.exports = { TencentDocsLoginService }
