const crypto = require('crypto')
const path = require('path')
const { chromium } = require('playwright-core')
const { ensureDir, toArtifactUrl } = require('../../lib/files')
const { createTencentDocsError, ERROR_CODES } = require('./errors')

const WAITING_TEXT_CANDIDATES = ['扫码登录', '微信登录', 'QQ登录', '登录后继续', '登录后可继续']
const CONFIRM_TEXT_CANDIDATES = ['请在手机上确认', '已扫码', '确认登录', '请在微信中确认']
const EXPIRED_TEXT_CANDIDATES = ['二维码已失效', '二维码已过期', '请刷新二维码', '刷新二维码']

class TencentDocsLoginService {
  constructor({ browserExecutablePath, profileDir, artifactsRootDir, headless = true, defaultDocUrl = '', onStateChange = () => {} }) {
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

  async createLoginSession({ docUrl } = {}) {
    const activeSession = Array.from(this.sessions.values()).find((session) => ['WAITING_QR', 'WAITING_CONFIRM'].includes(session.status))
    if (activeSession) {
      throw createTencentDocsError(409, ERROR_CODES.LOGIN_SESSION_ACTIVE, '已有腾讯文档登录二维码在等待扫码，请先完成当前登录')
    }

    const loginSessionId = crypto.randomUUID()
    const targetUrl = String(docUrl || this.defaultDocUrl || 'https://docs.qq.com/desktop/').trim()
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
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)

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
      qrImageUrl: session.qrImageUrl,
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
      updatedAt: session.updatedAt,
      error: session.error
    })
  }
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
  await context.close().catch(() => {})
}

async function detectTencentDocsLoginStatus(page) {
  const bodyText = await readBodyText(page)
  if (hasAnyText(bodyText, EXPIRED_TEXT_CANDIDATES)) return 'EXPIRED'
  if (/login|signin/i.test(page.url()) || hasAnyText(bodyText, WAITING_TEXT_CANDIDATES)) {
    if (hasAnyText(bodyText, CONFIRM_TEXT_CANDIDATES)) return 'WAITING_CONFIRM'
    return 'WAITING_QR'
  }
  return 'LOGGED_IN'
}

async function captureTencentDocsLoginScreenshot({ artifactsRootDir, loginSessionId, page }) {
  const relativePath = path.join('tencent-docs', 'login-sessions', loginSessionId, 'qr.png')
  const fullPath = path.join(artifactsRootDir, relativePath)
  ensureDir(path.dirname(fullPath))
  await page.screenshot({ path: fullPath, fullPage: true })
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
