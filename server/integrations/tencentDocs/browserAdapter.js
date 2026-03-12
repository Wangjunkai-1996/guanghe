const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright-core')
const { ensureDir, writeJson } = require('../../lib/files')
const { createTencentDocsError, ERROR_CODES } = require('./errors')
const { parseClipboardTable, normalizeHeaderCell } = require('./sheetClipboard')

const IMAGE_CONVERT_MAX_ATTEMPTS = 3
const IMAGE_PASTE_POLL_ATTEMPTS = 10
const IMAGE_PASTE_POLL_INTERVAL_MS = 250
const IMAGE_PASTE_SETTLE_MS = 400
const IMAGE_CONVERT_VERIFY_ATTEMPTS = 2
const IMAGE_CONVERT_VERIFY_INTERVAL_MS = 200
const DEBUG_TENCENT_DOCS_ARTIFACTS = process.env.DEBUG_TENCENT_DOCS_ARTIFACTS === 'true' || process.env.DEBUG_ARTIFACTS === 'true'
const SINGLE_CELL_MAX_WIDTH = 420
const SINGLE_CELL_MAX_HEIGHT = 120
const SELECTION_GUARD_ATTEMPTS = 3

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
        await page.screenshot({ path: path.join(artifactDir, 'error.png'), fullPage: true }).catch(() => { })
      }
      throw error
    } finally {
      if (context) {
        await context.close().catch(() => { })
      }
    }
  }

  async readSheet({ target, maxRows = 20, artifactDir, strict = true }) {
    ensureDir(artifactDir)

    let context = null
    let page = null

    try {
      context = await this.launchContext()
      page = context.pages()[0] || await context.newPage()
      await openDocumentPage(page, target.docUrl)
      await page.screenshot({ path: path.join(artifactDir, 'before-read.png'), fullPage: true })

      await assertLoggedIn(page)
      const selectedSheetName = await ensureSheetSelected(page, target.sheetName, { strict })
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
        await page.screenshot({ path: path.join(artifactDir, 'error.png'), fullPage: true }).catch(() => { })
      }
      throw error
    } finally {
      if (context) {
        await context.close().catch(() => { })
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
      if (DEBUG_TENCENT_DOCS_ARTIFACTS) {
        await page.screenshot({ path: path.join(artifactDir, 'before-fill.png'), fullPage: true })
      }

      await assertLoggedIn(page)
      await ensureSheetSelected(page, target.sheetName)
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://docs.qq.com' }).catch(() => { })

      const orderedCells = (cells || []).slice().sort((left, right) => left.columnIndex - right.columnIndex)
      const imageCells = orderedCells.filter((cell) => isImageCell(cell))
      const textCells = orderedCells.filter((cell) => !isImageCell(cell))
      
      console.log(`[TencentDocs] 列分组完成: 图片列=[${imageCells.map(c => c.columnName).join(', ')}], 文本列=[${textCells.map(c => c.columnName).join(', ')}]`)

      // Ensure "前端小眼睛截图" is pasted last to avoid UI focus issues
      const eyeIndex = imageCells.findIndex((cell) => cell.columnName === '前端小眼睛截图')
      if (eyeIndex >= 0) {
        const [eyeCell] = imageCells.splice(eyeIndex, 1)
        imageCells.push(eyeCell)
      }

      for (const group of buildContiguousGroups(textCells)) {
        await focusCell(page, {
          sheetRow,
          columnIndex: group[0].columnIndex,
          platform: this.platform
        })
        const groupStartRef = `${toColumnLetter(group[0].columnIndex)}${sheetRow}`
        await ensureSingleCellSelection(page, { expectedCellRef: groupStartRef, platform: this.platform })
        await pasteTextIntoFocusedRange(page, group.map((cell) => String(cell.value ?? '')).join('	'), this.platform)
        await page.waitForTimeout(250)
        try {
          await verifyTextGroupWritten(page, {
            sheetRow,
            group,
            platform: this.platform
          })
        } catch (error) {
          await writeTextCellsIndividually(page, {
            sheetRow,
            group,
            platform: this.platform
          })
        }
      }

      for (const cell of imageCells) {
        if (!cell.value) continue
        const cellRef = `${cell.columnLetter || toColumnLetter(cell.columnIndex)}${sheetRow}`
        const startedAt = Date.now()
        console.log(`[TencentDocs] 开始处理图片单元格: ${cellRef} ${cell.columnName}`)
        await focusCell(page, {
          sheetRow,
          columnIndex: cell.columnIndex,
          platform: this.platform
        })
        await pasteImageIntoFocusedCell(page, cell.value, {
          sheetRow,
          columnIndex: cell.columnIndex,
          platform: this.platform
        })
        console.log(`[TencentDocs] 图片单元格处理完成: ${cellRef} ${cell.columnName} ${Date.now() - startedAt}ms`)
        await page.waitForTimeout(250)
      }

      await page.waitForTimeout(800)
      if (DEBUG_TENCENT_DOCS_ARTIFACTS) {
        await page.screenshot({ path: path.join(artifactDir, 'after-fill.png'), fullPage: true })
      }

      return {
        action: 'UPDATED',
        sheetRow,
        matchedBy: ['内容id'],
        columnsUpdated: orderedCells.map((cell) => cell.columnName),
        columnIndexes: orderedCells.map((cell) => cell.columnIndex)
      }
    } catch (error) {
      if (page) {
        await page.screenshot({ path: path.join(artifactDir, 'error.png'), fullPage: true }).catch(() => { })
      }
      throw error
    } finally {
      if (context) {
        await context.close().catch(() => { })
      }
    }
  }

  async launchContext() {
    ensureDir(this.profileDir)
    const isHeadless = process.env.SHOW_BROWSER === 'true' ? false : this.headless
    try {
      return await chromium.launchPersistentContext(this.profileDir, {
        headless: isHeadless,
        executablePath: this.browserExecutablePath,
        viewport: { width: 1728, height: 1117 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox'
        ]
      })
    } catch (error) {
      throw mapTencentDocsBrowserError(error)
    }
  }
}


