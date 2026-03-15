# Codex 快速接手文档

这份文档是给另一台电脑上的 Codex 用的，目标不是解释所有实现细节，而是让它能在 **10 分钟内判断项目定位、主业务链路、关键文件和推荐技能**，避免一上来走偏。

> 前端 UI 重构 V1 完成记录见 `docs/frontend-ui-refactor-plan.md`。第二轮视觉升级完成记录见 `docs/frontend-ui-visual-v2-plan.md`。第三轮前端性能优化记录见 `docs/frontend-performance-v3-plan.md`。第四轮视觉收口与交互打磨完成记录见 `docs/frontend-ui-v4-plan.md`。当前最新前端基线统一为 `V5`，说明见 `docs/frontend-ui-v5-plan.md`；后续继续做前端页面优化时，优先以 V5 为起点，V1/V2/V3/V4 视为历史档案。

## 0. 先纠偏

- 虽然仓库目录名里有 `XCX`，**当前仓库不是微信小程序项目**。
- 这是一个 **React + Vite 前端 + Express 后端 + Playwright 自动化** 的网页工具。
- 业务目标是：**管理多个光合账号登录态，并按内容 ID 自动抓取固定 5 个指标，同时产出截图和结果文件。**

如果另一台电脑上的 Codex 看到目录名先联想到“小程序 / CloudBase / 微信登录”，那是误判；这个仓库当前主线和这些都无关。

## 1. 项目一句话

这是一个面向单操作者的 Guanghe 查询工作台，重点服务于：

1. 批量生成多个扫码登录任务；
2. 登录成功后自动串起查询；
3. 读取近 30 日固定 5 项指标；
4. 保存原始截图、汇总截图、`results.json`、`network-log.json`；
5. 可选把查询结果同步到腾讯文档。

## 2. 技术栈与运行方式

### 技术栈

- 前端：`React 18` + `Vite`
- 后端：`Node.js` + `Express`
- 自动化：`playwright-core`（持久化浏览器 profile）
- 会话：`express-session`
- 测试：`Vitest` + `Testing Library` + `Supertest` + `jsdom`

### 常用命令

```bash
npm install
npm run dev
npm run build
npm run start
npm test
```

### 运行前提

- 机器上要有 `Chrome` 或 `Chromium`；必要时通过 `BROWSER_PATH` 指定。
- 推荐设置 `SESSION_SECRET`。
- 如果要启用工具口令登录，再设置：
  - `TOOL_AUTH_ENABLED=true`
  - `TOOL_PASSWORD=...`
- 如果要启用腾讯文档同步，再设置：
  - `TENCENT_DOCS_ENABLED=true`
  - `TENCENT_DOCS_DOC_URL=...`
  - `TENCENT_DOCS_SHEET_NAME=...`

## 3. 适合这个仓库的主要 Codex Skills

> 这一节说的是 **适合 Codex 在这个仓库里工作时使用的 skills**，不是项目运行时依赖。另一台电脑即使没有这些 skills 也能接手，只是效率会低一些。

如果是继续接手 V5 之后的前端页面优化，优先组合 `frontend-design-system` + `react-ui-patterns` + `web-accessibility` + `Browser Automation` + `vitest`；这套组合已经在 V5 的批量闭环重排、桌面暗色控制台化和浏览器验收里验证过，适合继续做层级收口、状态反馈、桌面效率优化和视觉回归。

### 核心推荐

1. `express-rest-api`
   - 用途：理解和修改后端路由、服务层、错误处理、配置开关。
   - 最匹配的目录：`server/`
   - 典型场景：新增接口、调整查询流程、修改任务状态流转。

2. `vitest`
   - 用途：理解现有测试结构并补测试。
   - 最匹配的目录：`tests/`
   - 典型场景：改了 `taskService`、`app.js`、前端组件后补回归测试。

3. `Browser Automation`
   - 用途：联调真实页面、验证光合后台页面变化、检查腾讯文档写入效果。
   - 典型场景：页面 selector 失效、需要人工确认 UI 文案变化、需要截图核对。
   - 说明：项目代码里用的是 `playwright-core`，但 Codex 调试页面时这个 skill 很有帮助。

