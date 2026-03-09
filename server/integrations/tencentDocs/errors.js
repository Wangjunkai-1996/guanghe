const { AppError } = require('../../lib/errors')

const ERROR_CODES = {
  NOT_CONFIGURED: 'TENCENT_DOCS_NOT_CONFIGURED',
  LOGIN_REQUIRED: 'TENCENT_DOCS_LOGIN_REQUIRED',
  SHEET_NOT_FOUND: 'TENCENT_DOCS_SHEET_NOT_FOUND',
  TEMPLATE_INVALID: 'TENCENT_DOCS_TEMPLATE_INVALID',
  WRITE_FAILED: 'TENCENT_DOCS_WRITE_FAILED',
  READ_FAILED: 'TENCENT_DOCS_READ_FAILED',
  JOB_ABORTED_ON_RESTART: 'SYNC_JOB_ABORTED_ON_RESTART',
  REQUEST_INVALID: 'TENCENT_DOCS_REQUEST_INVALID',
  RESULT_NOT_FOUND: 'TENCENT_DOCS_RESULT_NOT_FOUND',
  JOB_NOT_FOUND: 'SYNC_JOB_NOT_FOUND',
  ROW_NOT_FOUND: 'TENCENT_DOCS_ROW_NOT_FOUND',
  COLUMN_NOT_FOUND: 'TENCENT_DOCS_COLUMN_NOT_FOUND'
}

function createTencentDocsError(statusCode, code, message, details = null) {
  return new AppError(statusCode, code, message, details)
}

function serializeSyncError(error) {
  return {
    code: error?.code || ERROR_CODES.WRITE_FAILED,
    message: error?.message || '腾讯文档写入失败',
    details: error?.details || null
  }
}

module.exports = {
  ERROR_CODES,
  createTencentDocsError,
  serializeSyncError
}
