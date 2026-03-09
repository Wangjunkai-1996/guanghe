const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')
const { ensureDir, writeJson } = require('../../lib/files')
const { createTencentDocsError, ERROR_CODES } = require('./errors')
const { parseClipboardTable, normalizeHeaderCell } = require('./sheetClipboard')

class TencentDocsBrowserAdapter {
  constructor({ browserExecutablePath, profileDir, headless = true, platform = process.platform }) {
    this.browserExecutablePath = browserExecutablePath
    this.profileDir = profileDir
    this.headless = headless
    this.platform = platform
  }

  async writeRow({ target, mode, syncKey, row, columns, artifactDir }) {
    ensureDir(artifactDir)

    let context = null
    let page = null

    try {
      context = await this.launchContext()
      page = context.pages()[0] || await context.newPage()
      await openDocumentPage(page, target.docUrl)
      await page.screenshot({ path: path.join(artifactDir, 'before-write.png'), fullPage: true })

      await assertLoggedIn(page)
      await ensureSheetSelected(page, target.sheetName)
      await assertTemplateVisible(page, columns, this.platform)

      let writeSummary
      if (mode === 'upsert') {
        const found = await findExistingRow(page, syncKey, this.platform)
        writeSummary = found
          ? await overwriteCurrentRow(page, row, columns, this.platform)
          : await appendRow(page, row, columns, this.platform)
      } else {
        writeSummary = await appendRow(page, row, columns, this.platform)
      }

      await page.waitForTimeout(1000)
      await page.screenshot({ path: path.join(artifactDir, 'after-write.png'), fullPage: true })
      return {
        ...writeSummary,
        syncKey,
        sheetName: target.sheetName
      }
    } catch (error) {
      if (page) {
        await page.screenshot({ path: path.join(artifactDir, 'error.png'), fullPage: true }).catch(() => {})
      }
      throw error
    } finally {
      if (context) {
        await context.close().catch(() => {})
      }
    }
  }

  async readSheet({ target, maxRows = 20, artifactDir }) {
    ensureDir(artifactDir)

    let context = null
    let page = null

    try {
      context = await this.launchContext()
      page = context.pages()[0] || await context.newPage()
      await openDocumentPage(page, target.docUrl)
      await page.screenshot({ path: path.join(artifactDir, 'before-read.png'), fullPage: true })

      await assertLoggedIn(page)
      const selectedSheetName = await ensureSheetSelected(page, target.sheetName)
      const tabs = await readVisibleSheetTabs(page)
      const rawTsv = await readSheetSelection(page, {
        maxRows,
        platform: this.platform
      })
      const parsed = parseClipboardTable(rawTsv)
      if (parsed.headers.length === 0) {
        throw createTencentDocsError(500, ERROR_CODES.READ_FAILED, '未能从腾讯文档读取到表格内容')
      }

      const limitedRows = parsed.rows.slice(0, maxRows)
      const previewPayload = {
        target: {
          docUrl: target.docUrl,
          sheetName: selectedSheetName || target.sheetName || ''
        },
        maxRows,
        tabs,
        columnCount: parsed.columnCount,
        headers: parsed.headers,
        rowCount: limitedRows.length,
        rows: limitedRows
      }

      const rawTsvFile = path.join(artifactDir, 'sheet-selection.tsv')
      const parsedFile = path.join(artifactDir, 'sheet-preview.json')
      fs.writeFileSync(rawTsvFile, rawTsv, 'utf8')
      writeJson(parsedFile, previewPayload)

      await page.waitForTimeout(500)
      await page.screenshot({ path: path.join(artifactDir, 'after-read.png'), fullPage: true })

      return {
        ...previewPayload,
        artifacts: {
          beforeReadPath: path.join(artifactDir, 'before-read.png'),
          afterReadPath: path.join(artifactDir, 'after-read.png'),
          selectionTsvPath: rawTsvFile,
          previewJsonPath: parsedFile
        }
      }
    } catch (error) {
      if (page) {
        await page.screenshot({ path: path.join(artifactDir, 'error.png'), fullPage: true }).catch(() => {})
      }
      throw error
    } finally {
      if (context) {
        await context.close().catch(() => {})
      }
    }
  }

