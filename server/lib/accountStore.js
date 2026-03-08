const { ensureDir, readJson, writeJson } = require('./files')

class AccountStore {
  constructor({ accountsFile }) {
    this.accountsFile = accountsFile
    ensureDir(require('path').dirname(accountsFile))
  }

  list() {
    const payload = readJson(this.accountsFile, { accounts: [] })
    return Array.isArray(payload.accounts) ? payload.accounts : []
  }

  get(accountId) {
    return this.list().find((item) => item.accountId === accountId) || null
  }

  upsert(account) {
    const accounts = this.list()
    const next = accounts.filter((item) => item.accountId !== account.accountId)
    next.push(account)
    next.sort((left, right) => new Date(right.lastLoginAt || 0) - new Date(left.lastLoginAt || 0))
    writeJson(this.accountsFile, { accounts: next })
    return account
  }

  patch(accountId, patch) {
    const current = this.get(accountId)
    if (!current) return null
    return this.upsert({ ...current, ...patch })
  }

  remove(accountId) {
    const accounts = this.list().filter((item) => item.accountId !== accountId)
    writeJson(this.accountsFile, { accounts })
  }
}

module.exports = { AccountStore }
