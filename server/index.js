const config = require('./config')
const { ensureDir } = require('./lib/files')
const { AccountStore } = require('./lib/accountStore')
const { TaskStore } = require('./lib/taskStore')
const { BrowserManager } = require('./lib/browserManager')
const { GuangheLoginService } = require('./services/loginService')
const { GuangheQueryService } = require('./services/queryService')
const { GuangheTaskService } = require('./services/taskService')
const { KeepAliveService } = require('./services/keepAliveService')
const { TencentDocsSyncService } = require('./integrations/tencentDocs')
const { createV7Database } = require('./v7/database')
const { V7EventBus } = require('./v7/eventBus')
const { V7WorkspaceService } = require('./v7/service')
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

const keepAliveService = new KeepAliveService({
  accountStore,
  browserManager,
  intervalMs: 12 * 60 * 60 * 1000 // 12 小时跑一次
})
const v7Database = createV7Database({ dbFile: config.v7DatabaseFile })
const v7EventBus = new V7EventBus()
const v7Service = new V7WorkspaceService({
  db: v7Database,
  eventBus: v7EventBus,
  loginService,
  queryService,
  tencentDocsSyncService,
  browserManager,
  accountStore
})

taskService.start()
keepAliveService.start()
const app = createApp({ config, loginService, queryService, taskService, tencentDocsSyncService, v7Service })

let isShuttingDown = false

async function flushPersistentState() {
  accountStore.flush()
  await Promise.allSettled([
    taskStore.flush(),
    tencentDocsSyncService.flush ? tencentDocsSyncService.flush() : Promise.resolve()
  ])
}

function flushPersistentStateSync() {
  accountStore.flush()
  taskStore.writeSync()
  if (tencentDocsSyncService.flushSync) {
    tencentDocsSyncService.flushSync()
  }
}

async function shutdown(signal, exitCode = 0) {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`[shutdown] received ${signal}, flushing persistent state...`)
  keepAliveService.stop()
  taskService.stop()

  try {
    await flushPersistentState()
  } catch (error) {
    console.error(`[shutdown] flush failed: ${error.message}`)
  } finally {
    process.exit(exitCode)
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void shutdown(signal, 0)
  })
}

process.once('exit', () => {
  keepAliveService.stop()
  taskService.stop()
  flushPersistentStateSync()
})

process.once('uncaughtException', (error) => {
  console.error('[shutdown] uncaughtException', error)
  void shutdown('uncaughtException', 1)
})

process.once('unhandledRejection', (reason) => {
  console.error('[shutdown] unhandledRejection', reason)
  void shutdown('unhandledRejection', 1)
})

app.listen(config.port, config.host, () => {
  console.log(`Guanghe tool server listening on http://${config.host}:${config.port}`)
})