function mapTencentDocsBrowserError(error) {
  const message = String(error?.message || '')
  if (message.includes('ProcessSingleton')) {
    return createTencentDocsError(409, ERROR_CODES.BROWSER_PROFILE_BUSY, '腾讯文档浏览器正被其他任务占用，请稍后重试')
  }
  return error
}

async function openDocumentPage(page, docUrl) {
  await page.goto(docUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
}

async function assertLoggedIn(page) {
  // Give the page time to settle
  await Promise.race([
    page.waitForSelector('.toolbar-container, .ribbon-toolbar_ribbon-toolbar__3xV-1, .fixed-toolbar-container_fixed-toolbar-wrapper__3NxGh', { timeout: 8000 }).catch(() => { }),
    page.waitForSelector('text="立即登录", text="扫码登录"', { timeout: 8000 }).catch(() => { })
  ])

  // If the spreadsheet toolbar is visible, the document has loaded.
  // However, shared docs show the toolbar even in read-only/guest mode,
  // so we must also check for read-only indicators.
  const hasToolbar = await page.locator('.toolbar-container, .ribbon-toolbar_ribbon-toolbar__3xV-1, .fixed-toolbar-container_fixed-toolbar-wrapper__3NxGh').first().isVisible().catch(() => false)
  if (hasToolbar) {
    // Check for read-only indicators that signal expired login or guest mode
    const bodyText = await readBodyText(page)
    const hasReadOnlyIndicator = hasAnyText(bodyText, ['只能查看', '登录腾讯文档'])
    if (hasReadOnlyIndicator) {
      throw createTencentDocsError(401, ERROR_CODES.LOGIN_REQUIRED, '腾讯文档登录已过期，当前为只读模式，请重新扫码登录腾讯文档')
    }
    return
  }

  const bodyText = await readBodyText(page)

  // If it's a pure login redirect page (no document content at all), reject
  const hasLoginPrompt = hasAnyText(bodyText, ['扫码登录', '微信登录', 'QQ登录', '登录后继续', '请选择登录方式', '微信快捷登录'])
    || page.frames().some((frame) => /open\.weixin\.qq\.com\/connect\/qrconnect|bind-wx-quick-login/i.test(frame.url()))
  if (/login|signin/i.test(page.url()) || hasLoginPrompt) {
    throw createTencentDocsError(401, ERROR_CODES.LOGIN_REQUIRED, '腾讯文档当前未登录或已退回只读态，请先重新扫码登录腾讯文档')
  }

  // Fallback: if page has very little content and no toolbar, it's likely a white screen
  if (bodyText.length < 200) {
    throw createTencentDocsError(401, ERROR_CODES.LOGIN_REQUIRED, '腾讯文档页面加载超时或需登录验证，请重新扫码登录')
  }
}

async function ensureSheetSelected(page, sheetName, { strict = true } = {}) {
  const tabs = await readVisibleSheetTabs(page)
  const selected = tabs.find((tab) => tab.selected)
  if (!sheetName) {
    return selected?.name || ''
  }

  const locator = page.getByRole('tab', { name: sheetName, exact: true }).first()
  const visible = await locator.isVisible().catch(() => false)
  if (!visible) {
    if (strict) {
      throw createTencentDocsError(400, ERROR_CODES.SHEET_NOT_FOUND, `未找到工作表：${sheetName}`)
    } else {
      return selected?.name || ''
    }
  }

  await locator.click({ timeout: 5000 }).catch(() => { })
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

  // Open search UI
  await page.keyboard.press(`${shortcutKey}+f`)
  const searchInput = page.locator('.alloy-find-input, [placeholder*="查找"]').first()
  await searchInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { })

  await page.keyboard.type(syncKey)
  await page.keyboard.press('Enter')

  // Give it a moment to scroll to the result
  await page.waitForTimeout(400)

  // Close search UI
  await page.keyboard.press('Escape').catch(() => { })
  await searchInput.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => { })

  const bodyText = await readBodyText(page)
  return bodyText.includes(syncKey)
}

