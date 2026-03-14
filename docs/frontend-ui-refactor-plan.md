# 前端 UI 重构与交接计划

## Summary
- 本次重构只做 `React + Vite` 前端，不切 Vue，不改后端接口契约，不引入 Tailwind/shadcn/Radix。
- 计划的项目内落点固定为 `docs/frontend-ui-refactor-plan.md`，后续所有 AI/工程师都在这一个文件里继续打勾和追加进展。
- 为了让后续 AI 能快速接手，需要同时在 `docs/codex-onboarding.md` 增加一条指向该计划文件的入口说明。
- 本轮目标是把前端从“功能堆叠的内部工具页”重构成“信息层级清晰、状态表达统一、响应式可用的运营控制台”。

## Skills
- [x] 保持 `React + Vite` 技术栈，不做 Vue 迁移。
- [x] 已选定执行所需 skills：`frontend-design-system`、`react-ui-patterns`、`web-accessibility`。
- [x] 已确认本地可复用辅助 skills：`Browser Automation`、`vitest`。
- [x] 安装 `frontend-design-system`
  `npx skills add https://github.com/supercent-io/skills-template --skill frontend-design-system`
- [x] 安装 `react-ui-patterns`
  `npx skills add https://github.com/sickn33/antigravity-awesome-skills --skill react-ui-patterns`
- [x] 安装 `web-accessibility`
  `npx skills add https://github.com/supercent-io/skills-template --skill web-accessibility`

## Implementation Checklist
### 0. 交接与基线
- [x] 完成仓库结构、页面入口、主要组件、样式层和测试现状的审查。
- [x] 完成当前 UI 问题归因：批量页信息堆叠、手工页工作流混杂、样式单体化、移动端横向溢出、交互反馈不统一。
- [x] 创建 `docs/frontend-ui-refactor-plan.md`，内容即本计划，并在文件底部预留 `Execution Log` 区块。
- [x] 在 `docs/codex-onboarding.md` 增加一条“前端 UI 重构计划见 `docs/frontend-ui-refactor-plan.md`”的说明。
- [x] 用 `Browser Automation` 或 Playwright MCP 分别抓取批量页和手工页的桌面版、手机版基线截图，并把截图路径登记到 `Execution Log`。
- [x] 在计划文件中记录当前已知问题清单：视觉层级、信息架构、响应式、alert/confirm、全局事件切页、样式文件过大。

### 1. 设计系统地基
- [x] 把当前单体 `web/src/styles.css` 拆成 `web/src/styles/index.css` 统一入口，并固定导入顺序为：`tokens.css`、`base.css`、`layout.css`、`components.css`、`responsive.css`。
- [x] 用 CSS variables 建立统一 token：颜色、文字层级、边框、阴影、圆角、间距、状态色、动效时长、断点。
- [x] 删除对 `body { min-width: 1200px; }` 的依赖，确保 390px 视口下页面无横向滚动。
- [x] 在 `web/src/components/ui/` 新增可复用 UI 原语：`PageHeader`、`SectionCard`、`StatCard`、`StatusBadge`、`Toolbar`、`EmptyState`、`InlineNotice`、`ConfirmDialog`。
- [x] 去掉 `App.jsx`、`AccountList.jsx`、`LoginSessionPanel.jsx` 中的内联样式，统一走设计系统类名和 token。
- [x] 最终状态不再依赖“大而全”的旧 `styles.css` 继续扩展；迁移完成后仅保留拆分后的样式入口。

