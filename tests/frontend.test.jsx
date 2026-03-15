// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../web/src/api', () => {
  const api = {
    me: vi.fn(),
    login: vi.fn(),
    listBatches: vi.fn(),
    createBatch: vi.fn(),
    getBatch: vi.fn(),
    updateBatchTarget: vi.fn(),
    inspectBatchIntake: vi.fn(),
    getSnapshot: vi.fn(),
    getCoverage: vi.fn(),
    generateCoverage: vi.fn(),
    updateCoverageBinding: vi.fn(),
    getRules: vi.fn(),
    saveRules: vi.fn(),
    createRun: vi.fn(),
    getRun: vi.fn(),
    listRunTasks: vi.fn(),
    retryRun: vi.fn(),
    getBatchHistory: vi.fn(),
    cloneBatch: vi.fn(),
    listAccounts: vi.fn(),
    getAccountHealth: vi.fn(),
    createLoginSession: vi.fn(),
    getLoginSession: vi.fn(),
    submitSmsCode: vi.fn(),
    deleteAccount: vi.fn(),
    keepAliveAccounts: vi.fn(),
    debugQuery: vi.fn(),
    listRuleTemplates: vi.fn(),
    saveRuleTemplate: vi.fn(),
    applyRuleTemplate: vi.fn()
  }
  return { api }
})

class MockEventSource {
  constructor() {
    this.listeners = new Map()
  }

  addEventListener(event, callback) {
    this.listeners.set(event, callback)
  }

  close() {}
}

vi.stubGlobal('EventSource', MockEventSource)

