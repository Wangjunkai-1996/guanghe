// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LoginForm } from '../web/src/components/LoginForm'
import { QueryForm } from '../web/src/components/QueryForm'
import { LoginSessionPanel } from '../web/src/components/LoginSessionPanel'
import { ResultPanel } from '../web/src/components/ResultPanel'

afterEach(() => {
  cleanup()
})

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
    const view = render(
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

    expect(view.getAllByText('二维码已过期').length).toBeGreaterThan(0)
    expect(view.getByRole('button', { name: '刷新二维码' })).toBeInTheDocument()
  })

  test('login drawer submits sms verification code', async () => {
    const onSubmitSmsCode = vi.fn().mockResolvedValue(undefined)
    const view = render(
      <LoginSessionPanel
        loginSession={{
          loginSessionId: 'session-sms',
          status: 'WAITING_SMS',
          qrImageUrl: null,
          error: null,
          account: null
        }}
        qrCodeDataUrl=""
        isOpen
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        onSubmitSmsCode={onSubmitSmsCode}
      />
    )

    const input = view.getByPlaceholderText('请输入短信验证码')
    fireEvent.change(input, { target: { value: ' 123456 ' } })
    fireEvent.click(view.getByRole('button', { name: '提交验证码' }))

    expect(onSubmitSmsCode).toHaveBeenCalledWith('123456')
  })

  test('login drawer closes on escape', () => {
    const onClose = vi.fn()
    render(
      <LoginSessionPanel
        loginSession={{
          loginSessionId: 'session-2',
          status: 'WAITING_QR',
          qrImageUrl: null,
          error: null,
          account: null
        }}
        qrCodeDataUrl=""
        isOpen
        onClose={onClose}
        onRefresh={vi.fn()}
        onSubmitSmsCode={vi.fn()}
      />
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
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
    fireEvent.click(screen.getByRole('tab', { name: '作品管理截图' }))
    expect(screen.getByAltText('原始截图预览')).toHaveAttribute('src', '/api/artifacts/raw.png')
    expect(screen.getByRole('button', { name: '复制全部数据' })).toBeInTheDocument()
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
