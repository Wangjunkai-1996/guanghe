# 光合平台多账号查询工具

一个面向单操作者的网页工具：
- 前端：`React + Vite`
- 后端：`Node.js + Express + Playwright`
- 用途：扫码登录多个光合账号，按账号查询指定内容 ID 的近 30 日固定 5 项指标，并返回字段值、原始截图、汇总截图

## Codex 接手说明

- 面向另一台电脑上的 Codex 的快速交接文档：`docs/codex-onboarding.md`

## 2026-03-10 夜间进展 / 交接摘要

这部分记录今晚围绕 **腾讯交接表驱动闭环** 做过的修复、已确认现状和明早建议接手顺序，方便另一台 Codex 直接续做。

### 今晚已完成的关键修复

- 交接表读取侧：修正了 `sheetClipboard` 压缩空白行导致的 `sheetRow` 错位问题；现在会保留真实行号，并忽略尾部全空异常行，避免把结果写到错误行。
- 腾讯文档写入侧：增加写后校验，不再把“页面看起来操作成功但实际没写进去”误判成成功。
- 腾讯文档写入方式：文本列已改为逐格写入，降低整段粘贴时的偏移和丢值风险。
- 腾讯文档登录态识别：把“只能查看 / 登录腾讯文档 / 登录 iframe”识别成未登录，避免只读态被错当成可写登录态。
- 腾讯文档二维码恢复：`/api/tencent-docs/config` 现在会返回 `loginSessionId + qrImageUrl`，页面刷新后可以恢复等待中的腾讯文档扫码会话并继续轮询状态。
- 腾讯文档登录引导：登录页自动化已兼容以下链路：
  - 顶层“登录腾讯文档”入口
  - 协议勾选
  - 微信快捷登录（本地微信仍在线时）
  - 纯二维码登录（更接近服务器实际环境）

### 今晚已确认的真实结论

- **服务器思路要以“纯二维码登录”为主**：本地如果微信客户端还在线，腾讯文档会优先给“微信快捷登录”；但用户手动退出微信后，链路已回到真正二维码登录，这才是更接近服务器环境的行为。
- 当前腾讯文档目标文档使用的是：
  - `https://docs.qq.com/sheet/DUmtNbkJQdkV0QVF4?tab=BB08J2`
- 这个链接里带 `tab=BB08J2`，说明链接携带了当前工作表定位信息；前端会提示“保存或检查后自动识别当前工作表”，但真正用于落库和回填的仍然是 `inspect` 解析出来的 `sheetName`。
- 当前已经验证过：用户退出微信后，腾讯文档登录会话能重新生成真实可扫码二维码，不再卡在快捷登录分支。

### 当前主链路状态（截至 2026-03-10 凌晨）

- 前端开发页：`http://localhost:5173`
- 后端接口：`http://localhost:3001`
- 工具口令默认关闭，便于直接验证。
- 腾讯文档登录当前重点不再是“如何出现二维码”，而是：
  1. 扫码登录后是否稳定进入 `LOGGED_IN`
  2. 检查工作表时是否只识别真正缺数达人
  3. 扫码达人后是否稳定命中正确 `sheetRow`
  4. 写入后是否真正落到目标行、目标列

### 明早建议接手顺序

1. 先用 `GET /api/tencent-docs/config` 确认是否仍有等待中的腾讯文档登录会话，以及 `qrImageUrl` 是否存在。
2. 如果页面没显示二维码，优先检查前端是否从 `syncConfig.login` 恢复出 `docsLoginSession`，而不是先怀疑后端没生成二维码。
3. 让用户扫码腾讯文档，观察状态是否经历：
   - `WAITING_QR -> WAITING_CONFIRM -> LOGGED_IN`
4. 登录成功后立刻重新 `检查工作表`，确认缺数摘要是否只保留真正未填完整的达人。
5. 再跑一次“交接表驱动二维码 -> 达人扫码 -> 自动查询 -> 写回交接表”的完整闭环，重点盯：
   - `sheetMatch.sheetRow`
   - 写前行校验
   - 写后校验
   - 腾讯文档是否掉回只读态

### 当前仍需重点盯的风险点

- 如果腾讯文档页面重新变成只读态，查询成功也不会自动变成写表成功；要优先看登录态是否真的是编辑态。
- 如果同一达人重复扫码，需要再次校验当前表格是否已被前一个任务写满，避免重复回填。
- 如果表格被人工改动，必须依赖“锁定行号 + 写前快照校验”，不能只凭昵称再次全表搜索。

### 常用排查接口

```bash
curl http://localhost:3001/api/tencent-docs/config
curl http://localhost:3001/api/tasks
curl http://localhost:3001/api/tencent-docs/login-sessions/<loginSessionId>
```

### 已知最近关键提交

