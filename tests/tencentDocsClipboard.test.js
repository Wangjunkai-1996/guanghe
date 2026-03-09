import { describe, expect, test } from 'vitest'

const { parseClipboardTable } = require('../server/integrations/tencentDocs/sheetClipboard')

describe('tencent docs clipboard parser', () => {
  test('merges wrapped header rows and maps data cells by normalized header', () => {
    const rawTsv = [
      '逛逛昵称\t逛逛ID\t内容id\t主页链接\t粉丝数 (w)\t发布长链接\t主页类型\t前端小眼睛截图\t小眼睛数\t查看次数截图\t查看次数\t查看人数\t种草成交金额\t种草成交人数\t商品点击次数\t点赞数\t收藏数\t评论数\t互动量',
      '合计点赞收藏评论\t发布文章互动数据截图',
      '是书瑶的麻麻呀\t331427156\t547982656829\thttps://example.com/home\t15\thttps://example.com/content\t母婴\t\t56200\t\t35,750\t10,951\t¥255\t2\t4,554\t412\t0\t4\t416\t',
      '冯小宇\t136279453\t547694154289\thttps://example.com/home2\t14.8\thttps://example.com/content2\t母婴\t\t28400\t\t9,082\t2,644\t¥210\t2\t1,185\t313\t11\t12\t336\t'
    ].join('\n')

    const result = parseClipboardTable(rawTsv)

    expect(result.columnCount).toBe(20)
    expect(result.headers.slice(0, 15)).toEqual([
      '逛逛昵称',
      '逛逛ID',
      '内容id',
      '主页链接',
      '粉丝数 (w)',
      '发布长链接',
      '主页类型',
      '前端小眼睛截图',
      '小眼睛数',
      '查看次数截图',
      '查看次数',
      '查看人数',
      '种草成交金额',
      '种草成交人数',
      '商品点击次数'
    ])
    expect(result.headers[18]).toBe('互动量 合计点赞收藏评论')
    expect(result.headers[19]).toBe('发布文章互动数据截图')
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].sheetRow).toBe(2)
    expect(result.rows[0].nickname).toBe('是书瑶的麻麻呀')
    expect(result.rows[0].contentId).toBe('547982656829')
    expect(result.rows[0].cells.查看次数).toBe('35,750')
    expect(result.rows[1].cells['种草成交金额']).toBe('¥210')
  })

  test('repairs first header when clipboard starts from an active cell value', () => {
    const rawTsv = [
      '547982656829	逛逛ID	内容id	主页链接',
      '是书瑶的麻麻呀	331427156	547982656829	https://example.com/home'
    ].join('\n')

    const result = parseClipboardTable(rawTsv)

    expect(result.headers[0]).toBe('逛逛昵称')
    expect(result.rows[0].nickname).toBe('是书瑶的麻麻呀')
    expect(result.rows[0].contentId).toBe('547982656829')
  })

})
