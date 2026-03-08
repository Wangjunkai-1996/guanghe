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
    refreshTaskLogin: vi.fn(async () => ({ ok: true })),
    retryTaskQuery: vi.fn(async () => ({ ok: true })),
    deleteTask: vi.fn(async () => undefined)
  }

  test('rejects invalid password', async () => {
    const app = createApp({ config, loginService, taskService, queryService: { queryByContentId: async () => ({ ok: true }) } })
    const response = await request(app).post('/api/auth/login').send({ password: 'wrong' })

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTH_INVALID')
  })

  test('allows authenticated account listing', async () => {
    const app = createApp({ config, loginService, taskService, queryService: { queryByContentId: async () => ({ ok: true }) } })
    const agent = request.agent(app)

    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)
    const response = await agent.get('/api/accounts')

    expect(response.status).toBe(200)
    expect(response.body.accounts).toHaveLength(1)
    expect(response.body.accounts[0].nickname).toBe('测试账号')
  })


  test('allows access without auth when tool auth disabled', async () => {
    const app = createApp({
      config: { ...config, toolAuthEnabled: false },
      loginService,
      taskService,
      queryService: { queryByContentId: async () => ({ ok: true }) }
    })

    const meResponse = await request(app).get('/api/auth/me')
    expect(meResponse.status).toBe(200)
    expect(meResponse.body.authenticated).toBe(true)

    const response = await request(app).get('/api/accounts')
    expect(response.status).toBe(200)
    expect(response.body.accounts).toHaveLength(1)
  })

  test('blocks protected routes without session', async () => {
    const app = createApp({ config, loginService, taskService, queryService: { queryByContentId: async () => ({ ok: true }) } })
    const response = await request(app).get('/api/accounts')

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTH_REQUIRED')
  })

  test('returns login session qr image field when available', async () => {
    const app = createApp({ config, loginService, taskService, queryService: { queryByContentId: async () => ({ ok: true }) } })
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)
    const response = await agent.get('/api/accounts/login-sessions/session-1')

    expect(response.status).toBe(200)
    expect(response.body.qrImageUrl).toBe('/api/artifacts/login-sessions/session-1/qr.png')
  })

  test('lists tasks for authenticated user', async () => {
    const app = createApp({ config, loginService, taskService, queryService: { queryByContentId: async () => ({ ok: true }) } })
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)

    const response = await agent.get('/api/tasks')

    expect(response.status).toBe(200)
    expect(response.body.tasks).toHaveLength(1)
    expect(response.body.tasks[0].remark).toBe('达人A')
  })

  test('creates task batch via api', async () => {
    const app = createApp({ config, loginService, taskService, queryService: { queryByContentId: async () => ({ ok: true }) } })
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)

    const response = await agent.post('/api/tasks/batch').send({
      tasks: [{ remark: '达人A', contentId: '554608495125' }]
    })

    expect(response.status).toBe(201)
    expect(taskService.createTasksBatch).toHaveBeenCalledWith([{ remark: '达人A', contentId: '554608495125' }])
    expect(response.body.tasks[0].loginSessionId).toBe('session-1')
  })

  test('returns structured query errors as json', async () => {
    const app = createApp({
      config,
      loginService,
      taskService,
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
    const app = createApp({ config, loginService, taskService, queryService: { queryByContentId: async () => ({ ok: true }) } })
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)
    const response = await agent.post('/api/queries').send({ accountId: '1001', contentId: 'abc123' })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('QUERY_INPUT_INVALID')
  })
})
