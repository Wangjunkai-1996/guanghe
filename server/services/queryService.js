const path = require('path')
const { WORK_ANALYSIS_URL, CONTENT_MANAGE_URL, DEFAULT_METRICS } = require('../lib/constants')
const { AppError } = require('../lib/errors')
const { ensureDir, writeJson, formatTimestamp, toArtifactUrl } = require('../lib/files')
const {
  dismissInterferingOverlays,
  navigateToWorkAnalysis,
  navigateToWorksManagement,
  searchWorkInList,
  extractWorksManagementData,
  fillContentId,
  pickDateRange30Days,
  chooseMetrics,
  createNetworkRecorder,
  findApiRecord,
  extractMetricFromApiRecord,
  settle
} = require('../lib/guangheUtils')
const { takePageScreenshot, createSummaryStripScreenshot, takeElementScreenshot } = require('./screenshotService')

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
        let worksData = null
        let worksPageScreenshotPath = ''
        let metrics = {}
        let apiRecord = null
        let rawScreenshotPath = ''

        // Initial check for login state
        await page.goto(WORK_ANALYSIS_URL, { waitUntil: 'domcontentloaded' })
        await settle(page)
        if (/login\.taobao\.com/i.test(page.url())) {
          this.accountStore.patch(accountId, { status: 'LOGIN_REQUIRED' })
          throw new AppError(401, 'ACCOUNT_LOGIN_REQUIRED', '当前账号登录态已失效，请重新扫码登录')
        }

        await dismissInterferingOverlays(page)

        // Phase 1: Works Management (for direct metrics & card screenshot)
        try {
          console.log('[Query] 正在进入作品管理页面...')
          // 使用更稳定的跳转方式
          await page.goto(CONTENT_MANAGE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
          await settle(page)
          await dismissInterferingOverlays(page)
          
          // 如果 URL 不对，尝试点侧边栏
          if (!page.url().includes('works-manage')) {
             console.log('[Query] 导航失败，尝试从侧边栏进入...')
             await navigateToWorksManagement(page)
          }

          const searchSucceeded = await searchWorkInList(page, contentId).catch(err => {
            console.warn('[Query] 作品搜索失败:', err.message)
            return false
          })

          // Debug: 拍一张搜索后的状态图，看看到底搜没搜到
          const searchDebugPath = path.join(artifactDir, '01-search-debug.png')
          await takePageScreenshot(page, searchDebugPath)

          if (searchSucceeded) {
            // 给个短等待确保搜索结果渲染
            await page.waitForTimeout(2000)
            worksData = await extractWorksManagementData(page, contentId)
            console.log('[Query] 作品管理数据抓取结果:', !!worksData)
            if (!worksData) {
               throw new AppError(404, 'WORKS_DATA_NOT_FOUND', '未能在作品管理页找到对应的作品卡片或提取数据')
            }
            if (worksData.rect) {
              await page.waitForTimeout(200)
              const cardScreenshotPath = path.join(artifactDir, 'work-card.png')
              await takeElementScreenshot(page, worksData.rect, cardScreenshotPath)
              worksData.cardUrl = toArtifactUrl(path.relative(this.artifactsRootDir, cardScreenshotPath))
            } else {
              // 如果没有 rect，但 worksData 有数据，说明数据抓到了但截图位置有问题，拍个全图保底
              worksPageScreenshotPath = path.join(artifactDir, '01-works-manage-full.png')
              await takePageScreenshot(page, worksPageScreenshotPath)
            }
          } else {
             throw new AppError(404, 'SEARCH_FAILED', '作品管理页搜索失败或未找到结果')
          }
        } catch (phase1Error) {
          console.error('[Query] 作品管理阶段异常:', phase1Error.message)
          if (phase1Error instanceof AppError) throw phase1Error
          throw new AppError(500, 'PHASE1_ERROR', '作品管理阶段发生未知错误: ' + phase1Error.message)
        }

        // Phase 2: Work Analysis (for detailed API metrics)
        try {
          console.log('[Query] 正在进入作品分析页面...')
          await page.goto(WORK_ANALYSIS_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
          await settle(page)
          await dismissInterferingOverlays(page)
          
          if (!page.url().includes('work-analysis')) {
             await navigateToWorkAnalysis(page)
          }

          await fillContentId(page, contentId)
          await pickDateRange30Days(page)

          const metricsApplied = await chooseMetrics(page, DEFAULT_METRICS)
          if (metricsApplied) {
            await settle(page)
            rawScreenshotPath = path.join(artifactDir, '04-results.png')
            await takePageScreenshot(page, rawScreenshotPath)

            apiRecord = findApiRecord(networkLog, contentId)
            if (apiRecord) {
              for (const metric of DEFAULT_METRICS) {
                metrics[metric] = extractMetricFromApiRecord(metric, apiRecord)
              }
            }
          }
        } catch (phase2Error) {
          console.error('[Query] 作品分析阶段异常:', phase2Error.message)
          // 如果用户强调逻辑，Phase 2 失败还是要中断
          throw phase2Error
        }

        const networkPath = path.join(artifactDir, 'network-log.json')
        writeJson(networkPath, networkLog)

        if (!apiRecord && !worksData) {
          throw new AppError(404, 'NO_DATA', '作品搜索成功，但未能从页面或网络日志中提取到任何数据', {
            artifacts: {
              networkLogUrl: toArtifactUrl(path.relative(this.artifactsRootDir, networkPath))
            }
          })
        }

        const resultPath = path.join(artifactDir, 'results.json')
        const summaryPath = path.join(artifactDir, '05-summary-strip.png')
        
        // 修改映射逻辑：STRICTLY SEPARATE
        const screenshots = {
          // rawUrl 是给 ResultPanel 里的“原始截图/作品管理截图”用的
          rawUrl: worksData?.cardUrl || (worksPageScreenshotPath ? toArtifactUrl(path.relative(this.artifactsRootDir, worksPageScreenshotPath)) : ''),
          // summaryUrl 是给“汇总截图/作品分析截图”用的
          summaryUrl: apiRecord ? toArtifactUrl(path.relative(this.artifactsRootDir, summaryPath)) : '',
          // 新增一个 analysisFullUrl 作为备查
          analysisFullUrl: rawScreenshotPath ? toArtifactUrl(path.relative(this.artifactsRootDir, rawScreenshotPath)) : ''
        }
        const artifacts = {
          resultUrl: toArtifactUrl(path.relative(this.artifactsRootDir, resultPath)),
          networkLogUrl: toArtifactUrl(path.relative(this.artifactsRootDir, networkPath))
        }

        if (apiRecord) {
          await createSummaryStripScreenshot(context, apiRecord, metrics, summaryPath)
        }

        const resultsPayload = {
          accountId,
          nickname: account.nickname,
          contentId,
          fetchedAt: new Date().toISOString(),
          pageUrl: page.url(),
          metrics: {
            ...metrics,
            ...worksData
          },
          screenshots: {
            ...screenshots,
            cardUrl: worksData?.cardUrl || ''
          },
          artifacts,
          apiRecord
        }

        writeJson(resultPath, resultsPayload)
        writeJson(networkPath, networkLog)

        return {
          accountId,
          nickname: account.nickname,
          contentId,
          fetchedAt: resultsPayload.fetchedAt,
          metrics: resultsPayload.metrics,
          screenshots: resultsPayload.screenshots,
          artifacts
        }
      } finally {
        await page.close().catch(() => {})
      }
    })
  }
}

module.exports = { GuangheQueryService }