### 次级可选

4. `playwright-automation-fill-in-form`
   - 用途：当你需要在浏览器里快速填写表单做联调时可用。
   - 不是当前仓库主技能，但在调试腾讯文档页面或某些后台表单时有辅助价值。

5. `prompt-optimizer` / `prompt-builder`
   - 用途：给另一台 Codex 继续写交接 prompt、需求拆解 prompt 时可用。
   - 不属于项目开发主链路，不装也不影响代码维护。

### 当前基本无关的 skills

- `miniprogram-development`
- `auth-wechat-miniprogram`
- `cloudbase-document-database-in-wechat-miniprogram`

原因很简单：**这个仓库当前不是微信小程序项目。**

## 4. 一眼看懂的系统结构

```text
前端工作台（web/）
  ├─ 批量任务工作区（主入口）
  └─ 账号查询工作区（次级入口）

Express API（server/app.js）
  ├─ 工具口令认证
  ├─ 账号登录会话管理
  ├─ 手动查询接口
  ├─ 批量任务接口
  ├─ 腾讯文档同步接口
  └─ artifacts 文件访问

服务层（server/services/）
  ├─ loginService：生成二维码、轮询扫码状态、落账号
  ├─ queryService：进入作品分析页、查 5 个指标、落截图和 JSON
  ├─ taskService：批量任务编排、排队、并发控制、失败回写
  └─ screenshotService：生成汇总截图

集成层（server/integrations/tencentDocs/）
  ├─ service：同步任务模型与队列
  ├─ mapping：查询结果 -> 腾讯文档行
  ├─ browserAdapter：浏览器写表
  └─ jobStore：任务持久化
```

## 5. 主要业务逻辑

### 5.1 工具访问与认证

- 默认情况下，工具口令认证是关闭的。
- 如果 `TOOL_AUTH_ENABLED=true`，前端会先走 `/api/auth/login`，服务端通过 `express-session` 写 HTTP-only cookie。
- `GET /api/auth/me` 用来决定前端启动时是否已认证。

### 5.2 多账号登录态管理

核心文件：

- `server/services/loginService.js`
- `server/lib/browserManager.js`
- `server/lib/accountStore.js`

流程：

1. 前端发起 `POST /api/accounts/login-sessions`。
2. 后端创建一个 `loginSessionId`，并启动一个 **独立持久化浏览器上下文**。
3. 自动打开光合登录页，监听二维码生成请求，抓取二维码区域截图。
4. 服务端每 2 秒轮询一次页面状态，识别：
   - `WAITING_QR`
   - `WAITING_CONFIRM`
   - `LOGGED_IN`
   - `EXPIRED`
   - `FAILED`
5. 一旦登录成功，提取账号昵称、头像、账号 ID，并把临时登录 context “转正”为账号专属 profile。
6. 账号信息写入运行时文件 `data/accounts.json`，后续可复用登录态，不需要重复扫码。

### 5.3 手动账号查询

核心文件：

- `server/services/queryService.js`
- `server/lib/guangheUtils.js`
- `server/lib/constants.js`

固定业务约束：

- 输入：`accountId` + `contentId`
- 日期范围：固定近 30 日
- 指标：固定 5 项
  - `内容查看次数`
  - `内容查看人数`
  - `种草成交金额`
  - `种草成交人数`
  - `商品点击次数`

流程：

1. 根据 `accountId` 取到已保存账号 profile。
2. 通过 `BrowserManager.runAccountTask()` 串行化同账号任务，避免同一账号多页面并发互相干扰。
3. 打开光合作品分析页。
4. 如果被重定向到淘宝登录页，则判定账号登录失效，抛出 `ACCOUNT_LOGIN_REQUIRED`。
5. 自动关闭干扰弹层，跳转/确认已处于“作品分析”页面。
6. 自动填写内容 ID、选择近 30 日、勾选固定指标。
7. 记录网络请求日志，并截取原始页面截图。
8. 从网络日志里按 `contentId` 找目标 API 记录。
9. 如果没有匹配记录，明确返回 `NO_DATA`，并保留原图和 `network-log.json`，避免误读页面其他数字。
10. 如果找到记录，就提取 5 个指标，生成：
    - `results.json`
    - 原始截图 `04-results.png`
    - 汇总截图 `05-summary-strip.png`
    - `network-log.json`

