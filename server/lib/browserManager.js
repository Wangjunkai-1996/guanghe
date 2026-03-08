const path = require('path')
const { chromium } = require('playwright-core')
const { ensureDir } = require('./files')

class BrowserManager {
  constructor({ browserExecutablePath, profileRootDir }) {
    this.browserExecutablePath = browserExecutablePath
    this.profileRootDir = profileRootDir
    this.contexts = new Map()
    this.accountQueues = new Map()
  }

  loginKey(loginSessionId) {
    return `login:${loginSessionId}`
  }

  accountKey(accountId) {
    return `account:${accountId}`
  }

  loginProfileDir(loginSessionId) {
    return path.join(this.profileRootDir, 'login-sessions', loginSessionId)
  }

  async createLoginSessionContext(loginSessionId) {
    const key = this.loginKey(loginSessionId)
    const existing = this.contexts.get(key)
    if (existing) return existing

    const profileDir = this.loginProfileDir(loginSessionId)
    ensureDir(profileDir)
    const context = await this.launchContext(profileDir)
    const entry = { key, context, profileDir }
    this.contexts.set(key, entry)
    context.on('close', () => this.contexts.delete(key))
    return entry
  }

  async getOrCreateAccountContext(account) {
    const key = this.accountKey(account.accountId)
    const existing = this.contexts.get(key)
    if (existing) return existing

    ensureDir(account.profileDir)
    const context = await this.launchContext(account.profileDir)
    const entry = { key, context, profileDir: account.profileDir }
    this.contexts.set(key, entry)
    context.on('close', () => this.contexts.delete(key))
    return entry
  }

  adoptLoginSession(loginSessionId, accountId) {
    const loginKey = this.loginKey(loginSessionId)
    const accountKey = this.accountKey(accountId)
    const entry = this.contexts.get(loginKey)
    if (!entry) return null
    this.contexts.delete(loginKey)
    entry.key = accountKey
    this.contexts.set(accountKey, entry)
    return entry
  }

  async closeLoginSession(loginSessionId) {
    await this.closeByKey(this.loginKey(loginSessionId))
  }

  async closeAccount(accountId) {
    await this.closeByKey(this.accountKey(accountId))
  }

  async closeByKey(key) {
    const entry = this.contexts.get(key)
    if (!entry) return
    this.contexts.delete(key)
    await entry.context.close().catch(() => {})
  }

  async runAccountTask(accountId, task) {
    const previous = this.accountQueues.get(accountId) || Promise.resolve()
    const current = previous.then(task)
    const queued = current.catch(() => {})
    this.accountQueues.set(accountId, queued.finally(() => {
      if (this.accountQueues.get(accountId) === queued) {
        this.accountQueues.delete(accountId)
      }
    }))
    return current
  }

  async launchContext(profileDir) {
    return chromium.launchPersistentContext(profileDir, {
      headless: true,
      executablePath: this.browserExecutablePath,
      viewport: { width: 1728, height: 1117 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ]
    })
  }
}

module.exports = { BrowserManager }
