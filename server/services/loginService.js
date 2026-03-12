const crypto = require('crypto')
const path = require('path')
const { LOGIN_URL, LOGIN_SESSION_STATUS } = require('../lib/constants')
const { AppError } = require('../lib/errors')
const { removeDir, ensureDir, toArtifactUrl } = require('../lib/files')
const {
  parseQrGenerateResponse,
  detectLoginStatus,
  extractAccountProfile,
  waitForLoginState,
  submitSmsCode,
  triggerSmsIfNeeded
} = require('../lib/guangheUtils')

class GuangheLoginService {
  constructor({ browserManager, accountStore, artifactsRootDir }) {
    this.browserManager = browserManager
    this.accountStore = accountStore
    this.artifactsRootDir = artifactsRootDir
    this.sessions = new Map()
    this.sessionCleanupTimers = new Map()
  }

  listAccounts() {
    return this.accountStore.list().map(({ profileDir, ...account }) => account)
  }

  async createLoginSession() {
    const loginSessionId = crypto.randomUUID()
    const { context, profileDir } = await this.browserManager.createLoginSessionContext(loginSessionId)
    const page = context.pages()[0] || await context.newPage()
    const qrResponsePromise = page.waitForResponse((response) => response.url().includes('qrCode/generate.do'), { timeout: 30000 })
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' })
    const qrResponse = await qrResponsePromise
    const qrPayload = parseQrGenerateResponse(await qrResponse.text())
    const qrImageUrl = await this.captureLoginQrScreenshot({ loginSessionId, page })

    const session = {
      loginSessionId,
      status: LOGIN_SESSION_STATUS.WAITING_QR,
      qrCodeUrl: qrPayload.qrCodeUrl,
      qrImageUrl,
      ck: qrPayload.ck,
      profileDir,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      account: null,
      error: null,
      lastLoggedStatus: null
    }

    this.sessions.set(loginSessionId, session)
    console.log(`[login] session=${loginSessionId} created status=${session.status}`)
    this.startPolling(loginSessionId, page)
    return this.getLoginSession(loginSessionId)
  }

  getLoginSession(loginSessionId) {
    const session = this.sessions.get(loginSessionId)
    if (!session) {
      throw new AppError(404, 'LOGIN_SESSION_NOT_FOUND', '登录会话不存在')
    }
    return {
      loginSessionId: session.loginSessionId,
      status: session.status,
      qrCodeUrl: session.qrCodeUrl,
      qrImageUrl: withCacheBust(session.qrImageUrl, session.updatedAt),
      account: session.account,
      error: session.error,
      updatedAt: session.updatedAt
    }
  }

  async deleteAccount(accountId) {
    const account = this.accountStore.get(accountId)
    if (!account) return
    await this.browserManager.closeAccount(accountId)
    removeDir(account.profileDir)
    this.accountStore.remove(accountId)
  }

  async discardLoginSession(loginSessionId) {
    this.clearSessionCleanup(loginSessionId)
    const session = this.sessions.get(loginSessionId)
    if (!session) return

    if (session.status !== LOGIN_SESSION_STATUS.LOGGED_IN) {
      await this.browserManager.closeLoginSession(loginSessionId)
      removeDir(session.profileDir)
    }

    this.sessions.delete(loginSessionId)
  }

