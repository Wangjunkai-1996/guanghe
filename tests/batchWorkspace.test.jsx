// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

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
    createSheetDemandTaskFromAccounts: vi.fn(),
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
  static instances = []

  constructor(url) {
    this.url = url
    this.listeners = []
    MockEventSource.instances.push(this)
  }

  addEventListener(event, cb) {
    this.listeners.push({ event, cb })
  }

  close() {
    this.listeners = []
  }

  static emit(event, payload) {
    const serializedPayload = JSON.stringify(payload)
    MockEventSource.instances.forEach((instance) => {
      instance.listeners
        .filter((listener) => listener.event === event)
        .forEach((listener) => listener.cb({ data: serializedPayload }))
    })
  }
}
vi.stubGlobal('EventSource', MockEventSource)

import App from '../web/src/App'
import { BatchTasksWorkspace } from '../web/src/components/BatchTasksWorkspace'
import { ManualWorkspace } from '../web/src/components/ManualWorkspace'
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
    api.createSheetDemandTaskFromAccounts.mockResolvedValue({ tasks: [createTask({ taskId: 'sheet-account-1', taskMode: 'SHEET_DEMAND' })] })
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
      headers: [
        '逛逛昵称',
        '逛逛ID',
        '内容id',
        '查看次数截图',
        '查看次数',
        '查看人数',
        '种草成交金额',
        '种草成交人数',
        '商品点击次数',
        '前端小眼睛截图',
        '小眼睛数',
        '点赞数',
        '收藏数',
        '评论数'
      ],
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

    await screen.findByRole('heading', { name: '任务队列' })
    expect(screen.getAllByText('达人A').length).toBeGreaterThan(0)
    expect(screen.getByText('达人B')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /待扫码/ })[0])
    expect(screen.getAllByText('达人A').length).toBeGreaterThan(0)
    expect(screen.queryByText('达人B')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /全部任务/ }))
    fireEvent.click(screen.getByText('达人B'))

    await screen.findByText('详情已展开')
    const detailPane = document.querySelector('.task-detail-pane')

    expect(detailPane).not.toBeNull()
    expect(within(detailPane).getByText('当前建议')).toBeInTheDocument()

    // Switch to results tab to see results content
    fireEvent.click(within(detailPane).getByRole('tab', { name: '概览与结果' }))
    expect(within(detailPane).getByRole('link', { name: '查看分析图' })).toHaveAttribute('href', '/api/artifacts/summary.png')
    expect(within(detailPane).getAllByText('自然卷儿').length).toBeGreaterThan(0)

    // Switch to sync tab to see sync content
    fireEvent.click(within(detailPane).getByRole('tab', { name: '文档回填' }))
    expect(within(detailPane).getByText('腾讯文档同步')).toBeInTheDocument()
  })

  test('renders batch hero summary with core actions', async () => {
    api.listTasks.mockResolvedValue({ tasks: [] })

    render(<BatchTasksWorkspace />)

    expect(await screen.findByRole('heading', { name: '批量闭环工作区' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建任务' })).toBeInTheDocument()
    const batchCommandBar = document.querySelector('.batch-command-bar')
    expect(within(batchCommandBar).getByRole('button', { name: '检查工作表' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开高级排障' })).toBeInTheDocument()
    expect(document.querySelectorAll('.command-bar-grid .ui-stat-card')).toHaveLength(4)
  })

  test('shows tencent docs diagnostic summary and inspect artifacts', async () => {
    render(<BatchTasksWorkspace />)

    expect(await screen.findByRole('heading', { name: '腾讯文档高级排障' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '同步诊断' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '展开排障信息' }))

    expect(await screen.findByRole('heading', { name: '同步诊断' })).toBeInTheDocument()
    expect(await screen.findByText('完全匹配')).toBeInTheDocument()
    expect(screen.getAllByText('已登录').length).toBeGreaterThan(0)
    expect(screen.getByRole('link', { name: '打开诊断 JSON' })).toHaveAttribute('href', '/api/artifacts/tencent-docs/inspect/sheet-preview.json')
    expect(screen.getByRole('heading', { name: '缺数达人列表' })).toBeInTheDocument()
    expect(screen.getByText('达人A')).toBeInTheDocument()
    expect(api.inspectTencentDocsSheet).toHaveBeenCalledWith(expect.objectContaining({
      target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
      maxRows: 200
    }))
  })

  test('batch workspace does not load accounts on boot and defers initial inspect until idle time', async () => {
    const originalRequestIdleCallback = window.requestIdleCallback
    const originalCancelIdleCallback = window.cancelIdleCallback
    const requestIdleCallback = vi.fn(() => 1)
    const cancelIdleCallback = vi.fn()

    window.requestIdleCallback = requestIdleCallback
    window.cancelIdleCallback = cancelIdleCallback

    render(<BatchTasksWorkspace />)

    await waitFor(() => {
      expect(api.listTasks).toHaveBeenCalledTimes(1)
      expect(api.getTencentDocsConfig).toHaveBeenCalledTimes(1)
    })

    expect(api.listAccounts).not.toHaveBeenCalled()
    expect(api.inspectTencentDocsSheet).not.toHaveBeenCalled()
    expect(screen.getByText('交接表正在后台预检查')).toBeInTheDocument()
    expect(requestIdleCallback).toHaveBeenCalledTimes(1)

    await act(async () => {
      const [idleWork] = requestIdleCallback.mock.calls[0]
      await idleWork({
        didTimeout: false,
        timeRemaining: () => 50
      })
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(api.inspectTencentDocsSheet).toHaveBeenCalledTimes(1)
    })

    window.requestIdleCallback = originalRequestIdleCallback
    window.cancelIdleCallback = originalCancelIdleCallback
  })

  test('shows live draft validation and counts in task builder', async () => {
    render(<BatchTasksWorkspace />)

    await screen.findByRole('heading', { name: '批量任务队列' })
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
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
      headers: [
        '逛逛昵称',
        '内容id',
        '查看次数截图',
        '查看次数',
        '查看人数',
        '种草成交金额',
        '种草成交人数',
        '商品点击次数',
        '前端小眼睛截图',
        '小眼睛数',
        '点赞数',
        '收藏数',
        '评论数'
      ],
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
      expect(api.inspectTencentDocsSheet).toHaveBeenCalledWith(expect.objectContaining({
        target: { docUrl: 'https://docs.qq.com/sheet/DUmtNbkJQdkV0QVF4?tab=BB08J2', sheetName: '' },
        maxRows: 200
      }))
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


  test('shows sheet match source when task is matched by 逛逛ID', async () => {
    api.listTasks.mockResolvedValue({
      tasks: [
        createTask({
          taskId: 'task-match-source',
          taskMode: 'SHEET_DEMAND',
          remark: '达人E',
          contentId: '554608495125',
          accountId: '1001',
          accountNickname: '测试账号',
          sheetTarget: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
          sheetMatch: {
            status: 'NEEDS_FILL',
            sheetRow: 9,
            nickname: '达人E',
            contentId: '554608495125',
            missingColumns: ['查看次数'],
            matchedAt: '2026-03-09T01:00:00.000Z',
            details: { matchedBy: ['逛逛ID'] }
          },
          login: { status: 'LOGGED_IN' },
          query: { status: 'IDLE' }
        })
      ]
    })

    render(<BatchTasksWorkspace />)

    const taskQueueList = await waitFor(() => {
      const element = document.querySelector('.task-queue-list')
      expect(element).not.toBeNull()
      return element
    })
    expect(within(taskQueueList).getByText('按逛逛ID命中')).toBeInTheDocument()

    fireEvent.click(within(taskQueueList).getByText('达人E'))

    await screen.findByText('详情已展开')
    const detailPane = document.querySelector('.task-detail-pane')
    fireEvent.click(within(detailPane).getByRole('tab', { name: '文档回填' }))

    expect(within(detailPane).getAllByText('按逛逛ID命中').length).toBeGreaterThan(0)
    expect(within(detailPane).getByText('命中依据')).toBeInTheDocument()
    expect(within(detailPane).getByText('优先使用逛逛ID匹配交接表')).toBeInTheDocument()
  })

  test('shows nickname fallback source when accountId misses', async () => {
    api.listTasks.mockResolvedValue({
      tasks: [
        createTask({
          taskId: 'task-match-source-nickname',
          taskMode: 'SHEET_DEMAND',
          remark: '达人N',
          contentId: '554608495125',
          accountId: '9999',
          accountNickname: '测试账号',
          sheetTarget: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
          sheetMatch: {
            status: 'NEEDS_FILL',
            sheetRow: 10,
            nickname: '达人N',
            contentId: '554608495125',
            missingColumns: ['查看次数'],
            matchedAt: '2026-03-09T01:00:00.000Z',
            details: { matchedBy: ['nickname'] }
          },
          login: { status: 'LOGGED_IN' },
          query: { status: 'IDLE' }
        })
      ]
    })

    render(<BatchTasksWorkspace />)

    const taskQueueList = await waitFor(() => {
      const element = document.querySelector('.task-queue-list')
      expect(element).not.toBeNull()
      return element
    })
    expect(within(taskQueueList).getByText('按昵称兜底命中')).toBeInTheDocument()

    fireEvent.click(within(taskQueueList).getByText('达人N'))

    await screen.findByText('详情已展开')
    const detailPane = document.querySelector('.task-detail-pane')
    fireEvent.click(within(detailPane).getByRole('tab', { name: '文档回填' }))

    expect(within(detailPane).getAllByText('按昵称兜底命中').length).toBeGreaterThan(0)
    expect(within(detailPane).getByText('逛逛ID未命中，已按逛逛昵称兜底匹配')).toBeInTheDocument()
  })

  test('shows duplicate accountId sheet match as manual-intervention status', async () => {
    api.listTasks.mockResolvedValue({
      tasks: [
        createTask({
          taskId: 'task-duplicate-account-id',
          taskMode: 'SHEET_DEMAND',
          remark: '达人F',
          accountId: '1001',
          accountNickname: '测试账号',
          sheetTarget: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
          sheetMatch: {
            status: 'DUPLICATE_ACCOUNT_ID',
            sheetRow: 9,
            nickname: '达人F',
            contentId: '554608495125',
            missingColumns: ['查看次数'],
            matchedAt: '2026-03-09T01:00:00.000Z',
            details: { matchedBy: ['逛逛ID'], reason: 'DUPLICATE_ACCOUNT_ID' },
            matches: [
              { sheetRow: 9, nickname: '达人F', contentId: '554608495125', accountId: '1001', status: 'NEEDS_FILL' },
              { sheetRow: 18, nickname: '达人F-重复', contentId: '554608495126', accountId: '1001', status: 'NEEDS_FILL' }
            ]
          },
          login: { status: 'LOGGED_IN' },
          query: { status: 'IDLE' }
        })
      ]
    })

    render(<BatchTasksWorkspace />)

    const taskQueueList = await waitFor(() => {
      const element = document.querySelector('.task-queue-list')
      expect(element).not.toBeNull()
      return element
    })
    expect(within(taskQueueList).getByText('逛逛ID重复')).toBeInTheDocument()
    expect(within(taskQueueList).getByText('按逛逛ID命中')).toBeInTheDocument()

    fireEvent.click(within(taskQueueList).getByText('达人F'))

    await screen.findByText('详情已展开')
    const detailPane = document.querySelector('.task-detail-pane')
    fireEvent.click(within(detailPane).getByRole('tab', { name: '文档回填' }))

    expect(within(detailPane).getAllByText('逛逛ID重复').length).toBeGreaterThan(0)
    expect(within(detailPane).getByText(/找到多行相同逛逛ID/)).toBeInTheDocument()
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

    await screen.findByText('详情已展开')
    const detailPane = document.querySelector('.task-detail-pane')

    // Switch to sync tab to see sync content and buttons
    fireEvent.click(within(detailPane).getByRole('tab', { name: '文档回填' }))

    expect(within(detailPane).getAllByText(/同步：失败/).length).toBeGreaterThan(0)
    expect(within(detailPane).getAllByText('腾讯文档当前未登录，请先完成登录').length).toBeGreaterThan(0)

    fireEvent.click(within(detailPane).getByRole('button', { name: '预览回填' }))
    await waitFor(() => {
      expect(api.previewTencentDocsHandoff).toHaveBeenCalledWith(expect.objectContaining({
        resultUrl: '/api/artifacts/results.json'
      }))
    })

    fireEvent.click(within(detailPane).getByRole('button', { name: '立即同步' }))
    await waitFor(() => {
      expect(api.syncTencentDocsHandoff).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-sync-failed',
        resultUrl: '/api/artifacts/results.json'
      }))
    })
  })

  test('patches tencent docs inspect summary immediately after task SSE sync success', async () => {
    api.listTasks.mockResolvedValue({
      tasks: [
        createTask({
          taskId: 'task-sync-sse-refresh',
          taskMode: 'SHEET_DEMAND',
          remark: '达人SSE',
          contentId: '554608495125',
          accountId: '1001',
          accountNickname: '测试账号',
          sheetTarget: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
          sheetMatch: {
            status: 'NEEDS_FILL',
            sheetRow: 6,
            nickname: '达人SSE',
            contentId: '554608495125',
            missingColumns: ['查看次数'],
            matchedAt: '2026-03-09T01:00:00.000Z'
          },
          login: { status: 'LOGGED_IN' },
          query: { status: 'SUCCEEDED' },
          sync: {
            status: 'FAILED',
            operationId: 'handoff-sse-old',
            target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
            match: { sheetRow: 6, contentId: '554608495125', matchedBy: ['内容id'] },
            writeSummary: null,
            artifacts: null,
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

    api.inspectTencentDocsSheet.mockResolvedValueOnce({
      target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
      tabs: [{ name: '1', selected: true }],
      headers: ['逛逛昵称', '内容id', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数'],
      rowCount: 1,
      columnCount: 7,
      summary: {
        totalRows: 1,
        completeRows: 0,
        needsFillRows: 1,
        missingContentIdRows: 0,
        duplicateNicknameRows: 0
      },
      demands: [{ sheetRow: 6, nickname: '达人SSE', contentId: '554608495125', status: 'NEEDS_FILL', missingColumns: ['查看次数'], missingCount: 1 }],
      rows: [{ sheetRow: 6, contentId: '554608495125' }],
      artifacts: {}
    })

    render(<BatchTasksWorkspace />)

    const getSummaryCard = (label) => screen.getAllByText(label).map((node) => node.closest('.diagnostic-card')).find(Boolean)

    await waitFor(() => {
      expect(within(getSummaryCard('待补数')).getByText('1')).toBeInTheDocument()
      expect(within(getSummaryCard('已完整')).getByText('0')).toBeInTheDocument()
    })

    const inspectCallCountBeforeEvent = api.inspectTencentDocsSheet.mock.calls.length

    await act(async () => {
      MockEventSource.emit('tasks', {
        tasks: [
          createTask({
            taskId: 'task-sync-sse-refresh',
            taskMode: 'SHEET_DEMAND',
            remark: '达人SSE',
            contentId: '554608495125',
            accountId: '1001',
            accountNickname: '测试账号',
            sheetTarget: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
            sheetMatch: {
              status: 'NEEDS_FILL',
              sheetRow: 6,
              nickname: '达人SSE',
              contentId: '554608495125',
              missingColumns: ['查看次数'],
              matchedAt: '2026-03-09T01:00:00.000Z'
            },
            login: { status: 'LOGGED_IN' },
            query: { status: 'SUCCEEDED' },
            sync: {
              status: 'SUCCEEDED',
              operationId: 'sync-sse-refresh',
              target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
              match: { sheetRow: 6, contentId: '554608495125', matchedBy: ['内容id'] },
              writeSummary: { action: 'UPDATED', columnsUpdated: ['查看次数'] },
              artifacts: { writeLogUrl: '/api/artifacts/tencent-docs/handoff/write-log.json' },
              error: null
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
    })

    await waitFor(() => {
      expect(within(getSummaryCard('待补数')).getByText('0')).toBeInTheDocument()
      expect(within(getSummaryCard('已完整')).getByText('1')).toBeInTheDocument()
    })
    expect(api.inspectTencentDocsSheet).toHaveBeenCalledTimes(inspectCallCountBeforeEvent)
    expect(api.inspectTencentDocsSheet.mock.calls.some(([payload]) => payload?.forceRefresh === true)).toBe(false)
  })

  test('patches tencent docs inspect summary after manual sync succeeds without full re-inspect', async () => {
    api.listTasks
      .mockResolvedValueOnce({
        tasks: [
          createTask({
            taskId: 'task-sync-refresh',
            taskMode: 'SHEET_DEMAND',
            remark: '达人D',
            contentId: '554608495125',
            accountId: '1001',
            accountNickname: '测试账号',
            sheetTarget: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
            sheetMatch: {
              status: 'NEEDS_FILL',
              sheetRow: 6,
              nickname: '达人D',
              contentId: '554608495125',
              missingColumns: ['查看次数'],
              matchedAt: '2026-03-09T01:00:00.000Z'
            },
            login: { status: 'LOGGED_IN' },
            query: { status: 'SUCCEEDED' },
            sync: {
              status: 'FAILED',
              operationId: 'handoff-old',
              target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
              match: { sheetRow: 6, contentId: '554608495125', matchedBy: ['内容id'] },
              writeSummary: null,
              artifacts: null,
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
      .mockResolvedValueOnce({
        tasks: [
          createTask({
            taskId: 'task-sync-refresh',
            taskMode: 'SHEET_DEMAND',
            remark: '达人D',
            contentId: '554608495125',
            accountId: '1001',
            accountNickname: '测试账号',
            sheetTarget: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
            sheetMatch: {
              status: 'NEEDS_FILL',
              sheetRow: 6,
              nickname: '达人D',
              contentId: '554608495125',
              missingColumns: ['查看次数'],
              matchedAt: '2026-03-09T01:00:00.000Z'
            },
            login: { status: 'LOGGED_IN' },
            query: { status: 'SUCCEEDED' },
            sync: {
              status: 'SUCCEEDED',
              operationId: 'sync-refresh',
              target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
              match: { sheetRow: 6, contentId: '554608495125', matchedBy: ['内容id'] },
              writeSummary: { action: 'UPDATED', columnsUpdated: ['查看次数'] },
              artifacts: { writeLogUrl: '/api/artifacts/tencent-docs/handoff/write-log.json' },
              error: null
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

    api.inspectTencentDocsSheet
      .mockResolvedValueOnce({
        target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
        tabs: [{ name: '1', selected: true }],
        headers: ['逛逛昵称', '内容id', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数'],
        rowCount: 1,
        columnCount: 7,
        summary: {
          totalRows: 1,
          completeRows: 0,
          needsFillRows: 1,
          missingContentIdRows: 0,
          duplicateNicknameRows: 0
        },
        demands: [{ sheetRow: 6, nickname: '达人D', contentId: '554608495125', status: 'NEEDS_FILL', missingColumns: ['查看次数'], missingCount: 1 }],
        rows: [{ sheetRow: 6, contentId: '554608495125' }],
        artifacts: {}
      })
      .mockResolvedValueOnce({
        target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
        tabs: [{ name: '1', selected: true }],
        headers: ['逛逛昵称', '内容id', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数'],
        rowCount: 1,
        columnCount: 7,
        summary: {
          totalRows: 1,
          completeRows: 1,
          needsFillRows: 0,
          missingContentIdRows: 0,
          duplicateNicknameRows: 0
        },
        demands: [{ sheetRow: 6, nickname: '达人D', contentId: '554608495125', status: 'COMPLETE', missingColumns: [], missingCount: 0 }],
        rows: [{ sheetRow: 6, contentId: '554608495125' }],
        artifacts: {}
      })

    api.syncTencentDocsHandoff.mockResolvedValueOnce({
      operationId: 'sync-refresh',
      target: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' },
      match: { sheetRow: 6, contentId: '554608495125', matchedBy: ['内容id'] },
      writeSummary: { action: 'UPDATED', columnsUpdated: ['查看次数'] },
      artifacts: { writeLogUrl: '/api/artifacts/tencent-docs/handoff/write-log.json' }
    })

    render(<BatchTasksWorkspace />)

    const getSummaryCard = (label) => screen.getAllByText(label).map((node) => node.closest('.diagnostic-card')).find(Boolean)

    const taskQueueList = await waitFor(() => {
      const element = document.querySelector('.task-queue-list')
      expect(element).not.toBeNull()
      return element
    })
    await waitFor(() => {
      expect(within(getSummaryCard('待补数')).getByText('1')).toBeInTheDocument()
      expect(within(getSummaryCard('已完整')).getByText('0')).toBeInTheDocument()
    })

    fireEvent.click(within(taskQueueList).getByText('达人D'))

    await screen.findByText('详情已展开')
    const detailPane = document.querySelector('.task-detail-pane')
    fireEvent.click(within(detailPane).getByRole('tab', { name: '文档回填' }))
    fireEvent.click(within(detailPane).getByRole('button', { name: '立即同步' }))

    await waitFor(() => {
      expect(api.syncTencentDocsHandoff).toHaveBeenCalledWith(expect.objectContaining({
        taskId: 'task-sync-refresh',
        resultUrl: '/api/artifacts/results.json'
      }))
    })
    await waitFor(() => {
      expect(api.inspectTencentDocsSheet).toHaveBeenCalledTimes(2)
    }, { timeout: 3000 })
    await waitFor(() => {
      expect(within(getSummaryCard('待补数')).getByText('0')).toBeInTheDocument()
    }, { timeout: 3000 })
    expect(within(getSummaryCard('已完整')).getByText('1')).toBeInTheDocument()
    expect(api.inspectTencentDocsSheet.mock.calls.some(([payload]) => payload?.forceRefresh === true)).toBe(false)
  })

  test('app loads accounts only when manual workspace is opened for the first time', async () => {
    let resolveAccounts
    api.listAccounts.mockImplementationOnce(() => new Promise((resolve) => {
      resolveAccounts = () => resolve({
        accounts: [{ accountId: '1001', nickname: '自然卷儿', status: 'READY', lastLoginAt: '2026-03-11T00:29:00.000Z' }]
      })
    }))

    render(<App />)

    expect(await screen.findByRole('heading', { name: '批量任务控制台' })).toBeInTheDocument()
    expect(screen.queryByText('单条内容验证')).not.toBeInTheDocument()
    expect(api.listAccounts).not.toHaveBeenCalled()

    const workspaceNav = screen.getByRole('navigation', { name: '工作区导航' })
    fireEvent.click(within(workspaceNav).getByRole('button', { name: '账号查询' }))

    await waitFor(() => {
      expect(screen.getByText('手工页正在读取账号库')).toBeInTheDocument()
    })
    expect(api.listAccounts).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveAccounts()
      await Promise.resolve()
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '单条内容验证' })).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: '账号库与单条查询' })).toBeInTheDocument()

    fireEvent.click(within(workspaceNav).getByRole('button', { name: '批量闭环' }))
    expect(await screen.findByRole('heading', { name: '批量任务控制台' })).toBeInTheDocument()

    fireEvent.click(within(workspaceNav).getByRole('button', { name: '账号查询' }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '单条内容验证' })).toBeInTheDocument()
    })
    expect(api.listAccounts).toHaveBeenCalledTimes(1)
  })

  test('manual workspace routes to batch tab through onRequestBatchTab callback', async () => {
    const onRequestBatchTab = vi.fn()

    render(
      <ManualWorkspace
        accounts={[{ accountId: '1001', nickname: '自然卷儿', status: 'READY', lastLoginAt: '2026-03-11T00:29:00.000Z' }]}
        accountsLoading={false}
        selectedAccountId="1001"
        setSelectedAccountId={vi.fn()}
        activeAccount={{ accountId: '1001', nickname: '自然卷儿', status: 'READY' }}
        loginSession={null}
        isLoginDrawerOpen={false}
        setIsLoginDrawerOpen={vi.fn()}
        handleCreateLoginSession={vi.fn()}
        handleDeleteAccount={vi.fn()}
        onRequestBatchTab={onRequestBatchTab}
      />
    )

    expect(screen.queryByRole('button', { name: '匹配交接表' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '一键查询填表' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '前往批量闭环' }))
    expect(onRequestBatchTab).toHaveBeenCalled()
  })

  test('batch workspace matches saved accounts and uses confirm dialog before creating sheet-demand tasks', async () => {
    api.listAccounts.mockResolvedValue({
      accounts: [
        { accountId: '1001', nickname: '达人A', status: 'READY', lastLoginAt: '2026-03-11T00:29:00.000Z' },
        { accountId: '1002', nickname: '达人C', status: 'READY', lastLoginAt: '2026-03-11T01:29:00.000Z' }
      ]
    })

    render(<BatchTasksWorkspace />)

    await screen.findByRole('heading', { name: '匹配账号并批量下发' })

    fireEvent.click(screen.getByRole('button', { name: '匹配账号库' }))

    expect(await screen.findByText('已匹配 1 个可直接创建任务的账号')).toBeInTheDocument()
    expect(api.inspectTencentDocsSheet.mock.calls.some(([payload]) => payload?.forceRefresh === true)).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '为匹配账号创建任务' }))

    expect(await screen.findByRole('alertdialog', { name: '确认为匹配账号创建批量任务' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '创建批量任务' }))

    await waitFor(() => {
      expect(api.createSheetDemandTaskFromAccounts).toHaveBeenCalledWith({
        accountIds: ['1001'],
        sheetTarget: { docUrl: 'https://docs.qq.com/sheet/mock', sheetName: '1' }
      })
    })

    expect(await screen.findByText('已为 1 个匹配账号创建批量任务')).toBeInTheDocument()
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
