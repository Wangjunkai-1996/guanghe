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
  addEventListener() {}
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
  api.listBatches.mockResolvedValue({
    recentBatchId: 'batch-1',
    batches: [batchPayload()]
  })
  api.getBatch.mockResolvedValue(batchPayload())
  api.updateBatchTarget.mockResolvedValue(batchPayload())
  api.inspectBatchIntake.mockResolvedValue({
    id: 'snapshot-2',
    batchId: 'batch-1',
    version: 2,
    checkedAt: '2026-03-16T10:30:00.000Z',
    headers: ['逛逛昵称', '内容id', '查看次数'],
    rows: [],
    summary: { totalRows: 8 },
    blockers: []
  })
  api.getCoverage.mockResolvedValue(coveragePayload())
  api.generateCoverage.mockResolvedValue(coveragePayload())
  api.updateCoverageBinding.mockResolvedValue({
    ...coveragePayload().items[0],
    binding: { accountId: '1002' }
  })
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
      estimatedAccountUsage: 2,
      targetColumns: ['查看次数', '查看人数']
    }
  })
  api.saveRules.mockResolvedValue({
    id: 'rules-2',
    executionScope: 'NEW_EXECUTABLE',
    accountScope: 'READY_ONLY',
    skipPolicies: {
      missingContentId: true,
      missingAccount: true,
      ambiguous: true,
      complete: true
    },
    syncPolicy: 'FILL_EMPTY_ONLY',
    failurePolicy: 'KEEP_FOR_RETRY',
    concurrencyProfile: 'SAFE',
    preview: {
      willRunRows: 2,
      willSkipRows: 3,
      estimatedAccountUsage: 1,
      targetColumns: ['查看次数']
    }
  })
  api.listAccounts.mockResolvedValue({
    accounts: [
      {
        id: '1001',
        nickname: '自然卷儿',
        status: 'READY',
        health: 'READY',
        lastLoginAt: '2026-03-16T09:00:00.000Z'
      },
      {
        id: '1002',
        nickname: '卷卷二号',
        status: 'READY',
        health: 'KEEP_ALIVE',
        lastLoginAt: '2026-03-15T09:00:00.000Z'
      }
    ],
    summary: {
      total: 2,
      ready: 2,
      batchExecutableRows: 3
    }
  })
  api.getAccountHealth.mockResolvedValue({
    summary: {
      total: 2,
      ready: 2,
      keepAliveSuggested: 1,
      reloginSuggested: 0,
      batchExecutableRows: 3
    },
    recommendedKeepAlive: [],
    recommendedRelogin: []
  })
  api.createLoginSession.mockResolvedValue({
    loginSessionId: 'session-1',
    status: 'WAITING_QR',
    qrImageUrl: '/login-session.png',
    account: null,
    error: null,
    updatedAt: '2026-03-16T09:00:00.000Z'
  })
  api.getLoginSession.mockResolvedValue({
    loginSessionId: 'session-1',
    status: 'WAITING_QR',
    qrImageUrl: '/login-session.png',
    account: null,
    error: null,
    updatedAt: '2026-03-16T09:00:00.000Z'
  })
  api.getRun.mockResolvedValue({
    run: {
      id: 'run-1',
      batchId: 'batch-1',
      ruleSetId: 'rules-1',
      status: 'QUEUED',
      plannedCount: 3,
      runningCount: 0,
      successCount: 0,
      failedCount: 0,
      syncFailedCount: 0
    },
    summary: {
      completionRate: 0,
      plannedCount: 3,
      successCount: 0,
      failedCount: 0,
      syncFailedCount: 0,
      runningCount: 0
    },
    buckets: []
  })
  api.listRunTasks.mockResolvedValue({
    selectedTaskId: null,
    buckets: [],
    tasks: []
  })
  api.getBatchHistory.mockResolvedValue({ runs: [] })
  api.cloneBatch.mockResolvedValue(batchPayload())
  api.listRuleTemplates.mockResolvedValue({
    templates: [
      {
        id: 'template-1',
        name: '鞋包标准模板',
        useCount: 2,
        rules: {
          concurrencyProfile: 'STANDARD'
        }
      }
    ]
  })
  api.saveRuleTemplate.mockResolvedValue({
    id: 'template-1',
    name: '鞋包标准模板',
    useCount: 0,
    rules: {
      concurrencyProfile: 'STANDARD'
    }
  })
  api.applyRuleTemplate.mockResolvedValue({
    id: 'rules-2',
    executionScope: 'NEW_EXECUTABLE',
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
      estimatedAccountUsage: 2,
      targetColumns: ['查看次数', '查看人数']
    }
  })
})

