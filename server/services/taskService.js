const crypto = require('crypto')
const { AppError } = require('../lib/errors')

const ACTIVE_LOGIN_STATUSES = new Set(['WAITING_QR', 'WAITING_CONFIRM'])
const TRACKED_LOGIN_STATUSES = new Set(['WAITING_QR', 'WAITING_CONFIRM', 'LOGGED_IN'])
const TERMINAL_QUERY_STATUSES = new Set(['SUCCEEDED', 'NO_DATA', 'FAILED'])
const BUSY_QUERY_STATUSES = new Set(['QUEUED', 'RUNNING'])

class GuangheTaskService {
  constructor({ taskStore, loginService, queryService, tencentDocsSyncService = null, maxActiveLoginSessions = 5, maxConcurrentQueries = 2, pollIntervalMs = 2000 }) {
    this.taskStore = taskStore
    this.loginService = loginService
    this.queryService = queryService
    this.tencentDocsSyncService = tencentDocsSyncService
    this.maxActiveLoginSessions = maxActiveLoginSessions
    this.maxConcurrentQueries = maxConcurrentQueries
    this.pollIntervalMs = pollIntervalMs
    this.queryQueue = []
    this.queuedTaskIds = new Set()
    this.runningQueries = new Map()
    this.runningSyncs = new Map()
    this.pollTimer = null
    this.isPolling = false

    this.taskStore.markInterruptedNonTerminalTasks()
  }

  start() {
    if (this.pollTimer) return
    void this.pollOnce()
    this.pollTimer = setInterval(() => {
      void this.pollOnce()
    }, this.pollIntervalMs)
    if (typeof this.pollTimer.unref === 'function') {
      this.pollTimer.unref()
    }
  }

