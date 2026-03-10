const crypto = require('crypto')
const path = require('path')
const { LOGIN_URL, LOGIN_SESSION_STATUS } = require('../lib/constants')
const { AppError } = require('../lib/errors')
const { removeDir, ensureDir, toArtifactUrl } = require('../lib/files')
const {
  parseQrGenerateResponse,
  detectLoginStatus,
  extractAccountProfile,
  waitForLoginState
} = require('../lib/guangheUtils')

class GuangheLoginService {
  constructor({ browserManager, accountStore, artifactsRootDir }) {
    this.browserManager = browserManager
    this.accountStore = accountStore
    this.artifactsRootDir = artifactsRootDir
    this.sessions = new Map()
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
        }

        if (status === LOGIN_SESSION_STATUS.LOGGED_IN) {
          const account = await extractAccountProfile(page)
          await this.persistLoggedInAccount(loginSessionId, account, session.profileDir)
          return
        }

        if (status === LOGIN_SESSION_STATUS.EXPIRED) {
          console.log(`[login] session=${loginSessionId} expired`)
          await this.browserManager.closeLoginSession(loginSessionId)
          return
        }
      } catch (error) {
        session.status = LOGIN_SESSION_STATUS.FAILED
        session.error = error.message
        session.updatedAt = new Date().toISOString()
        console.error(`[login] session=${loginSessionId} failed: ${error.message}`)
        await this.browserManager.closeLoginSession(loginSessionId)
        return
      }

      const elapsedMs = Date.now() - new Date(session.createdAt).getTime()
      if (elapsedMs > 5 * 60 * 1000) {
        console.log(`[login] session=${loginSessionId} TTL expired`)
        session.status = LOGIN_SESSION_STATUS.EXPIRED
        session.error = '二维码已过期，请重新生成'
        session.updatedAt = new Date().toISOString()
        await this.browserManager.closeLoginSession(loginSessionId)
        return
      }

      setTimeout(loop, 2000)
    }

    setTimeout(loop, 1500)
  }

  async persistLoggedInAccount(loginSessionId, account, profileDir) {
    const existing = this.accountStore.get(account.accountId)
    if (existing && existing.profileDir !== profileDir) {
      await this.browserManager.closeAccount(account.accountId)
      removeDir(existing.profileDir)
    }

    this.accountStore.upsert({
      accountId: account.accountId,
      nickname: account.nickname,
      avatar: account.avatar,
      certDesc: account.certDesc,
      profileDir,
      status: 'READY',
      lastLoginAt: new Date().toISOString()
    })

    this.browserManager.adoptLoginSession(loginSessionId, account.accountId)
    const session = this.sessions.get(loginSessionId)
    if (session) {
      session.status = LOGIN_SESSION_STATUS.LOGGED_IN
      session.account = {
        accountId: account.accountId,
        nickname: account.nickname,
        avatar: account.avatar,
        status: 'READY',
        lastLoginAt: new Date().toISOString()
      }
      session.updatedAt = new Date().toISOString()
    }

    console.log(`[login] session=${loginSessionId} logged_in accountId=${account.accountId} nickname=${account.nickname}`)
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
}

function withCacheBust(url, stamp) {
  if (!url) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${encodeURIComponent(stamp || Date.now())}`
}

module.exports = { GuangheLoginService }
