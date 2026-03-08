const path = require('path')
const { chromium } = require('playwright-core')
const { ensureDir } = require('../../lib/files')
const { BASE_TEMPLATE_COLUMNS } = require('./mapping')
const { createTencentDocsError, ERROR_CODES } = require('./errors')

class TencentDocsBrowserAdapter {
  constructor({ browserExecutablePath, profileDir, headless = true, platform = process.platform }) {
    this.browserExecutablePath = browserExecutablePath
    this.profileDir = profileDir
    this.headless = headless
    this.platform = platform
  }

  async writeRow({ target, mode, syncKey, row, columns, artifactDir }) {
    ensureDir(this.profileDir)
    ensureDir(artifactDir)

    let context = null
    let page = null

    try {
      context = await chromium.launchPersistentContext(this.profileDir, {
        headless: this.headless,
        executablePath: this.browserExecutablePath,
        viewport: { width: 1728, height: 1117 },
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox'
        ]
      })

      page = context.pages()[0] || await context.newPage()
      await page.goto(target.docUrl, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      await page.screenshot({ path: path.join(artifactDir, 'before-write.png'), fullPage: true })

      await assertLoggedIn(page)
      await ensureSheetSelected(page, target.sheetName)
      await assertTemplateVisible(page, columns)

      let writeSummary
      if (mode === 'upsert') {
        const found = await findExistingRow(page, syncKey, this.platform)
        writeSummary = found
          ? await overwriteCurrentRow(page, row, columns)
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
}

async function assertLoggedIn(page) {
  const bodyText = await readBodyText(page)
  if (/login|signin/i.test(page.url()) || hasAnyText(bodyText, ['扫码登录', '微信登录', 'QQ登录', '登录后继续'])) {
    throw createTencentDocsError(401, ERROR_CODES.LOGIN_REQUIRED, '腾讯文档当前未登录，请先在持久化 profile 中完成登录')
  }
}

async function ensureSheetSelected(page, sheetName) {
  if (!sheetName) return

  const locator = page.getByText(sheetName, { exact: true }).first()
  const visible = await locator.isVisible().catch(() => false)
  if (!visible) {
    throw createTencentDocsError(400, ERROR_CODES.SHEET_NOT_FOUND, `未找到工作表：${sheetName}`)
  }

  await locator.click({ timeout: 5000 }).catch(() => {})
  await page.waitForTimeout(800)
}

async function assertTemplateVisible(page, columns) {
  await page.keyboard.press('Control+Home').catch(() => {})
  await page.waitForTimeout(500)
  const bodyText = await readBodyText(page)
  const expectedColumns = columns.filter((column) => BASE_TEMPLATE_COLUMNS.includes(column))
  const missingColumns = expectedColumns.filter((column) => !bodyText.includes(column))
  if (missingColumns.length > 0) {
    throw createTencentDocsError(400, ERROR_CODES.TEMPLATE_INVALID, '腾讯文档模板校验失败', { missingColumns })
  }
}

async function findExistingRow(page, syncKey, platform) {
  const shortcutKey = platform === 'darwin' ? 'Meta' : 'Control'
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

async function overwriteCurrentRow(page, row, columns) {
  await page.keyboard.press('Home').catch(() => {})
  await page.waitForTimeout(200)
  await fillRow(page, row, columns)
  return {
    action: 'UPDATED',
    matchedBy: ['同步键']
  }
}

async function appendRow(page, row, columns, platform) {
  const shortcutKey = platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${shortcutKey}+End`).catch(() => {})
  await page.waitForTimeout(500)
  await page.keyboard.press('Home').catch(() => {})
  await page.waitForTimeout(200)
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

async function readBodyText(page) {
  return page.locator('body').innerText().catch(() => '')
}

function hasAnyText(bodyText, candidates) {
  return candidates.some((candidate) => bodyText.includes(candidate))
}

module.exports = { TencentDocsBrowserAdapter }