async function overwriteCurrentRow(page, row, columns, platform) {
  await moveToRowStart(page, platform)
  await fillRow(page, row, columns, platform)
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
  await fillRow(page, row, columns, platform)
  return {
    action: 'APPENDED',
    matchedBy: ['同步键']
  }
}

async function fillRow(page, row, columns, platform) {
  await ensureSingleCellSelection(page, { platform })
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
  const name = String(cell?.columnName || '')
  // 显式匹配已知的截图列名，确保万无一失
  if (name === '查看次数截图' || name === '前端小眼睛截图') return true
  // 保留模糊匹配作为保底
  return /截图/.test(name)
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
  await page.keyboard.press(`${getShortcutKey(platform)}+v`).catch(() => { })
  await page.waitForTimeout(120)
  await page.keyboard.press('Enter').catch(() => { })
  await page.waitForTimeout(120)
}

async function writeTextIntoFocusedCell(page, value, platform, expectedCellRef) {
  const refocused = await refocusPrimarySelection(page)
  if (!refocused) {
    await focusSheetGrid(page)
  }

  // Wait for cell edit mode or focus to settle if UI delays exist
  await page.waitForTimeout(50)

  await ensureSingleCellSelection(page, { platform, expectedCellRef })
  const normalizedValue = String(value ?? '')
  if (!normalizedValue) {
    await page.keyboard.press('Backspace').catch(() => { })
    await page.waitForTimeout(60)
    await page.keyboard.press('Enter').catch(() => { })
    await page.waitForTimeout(80)
    return
  }

  await page.evaluate(async ({ text }) => {
    await navigator.clipboard.writeText(text)
  }, { text: normalizedValue })
  await page.keyboard.press(`${getShortcutKey(platform)}+v`).catch(() => { })
  await page.waitForTimeout(120)
  await page.keyboard.press('Enter').catch(() => { })
  await page.waitForTimeout(120)
}

async function writeTextCellsIndividually(page, { sheetRow, group, platform }) {
  for (const cell of group) {
    await focusCell(page, {
      sheetRow,
      columnIndex: cell.columnIndex,
      platform
    })
    const cellRef = `${cell.columnLetter || toColumnLetter(cell.columnIndex)}${sheetRow}`
    await writeTextIntoFocusedCell(page, String(cell.value ?? ''), platform, cellRef)
    await page.waitForTimeout(200)
    await verifyTextGroupWritten(page, {
      sheetRow,
      group: [cell],
      platform
    })
  }
}

