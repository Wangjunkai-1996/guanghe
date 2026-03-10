const path = require('path')
const { ensureDir, readJson, writeJson, writeJsonAsync, readJsonAsync } = require('../../lib/files')
const { ERROR_CODES } = require('./errors')

class TencentDocsJobStore {
  constructor({ jobsFile, now = () => new Date().toISOString() }) {
    this.jobsFile = jobsFile
    this.now = now
    this._memoryCache = null
    this._writeTimeout = null
    this._writePromise = Promise.resolve()
    this._isDirty = false
    ensureDir(path.dirname(jobsFile))
    this._initSync()
  }

  _initSync() {
    const payload = readJson(this.jobsFile, { jobs: [] })
    this._memoryCache = Array.isArray(payload.jobs) ? payload.jobs : []
  }

  listJobs() {
    if (!this._memoryCache) {
      this._initSync()
    }
    return this._memoryCache
  }

  getJob(jobId) {
    return this.listJobs().find((job) => job.jobId === jobId) || null
  }

  createJob(job) {
    const jobs = this.listJobs()
    jobs.unshift(job)
    this._memoryCache = jobs
    this._scheduleWrite(jobs)
    return job
  }

  updateJob(jobId, patch) {
    const jobs = this.listJobs()
    const index = jobs.findIndex((job) => job.jobId === jobId)
    if (index < 0) return null

    const current = jobs[index]
    const nextPatch = typeof patch === 'function' ? patch(current) : patch
    const nextJob = {
      ...current,
      ...nextPatch,
      updatedAt: this.now()
    }

    jobs[index] = nextJob
    this._memoryCache = jobs
    this._scheduleWrite(jobs)
    return nextJob
  }

  markStaleJobsFailed() {
    const jobs = this.listJobs()
    let changed = 0

    const nextJobs = jobs.map((job) => {
      if (job.status !== 'PENDING' && job.status !== 'RUNNING') return job
      changed += 1
      return {
        ...job,
        status: 'FAILED',
        updatedAt: this.now(),
        error: {
          code: ERROR_CODES.JOB_ABORTED_ON_RESTART,
          message: '服务重启导致同步任务中断',
          details: null
        }
      }
    })

    if (changed > 0) {
      this._memoryCache = nextJobs
      this._scheduleWrite(nextJobs)
    }

    return changed
  }

  _scheduleWrite(jobs) {
    this._isDirty = true
    if (this._writeTimeout) {
      clearTimeout(this._writeTimeout)
    }

    this._writeTimeout = setTimeout(() => {
      this.flush()
    }, 100)
  }

  async flush() {
    if (!this._isDirty) return this._writePromise

    if (this._writeTimeout) {
      clearTimeout(this._writeTimeout)
      this._writeTimeout = null
    }

    const payload = { jobs: this._memoryCache }
    const file = this.jobsFile

    this._writePromise = this._writePromise
      .then(() => writeJsonAsync(file, payload))
      .catch((error) => {
        console.error(`[TencentDocsJobStore] flush async error: ${error.message}`)
        writeJson(file, payload)
      })

    this._isDirty = false
    return this._writePromise
  }
}

module.exports = { TencentDocsJobStore }
