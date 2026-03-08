const { ensureDir } = require('../lib/files')

async function takePageScreenshot(page, filePath) {
  ensureDir(require('path').dirname(filePath))
  await page.screenshot({ path: filePath, fullPage: true, timeout: 30000 })
}

async function createSummaryStripScreenshot(context, apiRecord, results, filePath) {
  ensureDir(require('path').dirname(filePath))
  const page = await context.newPage()
  try {
    await page.setViewportSize({ width: 2050, height: 290 })
    await page.setContent(buildSummaryStripHtml(apiRecord, results), { waitUntil: 'domcontentloaded' })
    await page.evaluate(async () => {
      const images = Array.from(document.images || [])
      await Promise.all(images.map((img) => {
        if (img.complete) return Promise.resolve()
        return new Promise((resolve) => {
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
          setTimeout(done, 3000)
        })
      }))
    })
    await page.locator('.summary-strip').screenshot({ path: filePath, timeout: 30000 })
  } finally {
    await page.close().catch(() => {})
  }
}

function buildSummaryStripHtml(apiRecord, results) {
  const content = apiRecord?.contentInfo?.content || {}
  const items = apiRecord?.contentInfo?.items || apiRecord?.items || []
  const firstItem = items[0] || {}
  const coverUrl = escapeHtml(content.coverUrl || '')
  const itemPic = escapeHtml(firstItem.itemPic || '')
  const title = escapeHtml(content.title || '-')
  const contentId = escapeHtml(String(apiRecord?.contentId?.absolute || content.id || '-'))
  const releaseTime = escapeHtml(formatReleaseTime(content.releaseTime))
  const diagnosis = escapeHtml(`${apiRecord?.scoreInfo?.score || '-'}分`)
  const extraTraffic = Number(apiRecord?.scoreInfo?.consumeUvAdd || 0)
  const extraTrafficText = extraTraffic > 0 ? `预估额外流量：${formatNumber(extraTraffic)}` : ''

  const cells = [
    { label: '内容查看次数', value: formatMetricValue('内容查看次数', results) },
    { label: '内容查看人数', value: formatMetricValue('内容查看人数', results) },
    { label: '种草成交金额', value: formatMetricValue('种草成交金额', results, { currency: true }) },
    { label: '种草成交人数', value: formatMetricValue('种草成交人数', results) },
    { label: '商品点击次数', value: formatMetricValue('商品点击次数', results) }
  ]

  const metricColumns = cells.map((cell) => `
    <div class="metric-col">
      <div class="value">${escapeHtml(cell.value)}</div>
      ${cell.label === '内容查看次数' && extraTrafficText ? `<div class="subtag">🔥 ${escapeHtml(extraTrafficText)}</div>` : '<div class="subtag placeholder"></div>'}
    </div>
  `).join('')

  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        body { margin: 0; background: #fff; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; }
        .summary-strip { width: 2048px; border: 1px solid #ececec; background: #fff; }
        .header-row, .data-row { display: grid; grid-template-columns: 470px 220px 270px 270px 270px 220px 170px 126px; }
        .header-row { background: #f5f5f7; color: #222; font-size: 18px; font-weight: 600; border-bottom: 1px solid #e8e8e8; }
        .header-row > div { padding: 14px 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .data-row > div { padding: 18px; min-height: 170px; border-right: 1px solid #f0f0f0; }
        .data-row > div:last-child, .header-row > div:last-child { border-right: none; }
        .content-info { display: flex; gap: 14px; align-items: flex-start; }
        .cover { width: 96px; height: 120px; border-radius: 14px; object-fit: cover; background: #f2f2f2; }
        .meta { flex: 1; min-width: 0; }
        .title { font-size: 20px; line-height: 1.4; color: #222; font-weight: 600; margin-bottom: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sub { color: #777; font-size: 14px; line-height: 1.8; }
        .item-box { margin-top: 12px; border: 1px solid #ececec; border-radius: 12px; height: 50px; display: flex; align-items: center; justify-content: space-between; padding: 0 10px 0 14px; max-width: 300px; }
        .item-thumb { width: 36px; height: 36px; border-radius: 8px; object-fit: cover; background: #f2f2f2; }
        .diagnosis-col { display: flex; flex-direction: column; justify-content: center; gap: 10px; }
        .diagnosis-title { font-size: 16px; color: #444; }
        .diagnosis-score { font-size: 38px; line-height: 1; font-weight: 700; color: #222; }
        .metric-col { display: flex; flex-direction: column; justify-content: center; gap: 14px; }
        .metric-col .value { font-size: 40px; line-height: 1.1; color: #222; font-weight: 500; letter-spacing: 0.3px; }
        .metric-col .subtag { display: inline-flex; align-items: center; width: fit-content; font-size: 16px; color: #ff5a3d; background: #fff2ef; border-radius: 8px; padding: 8px 10px; }
        .metric-col .placeholder { visibility: hidden; }
        .action-col { display: flex; flex-direction: column; justify-content: center; gap: 18px; }
        .action-main { color: #3b82f6; font-size: 16px; font-weight: 600; }
        .action-sub { color: #bbb; font-size: 15px; }
      </style>
    </head>
    <body>
      <div class="summary-strip">
        <div class="header-row">
          <div>内容信息</div>
          <div>内容诊断</div>
          <div>内容查看次数</div>
          <div>内容查看人数</div>
          <div>种草成交金额</div>
          <div>种草成交人数</div>
          <div>商品点击次数</div>
          <div>操作</div>
        </div>
        <div class="data-row">
          <div>
            <div class="content-info">
              <img class="cover" src="${coverUrl}" />
              <div class="meta">
                <div class="title">${title}</div>
                <div class="sub">ID ${contentId}</div>
                <div class="sub">${releaseTime}</div>
                <div class="item-box">
                  <div class="sub" style="font-size: 16px; color: #666;">共${items.length || 0}个商品</div>
                  <img class="item-thumb" src="${itemPic}" />
                </div>
              </div>
            </div>
          </div>
          <div class="diagnosis-col">
            <div class="diagnosis-title">内容总分</div>
            <div class="diagnosis-score">${diagnosis}</div>
          </div>
          ${metricColumns}
          <div class="action-col">
            <div class="action-main">已采集</div>
            <div class="action-sub">接口结果</div>
          </div>
        </div>
      </div>
    </body>
  </html>`
}

function formatMetricValue(metric, results, options = {}) {
  const value = results?.[metric]?.value
  if (value === null || value === undefined || value === '') return '-'
  const numeric = Number(String(value).replace(/,/g, ''))
  if (!Number.isNaN(numeric)) {
    if (options.currency) {
      return `¥ ${numeric.toLocaleString('en-US', {
        minimumFractionDigits: numeric % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2
      })}`
    }
    return numeric.toLocaleString('en-US', { maximumFractionDigits: 2 })
  }
  return String(value)
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-US')
}

function formatReleaseTime(timestamp) {
  if (!timestamp) return '-'
  const date = new Date(Number(timestamp))
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

module.exports = {
  takePageScreenshot,
  createSummaryStripScreenshot,
  buildSummaryStripHtml,
  formatMetricValue,
  formatReleaseTime
}
