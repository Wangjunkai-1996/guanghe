// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LoginForm } from '../web/src/components/LoginForm'
import { QueryForm } from '../web/src/components/QueryForm'
import { LoginSessionPanel } from '../web/src/components/LoginSessionPanel'
import { ResultPanel } from '../web/src/components/ResultPanel'

describe('frontend components', () => {
  test('renders login form and submits password', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<LoginForm loading={false} error="" onSubmit={onSubmit} />)

    fireEvent.change(screen.getByPlaceholderText('请输入访问口令'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: '登录工具' }))

    expect(onSubmit).toHaveBeenCalledWith('secret')
  })

  test('query form shows active account and filters non-digits', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <QueryForm
        activeAccount={{ accountId: '1001', nickname: '自然卷儿' }}
        loading={false}
        onSubmit={onSubmit}
      />
    )

    fireEvent.change(screen.getByPlaceholderText('例如：554608495125'), { target: { value: '55a4 608' } })
    expect(screen.getByDisplayValue('554608')).toBeInTheDocument()
    expect(screen.getByText('仅支持数字内容 ID，已自动过滤非数字字符。')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '开始查询' }))
    expect(onSubmit).toHaveBeenCalledWith({ contentId: '554608' })
  })

  test('login drawer shows expired state and refresh action', () => {
    render(
      <LoginSessionPanel
        loginSession={{
          loginSessionId: 'session-1',
          status: 'EXPIRED',
          qrImageUrl: '/api/artifacts/login-sessions/session-1/qr.png',
          error: null,
          account: null
        }}
        qrCodeDataUrl="/api/artifacts/login-sessions/session-1/qr.png"
        isOpen
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />
    )

    expect(screen.getByText('二维码已过期')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '刷新二维码' })).toBeInTheDocument()
  })

  test('result panel defaults to summary screenshot and supports tab switch', () => {
    render(
      <ResultPanel
        loading={false}
        error={null}
        activeAccount={{ accountId: '1001', nickname: '测试账号' }}
        onRetryLogin={vi.fn()}
        result={{
          accountId: '1001',
          nickname: '测试账号',
          contentId: '554608495125',
          fetchedAt: '2026-03-08T15:00:00.000Z',
          metrics: {
            内容查看次数: { value: '83611', field: 'consumePv' },
            内容查看人数: { value: '18033', field: 'consumeUv' },
            种草成交金额: { value: '155.13', field: 'payAmtZcLast' },
            种草成交人数: { value: '1', field: 'payBuyerCntZc' },
            商品点击次数: { value: '3', field: 'ipvPv' }
          },
          screenshots: {
            rawUrl: '/api/artifacts/raw.png',
            summaryUrl: '/api/artifacts/summary.png'
          }
        }}
      />
    )

    expect(screen.getByAltText('汇总截图预览')).toHaveAttribute('src', '/api/artifacts/summary.png')
    fireEvent.click(screen.getByRole('button', { name: '原始截图' }))
    expect(screen.getByAltText('原始截图预览')).toHaveAttribute('src', '/api/artifacts/raw.png')
    expect(screen.getByRole('button', { name: '复制 5 项数据' })).toBeInTheDocument()
  })

  test('result panel renders retry login action for login-required error', () => {
    const onRetryLogin = vi.fn()
    render(
      <ResultPanel
        loading={false}
        result={null}
        activeAccount={{ accountId: '1001', nickname: '测试账号' }}
        onRetryLogin={onRetryLogin}
        error={{
          code: 'ACCOUNT_LOGIN_REQUIRED',
          message: '当前账号登录态已失效，请重新扫码登录',
          details: null
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '重新扫码登录' }))
    expect(onRetryLogin).toHaveBeenCalled()
  })
})
