import { describe, expect, test } from 'vitest'

const { buildSummaryStripHtml, buildCellFriendlyCardHtml } = require('../server/services/screenshotService')

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
    expect(html).toContain('内容总分：')
    expect(html).toContain('85.0')
    expect(html).toContain('查看详情')
    expect(html).toContain('text-size-adjust: 100%')
    expect(html).toContain('font-size: 22px')
  })

  test('buildCellFriendlyCardHtml renders isolated canvas shell for card conversion', () => {
    const html = buildCellFriendlyCardHtml('data:image/png;base64,abc123')

    expect(html).toContain('cell-card-output')
    expect(html).toContain('source-card')
    expect(html).toContain('data:image/png;base64,abc123')
  })
})