async function pasteImageIntoFocusedCell(page, imageUrl, { sheetRow, columnIndex, platform }) {
  console.log(`[TencentDocs] 正在获取图片字节流: ${imageUrl} (行:${sheetRow} 列:${columnIndex})`)
  const beforeCount = await countImageNodes(page).catch(() => 0)
  const imageBase64 = await fetchImageAsBase64(imageUrl)
  await page.evaluate(async ({ imageBase64 }) => {
    const bytes = Uint8Array.from(atob(imageBase64), (character) => character.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'image/png' })
    const item = new ClipboardItem({ 'image/png': blob })
    await navigator.clipboard.write([item])
  }, { imageBase64 })
  await page.keyboard.press(`${getShortcutKey(platform)}+v`).catch(() => { })
  await waitForImagePaste(page, beforeCount)
  await page.waitForTimeout(IMAGE_PASTE_SETTLE_MS)
  
  try {
    await convertFloatingImageToCellImage(page, { sheetRow, columnIndex, platform })
  } catch (error) {
    console.warn(`[TencentDocs] 转入单元格图片失败 (行:${sheetRow} 列Index:${columnIndex})，已保留为浮动图片: ${error.message}`)
  }
}


async function verifyTextGroupWritten(page, { sheetRow, group, platform }) {
  if (!Array.isArray(group) || group.length === 0) return
  const expectedValues = group.map((cell) => String(cell.value ?? ''))

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await page.waitForTimeout(400 * attempt)
    }

    await focusCell(page, {
      sheetRow,
      columnIndex: group[0].columnIndex,
      platform
    })
    await selectFocusedRange(page, group.length, platform)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://docs.qq.com' }).catch(() => { })
    await page.keyboard.press(`${getShortcutKey(platform)}+c`).catch(() => { })
    await page.waitForTimeout(300)

    const actualValues = parseClipboardRowValues(await readClipboardText(page))
    if (clipboardRowMatches(actualValues, expectedValues)) {
      await page.keyboard.press('Escape').catch(() => { })
      return
    }

    if (attempt === 2) {
      throw createTencentDocsError(500, ERROR_CODES.WRITE_FAILED, `腾讯文档第 ${sheetRow} 行写入校验失败`, {
        sheetRow,
        columnIndexes: group.map((cell) => cell.columnIndex),
        columns: group.map((cell) => cell.columnName),
        expectedValues,
        actualValues
      })
    }
  }
}

async function selectFocusedRange(page, width, platform) {
  const rangeWidth = Math.max(1, Number(width || 1))
  const refocused = await refocusPrimarySelection(page)
  if (!refocused) {
    await focusSheetGrid(page)
  }
  await page.waitForTimeout(120)
  for (let index = 1; index < rangeWidth; index += 1) {
    await page.keyboard.press('Shift+ArrowRight').catch(() => { })
    await page.waitForTimeout(40)
  }
}

