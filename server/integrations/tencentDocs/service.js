const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { readJson, writeJson, ensureDir, toArtifactUrl } = require('../../lib/files')
const { TencentDocsJobStore } = require('./jobStore')
const { buildTencentDocsRow, buildTencentDocsHandoffPatch } = require('./mapping')
const { TencentDocsBrowserAdapter } = require('./browserAdapter')
const { createTencentDocsError, ERROR_CODES, serializeSyncError } = require('./errors')

class TencentDocsSyncService {
  constructor({ config, adapter, jobStore }) {
    this.config = config
    this.jobStore = jobStore || new TencentDocsJobStore({ jobsFile: config.jobsFile })
    this.adapter = adapter || new TencentDocsBrowserAdapter({
      browserExecutablePath: config.browserExecutablePath,
      profileDir: config.profileDir,
      headless: config.headless
    })
    this.docQueues = new Map()
    this.jobStore.markStaleJobsFailed()
  }

  getConfig() {
    return {
      enabled: this.config.enabled,
      mode: this.config.mode,
      defaultTargetConfigured: Boolean(this.config.docUrl && this.config.sheetName),
      defaultSheetName: this.config.sheetName || '',
      defaultWriteMode: this.normalizeMode(this.config.writeMode)
    }
  }

  previewJob({ source }) {
    const resultPayload = this.loadResultPayload(source)
    return buildTencentDocsRow(resultPayload, {
      toolBaseUrl: this.config.toolBaseUrl,
      timezone: this.config.timezone
    })
  }

  async inspectSheet({ target, maxRows }) {
    this.ensureEnabled()
    const resolvedTarget = this.resolveTarget(target, { allowMissingSheetName: true })
    const normalizedMaxRows = this.normalizeInspectMaxRows(maxRows)
    const artifactDir = this.getInspectArtifactDir()
    ensureDir(artifactDir)

    const snapshot = await this.adapter.readSheet({
      target: resolvedTarget,
      maxRows: normalizedMaxRows,
      artifactDir
    })

    return {
      ...snapshot,
      maxRows: normalizedMaxRows,
      artifacts: this.buildInspectArtifactUrls()
    }
  }

  async previewHandoffSync({ source, target, maxRows }) {
    const prepared = await this.prepareHandoffSync({ source, target, maxRows })
    return this.serializeHandoffOperation(prepared)
  }

  async syncHandoffRow({ source, target, maxRows }) {
    const prepared = await this.prepareHandoffSync({ source, target, maxRows })

    try {
      const writeSummary = await this.adapter.updateRowCells({
        target: prepared.target,
        sheetRow: prepared.match.sheetRow,
        cells: prepared.columns,
        artifactDir: prepared.artifactDir
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
      .catch(() => {})
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
    const screenshotRawPath = path.join(path.dirname(resultFile), '04-results.png')
    const screenshotSummaryPath = path.join(path.dirname(resultFile), '05-summary-strip.png')
    const networkLogPath = path.join(path.dirname(resultFile), 'network-log.json')

    const screenshots = {
      rawUrl: payload?.screenshots?.rawUrl || (fs.existsSync(screenshotRawPath) ? toArtifactUrl(path.join(relativeDir, '04-results.png')) : ''),
      summaryUrl: payload?.screenshots?.summaryUrl || (fs.existsSync(screenshotSummaryPath) ? toArtifactUrl(path.join(relativeDir, '05-summary-strip.png')) : '')
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

  resolveTarget(target, { allowMissingSheetName = false } = {}) {
    const docUrl = target?.docUrl || this.config.docUrl
    const sheetName = target?.sheetName ?? this.config.sheetName ?? ''
    if (!docUrl || (!allowMissingSheetName && !sheetName)) {
      throw createTencentDocsError(400, ERROR_CODES.NOT_CONFIGURED, '腾讯文档默认目标未配置，请提供 docUrl 和 sheetName')
    }

    return { docUrl, sheetName }
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

  async prepareHandoffSync({ source, target, maxRows }) {
    this.ensureEnabled()
    const resultPayload = this.loadResultPayload(source)
    const targetConfig = this.resolveTarget(target)
    const normalizedMaxRows = this.normalizeInspectMaxRows(maxRows || 200)
    const operationId = crypto.randomUUID()
    const artifactDir = this.getHandoffArtifactDir(operationId)
    const artifacts = this.buildHandoffArtifactUrls(operationId)
    ensureDir(artifactDir)

    const sheet = await this.adapter.readSheet({
      target: targetConfig,
      maxRows: normalizedMaxRows,
      artifactDir
    })

    try {
      const patchPreview = buildTencentDocsHandoffPatch(resultPayload, {
        toolBaseUrl: this.config.toolBaseUrl
      })

      const match = this.matchHandoffRow(sheet.rows, resultPayload)
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
        match,
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