- `d79575e` `fix: ignore empty trailing sheet rows`
- `fff4b8e` `fix: preserve sheet row positions across blanks`
- `5476cab` `fix: verify tencent docs row writes`
- `8a0db76` `fix: write tencent docs cells one by one`
- `b602e5b` `fix: detect tencent docs readonly login state`

### 本次准备提交的补充修复

- 恢复腾讯文档等待中的二维码登录会话：刷新页面后不再丢失 `loginSessionId / qrImageUrl`
- 腾讯文档登录页推进逻辑补强：更稳地点击“登录腾讯文档 / 协议勾选 / 微信登录入口”
- 腾讯文档登录区占位文案修正：等待态不再误导成“先保存链接才可继续”

## 当前能力

- 默认关闭工具口令，本地可直接进入；如需保护页面，可开启 `TOOL_AUTH_ENABLED=true` 并使用 `HTTP-only session cookie`
- 多个光合账号长期保存登录态，每个账号独立浏览器 profile
- 支持两种工作模式：
  - `批量任务`：一次创建多个二维码任务，扫码成功后自动查询并回填结果
  - `账号查询`：手动选择已保存账号并发起单次查询
- 同一账号查询串行执行，不同批量任务支持受控并发
- 页面内发起扫码登录，并展示登录后的账号昵称/头像
- 批量任务工作区已做一轮 UI / 交互梳理，重点强化批量录入、扫码状态跟踪、查询结果查看与补操作入口
- 固定查询 `30日` 和以下 5 个指标：
  - `内容查看次数`
  - `内容查看人数`
  - `种草成交金额`
  - `种草成交人数`
  - `商品点击次数`
- 同时返回：
  - 原始页面截图
  - 汇总横条截图
  - `results.json`
  - `network-log.json`
- 当接口未返回目标 `contentId` 时，明确报错“近 30 日无可查数据”，避免误读页面其他数字

## 批量任务模式

- 批量输入格式支持：
  - `备注,内容ID`
  - `备注<TAB>内容ID`
- 每条任务都会生成独立二维码，并跟踪：
  - 登录状态：`等待扫码 / 等待手机确认 / 登录成功 / 二维码已过期 / 登录失败 / 任务中断`
  - 查询状态：`待查询 / 排队中 / 查询中 / 查询成功 / 无可查数据 / 查询失败`
- 登录成功后自动发起查询，并在任务工作台中直接展示：
  - 5 项指标
  - 汇总截图 / 原始截图
  - 结果 JSON
  - 网络日志
  - 腾讯文档同步状态（未同步 / 同步中 / 已同步 / 同步失败）
- 支持对单条任务执行：
  - 下载二维码
  - 复制二维码图片
  - 刷新二维码
  - 重试查询
  - 预览腾讯文档回填
  - 立即同步腾讯文档
  - 删除任务
- 当腾讯文档自动同步失败时，不会回滚查询成功；工作台会保留查询结果，并在详情抽屉中给出错误原因、写入日志和补同步入口

## 腾讯文档同步（当前已落地）

当前腾讯文档同步采用 **浏览器自动化**，已经落地的能力包括：

- 接管腾讯文档独立登录态与编辑态，使用单独的持久化 profile 写表
- 支持读取当前工作表选区并解析为 TSV / JSON 预览，便于校验表头与排查读表问题
- 支持基于目标行做 **局部单元格回填**，不必只走整行追加
- 数值列支持通过顶部坐标框精确跳转后，按连续区间用剪贴板一次性粘贴，降低逐格输入偏移风险
- 图片列支持把截图粘贴进目标单元格后，自动执行 **“转为单元格图片”**
- 查询结果会补齐 `screenshots` / `artifacts` 信息，便于后续回填腾讯文档时直接取图、取结果文件
- 同步过程会保存 `before/after/error` 截图，方便复盘真实写表效果
- 批量任务工作台会把 `sync` 作为一等状态展示，并提供 `预览回填` / `立即同步` 两个补操作按钮
- 当回填失败时，任务会保留 `operationId`、目标表、匹配行、错误信息和写入 artifacts，方便不看后端日志也能直接补救

如果你的交接表工作表不是默认值，请显式设置：

```bash
export TENCENT_DOCS_SHEET_NAME='1'
```


## 目录结构

- `/server`：后端接口、登录管理、查询服务、任务编排服务、截图服务
- `/web`：前端单页应用
- `/data/`：运行时持久化数据目录（如账号元数据、批量任务状态等，默认不纳入 Git）
- `/.cache/profiles`：Playwright 持久化登录态
- `/artifacts/web`：查询截图和结果文件
- `/scripts/guanghe-fetch.js`：旧版 CLI 脚本，保留作调试参考

## 账号存储说明