  stop() {
    if (!this.pollTimer) return
    clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  listTasks() {
    return this.taskStore.list()
  }

  async createTasksBatch(entries = []) {
    const normalizedEntries = validateBatchEntries(entries)
    const tasks = []

    this.ensureActiveLoginCapacity(normalizedEntries.length)

    try {
      for (const entry of normalizedEntries) {
        const loginSession = await this.loginService.createLoginSession()
        const task = this.taskStore.upsert(createBaseTask(entry, loginSession))
        tasks.push(task)
      }
      return { tasks }
    } catch (error) {
      await Promise.all(tasks.map((task) => this.safeDiscardSession(task.loginSessionId)))
      for (const task of tasks) {
        this.taskStore.remove(task.taskId)
      }
      throw error
    }
  }

  async refreshTaskLogin(taskId) {
    const task = this.getTaskOrThrow(taskId)
    if (this.isTaskBusy(task)) {
      throw new AppError(409, 'TASK_BUSY', '任务正在执行查询或同步，暂时不能刷新二维码')
    }

    this.ensureActiveLoginCapacity(1, taskId)
    if (task.loginSessionId) {
      await this.safeDiscardSession(task.loginSessionId)
    }

    const loginSession = await this.loginService.createLoginSession()
    return this.taskStore.patch(taskId, {
      loginSessionId: loginSession.loginSessionId,
      qrImageUrl: loginSession.qrImageUrl,
      accountId: '',
      accountNickname: '',
      fetchedAt: null,
      error: null,
      login: { status: loginSession.status },
      query: { status: 'IDLE' },
      metrics: null,
      screenshots: { rawUrl: '', summaryUrl: '' },
      artifacts: { resultUrl: '', networkLogUrl: '' },
      sync: createIdleSyncState()
    })
  }

  async retryTaskQuery(taskId) {
    const task = this.getTaskOrThrow(taskId)
    if (!task.accountId) {
      throw new AppError(400, 'TASK_ACCOUNT_REQUIRED', '当前任务还没有已登录账号，无法重试查询')
    }
    if (this.isTaskBusy(task)) {
      throw new AppError(409, 'TASK_BUSY', '任务正在执行查询或同步，请稍后再试')
    }

    const nextTask = this.taskStore.patch(taskId, {
      error: null,
      query: { status: 'QUEUED' },
      sync: createIdleSyncState()
    })
    this.enqueueQuery(taskId)
    return nextTask
  }

  async deleteTask(taskId) {
    const task = this.getTaskOrThrow(taskId)
    if (this.isTaskBusy(task)) {
      throw new AppError(409, 'TASK_BUSY', '任务正在执行查询或同步，暂不支持删除')
    }

    if (this.queuedTaskIds.has(taskId)) {
      this.queuedTaskIds.delete(taskId)
      this.queryQueue = this.queryQueue.filter((item) => item !== taskId)
    }

    if (task.loginSessionId) {
      await this.safeDiscardSession(task.loginSessionId)
    }

    this.taskStore.remove(taskId)
  }

  async syncTaskTencentDocsHandoff(taskId, { target, maxRows } = {}) {
    const task = this.getTaskOrThrow(taskId)
    if (task.query.status !== 'SUCCEEDED' || !task.artifacts?.resultUrl) {
      throw new AppError(409, 'TASK_SYNC_NOT_READY', '当前任务还没有可同步的查询结果，请先等待查询成功')
    }
    if (task.sync?.status === 'RUNNING' || this.runningSyncs.has(taskId)) {
      throw new AppError(409, 'TASK_SYNC_BUSY', '任务正在同步腾讯文档，请稍后再试')
    }

    return this.performTencentDocsSync({
      taskId,
      resultUrl: task.artifacts.resultUrl,
      target,
      maxRows,
      rethrow: true
    })
  }

  async pollOnce() {
    if (this.isPolling) return
    this.isPolling = true
    try {
      const tasks = this.taskStore.list()
      for (const task of tasks) {
        if (!task.loginSessionId) continue
        if (!TRACKED_LOGIN_STATUSES.has(task.login.status)) continue
        if (TERMINAL_QUERY_STATUSES.has(task.query.status)) continue
        await this.syncTaskLogin(task)
      }
      this.drainQueryQueue()
    } finally {
      this.isPolling = false
    }
  }

  async waitForIdle() {
    while (this.queryQueue.length > 0 || this.runningQueries.size > 0 || this.runningSyncs.size > 0) {
      await Promise.allSettled([
        ...this.runningQueries.values(),
        ...this.runningSyncs.values()
      ])
    }
  }

  async syncTaskLogin(task) {
    try {
      const session = this.loginService.getLoginSession(task.loginSessionId)
      const patch = {
        qrImageUrl: session.qrImageUrl || task.qrImageUrl,
        error: session.error ? { code: 'LOGIN_SESSION_FAILED', message: session.error, details: null } : null,
        login: { status: session.status }
      }

      if (session.account?.accountId) {
        patch.accountId = String(session.account.accountId)
        patch.accountNickname = session.account.nickname || task.accountNickname
      }

      const nextTask = this.taskStore.patch(task.taskId, patch)
      if (session.status === 'LOGGED_IN' && nextTask?.query.status === 'IDLE') {
        this.enqueueQuery(task.taskId)
      }
      if (session.status === 'EXPIRED') {
        this.taskStore.patch(task.taskId, {
          error: {
            code: 'TASK_QR_EXPIRED',
            message: '二维码已过期，请刷新后重新发送。',
            details: null
          }
        })
      }
    } catch (error) {
      if (error.code === 'LOGIN_SESSION_NOT_FOUND') {
        this.taskStore.patch(task.taskId, {
          loginSessionId: '',
          qrImageUrl: '',
          login: { status: 'INTERRUPTED' },
          error: {
            code: 'TASK_INTERRUPTED',
            message: '登录会话已丢失，请重新生成二维码。',
            details: null
          }
        })
        return
      }

      this.taskStore.patch(task.taskId, {
        login: { status: 'FAILED' },
        error: serializeError(error)
      })
    }
  }

  enqueueQuery(taskId) {
    if (this.queuedTaskIds.has(taskId) || this.runningQueries.has(taskId)) return
    this.queuedTaskIds.add(taskId)
    this.queryQueue.push(taskId)
    this.taskStore.patch(taskId, {
      query: { status: 'QUEUED' },
      error: null
    })
    this.drainQueryQueue()
  }

  drainQueryQueue() {
    while (this.runningQueries.size < this.maxConcurrentQueries && this.queryQueue.length > 0) {
      const taskId = this.queryQueue.shift()
      this.queuedTaskIds.delete(taskId)
      const task = this.taskStore.get(taskId)
      if (!task || task.query.status !== 'QUEUED') continue

      const promise = this.executeTaskQuery(taskId)
        .catch(() => {})
        .finally(() => {
          this.runningQueries.delete(taskId)
          this.drainQueryQueue()
        })

      this.runningQueries.set(taskId, promise)
    }
  }

  async executeTaskQuery(taskId) {
    const task = this.getTaskOrThrow(taskId)
    if (!task.accountId) {
      this.taskStore.patch(taskId, {
        query: { status: 'FAILED' },
        error: {
          code: 'TASK_ACCOUNT_REQUIRED',
          message: '当前任务还没有已登录账号，无法执行查询',
          details: null
        }
      })
      return
    }

    this.taskStore.patch(taskId, {
      query: { status: 'RUNNING' },
      error: null
    })

    try {
      const result = await this.queryService.queryByContentId({
        accountId: task.accountId,
        contentId: task.contentId
      })
      this.taskStore.patch(taskId, {
        accountId: result.accountId,
        accountNickname: result.nickname,
        fetchedAt: result.fetchedAt,
        error: null,
        query: { status: 'SUCCEEDED' },
        metrics: result.metrics,
        screenshots: result.screenshots,
        artifacts: result.artifacts,
        sync: createIdleSyncState()
      })

      await this.syncTaskToTencentDocs(taskId, result)
    } catch (error) {
      const patch = {
        error: serializeError(error)
      }

      if (error.code === 'NO_DATA') {
        patch.query = { status: 'NO_DATA' }
      } else {
        patch.query = { status: 'FAILED' }
      }

      if (error.details?.screenshots?.rawUrl || error.details?.screenshots?.summaryUrl) {
        patch.screenshots = {
          rawUrl: error.details?.screenshots?.rawUrl || '',
          summaryUrl: error.details?.screenshots?.summaryUrl || ''
        }
      }

      if (error.details?.artifacts?.resultUrl || error.details?.artifacts?.networkLogUrl) {
        patch.artifacts = {
          resultUrl: error.details?.artifacts?.resultUrl || '',
          networkLogUrl: error.details?.artifacts?.networkLogUrl || ''
        }
      }

      this.taskStore.patch(taskId, patch)
    }
  }

  async syncTaskToTencentDocs(taskId, result) {
    if (!result?.artifacts?.resultUrl) return null
    if (!this.tencentDocsSyncService?.syncHandoffRow) return null
    if (this.tencentDocsSyncService.getConfig && !this.tencentDocsSyncService.getConfig().enabled) return null

    return this.performTencentDocsSync({
      taskId,
      resultUrl: result.artifacts.resultUrl,
      rethrow: false
    })
  }

  async performTencentDocsSync({ taskId, resultUrl, target, maxRows, rethrow }) {
    if (!this.tencentDocsSyncService?.syncHandoffRow) {
      if (rethrow) {
        throw new AppError(400, 'TENCENT_DOCS_NOT_CONFIGURED', '腾讯文档同步服务不可用')
      }
      return null
    }

    if (!resultUrl) {
      if (rethrow) {
        throw new AppError(400, 'TASK_RESULT_REQUIRED', '当前任务缺少结果文件，无法同步腾讯文档')
      }
      return null
    }

    const syncConfig = this.tencentDocsSyncService.getConfig ? this.tencentDocsSyncService.getConfig() : null
    if (syncConfig && !syncConfig.enabled) {
      if (rethrow) {
        throw new AppError(400, 'TENCENT_DOCS_NOT_CONFIGURED', '腾讯文档同步功能未启用')
      }
      return null
    }

    if (this.runningSyncs.has(taskId)) {
      if (rethrow) {
        throw new AppError(409, 'TASK_SYNC_BUSY', '任务正在同步腾讯文档，请稍后再试')
      }
      return this.runningSyncs.get(taskId) || null
    }

    this.taskStore.patch(taskId, {
      sync: createRunningSyncState()
    })

    const promise = this.tencentDocsSyncService.syncHandoffRow({
      source: { resultUrl },
      target,
      maxRows
    })
      .then((syncResult) => {
        this.taskStore.patch(taskId, {
          sync: createSucceededSyncState(syncResult)
        })
        return syncResult
      })
      .catch((error) => {
        this.taskStore.patch(taskId, {
          sync: createFailedSyncState(error)
        })
        if (rethrow) throw error
        return null
      })
      .finally(() => {
        this.runningSyncs.delete(taskId)
      })

    this.runningSyncs.set(taskId, promise)
    return promise
  }

  isTaskBusy(task) {
    return BUSY_QUERY_STATUSES.has(task?.query?.status) || task?.sync?.status === 'RUNNING'
  }

  ensureActiveLoginCapacity(incomingCount, excludeTaskId = '') {
    const activeCount = this.taskStore.list().filter((task) => {
      if (excludeTaskId && task.taskId === excludeTaskId) return false
      return ACTIVE_LOGIN_STATUSES.has(task.login.status)
    }).length

    if (activeCount + incomingCount > this.maxActiveLoginSessions) {
      throw new AppError(409, 'TASK_LOGIN_LIMIT_REACHED', `当前最多只支持 ${this.maxActiveLoginSessions} 个待扫码任务，请稍后再试`)
    }
  }

  getTaskOrThrow(taskId) {
    const task = this.taskStore.get(taskId)
    if (!task) {
      throw new AppError(404, 'TASK_NOT_FOUND', '任务不存在')
    }
    return task
  }

  async safeDiscardSession(loginSessionId) {
    if (!loginSessionId) return
    await this.loginService.discardLoginSession(loginSessionId).catch(() => {})
  }
}

function createBaseTask(entry, loginSession) {
  const timestamp = new Date().toISOString()
  return {
    taskId: crypto.randomUUID(),
    remark: entry.remark,
    contentId: entry.contentId,
    loginSessionId: loginSession.loginSessionId,
    qrImageUrl: loginSession.qrImageUrl || '',
    createdAt: timestamp,
    updatedAt: timestamp,
    fetchedAt: null,
    accountId: '',
    accountNickname: '',
    error: null,
    login: {
      status: loginSession.status || 'WAITING_QR'
    },
    query: {
      status: 'IDLE'
    },
    metrics: null,
    screenshots: {
      rawUrl: '',
      summaryUrl: ''
    },
    artifacts: {
      resultUrl: '',
      networkLogUrl: ''
    },
    sync: createIdleSyncState()
  }
}

function createIdleSyncState(overrides = {}) {
  return {
    status: 'IDLE',
    operationId: '',
    target: null,
    match: null,
    writeSummary: null,
    artifacts: null,
    error: null,
    ...overrides
  }
}

function createRunningSyncState() {
  return createIdleSyncState({ status: 'RUNNING' })
}

function createSucceededSyncState(syncResult = {}) {
  return createIdleSyncState({
    status: 'SUCCEEDED',
    operationId: syncResult.operationId || '',
    target: syncResult.target || null,
    match: syncResult.match || null,
    writeSummary: syncResult.writeSummary || null,
    artifacts: syncResult.artifacts || null,
    error: null
  })
}

function createFailedSyncState(error) {
  const details = error?.details || {}
  return createIdleSyncState({
    status: 'FAILED',
    operationId: details.operationId || '',
    target: details.target || null,
    match: details.match || null,
    writeSummary: details.writeSummary || null,
    artifacts: details.artifacts || null,
    error: serializeError(error)
  })
}

function validateBatchEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new AppError(400, 'TASK_BATCH_INVALID', '请至少提交一条任务', {
      items: [{ index: 0, field: 'tasks', message: '任务列表不能为空' }]
    })
  }

  const errors = []
  const normalized = entries.map((entry, index) => {
    const remark = String(entry?.remark || '').trim()
    const contentId = String(entry?.contentId || '').trim()

    if (!remark) {
      errors.push({ index, field: 'remark', message: '备注不能为空' })
    }
    if (!contentId) {
      errors.push({ index, field: 'contentId', message: '内容 ID 不能为空' })
    } else if (!/^\d+$/.test(contentId)) {
      errors.push({ index, field: 'contentId', message: '内容 ID 只能包含数字' })
    }

    return { remark, contentId }
  })

  if (errors.length > 0) {
    throw new AppError(400, 'TASK_BATCH_INVALID', '任务格式不正确，请逐行检查后重试', {
      items: errors
    })
  }

  return normalized
}

function serializeError(error) {
  if (!error) {
    return {
      code: 'TASK_ERROR',
      message: '未知任务错误',
      details: null
    }
  }

  return {
    code: error.code || 'TASK_ERROR',
    message: error.message || '任务执行失败',
    details: error.details || null
  }
}

module.exports = { GuangheTaskService }