function parseClipboardRowValues(rawTsv) {
  const normalized = String(rawTsv || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const firstLine = normalized.split('\n')[0] || ''
  return firstLine.split('\t').map((value) => String(value ?? ''))
}

function clipboardRowMatches(actualValues, expectedValues) {
  if (actualValues.length !== expectedValues.length) return false
  return actualValues.every((value, index) => String(value ?? '') === String(expectedValues[index] ?? ''))
}

async function convertFloatingImageToCellImage(page, { sheetRow, columnIndex, platform }) {
  const convertMenuPattern = /转(?:换)?为单元格图片/
  const floatingMenuPattern = /转(?:换)?为浮动图片/
  const cellRef = toColumnLetter(columnIndex) + sheetRow

  for (let attempt = 0; attempt < IMAGE_CONVERT_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      console.log(`[TencentDocs] 第 ${attempt + 1} 次尝试转单元格图片 (行:${sheetRow})`)
      await page.keyboard.press('Escape').catch(() => { })
      await page.waitForTimeout(400)
    }

    await jumpToCellReference(page, cellRef)
    await page.waitForTimeout(300)

    let selectionBounds = await getPrimarySelectionBounds(page)
    if (!selectionBounds) {
      await focusSheetGrid(page)
      await jumpToCellReference(page, cellRef)
      await page.waitForTimeout(200)
      selectionBounds = await getPrimarySelectionBounds(page)
      if (!selectionBounds) continue
    }

      const imageBounds = await findFloatingImageBounds(page, selectionBounds)
    const clickTargets = buildImageConversionTargets(selectionBounds, imageBounds)

    for (const target of clickTargets) {
      // 在每一个点位右键前，先左键点一下，增加“激活”图片的概率
      await page.mouse.click(target.x, target.y).catch(() => { })
      await page.waitForTimeout(100)
      
      const menuState = await openImageContextMenuAt(page, target, {
        convertMenuPattern,
        floatingMenuPattern
      })

      // If menu already shows "转为浮动图片", it means the image is already a cell image.
      if (menuState.floatingItem && !menuState.convertItem) {
        await dismissOpenMenu(page)
        console.log(`[TencentDocs] 已处于单元格图片状态 (行:${sheetRow})`)
        return
      }

      if (menuState.convertItem) {
        const clicked = await clickVisibleLocator(menuState.convertItem)
        if (!clicked) {
          await dismissOpenMenu(page)
          continue
        }
        const converted = await verifyImageConvertedToCellImage(page, {
          cellRef,
          target,
          convertMenuPattern,
          floatingMenuPattern
        })
        if (converted) {
          console.log(`[TencentDocs] 成功转为单元格图片: ${cellRef}`)
          return
        }
      }

      await dismissOpenMenu(page)
      
      // 如果已经有点中图片但在当前点没看到菜单，不要在这个循环里继续点其他点浪费时间，除非这个点本身没反应
      if (imageBounds && target === clickTargets[0]) {
         // 既然点中了识别到的图片中心还没菜单，说明目标可能偏移了
      }
    }
    
    // 如果还没转成功，尝试在网格上点一下重新夺回焦点
    await focusSheetGrid(page)
  }

  console.warn(`[TencentDocs] 截图已粘贴，但最终未能自动转为单元格图片 (行:${sheetRow})，请人工检查`)
}

async function openImageContextMenuAt(page, target, { convertMenuPattern, floatingMenuPattern }) {
  await page.mouse.click(target.x, target.y, { button: 'right' }).catch(() => { })
  await page.waitForTimeout(400) // 稍微拉长菜单显示等待时间

  return {
    convertItem: await findVisibleMenuItem(page, convertMenuPattern),
    floatingItem: await findVisibleMenuItem(page, floatingMenuPattern)
  }
}

async function verifyImageConvertedToCellImage(page, {
  cellRef,
  target,
  convertMenuPattern,
  floatingMenuPattern
}) {
  for (let attempt = 0; attempt < IMAGE_CONVERT_VERIFY_ATTEMPTS; attempt += 1) {
    if (attempt > 0) {
      await page.waitForTimeout(IMAGE_CONVERT_VERIFY_INTERVAL_MS)
    }

    await dismissOpenMenu(page)
    await jumpToCellReference(page, cellRef)
    await page.waitForTimeout(200)

    const selectionBounds = await getPrimarySelectionBounds(page)
    if (!selectionBounds) {
      continue
    }

    const imageBounds = await findFloatingImageBounds(page, selectionBounds)
    if (imageBounds && !looksLikeFloatingImage(imageBounds, selectionBounds)) {
      return true
    }

    const menuState = await openImageContextMenuAt(page, target, {
      convertMenuPattern,
      floatingMenuPattern
    })
    const converted = Boolean(menuState.floatingItem)
      || (!menuState.convertItem && !imageBounds)

    await dismissOpenMenu(page)
    if (converted) {
      return true
    }
  }

  return false
}

function looksLikeFloatingImage(imageBounds, selectionBounds) {
  if (!imageBounds || !selectionBounds) return false
  const tolerance = 6
  return imageBounds.x < selectionBounds.x - tolerance
    || imageBounds.y < selectionBounds.y - tolerance
    || imageBounds.x + imageBounds.w > selectionBounds.x + selectionBounds.w + tolerance
    || imageBounds.y + imageBounds.h > selectionBounds.y + selectionBounds.h + tolerance
}

