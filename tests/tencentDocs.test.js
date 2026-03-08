import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import request from 'supertest'

const { createApp } = require('../server/app')
const { TencentDocsSyncService } = require('../server/integrations/tencentDocs')
const { ensureDir, writeJson, readJson } = require('../server/lib/files')

const tempRoots = []

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop()
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('tencent docs integration', () => {
  test('blocks routes without tool auth', async () => {
    const { app } = createTestContext()
    const response = await request(app).get('/api/tencent-docs/config')

    expect(response.status).toBe(401)
    expect(response.body.error.code).toBe('AUTH_REQUIRED')
  })

  test('preview builds fixed row and omits link columns without TOOL_BASE_URL', async () => {
    const { app, artifactsRootDir } = createTestContext({ toolBaseUrl: '' })
    const agent = await loginAgent(app)
    const resultUrl = writeResultPayload(artifactsRootDir)

    const response = await agent
      .post('/api/tencent-docs/jobs/preview')
      .send({ source: { resultUrl } })

    expect(response.status).toBe(200)
    expect(response.body.syncKey).toBe('1001:554608495125')
    expect(response.body.row.同步键).toBe('1001:554608495125')
    expect(response.body.row.内容查看次数).toBe('83611')
    expect(response.body.omittedColumns).toEqual(['原图链接', '汇总图链接', '结果JSON'])
    expect(response.body.row.原图链接).toBeUndefined()
  })

  test('preview includes absolute artifact links when TOOL_BASE_URL is configured', async () => {
    const { app, artifactsRootDir } = createTestContext({ toolBaseUrl: 'https://tool.example.com' })
    const agent = await loginAgent(app)
    const resultUrl = writeResultPayload(artifactsRootDir)

    const response = await agent
      .post('/api/tencent-docs/jobs/preview')
      .send({ source: { resultUrl } })

    expect(response.status).toBe(200)
    expect(response.body.omittedColumns).toEqual([])
    expect(response.body.row.原图链接).toBe('https://tool.example.com/api/artifacts/query-1/04-results.png')
    expect(response.body.row.汇总图链接).toBe('https://tool.example.com/api/artifacts/query-1/05-summary-strip.png')
    expect(response.body.row.结果JSON).toBe('https://tool.example.com/api/artifacts/query-1/results.json')
  })

  test('jobs fail fast when sync is not enabled', async () => {
    const { app, artifactsRootDir } = createTestContext({ enabled: false })
    const agent = await loginAgent(app)
    const resultUrl = writeResultPayload(artifactsRootDir)

    const response = await agent
      .post('/api/tencent-docs/jobs')
      .send({ source: { resultUrl } })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('TENCENT_DOCS_NOT_CONFIGURED')
  })

  test('jobs fail when no default target is configured and request omits target', async () => {
    const { app, artifactsRootDir } = createTestContext({ docUrl: '', sheetName: '' })
    const agent = await loginAgent(app)
    const resultUrl = writeResultPayload(artifactsRootDir)

    const response = await agent
      .post('/api/tencent-docs/jobs')
      .send({ source: { resultUrl } })

    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('TENCENT_DOCS_NOT_CONFIGURED')
  })

  test('job status endpoint returns write summary after success', async () => {
    const { app, artifactsRootDir } = createTestContext()
    const agent = await loginAgent(app)
    const resultUrl = writeResultPayload(artifactsRootDir)

    const createResponse = await agent
      .post('/api/tencent-docs/jobs')
      .send({ source: { resultUrl } })

    expect(createResponse.status).toBe(202)
    expect(createResponse.body.jobId).toBeTruthy()

    const jobResponse = await waitFor(async () => {
      const response = await agent.get(`/api/tencent-docs/jobs/${createResponse.body.jobId}`)
      if (response.body.status !== 'SUCCEEDED') {
        throw new Error(`job still ${response.body.status}`)
      }
      return response
    })

    expect(jobResponse.body.status).toBe('SUCCEEDED')
    expect(jobResponse.body.writeSummary.action).toBe('UPDATED')
    expect(jobResponse.body.writeSummary.matchedBy).toEqual(['同步键'])
    expect(jobResponse.body.artifacts.writeLogUrl).toMatch(/write-log\.json$/)
  })

  test('serializes writes for the same document key', async () => {
    const callOrder = []
    let activeCount = 0
    let maxActiveCount = 0

    const adapter = {
      writeRow: async ({ syncKey }) => {
        callOrder.push(syncKey)
        activeCount += 1
        maxActiveCount = Math.max(maxActiveCount, activeCount)
        await delay(40)
        activeCount -= 1
        return {
          action: 'APPENDED',
          matchedBy: ['同步键']
        }
      }
    }

    const { service, artifactsRootDir } = createService({ adapter })
    const firstResultUrl = writeResultPayload(artifactsRootDir, 'query-a/results.json', {
      accountId: '1001',
      contentId: '554608495125'
    })
    const secondResultUrl = writeResultPayload(artifactsRootDir, 'query-b/results.json', {
      accountId: '1001',
      contentId: '554608495126'
    })

    const firstJob = service.createJob({ source: { resultUrl: firstResultUrl } })
    const secondJob = service.createJob({ source: { resultUrl: secondResultUrl } })

    await waitFor(() => {
      const firstStatus = service.getJob(firstJob.jobId).status
      const secondStatus = service.getJob(secondJob.jobId).status
      if (firstStatus !== 'SUCCEEDED' || secondStatus !== 'SUCCEEDED') {
        throw new Error('jobs not finished')
      }
      return true
    })

    expect(maxActiveCount).toBe(1)
    expect(callOrder).toEqual(['1001:554608495125', '1001:554608495126'])
  })

  test('marks stale pending and running jobs as failed on startup', () => {
    const { root, config } = createTencentDocsConfig()
    writeJson(config.jobsFile, {
      jobs: [
        {
          jobId: 'job-pending',
          status: 'PENDING',
          updatedAt: '2026-03-09T00:00:00.000Z',
          createdAt: '2026-03-09T00:00:00.000Z'
        },
        {
          jobId: 'job-running',
          status: 'RUNNING',
          updatedAt: '2026-03-09T00:00:00.000Z',
          createdAt: '2026-03-09T00:00:00.000Z'
        },
        {
          jobId: 'job-succeeded',
          status: 'SUCCEEDED',
          updatedAt: '2026-03-09T00:00:00.000Z',
          createdAt: '2026-03-09T00:00:00.000Z'
        }
      ]
    })
    tempRoots.push(root)

    new TencentDocsSyncService({
      config,
      adapter: { writeRow: async () => ({ action: 'APPENDED', matchedBy: ['同步键'] }) }
    })

    const payload = readJson(config.jobsFile, { jobs: [] })
    expect(payload.jobs[0].status).toBe('FAILED')
    expect(payload.jobs[0].error.code).toBe('SYNC_JOB_ABORTED_ON_RESTART')
    expect(payload.jobs[1].status).toBe('FAILED')
    expect(payload.jobs[2].status).toBe('SUCCEEDED')
  })
})