### 2. 批量工作台重构
- [x] 保留 `BatchTasksWorkspace.jsx` 作为数据容器入口，不再承载大段展示结构。
- [x] 在 `web/src/components/batch/` 中拆出页面级区块：`BatchHeroSummary`、`HandoffControlCenter`、`DemandBoard`、`TaskBoard`、`DiagnosticsPanel`、`TaskBuilderModal`。
- [x] 将批量页重排为三段式：顶部控制中心、交接表需求区、任务执行区。
- [x] 顶部控制中心必须只展示核心状态：腾讯文档目标、登录状态、待补数人数、异常任务数、最近同步时间、主操作按钮。
- [x] 腾讯文档“同步诊断”改为默认折叠的“高级排障”，不再与主流程抢首屏注意力。
- [x] 缺数达人列表保留一等入口地位，但过滤器、搜索框、批量创建按钮需要统一到同一套工具栏视觉语义。
- [x] 任务列表继续沿用现有 API 和状态机，不改业务语义，只重做卡片、标签、详情区、空态、异常态和按钮层级。
- [x] `TaskComponents.jsx` 继续拆分，目标是展示组件单文件不超过约 300 行，容器组件不超过约 500 行。

### 3. 手工查询工作台重构
- [x] 手工页只保留“账号管理 + 单条查询”，不再承载交接表匹配和一键填表动作。
- [x] 将 `AccountList` 中的 `匹配交接表` 和 `一键查询填表` 迁回批量页对应控制区。
- [x] `ManualWorkspace` 改为显式接收 `onRequestBatchTab`，替代当前 `window.dispatchEvent('switch-to-batch-tasks')` 切页方式。
- [x] 手工页顶部改成轻量页头，只展示页面目标、已保存账号数、当前登录流程提示。
- [x] 查询工具条改成稳定的主表单区：当前账号卡片、内容 ID 输入、提交按钮、处理中提示，桌面横排、移动竖排。
- [x] 结果区改成“状态条 + 5 个主 KPI + 次要信息 + 截图切换”的统一结构，弱化次要元数据的视觉权重。
- [x] 登录抽屉保留现有流程，但统一 stepper、状态卡、短信验证卡、二维码占位态的视觉规范。

### 4. 交互与状态清理
- [x] 用 `ConfirmDialog`、页内 `InlineNotice`、已有 toast 机制替换 `window.alert` 和 `window.confirm`。
- [x] 保留批量页现有 toast 思路，并把手工页交互反馈对齐到同一模式。
- [x] 合并或明确分工 `web/src/lib/ui.js` 与 `web/src/lib/taskFormat.js` 中重复的展示逻辑，避免 `formatDateTime`、`formatMetricValue`、状态文案多处各写一份。
- [x] 保持 `web/src/api.js` 的接口形状不变，本轮不新增或改写后端公共 API。
- [x] 保持 SSE、轮询、任务同步语义不变；UI 重构不能顺手改任务编排逻辑。

### 5. 可访问性与响应式
- [x] 按 `web-accessibility` 的要求补齐语义结构：`header`、`main`、`aside`、正确的 heading hierarchy、表单 label、按钮可读名称。
- [x] 确保抽屉、弹窗、手风琴和标签切换可用键盘完成操作，并有可见 focus state。
- [x] 确保颜色不是唯一状态信号，状态标签需要同时保留文案。
- [x] 批量页、手工页必须在 1440px、1024px、768px、390px 四档视口下无横向溢出、无关键内容遮挡。
- [x] 检查加载态、空态、错误态、成功态在两页中的呈现方式统一。

### 6. 验收与测试
- [x] 更新 `tests/frontend.test.jsx`，覆盖新的登录表单、查询工具条、结果区、重试登录态。
- [x] 更新 `tests/batchWorkspace.test.jsx`，覆盖新的批量页结构、折叠诊断区、任务过滤器、详情展开和文档操作入口。
- [x] 新增对 `onRequestBatchTab` 替代全局事件的测试。
- [x] 新增对 `ConfirmDialog` 替代原生确认框的测试。
- [x] 运行 `npm test`。
- [x] 运行 `npm run build`。
- [x] 用 `Browser Automation` 或 Playwright MCP 做桌面/移动端最终截图验收。
- [x] 把测试结果、构建结果、关键截图路径、未解决风险写入 `Execution Log`。