### 5.4 批量任务模式（项目主工作区）

核心文件：

- `web/src/components/BatchTasksWorkspace.jsx`
- `server/services/taskService.js`
- `server/lib/taskStore.js`

这是当前产品主入口，比手动查询更重要。

输入格式：

- `备注,内容ID`
- `备注<TAB>内容ID`

核心机制：

1. 用户一次粘贴多行任务。
2. 前端先做逐行校验；后端再做一次兜底校验。
3. 每条任务都会创建一个独立扫码登录会话和二维码。
4. `taskService` 持续轮询登录状态；一旦某条任务登录成功，就自动把该任务入查询队列。
5. 查询成功后，任务卡片直接挂上指标、截图和结果文件链接。

任务状态分两段：

- 登录状态：
  - `WAITING_QR`
  - `WAITING_CONFIRM`
  - `LOGGED_IN`
  - `EXPIRED`
  - `FAILED`
  - `INTERRUPTED`
- 查询状态：
  - `IDLE`
  - `QUEUED`
  - `RUNNING`
  - `SUCCEEDED`
  - `NO_DATA`
  - `FAILED`

并发约束：

- 同时待扫码任务数受 `MAX_ACTIVE_LOGIN_SESSIONS` 限制。
- 自动查询并发数受 `MAX_CONCURRENT_QUERIES` 限制。
- **同一账号的查询永远串行**，由 `BrowserManager.accountQueues` 保证。

重启语义：

- 服务重启后，所有未终态任务会被标记为 `INTERRUPTED`。
- 原因是扫码登录会话和内存状态会丢失，必须重新生成二维码继续。

### 5.5 腾讯文档同步（可选增强）

核心文件：

- `server/integrations/tencentDocs/service.js`
- `server/integrations/tencentDocs/mapping.js`
- `server/integrations/tencentDocs/browserAdapter.js`
- `docs/tencent-docs-integration-design.md`

当前实现特点：

- 受 `TENCENT_DOCS_ENABLED` 开关控制。
- 当前落地方案是 **Browser Adapter**，不是官方 API Adapter。
- 先读取已有 `results.json`，再映射为一行腾讯文档数据。
- 默认按 `accountId:contentId` 生成 `同步键`，用于 `upsert`。
- 已支持通过复制选区 TSV 直接读取腾讯文档可见表格内容，`sheetClipboard.js` 负责解析与表头纠偏。
- 已支持按目标 `sheetRow + columnIndex` 局部回填指定单元格，不必只走整行 append / upsert。
- 文本列回填优先走顶部坐标框 `input.bar-label` 精确跳格，再按连续区间走剪贴板粘贴。
- 图片列回填支持：粘贴截图 -> 自动右键 -> 点击 **“转为单元格图片”**。
- `queryService` 现在会把 `screenshots` / `artifacts` 写进结果文件；`service.js` 也会对旧结果做兜底补齐。

同步支持两种模式：

- `append`
- `upsert`（默认）

同步前会做的事：

1. 校验功能是否启用；
2. 解析 `source.resultUrl` 指向的本地 artifacts 文件；
3. 转换成固定列结构；
4. 用单独的腾讯文档浏览器 profile 打开目标表格；
5. 校验登录态、sheet 是否存在、表头模板是否齐全；
6. 再执行追加或按同步键覆盖。

这个模块是典型“可选集成层”，不影响主查询链路。

### 5.5.1 2026-03-09 实战后最可靠的写表路径

如果下次继续接腾讯文档交接表，优先按下面这条路径，不要先走大范围重构：