import App from '../web/src/App'
import { api } from '../web/src/api'

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset())

  api.me.mockResolvedValue({ authenticated: true })
  api.listBatches.mockResolvedValue({ recentBatchId: null, batches: [] })
  api.createBatch.mockResolvedValue({
    id: 'batch-created',
    name: '新批次',
    status: 'DRAFT',
    target: { docUrl: '', sheetName: '' },
    blockers: [],
    overview: {
      readyAccounts: 0,
      executableRows: 0,
      blockersCount: 0,
      primaryCta: { label: '锁定并检查交接表' },
      phaseRail: []
    },
    coverageSummary: { executable: 0 }
  })
  api.getBatch.mockResolvedValue(createBatchPayload())
  api.listAccounts.mockResolvedValue({
    accounts: [
      {
        id: '1001',
        nickname: '自然卷儿',
        status: 'READY',
        health: 'READY',
        lastLoginAt: '2026-03-16T09:00:00.000Z',
        boundCoverageCount: 3
      }
    ],
    summary: {
      total: 1,
      ready: 1,
      batchExecutableRows: 3
    }
  })
  api.getCoverage.mockResolvedValue(createCoveragePayload())
  api.getRules.mockResolvedValue({
    id: 'rules-1',
    executionScope: 'ALL_EXECUTABLE',
    accountScope: 'READY_ONLY',
    skipPolicies: {
      missingContentId: true,
      missingAccount: true,
      ambiguous: true,
      complete: true
    },
    syncPolicy: 'FILL_EMPTY_ONLY',
    failurePolicy: 'KEEP_FOR_RETRY',
    concurrencyProfile: 'STANDARD',
    preview: {
      willRunRows: 3,
      willSkipRows: 2,
      estimatedAccountUsage: 1,
      targetColumns: ['查看次数', '查看人数']
    }
  })
  api.getRun.mockResolvedValue({
    run: {
      id: 'run-1',
      batchId: 'batch-1',
      ruleSetId: 'rules-1',
      status: 'PARTIAL_FAILED',
      plannedCount: 3,
      runningCount: 0,
      successCount: 1,
      failedCount: 2,
      syncFailedCount: 1,
      startedAt: '2026-03-16T09:00:00.000Z',
      endedAt: '2026-03-16T09:05:00.000Z'
    },
    summary: {
      completionRate: 33,
      plannedCount: 3,
      successCount: 1,
      failedCount: 2,
      syncFailedCount: 1,
      runningCount: 0
    },
    buckets: [
      { key: 'LOGIN_FAILED', label: '登录失败', count: 0 },
      { key: 'QUERY_FAILED', label: '查询失败', count: 1 },
      { key: 'SYNC_FAILED', label: '回填失败', count: 1 },
      { key: 'BLOCKED', label: '歧义阻塞', count: 0 },
      { key: 'RUNNING', label: '运行中', count: 0 },
      { key: 'SUCCEEDED', label: '已完成', count: 1 }
    ]
  })
  api.listRunTasks.mockResolvedValue({
    selectedTaskId: 'task-2',
    buckets: [],
    tasks: [
      {
        id: 'task-2',
        coverageItemId: 'coverage-1',
        accountId: '1001',
        status: 'FAILED',
        updatedAt: '2026-03-16T09:03:00.000Z',
        errorCode: 'SYNC_FAILED',
        errorMessage: '回填失败',
        queryPayload: {
          accountId: '1001',
          nickname: '自然卷儿',
          contentId: '554608495125',
          fetchedAt: '2026-03-16T09:02:00.000Z',
          metrics: {
            内容查看次数: { value: '83611' },
            内容查看人数: { value: '18033' },
            商品点击次数: { value: '432' }
          },
          screenshots: {
            summaryUrl: '/summary.png'
          },
          artifacts: {
            resultUrl: '/result.json'
          }
        }
      }
    ]
  })
  api.getBatchHistory.mockResolvedValue({ runs: [] })
  api.cloneBatch.mockResolvedValue(createBatchPayload())
  api.getAccountHealth.mockResolvedValue({
    summary: {
      total: 1,
      ready: 1,
      keepAliveSuggested: 0,
      reloginSuggested: 0,
      batchExecutableRows: 3
    },
    recommendedKeepAlive: [],
    recommendedRelogin: []
  })
  api.listRuleTemplates.mockResolvedValue({ templates: [] })
  api.saveRuleTemplate.mockResolvedValue({
    id: 'template-1',
    name: '默认模板',
    useCount: 0,
    rules: {
      concurrencyProfile: 'STANDARD'
    }
  })
  api.applyRuleTemplate.mockResolvedValue({
    id: 'rules-1',
    executionScope: 'ALL_EXECUTABLE',
    accountScope: 'READY_ONLY',
    skipPolicies: {
      missingContentId: true,
      missingAccount: true,
      ambiguous: true,
      complete: true
    },
    syncPolicy: 'FILL_EMPTY_ONLY',
    failurePolicy: 'KEEP_FOR_RETRY',
    concurrencyProfile: 'STANDARD',
    preview: {
      willRunRows: 3,
      willSkipRows: 2,
      estimatedAccountUsage: 1,
      targetColumns: ['查看次数']
    }
  })
})

describe('v7 frontend shell', () => {
  test('shows login gate when auth is required and submits password', async () => {
    api.me.mockResolvedValueOnce({ authenticated: false })
    api.login.mockResolvedValueOnce({ ok: true })

    renderWithRouter('/')

    expect(await screen.findByText('进入批次运营台')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('工具口令'), { target: { value: 'pass123' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith('pass123')
    })
  })

  test('shows new batch wizard when there is no recent batch', async () => {
    renderWithRouter('/')

    expect(await screen.findByText('从批次开始，而不是从任务开始')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('批次名称'), { target: { value: '3 月鞋包' } })
    fireEvent.click(screen.getByRole('button', { name: '创建首个批次' }))

    await waitFor(() => {
      expect(api.createBatch.mock.calls[0][0]).toEqual({
        name: '3 月鞋包',
        docUrl: '',
        sheetName: ''
      })
    })
  })

  test('renders intake stage with inline blockers and compact heartbeat', async () => {
    api.listBatches.mockResolvedValueOnce({
      recentBatchId: 'batch-1',
      batches: [createBatchPayload()]
    })

    renderWithRouter('/batches/batch-1/intake')

    expect(await screen.findByRole('heading', { name: '交接表接入' })).toBeInTheDocument()
    expect(screen.getAllByText('缺少必要列：查看次数').length).toBeGreaterThan(0)
    expect(screen.getByText('当前批次')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /锁定并检查交接表/ })).toBeInTheDocument()
  })

  test('opens task drawer on run page and closes it with escape', async () => {
    api.listBatches.mockResolvedValueOnce({
      recentBatchId: 'batch-1',
      batches: [createBatchPayload()]
    })

    renderWithRouter('/batches/batch-1/run')

    expect(await screen.findByRole('heading', { name: '运行与回填' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /coverage-1/ }))

    expect(await screen.findByRole('dialog', { name: '任务详情抽屉' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '任务详情抽屉' })).not.toBeInTheDocument()
    })
  })
})

