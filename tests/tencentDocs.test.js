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

  test('sheet inspect proxies parsed sheet snapshot from adapter', async () => {
    const adapter = {
      writeRow: async () => ({ action: 'UPDATED', matchedBy: ['同步键'] }),
      readSheet: async ({ target, maxRows }) => ({
        target,
        maxRows,
        tabs: [
          { name: '1', selected: true },
          { name: '1.08', selected: false }
        ],
        columnCount: 3,
        headers: ['逛逛昵称', '逛逛ID', '内容id'],
        rowCount: 1,
        rows: [
          {
            sheetRow: 2,
            nickname: '测试达人',
            contentId: '547982656829',
            values: ['测试达人', '331427156', '547982656829'],
            cells: {
              逛逛昵称: '测试达人',
              逛逛ID: '331427156',
              内容id: '547982656829'
            }
          }
        ]
      })
    }

    const { app } = createTestContext({ adapter, sheetName: '' })
    const agent = await loginAgent(app)
    const response = await agent
      .post('/api/tencent-docs/sheet/inspect')
      .send({
        target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
        maxRows: 5
      })

    expect(response.status).toBe(200)
    expect(response.body.target.sheetName).toBe('1')
    expect(response.body.maxRows).toBe(5)
    expect(response.body.headers).toEqual(['逛逛昵称', '逛逛ID', '内容id'])
    expect(response.body.rows[0].contentId).toBe('547982656829')
    expect(response.body.artifacts.previewJsonUrl).toMatch(/sheet-preview\.json$/)
  })

  test('sheet inspect treats screenshot-only gaps as complete when five metrics are filled', async () => {
    const adapter = {
      writeRow: async () => ({ action: 'UPDATED', matchedBy: ['同步键'] }),
      readSheet: async ({ target, maxRows }) => ({
        target,
        maxRows,
        tabs: [{ name: '1', selected: true }],
        columnCount: 8,
        headers: ['逛逛昵称', '内容id', '查看次数截图', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数'],
        rowCount: 1,
        rows: [
          {
            sheetRow: 2,
            nickname: '测试达人',
            contentId: '547982656829',
            values: ['测试达人', '547982656829', '', '35750', '10951', '255', '2', '4554'],
            cells: {
              逛逛昵称: '测试达人',
              内容id: '547982656829',
              查看次数截图: '',
              查看次数: '35750',
              查看人数: '10951',
              种草成交金额: '255',
              种草成交人数: '2',
              商品点击次数: '4554'
            }
          }
        ]
      })
    }

    const { app } = createTestContext({ adapter, sheetName: '' })
    const agent = await loginAgent(app)
    const response = await agent
      .post('/api/tencent-docs/sheet/inspect')
      .send({
        target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
        maxRows: 5
      })

    expect(response.status).toBe(200)
    expect(response.body.summary.needsFillRows).toBe(0)
    expect(response.body.summary.completeRows).toBe(1)
    expect(response.body.demands[0].status).toBe('COMPLETE')
    expect(response.body.demands[0].missingColumns).toEqual([])
  })

  test('sheet inspect ignores tail rows without nickname and content id', async () => {
    const adapter = {
      writeRow: async () => ({ action: 'UPDATED', matchedBy: ['同步键'] }),
      readSheet: async ({ target, maxRows }) => ({
        target,
        maxRows,
        tabs: [{ name: '1', selected: true }],
        columnCount: 8,
        headers: ['逛逛昵称', '内容id', '查看次数截图', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数'],
        rowCount: 2,
        rows: [
          {
            sheetRow: 2,
            nickname: '测试达人',
            contentId: '547982656829',
            values: ['测试达人', '547982656829', '', '', '', '', '', ''],
            cells: {
              逛逛昵称: '测试达人',
              内容id: '547982656829',
              查看次数截图: '',
              查看次数: '',
              查看人数: '',
              种草成交金额: '',
              种草成交人数: '',
              商品点击次数: ''
            }
          },
          {
            sheetRow: 3,
            nickname: '',
            contentId: '',
            values: ['', '', '', '1183', '439', '0', '0', '25'],
            cells: {
              逛逛昵称: '',
              内容id: '',
              查看次数截图: '',
              查看次数: '1183',
              查看人数: '439',
              种草成交金额: '0',
              种草成交人数: '0',
              商品点击次数: '25'
            }
          }
        ]
      })
    }

    const { app } = createTestContext({ adapter, sheetName: '' })
    const agent = await loginAgent(app)
    const response = await agent
      .post('/api/tencent-docs/sheet/inspect')
      .send({
        target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
        maxRows: 5
      })

    expect(response.status).toBe(200)
    expect(response.body.summary.totalRows).toBe(1)
    expect(response.body.summary.needsFillRows).toBe(1)
    expect(response.body.summary.missingContentIdRows).toBe(0)
    expect(response.body.demands).toHaveLength(1)
    expect(response.body.demands[0].sheetRow).toBe(2)
  })

  test('handoff preview backfills screenshot urls from artifact directory when results json lacks screenshots', async () => {
    const adapter = {
      writeRow: async () => ({ action: 'UPDATED', matchedBy: ['同步键'] }),
      readSheet: async ({ target, maxRows }) => ({
        target,
        maxRows,
        tabs: [{ name: '1', selected: true }],
        columnCount: 18,
        headers: ['逛逛昵称', '逛逛ID', '内容id', '主页链接', '粉丝数 (w)', '发布长链接', '主页类型', '前端小眼睛截图', '小眼睛数', '查看次数截图', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数', '点赞数', '收藏数', '评论数'],
        rowCount: 1,
        rows: [{ sheetRow: 6, nickname: '测试达人', contentId: '554608495125', values: [], cells: { 内容id: '554608495125' } }]
      }),
      updateRowCells: async () => ({ action: 'UPDATED', matchedBy: ['内容id'] })
    }

    const { app, artifactsRootDir } = createTestContext({ adapter, toolBaseUrl: 'https://tool.example.com' })
    ensureDir(path.join(artifactsRootDir, 'query-no-screens'))
    fs.writeFileSync(path.join(artifactsRootDir, 'query-no-screens', '04-results.png'), 'raw-image')
    fs.writeFileSync(path.join(artifactsRootDir, 'query-no-screens', '05-summary-strip.png'), 'summary-image')
    fs.writeFileSync(path.join(artifactsRootDir, 'query-no-screens', 'work-card.png'), 'card-image')
    fs.writeFileSync(path.join(artifactsRootDir, 'query-no-screens', 'network-log.json'), '{}')
    writeJson(path.join(artifactsRootDir, 'query-no-screens', 'results.json'), {
      accountId: '1001',
      nickname: '测试达人',
      contentId: '554608495125',
      fetchedAt: '2026-03-09T03:00:00.000Z',
      metrics: {
        内容查看次数: { value: '83611', field: 'consumePv' },
        内容查看人数: { value: '18033', field: 'consumeUv' },
        种草成交金额: { value: '155.13', field: 'payAmtZcLast' },
        种草成交人数: { value: '1', field: 'payBuyerCntZc' },
        商品点击次数: { value: '3', field: 'ipvPv' }
      }
    })

    const agent = await loginAgent(app)
    const response = await agent
      .post('/api/tencent-docs/handoff/preview')
      .send({
        source: { resultUrl: '/api/artifacts/query-no-screens/results.json' },
        target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
        maxRows: 20
      })

    expect(response.status).toBe(200)
    expect(response.body.patch['查看次数截图']).toBe('https://tool.example.com/api/artifacts/query-no-screens/05-summary-strip.png')
    expect(response.body.patch['前端小眼睛截图']).toBe('https://tool.example.com/api/artifacts/query-no-screens/work-card.png')
  })

  test('handoff sync resolves row by 内容id and writes J~O patch columns', async () => {
    const calls = []
    const adapter = {
      writeRow: async () => ({ action: 'UPDATED', matchedBy: ['同步键'] }),
      readSheet: async ({ target, maxRows }) => ({
        target,
        maxRows,
        tabs: [{ name: '1', selected: true }],
        columnCount: 18,
        headers: ['逛逛昵称', '逛逛ID', '内容id', '主页链接', '粉丝数 (w)', '发布长链接', '主页类型', '前端小眼睛截图', '小眼睛数', '查看次数截图', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数', '点赞数', '收藏数', '评论数'],
        rowCount: 1,
        rows: [{
          sheetRow: 6,
          nickname: '测试达人',
          contentId: '554608495125',
          values: [],
          cells: { 内容id: '554608495125' }
        }]
      }),
      updateRowCells: async (payload) => {
        calls.push(payload)
        return {
          action: 'UPDATED',
          sheetRow: payload.sheetRow,
          matchedBy: ['内容id'],
          columnsUpdated: payload.cells.map((cell) => cell.columnName)
        }
      }
    }

    const { app, artifactsRootDir } = createTestContext({ adapter, toolBaseUrl: 'https://tool.example.com' })
    const agent = await loginAgent(app)
    const resultUrl = writeResultPayload(artifactsRootDir)

    const response = await agent
      .post('/api/tencent-docs/handoff/sync')
      .send({
        source: { resultUrl },
        target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
        maxRows: 20
      })

    expect(response.status).toBe(200)
    expect(response.body.match.sheetRow).toBe(6)
    expect(response.body.match.contentId).toBe('554608495125')
    expect(response.body.columns.map((column) => column.columnLetter)).toEqual(['J', 'K', 'L', 'M', 'N', 'O', 'H', 'I', 'P', 'Q', 'R'])
    expect(response.body.patch['查看次数']).toBe('83611')
    expect(response.body.patch['查看次数截图']).toBe('https://tool.example.com/api/artifacts/query-1/05-summary-strip.png')
    expect(response.body.writeSummary.action).toBe('UPDATED')
    expect(calls).toHaveLength(1)
    expect(calls[0].sheetRow).toBe(6)
    expect(calls[0].cells[0].columnName).toBe('查看次数截图')
    expect(calls[0].cells[6].columnName).toBe('前端小眼睛截图')
    expect(calls[0].cells[10].columnName).toBe('评论数')
  })


  test('handoff sync failure returns operation context and artifact links', async () => {
    const adapter = {
      writeRow: async () => ({ action: 'UPDATED', matchedBy: ['同步键'] }),
      readSheet: async ({ target, maxRows }) => ({
        target,
        maxRows,
        tabs: [{ name: '1', selected: true }],
        columnCount: 18,
        headers: ['逛逛昵称', '逛逛ID', '内容id', '主页链接', '粉丝数 (w)', '发布长链接', '主页类型', '前端小眼睛截图', '小眼睛数', '查看次数截图', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数', '点赞数', '收藏数', '评论数'],
        rowCount: 1,
        rows: [{ sheetRow: 6, nickname: '测试达人', contentId: '554608495125', values: [], cells: { 内容id: '554608495125' } }]
      }),
      updateRowCells: async () => {
        throw new Error('写表失败')
      }
    }

    const { app, artifactsRootDir } = createTestContext({ adapter, toolBaseUrl: 'https://tool.example.com' })
    const agent = await loginAgent(app)
    const resultUrl = writeResultPayload(artifactsRootDir)

    const response = await agent
      .post('/api/tencent-docs/handoff/sync')
      .send({
        source: { resultUrl },
        target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
        maxRows: 20
      })

    expect(response.status).toBe(500)
    expect(response.body.error.code).toBe('TENCENT_DOCS_WRITE_FAILED')
    expect(response.body.error.details.operationId).toBeTruthy()
    expect(response.body.error.details.target.sheetName).toBe('1')
    expect(response.body.error.details.match.sheetRow).toBe(6)
    expect(response.body.error.details.artifacts.writeLogUrl).toMatch(/handoff-write-log\.json$/)
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

  test('marks stale pending and running jobs as failed on startup', async () => {
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

    const service = new TencentDocsSyncService({
      config,
      adapter: { writeRow: async () => ({ action: 'APPENDED', matchedBy: ['同步键'] }) }
    })

    await service.jobStore.flush()

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
      toolAuthEnabled: true,
      toolPassword: 'pass123',
      secureCookie: false,
      artifactsRootDir,
      distDir: '/tmp/not-used'
    },
    loginService: {
      listAccounts: () => [],
      createLoginSession: async () => null,
      getLoginSession: () => null,
      deleteAccount: async () => { }
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
      商品点击次数: { value: '3', field: 'ipvPv' },
      viewCount: '2.28w',
      likeCount: '313',
      collectCount: '0',
      commentCount: '12'
    },
    screenshots: {
      rawUrl: '/api/artifacts/query-1/04-results.png',
      summaryUrl: '/api/artifacts/query-1/05-summary-strip.png',
      cardUrl: '/api/artifacts/query-1/work-card.png'
    },
    artifacts: {
      resultUrl: '/api/artifacts/query-1/results.json',
      networkLogUrl: '/api/artifacts/query-1/network-log.json'
    },
    ...overrides
  }

  const fullPath = path.join(artifactsRootDir, relativePath)
  ensureDir(path.dirname(fullPath))
  writeJson(fullPath, payload)
  fs.writeFileSync(path.join(path.dirname(fullPath), '04-results.png'), 'raw-image')
  fs.writeFileSync(path.join(path.dirname(fullPath), '05-summary-strip.png'), 'summary-image')
  fs.writeFileSync(path.join(path.dirname(fullPath), 'work-card.png'), 'card-image')
  fs.writeFileSync(path.join(path.dirname(fullPath), 'network-log.json'), '{}')
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