## Interfaces
- 不计划修改任何后端公共 API 或 `web/src/api.js` 的请求/响应结构。
- 计划修改的内部接口只有：
- `App` 向 `ManualWorkspace` 透传 `onRequestBatchTab`，移除基于 `window` 的跨组件切页事件。
- 新增 `web/src/components/ui/` 作为统一 UI 原语目录。
- 新增 `web/src/components/batch/` 作为批量页展示区块目录。
- `web/src/main.jsx` 改为引入 `web/src/styles/index.css` 作为样式入口。

## Test Plan
- 批量页必须验证：
- 腾讯文档目标已配置、已登录、待补数列表可见时，首屏主信息不再被诊断面板抢占。
- 筛选、搜索、展开任务详情、查看文档回填信息仍然可用。
- 诊断区默认折叠，展开后仍能看到表头、截图和诊断链接。
- 手工页必须验证：
- 选账号、删账号、发起单条查询仍然可用。
- 内容 ID 仍然只接受数字并给出输入提示。
- 成功、无数据、登录失效三种结果态都正确展示。
- 交互必须验证：
- 不再出现原生 `alert`/`confirm`。
- 抽屉、弹窗、accordion、tab 切换可键盘操作。
- 响应式必须验证：
- 390px 视口下 `document.body.scrollWidth <= window.innerWidth`。
- 两个主页面都没有按钮挤压、卡片裁切或横向滚动。

## Assumptions
- 当前会话处于执行阶段，skill 安装和计划文件落地已完成。
- 本轮重构优先解决“信息架构、视觉层级、交互一致性、响应式和可访问性”，不顺带做业务规则改写。
- 本轮不引入新的运行时 UI 框架或大型依赖，设计系统通过 React 组件 + CSS variables 落地。
- 后续任何 AI/工程师继续这个任务时，只维护 `docs/frontend-ui-refactor-plan.md` 这一份计划文件，并在同一文件内持续打勾和追加 `Execution Log`，不再新建第二份平行计划。

## Known Issues
- 当前计划项已全部完成，无阻塞性遗留问题。

## Execution Log
- 2026-03-13：确认本项目继续采用 `React + Vite`，不做 Vue 迁移。
- 2026-03-13：安装并确认可用 skills：`frontend-design-system`、`react-ui-patterns`、`web-accessibility`。
- 2026-03-13：完成仓库结构、前端入口、主要组件、样式层和测试现状审查，并归纳当前 UI 主要问题。
- 2026-03-13：在 `docs/codex-onboarding.md` 增加前端 UI 重构计划入口，后续交接统一指向本文件。
- 2026-03-13：使用 Playwright MCP 抓取基线截图并归档到 `docs/ui-baseline/`：
  - `docs/ui-baseline/batch-desktop-2026-03-13.png`
  - `docs/ui-baseline/batch-mobile-2026-03-13.png`
  - `docs/ui-baseline/manual-desktop-2026-03-13.png`
  - `docs/ui-baseline/manual-mobile-2026-03-13.png`
- 2026-03-14：落地第一批设计系统基础设施：
  - 新增 `web/src/styles/index.css` 与 `tokens.css`、`base.css`、`layout.css`、`components.css`、`responsive.css`。
  - 新增 `web/src/components/ui/` 原语：`PageHeader`、`SectionCard`、`StatCard`、`StatusBadge`、`Toolbar`、`EmptyState`、`InlineNotice`、`ConfirmDialog`。
  - `web/src/main.jsx` 已切换到新的样式入口；当前仍通过 `components.css` 桥接旧 `styles.css`，后续继续迁移遗留样式。
- 2026-03-14：完成第一批手工页与应用壳重构：
  - `App` 改为通过显式 `onRequestBatchTab` 向 `ManualWorkspace` 透传切页能力，移除全局 `window` 切页事件。
  - `ManualWorkspace` 已改为页内 `InlineNotice` + `ConfirmDialog`，不再使用原生 `alert` / `confirm` 处理交接表匹配和批量任务下发。
  - `AccountList`、`LoginSessionPanel`、`QueryForm`、`ResultPanel` 已接入新的 UI 原语并清理关键内联样式。
