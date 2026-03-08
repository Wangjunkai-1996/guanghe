import { describe, expect, test } from 'vitest'

const {
  parseQrGenerateResponse,
  findApiRecord,
  extractMetricFromApiRecord
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
})
