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
  deleteAccount: (accountId) => request(`/api/accounts/${accountId}`, { method: 'DELETE' }),
  queryContent: ({ accountId, contentId }) => request('/api/queries', { method: 'POST', body: JSON.stringify({ accountId, contentId }) })
}
