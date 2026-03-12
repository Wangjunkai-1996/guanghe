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
    
    // Check in-memory Cache
    if (!forceRefresh && this._lastInspectCache) {
      if (
        this._lastInspectCache.target.docUrl === resolvedTarget.docUrl &&
        (!resolvedTarget.sheetName || this._lastInspectCache.target.sheetName === resolvedTarget.sheetName)
      ) {
        return this._lastInspectCache.data
      }
    }

    const snapshot = await this.readSheetDemandSnapshot({
      target,
      maxRows: normalizedMaxRows,
      artifactDir: this.getInspectArtifactDir(),
      strict: false
    })

    const payload = {
      ...snapshot,
      maxRows: normalizedMaxRows,
      artifacts: this.buildInspectArtifactUrls()
    }

    // Save in-memory cache
    this._lastInspectCache = {
      target: resolvedTarget,
      data: payload,
      timestamp: Date.now()
    }

    return payload
  }

  async matchDemandByNickname({ nickname, target, maxRows = 200 } = {}) {
    this.ensureEnabled()
    const snapshot = await this.readSheetDemandSnapshot({
      target,
      maxRows: this.normalizeInspectMaxRows(maxRows),
      artifactDir: this.getInspectArtifactDir(),
      strict: false
    })

    return {
      snapshot,
      target: snapshot.target,
      match: resolveDemandMatch(snapshot.demands, nickname)
    }
  }

  async previewHandoffSync({ source, target, maxRows, match }) {
    const prepared = await this.prepareHandoffSync({ source, target, maxRows, match })
    return this.serializeHandoffOperation(prepared)
  }

  async syncHandoffRow({ source, target, maxRows, match }) {
    const prepared = await this.prepareHandoffSync({ source, target, maxRows, match })

    try {
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
    const networkLogPath = path.join(path.dirname(resultFile), 'network-log.json')

    const screenshots = {
      // 原始图/作品管理图 (修正文件名为 queryService 实际生成的 -full 后缀)
      rawUrl: payload?.screenshots?.rawUrl || (fs.existsSync(worksManagePath) ? toArtifactUrl(path.join(relativeDir, '01-works-manage-full.png')) : ''),
      // 汇总条图
      summaryUrl: payload?.screenshots?.summaryUrl || (fs.existsSync(screenshotSummaryPath) ? toArtifactUrl(path.join(relativeDir, '05-summary-strip.png')) : ''),
      // 列表卡片小眼睛截图
      cardUrl: payload?.screenshots?.cardUrl || payload?.metrics?.cardUrl || (fs.existsSync(screenshotCardPath) ? toArtifactUrl(path.join(relativeDir, 'work-card.png')) : ''),
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

  async prepareHandoffSync({ source, target, maxRows, match }) {
    this.ensureEnabled()
    const resultPayload = this.loadResultPayload(source)
    const targetConfig = this.resolveTarget(target)
    const normalizedMaxRows = this.normalizeInspectMaxRows(maxRows || 200)
    const operationId = crypto.randomUUID()
    const artifactDir = this.getHandoffArtifactDir(operationId)
    const artifacts = this.buildHandoffArtifactUrls(operationId)
    ensureDir(artifactDir)

    const sheet = await this.readSheetDemandSnapshot({
      target: targetConfig,
      maxRows: normalizedMaxRows,
      artifactDir
    })

    try {
      const patchPreview = buildTencentDocsHandoffPatch(resultPayload, {
        toolBaseUrl: this.config.toolBaseUrl
      })
      
      console.log(`[TencentDocs] 准备回填行数据 (Operation:${operationId}):`, {
        contentId: resultPayload.contentId,
        '查看次数截图': patchPreview.row['查看次数截图'],
        '前端小眼睛截图': patchPreview.row['前端小眼睛截图']
      })

      const resolvedMatch = match
        ? this.resolveLockedHandoffMatch(sheet.rows, resultPayload, match)
        : this.matchHandoffRow(sheet.rows, resultPayload)
      const columns = this.resolveHandoffColumns(sheet.headers, patchPreview.row, patchPreview.columns)

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
        warnings: patchPreview.warnings,
        columns,
        artifacts
      }
    } catch (error) {
      throw enrichHandoffError(error, {
        operationId,
        target: sheet.target,
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
    return orderedColumns.map((columnName) => {
      const columnIndex = headers.findIndex((header) => header === columnName) + 1
      if (columnIndex <= 0) {
        throw createTencentDocsError(400, ERROR_CODES.COLUMN_NOT_FOUND, `腾讯文档中缺少列：${columnName}`, {
          columnName
        })
      }

      return {
        columnName,
        columnIndex,
        columnLetter: this.toColumnLetter(columnIndex),
        value: String(patchRow[columnName] ?? '')
      }
    })
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


function resolveTencentDocsStateFile(config = {}) {
  if (config.stateFile) return config.stateFile
  if (config.jobsFile) return path.join(path.dirname(config.jobsFile), 'tencent-docs-state.json')
  if (config.artifactsRootDir) return path.join(config.artifactsRootDir, '..', 'data', 'tencent-docs-state.json')
  return path.resolve(process.cwd(), 'data', 'tencent-docs-state.json')
}

function resolveDemandMatch(demands = [], nickname) {
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
        status: item.status
      }))
    }
  }

  if (primary.status === 'COMPLETE') {
    return {
      status: 'ALREADY_COMPLETE',
      nickname: primary.nickname,
      contentId: primary.contentId,
      sheetRow: primary.sheetRow,
      missingColumns: []
    }
  }

  return {
    status: primary.status,
    nickname: primary.nickname,
    contentId: primary.contentId,
    sheetRow: primary.sheetRow,
    missingColumns: primary.missingColumns
  }
}

function hasCellValue(value) {
  const normalized = String(value ?? '').trim()
  return !EMPTY_CELL_VALUES.has(normalized)
}

function normalizeNickname(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
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
