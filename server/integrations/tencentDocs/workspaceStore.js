const { ensureDir, readJson, writeJson } = require('../../lib/files')

const ACTIVE_LOGIN_STATUSES = new Set(['WAITING_QR', 'WAITING_CONFIRM'])

class TencentDocsWorkspaceStore {
  constructor({ filePath }) {
    this.filePath = filePath
    ensureDir(require('path').dirname(filePath))
    this.sanitize()
  }

  getState() {
    return normalizeWorkspaceState(readJson(this.filePath, null))
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
    return nextState
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
        updatedAt: new Date().toISOString()
      })
    }
    this.write(state)
    return state
  }

  write(state) {
    writeJson(this.filePath, normalizeWorkspaceState(state))
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
