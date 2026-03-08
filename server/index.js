const config = require('./config')
const { ensureDir } = require('./lib/files')
const { AccountStore } = require('./lib/accountStore')
const { BrowserManager } = require('./lib/browserManager')
const { GuangheLoginService } = require('./services/loginService')
const { GuangheQueryService } = require('./services/queryService')
const { createApp } = require('./app')

ensureDir(config.dataDir)
ensureDir(config.profileRootDir)
ensureDir(config.artifactsRootDir)

const accountStore = new AccountStore({ accountsFile: config.accountsFile })
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
const app = createApp({ config, loginService, queryService })

app.listen(config.port, config.host, () => {
  console.log(`Guanghe tool server listening on http://${config.host}:${config.port}`)
})
