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
    refreshTaskLogin: vi.fn(),
    retryTaskQuery: vi.fn(),
    deleteTask: vi.fn(),
    queryContent: vi.fn()
  }
  return { api }
})

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
    api.refreshTaskLogin.mockResolvedValue({ ok: true })
    api.retryTaskQuery.mockResolvedValue({ ok: true })
    api.deleteTask.mockResolvedValue(undefined)
    api.me.mockResolvedValue({ authenticated: true })
    api.listAccounts.mockResolvedValue({ accounts: [] })
    api.queryContent.mockResolvedValue({ ok: true })
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

    await screen.findByRole('heading', { name: '任务列表' })
    expect(screen.getByText('达人A')).toBeInTheDocument()
    expect(screen.getByText('达人B')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /仅看待扫码/ }))
    expect(screen.getByText('达人A')).toBeInTheDocument()
    expect(screen.queryByText('达人B')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看全部' }))
    fireEvent.click(screen.getByText('达人B'))

    const closeButton = await screen.findByRole('button', { name: '关闭任务详情' })
    const drawer = closeButton.closest('aside')

    expect(drawer).not.toBeNull()
    expect(within(drawer).getByText('二维码和结果都只在这里查看，减少主列表滚动和视觉干扰。')).toBeInTheDocument()
    expect(within(drawer).getByRole('link', { name: '查看汇总图' })).toHaveAttribute('href', '/api/artifacts/summary.png')
    expect(within(drawer).getByText('自然卷儿')).toBeInTheDocument()
  })

  test('shows live draft validation and counts in task builder', async () => {
    render(<BatchTasksWorkspace />)

    await screen.findByRole('heading', { name: '新建批量任务' })
    fireEvent.change(screen.getByLabelText('批量任务输入'), {
      target: { value: '达人A,554608495125\n无效任务' }
    })

    expect(screen.getByText('第 2 行：请按“备注,内容ID”或“备注<TAB>内容ID”填写')).toBeInTheDocument()
    expect(screen.getByText('总行数')).toBeInTheDocument()
    expect(screen.getByText('可创建')).toBeInTheDocument()
    expect(screen.getByText('错误数')).toBeInTheDocument()
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
    metrics: null,
    screenshots: { rawUrl: '', summaryUrl: '' },
    artifacts: { resultUrl: '', networkLogUrl: '' },
    ...overrides
  }
}
