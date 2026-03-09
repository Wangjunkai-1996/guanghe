import { describe, expect, test, vi } from 'vitest'
import request from 'supertest'

const { createApp } = require('../server/app')
const { AppError } = require('../server/lib/errors')

describe('app auth flow', () => {
  const config = {
    sessionSecret: 'test-secret',
    toolAuthEnabled: true,
    toolPassword: 'pass123',
    secureCookie: false,
    artifactsRootDir: process.cwd(),
    distDir: '/tmp/not-used'
  }

  const loginService = {
    listAccounts: () => [{ accountId: '1001', nickname: '测试账号', status: 'READY', lastLoginAt: '2026-03-08T00:00:00.000Z' }],
    getLoginSession: () => ({
      loginSessionId: 'session-1',
      status: 'WAITING_QR',
      qrCodeUrl: 'https://example.com/qr',
      qrImageUrl: '/api/artifacts/login-sessions/session-1/qr.png',
      account: null,
      error: null,
      updatedAt: '2026-03-08T00:00:00.000Z'
    })
  }

  const taskService = {
    listTasks: () => [{
      taskId: 'task-1',
      remark: '达人A',
      contentId: '554608495125',
      loginSessionId: 'session-1',
      qrImageUrl: '/api/artifacts/login-sessions/session-1/qr.png',
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
      accountId: '',
      accountNickname: '',
      error: null,
      login: { status: 'WAITING_QR' },
      query: { status: 'IDLE' },
      metrics: null,
      screenshots: { rawUrl: '', summaryUrl: '' },
      artifacts: { resultUrl: '', networkLogUrl: '' }
    }],
    createTasksBatch: vi.fn(async (tasks) => ({ tasks: tasks.map((task, index) => ({
      taskId: `task-${index + 1}`,
      remark: task.remark,
      contentId: task.contentId,
      loginSessionId: `session-${index + 1}`,
      qrImageUrl: `/api/artifacts/login-sessions/session-${index + 1}/qr.png`,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
      accountId: '',
      accountNickname: '',
      error: null,
      login: { status: 'WAITING_QR' },
      query: { status: 'IDLE' },
      metrics: null,
      screenshots: { rawUrl: '', summaryUrl: '' },
      artifacts: { resultUrl: '', networkLogUrl: '' }
    })) })),
    createSheetDemandTasksBatch: vi.fn(async (count) => ({ tasks: Array.from({ length: count }, (_, index) => ({
      taskId: `sheet-task-${index + 1}`,
      taskMode: 'SHEET_DEMAND',
      remark: '',
      contentId: '',
      loginSessionId: `sheet-session-${index + 1}`,
      qrImageUrl: `/api/artifacts/login-sessions/sheet-session-${index + 1}/qr.png`,
      createdAt: '2026-03-08T00:00:00.000Z',
      updatedAt: '2026-03-08T00:00:00.000Z',
      accountId: '',
      accountNickname: '',
      error: null,
      login: { status: 'WAITING_QR' },
      query: { status: 'IDLE' },
      metrics: null,
      screenshots: { rawUrl: '', summaryUrl: '' },
      artifacts: { resultUrl: '', networkLogUrl: '' }
    })) })),
    refreshTaskLogin: vi.fn(async () => ({ ok: true })),
    retryTaskQuery: vi.fn(async () => ({ ok: true })),
    deleteTask: vi.fn(async () => undefined),
    syncTaskTencentDocsHandoff: vi.fn(async (taskId) => ({ ok: true, taskId }))
  }

  const tencentDocsSyncService = {
    getConfig: vi.fn(() => ({
      enabled: true,
      mode: 'browser',
      defaultTargetConfigured: true,
      defaultSheetName: '1',
      defaultWriteMode: 'upsert',
      target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
      login: { status: 'LOGGED_IN', updatedAt: '2026-03-08T00:00:00.000Z', error: null }
    })),
    setConfig: vi.fn((payload) => ({
      enabled: true,
      mode: 'browser',
      defaultTargetConfigured: true,
      defaultSheetName: payload.sheetName || '1',
      defaultWriteMode: 'upsert',
      target: { docUrl: payload.docUrl || 'https://docs.qq.com/sheet/mock', sheetName: payload.sheetName || '1' },
      login: { status: 'LOGGED_IN', updatedAt: '2026-03-08T00:00:00.000Z', error: null }
    })),
    createLoginSession: vi.fn(async ({ target } = {}) => ({
      loginSessionId: 'tdocs-session-1',
      status: 'WAITING_QR',
      qrImageUrl: '/api/artifacts/tencent-docs/login-sessions/tdocs-session-1/qr.png',
      target: target || { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
      updatedAt: '2026-03-08T00:00:00.000Z',
      error: null
    })),
    getLoginSession: vi.fn(() => ({
      loginSessionId: 'tdocs-session-1',
      status: 'WAITING_QR',
      qrImageUrl: '/api/artifacts/tencent-docs/login-sessions/tdocs-session-1/qr.png',
      updatedAt: '2026-03-08T00:00:00.000Z',
      error: null
    }))
  }

  function createTestApp(overrides = {}) {
    return createApp({
      config: overrides.config || config,
      loginService,
      taskService,
      queryService: overrides.queryService || { queryByContentId: async () => ({ ok: true }) },
      tencentDocsSyncService: overrides.tencentDocsSyncService || tencentDocsSyncService
    })
  }

  test('rejects invalid password', async () => {
    const app = createTestApp()
    const response = await request(app).post('/api/auth/login').send({ password: 'wrong' })

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTH_INVALID')
  })

  test('allows authenticated account listing', async () => {
    const app = createTestApp()
    const agent = request.agent(app)

    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)
    const response = await agent.get('/api/accounts')

    expect(response.status).toBe(200)
    expect(response.body.accounts).toHaveLength(1)
    expect(response.body.accounts[0].nickname).toBe('测试账号')
  })

  test('allows access without auth when tool auth disabled', async () => {
    const app = createTestApp({
      config: { ...config, toolAuthEnabled: false }
    })

    const meResponse = await request(app).get('/api/auth/me')
    expect(meResponse.status).toBe(200)
    expect(meResponse.body.authenticated).toBe(true)

    const response = await request(app).get('/api/accounts')
    expect(response.status).toBe(200)
    expect(response.body.accounts).toHaveLength(1)
  })

  test('blocks protected routes without session', async () => {
    const app = createTestApp()
    const response = await request(app).get('/api/accounts')

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTH_REQUIRED')
  })

  test('returns login session qr image field when available', async () => {
    const app = createTestApp()
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)
    const response = await agent.get('/api/accounts/login-sessions/session-1')

    expect(response.status).toBe(200)
    expect(response.body.qrImageUrl).toBe('/api/artifacts/login-sessions/session-1/qr.png')
  })

  test('lists tasks for authenticated user', async () => {
    const app = createTestApp()
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)

    const response = await agent.get('/api/tasks')

    expect(response.status).toBe(200)
    expect(response.body.tasks).toHaveLength(1)
    expect(response.body.tasks[0].remark).toBe('达人A')
  })

  test('creates task batch via api', async () => {
    const app = createTestApp()
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)

    const response = await agent.post('/api/tasks/batch').send({
      tasks: [{ remark: '达人A', contentId: '554608495125' }]
    })

    expect(response.status).toBe(201)
    expect(taskService.createTasksBatch).toHaveBeenCalledWith([{ remark: '达人A', contentId: '554608495125' }])
    expect(response.body.tasks[0].loginSessionId).toBe('session-1')
  })

  test('creates sheet-demand task batch via api', async () => {
    const app = createTestApp()
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)

    const response = await agent.post('/api/tasks/sheet-demand/batch').send({ count: 2 })

    expect(response.status).toBe(201)
    expect(taskService.createSheetDemandTasksBatch).toHaveBeenCalledWith(2)
    expect(response.body.tasks).toHaveLength(2)
    expect(response.body.tasks[0].taskMode).toBe('SHEET_DEMAND')
  })

  test('reads and updates tencent docs config via api', async () => {
    const app = createTestApp()
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)

    const getResponse = await agent.get('/api/tencent-docs/config')
    expect(getResponse.status).toBe(200)
    expect(getResponse.body.target.docUrl).toBe('https://docs.qq.com/sheet/mock')
    expect(getResponse.body.login.status).toBe('LOGGED_IN')

    const putResponse = await agent.put('/api/tencent-docs/config').send({
      docUrl: 'https://docs.qq.com/sheet/next',
      sheetName: '2'
    })
    expect(putResponse.status).toBe(200)
    expect(tencentDocsSyncService.setConfig).toHaveBeenCalledWith({
      docUrl: 'https://docs.qq.com/sheet/next',
      sheetName: '2'
    })
    expect(putResponse.body.target.sheetName).toBe('2')
  })

  test('creates and reads tencent docs login sessions via api', async () => {
    const app = createTestApp()
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)

    const createResponse = await agent.post('/api/tencent-docs/login-sessions').send({
      target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' }
    })
    expect(createResponse.status).toBe(201)
    expect(tencentDocsSyncService.createLoginSession).toHaveBeenCalledWith({
      target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' }
    })
    expect(createResponse.body.qrImageUrl).toBe('/api/artifacts/tencent-docs/login-sessions/tdocs-session-1/qr.png')

    const getResponse = await agent.get('/api/tencent-docs/login-sessions/tdocs-session-1')
    expect(getResponse.status).toBe(200)
    expect(tencentDocsSyncService.getLoginSession).toHaveBeenCalledWith('tdocs-session-1')
  })

  test('returns structured query errors as json', async () => {
    const app = createTestApp({
      queryService: {
        queryByContentId: async () => {
          throw new AppError(404, 'NO_DATA', '当前 ID 在近 30 日内无可查数据', {
            screenshots: { rawUrl: '/api/artifacts/raw.png' }
          })
        }
      }
    })
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)
    const response = await agent.post('/api/queries').send({ accountId: '1001', contentId: '554608495125' })

    expect(response.status).toBe(404)
    expect(response.body.error.code).toBe('NO_DATA')
    expect(response.body.error.message).toBe('当前 ID 在近 30 日内无可查数据')
    expect(response.body.error.details.screenshots.rawUrl).toBe('/api/artifacts/raw.png')
  })

  test('rejects non-numeric content id', async () => {
    const app = createTestApp()
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)
    const response = await agent.post('/api/queries').send({ accountId: '1001', contentId: 'abc123' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('QUERY_INPUT_INVALID')
  })
})
