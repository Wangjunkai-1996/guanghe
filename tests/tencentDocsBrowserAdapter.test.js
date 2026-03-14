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
      fill: vi.fn(async () => {}),
      evaluate: vi.fn(async () => true),
      inputValue: vi.fn(async () => 'K52')
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
      evaluate: vi.fn(async (callback) => {
        const source = String(callback || '')
        if (source.includes('navigator.clipboard.readText')) {
          return ''
        }
        return { x: 10, y: 20, w: 30, h: 40 }
      })
    }

    await __private.focusCell(page, { sheetRow: 52, columnIndex: 11, platform: 'darwin' })

    expect(input.click).toHaveBeenCalled()
    expect(keyboardType).toHaveBeenCalledWith('K52')
    expect(mouseClick).toHaveBeenCalledTimes(1)
  })

  test('orderImageCellsForWrite writes summary image before eye image', () => {
    const ordered = __private.orderImageCellsForWrite([
      { columnName: '前端小眼睛截图', columnIndex: 8 },
      { columnName: '查看次数截图', columnIndex: 10 }
    ])

    expect(ordered.map((cell) => cell.columnName)).toEqual(['查看次数截图', '前端小眼睛截图'])
  })

  test('resolveImageWritePolicy keeps both screenshot columns best-effort', () => {
    expect(__private.resolveImageWritePolicy('查看次数截图')).toMatchObject({
      requireCellImage: false,
      verifyConversion: false
    })

    expect(__private.resolveImageWritePolicy('前端小眼睛截图')).toMatchObject({
      requireCellImage: false,
      verifyConversion: false
    })
  })

  test('pickBestFloatingImageCandidate prefers the image centered in the active cell', () => {
    const selectionBounds = { x: 300, y: 200, w: 120, h: 56 }
    const picked = __private.pickBestFloatingImageCandidate(selectionBounds, [
      { x: 180, y: 120, w: 220, h: 110, area: 24200 },
      { x: 312, y: 210, w: 102, h: 44, area: 4488 }
    ])

    expect(picked).toMatchObject({ x: 312, y: 210, w: 102, h: 44 })
  })

  test('looksLikeFloatingImage tolerates small in-cell overflow', () => {
    expect(__private.looksLikeFloatingImage(
      { x: 102, y: 104, w: 115, h: 30 },
      { x: 100, y: 100, w: 100, h: 24 }
    )).toBe(false)

    expect(__private.looksLikeFloatingImage(
      { x: 80, y: 70, w: 160, h: 80 },
      { x: 100, y: 100, w: 100, h: 24 }
    )).toBe(true)
  })

  test('clipboardRowMatches compares contiguous values exactly', () => {
    expect(__private.parseClipboardRowValues('1183\t439\t0\t0\t25')).toEqual(['1183', '439', '0', '0', '25'])
    expect(__private.clipboardRowMatches(['1183', '439'], ['1183', '439'])).toBe(true)
    expect(__private.clipboardRowMatches(['1183', '440'], ['1183', '439'])).toBe(false)
  })

  test('hasWritableCellValue skips blanks but keeps zero-like values', () => {
    expect(__private.hasWritableCellValue('')).toBe(false)
    expect(__private.hasWritableCellValue('   ')).toBe(false)
    expect(__private.hasWritableCellValue(null)).toBe(false)
    expect(__private.hasWritableCellValue(undefined)).toBe(false)
    expect(__private.hasWritableCellValue('0')).toBe(true)
    expect(__private.hasWritableCellValue(0)).toBe(true)
    expect(__private.hasWritableCellValue('-')).toBe(true)
  })


  test('resolveImageWritePolicy keeps eye screenshot conversion conservative', () => {
    expect(__private.resolveImageWritePolicy('前端小眼睛截图')).toMatchObject({
      requireCellImage: false,
      verifyConversion: false,
      maxConvertAttempts: 1,
      requireImageBounds: true,
      useSelectionFallbackTargets: false
    })
  })

  test('hasDangerousMenuLabels blocks column operations during image convert', () => {
    expect(__private.hasDangerousMenuLabels(['向右插入 1 列', '删除行'])).toBe(true)
    expect(__private.hasDangerousMenuLabels(['取消隐藏列'])).toBe(true)
    expect(__private.hasDangerousMenuLabels(['转为单元格图片', '复制'])).toBe(false)
  })

  test('buildImageConversionTargets can disable selection fallback clicks', () => {
    expect(__private.buildImageConversionTargets({ x: 10, y: 10, w: 100, h: 40 }, null, {
      includeSelectionFallback: false
    })).toEqual([])

    expect(__private.buildImageConversionTargets({ x: 10, y: 10, w: 100, h: 40 }, null).length).toBeGreaterThan(0)
  })

  test('shouldContinueBatchScan stops when the first batch is shorter than the window size', () => {
    expect(__private.shouldContinueBatchScan(Array.from({ length: 198 }, () => ({})), 200)).toBe(false)
    expect(__private.shouldContinueBatchScan(Array.from({ length: 200 }, () => ({})), 200)).toBe(true)
  })


})
