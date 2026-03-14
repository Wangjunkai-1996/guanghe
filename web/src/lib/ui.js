export function buildFallbackAvatar(seed = 'G', source) {
  if (source) return source
  const letter = String(seed || 'G').trim().slice(0, 1) || 'G'
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="#E5E7EB"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="36" fill="#111827">${letter}</text></svg>`)}`
}

export function formatAccountStatus(status) {
  if (status === 'READY') return '可用'
  if (status === 'LOGIN_REQUIRED') return '需重新登录'
  return status || '未知'
}

export function formatLoginStatus(status) {
  switch (status) {
    case 'WAITING_QR':
      return '等待扫码'
    case 'WAITING_CONFIRM':
      return '等待手机确认'
    case 'WAITING_SMS':
      return '请输入手机验证码'
    case 'LOGGED_IN':
      return '登录成功'
    case 'EXPIRED':
      return '二维码已过期'
    case 'FAILED':
      return '登录失败'
    default:
      return status || '未知状态'
  }
}

export function formatTencentDocsLoginStatus(status) {
  switch (status) {
    case 'WAITING_QR':
      return '等待扫码'
    case 'WAITING_CONFIRM':
      return '等待确认'
    case 'LOGGED_IN':
      return '已登录'
    case 'EXPIRED':
      return '二维码已过期'
    case 'FAILED':
      return '登录失败'
    default:
      return '未登录'
  }
}

export function getTencentDocsLoginTone(status) {
  if (status === 'LOGGED_IN') return 'success'
  if (status === 'EXPIRED') return 'warning'
  if (status === 'FAILED') return 'danger'
  return 'info'
}

export function getTencentDocsLoginDescription(status) {
  if (status === 'LOGGED_IN') return '腾讯文档登录态已保存，可直接执行读表和回填。'
  if (status === 'WAITING_CONFIRM') return '二维码已生成，扫码后请在手机上确认腾讯文档登录。'
  if (status === 'WAITING_QR') return '请用腾讯文档或微信扫码，以建立可复用的编辑登录态。'
  if (status === 'EXPIRED') return '二维码已过期，请重新生成。'
  if (status === 'FAILED') return '登录失败，请重新生成二维码后重试。'
  return '建议先建立腾讯文档登录态，避免读表或回填时被打断。'
}

export function formatTaskLoginStatus(status) {
  if (status === 'INTERRUPTED') return '任务中断'
  return formatLoginStatus(status)
}

export function formatTaskQueryStatus(status) {
  switch (status) {
    case 'IDLE':
      return '待查询'
    case 'QUEUED':
      return '排队中'
    case 'RUNNING':
      return '查询中'
    case 'SUCCEEDED':
      return '查询成功'
    case 'NO_DATA':
      return '无可查数据'
    case 'FAILED':
      return '查询失败'
    default:
      return status || '未知状态'
  }
}

export function getTaskQueryTone(status) {
  if (status === 'SUCCEEDED') return 'success'
  if (status === 'NO_DATA') return 'warning'
  if (status === 'FAILED') return 'danger'
  if (status === 'RUNNING' || status === 'QUEUED') return 'info'
  return 'info'
}

export function resolveTaskSyncState(task, syncConfig = null) {
  if (task?.sync?.status === 'RUNNING') return 'RUNNING'
  if (task?.sync?.status === 'SUCCEEDED') return 'SUCCEEDED'
  if (task?.sync?.status === 'FAILED') return 'FAILED'
  if (task?.query?.status !== 'SUCCEEDED') return 'PENDING'
  if (syncConfig && syncConfig.available === false) return 'UNAVAILABLE'
  if (syncConfig && syncConfig.enabled === false) return 'DISABLED'
  if (syncConfig && syncConfig.defaultTargetConfigured === false) return 'NOT_CONFIGURED'
  return 'IDLE'
}

export function formatTaskSyncStatus(task, syncConfig = null) {
  switch (resolveTaskSyncState(task, syncConfig)) {
    case 'RUNNING':
      return '同步中'
    case 'SUCCEEDED':
      return '已同步'
    case 'FAILED':
      return '同步失败'
    case 'DISABLED':
      return '未启用'
    case 'NOT_CONFIGURED':
      return '待配置'
    case 'UNAVAILABLE':
      return '未接入'
    case 'IDLE':
      return '未同步'
    default:
      return '待查询'
  }
}

export function getTaskSyncTone(task, syncConfig = null) {
  switch (resolveTaskSyncState(task, syncConfig)) {
    case 'SUCCEEDED':
      return 'success'
    case 'FAILED':
      return 'danger'
    case 'RUNNING':
      return 'info'
    case 'IDLE':
    case 'NOT_CONFIGURED':
      return 'warning'
    case 'DISABLED':
    case 'UNAVAILABLE':
      return 'neutral'
    default:
      return 'info'
  }
}

export function isTaskFinished(task) {
  if (['SUCCEEDED', 'NO_DATA', 'FAILED'].includes(task?.query?.status)) return true
  return ['EXPIRED', 'FAILED', 'INTERRUPTED'].includes(task?.login?.status) && task?.query?.status === 'IDLE'
}

export function formatDateTime(value, { style = 'full' } = {}) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'

  if (style === 'compact') {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function formatMetricValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  const normalized = String(value).replace(/,/g, '')
  const numeric = Number(normalized)
  if (Number.isNaN(numeric)) return String(value)
  const hasDecimals = normalized.includes('.')
  return numeric.toLocaleString('zh-CN', {
    minimumFractionDigits: hasDecimals ? 0 : 0,
    maximumFractionDigits: hasDecimals ? 2 : 0
  })
}

export function getErrorPresentation(error) {
  if (!error) return null
  if (error.code === 'NO_DATA') {
    return {
      tone: 'warning',
      title: '当前 ID 在近 30 日内无可查数据',
      description: '该内容在当前账号和近 30 日范围内没有可返回的作品分析记录。',
      action: null
    }
  }
  if (error.code === 'ACCOUNT_LOGIN_REQUIRED') {
    return {
      tone: 'danger',
      title: '当前账号登录态已失效',
      description: '请重新扫码登录后再发起查询。',
      action: 'retry-login'
    }
  }
  return {
    tone: 'danger',
    title: '查询失败',
    description: error.message || '系统处理失败，请稍后重试。',
    action: null
  }
}