- 2026-03-14：验证结果：
  - `npm test` 通过，`13` 个测试文件、`92` 个测试全部通过。
  - `npm run build` 通过；产物为 `dist/assets/index-B4j6JoM3.css`（`37.86 kB`，gzip `7.16 kB`）与 `dist/assets/index-CiD8r4mm.js`（`242.20 kB`，gzip `76.13 kB`）。
- 2026-03-14：完成批量工作台第一轮重构落地：
  - `BatchTasksWorkspace` 已改为数据容器 + 区块编排角色，首屏拆为 `BatchHeroSummary`、`HandoffControlCenter`、`DemandBoard`、`DiagnosticsPanel`、`TaskBoard`。
  - “同步诊断”已改为默认折叠的“高级排障”，相关测试已更新为先验证折叠态，再展开检查诊断面板与产物链接。
  - `web/src` 中已搜索不到原生 `window.alert` / `window.confirm` 调用，批量页与手工页均改为 `ConfirmDialog` / `InlineNotice` / toast 组合。
- 2026-03-14：补齐第二批可访问性与响应式基础：
  - `App` 顶部工作台切换改为显式 `tab` / `tabpanel` 关联，手工结果截图切换补齐 `aria-controls`、`aria-labelledby` 与键盘焦点顺序。
  - `ConfirmDialog` 增加 ESC 关闭、初始聚焦、Tab 焦点循环与关闭后焦点恢复。
  - `AccountList` 更多操作菜单补齐 `aria-haspopup`、`aria-expanded`、`role="menu"` / `role="menuitem"`。
  - `web/src/styles.css` 已移除 `body { min-width: 1200px; }` 的旧限制；最终移动端无横向滚动仍待截图验收确认。
- 2026-03-14：最新验证结果：
  - `npm test` 再次通过，`13` 个测试文件、`92` 个测试全部通过。
  - `npm run build` 再次通过；产物为 `dist/assets/index-D0yrN5iw.css`（`38.07 kB`，gzip `7.24 kB`）与 `dist/assets/index-CXismZqm.js`（`249.66 kB`，gzip `78.46 kB`）。
- 2026-03-14：当前遗留风险：
  - `web/src/styles.css` 仍作为遗留样式桥接存在，尚未完成彻底拆分。
  - `BatchTasksWorkspace.jsx` 与 `TaskComponents.jsx` 体量仍偏大，尚未达到计划中的拆分目标。
- 2026-03-14：完成手工页职责边界回迁与最终响应式验收：
  - `ManualWorkspace` 现仅保留账号管理、单条查询和前往批量闭环入口；`AccountList` 已移除“匹配交接表 / 一键查询填表”动作。
  - 批量页 `DemandBoard` 新增“账号库联动”区块，支持匹配已保存账号并通过 `createSheetDemandTaskFromAccounts` 直接创建批量任务。
  - 查询工具条已在移动端改为单列堆叠，批量页与手工页在 1440 / 1024 / 768 / 390 四档视口下实测 `document.body.scrollWidth <= window.innerWidth`。
- 2026-03-14：最终截图验收归档到 `docs/ui-final/`：
  - `docs/ui-final/batch-desktop-2026-03-14.png`
  - `docs/ui-final/batch-mobile-2026-03-14.png`
  - `docs/ui-final/manual-desktop-2026-03-14.png`
  - `docs/ui-final/manual-mobile-2026-03-14.png`
- 2026-03-14：最新一轮验证结果：
  - `npm test` 通过，`13` 个测试文件、`92` 个测试全部通过。
  - `npm run build` 通过；产物为 `dist/assets/index-UzWSBcHy.css`（`38.41 kB`，gzip `7.31 kB`）与 `dist/assets/index-Dhw5bcHF.js`（`251.52 kB`，gzip `79.04 kB`）。
