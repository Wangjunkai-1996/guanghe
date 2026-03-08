const path = require('path')
const { ensureDir, readJson, writeJson } = require('../../lib/files')
const { ERROR_CODES } = require('./errors')

class TencentDocsJobStore {
  constructor({ jobsFile, now = () => new Date().toISOString() }) {
    this.jobsFile = jobsFile
    this.now = now
    ensureDir(path.dirname(jobsFile))
  }

  listJobs() {
    const payload = readJson(this.jobsFile, { jobs: [] })
    return Array.isArray(payload.jobs) ? payload.jobs : []
  }

  getJob(jobId) {
    return this.listJobs().find((job) => job.jobId === jobId) || null
  }

  createJob(job) {
    const jobs = this.listJobs()
    jobs.unshift(job)
    writeJson(this.jobsFile, { jobs })
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
    writeJson(this.jobsFile, { jobs })
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
      writeJson(this.jobsFile, { jobs: nextJobs })
    }

    return changed
  }
}

module.exports = { TencentDocsJobStore }
