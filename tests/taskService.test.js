import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const { TaskStore } = require('../server/lib/taskStore')
const { AppError } = require('../server/lib/errors')
const { GuangheTaskService } = require('../server/services/taskService')

describe('taskService', () => {
  test('createTasksBatch creates unique tasks and login sessions', async () => {
    const harness = createHarness()

    const payload = await harness.service.createTasksBatch([
      { remark: '达人A', contentId: '554608495125' },
      { remark: '达人B', contentId: '537029503554' },
      { remark: '达人C', contentId: '538047460899' }
    ])

    expect(payload.tasks).toHaveLength(3)
    expect(new Set(payload.tasks.map((task) => task.taskId)).size).toBe(3)
    expect(new Set(payload.tasks.map((task) => task.loginSessionId)).size).toBe(3)
    expect(harness.taskStore.list()).toHaveLength(3)
  })

  test('rejects invalid batch input with row-level details', async () => {
    const harness = createHarness()

    await expect(harness.service.createTasksBatch([
      { remark: '', contentId: '554608495125' },
      { remark: '达人B', contentId: 'abc123' }
    ])).rejects.toMatchObject({
      code: 'TASK_BATCH_INVALID',
      details: {
        items: [
          { index: 0, field: 'remark', message: '备注不能为空' },
          { index: 1, field: 'contentId', message: '内容 ID 只能包含数字' }
        ]
      }
    })
  })

  test('auto-runs query after login succeeds', async () => {
    const harness = createHarness()
    const { tasks } = await harness.service.createTasksBatch([{ remark: '达人A', contentId: '554608495125' }])
    const task = tasks[0]

    harness.loginService.setSession(task.loginSessionId, {
      status: 'LOGGED_IN',
      account: {
        accountId: '1001',
        nickname: '自然卷儿'
      }
    })

    await harness.service.pollOnce()
    await harness.service.waitForIdle()

    const saved = harness.taskStore.get(task.taskId)
    expect(saved.login.status).toBe('LOGGED_IN')
    expect(saved.query.status).toBe('SUCCEEDED')
    expect(saved.accountId).toBe('1001')
    expect(saved.accountNickname).toBe('自然卷儿')
    expect(saved.metrics['内容查看次数'].value).toBe('83611')
    expect(saved.screenshots.summaryUrl).toBe('/api/artifacts/summary.png')
    expect(harness.queryService.calls).toEqual([{ accountId: '1001', contentId: '554608495125' }])
  })

  test('auto-syncs tencent docs after query succeeds when sync service is configured', async () => {
    const syncCalls = []
    const harness = createHarness({
      tencentDocsSyncService: {
        async syncHandoffRow(payload) {
          syncCalls.push(payload)
          return {
            operationId: 'handoff-1',
            target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
            match: { sheetRow: 8, contentId: '554608495125', matchedBy: ['内容id'] },
            writeSummary: { action: 'UPDATED', columnsUpdated: ['查看次数', '查看人数'] }
          }
        }
      }
    })
    const { tasks } = await harness.service.createTasksBatch([{ remark: '达人A', contentId: '554608495125' }])
    const task = tasks[0]

    harness.loginService.setSession(task.loginSessionId, {
      status: 'LOGGED_IN',
      account: {
        accountId: '1001',
        nickname: '自然卷儿'
      }
    })

    await harness.service.pollOnce()
    await harness.service.waitForIdle()

    const saved = harness.taskStore.get(task.taskId)
    expect(syncCalls).toEqual([{ source: { resultUrl: '/api/artifacts/results.json' } }])
    expect(saved.sync.status).toBe('SUCCEEDED')
    expect(saved.sync.operationId).toBe('handoff-1')
    expect(saved.sync.match.sheetRow).toBe(8)
    expect(saved.sync.writeSummary.action).toBe('UPDATED')
  })


  test('keeps query succeeded when tencent docs sync fails', async () => {
    const harness = createHarness({
      tencentDocsSyncService: {
        getConfig() {
          return { enabled: true }
        },
        async syncHandoffRow() {
          throw new AppError(401, 'TENCENT_DOCS_LOGIN_REQUIRED', '腾讯文档当前未登录，请先完成登录', {
            operationId: 'handoff-failed',
            target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
            artifacts: { errorUrl: '/api/artifacts/tencent-docs/handoff/error.png' }
          })
        }
      }
    })
    const { tasks } = await harness.service.createTasksBatch([{ remark: '达人A', contentId: '554608495125' }])
    const task = tasks[0]

    harness.loginService.setSession(task.loginSessionId, {
      status: 'LOGGED_IN',
      account: {
        accountId: '1001',
        nickname: '自然卷儿'
      }
    })

    await harness.service.pollOnce()
    await harness.service.waitForIdle()

    const saved = harness.taskStore.get(task.taskId)
    expect(saved.query.status).toBe('SUCCEEDED')
    expect(saved.error).toBeNull()
    expect(saved.sync.status).toBe('FAILED')
    expect(saved.sync.error.code).toBe('TENCENT_DOCS_LOGIN_REQUIRED')
    expect(saved.sync.artifacts.errorUrl).toBe('/api/artifacts/tencent-docs/handoff/error.png')
  })

  test('allows manual tencent docs handoff sync for succeeded task', async () => {
    let syncCallCount = 0
    const harness = createHarness({
      tencentDocsSyncService: {
        getConfig() {
          return { enabled: true }
        },
        async syncHandoffRow(payload) {
          syncCallCount += 1
          return {
            operationId: `handoff-${syncCallCount}`,
            target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
            match: { sheetRow: 9, contentId: '554608495125', matchedBy: ['内容id'] },
            writeSummary: { action: 'UPDATED', columnsUpdated: ['查看次数', '查看人数'] },
            artifacts: { writeLogUrl: '/api/artifacts/tencent-docs/handoff/write-log.json' },
            source: payload.source
          }
        }
      }
    })
    const { tasks } = await harness.service.createTasksBatch([{ remark: '达人A', contentId: '554608495125' }])
    const task = tasks[0]

    harness.loginService.setSession(task.loginSessionId, {
      status: 'LOGGED_IN',
      account: {
        accountId: '1001',
        nickname: '自然卷儿'
      }
    })

    await harness.service.pollOnce()
    await harness.service.waitForIdle()
    const syncResult = await harness.service.syncTaskTencentDocsHandoff(task.taskId)

    const saved = harness.taskStore.get(task.taskId)
    expect(syncCallCount).toBe(2)
    expect(syncResult.operationId).toBe('handoff-2')
    expect(saved.query.status).toBe('SUCCEEDED')
    expect(saved.sync.status).toBe('SUCCEEDED')
    expect(saved.sync.operationId).toBe('handoff-2')
    expect(saved.sync.writeSummary.action).toBe('UPDATED')
    expect(saved.sync.artifacts.writeLogUrl).toBe('/api/artifacts/tencent-docs/handoff/write-log.json')
  })
  test('stores no-data result and artifact links', async () => {
    const harness = createHarness({
      queryImpl: async ({ accountId, contentId }) => {
        if (accountId === '1001' && contentId === '999999999999') {
          throw new AppError(404, 'NO_DATA', '当前 ID 在近 30 日内无可查数据', {
            screenshots: { rawUrl: '/api/artifacts/raw.png' },
            artifacts: { networkLogUrl: '/api/artifacts/network-log.json' }
          })
        }
        return createQueryResult({ accountId, contentId })
      }
    })
    const { tasks } = await harness.service.createTasksBatch([{ remark: '达人A', contentId: '999999999999' }])
    const task = tasks[0]

    harness.loginService.setSession(task.loginSessionId, {
      status: 'LOGGED_IN',
      account: {
        accountId: '1001',
        nickname: '自然卷儿'
      }
    })

    await harness.service.pollOnce()
    await harness.service.waitForIdle()

    const saved = harness.taskStore.get(task.taskId)
    expect(saved.query.status).toBe('NO_DATA')
    expect(saved.error.code).toBe('NO_DATA')
    expect(saved.screenshots.rawUrl).toBe('/api/artifacts/raw.png')
    expect(saved.artifacts.networkLogUrl).toBe('/api/artifacts/network-log.json')
  })

  test('marks pending tasks interrupted on restart', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guanghe-task-store-'))
    const tasksFile = path.join(tmpDir, 'tasks.json')
    const taskStore = new TaskStore({ tasksFile })
    taskStore.upsert({
      taskId: 'task-1',
      remark: '达人A',
      contentId: '554608495125',
      loginSessionId: 'session-1',
      qrImageUrl: '/api/artifacts/login-sessions/session-1/qr.png',
      createdAt: '2026-03-09T00:00:00.000Z',
      updatedAt: '2026-03-09T00:00:00.000Z',
      login: { status: 'WAITING_QR' },
      query: { status: 'IDLE' },
      error: null,
      metrics: null,
      screenshots: { rawUrl: '', summaryUrl: '' },
      artifacts: { resultUrl: '', networkLogUrl: '' }
    })

    const restartedStore = new TaskStore({ tasksFile })
    new GuangheTaskService({
      taskStore: restartedStore,
      loginService: createFakeLoginService(),
      queryService: createFakeQueryService()
    })

    const interrupted = restartedStore.get('task-1')
    expect(interrupted.login.status).toBe('INTERRUPTED')
    expect(interrupted.error.code).toBe('TASK_INTERRUPTED')
    expect(interrupted.qrImageUrl).toBe('')
  })
})

