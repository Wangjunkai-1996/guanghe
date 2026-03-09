const path = require('path')
const { getAppPaths } = require('./lib/constants')
const { resolveBrowserExecutable } = require('./lib/browserPath')

const paths = getAppPaths()

module.exports = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3001),
  toolAuthEnabled: process.env.TOOL_AUTH_ENABLED === 'true',
  toolPassword: process.env.TOOL_PASSWORD || 'change-this-password',
  sessionSecret: process.env.SESSION_SECRET || 'change-this-session-secret',
  secureCookie: process.env.COOKIE_SECURE === 'true',
  toolBaseUrl: process.env.TOOL_BASE_URL || '',
  browserExecutablePath: process.env.BROWSER_PATH || resolveBrowserExecutable(),
  maxActiveLoginSessions: Number(process.env.MAX_ACTIVE_LOGIN_SESSIONS || 5),
  maxConcurrentQueries: Number(process.env.MAX_CONCURRENT_QUERIES || 2),
  tencentDocsEnabled: process.env.TENCENT_DOCS_ENABLED === 'true',
  tencentDocsMode: process.env.TENCENT_DOCS_MODE || 'browser',
  tencentDocsDocUrl: process.env.TENCENT_DOCS_DOC_URL || '',
  tencentDocsSheetName: process.env.TENCENT_DOCS_SHEET_NAME || '数据汇总',
  tencentDocsWriteMode: process.env.TENCENT_DOCS_WRITE_MODE || 'upsert',
  tencentDocsHeadless: process.env.TENCENT_DOCS_HEADLESS !== 'false',
  tencentDocsTimezone: process.env.TENCENT_DOCS_TIMEZONE || 'Asia/Shanghai',
  tencentDocsJobsFile: path.resolve(paths.dataDir, 'tencent-docs-jobs.json'),
  tencentDocsStateFile: path.resolve(paths.dataDir, 'tencent-docs-state.json'),
  tencentDocsProfileDir: path.resolve(paths.profileRootDir, 'tencent-docs'),
  ...paths
}
