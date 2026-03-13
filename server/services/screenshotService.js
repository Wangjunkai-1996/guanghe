const fs = require('fs')
const path = require('path')
const { ensureDir } = require('../lib/files')

const SUMMARY_STRIP_VIEWPORT = { width: 2050, height: 290 }
const CELL_CARD_VIEWPORT = { width: 760, height: 240 }
const CELL_CARD_HEIGHT = 168
const CELL_CARD_MIN_WIDTH = 460
const CELL_CARD_MAX_WIDTH = 620
const CELL_CARD_PADDING_X = 24
const CELL_CARD_PADDING_Y = 16
const CELL_CARD_BACKGROUND_TOLERANCE = 18

async function takePageScreenshot(page, filePath) {
  ensureDir(path.dirname(filePath))
  await page.screenshot({ path: filePath, fullPage: true, timeout: 30000 })
}

async function takeElementScreenshot(page, rect, filePath) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return
  ensureDir(path.dirname(filePath))
  const padding = 10
  await page.screenshot({
    path: filePath,
    clip: {
      x: Math.max(0, rect.x - padding),
      y: Math.max(0, rect.y - padding),
      width: rect.width + padding * 2,
      height: rect.height + padding * 2
    }
  })
}

async function createSummaryStripScreenshot(context, apiRecord, results, filePath) {
  ensureDir(path.dirname(filePath))
  const detachedContext = await createSummaryStripRenderContext(context, SUMMARY_STRIP_VIEWPORT)
  const renderContext = detachedContext || context
  const page = await renderContext.newPage()
  try {
    await page.setViewportSize(SUMMARY_STRIP_VIEWPORT)
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
    if (detachedContext) {
      await detachedContext.close().catch(() => {})
    }
  }
}

async function createCellFriendlyCardScreenshot(context, sourceFilePath, filePath) {
  if (!sourceFilePath || !fs.existsSync(sourceFilePath)) return false

  ensureDir(path.dirname(filePath))
  const detachedContext = await createSummaryStripRenderContext(context, CELL_CARD_VIEWPORT)
  const renderContext = detachedContext || context
  const page = await renderContext.newPage()

  try {
    await page.setViewportSize(CELL_CARD_VIEWPORT)
    const imageDataUrl = `data:image/png;base64,${fs.readFileSync(sourceFilePath).toString('base64')}`
    await page.setContent(buildCellFriendlyCardHtml(imageDataUrl), { waitUntil: 'domcontentloaded' })
    await renderCellFriendlyCard(page)
    await page.locator('#cell-card-output').screenshot({ path: filePath, timeout: 30000 })
    return true
  } finally {
    await page.close().catch(() => {})
    if (detachedContext) {
      await detachedContext.close().catch(() => {})
    }
  }
}

