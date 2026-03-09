const config = require('./config')
const { ensureDir } = require('./lib/files')
const { AccountStore } = require('./lib/accountStore')
const { TaskStore } = require('./lib/taskStore')
const { BrowserManager } = require('./lib/browserManager')
const { GuangheLoginService } = require('./services/loginService')
const { GuangheQueryService } = require('./services/queryService')
const { GuangheTaskService } = require('./services/taskService')
const { TencentDocsSyncService } = require('./integrations/tencentDocs')
const { createApp } = require('./app')

ensureDir(config.dataDir)
ensureDir(config.profileRootDir)
ensureDir(config.artifactsRootDir)

const accountStore = new AccountStore({ accountsFile: config.accountsFile })
const taskStore = new TaskStore({ tasksFile: config.tasksFile })
const browserManager = new BrowserManager({
  browserExecutablePath: config.browserExecutablePath,
  profileRootDir: config.profileRootDir
})
const loginService = new GuangheLoginService({
  browserManager,
  accountStore,
  artifactsRootDir: config.artifactsRootDir
})
const queryService = new GuangheQueryService({
  browserManager,
  accountStore,
  artifactsRootDir: config.artifactsRootDir
})
const tencentDocsSyncService = new TencentDocsSyncService({
  config: {
    enabled: config.tencentDocsEnabled,
    mode: config.tencentDocsMode,
    docUrl: config.tencentDocsDocUrl,
    sheetName: config.tencentDocsSheetName,
    writeMode: config.tencentDocsWriteMode,
    headless: config.tencentDocsHeadless,
    timezone: config.tencentDocsTimezone,
    jobsFile: config.tencentDocsJobsFile,
    stateFile: config.tencentDocsStateFile,
    profileDir: config.tencentDocsProfileDir,
    toolBaseUrl: config.toolBaseUrl,
    browserExecutablePath: config.browserExecutablePath,
    artifactsRootDir: config.artifactsRootDir
  }
})
const taskService = new GuangheTaskService({
  taskStore,
  loginService,
  queryService,
  tencentDocsSyncService,
  maxActiveLoginSessions: config.maxActiveLoginSessions,
  maxConcurrentQueries: config.maxConcurrentQueries
})

taskService.start()

const app = createApp({ config, loginService, queryService, taskService, tencentDocsSyncService })

app.listen(config.port, config.host, () => {
  console.log(`Guanghe tool server listening on http://${config.host}:${config.port}`)
})
