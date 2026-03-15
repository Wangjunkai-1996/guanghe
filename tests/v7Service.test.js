import { afterEach, describe, expect, test } from 'vitest'
import * as crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'

const { createV7Database } = require('../server/v7/database')
const { V7EventBus } = require('../server/v7/eventBus')
const { V7WorkspaceService } = require('../server/v7/service')

class MockAccountStore extends EventEmitter {
  constructor(accounts) {
    super()
    this.accounts = [...accounts]
  }

  list() {
    return [...this.accounts]
  }

  get(accountId) {
    return this.accounts.find((account) => String(account.accountId) === String(accountId)) || null
  }
}

const tempDirs = []

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('V7 workspace service', () => {
  test('reuses successful historical bindings across batches', async () => {
    const env = createServiceHarness()
    const { service, setInspectRows } = env

    setInspectRows([
      buildSheetRow({ sheetRow: 2, nickname: '自然卷儿', contentId: '554608495125' })
    ])
    const sourceBatch = service.createBatch({
      name: '历史来源',
      docUrl: 'https://docs.qq.com/mock',
      sheetName: '数据汇总'
    })
    await service.inspectBatchIntake(sourceBatch.id)
    service.generateCoverage(sourceBatch.id)
    service.saveRules(sourceBatch.id, {})
    service.createRun(sourceBatch.id)
    await waitForRunToSettle(service, sourceBatch.id)

    setInspectRows([
      buildSheetRow({ sheetRow: 3, nickname: '完全不同的昵称', contentId: '554608495125' })
    ])
    const nextBatch = service.createBatch({
      name: '新批次',
      docUrl: 'https://docs.qq.com/mock',
      sheetName: '数据汇总'
    })
    await service.inspectBatchIntake(nextBatch.id)
    const coverage = service.generateCoverage(nextBatch.id)

    expect(coverage.items).toHaveLength(1)
    expect(coverage.items[0].binding.accountId).toBe('1001')
    expect(coverage.items[0].binding.mode).toBe('HISTORICAL')
  })

  test('saves and applies rule templates, then clones batch with inherited rules', async () => {
    const env = createServiceHarness()
    const { service, setInspectRows } = env

    setInspectRows([
      buildSheetRow({ sheetRow: 2, nickname: '自然卷儿', contentId: '7788990011' })
    ])
    const batch = service.createBatch({
      name: '模板批次',
      docUrl: 'https://docs.qq.com/mock',
      sheetName: '数据汇总'
    })

    await service.inspectBatchIntake(batch.id)
    service.generateCoverage(batch.id)
    const savedRules = service.saveRules(batch.id, {
      executionScope: 'NEW_EXECUTABLE',
      concurrencyProfile: 'SAFE'
    })
    const template = service.saveRuleTemplate({ batchId: batch.id, name: '安全模板' })

    expect(template.name).toBe('安全模板')
    expect(service.listRuleTemplates().templates).toHaveLength(1)

    const targetBatch = service.createBatch({
      name: '应用模板批次',
      docUrl: 'https://docs.qq.com/another',
      sheetName: 'Sheet1'
    })
    const appliedRules = service.applyRuleTemplate(targetBatch.id, template.id)

    expect(appliedRules.executionScope).toBe('NEW_EXECUTABLE')
    expect(appliedRules.concurrencyProfile).toBe('SAFE')

    const cloned = service.cloneBatch(batch.id, { includeRules: true })
    expect(cloned.target.docUrl).toBe('https://docs.qq.com/mock')
    expect(cloned.target.sheetName).toBe('数据汇总')
    expect(cloned.currentRules.executionScope).toBe(savedRules.executionScope)
    expect(cloned.currentRules.concurrencyProfile).toBe(savedRules.concurrencyProfile)
  })
})

function createServiceHarness() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-v7-'))
  tempDirs.push(tempDir)
  const db = createV7Database({ dbFile: path.join(tempDir, 'v7.sqlite') })
  const accountStore = new MockAccountStore([
    {
      accountId: '1001',
      nickname: '自然卷儿',
      profileDir: 'profiles/1001',
      status: 'READY',
      lastLoginAt: '2026-03-16T09:00:00.000Z'
    }
  ])

  let inspectRows = []
  const tencentDocsSyncService = {
    inspectSheet: async () => ({
      headers: ['逛逛昵称', '内容id', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数'],
      rows: inspectRows,
      rowCount: inspectRows.length,
      summary: {
        totalRows: inspectRows.length,
        completeRows: 0,
        needsFillRows: inspectRows.length,
        missingContentIdRows: inspectRows.filter((row) => !row.contentId).length
      }
    }),
    prepareHandoffSync: async ({ target, match }) => ({
      operationId: crypto.randomUUID(),
      target,
      match,
      artifactDir: tempDir,
      artifacts: {},
      columns: [
        { columnName: '查看次数', value: '10' },
        { columnName: '查看人数', value: '8' },
        { columnName: '种草成交金额', value: '9.8' },
        { columnName: '种草成交人数', value: '3' },
        { columnName: '商品点击次数', value: '5' }
      ]
    }),
    syncHandoffRow: async () => ({
      operationId: crypto.randomUUID(),
      writeSummary: { action: 'UPDATED', columnsUpdated: ['查看次数'] }
    }),
    runSerializedBrowserOperation: async (operation) => operation(),
    ensureBrowserProfileAvailable: () => {},
    adapter: {
      updateRowCells: async ({ cells, sheetRow }) => ({
        action: 'UPDATED',
        sheetRow,
        columnsUpdated: cells.map((cell) => cell.columnName)
      })
    }
  }

  const queryService = {
    queryByContentId: async ({ accountId, contentId }) => ({
      accountId,
      nickname: '自然卷儿',
      contentId,
      fetchedAt: '2026-03-16T10:00:00.000Z',
      metrics: {
        内容查看次数: { value: '10' },
        内容查看人数: { value: '8' },
        商品点击次数: { value: '5' }
      },
      screenshots: {
        summaryUrl: `/artifacts/${contentId}/summary.png`
      },
      artifacts: {
        resultUrl: `/artifacts/${contentId}/result.json`
      }
    })
  }

  const service = new V7WorkspaceService({
    db,
    eventBus: new V7EventBus(),
    loginService: { accountStore },
    queryService,
    tencentDocsSyncService,
    browserManager: {
      runAccountTask: async (_accountId, task) => task(),
      getOrCreateAccountContext: async () => ({
        context: {
          pages: () => [],
          newPage: async () => ({
            goto: async () => {},
            waitForTimeout: async () => {},
            close: async () => {}
          })
        }
      }),
      closeAccount: async () => {}
    },
    accountStore
  })

  return {
    service,
    setInspectRows(rows) {
      inspectRows = rows
    }
  }
}

function buildSheetRow({ sheetRow, nickname, contentId }) {
  return {
    sheetRow,
    nickname,
    contentId,
    cells: {
      逛逛昵称: nickname,
      内容id: contentId,
      查看次数: '',
      查看人数: '',
      种草成交金额: '',
      种草成交人数: '',
      商品点击次数: ''
    }
  }
}

async function waitForRunToSettle(service, batchId) {
  const timeoutAt = Date.now() + 5000

  while (Date.now() < timeoutAt) {
    const run = service.getBatch(batchId).activeRun
    if (run && ['SUCCEEDED', 'FAILED', 'PARTIAL_FAILED', 'STOPPED'].includes(run.status)) {
      return run
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  throw new Error('Run did not settle in time')
}