async function findVisibleMenuItem(page, pattern) {
  const candidates = [
    // 增加对通用容器的匹配，有时名字在内部 span 里
    page.locator('.dui-menu-item, [role="menuitem"]').filter({ hasText: pattern }).first(),
    page.getByRole('menuitem', { name: pattern }).first(),
    page.getByText(pattern).first()
  ]

  for (const locator of candidates) {
    const visible = await locator.isVisible().catch(() => false)
    if (visible) {
      return locator
    }
  }

  return null
}

async function clickVisibleLocator(locator) {
  try {
    await locator.click({ timeout: 3000 })
    return true
  } catch (_error) {
    try {
      await locator.click({ timeout: 3000, force: true })
      return true
    } catch (_nextError) {
      return false
    }
  }
}

async function dismissOpenMenu(page) {
  await page.keyboard.press('Escape').catch(() => { })
  await page.waitForTimeout(150)
}

function buildImageConversionTargets(selectionBounds, imageBounds) {
  const targets = []
  if (imageBounds) {
    const { x, y, w, h } = imageBounds
    // 既然精确识别到了图片，使用“九宫格/十字”采样法，增加点击成功的概率
    targets.push({ x: Math.round(x + w / 2), y: Math.round(y + h / 2) }) // 中心
    targets.push({ x: Math.round(x + 15), y: Math.round(y + 15) })    // 左上偏内
    targets.push({ x: Math.round(x + w - 15), y: Math.round(y + h - 15) }) // 右下偏内
    targets.push({ x: Math.round(x + w / 2), y: Math.round(y + 10) })   // 上中偏内
    targets.push({ x: Math.round(x + w / 2), y: Math.round(y + h - 10) }) // 下中偏内
  }

  const { x, y, w, h } = selectionBounds
  const ratios = [
    [0.5, 0.5],
    [0.2, 0.2],
    [0.8, 0.8]
  ]

  for (const [rx, ry] of ratios) {
    const px = Math.round(x + w * rx)
    const py = Math.round(y + h * ry)
    // 避免重复点同一个区域
    if (!targets.some(t => Math.hypot(t.x - px, t.y - py) < 5)) {
      targets.push({ x: px, y: py })
    }
  }

  return targets
}

async function countImageNodes(page) {
  return page.evaluate(() => {
    return document.querySelectorAll('img, canvas, svg, [style*="background-image"], [class*="image"], [class*="Image"]').length
  })
}

async function waitForImagePaste(page, beforeCount) {
  for (let index = 0; index < IMAGE_PASTE_POLL_ATTEMPTS; index += 1) {
    await page.waitForTimeout(IMAGE_PASTE_POLL_INTERVAL_MS)
    const count = await countImageNodes(page).catch(() => beforeCount)
    if (count > beforeCount) return
  }
}

