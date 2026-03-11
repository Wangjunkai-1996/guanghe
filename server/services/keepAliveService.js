const { LOGIN_URL } = require('../lib/constants')

class KeepAliveService {
  constructor({ accountStore, browserManager, intervalMs = 12 * 60 * 60 * 1000 }) {
    this.accountStore = accountStore
    this.browserManager = browserManager
    this.intervalMs = intervalMs
    this.timer = null
  }

  start() {
    if (this.timer) return
    console.log(`[keep-alive] 服务已启动，将每隔 ${this.intervalMs / 1000 / 60 / 60} 小时触发一次账号活跃保活`)
    // 启动后不仅要设置定时器，为了以防万一最好延迟一小段时间后先执行一次完整的跑批
    this.timer = setInterval(() => this.runKeepAlive(), this.intervalMs)
    setTimeout(() => this.runKeepAlive(), 5 * 60 * 1000) // 项目启动后 5 分钟跑一次
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  async runKeepAlive() {
    console.log('[keep-alive] 开始执行账号保活任务...')
    const accounts = this.accountStore.list().filter(a => a.status === 'READY')
    
    if (accounts.length === 0) {
      console.log('[keep-alive] 当前无可用账号，跳过保活')
      return
    }

    for (const account of accounts) {
      console.log(`[keep-alive] 正在保活账号: ID=${account.accountId} 昵称=${account.nickname}`)
      
      try {
        await this.browserManager.runAccountTask(account.accountId, async () => {
          const { context } = await this.browserManager.getOrCreateAccountContext(account)
          const page = context.pages()[0] || await context.newPage()
          
          await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
          // 停留片刻，让页面发送心跳请求，更新 Cookie 生命周期
          await page.waitForTimeout(5000)
          
          // 如果你觉得有必要，其实还可以顺手检测一下是不是掉线了：
          // const status = await detectLoginStatus(page); ...
          
          console.log(`[keep-alive] 账号保活成功: ID=${account.accountId}`)
        })
      } catch (err) {
        console.error(`[keep-alive] 账号保活过程中发生异常: ID=${account.accountId}`, err.message)
      } finally {
        // 让页面稍微释放掉，不要一直占着内存
        await this.browserManager.closeAccount(account.accountId).catch(() => {})
      }
      
      // 错峰保活，防止瞬间全部弹出来（尤其在有界面的模式下）
      await new Promise(resolve => setTimeout(resolve, 30000))
    }
    
    console.log('[keep-alive] 本轮账号保活任务执行完毕')
  }
}

module.exports = { KeepAliveService }