1. 用腾讯文档专用 profile 打开真实交接表，并确认已经登录且具备编辑权限；
2. 优先使用顶部坐标框 `input.bar-label` 直接跳到目标单元格；
3. J 列截图：先把图片写入系统剪贴板，再粘贴到目标单元格，然后自动选择 **“转为单元格图片”**；
4. K~O 这类连续数字列：把一整段 TSV 写入剪贴板后一次性粘贴；
5. 写入前后都保留截图 artifacts，用真实页面结果做校验。

### 5.5.2 这次已经确认的事实

- 当前交接表场景里，**C 列是内容 id**；J 列是截图；K~O 是这次要回填的 5 个指标。
- `insertText` 对腾讯文档逐格覆盖并不稳定；对连续文本列，剪贴板整段粘贴明显更可靠。
- 用方向键从 `A1` 逐行逐列走到目标行，容易在真实文档里发生严重偏移；优先使用坐标框跳格。
- 截图默认会先以浮动图片形式进入表格，必须补一步 **“转为单元格图片”** 才符合当前交接要求。
- 整表预读仍然会受到冻结行 / 当前视口 / 滚动位置影响；`readSheet` 适合做预览和排查，不适合单独作为高精度行定位依据。

### 5.5.3 这次新增 / 重点涉及的文件

- `server/integrations/tencentDocs/browserAdapter.js`
  - 读表、跳格、局部单元格回填、图片转单元格图片。
- `server/integrations/tencentDocs/sheetClipboard.js`
  - 腾讯文档选区 TSV 解析、表头归一化与纠偏。
- `server/integrations/tencentDocs/service.js`
  - 结果文件补齐、回填调度与错误兜底。
- `server/services/queryService.js`
  - 查询结果文件写入 `screenshots` / `artifacts`。
- `server/services/taskService.js`、`server/lib/taskStore.js`
  - 批量任务与腾讯文档联动的状态收口。

### 5.5.4 真实验证建议

- 先在远端空白区域或低风险测试行做一次单列验证，例如只写 J 列截图。
- 验证图是否表现为 **单元格内图片**，而不是跨列悬浮图。
- 再回到真实任务行执行完整回填。

## 6. 前端产品结构

核心文件：

- `web/src/App.jsx`
- `web/src/components/BatchTasksWorkspace.jsx`
- `web/src/components/AccountList.jsx`
- `web/src/components/LoginSessionPanel.jsx`
- `web/src/components/QueryForm.jsx`
- `web/src/components/ResultPanel.jsx`

前端结构有两个工作区：

1. **批量任务工作区**：主入口
   - 负责批量贴任务、看待扫码任务、跟查询结果、重试、删除。
2. **账号查询工作区**：次级入口
   - 负责单账号补查、人工校对、临时扫码加号。

几个关键 UI 事实：

- `BatchTasksWorkspace` 会每 2 秒刷新任务列表。
- `App` 会每 10 秒静默刷新账号列表。
- `BatchTasksWorkspace` 最近做过一轮 UI / 交互重排；后续继续优化时优先在现有信息层级上微调，不要轻易推翻整个布局。
- `ResultPanel` 默认优先显示汇总截图，原图用于校对。
- 登录抽屉 `LoginSessionPanel` 是手动账号工作区里扫码登录的核心交互。

## 7. 关键持久化与产物目录

- `data/accounts.json`
  - 已保存账号元数据，属于运行时文件，默认不纳入 Git。
- `data/tasks.json`
  - 批量任务状态持久化。
- `data/tencent-docs-jobs.json`
  - 腾讯文档同步任务持久化。
- `.cache/profiles/`
  - Playwright 持久化浏览器 profile。
- `.cache/profiles/tencent-docs/`
  - 腾讯文档写表专用 profile。
- `artifacts/web/`
  - 查询截图、结果 JSON、网络日志、腾讯文档写入截图等。

要点：

- **登录态跟机器强绑定**，换电脑后如果不复制 `.cache/profiles/`，就需要重新扫码。
- artifacts 是调试核心证据，不建议随便清空。

