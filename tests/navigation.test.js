import { describe, expect, test, vi } from 'vitest'

const { gotoWithFallback, resolveGotoTimeoutMs } = require('../server/lib/navigation')

describe('navigation helpers', () => {
  test('uses resolved timeout and settle delay on successful navigation', async () => {
    const page = {
      goto: vi.fn(async () => {}),
      waitForTimeout: vi.fn(async () => {}),
      url: vi.fn(() => 'https://docs.qq.com/sheet/test')
    }

    await gotoWithFallback(page, 'https://docs.qq.com/sheet/test', { settleMs: 1500, timeoutMs: 45000 })

    expect(page.goto).toHaveBeenCalledWith('https://docs.qq.com/sheet/test', {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    })
    expect(page.waitForTimeout).toHaveBeenCalledWith(1500)
  })

  test('tolerates navigation timeout when caller confirms page is usable', async () => {
    const timeoutError = new Error('page.goto: Timeout 30000ms exceeded.')
    const page = {
      goto: vi.fn(async () => { throw timeoutError }),
      waitForTimeout: vi.fn(async () => {}),
      url: vi.fn(() => 'https://docs.qq.com/sheet/test')
    }

    await gotoWithFallback(page, 'https://docs.qq.com/sheet/test', {
      canTreatTimeoutAsSuccess: async (currentPage) => currentPage.url().startsWith('https://docs.qq.com/')
    })

    expect(page.goto).toHaveBeenCalledOnce()
  })

  test('rethrows navigation timeout when page is still unusable', async () => {
    const timeoutError = new Error('page.goto: Timeout 30000ms exceeded.')
    const page = {
      goto: vi.fn(async () => { throw timeoutError }),
      waitForTimeout: vi.fn(async () => {}),
      url: vi.fn(() => 'about:blank')
    }

    await expect(gotoWithFallback(page, 'https://docs.qq.com/sheet/test', {
      canTreatTimeoutAsSuccess: async () => false
    })).rejects.toThrow(timeoutError)
  })

  test('falls back to default timeout when env is invalid', () => {
    expect(resolveGotoTimeoutMs('abc')).toBe(60000)
    expect(resolveGotoTimeoutMs('45000')).toBe(45000)
  })
})
