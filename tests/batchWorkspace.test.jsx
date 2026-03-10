// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

vi.mock('../web/src/api', () => {
  const api = {
    me: vi.fn(),
    login: vi.fn(),
    listAccounts: vi.fn(),
    createLoginSession: vi.fn(),
    getLoginSession: vi.fn(),
    deleteAccount: vi.fn(),
    listTasks: vi.fn(),
    createTaskBatch: vi.fn(),
    createSheetDemandTaskBatch: vi.fn(),
    refreshTaskLogin: vi.fn(),
    retryTaskQuery: vi.fn(),
    deleteTask: vi.fn(),
    queryContent: vi.fn(),
    getTencentDocsConfig: vi.fn(),
    updateTencentDocsConfig: vi.fn(),
    createTencentDocsLoginSession: vi.fn(),
    getTencentDocsLoginSession: vi.fn(),
    inspectTencentDocsSheet: vi.fn(),
    previewTencentDocsHandoff: vi.fn(),
    syncTencentDocsHandoff: vi.fn()
  }
  return { api }
})

class MockEventSource {
  constructor(url) {
    this.url = url
    this.cleanup = []
  }
  addEventListener(event, cb) {
    this.cleanup.push({ event, cb })
  }
  close() {
    this.cleanup = []
  }
}
vi.stubGlobal('EventSource', MockEventSource)

import App from '../web/src/App'
import { BatchTasksWorkspace } from '../web/src/components/BatchTasksWorkspace'
import { api } from '../web/src/api'

afterEach(() => {
  cleanup()
})