function createTestContext(options = {}) {
  const { app, service, artifactsRootDir } = createAppWithService(options)
  return { app, service, artifactsRootDir }
}

function createAppWithService(options = {}) {
  const { service, artifactsRootDir } = createService(options)
  const app = createApp({
    config: {
      sessionSecret: 'test-secret',
      toolPassword: 'pass123',
      secureCookie: false,
      artifactsRootDir,
      distDir: '/tmp/not-used'
    },
    loginService: {
      listAccounts: () => [],
      createLoginSession: async () => null,
      getLoginSession: () => null,
      deleteAccount: async () => {}
    },
    queryService: {
      queryByContentId: async () => ({ ok: true })
    },
    tencentDocsSyncService: service
  })

  return { app, service, artifactsRootDir }
}

function createService(options = {}) {
  const { root, config } = createTencentDocsConfig(options)
  tempRoots.push(root)
  const adapter = options.adapter || {
    writeRow: async ({ mode }) => ({
      action: mode === 'upsert' ? 'UPDATED' : 'APPENDED',
      matchedBy: ['同步键'],
      rowIndex: 2
    })
  }

  return {
    service: new TencentDocsSyncService({ config, adapter }),
    artifactsRootDir: config.artifactsRootDir
  }
}

function createTencentDocsConfig(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-xcx-tdocs-'))
  const artifactsRootDir = path.join(root, 'artifacts', 'web')
  const dataDir = path.join(root, 'data')
  const profileDir = path.join(root, '.cache', 'profiles', 'tencent-docs')
  ensureDir(artifactsRootDir)
  ensureDir(dataDir)
  ensureDir(profileDir)

  return {
    root,
    config: {
      enabled: options.enabled !== false,
      mode: 'browser',
      docUrl: options.docUrl === undefined ? 'https://docs.qq.com/sheet/mock' : options.docUrl,
      sheetName: options.sheetName === undefined ? '数据汇总' : options.sheetName,
      writeMode: options.writeMode || 'upsert',
      headless: true,
      timezone: 'Asia/Shanghai',
      jobsFile: path.join(dataDir, 'tencent-docs-jobs.json'),
      profileDir,
      toolBaseUrl: options.toolBaseUrl || '',
      browserExecutablePath: '/tmp/mock-chrome',
      artifactsRootDir
    }
  }
}

function writeResultPayload(artifactsRootDir, relativePath = 'query-1/results.json', overrides = {}) {
  const payload = {
    accountId: '1001',
    nickname: '测试账号',
    contentId: '554608495125',
    fetchedAt: '2026-03-09T03:00:00.000Z',
    metrics: {
      内容查看次数: { value: '83611', field: 'consumePv' },
      内容查看人数: { value: '18033', field: 'consumeUv' },
      种草成交金额: { value: '155.13', field: 'payAmtZcLast' },
      种草成交人数: { value: '1', field: 'payBuyerCntZc' },
      商品点击次数: { value: '3', field: 'ipvPv' }
    },
    screenshots: {
      rawUrl: '/api/artifacts/query-1/04-results.png',
      summaryUrl: '/api/artifacts/query-1/05-summary-strip.png'
    },
    artifacts: {
      resultUrl: '/api/artifacts/query-1/results.json',
      networkLogUrl: '/api/artifacts/query-1/network-log.json'
    },
    ...overrides
  }

  const fullPath = path.join(artifactsRootDir, relativePath)
  writeJson(fullPath, payload)
  return `/api/artifacts/${relativePath.split(path.sep).join('/')}`
}

async function loginAgent(app) {
  const agent = request.agent(app)
  await agent.post('/api/auth/login').send({ password: 'pass123' }).expect(200)
  return agent
}

async function waitFor(callback, { timeoutMs = 2000, intervalMs = 25 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      return await callback()
    } catch (_error) {
      await delay(intervalMs)
    }
  }
  return callback()
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
