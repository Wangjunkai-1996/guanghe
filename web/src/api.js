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
  login: (password) => request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password })
  }),

  listBatches: () => request('/api/batches', { method: 'GET' }),
  createBatch: (payload) => request('/api/batches', {
    method: 'POST',
    body: JSON.stringify(payload || {})
  }),
  getBatch: (batchId) => request(`/api/batches/${batchId}`, { method: 'GET' }),
  updateBatchTarget: (batchId, payload) => request(`/api/batches/${batchId}/target`, {
    method: 'PUT',
    body: JSON.stringify(payload || {})
  }),
  inspectBatchIntake: (batchId) => request(`/api/batches/${batchId}/intake/inspect`, {
    method: 'POST'
  }),
  getSnapshot: (batchId, snapshotId) => request(`/api/batches/${batchId}/snapshots/${snapshotId}`, {
    method: 'GET'
  }),
  getCoverage: (batchId) => request(`/api/batches/${batchId}/coverage`, { method: 'GET' }),
  generateCoverage: (batchId) => request(`/api/batches/${batchId}/coverage/generate`, {
    method: 'POST'
  }),
  updateCoverageBinding: (batchId, itemId, payload) => request(`/api/batches/${batchId}/coverage/${itemId}/binding`, {
    method: 'PUT',
    body: JSON.stringify(payload || {})
  }),
  getRules: (batchId) => request(`/api/batches/${batchId}/rules`, { method: 'GET' }),
  saveRules: (batchId, payload) => request(`/api/batches/${batchId}/rules`, {
    method: 'PUT',
    body: JSON.stringify(payload || {})
  }),
  createRun: (batchId) => request(`/api/batches/${batchId}/runs`, {
    method: 'POST'
  }),
  getRun: (batchId, runId) => request(`/api/batches/${batchId}/runs/${runId}`, {
    method: 'GET'
  }),
  listRunTasks: (batchId, runId) => request(`/api/batches/${batchId}/runs/${runId}/tasks`, {
    method: 'GET'
  }),
  retryRun: (batchId, runId, payload) => request(`/api/batches/${batchId}/runs/${runId}/retry`, {
    method: 'POST',
    body: JSON.stringify(payload || {})
  }),
  getBatchHistory: (batchId) => request(`/api/batches/${batchId}/history`, { method: 'GET' }),
  cloneBatch: (batchId, payload) => request(`/api/batches/${batchId}/clone`, {
    method: 'POST',
    body: JSON.stringify(payload || {})
  }),

  listAccounts: (batchId) => request(batchId ? `/api/accounts?batchId=${encodeURIComponent(batchId)}` : '/api/accounts', {
    method: 'GET'
  }),
  getAccountHealth: (batchId) => request(batchId ? `/api/accounts/health?batchId=${encodeURIComponent(batchId)}` : '/api/accounts/health', {
    method: 'GET'
  }),
  createLoginSession: () => request('/api/accounts/login-sessions', { method: 'POST' }),
  getLoginSession: (loginSessionId) => request(`/api/accounts/login-sessions/${loginSessionId}`, { method: 'GET' }),
  submitSmsCode: (loginSessionId, code) => request(`/api/accounts/login-sessions/${loginSessionId}/sms-code`, {
    method: 'POST',
    body: JSON.stringify({ code })
  }),
  deleteAccount: (accountId) => request(`/api/accounts/${accountId}`, { method: 'DELETE' }),
  keepAliveAccounts: (payload) => request('/api/accounts/keepalive', {
    method: 'POST',
    body: JSON.stringify(payload || {})
  }),
  debugQuery: (payload) => request('/api/accounts/debug/query', {
    method: 'POST',
    body: JSON.stringify(payload || {})
  }),
  listRuleTemplates: () => request('/api/rule-templates', { method: 'GET' }),
  saveRuleTemplate: (payload) => request('/api/rule-templates', {
    method: 'POST',
    body: JSON.stringify(payload || {})
  }),
  applyRuleTemplate: (batchId, templateId) => request(`/api/batches/${batchId}/rules/apply-template/${templateId}`, {
    method: 'POST'
  })
}
