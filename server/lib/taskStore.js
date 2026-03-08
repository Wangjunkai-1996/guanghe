const { ensureDir, readJson, writeJson } = require('./files')

const TERMINAL_QUERY_STATUSES = new Set(['SUCCEEDED', 'NO_DATA', 'FAILED'])

class TaskStore {
  constructor({ tasksFile }) {
    this.tasksFile = tasksFile
    ensureDir(require('path').dirname(tasksFile))
  }

  list() {
    const payload = readJson(this.tasksFile, { tasks: [] })
    const tasks = Array.isArray(payload.tasks) ? payload.tasks.map(normalizeTask) : []
    return sortTasks(tasks)
  }

  get(taskId) {
    return this.list().find((item) => item.taskId === taskId) || null
  }

  upsert(task) {
    const normalized = normalizeTask(task)
    const tasks = this.list().filter((item) => item.taskId !== normalized.taskId)
    tasks.push(normalized)
    this.write(tasks)
    return normalized
  }

  patch(taskId, patch) {
    const current = this.get(taskId)
    if (!current) return null
    const next = normalizeTask(mergeTask(current, patch))
    return this.upsert(next)
  }

  remove(taskId) {
    const tasks = this.list().filter((item) => item.taskId !== taskId)
    this.write(tasks)
  }

  markInterruptedNonTerminalTasks() {
    const tasks = this.list()
    let changed = false
    const now = new Date().toISOString()
    const next = tasks.map((task) => {
      if (TERMINAL_QUERY_STATUSES.has(task.query.status)) return task
      changed = true
      return normalizeTask({
        ...task,
        loginSessionId: '',
        qrImageUrl: '',
        updatedAt: now,
        login: {
          ...task.login,
          status: 'INTERRUPTED'
        },
        query: {
          ...task.query,
          status: ['RUNNING', 'QUEUED'].includes(task.query.status) ? 'FAILED' : task.query.status
        },
        error: {
          code: 'TASK_INTERRUPTED',
          message: '服务已重启，请重新生成二维码继续。',
          details: null
        }
      })
    })

    if (changed) this.write(next)
    return changed
  }

  write(tasks) {
    writeJson(this.tasksFile, { tasks: sortTasks(tasks.map(normalizeTask)) })
  }
}

function mergeTask(current, patch = {}) {
  const next = {
    ...current,
    ...patch,
    login: mergeNested(current.login, patch.login),
    query: mergeNested(current.query, patch.query),
    screenshots: mergeNested(current.screenshots, patch.screenshots),
    artifacts: mergeNested(current.artifacts, patch.artifacts)
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'error')) next.error = patch.error
  if (Object.prototype.hasOwnProperty.call(patch, 'metrics')) next.metrics = patch.metrics
  if (Object.prototype.hasOwnProperty.call(patch, 'fetchedAt')) next.fetchedAt = patch.fetchedAt

  next.updatedAt = patch.updatedAt || new Date().toISOString()
  return next
}

function mergeNested(current, patch) {
  if (patch === undefined) return current
  if (patch === null) return null
  return { ...(current || {}), ...patch }
}

function normalizeTask(task = {}) {
  const now = new Date().toISOString()
  return {
    taskId: String(task.taskId || ''),
    remark: String(task.remark || '').trim(),
    contentId: String(task.contentId || ''),
    loginSessionId: String(task.loginSessionId || ''),
    qrImageUrl: String(task.qrImageUrl || ''),
    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt || task.createdAt || now,
    fetchedAt: task.fetchedAt || null,
    accountId: task.accountId ? String(task.accountId) : '',
    accountNickname: String(task.accountNickname || ''),
    error: normalizeError(task.error),
    login: {
      status: String(task.login?.status || 'INTERRUPTED')
    },
    query: {
      status: String(task.query?.status || 'IDLE')
    },
    metrics: task.metrics || null,
    screenshots: {
      rawUrl: String(task.screenshots?.rawUrl || ''),
      summaryUrl: String(task.screenshots?.summaryUrl || '')
    },
    artifacts: {
      resultUrl: String(task.artifacts?.resultUrl || ''),
      networkLogUrl: String(task.artifacts?.networkLogUrl || '')
    }
  }
}

function normalizeError(error) {
  if (!error) return null
  return {
    code: String(error.code || 'TASK_ERROR'),
    message: String(error.message || '任务执行失败'),
    details: error.details || null
  }
}

function sortTasks(tasks) {
  return [...tasks].sort((left, right) => {
    const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime()
    const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime()
    return rightTime - leftTime
  })
}

module.exports = { TaskStore }
