import { describe, expect, test } from 'vitest'
import { parseTaskBatchInput } from '../web/src/lib/taskBatch'

describe('task batch parser', () => {
  test('parses comma and tab separated lines', () => {
    const result = parseTaskBatchInput('达人A,554608495125\n达人B\t537029503554')

    expect(result.errors).toEqual([])
    expect(result.tasks).toEqual([
      { remark: '达人A', contentId: '554608495125' },
      { remark: '达人B', contentId: '537029503554' }
    ])
  })

  test('returns row errors for invalid lines', () => {
    const result = parseTaskBatchInput('达人A,abc\n缺少分隔符\n\n')

    expect(result.tasks).toEqual([])
    expect(result.errors).toEqual([
      { line: 1, message: '内容 ID 只能包含数字' },
      { line: 2, message: '请按“备注,内容ID”或“备注<TAB>内容ID”填写' }
    ])
  })
})