async function renderCellFriendlyCard(page) {
  await page.evaluate(async ({
    targetHeight,
    minWidth,
    maxWidth,
    paddingX,
    paddingY,
    backgroundTolerance
  }) => {
    const image = document.getElementById('source-card')
    const canvas = document.getElementById('cell-card-output')
    if (!image || !canvas) {
      throw new Error('cell_card_render_target_missing')
    }

    if (!image.complete) {
      await new Promise((resolve, reject) => {
        const done = () => resolve()
        image.addEventListener('load', done, { once: true })
        image.addEventListener('error', () => reject(new Error('cell_card_load_failed')), { once: true })
        setTimeout(done, 3000)
      })
    }

    const scratch = document.createElement('canvas')
    scratch.width = image.naturalWidth || image.width
    scratch.height = image.naturalHeight || image.height
    const scratchContext = scratch.getContext('2d', { willReadFrequently: true })
    scratchContext.drawImage(image, 0, 0)

    const { data, width, height } = scratchContext.getImageData(0, 0, scratch.width, scratch.height)
    const samplePoints = [
      [0, 0],
      [Math.max(width - 1, 0), 0],
      [0, Math.max(height - 1, 0)],
      [Math.max(width - 1, 0), Math.max(height - 1, 0)],
      [Math.floor(width / 2), 0],
      [Math.floor(width / 2), Math.max(height - 1, 0)]
    ]
    const backgroundSamples = samplePoints.map(([x, y]) => {
      const offset = (y * width + x) * 4
      return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]
    })

    const isBackgroundPixel = (offset) => {
      const alpha = data[offset + 3]
      if (alpha < 10) return true
      return backgroundSamples.some((sample) => {
        return Math.abs(data[offset] - sample[0])
          + Math.abs(data[offset + 1] - sample[1])
          + Math.abs(data[offset + 2] - sample[2]) <= backgroundTolerance * 3
      })
    }

    let left = width
    let right = -1
    let top = height
    let bottom = -1

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        if (isBackgroundPixel(offset)) continue
        if (x < left) left = x
        if (x > right) right = x
        if (y < top) top = y
        if (y > bottom) bottom = y
      }
    }

    if (right < left || bottom < top) {
      left = 0
      top = 0
      right = Math.max(width - 1, 0)
      bottom = Math.max(height - 1, 0)
    }

    left = Math.max(0, left - 1)
    top = Math.max(0, top - 1)
    right = Math.min(width - 1, right + 1)
    bottom = Math.min(height - 1, bottom + 1)

    const cropWidth = Math.max(1, right - left + 1)
    const cropHeight = Math.max(1, bottom - top + 1)
    const availableHeight = Math.max(1, targetHeight - paddingY * 2)
    const naturalScale = availableHeight / cropHeight
    const naturalWidth = Math.round(cropWidth * naturalScale)
    const targetWidth = Math.max(minWidth, Math.min(maxWidth, naturalWidth + paddingX * 2))
    const availableWidth = Math.max(1, targetWidth - paddingX * 2)
    const scale = Math.min(availableHeight / cropHeight, availableWidth / cropWidth)
    const drawWidth = Math.max(1, Math.round(cropWidth * scale))
    const drawHeight = Math.max(1, Math.round(cropHeight * scale))
    const drawY = Math.round((targetHeight - drawHeight) / 2)

    canvas.width = targetWidth
    canvas.height = targetHeight

    const outputContext = canvas.getContext('2d')
    outputContext.imageSmoothingEnabled = true
    outputContext.fillStyle = '#ffffff'
    outputContext.fillRect(0, 0, targetWidth, targetHeight)
    outputContext.drawImage(
      scratch,
      left,
      top,
      cropWidth,
      cropHeight,
      paddingX,
      drawY,
      drawWidth,
      drawHeight
    )
  }, {
    targetHeight: CELL_CARD_HEIGHT,
    minWidth: CELL_CARD_MIN_WIDTH,
    maxWidth: CELL_CARD_MAX_WIDTH,
    paddingX: CELL_CARD_PADDING_X,
    paddingY: CELL_CARD_PADDING_Y,
    backgroundTolerance: CELL_CARD_BACKGROUND_TOLERANCE
  })
}

async function createSummaryStripRenderContext(context, viewport = SUMMARY_STRIP_VIEWPORT) {
  const browser = typeof context?.browser === 'function' ? context.browser() : null
  if (!browser || typeof browser.newContext !== 'function') {
    return null
  }

  return browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'zh-CN'
  }).catch(() => null)
}