  async updateRowCells({ target, sheetRow, cells, artifactDir }) {
    ensureDir(artifactDir)

    let context = null
    let page = null

    try {
      context = await this.launchContext()
      page = context.pages()[0] || await context.newPage()
      await openDocumentPage(page, target.docUrl)
      await page.screenshot({ path: path.join(artifactDir, 'before-fill.png'), fullPage: true })

      await assertLoggedIn(page)
      await ensureSheetSelected(page, target.sheetName)

      const orderedCells = (cells || []).slice().sort((left, right) => left.columnIndex - right.columnIndex)
      const imageCells = orderedCells.filter((cell) => isImageCell(cell))
      const textCells = orderedCells.filter((cell) => !isImageCell(cell))

      for (const cell of imageCells) {
        if (!cell.value) continue
        await focusCell(page, {
          sheetRow,
          columnIndex: cell.columnIndex,
          platform: this.platform
        })
        await pasteImageIntoFocusedCell(page, cell.value, this.platform)
        await page.waitForTimeout(250)
      }

      for (const group of buildContiguousGroups(textCells)) {
        await focusCell(page, {
          sheetRow,
          columnIndex: group[0].columnIndex,
          platform: this.platform
        })
        await pasteTextIntoFocusedRange(page, group.map((cell) => String(cell.value ?? '')).join('	'), this.platform)
        await page.waitForTimeout(250)
      }

      await page.waitForTimeout(800)
      await page.screenshot({ path: path.join(artifactDir, 'after-fill.png'), fullPage: true })

      return {
        action: 'UPDATED',
        sheetRow,
        matchedBy: ['内容id'],
        columnsUpdated: orderedCells.map((cell) => cell.columnName),
        columnIndexes: orderedCells.map((cell) => cell.columnIndex)
      }
    } catch (error) {
      if (page) {
        await page.screenshot({ path: path.join(artifactDir, 'error.png'), fullPage: true }).catch(() => {})
      }
      throw error
    } finally {
      if (context) {
        await context.close().catch(() => {})
      }
    }
  }

  async launchContext() {
    ensureDir(this.profileDir)
    return chromium.launchPersistentContext(this.profileDir, {
      headless: this.headless,
      executablePath: this.browserExecutablePath,
      viewport: { width: 1728, height: 1117 },
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox'
      ]
    })
  }
}

async function openDocumentPage(page, docUrl) {
  await page.goto(docUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
}

async function assertLoggedIn(page) {
  const bodyText = await readBodyText(page)
  if (/login|signin/i.test(page.url()) || hasAnyText(bodyText, ['扫码登录', '微信登录', 'QQ登录', '登录后继续'])) {
    throw createTencentDocsError(401, ERROR_CODES.LOGIN_REQUIRED, '腾讯文档当前未登录，请先在持久化 profile 中完成登录')
  }
}

async function ensureSheetSelected(page, sheetName) {
  const tabs = await readVisibleSheetTabs(page)
  const selected = tabs.find((tab) => tab.selected)
  if (!sheetName) {
    return selected?.name || ''
  }

  const locator = page.getByRole('tab', { name: sheetName, exact: true }).first()
  const visible = await locator.isVisible().catch(() => false)
  if (!visible) {
    throw createTencentDocsError(400, ERROR_CODES.SHEET_NOT_FOUND, `未找到工作表：${sheetName}`)
  }

  await locator.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(800)
  return sheetName
}

async function assertTemplateVisible(page, columns, platform) {
  const parsed = await copySheetSelection(page, {
    maxRows: 1,
    platform
  })
  const normalizedHeaders = new Set(parsed.headers.map(normalizeHeaderCell))
  const missingColumns = getRequiredTemplateColumns(columns)
    .map(normalizeHeaderCell)
    .filter((column) => !normalizedHeaders.has(column))

  if (missingColumns.length > 0) {
    throw createTencentDocsError(400, ERROR_CODES.TEMPLATE_INVALID, '腾讯文档模板校验失败', { missingColumns })
  }
}

async function findExistingRow(page, syncKey, platform) {
  const shortcutKey = getShortcutKey(platform)
  await page.keyboard.press(`${shortcutKey}+f`)
  await page.waitForTimeout(300)
  await page.keyboard.type(syncKey)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(800)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(400)
  const bodyText = await readBodyText(page)
  return bodyText.includes(syncKey)
}

async function overwriteCurrentRow(page, row, columns, platform) {
  await moveToRowStart(page, platform)
  await fillRow(page, row, columns)
  return {
    action: 'UPDATED',
    matchedBy: ['同步键']
  }
}

async function appendRow(page, row, columns, platform) {
  await moveToSheetEnd(page, platform)
  await moveToRowStart(page, platform)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(200)
  await fillRow(page, row, columns)
  return {
    action: 'APPENDED',
    matchedBy: ['同步键']
  }
}

async function fillRow(page, row, columns) {
  const values = columns.map((column) => String(row[column] ?? ''))

  for (let index = 0; index < values.length; index += 1) {
    await page.keyboard.insertText(values[index])
    if (index < values.length - 1) {
      await page.keyboard.press('Tab')
      await page.waitForTimeout(50)
    }
  }
}

async function moveToSheetStart(page, platform) {
  const shortcutKey = getShortcutKey(platform)
  const candidates = platform === 'darwin'
    ? [`${shortcutKey}+ArrowUp`, `${shortcutKey}+Home`, 'Home']
    : [`${shortcutKey}+Home`, 'Home']

  await pressFirstAvailable(page, candidates)
  await page.waitForTimeout(500)
}

async function moveToSheetEnd(page, platform) {
  const shortcutKey = getShortcutKey(platform)
  const candidates = platform === 'darwin'
    ? [`${shortcutKey}+ArrowDown`, `${shortcutKey}+End`, 'End']
    : [`${shortcutKey}+End`, 'End']

  await pressFirstAvailable(page, candidates)
  await page.waitForTimeout(500)
}

async function moveToRowStart(page, platform) {
  const shortcutKey = getShortcutKey(platform)
  const candidates = platform === 'darwin'
    ? [`${shortcutKey}+ArrowLeft`, 'Home']
    : ['Home']

  await pressFirstAvailable(page, candidates)
  await page.waitForTimeout(200)
}

async function pressFirstAvailable(page, candidates) {
  for (const candidate of candidates) {
    const succeeded = await page.keyboard.press(candidate)
      .then(() => true)
      .catch(() => false)
    if (succeeded) return
  }
}

function isImageCell(cell) {
  return /截图/.test(String(cell?.columnName || ''))
}

function buildContiguousGroups(cells) {
  if (!Array.isArray(cells) || cells.length === 0) return []
  const groups = []
  let current = [cells[0]]

  for (let index = 1; index < cells.length; index += 1) {
    const previous = current[current.length - 1]
    const next = cells[index]
    if (next.columnIndex === previous.columnIndex + 1) {
      current.push(next)
    } else {
      groups.push(current)
      current = [next]
    }
  }

  groups.push(current)
  return groups
}

async function pasteTextIntoFocusedRange(page, text, platform) {
  await page.evaluate(async ({ text }) => {
    await navigator.clipboard.writeText(text)
  }, { text })
  await page.keyboard.press(`${getShortcutKey(platform)}+v`).catch(() => {})
}

async function pasteImageIntoFocusedCell(page, imageUrl, platform) {
  const imageBase64 = await fetchImageAsBase64(imageUrl)
  await page.evaluate(async ({ imageBase64 }) => {
    const bytes = Uint8Array.from(atob(imageBase64), (character) => character.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'image/png' })
    const item = new ClipboardItem({ 'image/png': blob })
    await navigator.clipboard.write([item])
  }, { imageBase64 })
  await page.keyboard.press(`${getShortcutKey(platform)}+v`).catch(() => {})
  await convertFloatingImageToCellImage(page)
}

