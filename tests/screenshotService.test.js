import { describe, expect, test } from 'vitest'

const { buildSummaryStripHtml } = require('../server/services/screenshotService')

describe('screenshotService', () => {
  test('buildSummaryStripHtml renders title and metrics', () => {
    const html = buildSummaryStripHtml(
      {
        contentId: { absolute: '554608495125' },
        scoreInfo: { score: 85, consumeUvAdd: 100 },
        contentInfo: {
          content: {
            id: '554608495125',
            title: '测试内容',
            coverUrl: 'https://img.example.com/cover.png',
            releaseTime: 1710000000000
          },
          items: [{ itemPic: 'https://img.example.com/item.png' }]
        }
      },
      {
        内容查看次数: { value: '83611' },
        内容查看人数: { value: '18033' },
        种草成交金额: { value: '155.13' },
        种草成交人数: { value: '1' },
        商品点击次数: { value: '3' }
      }
    )

    expect(html).toContain('测试内容')
    expect(html).toContain('ID 554608495125')
    expect(html).toContain('¥ 155.13')
    expect(html).toContain('83,611')
    expect(html).toContain('预估额外流量：100')
  })
})
