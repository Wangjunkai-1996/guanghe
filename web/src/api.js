async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  })

  let payload = null
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    payload = await response.json()
  }

  if (!response.ok) {
    const error = new Error(payload?.error?.message || '请求失败')
    error.code = payload?.error?.code || 'REQUEST_FAILED'
    error.details = payload?.error?.details || null
    throw error
  }

  return payload
}

export const api = {
  me: () => request('/api/auth/me', { method: 'GET' }),
  login: (password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) }),
  listAccounts: () => request('/api/accounts', { method: 'GET' }),
  createLoginSession: () => request('/api/accounts/login-sessions', { method: 'POST' }),
  getLoginSession: (loginSessionId) => request(`/api/accounts/login-sessions/${loginSessionId}`, { method: 'GET' }),
  submitSmsCode: (loginSessionId, code) => request(`/api/accounts/login-sessions/${loginSessionId}/sms-code`, { method: 'POST', body: JSON.stringify({ code }) }),
  submitTaskSmsCode: (taskId, code) => request(`/api/tasks/${taskId}/sms-code`, { method: 'POST', body: JSON.stringify({ code }) }),
  deleteAccount: (accountId) => request(`/api/accounts/${accountId}`, { method: 'DELETE' }),
  listTasks: () => request('/api/tasks', { method: 'GET' }),
  createTaskBatch: (tasks) => request('/api/tasks/batch', { method: 'POST', body: JSON.stringify({ tasks }) }),
  createSheetDemandTaskBatch: (count) => request('/api/tasks/sheet-demand/batch', { method: 'POST', body: JSON.stringify({ count }) }),
  refreshTaskLogin: (taskId) => request(`/api/tasks/${taskId}/refresh-login`, { method: 'POST' }),
  retryTaskQuery: (taskId) => request(`/api/tasks/${taskId}/retry-query`, { method: 'POST' }),
  deleteTask: (taskId) => request(`/api/tasks/${taskId}`, { method: 'DELETE' }),
  queryContent: ({ accountId, contentId }) => request('/api/queries', { method: 'POST', body: JSON.stringify({ accountId, contentId }) }),
  getTencentDocsConfig: () => request('/api/tencent-docs/config', { method: 'GET' }),
  updateTencentDocsConfig: ({ docUrl, sheetName } = {}) => request('/api/tencent-docs/config', {
    method: 'PUT',
    body: JSON.stringify({ docUrl, sheetName })
  }),
  createTencentDocsLoginSession: ({ target } = {}) => request('/api/tencent-docs/login-sessions', {
    method: 'POST',
    body: JSON.stringify({ target })
  }),
  getTencentDocsLoginSession: (loginSessionId) => request(`/api/tencent-docs/login-sessions/${loginSessionId}`, { method: 'GET' }),
  inspectTencentDocsSheet: ({ target, maxRows } = {}) => request('/api/tencent-docs/sheet/inspect', {
    method: 'POST',
    body: JSON.stringify({ target, maxRows })
  }),
  previewTencentDocsHandoff: ({ resultUrl, target, maxRows, match } = {}) => request('/api/tencent-docs/handoff/preview', {
    method: 'POST',
    body: JSON.stringify({ source: { resultUrl }, target, maxRows, match })
  }),
  syncTencentDocsHandoff: ({ taskId, resultUrl, target, maxRows, match } = {}) => request('/api/tencent-docs/handoff/sync', {
    method: 'POST',
    body: JSON.stringify({ taskId, source: { resultUrl }, target, maxRows, match })
  })
}
