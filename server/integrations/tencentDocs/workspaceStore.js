const path = require('path')
const { ensureDir, readJson, writeJson, writeJsonAsync, readJsonAsync } = require('../../lib/files')

const ACTIVE_LOGIN_STATUSES = new Set(['WAITING_QR', 'WAITING_CONFIRM', 'LOGGED_IN'])

class TencentDocsWorkspaceStore {
  constructor({ filePath }) {
    this.filePath = filePath
    this._memoryCache = null
    this._writeTimeout = null
    this._writePromise = Promise.resolve()
    this._isDirty = false
    ensureDir(path.dirname(filePath))
    this._initSync()
  }

  _initSync() {
    this._memoryCache = normalizeWorkspaceState(readJson(this.filePath, null))
  }

  getState() {
    if (!this._memoryCache) {
      this._initSync()
    }
    return this._memoryCache
  }

  getTarget(defaultTarget = {}) {
    const state = this.getState()
    if (state.target.docUrl || state.target.sheetName) {
      return {
        docUrl: state.target.docUrl,
        sheetName: state.target.sheetName
      }
    }

    return {
      docUrl: String(defaultTarget.docUrl || '').trim(),
      sheetName: String(defaultTarget.sheetName || '').trim()
    }
  }

  saveTarget(target = {}) {
    const state = this.getState()
    const nextState = normalizeWorkspaceState({
      ...state,
      target: {
        docUrl: target.docUrl,
        sheetName: target.sheetName
      }
    })
    this.write(nextState)
    return nextState.target
  }

  getLogin() {
    return this.getState().login
  }

  saveLogin(login = {}) {
    const state = this.getState()
    const nextState = normalizeWorkspaceState({
      ...state,
      login: {
        ...state.login,
        ...login
      }
    })
    this.write(nextState)
    return nextState.login
  }

  sanitize() {
    const state = normalizeWorkspaceState(readJson(this.filePath, null))
    if (ACTIVE_LOGIN_STATUSES.has(state.login.status)) {
      state.login = normalizeLoginState({
        status: 'EXPIRED',
        updatedAt: new Date().toISOString(),
        loginSessionId: '',
        qrImageUrl: '',
        error: null
      })
    }
    this.write(state)
    return state
  }

  write(state) {
    this._memoryCache = normalizeWorkspaceState(state)
    this._scheduleWrite(this._memoryCache)
  }

  _scheduleWrite(state) {
    this._isDirty = true
    if (this._writeTimeout) {
      clearTimeout(this._writeTimeout)
    }

    this._writeTimeout = setTimeout(() => {
      this.flush()
    }, 100)
  }

  async flush() {
    if (!this._isDirty) return this._writePromise

    if (this._writeTimeout) {
      clearTimeout(this._writeTimeout)
      this._writeTimeout = null
    }

    const payload = this._memoryCache
    const file = this.filePath

    this._writePromise = this._writePromise
      .then(() => writeJsonAsync(file, payload))
      .catch((error) => {
        console.error(`[TencentDocsWorkspaceStore] flush async error: ${error.message}`)
        writeJson(file, payload)
      })

    this._isDirty = false
    return this._writePromise
  }

  writeSync() {
    if (this._writeTimeout) {
      clearTimeout(this._writeTimeout)
      this._writeTimeout = null
    }

    if (this._isDirty) {
      writeJson(this.filePath, this._memoryCache)
      this._isDirty = false
    }
  }
}

function normalizeWorkspaceState(value) {
  const target = value?.target || value || {}
  return {
    target: {
      docUrl: String(target.docUrl || '').trim(),
      sheetName: String(target.sheetName || '').trim()
    },
    login: normalizeLoginState(value?.login)
  }
}

function normalizeLoginState(login) {
  return {
    status: String(login?.status || 'IDLE'),
    loginSessionId: String(login?.loginSessionId || ''),
    qrImageUrl: String(login?.qrImageUrl || ''),
    updatedAt: String(login?.updatedAt || ''),
    error: login?.error
      ? {
        code: String(login.error.code || 'TENCENT_DOCS_LOGIN_FAILED'),
        message: String(login.error.message || '腾讯文档登录失败'),
        details: login.error.details || null
      }
      : null
  }
}

module.exports = { TencentDocsWorkspaceStore }