## 8. 关键文件导航

如果另一台 Codex 只想快速定位“改哪里”，直接看这张表：

| 想改什么 | 先看哪些文件 |
| --- | --- |
| 启动方式、依赖注入 | `server/index.js`、`server/config.js` |
| API 路由 | `server/app.js` |
| 登录二维码、账号落库 | `server/services/loginService.js` |
| 作品分析查询流程 | `server/services/queryService.js` |
| 页面 selector / 指标解析 | `server/lib/guangheUtils.js`、`server/lib/constants.js` |
| 批量任务编排 | `server/services/taskService.js`、`server/lib/taskStore.js` |
| 浏览器上下文与串行队列 | `server/lib/browserManager.js` |
| 腾讯文档同步 | `server/integrations/tencentDocs/` |
| 前端入口与页面布局 | `web/src/App.jsx` |
| 批量任务 UI | `web/src/components/BatchTasksWorkspace.jsx` |
| 手动查询与结果展示 | `web/src/components/QueryForm.jsx`、`web/src/components/ResultPanel.jsx` |

## 9. 推荐阅读顺序

建议另一台电脑上的 Codex 按这个顺序读：

1. `README.md`
2. `docs/codex-onboarding.md`
3. `server/index.js`
4. `server/app.js`
5. `server/services/loginService.js`
6. `server/services/queryService.js`
7. `server/services/taskService.js`
8. `web/src/App.jsx`
9. `web/src/components/BatchTasksWorkspace.jsx`
10. `server/integrations/tencentDocs/service.js`

原因：先看总入口，再看主业务链路，最后看可选集成。

## 10. 测试现状

当前测试不是全链路 E2E，而是偏“单元 + 路由 + 组件”层：

- `tests/app.test.js`
  - 认证、路由、错误返回、批量任务接口。
- `tests/taskService.test.js`
  - 任务创建、自动查询、无数据、重启中断。
- `tests/tencentDocs.test.js`
  - 预览映射、同步开关、任务串行化、重启恢复。
- `tests/guangheUtils.test.js`
  - 光合响应解析与指标映射。
- `tests/screenshotService.test.js`
  - 汇总截图 HTML 生成。
- `tests/frontend.test.jsx`
  - 登录表单、查询表单、结果面板、登录抽屉等关键组件。

如果改动较大，优先补这些层的测试，而不是直接补重量级真浏览器 E2E。

## 11. 容易踩坑的地方

1. **目录名误导**
   - 这个仓库不是小程序项目，不要按小程序思路改。

2. **页面 selector 易变**
   - 真正最容易坏的是 `server/lib/guangheUtils.js` 里的文案候选和页面交互逻辑。

3. **登录态是本地 profile，不是远程 token**
   - 迁移机器时如果不拷贝 `.cache/profiles/`，必须重新扫码。

4. **同账号并发不能随便放开**
   - 现在的串行控制是有意设计，不要轻易删除 `BrowserManager.runAccountTask()`。

5. **无数据不是异常噪音**
   - `NO_DATA` 是明确的业务结果，前后端都有专门处理，别误改成普通 500。

6. **腾讯文档同步不是主链路**
   - 它是外挂能力，出问题时优先保证查询主链路不受影响。

## 12. 给下一台 Codex 的最短结论

如果你只能记住 6 件事，就记住这 6 件：

1. 这是 **React + Express + Playwright** 的网页工具，不是小程序。
2. 主入口是 **批量任务工作区**，不是手动查询。
3. 核心业务是 **扫码登录多个光合账号 -> 自动查询固定 5 指标 -> 保存截图与 JSON**。
4. 真正最关键的后端文件是：
   - `loginService.js`
   - `queryService.js`
   - `taskService.js`
   - `guangheUtils.js`
5. 最值得给 Codex 装/用的 skills 是：
   - `express-rest-api`
   - `vitest`
   - `Browser Automation`
6. 如果联调出问题，先看：
   - `artifacts/web/`
   - `data/tasks.json`
   - `data/accounts.json`（运行时文件）