  startPolling(loginSessionId, page) {
    const loop = async () => {
      const session = this.sessions.get(loginSessionId)
      if (!session) return

      try {
        const status = await detectLoginStatus(page)
        session.status = status
        session.updatedAt = new Date().toISOString()

        if (session.lastLoggedStatus !== status) {
          session.lastLoggedStatus = status
          console.log(`[login] session=${loginSessionId} status=${status} url=${page.url()}`)
        }

        if (status === LOGIN_SESSION_STATUS.WAITING_QR || status === LOGIN_SESSION_STATUS.WAITING_CONFIRM) {
          session.qrImageUrl = await this.captureLoginQrScreenshot({ loginSessionId, page }).catch(() => session.qrImageUrl)
        } else {
          // 在其他状态（如短信验证、确认中），捕获全屏截图以便用户看到脚本在做什么
          session.qrImageUrl = await this.captureFullscreenScreenshot({ loginSessionId, page }).catch(() => session.qrImageUrl)
        }

        if (status === LOGIN_SESSION_STATUS.WAITING_SMS) {
          // 触发风控，记录 page
          session.page = page
          this.scheduleSessionCleanup(loginSessionId)
          // 只有当没有成功触发过时才尝试。由 triggerSmsIfNeeded 返回是否真正执行了点击或已发送
          if (!session.smsTriggered) {
            console.log(`[login] session=${loginSessionId} waiting for SMS code, attempting to trigger SMS logic...`)
            const triggered = await triggerSmsIfNeeded(page)
            if (triggered) {
              session.smsTriggered = true
              console.log(`[login] session=${loginSessionId} SMS trigger successful or already sent`)
            }
          }
        } else if (status === LOGIN_SESSION_STATUS.LOGGED_IN) {
          const account = await extractAccountProfile(page)
          await this.persistLoggedInAccount(loginSessionId, account, session.profileDir)
          return
        } else if (status === LOGIN_SESSION_STATUS.EXPIRED) {
          console.log(`[login] session=${loginSessionId} expired`)
          delete session.page
          await this.browserManager.closeLoginSession(loginSessionId)
          this.scheduleSessionCleanup(loginSessionId)
          return
        }
      } catch (error) {
        session.status = LOGIN_SESSION_STATUS.FAILED
        session.error = error.message
        session.updatedAt = new Date().toISOString()
        delete session.page
        console.error(`[login] session=${loginSessionId} failed: ${error.message}`)
        await this.browserManager.closeLoginSession(loginSessionId)
        this.scheduleSessionCleanup(loginSessionId)
        return
      }

      const elapsedMs = Date.now() - new Date(session.createdAt).getTime()
      if (elapsedMs > 5 * 60 * 1000) {
        console.log(`[login] session=${loginSessionId} TTL expired`)
        session.status = LOGIN_SESSION_STATUS.EXPIRED
        session.error = '二维码已过期，请重新生成'
        session.updatedAt = new Date().toISOString()
        delete session.page
        await this.browserManager.closeLoginSession(loginSessionId)
        this.scheduleSessionCleanup(loginSessionId)
        return
      }

      setTimeout(loop, 2000)
    }

    setTimeout(loop, 1500)
  }

  async persistLoggedInAccount(loginSessionId, account, profileDir) {
    const existing = this.accountStore.get(account.accountId)
    const existingAbsolute = existing ? this.browserManager.resolveProfileDir(existing.profileDir) : null
    
    if (existingAbsolute && existingAbsolute !== profileDir) {
      await this.browserManager.closeAccount(account.accountId)
      removeDir(existingAbsolute)
    }

    const relativeProfileDir = path.relative(this.browserManager.profileRootDir, profileDir)

    this.accountStore.upsert({
      accountId: account.accountId,
      nickname: account.nickname,
      avatar: account.avatar,
      certDesc: account.certDesc,
      profileDir: relativeProfileDir,
      status: 'READY',
      lastLoginAt: new Date().toISOString()
    })

    this.browserManager.adoptLoginSession(loginSessionId, account.accountId)
    const session = this.sessions.get(loginSessionId)
    if (session) {
      delete session.page
      session.status = LOGIN_SESSION_STATUS.LOGGED_IN
      session.account = {
        accountId: account.accountId,
        nickname: account.nickname,
        avatar: account.avatar,
        status: 'READY',
        lastLoginAt: new Date().toISOString()
      }
      session.updatedAt = new Date().toISOString()
      this.scheduleSessionCleanup(loginSessionId)
    }

    console.log(`[login] session=${loginSessionId} logged_in accountId=${account.accountId} nickname=${account.nickname}`)
  }

