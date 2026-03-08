const path = require('path')
const { WORK_ANALYSIS_URL, DEFAULT_METRICS } = require('../lib/constants')
const { AppError } = require('../lib/errors')
const { ensureDir, writeJson, formatTimestamp, toArtifactUrl } = require('../lib/files')
const {
  dismissInterferingOverlays,
  navigateToWorkAnalysis,
  fillContentId,
  pickDateRange30Days,
  chooseMetrics,
  createNetworkRecorder,
  findApiRecord,
  extractMetricFromApiRecord,
  settle
} = require('../lib/guangheUtils')
const { takePageScreenshot, createSummaryStripScreenshot } = require('./screenshotService')

class GuangheQueryService {
  constructor({ browserManager, accountStore, artifactsRootDir }) {
    this.browserManager = browserManager
    this.accountStore = accountStore
    this.artifactsRootDir = artifactsRootDir
  }

  async queryByContentId({ accountId, contentId }) {
    const account = this.accountStore.get(accountId)
    if (!account) {
      throw new AppError(404, 'ACCOUNT_NOT_FOUND', '账号不存在')
    }

    return this.browserManager.runAccountTask(accountId, async () => {
      const { context } = await this.browserManager.getOrCreateAccountContext(account)
      const page = await context.newPage()
      const networkLog = await createNetworkRecorder(page)
      const artifactDir = path.join(this.artifactsRootDir, `${formatTimestamp()}-${accountId}-${contentId}`)
      ensureDir(artifactDir)

      try {
        await page.goto(WORK_ANALYSIS_URL, { waitUntil: 'domcontentloaded' })
        await settle(page)
        if (/login\.taobao\.com/i.test(page.url())) {
          this.accountStore.patch(accountId, { status: 'LOGIN_REQUIRED' })
          throw new AppError(401, 'ACCOUNT_LOGIN_REQUIRED', '当前账号登录态已失效，请重新扫码登录')
        }

        await dismissInterferingOverlays(page)
        await takePageScreenshot(page, path.join(artifactDir, '01-after-login.png'))

        const navSucceeded = await navigateToWorkAnalysis(page)
        if (!navSucceeded) {
          throw new AppError(500, 'NAVIGATION_FAILED', '没有自动进入作品分析页面')
        }

        await takePageScreenshot(page, path.join(artifactDir, '02-work-analysis.png'))
        await fillContentId(page, contentId)
        await pickDateRange30Days(page)

        const metricsApplied = await chooseMetrics(page, DEFAULT_METRICS)
        if (!metricsApplied) {
          throw new AppError(500, 'METRIC_PICKER_FAILED', '没有自动完成指标勾选')
        }

        await settle(page)
        const rawScreenshotPath = path.join(artifactDir, '04-results.png')
        const networkPath = path.join(artifactDir, 'network-log.json')
        await takePageScreenshot(page, rawScreenshotPath)

        const apiRecord = findApiRecord(networkLog, contentId)
        if (!apiRecord) {
          writeJson(networkPath, networkLog)
          throw new AppError(404, 'NO_DATA', '当前 ID 在近 30 日内无可查数据', {
            screenshots: {
              rawUrl: toArtifactUrl(path.relative(this.artifactsRootDir, rawScreenshotPath))
            },
            artifacts: {
              networkLogUrl: toArtifactUrl(path.relative(this.artifactsRootDir, networkPath))
            }
          })
        }

        const metrics = {}
        for (const metric of DEFAULT_METRICS) {
          metrics[metric] = extractMetricFromApiRecord(metric, apiRecord)
        }

        const resultsPayload = {
          accountId,
          nickname: account.nickname,
          contentId,
          fetchedAt: new Date().toISOString(),
          pageUrl: page.url(),
          metrics,
          apiRecord
        }

        const resultPath = path.join(artifactDir, 'results.json')
        const summaryPath = path.join(artifactDir, '05-summary-strip.png')

        writeJson(resultPath, resultsPayload)
        writeJson(networkPath, networkLog)
        await createSummaryStripScreenshot(context, apiRecord, metrics, summaryPath)

        return {
          accountId,
          nickname: account.nickname,
          contentId,
          fetchedAt: resultsPayload.fetchedAt,
          metrics,
          screenshots: {
            rawUrl: toArtifactUrl(path.relative(this.artifactsRootDir, rawScreenshotPath)),
            summaryUrl: toArtifactUrl(path.relative(this.artifactsRootDir, summaryPath))
          },
          artifacts: {
            resultUrl: toArtifactUrl(path.relative(this.artifactsRootDir, resultPath)),
            networkLogUrl: toArtifactUrl(path.relative(this.artifactsRootDir, networkPath))
          }
        }
      } finally {
        await page.close().catch(() => {})
      }
    })
  }
}

module.exports = { GuangheQueryService }
