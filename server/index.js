const config = require('./config')
const { ensureDir } = require('./lib/files')
const { AccountStore } = require('./lib/accountStore')
const { TaskStore } = require('./lib/taskStore')
const { BrowserManager } = require('./lib/browserManager')
const { GuangheLoginService } = require('./services/loginService')
const { GuangheQueryService } = require('./services/queryService')
const { GuangheTaskService } = require('./services/taskService')
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
const taskService = new GuangheTaskService({
  taskStore,
  loginService,
  queryService,
  maxActiveLoginSessions: config.maxActiveLoginSessions,
  maxConcurrentQueries: config.maxConcurrentQueries
})

taskService.start()

const app = createApp({ config, loginService, queryService, taskService })

app.listen(config.port, config.host, () => {
  console.log(`Guanghe tool server listening on http://${config.host}:${config.port}`)
})