- 2026-03-14：当前遗留风险：
  - `web/src/styles.css` 仍作为遗留样式桥接存在，尚未完成彻底拆分。
  - `BatchTasksWorkspace.jsx` 与 `TaskComponents.jsx` 体量仍偏大，尚未达到计划中的拆分目标。
- 2026-03-14：完成手工结果区信息分层重构：
  - `ResultPanel` 现按“状态条 + 5 个主 KPI + 次要指标 + 元信息 + 截图切换”输出，主 KPI 聚焦查看次数、查看人数、种草成交金额、种草成交人数、商品点击次数。
  - 次要互动指标已下沉为独立区块，手工页空态文案也同步更新，不再强调“9 个核心指标平铺”。
- 2026-03-14：最新一轮验证结果：
  - `npm test` 通过，`13` 个测试文件、`92` 个测试全部通过。
  - `npm run build` 通过；产物为 `dist/assets/index-CrxqMu0N.css`（`38.67 kB`，gzip `7.32 kB`）与 `dist/assets/index-DuC4NF7Q.js`（`252.12 kB`，gzip `79.19 kB`）。
- 2026-03-14：当前遗留风险：
  - `web/src/styles.css` 仍作为遗留样式桥接存在，尚未完成彻底拆分。
  - `BatchTasksWorkspace.jsx` 与 `TaskComponents.jsx` 体量仍偏大，尚未达到计划中的拆分目标。
  - 登录抽屉视觉规范仍未完成统一。
- 2026-03-14：完成登录抽屉第二轮重构：
  - `LoginSessionPanel` 改为设计系统抽屉结构，补齐 `header/main/footer` 语义、ESC 关闭、焦点锁定、表单 label、状态播报与 stepper 文案状态。
  - `tests/frontend.test.jsx` 新增短信验证码提交和 `Escape` 关闭覆盖，并增加 `afterEach(cleanup)` 防止前端测试串 DOM。
- 2026-03-14：完成交互反馈与共享展示逻辑收口：
  - 新增 `web/src/hooks/useToastQueue.js` 与 `web/src/components/ui/ToastViewport.jsx`，批量页和手工页统一使用同一套 toast 反馈模式。
  - `web/src/lib/ui.js` 现统一承载通用 `formatDateTime` / `formatMetricValue` 与腾讯文档登录态文案；`web/src/lib/taskFormat.js` 改为复用共享格式化逻辑并保留任务状态语义。
- 2026-03-14：完成大文件拆分与容器瘦身：
  - `BatchTasksWorkspace.jsx` 已缩减为 `160` 行展示壳，主要副作用和任务编排迁移至 `web/src/hooks/useBatchTasksWorkspace.js`。
  - `TaskComponents.jsx` 已拆为聚合出口；`TaskCard.jsx`、`TaskDetailAccordion.jsx`、`TaskSmsInput.jsx`、`batch/TaskBuilderModal.jsx` 均已独立落盘，单文件均低于 `300` 行。
- 2026-03-14：完成样式桥接收口：
  - 旧 `web/src/styles.css` 已被吸收进新的样式入口并移除文件本体，当前前端仅通过 `web/src/styles/index.css` 及其拆分层工作，不再依赖桥接导入。
- 2026-03-14：补做最终截图验收 `v2`：
  - `docs/ui-final/batch-desktop-2026-03-14-v2.png`
  - `docs/ui-final/batch-mobile-2026-03-14-v2.png`
  - `docs/ui-final/manual-desktop-2026-03-14-v2.png`
  - `docs/ui-final/manual-mobile-2026-03-14-v2.png`
- 2026-03-14：最新收口验证结果：
  - `npm test` 通过，`13` 个测试文件、`94` 个测试全部通过。
  - `npm run build` 通过；产物为 `dist/assets/index-DKT_cKGD.css`（`42.14 kB`，gzip `7.89 kB`）与 `dist/assets/index-C-HHg9NF.js`（`262.02 kB`，gzip `82.27 kB`）。