describe('batch task workspace ui', () => {
  beforeEach(() => {
    Object.values(api).forEach((fn) => fn.mockReset())
    api.listTasks.mockResolvedValue({ tasks: [] })
    api.createTaskBatch.mockResolvedValue({ tasks: [] })
    api.createSheetDemandTaskBatch.mockResolvedValue({ tasks: [createTask({ taskId: 'sheet-task-1', taskMode: 'SHEET_DEMAND' })] })
    api.refreshTaskLogin.mockResolvedValue({ ok: true })
    api.retryTaskQuery.mockResolvedValue({ ok: true })
    api.deleteTask.mockResolvedValue(undefined)
    api.me.mockResolvedValue({ authenticated: true })
    api.listAccounts.mockResolvedValue({ accounts: [] })
    api.queryContent.mockResolvedValue({ ok: true })
    api.getTencentDocsConfig.mockResolvedValue({
      enabled: true,
      mode: 'browser',
      defaultTargetConfigured: true,
      defaultSheetName: '1',
      defaultWriteMode: 'upsert',
      target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
      login: { status: 'LOGGED_IN', updatedAt: '2026-03-09T00:10:00.000Z', error: null }
    })
    api.updateTencentDocsConfig.mockResolvedValue({
      enabled: true,
      mode: 'browser',
      defaultTargetConfigured: true,
      defaultSheetName: '2',
      defaultWriteMode: 'upsert',
      target: { docUrl: 'https://docs.qq.com/sheet/next', sheetName: '2' },
      login: { status: 'LOGGED_IN', updatedAt: '2026-03-09T00:10:00.000Z', error: null }
    })
    api.createTencentDocsLoginSession.mockResolvedValue({
      loginSessionId: 'tdocs-session-1',
      status: 'WAITING_QR',
      qrImageUrl: '/api/artifacts/tencent-docs/login-sessions/tdocs-session-1/qr.png',
      updatedAt: '2026-03-09T00:12:00.000Z',
      error: null
    })
    api.getTencentDocsLoginSession.mockResolvedValue({
      loginSessionId: 'tdocs-session-1',
      status: 'LOGGED_IN',
      qrImageUrl: '/api/artifacts/tencent-docs/login-sessions/tdocs-session-1/qr.png',
      updatedAt: '2026-03-09T00:12:10.000Z',
      error: null
    })
    api.inspectTencentDocsSheet.mockResolvedValue({
      target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
      tabs: [
        { name: '1', selected: true },
        { name: '2', selected: false }
      ],
      headers: ['逛逛昵称', '逛逛ID', '内容id', '查看次数截图', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数'],
      rowCount: 3,
      columnCount: 9,
      summary: {
        totalRows: 3,
        completeRows: 1,
        needsFillRows: 1,
        missingContentIdRows: 1,
        duplicateNicknameRows: 0
      },
      demands: [
        {
          sheetRow: 6,
          nickname: '达人A',
          contentId: '554608495125',
          status: 'NEEDS_FILL',
          missingColumns: ['查看次数截图', '查看次数'],
          missingCount: 2
        },
        {
          sheetRow: 7,
          nickname: '达人B',
          contentId: '',
          status: 'CONTENT_ID_MISSING',
          missingColumns: ['内容id', '查看次数'],
          missingCount: 2
        },
        {
          sheetRow: 8,
          nickname: '达人C',
          contentId: '537029503554',
          status: 'COMPLETE',
          missingColumns: [],
          missingCount: 0
        }
      ],
      rows: [{ sheetRow: 6, contentId: '554608495125' }],
      artifacts: {
        beforeReadUrl: '/api/artifacts/tencent-docs/inspect/before-read.png',
        afterReadUrl: '/api/artifacts/tencent-docs/inspect/after-read.png',
        previewJsonUrl: '/api/artifacts/tencent-docs/inspect/sheet-preview.json'
      }
    })
    api.previewTencentDocsHandoff.mockResolvedValue({
      operationId: 'preview-1',
      target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
      match: { sheetRow: 6, contentId: '537029503554', matchedBy: ['内容id'] },
      columns: ['查看次数截图', '查看次数'],
      warnings: [],
      artifacts: { previewJsonUrl: '/api/artifacts/tencent-docs/handoff/preview.json' }
    })
    api.syncTencentDocsHandoff.mockResolvedValue({
      operationId: 'sync-1',
      target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
      match: { sheetRow: 6, contentId: '537029503554', matchedBy: ['内容id'] },
      writeSummary: { action: 'UPDATED', columnsUpdated: ['查看次数', '查看人数'] },
      artifacts: { writeLogUrl: '/api/artifacts/tencent-docs/handoff/write-log.json' }
    })
    window.confirm = vi.fn(() => true)
    window.requestAnimationFrame = (callback) => {
      callback(0)
      return 0
    }
  })

  test('renders list workspace, filters waiting tasks and opens detail drawer', async () => {
    api.listTasks.mockResolvedValue({
      tasks: [
        createTask({
          taskId: 'task-1',
          remark: '达人A',
          contentId: '554608495125',
          login: { status: 'WAITING_QR' },
          query: { status: 'IDLE' }
        }),
        createTask({
          taskId: 'task-2',
          remark: '达人B',
          contentId: '537029503554',
          accountId: '1001',
          accountNickname: '自然卷儿',
          login: { status: 'LOGGED_IN' },
          query: { status: 'SUCCEEDED' },
          fetchedAt: '2026-03-09T01:00:00.000Z',
          metrics: {
            内容查看次数: { value: '83611', field: 'consumePv' },
            内容查看人数: { value: '18033', field: 'consumeUv' },
            种草成交金额: { value: '155.13', field: 'payAmtZcLast' },
            种草成交人数: { value: '1', field: 'payBuyerCntZc' },
            商品点击次数: { value: '3', field: 'ipvPv' }
          },
          screenshots: { rawUrl: '/api/artifacts/raw.png', summaryUrl: '/api/artifacts/summary.png' },
          artifacts: { resultUrl: '/api/artifacts/results.json', networkLogUrl: '/api/artifacts/network-log.json' }
        })
      ]
    })

    render(<BatchTasksWorkspace />)

    await screen.findByRole('heading', { name: '任务过滤器' })
    expect(screen.getAllByText('达人A').length).toBeGreaterThan(0)
    expect(screen.getByText('达人B')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /待扫码/ })[0])
    expect(screen.getAllByText('达人A').length).toBeGreaterThan(0)
    expect(screen.queryByText('达人B')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /全部任务/ }))
    fireEvent.click(screen.getByText('达人B'))

    const expandedPill = await screen.findByText('收起详情')
    const accordionItem = expandedPill.closest('.task-accordion-item')

    expect(accordionItem).not.toBeNull()
    expect(within(accordionItem).getByText('当前建议')).toBeInTheDocument()

    // Switch to results tab to see results content
    fireEvent.click(within(accordionItem).getByRole('button', { name: '概览与结果' }))
    expect(within(accordionItem).getByRole('link', { name: '查看汇总图' })).toHaveAttribute('href', '/api/artifacts/summary.png')
    expect(within(accordionItem).getAllByText('自然卷儿').length).toBeGreaterThan(0)

    // Switch to sync tab to see sync content
    fireEvent.click(within(accordionItem).getByRole('button', { name: '文档回填' }))
    expect(within(accordionItem).getByText('腾讯文档同步')).toBeInTheDocument()
  })

  test('shows tencent docs diagnostic summary and inspect artifacts', async () => {
    render(<BatchTasksWorkspace />)

    expect(await screen.findByRole('heading', { name: '同步诊断' })).toBeInTheDocument()
    expect(await screen.findByText('完全匹配')).toBeInTheDocument()
    expect(screen.getAllByText('已登录').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '打开诊断 JSON' })).toHaveAttribute('href', '/api/artifacts/tencent-docs/inspect/sheet-preview.json')
    expect(screen.getByRole('heading', { name: '缺数达人列表' })).toBeInTheDocument()
    expect(screen.getByText('达人A')).toBeInTheDocument()
    expect(api.inspectTencentDocsSheet).toHaveBeenCalledWith({
      target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
      maxRows: 200
    })
  })

  test('shows live draft validation and counts in task builder', async () => {
    render(<BatchTasksWorkspace />)

    await screen.findByRole('heading', { name: '批量任务工作台' })
    fireEvent.click(screen.getByRole('button', { name: '手工建任务' }))
    await screen.findByRole('heading', { name: '新建批量任务' })

    fireEvent.change(screen.getByLabelText('批量任务输入'), {
      target: { value: '达人A,554608495125\n无效任务' }
    })

    expect(screen.getByText('第 2 行：请按“备注,内容ID”或“备注<TAB>内容ID”填写')).toBeInTheDocument()
    expect(screen.getAllByText('总行数').length).toBeGreaterThan(0)
    expect(screen.getAllByText('可创建').length).toBeGreaterThan(0)
    expect(screen.getAllByText('错误数').length).toBeGreaterThan(0)
  })

  test('auto-detects current sheet from doc url and persists it after inspect', async () => {
    api.getTencentDocsConfig.mockResolvedValueOnce({
      enabled: true,
      mode: 'browser',
      defaultTargetConfigured: false,
      defaultSheetName: '',
      defaultWriteMode: 'upsert',
      target: { docUrl: 'https://docs.qq.com/sheet/DUmtNbkJQdkV0QVF4?tab=BB08J2', sheetName: '' },
      login: { status: 'LOGGED_IN', updatedAt: '2026-03-09T00:10:00.000Z', error: null }
    })
    api.inspectTencentDocsSheet.mockResolvedValueOnce({
      target: { docUrl: 'https://docs.qq.com/sheet/DUmtNbkJQdkV0QVF4?tab=BB08J2', sheetName: '1' },
      tabs: [
        { name: '1', selected: true },
        { name: '1.08', selected: false }
      ],
      headers: ['逛逛昵称', '内容id', '查看次数截图', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数'],
      rowCount: 1,
      columnCount: 8,
      summary: {
        totalRows: 1,
        completeRows: 0,
        needsFillRows: 1,
        missingContentIdRows: 0,
        duplicateNicknameRows: 0
      },
      demands: [{
        sheetRow: 2,
        nickname: '达人A',
        contentId: '554608495125',
        status: 'NEEDS_FILL',
        missingColumns: ['查看次数截图'],
        missingCount: 1
      }],
      rows: [{ sheetRow: 2, contentId: '554608495125' }],
      artifacts: { previewJsonUrl: '/api/artifacts/tencent-docs/inspect/sheet-preview.json' }
    })
    api.updateTencentDocsConfig
      .mockResolvedValueOnce({
        enabled: true,
        mode: 'browser',
        defaultTargetConfigured: true,
        defaultSheetName: '1',
        defaultWriteMode: 'upsert',
        target: { docUrl: 'https://docs.qq.com/sheet/DUmtNbkJQdkV0QVF4?tab=BB08J2', sheetName: '1' },
        login: { status: 'LOGGED_IN', updatedAt: '2026-03-09T00:10:00.000Z', error: null }
      })

    render(<BatchTasksWorkspace />)

    await screen.findByRole('heading', { name: '腾讯交接表驱动工作台' })
    await waitFor(() => {
      expect(api.inspectTencentDocsSheet).toHaveBeenCalledWith({
        target: { docUrl: 'https://docs.qq.com/sheet/DUmtNbkJQdkV0QVF4?tab=BB08J2', sheetName: '' },
        maxRows: 200
      })
    })
    await waitFor(() => {
      expect(api.updateTencentDocsConfig).toHaveBeenCalledWith({
        docUrl: 'https://docs.qq.com/sheet/DUmtNbkJQdkV0QVF4?tab=BB08J2',
        sheetName: '1'
      })
    })
    expect(screen.getByLabelText('目标工作表')).toHaveValue('1')
    expect(screen.getByText('已检测到链接里包含工作表定位参数，保存或检查后会自动识别当前工作表。')).toBeInTheDocument()
  })

  test('saves handoff target and creates sheet-driven tasks', async () => {
    render(<BatchTasksWorkspace />)

    await screen.findByRole('heading', { name: '腾讯交接表驱动工作台' })
    await screen.findByText('达人A')

    fireEvent.change(screen.getByLabelText('腾讯文档链接'), {
      target: { value: 'https://docs.qq.com/sheet/next' }
    })
    fireEvent.change(screen.getByLabelText('目标工作表'), {
      target: { value: '2' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存交接表' }))

    await waitFor(() => {
      expect(api.updateTencentDocsConfig).toHaveBeenCalledWith({
        docUrl: 'https://docs.qq.com/sheet/next',
        sheetName: '2'
      })
    })

    fireEvent.click(screen.getByRole('button', { name: '生成 2 个光合二维码' }))
    await waitFor(() => {
      expect(api.createSheetDemandTaskBatch).toHaveBeenCalledWith(2)
    })
  })

  test('starts tencent docs login and shows qr image', async () => {
    api.getTencentDocsConfig.mockResolvedValueOnce({
      enabled: true,
      mode: 'browser',
      defaultTargetConfigured: false,
      defaultSheetName: '',
      defaultWriteMode: 'upsert',
      target: { docUrl: '', sheetName: '' },
      login: { status: 'IDLE', updatedAt: '', error: null }
    })

    render(<BatchTasksWorkspace />)

    await screen.findByRole('heading', { name: '腾讯交接表驱动工作台' })
    fireEvent.change(screen.getByLabelText('腾讯文档链接'), {
      target: { value: 'https://docs.qq.com/sheet/mock' }
    })
    fireEvent.click(screen.getByRole('button', { name: '腾讯文档扫码登录' }))

    await waitFor(() => {
      expect(api.createTencentDocsLoginSession).toHaveBeenCalledWith({
        target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '' }
      })
    })
    expect(await screen.findByAltText('腾讯文档登录二维码')).toHaveAttribute('src', '/api/artifacts/tencent-docs/login-sessions/tdocs-session-1/qr.png')
  })

  test('shows sync failure guidance and supports manual resync actions', async () => {
    api.listTasks.mockResolvedValue({
      tasks: [
        createTask({
          taskId: 'task-sync-failed',
          remark: '达人C',
          contentId: '554608495125',
          accountId: '1001',
          accountNickname: '自然卷儿',
          login: { status: 'LOGGED_IN' },
          query: { status: 'SUCCEEDED' },
          sync: {
            status: 'FAILED',
            operationId: 'handoff-1',
            target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
            match: { sheetRow: 7, contentId: '554608495125', matchedBy: ['内容id'] },
            writeSummary: null,
            artifacts: { errorUrl: '/api/artifacts/tencent-docs/handoff/error.png' },
            error: { code: 'TENCENT_DOCS_LOGIN_REQUIRED', message: '腾讯文档当前未登录，请先完成登录', details: null }
          },
          metrics: {
            内容查看次数: { value: '83611', field: 'consumePv' },
            内容查看人数: { value: '18033', field: 'consumeUv' },
            种草成交金额: { value: '155.13', field: 'payAmtZcLast' },
            种草成交人数: { value: '1', field: 'payBuyerCntZc' },
            商品点击次数: { value: '3', field: 'ipvPv' }
          },
          screenshots: { rawUrl: '/api/artifacts/raw.png', summaryUrl: '/api/artifacts/summary.png' },
          artifacts: { resultUrl: '/api/artifacts/results.json', networkLogUrl: '/api/artifacts/network-log.json' }
        })
      ]
    })

    render(<BatchTasksWorkspace />)

    expect((await screen.findAllByText('达人C')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByText('达人C')[0])

    const expandedPill = await screen.findByText('收起详情')
    const accordionItem = expandedPill.closest('.task-accordion-item')

    // Switch to sync tab to see sync content and buttons
    fireEvent.click(within(accordionItem).getByRole('button', { name: '文档回填' }))

    expect(within(accordionItem).getAllByText(/同步：失败/).length).toBeGreaterThan(0)
    expect(within(accordionItem).getAllByText('腾讯文档当前未登录，请先完成登录').length).toBeGreaterThan(0)

    fireEvent.click(within(accordionItem).getByRole('button', { name: '预览回填' }))
    await waitFor(() => {
      expect(api.previewTencentDocsHandoff).toHaveBeenCalledWith(expect.objectContaining({
        resultUrl: '/api/artifacts/results.json'
      }))
    })

    fireEvent.click(within(accordionItem).getByRole('button', { name: '立即同步' }))
    await waitFor(() => {
      expect(api.syncTencentDocsHandoff).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-sync-failed',
        resultUrl: '/api/artifacts/results.json'
      }))
    })
  })

  test('app defaults to task workspace and reveals manual query on demand', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: '批量任务工作台' })).toBeInTheDocument()
    expect(screen.queryByText('查询工具条')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展开账号查询' }))

    await waitFor(() => {
      expect(screen.getByText('查询工具条')).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: '账号查询（次级入口）' })).toBeInTheDocument()
  })
})

function createTask(overrides = {}) {
  return {
    taskId: 'task-default',
    remark: '默认任务',
    contentId: '554608495125',
    taskMode: 'MANUAL',
    sheetTarget: null,
    sheetMatch: null,
    loginSessionId: 'session-1',
    qrImageUrl: '/api/artifacts/login-sessions/session-1/qr.png',
    createdAt: '2026-03-09T00:00:00.000Z',
    updatedAt: '2026-03-09T00:00:00.000Z',
    fetchedAt: null,
    accountId: '',
    accountNickname: '',
    error: null,
    login: { status: 'WAITING_QR' },
    query: { status: 'IDLE' },
    sync: {
      status: 'IDLE',
      operationId: '',
      target: null,
      match: null,
      writeSummary: null,
      artifacts: null,
      error: null
    },
    metrics: null,
    screenshots: { rawUrl: '', summaryUrl: '' },
    artifacts: { resultUrl: '', networkLogUrl: '' },
    ...overrides
  }
}
