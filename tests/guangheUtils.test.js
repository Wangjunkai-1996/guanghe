import { describe, expect, test } from 'vitest'

const {
  parseQrGenerateResponse,
  findApiRecord,
  extractMetricFromApiRecord,
  selectPreferredInputDescriptor,
  hasRequiredAnalysisMetrics
} = require('../server/lib/guangheUtils')

describe('guangheUtils', () => {
  test('parseQrGenerateResponse extracts qr payload', () => {
    const payload = JSON.stringify({
      content: {
        data: {
          codeContent: 'https://qr.example.com/abc',
          ck: 'test-ck',
          resultCode: 'SUCCESS'
        }
      }
    })

    expect(parseQrGenerateResponse(payload)).toEqual({
      qrCodeUrl: 'https://qr.example.com/abc',
      ck: 'test-ck',
      resultCode: 'SUCCESS'
    })
  })

  test('findApiRecord matches target contentId from api log', () => {
    const networkLog = [
      {
        url: 'https://example.com/mock',
        text: 'callback({"data":{"model":{"result":[]}}})'
      },
      {
        url: 'https://creator.guanghe.taobao.com/api/kind.pagelist',
        text: 'mtopjsonp1({"data":{"model":{"result":[{"contentId":{"absolute":"554608495125"},"consumePv":{"absolute":"83611"},"consumeUv":{"absolute":"18033"}}]}}})'
      }
    ]

    expect(findApiRecord(networkLog, '554608495125')).toMatchObject({
      contentId: { absolute: '554608495125' },
      consumePv: { absolute: '83611' }
    })
  })

  test('extractMetricFromApiRecord maps metric field correctly', () => {
    const apiRecord = {
      payAmtZcLast: { absolute: '155.13' }
    }

    expect(extractMetricFromApiRecord('种草成交金额', apiRecord)).toEqual({
      field: 'payAmtZcLast',
      value: '155.13',
      source: 'API (payAmtZcLast)'
    })
  })

  test('selectPreferredInputDescriptor prefers content id field over product id field', () => {
    const selected = selectPreferredInputDescriptor([
      {
        index: 0,
        visible: true,
        type: 'text',
        placeholder: '',
        ariaLabel: '',
        name: '',
        title: '',
        contextText: '商品ID 553703325997'
      },
      {
        index: 1,
        visible: true,
        type: 'text',
        placeholder: '多个id,分隔',
        ariaLabel: '',
        name: '',
        title: '',
        contextText: '内容ID 多个id,分隔'
      }
    ], {
      targetKeywords: ['内容ID', '作品ID'],
      blockedKeywords: ['商品ID', '商品']
    })

    expect(selected).toMatchObject({
      index: 1
    })
  })

  test('hasRequiredAnalysisMetrics returns false when a required metric is missing', () => {
    expect(hasRequiredAnalysisMetrics({
      内容查看次数: { value: '83611' },
      内容查看人数: { value: '18033' },
      种草成交金额: { value: '155.13' },
      种草成交人数: { value: '1' }
    })).toBe(false)

    expect(hasRequiredAnalysisMetrics({
      内容查看次数: { value: '83611' },
      内容查看人数: { value: '18033' },
      种草成交金额: { value: '155.13' },
      种草成交人数: { value: '1' },
      商品点击次数: { value: '455' }
    })).toBe(true)
  })
})
