const { getAppPaths } = require('./lib/constants')
const { resolveBrowserExecutable } = require('./lib/browserPath')

const paths = getAppPaths()

module.exports = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 3001),
  toolPassword: process.env.TOOL_PASSWORD || 'change-this-password',
  sessionSecret: process.env.SESSION_SECRET || 'change-this-session-secret',
  secureCookie: process.env.COOKIE_SECURE === 'true',
  browserExecutablePath: process.env.BROWSER_PATH || resolveBrowserExecutable(),
  ...paths
}