async function convertFloatingImageToCellImage(page) {
  const menuItemPattern = /转为单元格图片/

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.waitForTimeout(attempt === 0 ? 1200 : 300)
    const selectionBounds = await getPrimarySelectionBounds(page)
    if (!selectionBounds) continue

    await page.mouse.click(
      Math.round(selectionBounds.x + selectionBounds.w / 2),
      Math.round(selectionBounds.y + selectionBounds.h / 2),
      { button: 'right' }
    ).catch(() => {})
    await page.waitForTimeout(250)

    const menuItem = page.getByRole('menuitem', { name: menuItemPattern }).first()
    const visible = await menuItem.isVisible().catch(() => false)
    if (visible) {
      await menuItem.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(800)
      return
    }

    await page.keyboard.press('Escape').catch(() => {})
  }

  throw createTencentDocsError(500, ERROR_CODES.WRITE_FAILED, '截图已粘贴，但未找到“转为单元格图片”入口')
}

async function getPrimarySelectionBounds(page) {
  return page.evaluate(() => {
    const selections = Array.from(document.querySelectorAll('.select-selection-border'))
      .map((node) => {
        const rect = node.getBoundingClientRect()
        return {
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height
        }
      })
      .filter((selection) => selection.w > 0
        && selection.h > 0
        && selection.x >= 0
        && selection.y >= 0
        && selection.x < window.innerWidth
        && selection.y < window.innerHeight)
      .sort((left, right) => right.y - left.y || left.x - right.x)

    return selections[0] || null
  }).catch(() => null)
}

async function fetchImageAsBase64(imageUrl) {
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw createTencentDocsError(500, ERROR_CODES.WRITE_FAILED, `截图资源拉取失败：${response.status} ${response.statusText}`, { imageUrl })
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  return buffer.toString('base64')
}

