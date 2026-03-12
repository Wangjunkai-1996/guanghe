import { describe, expect, test, vi } from 'vitest'

const { __private } = require('../server/integrations/tencentDocs/browserAdapter')

describe('tencent docs browser adapter helpers', () => {
  test('focusCell refocuses primary selection after jumping to cell reference', async () => {
    const mouseClick = vi.fn(async () => {})
    const waitForTimeout = vi.fn(async () => {})
    const keyboardPress = vi.fn(async () => {})
    const keyboardType = vi.fn(async () => {})
    const input = {
      isVisible: vi.fn(async () => true),
      click: vi.fn(async () => {}),
      fill: vi.fn(async () => {})
    }
    const context = {
      grantPermissions: vi.fn(async () => {})
    }
    const page = {
      locator: vi.fn(() => ({ first: () => input })),
      keyboard: { press: keyboardPress, type: keyboardType },
      mouse: { click: mouseClick },
      context: () => context,
      waitForTimeout,
      evaluate: vi.fn(async () => ({ x: 10, y: 20, w: 30, h: 40 }))
    }

    await __private.focusCell(page, { sheetRow: 52, columnIndex: 11, platform: 'darwin' })

    expect(input.click).toHaveBeenCalled()
    expect(keyboardType).toHaveBeenCalledWith('K52')
    expect(mouseClick).toHaveBeenCalledTimes(1)
  })

  test('clipboardRowMatches compares contiguous values exactly', () => {
    expect(__private.parseClipboardRowValues('1183\t439\t0\t0\t25')).toEqual(['1183', '439', '0', '0', '25'])
    expect(__private.clipboardRowMatches(['1183', '439'], ['1183', '439'])).toBe(true)
    expect(__private.clipboardRowMatches(['1183', '440'], ['1183', '439'])).toBe(false)
  })
})
