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
  findWorksManagementApiRecord,
  extractWorksManagementMetrics,
  fillContentId,
  pickDateRange30Days,
  chooseMetrics,
  createNetworkRecorder,
  findApiRecord,
  extractMetricFromApiRecord,
  settle
} = require('../lib/guangheUtils')
const { takePageScreenshot, createSummaryStripScreenshot, takeElementScreenshot } = require('./screenshotService')

const DEBUG_QUERY_ARTIFACTS = process.env.DEBUG_QUERY_ARTIFACTS === 'true' || process.env.DEBUG_ARTIFACTS === 'true'

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

      const assertAccountLoggedIn = async () => {
        if (/login\.taobao\.com/i.test(page.url())) {
          this.accountStore.patch(accountId, { status: 'LOGIN_REQUIRED' })
          throw new AppError(401, 'ACCOUNT_LOGIN_REQUIRED', '当前账号登录态已失效，请重新扫码登录')
        }
      }

      try {
        let worksData = null
        let worksPageScreenshotPath = ''
        let metrics = {}
        let apiRecord = null
        let rawScreenshotPath = ''

        // Phase 1: Works Management (for direct metrics & card screenshot)
        try {
          console.log('[Query] 正在进入作品管理页面...')
          // 使用更稳定的跳转方式
          await page.goto(CONTENT_MANAGE_URL, { waitUntil: 'domcontentloaded' }).catch(() => {})
          await settle(page)
          await assertAccountLoggedIn()
          await dismissInterferingOverlays(page)

          // 如果 URL 不对或页面是 404，尝试点侧边栏
          const isNotFound = await page.evaluate(() => {
            const text = (document.body && document.body.innerText) || ''
            return /页面找不到|404/.test(text)
          }).catch(() => false)

          const isWorksManageUrl = /works-manage|page\/workspace\/tb/i.test(page.url())
          if (!isWorksManageUrl || isNotFound) {
            console.log('[Query] 导航失败或页面 404，尝试从侧边栏进入作品管理...')
            const navigated = await navigateToWorksManagement(page)
            console.log('[Query] 侧边栏进入作品管理结果:', navigated, 'currentUrl=', page.url())
          }

          let searchResult = await searchWorkInList(page, contentId).catch(err => {
            console.warn('[Query] 作品搜索失败:', err.message)
            return { ok: false, reason: 'SEARCH_EXCEPTION' }
          })

          if (searchResult?.reason === 'INPUT_NOT_FOUND') {
            console.log('[Query] 未找到作品管理搜索框，尝试重新导航后再搜索...')
            const navigated = await navigateToWorksManagement(page)
            console.log('[Query] 侧边栏进入作品管理结果(重试):', navigated, 'currentUrl=', page.url())
            searchResult = await searchWorkInList(page, contentId).catch(err => {
              console.warn('[Query] 作品搜索失败(重试):', err.message)
              return { ok: false, reason: 'SEARCH_EXCEPTION' }
            })
          }
          if (searchResult?.ok) {
            console.log(
              `[Query] 作品管理搜索完成: trigger=${searchResult.trigger}, foundId=${searchResult.foundId}, rowCount=${searchResult.rowCount}, cellCount=${searchResult.cellCount}`
            )
          }

          if (DEBUG_QUERY_ARTIFACTS) {
            const searchDebugPath = path.join(artifactDir, '01-search-debug.png')
            await takePageScreenshot(page, searchDebugPath)
          }

          if (searchResult?.ok) {
            const worksApiRecord = findWorksManagementApiRecord(networkLog, contentId)
            const worksDomData = await extractWorksManagementData(page, contentId)
            if (worksApiRecord) {
              const apiMetrics = extractWorksManagementMetrics(worksApiRecord)
              worksData = {
                ...apiMetrics,
                ...(worksDomData?.rect ? { rect: worksDomData.rect } : {}),
                ...(worksDomData?.cardUrl ? { cardUrl: worksDomData.cardUrl } : {})
              }
            } else {
              worksData = worksDomData
            }
            console.log('[Query] 作品管理数据抓取结果:', !!worksData, worksData ? {
              viewCount: worksData.viewCount,
              likeCount: worksData.likeCount,
              collectCount: worksData.collectCount,
              commentCount: worksData.commentCount,
              source: worksData.source || ''
            } : null)
            if (!worksData) {
               console.warn('[Query] 作品管理未命中数据', {
                 trigger: searchResult?.trigger,
                 foundId: searchResult?.foundId,
                 rowCount: searchResult?.rowCount,
                 cellCount: searchResult?.cellCount
               })
               throw new AppError(404, 'WORKS_DATA_NOT_FOUND', '未能在作品管理页找到对应的作品卡片或提取数据')
            }
            if (worksData.rect) {
              await page.waitForTimeout(200)
              const cardScreenshotPath = path.join(artifactDir, 'work-card.png')
              const clipRect = {
                x: worksData.rect.x,
                y: worksData.rect.y,
                width: Math.max(1, worksData.rect.width / 3),
                height: worksData.rect.height
              }
              await takeElementScreenshot(page, clipRect, cardScreenshotPath)
              worksData.cardUrl = toArtifactUrl(path.relative(this.artifactsRootDir, cardScreenshotPath))
            } else {
              // 如果没有 rect，但 worksData 有数据，说明数据抓到了但截图位置有问题，拍个全图保底
              worksPageScreenshotPath = path.join(artifactDir, '01-works-manage-full.png')
              await takePageScreenshot(page, worksPageScreenshotPath)
            }
          } else {
             console.warn('[Query] 作品管理搜索失败', searchResult)
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
          await assertAccountLoggedIn()
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