function buildCellFriendlyCardHtml(imageDataUrl = '') {
  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        html, body { margin: 0; padding: 0; background: #fff; }
        body { width: ${CELL_CARD_VIEWPORT.width}px; height: ${CELL_CARD_VIEWPORT.height}px; display: flex; align-items: flex-start; justify-content: flex-start; }
        #source-card { position: absolute; left: -99999px; top: -99999px; width: auto; height: auto; }
        #cell-card-output { display: block; background: #fff; }
      </style>
    </head>
    <body>
      <img id="source-card" src="${escapeHtml(imageDataUrl)}" alt="source" />
      <canvas id="cell-card-output" width="${CELL_CARD_MIN_WIDTH}" height="${CELL_CARD_HEIGHT}"></canvas>
    </body>
  </html>`
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
  const diagnosisScore = escapeHtml(formatDiagnosisScore(apiRecord?.scoreInfo?.score))
  const extraTraffic = Number(apiRecord?.scoreInfo?.consumeUvAdd || 0)
  const extraTrafficText = extraTraffic > 0 ? `预估额外流量：${formatNumber(extraTraffic)}` : ''
  const headerCells = [
    { label: '内容信息', sortable: false },
    { label: '内容诊断', sortable: false },
    { label: '内容查看次数', sortable: true },
    { label: '内容查看人数', sortable: true },
    { label: '种草成交金额', sortable: true },
    { label: '种草成交人数', sortable: true },
    { label: '商品点击次数', sortable: true },
    { label: '操作', sortable: false }
  ]

  const cells = [
    { label: '内容查看次数', value: formatMetricValue('内容查看次数', results) },
    { label: '内容查看人数', value: formatMetricValue('内容查看人数', results) },
    { label: '种草成交金额', value: formatMetricValue('种草成交金额', results, { currency: true }), compact: true },
    { label: '种草成交人数', value: formatMetricValue('种草成交人数', results) },
    { label: '商品点击次数', value: formatMetricValue('商品点击次数', results) }
  ]

  const headerColumns = headerCells.map((cell) => `
    <div>
      <span class="header-title">${cell.label}${cell.sortable ? '<span class="sort-icons">⇵</span>' : ''}</span>
    </div>
  `).join('')

  const metricColumns = cells.map((cell) => `
    <div class="metric-col ${cell.compact ? 'compact' : ''}">
      <div class="value">${escapeHtml(cell.value)}</div>
      ${cell.label === '内容查看次数' && extraTrafficText
        ? `<div class="subtag">${escapeHtml(extraTrafficText)}</div>`
        : '<div class="subtag placeholder"></div>'}
    </div>
  `).join('')

  return `<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="utf-8" />
      <style>
        html, body { margin: 0; padding: 0; background: #fff; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif; color: #222; }
        .summary-strip { width: 2048px; border: 1px solid #ebedf0; background: #fff; }
        .header-row, .data-row { display: grid; grid-template-columns: 468px 214px 246px 246px 250px 216px 189px 187px; }
        .header-row { background: #f4f5f7; color: #353941; font-size: 13px; font-weight: 500; border-bottom: 1px solid #eaedf0; }
        .header-row > div { padding: 11px 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .header-title { display: inline-flex; align-items: center; gap: 4px; }
        .sort-icons { color: #aeb4bc; font-size: 11px; line-height: 1; transform: translateY(-0.5px); }
        .data-row > div { padding: 13px 14px; min-height: 106px; border-right: 1px solid #eff1f3; }
        .data-row > div:last-child, .header-row > div:last-child { border-right: none; }
        .content-info { display: flex; gap: 10px; align-items: flex-start; }
        .cover { width: 84px; height: 104px; border-radius: 8px; object-fit: cover; background: #f2f2f2; }
        .meta { flex: 1; min-width: 0; padding-top: 2px; }
        .title { font-size: 15px; line-height: 1.3; color: #24292f; font-weight: 500; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sub { color: #8a9099; font-size: 12px; line-height: 1.6; }
        .item-box { margin-top: 8px; border: 1px solid #ebedf0; border-radius: 8px; height: 34px; display: flex; align-items: center; justify-content: space-between; padding: 0 8px 0 10px; max-width: 158px; background: #fff; }
        .item-box-label { font-size: 12px; color: #666d76; }
        .item-thumb { width: 24px; height: 24px; border-radius: 6px; object-fit: cover; background: #f2f2f2; }
        .diagnosis-col { display: flex; align-items: center; }
        .diagnosis-line { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; color: #4a4f57; white-space: nowrap; }
        .diagnosis-value { font-weight: 500; color: #2b3138; }
        .diagnosis-info { color: #aeb4bc; font-size: 12px; }
        .metric-col { display: flex; flex-direction: column; justify-content: center; align-items: flex-start; gap: 7px; }
        .metric-col .value { font-size: 22px; line-height: 1.15; color: #24292f; font-weight: 500; letter-spacing: 0; }
        .metric-col.compact .value { font-size: 20px; }
        .metric-col .subtag { display: inline-flex; align-items: center; width: fit-content; font-size: 12px; line-height: 1.3; color: #ff6b43; background: #fff6f2; border-radius: 6px; padding: 3px 7px; }
        .metric-col .placeholder { visibility: hidden; }
        .action-col { display: flex; flex-direction: column; justify-content: center; gap: 12px; }
        .action-main { color: #3b78f0; font-size: 13px; font-weight: 500; }
        .action-sub { color: #c2c7cf; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="summary-strip">
        <div class="header-row">
          ${headerColumns}
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
                  <div class="item-box-label">共1个商品</div>
                  <img class="item-thumb" src="${itemPic}" />
                </div>
              </div>
            </div>
          </div>
          <div class="diagnosis-col">
            <div class="diagnosis-line">内容总分：<span class="diagnosis-value">${diagnosisScore}</span><span class="diagnosis-info">ⓘ</span></div>
          </div>
          ${metricColumns}
          <div class="action-col">
            <div class="action-main">查看详情</div>
            <div class="action-sub">光子加速</div>
          </div>
        </div>
      </div>
    </body>
  </html>`
}

function formatDiagnosisScore(value) {
  if (value === null || value === undefined || value === '') return '-'
  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    return numeric.toFixed(1)
  }
  return String(value)
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
  takeElementScreenshot,
  createSummaryStripScreenshot,
  createCellFriendlyCardScreenshot,
  buildSummaryStripHtml,
  buildCellFriendlyCardHtml,
  formatMetricValue,
  formatReleaseTime
}
