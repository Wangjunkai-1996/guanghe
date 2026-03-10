const { ensureDir, readJson, writeJson } = require('./files')
const EventEmitter = require('events')

class AccountStore extends EventEmitter {
  constructor({ accountsFile }) {
    super()
    this.accountsFile = accountsFile
    this._memoryCache = null
    this._writeTimeout = null
    this._isDirty = false
    ensureDir(require('path').dirname(accountsFile))
    this._initSync()
  }

  _initSync() {
    const payload = readJson(this.accountsFile, { accounts: [] })
    this._memoryCache = Array.isArray(payload.accounts) ? payload.accounts : []
  }

  list() {
    if (!this._memoryCache) {
      this._initSync()
    }
    return this._memoryCache
  }

  get(accountId) {
    return this.list().find((item) => item.accountId === accountId) || null
  }

  upsert(account) {
    const accounts = this.list()
    const next = accounts.filter((item) => item.accountId !== account.accountId)
    next.push(account)
    next.sort((left, right) => new Date(right.lastLoginAt || 0) - new Date(left.lastLoginAt || 0))
    this._memoryCache = next
    this._scheduleWrite()
    this.emit('change')
    return account
  }

  patch(accountId, patch) {
    const current = this.get(accountId)
    if (!current) return null
    return this.upsert({ ...current, ...patch })
  }

  remove(accountId) {
    this._memoryCache = this.list().filter((item) => item.accountId !== accountId)
    this._scheduleWrite()
    this.emit('change')
  }

  _scheduleWrite() {
    this._isDirty = true
    if (this._writeTimeout) {
      clearTimeout(this._writeTimeout)
    }
    this._writeTimeout = setTimeout(() => {
      this.flush()
    }, 100)
  }

  flush() {
    if (!this._isDirty) return

    if (this._writeTimeout) {
      clearTimeout(this._writeTimeout)
      this._writeTimeout = null
    }

    writeJson(this.accountsFile, { accounts: this._memoryCache })
    this._isDirty = false
  }
}

module.exports = { AccountStore }