- 账号元数据会写入 `data/accounts.json`，该文件默认作为运行时数据保存在本机或服务器上，不再纳入 Git 跟踪。
- 浏览器登录态保存在 `.cache/profiles`，该目录默认被 Git 忽略，只适合本机持久化。
- 这意味着：**同一台机器重启服务后，只要保留本机 `/data` 和 `/.cache/profiles`，账号不会凭空丢失；但跨机器拉取仓库时，账号数据和登录态通常不会随仓库一起同步。**
- 如果 `accounts.json` 不存在，服务会以空账号列表启动；如果文件里记录的账号缺少本地 profile，会自动标记为“需重新登录”。

## 环境变量

必填建议：
- `SESSION_SECRET`：Session 签名密钥

按需开启：
- `TOOL_AUTH_ENABLED`：设为 `true` 后启用工具口令登录
- `TOOL_PASSWORD`：工具页面访问口令，仅在启用口令后生效

可选：
- `HOST`：默认 `0.0.0.0`
- `PORT`：默认 `3001`
- `BROWSER_PATH`：Chrome / Chromium 可执行文件路径
- `COOKIE_SECURE`：`true` 时启用安全 Cookie，部署 HTTPS 时建议开启
- `MAX_ACTIVE_LOGIN_SESSIONS`：默认 `5`，限制同时待扫码任务数
- `MAX_CONCURRENT_QUERIES`：默认 `2`，限制批量任务自动查询并发数
- `TOOL_BASE_URL`：工具对外访问基地址；配置后腾讯文档同步会写入完整 artifacts 链接
- `TENCENT_DOCS_ENABLED`：是否启用腾讯文档同步，默认 `false`
- `TENCENT_DOCS_MODE`：默认 `browser`
- `TENCENT_DOCS_DOC_URL`：默认目标腾讯在线表格地址
- `TENCENT_DOCS_SHEET_NAME`：默认工作表名，默认 `数据汇总`
- `TENCENT_DOCS_WRITE_MODE`：默认写入模式，支持 `append` / `upsert`，默认 `upsert`
- `TENCENT_DOCS_HEADLESS`：是否无头执行腾讯文档浏览器，默认 `true`
- `TENCENT_DOCS_TIMEZONE`：写入“查询时间”时使用的时区，默认 `Asia/Shanghai`

示例：

```bash
export SESSION_SECRET='your-session-secret'
# 如需开启口令，再额外设置：
# export TOOL_AUTH_ENABLED='true'
# export TOOL_PASSWORD='your-password'
export PORT=3001
export MAX_ACTIVE_LOGIN_SESSIONS=5
export MAX_CONCURRENT_QUERIES=2
```

## 本地开发

1. 安装依赖

```bash
npm install
```

2. 启动开发环境

```bash
npm run dev
```

默认地址：
- 前端开发页：`http://127.0.0.1:5173`
- 后端接口：`http://127.0.0.1:3001`

Vite 已代理 `/api` 到后端。

## 生产构建与启动

1. 构建前端

```bash
npm run build
```

2. 启动服务

```bash
npm run start
```

服务会同时托管：
- `/api/*`：后端接口
- `/`：构建后的前端页面

## API 概览

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/accounts`
- `POST /api/accounts/login-sessions`
- `GET /api/accounts/login-sessions/:loginSessionId`
- `DELETE /api/accounts/:accountId`
- `GET /api/tasks`
- `POST /api/tasks/batch`
- `POST /api/tasks/:taskId/refresh-login`
- `POST /api/tasks/:taskId/retry-query`
- `DELETE /api/tasks/:taskId`
- `POST /api/queries`
- `GET /api/tencent-docs/config`
- `POST /api/tencent-docs/jobs/preview`
- `POST /api/tencent-docs/jobs`
- `GET /api/tencent-docs/jobs/:jobId`
- `GET /api/artifacts/*`

## 测试

```bash
npm test
```

## 部署建议（阿里云）

- 使用 Linux 服务器安装 `Chrome` 或 `Chromium`
- 通过 `BROWSER_PATH` 显式指定浏览器路径，避免环境差异
- 使用 `systemd`、`pm2` 或容器方式托管 `npm run start`
- 如果通过 HTTPS 暴露页面，设置 `COOKIE_SECURE=true`
- 持久化保留以下目录：
  - `/data`
  - `/.cache/profiles`
  - `/artifacts/web`

## 自动部署（Git 推送后服务器自动更新）

- 推荐部署分支：`codex/aliyun-guanghe-deploy`
- 服务器可通过 `scripts/auto-deploy-from-git.sh` 每分钟轮询一次远端分支
- 检测到新提交后会自动执行：`git pull --ff-only` → `npm ci` → `npm run build` → `pm2 restart guanghe`
- 运行时配置文件 `.env` 会在服务器侧标记为 `skip-worktree`；`/data` 与 `/.cache/profiles` 建议持久化保留在服务器本地
- 对应 systemd 模板见：`deploy/systemd/guanghe-auto-deploy.service`、`deploy/systemd/guanghe-auto-deploy.timer`

## 已验证示例

- 可查 ID：`554608495125`
- 已知无数据示例：`537029503554`、`553703325997`
