import { describe, expect, test, vi } from 'vitest'
import request from 'supertest'

const { createApp } = require('../server/app')

describe('v7 app auth and route wiring', () => {
  const config = {
    sessionSecret: 'test-secret',
    toolAuthEnabled: true,
    toolPassword: 'pass123',
    secureCookie: false,
    artifactsRootDir: process.cwd(),
    distDir: '/tmp/not-used'
  }

  function createTestApp(overrides = {}) {
    const loginService = {
      createLoginSession: vi.fn(async () => ({
        loginSessionId: 'session-1',
        status: 'WAITING_QR',
        qrImageUrl: '/api/artifacts/login-sessions/session-1/qr.png',
        account: null,
        error: null,
        updatedAt: '2026-03-16T10:00:00.000Z'
      })),
      getLoginSession: vi.fn(() => ({
        loginSessionId: 'session-1',
        status: 'WAITING_QR',
        qrImageUrl: '/api/artifacts/login-sessions/session-1/qr.png',
        account: null,
        error: null,
        updatedAt: '2026-03-16T10:00:00.000Z'
      }))
    }

    const v7Service = {
      eventBus: {
        subscribeBatch: vi.fn(() => () => {})
      },
      listBatches: vi.fn(() => ({
        recentBatchId: 'batch-1',
        batches: [
          {
            id: 'batch-1',
            name: '鞋包 3 月二周',
            status: 'READY',
            target: { docUrl: 'https://docs.qq.com/mock', sheetName: '数据汇总' },
            overview: {
              readyAccounts: 2,
              executableRows: 8,
              blockersCount: 0,
              primaryCta: { label: '启动批量执行' },
              phaseRail: []
            },
            coverageSummary: { executable: 8 },
            blockers: []
          }
        ]
      })),
      createBatch: vi.fn((input) => ({
        id: 'batch-1',
        name: input.name || '新批次',
        status: 'DRAFT',
        target: { docUrl: input.docUrl || '', sheetName: input.sheetName || '' },
        blockers: [],
        overview: {
          readyAccounts: 0,
          executableRows: 0,
          blockersCount: 0,
          primaryCta: { label: '锁定并检查交接表' },
          phaseRail: []
        },
        coverageSummary: { executable: 0 }
      })),
      getBatch: vi.fn(() => ({
        id: 'batch-1',
        name: '鞋包 3 月二周',
        status: 'READY',
        target: { docUrl: 'https://docs.qq.com/mock', sheetName: '数据汇总' },
        blockers: [],
        latestSnapshotId: 'snapshot-1',
        latestRuleSetId: 'rules-1',
        activeRunId: 'run-1',
        latestSnapshot: {
          id: 'snapshot-1',
          version: 2,
          checkedAt: '2026-03-16T10:00:00.000Z',
          summary: { totalRows: 10 }
        },
        overview: {
          readyAccounts: 2,
          executableRows: 8,
          blockersCount: 0,
          primaryCta: { label: '启动批量执行' },
          phaseRail: []
        },
        coverageSummary: { executable: 8 },
        currentRules: { id: 'rules-1' },
        activeRun: { id: 'run-1', status: 'RUNNING' },
        history: []
      })),
      listAccounts: vi.fn(() => ({
        accounts: [
          {
            id: '1001',
            nickname: '自然卷儿',
            status: 'READY',
            health: 'READY',
            lastLoginAt: '2026-03-16T09:00:00.000Z'
          }
        ],
        summary: {
          total: 1,
          ready: 1,
          batchExecutableRows: 8
        },
        currentBatch: null
      })),
      getAccountsHealth: vi.fn(() => ({
        summary: {
          total: 1,
          ready: 1,
          keepAliveSuggested: 0,
          reloginSuggested: 0,
          batchExecutableRows: 8
        },
        recommendedKeepAlive: [],
        recommendedRelogin: []
      }))
    }

    return createApp({
      config: overrides.config || config,
      loginService,
      queryService: overrides.queryService || { queryByContentId: vi.fn() },
      taskService: overrides.taskService || null,
      tencentDocsSyncService: overrides.tencentDocsSyncService || null,
      v7Service: overrides.v7Service || v7Service
    })
  }

  test('rejects invalid password', async () => {
    const app = createTestApp()
    const response = await request(app).post('/api/auth/login').send({ password: 'wrong' })

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTH_INVALID')
  })

  test('blocks protected v7 routes without session', async () => {
    const app = createTestApp()
    const response = await request(app).get('/api/batches')

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTH_REQUIRED')
  })

  test('lists batches and accounts for authenticated user', async () => {
    const app = createTestApp()
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)

    const batchesResponse = await agent.get('/api/batches')
    const accountsResponse = await agent.get('/api/accounts')

    expect(batchesResponse.status).toBe(200)
    expect(batchesResponse.body.recentBatchId).toBe('batch-1')
    expect(accountsResponse.status).toBe(200)
    expect(accountsResponse.body.accounts[0].nickname).toBe('自然卷儿')
  })

  test('creates batch via v7 route', async () => {
    const v7Service = {
      eventBus: { subscribeBatch: vi.fn(() => () => {}) },
      listBatches: vi.fn(() => ({ recentBatchId: null, batches: [] })),
      createBatch: vi.fn((payload) => ({
        id: 'batch-created',
        name: payload.name,
        status: 'DRAFT',
        target: { docUrl: payload.docUrl, sheetName: payload.sheetName },
        blockers: [],
        overview: {
          readyAccounts: 0,
          executableRows: 0,
          blockersCount: 0,
          primaryCta: { label: '锁定并检查交接表' },
          phaseRail: []
        },
        coverageSummary: { executable: 0 }
      })),
      getBatch: vi.fn(),
      listAccounts: vi.fn(() => ({ accounts: [], summary: {} })),
      getAccountsHealth: vi.fn(() => ({ summary: {} }))
    }
    const app = createTestApp({ v7Service })
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)

    const response = await agent.post('/api/batches').send({
      name: '3 月鞋包批次',
      docUrl: 'https://docs.qq.com/mock',
      sheetName: '数据汇总'
    })

    expect(response.status).toBe(201)
    expect(v7Service.createBatch).toHaveBeenCalledWith({
      name: '3 月鞋包批次',
      docUrl: 'https://docs.qq.com/mock',
      sheetName: '数据汇总'
    })
    expect(response.body.id).toBe('batch-created')
  })

  test('keeps legacy login session route available', async () => {
    const app = createTestApp()
    const agent = request.agent(app)
    await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)

    const response = await agent.post('/api/accounts/login-sessions').send({})

    expect(response.status).toBe(201)
    expect(response.body.loginSessionId).toBe('session-1')
    expect(response.body.qrImageUrl).toBe('/api/artifacts/login-sessions/session-1/qr.png')
  })
})