async function findFloatingImageBounds(page, selectionBounds) {
  return page.evaluate(({ selectionBounds }) => {
    if (!selectionBounds) return null
    const { x, y, w, h } = selectionBounds
    const left = x
    const right = x + w
    const top = y
    const bottom = y + h
    const cx = x + w / 2
    const cy = y + h / 2
    const maxDistance = Math.max(w, h) * 1.2 + 120

    const overlaps = (rect) => rect.right > left && rect.left < right && rect.bottom > top && rect.top < bottom
    const nodes = document.querySelectorAll('img, canvas, svg, [style*="background-image"], [class*="image"], [class*="Image"]')
    const candidates = []
    nodes.forEach((node) => {
      const rect = node.getBoundingClientRect()
      if (rect.width < 40 || rect.height < 24) return
      candidates.push({
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height,
        area: rect.width * rect.height,
        overlaps: overlaps(rect),
        dist: Math.hypot(rect.x + rect.width / 2 - cx, rect.y + rect.height / 2 - cy)
      })
    })

    const overlapCandidates = candidates.filter((c) => c.overlaps)
    if (overlapCandidates.length) {
      overlapCandidates.sort((a, b) => b.area - a.area)
      return overlapCandidates[0]
    }

    const nearby = candidates.filter((c) => c.dist <= maxDistance)
    if (nearby.length) {
      nearby.sort((a, b) => a.dist - b.dist)
      return nearby[0]
    }

    return null
  }, { selectionBounds }).catch(() => null)
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

async function readNameBoxValue(page) {
  try {
    const locator = page.locator('input.bar-label').first()
    if (!locator) return ''
    if (typeof locator.inputValue === 'function') {
      return await locator.inputValue().catch(() => '')
    }
    if (typeof locator.evaluate === 'function') {
      return await locator.evaluate((el) => el.value || el.getAttribute('value') || '').catch(() => '')
    }
    if (typeof locator.getAttribute === 'function') {
      return await locator.getAttribute('value').catch(() => '')
    }
    return ''
  } catch (_error) {
    return ''
  }
}

function normalizeNameBoxValue(value) {
  return String(value || '').trim().toUpperCase()
}

function isSingleCellRef(value) {
  return /^[A-Z]+[0-9]+$/.test(value)
}

function looksLikeRangeRef(value) {
  return String(value || '').includes(':')
}

async function collapseSelection(page, platform) {
  await focusSheetGrid(page)
  await page.keyboard.press('Escape').catch(() => { })
  await page.waitForTimeout(120)
  await page.keyboard.press('ArrowRight').catch(() => { })
  await page.keyboard.press('ArrowLeft').catch(() => { })
  await page.waitForTimeout(120)
}

async function ensureSingleCellSelection(page, { expectedCellRef, platform } = {}) {
  const expected = normalizeNameBoxValue(expectedCellRef)
  let lastNameBox = ''

  for (let attempt = 0; attempt < SELECTION_GUARD_ATTEMPTS; attempt += 1) {
    lastNameBox = normalizeNameBoxValue(await readNameBoxValue(page))

    if (lastNameBox) {
      if (isSingleCellRef(lastNameBox)) {
        if (!expected || lastNameBox === expected) {
          await assertClipboardSingleCell(page, platform)
          return
        }

        // 单元格不一致，尝试重新跳转
        await jumpToCellReference(page, expected)
        await page.waitForTimeout(200)
        continue
      }

      if (looksLikeRangeRef(lastNameBox)) {
        await collapseSelection(page, platform)
        continue
      }
    }

    const bounds = await getPrimarySelectionBounds(page)
    if (bounds && bounds.w <= SINGLE_CELL_MAX_WIDTH && bounds.h <= SINGLE_CELL_MAX_HEIGHT) {
      await assertClipboardSingleCell(page, platform)
      return
    }

    await collapseSelection(page, platform)
  }

  throw createTencentDocsError(409, ERROR_CODES.SELECTION_UNSAFE, '腾讯文档选区异常，已阻止写入以避免清空整表', {
    expectedCellRef: expectedCellRef || '',
    nameBoxValue: lastNameBox || ''
  })
}

async function assertClipboardSingleCell(page, platform) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://docs.qq.com' }).catch(() => { })
  await page.keyboard.press(`${getShortcutKey(platform)}+c`).catch(() => { })
  await page.waitForTimeout(220)

  let rawTsv = ''
  try {
    rawTsv = await readClipboardText(page)
  } catch (error) {
    throw createTencentDocsError(409, ERROR_CODES.SELECTION_UNSAFE, '无法确认单元格选区，已阻止写入以避免清空整表', {
      reason: error?.message || 'clipboard_read_failed'
    })
  }
  const normalized = String(rawTsv || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const firstLine = lines[0] || ''
  const hasTab = firstLine.includes('\t')
  const hasExtraRows = lines.slice(1).some((line) => String(line || '').trim() !== '')

  if (hasTab || hasExtraRows) {
    throw createTencentDocsError(409, ERROR_CODES.SELECTION_UNSAFE, '检测到多单元格选区，已阻止写入以避免清空整表', {
      clipboardPreview: normalized.slice(0, 120)
    })
  }
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
  console.log(`[TencentDocs] 尝试定位单元格: ${cellReference}`)
  
  // 1. 优先尝试使用地址栏跳转
  const jumped = await jumpToCellReference(page, cellReference)
  if (jumped) {
    // 检查是否跳转后焦点还在地址栏，如果是则点回网格
    await page.waitForTimeout(200)
    const refocused = await refocusPrimarySelection(page)
    if (!refocused) {
      await focusSheetGrid(page)
    }
    await page.waitForTimeout(150)
    await ensureSingleCellSelection(page, { expectedCellRef: cellReference, platform })
    return
  }

  // 2. 备用手动导航逻辑 (兜底)
  console.log(`[TencentDocs] 地址栏跳转不可用，切换手动按键定位: ${cellReference}`)
  await focusSheetGrid(page)
  await page.keyboard.press('Escape').catch(() => { })
  await page.waitForTimeout(120)
  
  // 强制回 A1
  await moveToSheetStart(page, platform)
  await moveToRowStart(page, platform)
  await page.waitForTimeout(300)

  // 从第一行出发，移动到目标行
  // 注意：某些文档可能有冻结行，此处逻辑仍有风险，但已通过地址栏跳转大幅减少触发概率
  for (let row = 1; row < Number(sheetRow); row += 1) {
    await page.keyboard.press('ArrowDown')
    if (row % 50 === 0) await page.waitForTimeout(50) // 长距离移动稍微缓冲
  }

  for (let column = 1; column < Number(columnIndex); column += 1) {
    await page.keyboard.press('ArrowRight')
    if (column % 10 === 0) await page.waitForTimeout(20)
  }

  await page.waitForTimeout(150)
  await ensureSingleCellSelection(page, { expectedCellRef: cellReference, platform })
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
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://docs.qq.com' }).catch(() => { })
  await focusSheetGrid(page)
  await page.keyboard.press('Escape').catch(() => { })
  await page.waitForTimeout(200)
  const jumped = await jumpToCellReference(page, 'A1')
  if (!jumped) {
    await moveToSheetStart(page, platform)
    await moveToRowStart(page, platform)
  }
  await refocusPrimarySelection(page)
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
  await page.keyboard.press('Escape').catch(() => { })
  await page.waitForTimeout(120)
  return {
    rawTsv,
    ...parsed
  }
}

async function focusSheetGrid(page) {
  const canvasLocator = page.locator('canvas')
  const canvas = typeof canvasLocator.last === 'function'
    ? canvasLocator.last()
    : (typeof canvasLocator.first === 'function' ? canvasLocator.first() : canvasLocator)
  const box = typeof canvas?.boundingBox === 'function'
    ? await canvas.boundingBox().catch(() => null)
    : null
  if (box) {
    await page.mouse.click(Math.round(box.x + Math.min(160, Math.max(box.width - 20, 20))), Math.round(box.y + Math.min(48, Math.max(box.height - 20, 20))))
    await page.waitForTimeout(150)
    return
  }

  await page.mouse.click(260, 220)
  await page.waitForTimeout(150)
}


async function refocusPrimarySelection(page) {
  const selectionBounds = await getPrimarySelectionBounds(page)
  if (selectionBounds) {
    await page.mouse.click(
      Math.round(selectionBounds.x + Math.max(selectionBounds.w / 2, 12)),
      Math.round(selectionBounds.y + Math.max(selectionBounds.h / 2, 12))
    ).catch(() => { })
    await page.waitForTimeout(120)
    return true
  }

  await focusSheetGrid(page)
  return false
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
  try {
    const visible = await locator.isVisible({ timeout: 2000 })
    if (!visible) return false

    // 强力点击，确保激活输入态
    await locator.click({ force: true, timeout: 2000 })
    await page.waitForTimeout(100)

    const focused = await locator.evaluate((el) => document.activeElement === el).catch(() => false)
    if (!focused) {
      return false
    }
    
    // 全选并删除，确保输入框是空的
    const shortcut = getShortcutKey(process.platform)
    await page.keyboard.press(`${shortcut}+a`)
    await page.keyboard.press('Backspace')
    
    // 输入坐标并回车
    await page.keyboard.type(cellReference)
    await page.waitForTimeout(50)
    await page.keyboard.press('Enter')
    
    // 给文档一点滚动和定位的时间
    await page.waitForTimeout(400)
    return true
  } catch (_error) {
    return false
  }
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

module.exports = {
  TencentDocsBrowserAdapter,
  __private: {
    focusCell,
    refocusPrimarySelection,
    parseClipboardRowValues,
    clipboardRowMatches,
    writeTextIntoFocusedCell
  }
}