function renderWithRouter(initialEntry) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function createBatchPayload() {
  return {
    id: 'batch-1',
    name: '鞋包 3 月第二周',
    status: 'NEEDS_ATTENTION',
    target: {
      docUrl: 'https://docs.qq.com/mock',
      sheetName: '数据汇总'
    },
    blockers: ['缺少必要列：查看次数'],
    latestSnapshotId: 'snapshot-1',
    latestRuleSetId: 'rules-1',
    activeRunId: 'run-1',
    latestSnapshot: {
      id: 'snapshot-1',
      version: 2,
      checkedAt: '2026-03-16T09:00:00.000Z',
      summary: {
        totalRows: 5,
        completeRows: 1,
        needsFillRows: 3,
        missingContentIdRows: 1
      },
      blockers: [
        {
          code: 'HEADER_MISSING',
          message: '缺少必要列：查看次数'
        }
      ],
      headers: ['逛逛昵称', '内容id']
    },
    overview: {
      readyAccounts: 1,
      executableRows: 3,
      blockersCount: 1,
      primaryCta: {
        label: '补跑失败项'
      },
      phaseRail: [
        { key: 'intake', label: '交接表接入', status: '需处理' },
        { key: 'accounts', label: '账号接入', status: '已完成' },
        { key: 'coverage', label: '覆盖率生成', status: '可执行' },
        { key: 'rules', label: '规则设定', status: '已完成' },
        { key: 'run', label: '运行与回填', status: '需处理' },
        { key: 'history', label: '历史复盘', status: '未就绪' }
      ]
    },
    coverageSummary: {
      total: 5,
      executable: 3,
      missingContentId: 1,
      missingAccount: 0,
      ambiguous: 1,
      complete: 1
    },
    currentRules: {
      id: 'rules-1',
      preview: {
        willRunRows: 3,
        willSkipRows: 2,
        estimatedAccountUsage: 1,
        targetColumns: ['查看次数', '查看人数']
      }
    },
    activeRun: {
      id: 'run-1',
      status: 'PARTIAL_FAILED',
      syncFailedCount: 1,
      failedCount: 2
    },
    history: []
  }
}

function createCoveragePayload() {
  return {
    summary: {
      total: 5,
      executable: 3,
      missingContentId: 1,
      missingAccount: 0,
      ambiguous: 1,
      complete: 1
    },
    buckets: [
      { key: 'EXECUTABLE', label: '可执行', count: 3 },
      { key: 'MISSING_CONTENT_ID', label: '缺内容ID', count: 1 },
      { key: 'MISSING_ACCOUNT', label: '缺账号', count: 0 },
      { key: 'AMBIGUOUS', label: '歧义', count: 1 },
      { key: 'COMPLETE', label: '已完整', count: 1 }
    ],
    defaultSelectedId: 'coverage-1',
    items: [
      {
        id: 'coverage-1',
        sheetRow: 6,
        nickname: '自然卷儿',
        contentId: '554608495125',
        status: 'EXECUTABLE',
        binding: {
          accountId: '1001'
        },
        missingColumns: ['查看次数'],
        recommendation: '可直接进入本批执行'
      }
    ]
  }
}
