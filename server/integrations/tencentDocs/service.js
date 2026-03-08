const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { readJson, writeJson, ensureDir, toArtifactUrl } = require('../../lib/files')
const { TencentDocsJobStore } = require('./jobStore')
const { buildTencentDocsRow } = require('./mapping')
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
    return payload
  }

  resolveTarget(target) {
    const docUrl = target?.docUrl || this.config.docUrl
    const sheetName = target?.sheetName || this.config.sheetName
    if (!docUrl || !sheetName) {
      throw createTencentDocsError(400, ERROR_CODES.NOT_CONFIGURED, '腾讯文档默认目标未配置，请提供 docUrl 和 sheetName')
    }

    return { docUrl, sheetName }
  }

  normalizeMode(mode) {
    const candidate = String(mode || this.config.writeMode || 'upsert').toLowerCase()
    return candidate === 'append' ? 'append' : 'upsert'
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

  buildArtifactUrls(jobId) {
    const base = path.join('tencent-docs', jobId)
    return {
      beforeWriteUrl: toArtifactUrl(path.join(base, 'before-write.png')),
      afterWriteUrl: toArtifactUrl(path.join(base, 'after-write.png')),
      errorUrl: toArtifactUrl(path.join(base, 'error.png')),
      writeLogUrl: toArtifactUrl(path.join(base, 'write-log.json'))
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

module.exports = { TencentDocsSyncService }