async function focusCell(page, { sheetRow, columnIndex, platform }) {
  const cellReference = `${toColumnLetter(columnIndex)}${sheetRow}`
  const jumped = await jumpToCellReference(page, cellReference)
  if (jumped) return

  await focusSheetGrid(page)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(120)
  await moveToSheetStart(page, platform)
  await moveToRowStart(page, platform)

  for (let row = 1; row < Number(sheetRow); row += 1) {
    await page.keyboard.press('ArrowDown')
  }

  for (let column = 1; column < Number(columnIndex); column += 1) {
    await page.keyboard.press('ArrowRight')
  }

  await page.waitForTimeout(120)
}

async function readSheetSelection(page, { maxRows, platform }) {
  const parsed = await copySheetSelection(page, {
    maxRows,
    platform
  })

  if (parsed.rows.length === 0) {
    throw createTencentDocsError(500, ERROR_CODES.READ_FAILED, '已复制腾讯文档选区，但没有解析出数据行')
  }

  return parsed.rawTsv
}

async function copySheetSelection(page, { maxRows, platform }) {
  const rowCount = normalizeMaxRows(maxRows)
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://docs.qq.com' }).catch(() => {})
  await focusSheetGrid(page)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(200)
  const jumped = await jumpToCellReference(page, 'A1')
  if (!jumped) {
    await moveToSheetStart(page, platform)
    await moveToRowStart(page, platform)
  }
  await page.waitForTimeout(150)
  await page.keyboard.press(`${getShortcutKey(platform)}+Shift+ArrowRight`)
  await page.waitForTimeout(200)

  for (let index = 0; index < rowCount; index += 1) {
    await page.keyboard.press('Shift+ArrowDown')
    await page.waitForTimeout(25)
  }

  await page.keyboard.press(`${getShortcutKey(platform)}+c`)
  await page.waitForTimeout(300)
  const rawTsv = await readClipboardText(page)
  const parsed = parseClipboardTable(rawTsv)
  return {
    rawTsv,
    ...parsed
  }
}

async function focusSheetGrid(page) {
  const canvas = page.locator('canvas').last()
  const box = await canvas.boundingBox().catch(() => null)
  if (box) {
    await page.mouse.click(Math.round(box.x + Math.min(160, Math.max(box.width - 20, 20))), Math.round(box.y + Math.min(48, Math.max(box.height - 20, 20))))
    await page.waitForTimeout(150)
    return
  }

  await page.mouse.click(260, 220)
  await page.waitForTimeout(150)
}

async function readClipboardText(page) {
  const rawTsv = await page.evaluate(async () => {
    try {
      return await navigator.clipboard.readText()
    } catch (error) {
      return `__CLIPBOARD_ERROR__${error.message}`
    }
  })

  if (rawTsv.startsWith('__CLIPBOARD_ERROR__')) {
    throw createTencentDocsError(500, ERROR_CODES.READ_FAILED, '读取腾讯文档剪贴板内容失败', {
      reason: rawTsv.replace('__CLIPBOARD_ERROR__', '')
    })
  }

  return rawTsv
}

async function readVisibleSheetTabs(page) {
  return page.locator('[role="tab"].tab-bar-item').evaluateAll((nodes) => nodes
    .map((node) => {
      const name = (node.getAttribute('aria-label') || node.textContent || '').trim()
      if (!name) return null
      return {
        name,
        selected: node.classList.contains('tab-bar-item-selected') || node.getAttribute('aria-selected') === 'true'
      }
    })
    .filter(Boolean)).catch(() => [])
}

async function jumpToCellReference(page, cellReference) {
  const locator = page.locator('input.bar-label').first()
  const visible = await locator.isVisible().catch(() => false)
  if (!visible) return false

  await locator.click({ timeout: 3000 }).catch(() => {})
  await locator.fill(cellReference).catch(() => {})
  await page.keyboard.press('Enter').catch(() => {})
  await page.waitForTimeout(250)
  return true
}

function toColumnLetter(columnIndex) {
  let value = Number(columnIndex)
  let result = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    value = Math.floor((value - 1) / 26)
  }
  return result
}

function normalizeMaxRows(maxRows) {
  const value = Number(maxRows || 20)
  if (!Number.isFinite(value)) return 20
  return Math.max(1, Math.min(200, Math.floor(value)))
}

function getRequiredTemplateColumns(columns) {
  return [...new Set(columns)]
}

function getShortcutKey(platform) {
  return platform === 'darwin' ? 'Meta' : 'Control'
}

async function readBodyText(page) {
  return page.locator('body').innerText().catch(() => '')
}

function hasAnyText(bodyText, candidates) {
  return candidates.some((candidate) => bodyText.includes(candidate))
}

module.exports = { TencentDocsBrowserAdapter }