function createHarness({ queryImpl, tencentDocsSyncService = null } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guanghe-task-service-'))
  const tasksFile = path.join(tmpDir, 'tasks.json')
  const taskStore = new TaskStore({ tasksFile })
  const loginService = createFakeLoginService()
  const queryService = createFakeQueryService(queryImpl)
  const service = new GuangheTaskService({
    taskStore,
    loginService,
    queryService,
    tencentDocsSyncService,
    maxActiveLoginSessions: 5,
    maxConcurrentQueries: 2,
    pollIntervalMs: 5
  })

  return {
    service,
    taskStore,
    loginService,
    queryService
  }
}

function createFakeLoginService() {
  const sessions = new Map()
  let counter = 0

  return {
    async createLoginSession() {
      counter += 1
      const loginSessionId = `session-${counter}`
      const session = {
        loginSessionId,
        status: 'WAITING_QR',
        qrCodeUrl: `https://example.com/${loginSessionId}`,
        qrImageUrl: `/api/artifacts/login-sessions/${loginSessionId}/qr.png`,
        account: null,
        error: null,
        updatedAt: new Date().toISOString()
      }
      sessions.set(loginSessionId, session)
      return { ...session }
    },
    getLoginSession(loginSessionId) {
      const session = sessions.get(loginSessionId)
      if (!session) {
        throw new AppError(404, 'LOGIN_SESSION_NOT_FOUND', '登录会话不存在')
      }
      return { ...session }
    },
    async discardLoginSession(loginSessionId) {
      sessions.delete(loginSessionId)
    },
    setSession(loginSessionId, patch) {
      const current = sessions.get(loginSessionId)
      if (!current) throw new Error(`Missing login session ${loginSessionId}`)
      sessions.set(loginSessionId, {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString()
      })
    }
  }
}

function createFakeQueryService(queryImpl) {
  const calls = []
  return {
    calls,
    async queryByContentId({ accountId, contentId }) {
      calls.push({ accountId, contentId })
      if (queryImpl) {
        return queryImpl({ accountId, contentId })
      }
      return createQueryResult({ accountId, contentId })
    }
  }
}

function createQueryResult({ accountId, contentId }) {
  return {
    accountId,
    nickname: '自然卷儿',
    contentId,
    fetchedAt: '2026-03-09T00:00:00.000Z',
    metrics: {
      内容查看次数: { value: '83611', field: 'consumePv' },
      内容查看人数: { value: '18033', field: 'consumeUv' },
      种草成交金额: { value: '155.13', field: 'payAmtZcLast' },
      种草成交人数: { value: '1', field: 'payBuyerCntZc' },
      商品点击次数: { value: '3', field: 'ipvPv' }
    },
    screenshots: {
      rawUrl: '/api/artifacts/raw.png',
      summaryUrl: '/api/artifacts/summary.png'
    },
    artifacts: {
      resultUrl: '/api/artifacts/results.json',
      networkLogUrl: '/api/artifacts/network-log.json'
    }
  }
}