describe('v7 batch workspace interactions', () => {
  test('coverage inspector supports manual account binding', async () => {
    renderApp('/batches/batch-1/coverage')

    expect(await screen.findByRole('heading', { name: '覆盖率生成' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('手动绑定账号'), { target: { value: '1002' } })

    await waitFor(() => {
      expect(api.updateCoverageBinding).toHaveBeenCalledWith('batch-1', 'coverage-1', { accountId: '1002' })
    })
  })

  test('rules stage saves explicit rule choices', async () => {
    renderApp('/batches/batch-1/rules')

    expect(await screen.findByRole('heading', { name: '规则设定' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '仅新可执行' }))
    fireEvent.click(screen.getByRole('button', { name: '安全' }))
    fireEvent.click(screen.getByRole('button', { name: /保存本批规则/ }))

    await waitFor(() => {
      expect(api.saveRules).toHaveBeenCalledWith('batch-1', expect.objectContaining({
        executionScope: 'NEW_EXECUTABLE',
        concurrencyProfile: 'SAFE'
      }))
    })
  })

  test('accounts stage creates login session from primary action', async () => {
    renderApp('/batches/batch-1/accounts')

    expect(await screen.findByRole('heading', { name: '账号接入' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /新增账号/ }))

    await waitFor(() => {
      expect(api.createLoginSession).toHaveBeenCalledTimes(1)
    })
    const qrImages = await screen.findAllByAltText('账号扫码二维码')
    expect(qrImages[0]).toHaveAttribute('src', '/login-session.png')
  })
})

function renderApp(initialEntry) {
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

function batchPayload() {
  return {
    id: 'batch-1',
    name: '3 月鞋包',
    status: 'READY',
    target: {
      docUrl: 'https://docs.qq.com/mock',
      sheetName: '数据汇总'
    },
    blockers: [],
    latestSnapshotId: 'snapshot-1',
    latestRuleSetId: 'rules-1',
    activeRunId: 'run-1',
    latestSnapshot: {
      id: 'snapshot-1',
      version: 1,
      checkedAt: '2026-03-16T09:00:00.000Z',
      summary: {
        totalRows: 5,
        completeRows: 1,
        needsFillRows: 3,
        missingContentIdRows: 1
      },
      blockers: [],
      headers: ['逛逛昵称', '内容id', '查看次数']
    },
    overview: {
      readyAccounts: 2,
      executableRows: 3,
      blockersCount: 0,
      primaryCta: {
        label: '启动批量执行'
      },
      phaseRail: [
        { key: 'intake', label: '交接表接入', status: '已完成' },
        { key: 'accounts', label: '账号接入', status: '已完成' },
        { key: 'coverage', label: '覆盖率生成', status: '可执行' },
        { key: 'rules', label: '规则设定', status: '已完成' },
        { key: 'run', label: '运行与回填', status: '可执行' },
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
        estimatedAccountUsage: 2,
        targetColumns: ['查看次数', '查看人数']
      }
    },
    activeRun: {
      id: 'run-1',
      status: 'QUEUED',
      failedCount: 0,
      syncFailedCount: 0
    },
    history: []
  }
}

function coveragePayload() {
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
