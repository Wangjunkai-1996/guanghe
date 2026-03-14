const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { readJson, writeJson, ensureDir, toArtifactUrl } = require('../../lib/files')
const { TencentDocsJobStore } = require('./jobStore')
const { TencentDocsWorkspaceStore } = require('./workspaceStore')
const { TencentDocsLoginService } = require('./loginService')
const { buildTencentDocsRow, buildTencentDocsHandoffPatch } = require('./mapping')
const { TencentDocsBrowserAdapter } = require('./browserAdapter')
const { createTencentDocsError, ERROR_CODES, serializeSyncError } = require('./errors')

const REQUIRED_HANDOFF_COLUMNS = ['查看次数截图', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数']
const REQUIRED_DEMAND_COLUMNS = ['查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数']
const EMPTY_CELL_VALUES = new Set(['', '-', '--'])
const MATCH_SCAN_BATCH_ROWS = 200
const MATCH_SCAN_MAX_ROWS = 5000
const INSPECT_CACHE_TTL_MS = 15 * 1000

class TencentDocsSyncService {
  constructor({ config, adapter, jobStore, workspaceStore, loginService }) {
    const resolvedStateFile = resolveTencentDocsStateFile(config)
    this.config = {
      ...config,
      stateFile: resolvedStateFile
    }
    this.jobStore = jobStore || new TencentDocsJobStore({ jobsFile: this.config.jobsFile })
    this.workspaceStore = workspaceStore || new TencentDocsWorkspaceStore({ filePath: this.config.stateFile })
    this.adapter = adapter || new TencentDocsBrowserAdapter({
      browserExecutablePath: this.config.browserExecutablePath,
      profileDir: this.config.profileDir,
      headless: this.config.headless
    })
    this.loginService = loginService || new TencentDocsLoginService({
      browserExecutablePath: this.config.browserExecutablePath,
      profileDir: this.config.profileDir,
      artifactsRootDir: this.config.artifactsRootDir,
      headless: this.config.headless,
      defaultDocUrl: this.config.docUrl,
      onStateChange: (login) => {
        this.workspaceStore.saveLogin(login)
      }
    })
    this.docQueues = new Map()
    this.browserOperationQueue = Promise.resolve()
    this._lastInspectCache = null
    this.jobStore.markStaleJobsFailed()
  }

  getConfig() {
    const target = this.getDefaultTarget()
    const login = this.workspaceStore.getLogin()
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
      defaultTargetConfigured: Boolean(target.docUrl && target.sheetName),
      defaultSheetName: target.sheetName || '',
      defaultWriteMode: this.normalizeMode(this.config.writeMode),
      target,
      login
    }
  }

  setConfig({ docUrl, sheetName } = {}) {
    if (docUrl) {
      try {
        new URL(docUrl)
      } catch (_error) {
        throw createTencentDocsError(400, ERROR_CODES.REQUEST_INVALID, '腾讯文档链接格式不正确')
      }
    }

    this.workspaceStore.saveTarget({ docUrl, sheetName })
    this.invalidateInspectCache()
    return this.getConfig()
  }

  async createLoginSession({ target } = {}) {
    this.ensureEnabled()
    const resolvedDocUrl = String(target?.docUrl || this.getDefaultTarget().docUrl || 'https://docs.qq.com/desktop/').trim()
    return this.runSerializedBrowserOperation(async () => {
      this.workspaceStore.saveLogin({ status: 'WAITING_QR', updatedAt: new Date().toISOString(), error: null })
      return this.loginService.createLoginSession({ docUrl: resolvedDocUrl })
    })
  }

  getLoginSession(loginSessionId) {
    return this.loginService.getLoginSession(loginSessionId)
  }

  previewJob({ source }) {
    const resultPayload = this.loadResultPayload(source)
    return buildTencentDocsRow(resultPayload, {
      toolBaseUrl: this.config.toolBaseUrl,
      timezone: this.config.timezone
    })
  }

  async inspectSheet({ target, maxRows, forceRefresh = false }) {
    this.ensureEnabled()
    const resolvedTarget = this.resolveTarget(target, { allowMissingSheetName: true })
    const normalizedMaxRows = this.normalizeInspectMaxRows(maxRows)

    if (this.hasFreshInspectCache(resolvedTarget, { forceRefresh })) {
      return this._lastInspectCache.data
    }

    const snapshot = await this.readSheetDemandSnapshot({
      target: resolvedTarget,
      maxRows: normalizedMaxRows,
      artifactDir: this.getInspectArtifactDir(),
      strict: false
    })

    const payload = {
      ...snapshot,
      maxRows: normalizedMaxRows,
      artifacts: this.buildInspectArtifactUrls()
    }

    this.saveInspectCache(payload.target || resolvedTarget, payload)

    return payload
  }

  async matchDemandByNickname({ nickname, accountId, target, maxRows } = {}) {
    this.ensureEnabled()
    const snapshot = await this.scanSheetDemandSnapshot({
      target,
      maxRows: this.normalizeScanMaxRows(maxRows),
      artifactDir: this.getInspectArtifactDir(),
      strict: false
    })

    return {
      snapshot,
      target: snapshot.target,
      match: resolveDemandMatch(snapshot.demands, { nickname, accountId })
    }
  }

  async previewHandoffSync({ source, target, maxRows, match }) {
    const prepared = await this.prepareHandoffSync({ source, target, maxRows, match })
    return this.serializeHandoffOperation(prepared)
  }

  async syncHandoffRow({ source, target, maxRows, match }) {
    const prepared = await this.prepareHandoffSync({ source, target, maxRows, match })

    try {
      if (prepared.columns.length === 0) {
        const writeSummary = {
          action: 'SKIPPED',
          sheetRow: prepared.match.sheetRow,
          matchedBy: prepared.match.matchedBy || ['内容id'],
          columnsUpdated: [],
          columnIndexes: []
        }

        writeJson(path.join(prepared.artifactDir, 'handoff-write-log.json'), {
          operationId: prepared.operationId,
          source: prepared.source,
          target: prepared.target,
          match: prepared.match,
          patch: prepared.patch,
          columns: prepared.columns,
          writeSummary,
          completedAt: new Date().toISOString()
        })

        return {
          ...this.serializeHandoffOperation(prepared),
          writeSummary
        }
      }

      const writeSummary = await this.runSerializedBrowserOperation(async () => {
        this.ensureBrowserProfileAvailable()
        return this.adapter.updateRowCells({
          target: prepared.target,
          sheetRow: prepared.match.sheetRow,
          cells: prepared.columns,
          artifactDir: prepared.artifactDir
        })
      })

      writeJson(path.join(prepared.artifactDir, 'handoff-write-log.json'), {
        operationId: prepared.operationId,
        source: prepared.source,
        target: prepared.target,
        match: prepared.match,
        patch: prepared.patch,
        columns: prepared.columns,
        writeSummary,
        completedAt: new Date().toISOString()
      })

      const cacheUpdateState = this.refreshInspectCacheAfterHandoff({
        target: prepared.target,
        sheetRow: prepared.match.sheetRow,
        columns: prepared.columns,
        writeSummary
      })
      if (cacheUpdateState === false) {
        this.invalidateInspectCache(prepared.target)
      }

      return {
        ...this.serializeHandoffOperation(prepared),
        writeSummary
      }
    } catch (error) {
      if (error?.code === ERROR_CODES.LOGIN_REQUIRED) {
        this.workspaceStore.saveLogin({
          status: 'FAILED',
          updatedAt: new Date().toISOString(),
          error: serializeSyncError(error)
        })
      }
      const wrappedError = enrichHandoffError(error, prepared)
      writeJson(path.join(prepared.artifactDir, 'handoff-write-log.json'), {
        operationId: prepared.operationId,
        source: prepared.source,
        target: prepared.target,
        match: prepared.match,
        patch: prepared.patch,
        columns: prepared.columns,
        error: serializeSyncError(wrappedError),
        failedAt: new Date().toISOString()
      })
      throw wrappedError
    }
  }

  createJob({ source, target, mode }) {
    this.ensureEnabled()
    const resultPayload = this.loadResultPayload(source)
    const preview = buildTencentDocsRow(resultPayload, {
      toolBaseUrl: this.config.toolBaseUrl,
      timezone: this.config.timezone
    })
    const resolvedTarget = this.resolveTarget(target)
    const normalizedMode = this.normalizeMode(mode)
    const jobId = crypto.randomUUID()
    const storedJob = {
      jobId,
      status: 'PENDING',
      mode: normalizedMode,
      syncKey: preview.syncKey,
      source: {
        resultUrl: source.resultUrl,
        accountId: String(resultPayload.accountId),
        contentId: String(resultPayload.contentId),
        fetchedAt: resultPayload.fetchedAt
      },
      target: resolvedTarget,
      row: preview.row,
      columns: preview.columns,
      omittedColumns: preview.omittedColumns,
      warnings: preview.warnings,
      artifacts: this.buildArtifactUrls(jobId),
      writeSummary: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    this.jobStore.createJob(storedJob)
    this.enqueueJob(jobId)
    return this.serializeJob(storedJob)
  }

  getJob(jobId) {
    const storedJob = this.jobStore.getJob(jobId)
    if (!storedJob) {
      throw createTencentDocsError(404, ERROR_CODES.JOB_NOT_FOUND, '同步任务不存在')
    }
    return this.serializeJob(storedJob)
  }

  enqueueJob(jobId) {
    const storedJob = this.getStoredJob(jobId)
    const queueKey = `${storedJob.target.docUrl}:${storedJob.target.sheetName}`
    const previous = this.docQueues.get(queueKey) || Promise.resolve()
    const current = previous
      .catch(() => { })
      .then(() => this.runJob(jobId))

    const tracked = current.finally(() => {
      if (this.docQueues.get(queueKey) === tracked) {
        this.docQueues.delete(queueKey)
      }
    })

    this.docQueues.set(queueKey, tracked)
    return tracked
  }

  async runJob(jobId) {
    const job = this.getStoredJob(jobId)
    if (!job || job.status !== 'PENDING') return job

    this.jobStore.updateJob(jobId, { status: 'RUNNING', error: null })
    const runningJob = this.getStoredJob(jobId)
    const artifactDir = this.getArtifactDir(jobId)
    ensureDir(artifactDir)

    try {
      const writeSummary = await this.adapter.writeRow({
        jobId,
        target: runningJob.target,
        mode: runningJob.mode,
        syncKey: runningJob.syncKey,
        row: runningJob.row,
        columns: runningJob.columns,
        artifactDir
      })

      writeJson(path.join(artifactDir, 'write-log.json'), {
        jobId,
        status: 'SUCCEEDED',
        mode: runningJob.mode,
        target: runningJob.target,
        syncKey: runningJob.syncKey,
        writeSummary,
        createdAt: runningJob.createdAt,
        completedAt: new Date().toISOString()
      })

      const completedJob = this.jobStore.updateJob(jobId, {
        status: 'SUCCEEDED',
        writeSummary,
        error: null,
        artifacts: this.buildArtifactUrls(jobId)
      })

      this.invalidateInspectCache(runningJob.target)

      return completedJob
    } catch (error) {
      const serializedError = serializeSyncError(error)
      writeJson(path.join(artifactDir, 'write-log.json'), {
        jobId,
        status: 'FAILED',
        mode: runningJob.mode,
        target: runningJob.target,
        syncKey: runningJob.syncKey,
        error: serializedError,
        failedAt: new Date().toISOString()
      })

      return this.jobStore.updateJob(jobId, {
        status: 'FAILED',
        error: serializedError,
        artifacts: this.buildArtifactUrls(jobId)
      })
    }
  }

  ensureEnabled() {
    if (!this.config.enabled) {
      throw createTencentDocsError(400, ERROR_CODES.NOT_CONFIGURED, '腾讯文档同步功能未启用')
    }
  }

  loadResultPayload(source) {
    if (!source?.resultUrl) {
      throw createTencentDocsError(400, ERROR_CODES.REQUEST_INVALID, 'source.resultUrl 不能为空')
    }

    const resultFile = this.resolveArtifactFile(source.resultUrl)
    if (!fs.existsSync(resultFile)) {
      throw createTencentDocsError(404, ERROR_CODES.RESULT_NOT_FOUND, '结果文件不存在')
    }

    const payload = readJson(resultFile, null)
    if (!payload) {
      throw createTencentDocsError(400, ERROR_CODES.RESULT_NOT_FOUND, '结果文件无法解析')
    }
    return this.enrichResultPayloadArtifacts(payload, resultFile)
  }

  enrichResultPayloadArtifacts(payload, resultFile) {
    const relativeDir = path.relative(this.config.artifactsRootDir, path.dirname(resultFile))
    const worksManagePath = path.join(path.dirname(resultFile), '01-works-manage-full.png')
    const analysisFullPath = path.join(path.dirname(resultFile), '04-results.png')
    const screenshotSummaryPath = path.join(path.dirname(resultFile), '05-summary-strip.png')
    const screenshotCardPath = path.join(path.dirname(resultFile), 'work-card.png')
    const screenshotCardCellPath = path.join(path.dirname(resultFile), 'work-card-cell.png')
    const networkLogPath = path.join(path.dirname(resultFile), 'network-log.json')

    const screenshots = {
      // 原始图/作品管理图 (修正文件名为 queryService 实际生成的 -full 后缀)
      rawUrl: payload?.screenshots?.rawUrl || (fs.existsSync(worksManagePath) ? toArtifactUrl(path.join(relativeDir, '01-works-manage-full.png')) : ''),
      // 汇总条图
      summaryUrl: payload?.screenshots?.summaryUrl || (fs.existsSync(screenshotSummaryPath) ? toArtifactUrl(path.join(relativeDir, '05-summary-strip.png')) : ''),
      // 列表卡片小眼睛截图
      cardUrl: payload?.screenshots?.cardUrl || payload?.metrics?.cardUrl || (fs.existsSync(screenshotCardPath) ? toArtifactUrl(path.join(relativeDir, 'work-card.png')) : ''),
      // 列表卡片单元格专用图
      cardCellUrl: payload?.screenshots?.cardCellUrl || (fs.existsSync(screenshotCardCellPath) ? toArtifactUrl(path.join(relativeDir, 'work-card-cell.png')) : ''),
      // 作品分析详情大图
      analysisFullUrl: payload?.screenshots?.analysisFullUrl || (fs.existsSync(analysisFullPath) ? toArtifactUrl(path.join(relativeDir, '04-results.png')) : '')
    }

    const artifacts = {
      resultUrl: payload?.artifacts?.resultUrl || toArtifactUrl(path.join(relativeDir, 'results.json')),
      networkLogUrl: payload?.artifacts?.networkLogUrl || (fs.existsSync(networkLogPath) ? toArtifactUrl(path.join(relativeDir, 'network-log.json')) : '')
    }

    return {
      ...payload,
      screenshots,
      artifacts
    }
  }

  getDefaultTarget() {
    return this.workspaceStore.getTarget({
      docUrl: this.config.docUrl,
      sheetName: this.config.sheetName
    })
  }

  resolveTarget(target, { allowMissingSheetName = false, allowMissingDocUrl = false } = {}) {
    const defaults = this.getDefaultTarget()
    const docUrl = String(target?.docUrl || defaults.docUrl || '').trim()
    const sheetName = String(target?.sheetName ?? defaults.sheetName ?? '').trim()
    if (!docUrl && !allowMissingDocUrl) {
      throw createTencentDocsError(400, ERROR_CODES.NOT_CONFIGURED, '腾讯文档默认目标未配置，请提供 docUrl 和 sheetName')
    }
    if (!allowMissingSheetName && !sheetName) {
      throw createTencentDocsError(400, ERROR_CODES.NOT_CONFIGURED, '腾讯文档默认目标未配置，请提供 docUrl 和 sheetName')
    }

    return { docUrl, sheetName }
  }

  ensureBrowserProfileAvailable() {
    if (this.loginService?.hasActiveSession?.()) {
      throw createTencentDocsError(409, ERROR_CODES.BROWSER_PROFILE_BUSY, '腾讯文档登录二维码正在占用浏览器，请先完成登录后再检查工作表')
    }
  }

  runSerializedBrowserOperation(operation) {
    const previous = this.browserOperationQueue
    let releaseQueue = () => { }
    this.browserOperationQueue = new Promise((resolve) => {
      releaseQueue = resolve
    })

    return previous
      .catch(() => { })
      .then(() => operation())
      .finally(() => releaseQueue())
  }

  normalizeMode(mode) {
    const candidate = String(mode || this.config.writeMode || 'upsert').toLowerCase()
    return candidate === 'append' ? 'append' : 'upsert'
  }

  normalizeInspectMaxRows(maxRows) {
    const value = Number(maxRows || 20)
    if (!Number.isFinite(value)) return 20
    return Math.max(1, Math.min(200, Math.floor(value)))
  }

  normalizeScanMaxRows(maxRows) {
    if (maxRows === undefined || maxRows === null || maxRows === '') {
      return MATCH_SCAN_MAX_ROWS
    }

    const value = Number(maxRows)
    if (!Number.isFinite(value)) return MATCH_SCAN_MAX_ROWS
    return Math.max(1, Math.min(MATCH_SCAN_MAX_ROWS, Math.floor(value)))
  }

  resolveArtifactFile(resultUrl) {
    let pathname = String(resultUrl)
    if (/^https?:\/\//.test(pathname)) {
      pathname = new URL(pathname).pathname
    }

    if (!pathname.startsWith('/api/artifacts/')) {
      throw createTencentDocsError(400, ERROR_CODES.REQUEST_INVALID, 'resultUrl 必须是 /api/artifacts/* 地址')
    }

    const relativePath = pathname.replace('/api/artifacts/', '')
      .split('/')
      .map(decodeURIComponent)
      .join(path.sep)

    const fullPath = path.resolve(this.config.artifactsRootDir, relativePath)
    if (!fullPath.startsWith(this.config.artifactsRootDir)) {
      throw createTencentDocsError(400, ERROR_CODES.REQUEST_INVALID, 'resultUrl 指向了非法路径')
    }

    return fullPath
  }

  getArtifactDir(jobId) {
    return path.join(this.config.artifactsRootDir, 'tencent-docs', jobId)
  }

  getInspectArtifactDir() {
    return path.join(this.config.artifactsRootDir, 'tencent-docs', 'inspect')
  }

  buildArtifactUrls(jobId) {
    const base = path.join('tencent-docs', jobId)
    return {
      beforeWriteUrl: toArtifactUrl(path.join(base, 'before-write.png')),
      afterWriteUrl: toArtifactUrl(path.join(base, 'after-write.png')),
      errorUrl: toArtifactUrl(path.join(base, 'error.png')),
      writeLogUrl: toArtifactUrl(path.join(base, 'write-log.json'))
    }
  }

  buildInspectArtifactUrls() {
    const base = path.join('tencent-docs', 'inspect')
    return {
      beforeReadUrl: toArtifactUrl(path.join(base, 'before-read.png')),
      afterReadUrl: toArtifactUrl(path.join(base, 'after-read.png')),
      errorUrl: toArtifactUrl(path.join(base, 'error.png')),
      selectionTsvUrl: toArtifactUrl(path.join(base, 'sheet-selection.tsv')),
      previewJsonUrl: toArtifactUrl(path.join(base, 'sheet-preview.json'))
    }
  }

  hasFreshInspectCache(target, { forceRefresh = false } = {}) {
    if (forceRefresh || !this._lastInspectCache) return false

    const cacheAgeMs = Date.now() - Number(this._lastInspectCache.timestamp || 0)
    if (!Number.isFinite(cacheAgeMs) || cacheAgeMs > INSPECT_CACHE_TTL_MS) {
      this._lastInspectCache = null
      return false
    }

    return targetsMatch(this._lastInspectCache.target, target)
  }

  saveInspectCache(target, data) {
    this._lastInspectCache = {
      target: {
        docUrl: String(target?.docUrl || '').trim(),
        sheetName: String(target?.sheetName || '').trim()
      },
      data,
      timestamp: Date.now()
    }
  }

  invalidateInspectCache(target = null) {
    if (!this._lastInspectCache) return
    if (!target || targetsMatch(this._lastInspectCache.target, target)) {
      this._lastInspectCache = null
    }
  }

  refreshInspectCacheAfterHandoff({ target, sheetRow, columns, writeSummary } = {}) {
    if (!this._lastInspectCache || !targetsMatch(this._lastInspectCache.target, target)) return null

    const nextData = applyHandoffSyncToInspectPayload(this._lastInspectCache.data, {
      sheetRow,
      columns,
      writeSummary
    })

    if (!nextData) return false
    this.saveInspectCache(target, nextData)
    return true
  }

  async readSheetDemandSnapshot({ target, maxRows, artifactDir, strict = true }) {
    const resolvedTarget = this.resolveTarget(target, { allowMissingSheetName: true })
    ensureDir(artifactDir)

    try {
      const snapshot = await this.runSerializedBrowserOperation(async () => {
        this.ensureBrowserProfileAvailable()
        return this.adapter.readSheet({
          target: resolvedTarget,
          maxRows,
          artifactDir,
          strict
        })
      })
      this.workspaceStore.saveLogin({ status: 'LOGGED_IN', updatedAt: new Date().toISOString(), error: null })
      const demands = buildSheetDemands(snapshot.rows)
      return {
        ...snapshot,
        demands,
        summary: buildSheetSummary(demands)
      }
    } catch (error) {
      if (error?.code === ERROR_CODES.LOGIN_REQUIRED) {
        this.workspaceStore.saveLogin({
          status: 'FAILED',
          updatedAt: new Date().toISOString(),
          error: serializeSyncError(error)
        })
      }
      throw error
    }
  }

  async readSheetDemandWindow({ target, startRow, maxRows, headers, artifactDir, strict = true }) {
    const resolvedTarget = this.resolveTarget(target, { allowMissingSheetName: true })
    ensureDir(artifactDir)

    try {
      const snapshot = await this.runSerializedBrowserOperation(async () => {
        this.ensureBrowserProfileAvailable()

        if (typeof this.adapter.readSheetWindow === 'function') {
          return this.adapter.readSheetWindow({
            target: resolvedTarget,
            startRow,
            maxRows,
            headers,
            artifactDir,
            strict
          })
        }

        const fallback = await this.adapter.readSheet({
          target: resolvedTarget,
          maxRows: Math.max(this.normalizeInspectMaxRows(maxRows), Number(startRow || 2)),
          artifactDir,
          strict
        })

        return {
          ...fallback,
          rows: (fallback.rows || []).filter((row) => Number(row.sheetRow) >= Number(startRow || 2)).slice(0, this.normalizeInspectMaxRows(maxRows))
        }
      })
      this.workspaceStore.saveLogin({ status: 'LOGGED_IN', updatedAt: new Date().toISOString(), error: null })
      if (Number(startRow || 2) > 2 && looksLikeRepeatedHeaderWindow(snapshot)) {
        return {
          ...snapshot,
          rowCount: 0,
          rows: []
        }
      }
      return snapshot
    } catch (error) {
      if (error?.code === ERROR_CODES.LOGIN_REQUIRED) {
        this.workspaceStore.saveLogin({
          status: 'FAILED',
          updatedAt: new Date().toISOString(),
          error: serializeSyncError(error)
        })
      }
      if (error?.code === ERROR_CODES.SELECTION_UNSAFE && Number(startRow || 2) > 2) {
        return {
          target: resolvedTarget,
          startRow,
          maxRows,
          columnCount: Array.isArray(headers) ? headers.length : 0,
          headers: Array.isArray(headers) ? headers : [],
          rowCount: 0,
          rows: []
        }
      }
      throw error
    }
  }

  async scanSheetDemandSnapshot({ target, maxRows, artifactDir, strict = true }) {
    const scanLimit = this.normalizeScanMaxRows(maxRows)

    if (typeof this.adapter.readSheetBatches === 'function') {
      const resolvedTarget = this.resolveTarget(target, { allowMissingSheetName: true })
      ensureDir(artifactDir)

      try {
        const snapshot = await this.runSerializedBrowserOperation(async () => {
          this.ensureBrowserProfileAvailable()
          return this.adapter.readSheetBatches({
            target: resolvedTarget,
            maxRows: scanLimit,
            batchSize: MATCH_SCAN_BATCH_ROWS,
            artifactDir,
            strict
          })
        })
        this.workspaceStore.saveLogin({ status: 'LOGGED_IN', updatedAt: new Date().toISOString(), error: null })
        const demands = buildSheetDemands(snapshot.rows)
        return {
          ...snapshot,
          maxRows: scanLimit,
          demands,
          summary: buildSheetSummary(demands)
        }
      } catch (error) {
        if (error?.code === ERROR_CODES.LOGIN_REQUIRED) {
          this.workspaceStore.saveLogin({
            status: 'FAILED',
            updatedAt: new Date().toISOString(),
            error: serializeSyncError(error)
          })
        }
        throw error
      }
    }

    const firstBatchSize = Math.min(MATCH_SCAN_BATCH_ROWS, scanLimit)
    const firstSnapshot = await this.readSheetDemandSnapshot({
      target,
      maxRows: firstBatchSize,
      artifactDir,
      strict
    })

    const rows = [...firstSnapshot.rows]
    if (rows.length >= firstBatchSize) {
      let nextStartRow = firstBatchSize + 2

      while (nextStartRow <= scanLimit + 1) {
        const consumedRows = nextStartRow - 2
        const remaining = scanLimit - consumedRows
        if (remaining <= 0) break

        const windowSize = Math.min(MATCH_SCAN_BATCH_ROWS, remaining)
        const windowSnapshot = await this.readSheetDemandWindow({
          target: firstSnapshot.target,
          startRow: nextStartRow,
          maxRows: windowSize,
          headers: firstSnapshot.headers,
          artifactDir,
          strict
        })

        if (!windowSnapshot.rows?.length) {
          break
        }

        rows.push(...windowSnapshot.rows)
        nextStartRow += windowSize
        if (windowSnapshot.rows.length < windowSize) {
          break
        }
      }
    }

    const demands = buildSheetDemands(rows)
    return {
      ...firstSnapshot,
      rows,
      rowCount: rows.length,
      maxRows: scanLimit,
      demands,
      summary: buildSheetSummary(demands)
    }
  }

  async readLockedHandoffSnapshot({ target, sheetRow, artifactDir }) {
    const headerSnapshot = await this.readSheetDemandSnapshot({
      target,
      maxRows: 1,
      artifactDir,
      strict: true
    })

    const rowSnapshot = await this.readSheetDemandWindow({
      target: headerSnapshot.target,
      startRow: Math.max(2, Number(sheetRow || 2)),
      maxRows: 1,
      headers: headerSnapshot.headers,
      artifactDir,
      strict: true
    })

    return {
      ...headerSnapshot,
      rows: rowSnapshot.rows || []
    }
  }

  async prepareHandoffSync({ source, target, maxRows, match }) {
    this.ensureEnabled()
    const resultPayload = this.loadResultPayload(source)
    const targetConfig = this.resolveTarget(target)
    const normalizedMaxRows = this.normalizeScanMaxRows(maxRows)
    const operationId = crypto.randomUUID()
    const artifactDir = this.getHandoffArtifactDir(operationId)
    const artifacts = this.buildHandoffArtifactUrls(operationId)
    ensureDir(artifactDir)

    let sheet = null

    try {
      const patchPreview = buildTencentDocsHandoffPatch(resultPayload, {
        toolBaseUrl: this.config.toolBaseUrl
      })

      console.log(`[TencentDocs] 准备回填行数据 (Operation:${operationId}):`, {
        contentId: resultPayload.contentId,
        '查看次数截图': patchPreview.row['查看次数截图'],
        '前端小眼睛截图': patchPreview.row['前端小眼睛截图']
      })

      sheet = match?.sheetRow
        ? await this.readLockedHandoffSnapshot({
          target: targetConfig,
          sheetRow: match.sheetRow,
          artifactDir
        })
        : await this.scanSheetDemandSnapshot({
          target: targetConfig,
          maxRows: normalizedMaxRows,
          artifactDir,
          strict: true
        })

      const resolvedMatch = match?.sheetRow
        ? this.resolveLockedHandoffMatch(sheet.rows, resultPayload, match)
        : this.matchHandoffRow(sheet.rows, resultPayload)
      const { columns, skippedColumns } = this.resolveHandoffColumns(sheet.headers, patchPreview.row, patchPreview.columns)
      const warnings = patchPreview.warnings.slice()
      if (skippedColumns.length > 0) {
        warnings.push(`为保护交接表，已跳过空值列：${skippedColumns.join('、')}`)
      }

      return {
        operationId,
        artifactDir,
        source: {
          resultUrl: source.resultUrl,
          accountId: String(resultPayload.accountId),
          nickname: resultPayload.nickname || '',
          contentId: String(resultPayload.contentId)
        },
        target: sheet.target,
        sheet,
        maxRows: normalizedMaxRows,
        match: resolvedMatch,
        patch: patchPreview.row,
        warnings,
        columns,
        artifacts
      }
    } catch (error) {
      throw enrichHandoffError(error, {
        operationId,
        target: sheet?.target || targetConfig,
        artifacts
      })
    }
  }

  matchHandoffRow(rows, resultPayload) {
    const contentId = String(resultPayload.contentId || '')
    const nickname = String(resultPayload.nickname || '')
    const matchedRow = rows.find((row) => String(row.contentId || '').trim() === contentId)

    if (!matchedRow) {
      throw createTencentDocsError(404, ERROR_CODES.ROW_NOT_FOUND, `未在腾讯文档中找到内容id=${contentId} 对应的行`, {
        contentId,
        nickname
      })
    }

    return {
      sheetRow: matchedRow.sheetRow,
      nickname: matchedRow.nickname || '',
      contentId: matchedRow.contentId || '',
      matchedBy: ['内容id']
    }
  }

  resolveLockedHandoffMatch(rows, resultPayload, match) {
    const expectedSheetRow = Number(match?.sheetRow)
    const expectedNickname = String(match?.nickname || resultPayload.nickname || '')
    const expectedContentId = String(match?.contentId || resultPayload.contentId || '')
    const matchedRow = rows.find((row) => Number(row.sheetRow) === expectedSheetRow)

    if (!matchedRow) {
      throw createTencentDocsError(409, ERROR_CODES.ROW_CHANGED, `腾讯文档第 ${expectedSheetRow} 行已不存在，请重新检查交接表`, {
        expected: {
          sheetRow: expectedSheetRow,
          nickname: expectedNickname,
          contentId: expectedContentId
        }
      })
    }

    if (
      normalizeNickname(matchedRow.nickname) !== normalizeNickname(expectedNickname)
      || String(matchedRow.contentId || '').trim() !== String(expectedContentId || '').trim()
    ) {
      throw createTencentDocsError(409, ERROR_CODES.ROW_CHANGED, `腾讯文档第 ${expectedSheetRow} 行内容已变更，请重新检查交接表`, {
        expected: {
          sheetRow: expectedSheetRow,
          nickname: expectedNickname,
          contentId: expectedContentId
        },
        actual: {
          sheetRow: matchedRow.sheetRow,
          nickname: matchedRow.nickname || '',
          contentId: matchedRow.contentId || ''
        }
      })
    }

    return {
      sheetRow: matchedRow.sheetRow,
      nickname: matchedRow.nickname || '',
      contentId: matchedRow.contentId || '',
      matchedBy: ['sheetRow', 'nickname', '内容id']
    }
  }

  resolveHandoffColumns(headers, patchRow, orderedColumns) {
    const columns = []
    const skippedColumns = []

    for (const columnName of orderedColumns) {
      const columnIndex = headers.findIndex((header) => header === columnName) + 1
      if (columnIndex <= 0) {
        throw createTencentDocsError(400, ERROR_CODES.COLUMN_NOT_FOUND, `腾讯文档中缺少列：${columnName}`, {
          columnName
        })
      }

      const value = String(patchRow[columnName] ?? '')
      if (!hasWritableHandoffValue(value)) {
        skippedColumns.push(columnName)
        continue
      }

      columns.push({
        columnName,
        columnIndex,
        columnLetter: this.toColumnLetter(columnIndex),
        value
      })
    }

    return {
      columns,
      skippedColumns
    }
  }

  toColumnLetter(columnIndex) {
    let value = Number(columnIndex)
    let result = ''
    while (value > 0) {
      const remainder = (value - 1) % 26
      result = String.fromCharCode(65 + remainder) + result
      value = Math.floor((value - 1) / 26)
    }
    return result
  }

  getHandoffArtifactDir(operationId) {
    return path.join(this.config.artifactsRootDir, 'tencent-docs', 'handoff', operationId)
  }

  buildHandoffArtifactUrls(operationId) {
    const base = path.join('tencent-docs', 'handoff', operationId)
    return {
      beforeReadUrl: toArtifactUrl(path.join(base, 'before-read.png')),
      afterReadUrl: toArtifactUrl(path.join(base, 'after-read.png')),
      beforeFillUrl: toArtifactUrl(path.join(base, 'before-fill.png')),
      afterFillUrl: toArtifactUrl(path.join(base, 'after-fill.png')),
      errorUrl: toArtifactUrl(path.join(base, 'error.png')),
      selectionTsvUrl: toArtifactUrl(path.join(base, 'sheet-selection.tsv')),
      previewJsonUrl: toArtifactUrl(path.join(base, 'sheet-preview.json')),
      writeLogUrl: toArtifactUrl(path.join(base, 'handoff-write-log.json'))
    }
  }

  serializeHandoffOperation(operation) {
    return {
      operationId: operation.operationId,
      source: operation.source,
      target: operation.target,
      maxRows: operation.maxRows,
      match: operation.match,
      patch: operation.patch,
      columns: operation.columns,
      warnings: operation.warnings,
      artifacts: operation.artifacts
    }
  }

  getStoredJob(jobId) {
    return this.jobStore.getJob(jobId)
  }

  async flush() {
    await Promise.allSettled([
      this.jobStore.flush(),
      this.workspaceStore.flush()
    ])
  }

  flushSync() {
    this.jobStore.writeSync()
    this.workspaceStore.writeSync()
  }

  serializeJob(job) {
    return {
      jobId: job.jobId,
      status: job.status,
      mode: job.mode,
      syncKey: job.syncKey,
      source: job.source,
      target: job.target,
      omittedColumns: job.omittedColumns,
      warnings: job.warnings,
      artifacts: job.artifacts,
      writeSummary: job.writeSummary,
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    }
  }
}

function hasWritableHandoffValue(value) {
  return String(value ?? '').trim() !== ''
}

function looksLikeRepeatedHeaderWindow(snapshot) {
  const firstRow = snapshot?.rows?.[0]
  if (!firstRow) return false

  const nickname = String(firstRow.nickname || firstRow.cells?.['逛逛昵称'] || '').trim()
  const contentId = String(firstRow.contentId || firstRow.cells?.['内容id'] || firstRow.cells?.['内容ID'] || '').trim()
  return nickname === '逛逛昵称' || contentId === '内容id' || contentId === '内容ID'
}

function buildSheetDemands(rows = []) {
  const demandRows = rows.filter(isDemandCandidateRow)
  const nicknameCounts = new Map()
  for (const row of demandRows) {
    const key = normalizeNickname(row.nickname)
    if (!key) continue
    nicknameCounts.set(key, (nicknameCounts.get(key) || 0) + 1)
  }

  return demandRows.map((row) => {
    const nickname = String(row.nickname || '').trim()
    const normalizedNickname = normalizeNickname(nickname)
    const accountId = String(
      row.accountId
      || row.cells?.['逛逛ID']
      || row.cells?.['账号ID']
      || row.cells?.['账号id']
      || ''
    ).trim()
    const contentId = String(row.contentId || '').trim()
    const missingColumns = REQUIRED_DEMAND_COLUMNS.filter((columnName) => !hasCellValue(row.cells?.[columnName]))
    const duplicate = normalizedNickname && nicknameCounts.get(normalizedNickname) > 1

    let status = 'NEEDS_FILL'
    if (duplicate) {
      status = 'DUPLICATE_NICKNAME'
    } else if (!contentId) {
      status = 'CONTENT_ID_MISSING'
    } else if (missingColumns.length === 0) {
      status = 'COMPLETE'
    }

    return {
      sheetRow: Number(row.sheetRow || 0),
      nickname,
      normalizedNickname,
      accountId,
      contentId,
      missingColumns,
      missingCount: missingColumns.length,
      status
    }
  })
}

function isDemandCandidateRow(row = {}) {
  const nickname = String(row.nickname || '').trim()
  const contentId = String(row.contentId || '').trim()
  return Boolean(nickname || contentId)
}

function buildSheetSummary(demands = []) {
  return {
    totalRows: demands.length,
    completeRows: demands.filter((item) => item.status === 'COMPLETE').length,
    needsFillRows: demands.filter((item) => item.status === 'NEEDS_FILL').length,
    missingContentIdRows: demands.filter((item) => item.status === 'CONTENT_ID_MISSING').length,
    duplicateNicknameRows: demands.filter((item) => item.status === 'DUPLICATE_NICKNAME').length
  }
}

function patchDemandFromUpdatedColumns(demand, updatedColumns = []) {
  if (!demand) return demand
  if (!['NEEDS_FILL', 'COMPLETE'].includes(String(demand.status || ''))) return demand

  const currentMissingColumns = Array.isArray(demand.missingColumns) ? demand.missingColumns : []
  const nextMissingColumns = currentMissingColumns.filter((columnName) => !updatedColumns.includes(columnName))
  const nextStatus = !String(demand.contentId || '').trim()
    ? 'CONTENT_ID_MISSING'
    : (nextMissingColumns.length === 0 ? 'COMPLETE' : 'NEEDS_FILL')

  if (nextStatus === demand.status && nextMissingColumns.length === currentMissingColumns.length) {
    return demand
  }

  return {
    ...demand,
    missingColumns: nextMissingColumns,
    missingCount: nextMissingColumns.length,
    status: nextStatus
  }
}

function applyHandoffSyncToInspectPayload(payload, { sheetRow, columns = [], writeSummary } = {}) {
  const resolvedSheetRow = Number(sheetRow || writeSummary?.sheetRow || 0)
  const normalizedColumns = Array.isArray(columns)
    ? columns
      .filter((item) => item && item.columnName)
      .map((item) => ({
        columnName: String(item.columnName),
        value: String(item.value ?? '')
      }))
    : []
  const updatedColumns = normalizedColumns.length > 0
    ? normalizedColumns.map((item) => item.columnName)
    : (Array.isArray(writeSummary?.columnsUpdated) ? writeSummary.columnsUpdated.map((item) => String(item)) : [])

  if (!payload || resolvedSheetRow <= 0 || updatedColumns.length === 0) return null

  if (Array.isArray(payload.rows) && payload.rows.length > 0) {
    const headers = Array.isArray(payload.headers) ? payload.headers : []
    let rowChanged = false
    const nextRows = payload.rows.map((row) => {
      if (Number(row?.sheetRow || 0) !== resolvedSheetRow) return row
      rowChanged = true

      const nextCells = { ...(row.cells || {}) }
      normalizedColumns.forEach((item) => {
        nextCells[item.columnName] = item.value
      })

      let nextValues = Array.isArray(row.values) ? [...row.values] : row.values
      if (Array.isArray(nextValues) && headers.length > 0) {
        normalizedColumns.forEach((item) => {
          const headerIndex = headers.findIndex((header) => header === item.columnName)
          if (headerIndex >= 0) nextValues[headerIndex] = item.value
        })
      }

      return {
        ...row,
        cells: nextCells,
        values: Array.isArray(nextValues) ? nextValues : row.values
      }
    })

    if (rowChanged) {
      const nextDemands = buildSheetDemands(nextRows)
      return {
        ...payload,
        rows: nextRows,
        demands: nextDemands,
        summary: buildSheetSummary(nextDemands)
      }
    }
  }

  if (Array.isArray(payload.demands) && payload.demands.length > 0) {
    let demandChanged = false
    const nextDemands = payload.demands.map((item) => {
      if (Number(item?.sheetRow || 0) !== resolvedSheetRow) return item
      const nextItem = patchDemandFromUpdatedColumns(item, updatedColumns)
      if (nextItem !== item) demandChanged = true
      return nextItem
    })

    if (demandChanged) {
      return {
        ...payload,
        demands: nextDemands,
        summary: buildSheetSummary(nextDemands)
      }
    }
  }

  return null
}


function resolveTencentDocsStateFile(config = {}) {
  if (config.stateFile) return config.stateFile
  if (config.jobsFile) return path.join(path.dirname(config.jobsFile), 'tencent-docs-state.json')
  if (config.artifactsRootDir) return path.join(config.artifactsRootDir, '..', 'data', 'tencent-docs-state.json')
  return path.resolve(process.cwd(), 'data', 'tencent-docs-state.json')
}

function resolveDemandMatch(demands = [], { nickname, accountId } = {}) {
  const normalizedAccountId = String(accountId || '').trim()
  // Prefer the immutable Guangguang account ID first; nickname is only a fallback
  // when the sheet doesn't contain the ID or the current account cannot be found.
  if (normalizedAccountId) {
    const accountMatches = demands.filter((item) => String(item.accountId || '').trim() === normalizedAccountId)
    if (accountMatches.length === 1) {
      return resolveSingleDemandMatch(accountMatches[0], { preferredBy: ['逛逛ID'] })
    }
    if (accountMatches.length > 1) {
      const primary = accountMatches[0]
      return {
        status: 'DUPLICATE_ACCOUNT_ID',
        nickname: primary.nickname,
        contentId: primary.contentId,
        sheetRow: primary.sheetRow,
        missingColumns: primary.missingColumns,
        matches: accountMatches.map((item) => ({
          sheetRow: item.sheetRow,
          nickname: item.nickname,
          contentId: item.contentId,
          accountId: item.accountId,
          status: item.status
        })),
        details: {
          matchedBy: ['逛逛ID'],
          reason: 'DUPLICATE_ACCOUNT_ID'
        }
      }
    }
  }

  const normalized = normalizeNickname(nickname)
  const matches = demands.filter((item) => item.normalizedNickname && item.normalizedNickname === normalized)
  if (matches.length === 0) {
    return {
      status: 'NOT_IN_SHEET',
      nickname: String(nickname || '').trim(),
      contentId: '',
      sheetRow: 0,
      missingColumns: []
    }
  }

  const primary = matches[0]
  if (primary.status === 'DUPLICATE_NICKNAME' || matches.length > 1) {
    return {
      status: 'DUPLICATE_NICKNAME',
      nickname: primary.nickname,
      contentId: primary.contentId,
      sheetRow: primary.sheetRow,
      missingColumns: primary.missingColumns,
      matches: matches.map((item) => ({
        sheetRow: item.sheetRow,
        nickname: item.nickname,
        contentId: item.contentId,
        accountId: item.accountId,
        status: item.status
      })),
      details: {
        matchedBy: ['nickname'],
        reason: 'DUPLICATE_NICKNAME'
      }
    }
  }

  return resolveSingleDemandMatch(primary, { preferredBy: ['nickname'] })
}

function resolveSingleDemandMatch(row, { preferredBy = [] } = {}) {
  const matchedByAccountId = preferredBy.includes('逛逛ID')
  const base = {
    nickname: row.nickname,
    contentId: row.contentId,
    sheetRow: row.sheetRow,
    missingColumns: row.status === 'COMPLETE' ? [] : row.missingColumns,
    details: preferredBy.length > 0 ? { matchedBy: preferredBy } : null
  }

  if (matchedByAccountId) {
    if (!String(row.contentId || '').trim()) {
      return {
        status: 'CONTENT_ID_MISSING',
        ...base
      }
    }

    if ((row.missingColumns || []).length === 0) {
      return {
        status: 'ALREADY_COMPLETE',
        ...base,
        missingColumns: []
      }
    }

    return {
      status: 'NEEDS_FILL',
      ...base
    }
  }

  if (row.status === 'COMPLETE') {
    return {
      status: 'ALREADY_COMPLETE',
      ...base
    }
  }

  return {
    status: row.status,
    ...base
  }
}

function hasCellValue(value) {
  const normalized = String(value ?? '').trim()
  return !EMPTY_CELL_VALUES.has(normalized)
}

function normalizeNickname(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function targetsMatch(left = {}, right = {}) {
  const leftDocUrl = String(left?.docUrl || '').trim()
  const rightDocUrl = String(right?.docUrl || '').trim()
  if (!leftDocUrl || !rightDocUrl || leftDocUrl !== rightDocUrl) return false

  const leftSheetName = String(left?.sheetName || '').trim()
  const rightSheetName = String(right?.sheetName || '').trim()
  if (!leftSheetName || !rightSheetName) return true
  return leftSheetName === rightSheetName
}

function enrichHandoffError(error, operation = {}) {
  const statusCode = error?.statusCode || 500
  const code = error?.code || ERROR_CODES.WRITE_FAILED
  const message = error?.message || '腾讯文档回填失败'
  const details = {
    ...(error?.details || {})
  }

  if (operation.operationId) details.operationId = operation.operationId
  if (operation.target) details.target = operation.target
  if (operation.match) details.match = operation.match
  if (operation.patch) details.patch = operation.patch
  if (operation.columns) details.columns = operation.columns
  if (operation.artifacts) details.artifacts = operation.artifacts

  return createTencentDocsError(statusCode, code, message, details)
}

module.exports = { TencentDocsSyncService }
