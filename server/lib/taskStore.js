const { ensureDir, readJson, writeJson, writeJsonAsync, readJsonAsync } = require('./files')

const TERMINAL_QUERY_STATUSES = new Set(['SUCCEEDED', 'NO_DATA', 'FAILED'])
const TERMINAL_SHEET_MATCH_STATUSES = new Set(['ALREADY_COMPLETE', 'NOT_IN_SHEET', 'CONTENT_ID_MISSING', 'DUPLICATE_NICKNAME', 'ROW_CHANGED'])

class TaskStore {
  constructor({ tasksFile }) {
    this.tasksFile = tasksFile
    this._memoryCache = null
    this._writeTimeout = null
    this._writePromise = Promise.resolve()
    this._isDirty = false
    ensureDir(require('path').dirname(tasksFile))
    this._initSync() // load initial state
  }

  _initSync() {
    const payload = readJson(this.tasksFile, { tasks: [] })
    const tasks = Array.isArray(payload.tasks) ? payload.tasks.map(normalizeTask) : []
    this._memoryCache = sortTasks(tasks)
  }

  list() {
    if (!this._memoryCache) {
      this._initSync()
    }
    return this._memoryCache
  }

  get(taskId) {
    return this.list().find((item) => item.taskId === taskId) || null
  }

  upsert(task) {
    const normalized = normalizeTask(task)
    const tasks = this.list().filter((item) => item.taskId !== normalized.taskId)
    tasks.push(normalized)
    const nextTasks = sortTasks(tasks)
    this._memoryCache = nextTasks
    this._scheduleWrite(nextTasks)
    return normalized
  }

  patch(taskId, patch) {
    const current = this.get(taskId)
    if (!current) return null
    const next = normalizeTask(mergeTask(current, patch))
    return this.upsert(next)
  }

  remove(taskId) {
    const nextTasks = this.list().filter((item) => item.taskId !== taskId)
    this._memoryCache = nextTasks
    this._scheduleWrite(nextTasks)
  }

  markInterruptedNonTerminalTasks() {
    const tasks = this.list()
    let changed = false
    const now = new Date().toISOString()
    const next = tasks.map((task) => {
      if (isTerminalTask(task)) return task
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

    if (changed) {
      this._memoryCache = sortTasks(next)
      this._scheduleWrite(this._memoryCache)
    }
    return changed
  }

  _scheduleWrite(tasks) {
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

    const payload = { tasks: this._memoryCache }
    const file = this.tasksFile

    this._writePromise = this._writePromise
      .then(() => writeJsonAsync(file, payload))
      .catch((error) => {
        console.error(`[TaskStore] flush file async error: ${error.message}`)
        writeJson(file, payload) // fallback
      })

    this._isDirty = false
    return this._writePromise
  }

  // legacy synchronous write fallback if absolutely needed during shutdown
  writeSync() {
    if (this._writeTimeout) {
      clearTimeout(this._writeTimeout)
    }
    if (this._isDirty) {
      writeJson(this.tasksFile, { tasks: this._memoryCache })
      this._isDirty = false
    }
  }

  write(tasks) {
    // legacy API
    this._memoryCache = sortTasks(tasks.map(normalizeTask))
    this._scheduleWrite(this._memoryCache)
  }
}

function isTerminalTask(task) {
  if (TERMINAL_QUERY_STATUSES.has(task.query?.status)) return true
  return TERMINAL_SHEET_MATCH_STATUSES.has(task.sheetMatch?.status)
}

function mergeTask(current, patch = {}) {
  const next = {
    ...current,
    ...patch,
    login: mergeNested(current.login, patch.login),
    query: mergeNested(current.query, patch.query),
    screenshots: mergeNested(current.screenshots, patch.screenshots),
    artifacts: mergeNested(current.artifacts, patch.artifacts),
    sync: mergeNested(current.sync, patch.sync),
    sheetTarget: mergeNested(current.sheetTarget, patch.sheetTarget),
    sheetMatch: mergeNested(current.sheetMatch, patch.sheetMatch)
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'error')) next.error = patch.error
  if (Object.prototype.hasOwnProperty.call(patch, 'metrics')) next.metrics = patch.metrics
  if (Object.prototype.hasOwnProperty.call(patch, 'fetchedAt')) next.fetchedAt = patch.fetchedAt
  if (Object.prototype.hasOwnProperty.call(patch, 'contentId')) next.contentId = patch.contentId
  if (Object.prototype.hasOwnProperty.call(patch, 'remark')) next.remark = patch.remark

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
    taskMode: String(task.taskMode || 'MANUAL'),
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
    },
    sync: normalizeSync(task.sync),
    sheetTarget: normalizeSheetTarget(task.sheetTarget),
    sheetMatch: normalizeSheetMatch(task.sheetMatch)
  }
}

function normalizeSheetTarget(target) {
  return {
    docUrl: String(target?.docUrl || ''),
    sheetName: String(target?.sheetName || '')
  }
}

function normalizeSheetMatch(sheetMatch) {
  if (!sheetMatch) return null
  return {
    status: String(sheetMatch.status || ''),
    sheetRow: Number(sheetMatch.sheetRow || 0),
    nickname: String(sheetMatch.nickname || ''),
    contentId: String(sheetMatch.contentId || ''),
    missingColumns: Array.isArray(sheetMatch.missingColumns) ? sheetMatch.missingColumns.map((item) => String(item || '')) : [],
    matchedAt: String(sheetMatch.matchedAt || ''),
    details: sheetMatch.details || null
  }
}

function normalizeSync(sync) {
  return {
    status: String(sync?.status || 'IDLE'),
    operationId: String(sync?.operationId || ''),
    target: sync?.target || null,
    match: sync?.match || null,
    writeSummary: sync?.writeSummary || null,
    artifacts: normalizeSyncArtifacts(sync?.artifacts),
    error: normalizeError(sync?.error)
  }
}

function normalizeSyncArtifacts(artifacts) {
  if (!artifacts) return null
  return {
    beforeReadUrl: String(artifacts.beforeReadUrl || ''),
    afterReadUrl: String(artifacts.afterReadUrl || ''),
    beforeFillUrl: String(artifacts.beforeFillUrl || ''),
    afterFillUrl: String(artifacts.afterFillUrl || ''),
    beforeWriteUrl: String(artifacts.beforeWriteUrl || ''),
    afterWriteUrl: String(artifacts.afterWriteUrl || ''),
    errorUrl: String(artifacts.errorUrl || ''),
    selectionTsvUrl: String(artifacts.selectionTsvUrl || ''),
    previewJsonUrl: String(artifacts.previewJsonUrl || ''),
    writeLogUrl: String(artifacts.writeLogUrl || '')
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