  async submitSmsCode(loginSessionId, code) {
    const session = this.sessions.get(loginSessionId)
    if (!session) throw new AppError(404, 'LOGIN_SESSION_NOT_FOUND', '登录会话不存在')
    if (session.status !== LOGIN_SESSION_STATUS.WAITING_SMS) {
      throw new AppError(400, 'INVALID_SESSION_STATUS', '当前会话不在等待短信验证码状态')
    }
    const page = session.page
    if (!page) throw new AppError(500, 'PAGE_NOT_FOUND', '浏览器页面丢失，请重新登录')

    const success = await submitSmsCode(page, code)
    if (!success) {
      // 验证码错误，保持 WAITING_SMS 状态，用户可以重试
      session.updatedAt = new Date().toISOString()
      throw new AppError(400, 'SMS_CODE_FAILED', '验证码提交失败，请检查验证码是否正确')
    }

    // 验证码正确
    this.clearSessionCleanup(loginSessionId)
    // 注意：原本这儿有 this.startPolling(loginSessionId, page) 再次启动轮询...
    // 但因为最新的设计中 WAITING_SMS 不再停止原生轮询，所以切勿在此重复启动新的轮询（防止雪崩循环）
    session.status = LOGIN_SESSION_STATUS.WAITING_CONFIRM
    session.updatedAt = new Date().toISOString()
  }

  clearSessionCleanup(loginSessionId) {
    const timer = this.sessionCleanupTimers.get(loginSessionId)
    if (!timer) return
    clearTimeout(timer)
    this.sessionCleanupTimers.delete(loginSessionId)
  }

  scheduleSessionCleanup(loginSessionId, delayMs = 10 * 60 * 1000) {
    this.clearSessionCleanup(loginSessionId)
    const timer = setTimeout(() => {
      this.sessionCleanupTimers.delete(loginSessionId)
      const session = this.sessions.get(loginSessionId)
      if (!session) return
      if (![LOGIN_SESSION_STATUS.LOGGED_IN, LOGIN_SESSION_STATUS.EXPIRED, LOGIN_SESSION_STATUS.FAILED].includes(session.status)) {
        return
      }
      delete session.page
      this.sessions.delete(loginSessionId)
    }, delayMs)
    if (typeof timer.unref === 'function') {
      timer.unref()
    }
    this.sessionCleanupTimers.set(loginSessionId, timer)
  }

  async waitUntilLoggedIn(loginSessionId, timeoutMs = 180000) {
    const session = this.sessions.get(loginSessionId)
    if (!session) throw new AppError(404, 'LOGIN_SESSION_NOT_FOUND', '登录会话不存在')
    const { context } = await this.browserManager.createLoginSessionContext(loginSessionId)
    const page = context.pages()[0] || await context.newPage()
    const status = await waitForLoginState(page, timeoutMs)
    return status
  }

  async captureLoginQrScreenshot({ loginSessionId, page }) {
    const relativePath = path.join('login-sessions', loginSessionId, 'qr.png')
    const fullPath = path.join(this.artifactsRootDir, relativePath)
    ensureDir(path.dirname(fullPath))

    const primary = page.locator('.qrcode-login').first()
    const fallback = page.locator('#qrcode-img').first()
    const canvas = page.locator('#qrcode-img canvas').first()

    await page.waitForTimeout(800)

    if (await primary.isVisible().catch(() => false)) {
      await primary.screenshot({ path: fullPath, timeout: 30000 })
    } else if (await fallback.isVisible().catch(() => false)) {
      await fallback.screenshot({ path: fullPath, timeout: 30000 })
    } else if (await canvas.isVisible().catch(() => false)) {
      await canvas.screenshot({ path: fullPath, timeout: 30000 })
    } else {
      throw new AppError(500, 'QR_ELEMENT_NOT_FOUND', '没有找到登录页二维码区域')
    }

    return toArtifactUrl(relativePath)
  }
  
  async captureFullscreenScreenshot({ loginSessionId, page }) {
    const relativePath = path.join('login-sessions', loginSessionId, 'full.png')
    const fullPath = path.join(this.artifactsRootDir, relativePath)
    ensureDir(path.dirname(fullPath))

    await page.screenshot({ path: fullPath, timeout: 5000 }).catch(() => {})
    return toArtifactUrl(relativePath)
  }
}

function withCacheBust(url, stamp) {
  if (!url) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${encodeURIComponent(stamp || Date.now())}`
}

module.exports = { GuangheLoginService }
