# 前端性能优化 V3 交接计划

## Summary
- V3 固定为 `前端优先 + 性能专项 + 稳妥优化`，不切 Vue，不改后端接口契约，不改现有业务语义，不做激进瘦身。
- V2 视觉升级视为稳定基线；V3 目标是收掉默认首屏的无效请求、初始化成本和非必要依赖加载，同时保持当前品牌运营台观感不回退。
- V3 唯一进行中文档固定为 `docs/frontend-performance-v3-plan.md`；交接证据统一落到 `docs/ui-performance-v3/`；`docs/codex-onboarding.md` 需要更新为：V1/V2 为历史档案，V3 为当前执行计划。
- 本轮继续沿用 `react-ui-patterns`、`web-accessibility`、`Browser Automation`、`vitest`；`frontend-design-system` 只用于新的 loading/skeleton 与占位态不跑偏。

## Skills
- [x] 保持 `frontend-design-system` 作为新的 loading/skeleton 与占位态设计基准。
- [x] 保持 `react-ui-patterns` 作为延后加载、渐进展示与旧数据保留策略基准。
- [x] 保持 `web-accessibility` 作为延后加载后的语义结构、键盘交互与焦点管理基准。
- [x] 已确认本地可复用辅助 skills：`Browser Automation`、`vitest`。

## Implementation Checklist
### 0. 文档与基线
- [x] 创建 `docs/frontend-performance-v3-plan.md`，包含本计划、Checklist、`Execution Log`、当前 chunk 基线、初始网络请求基线、验收结果。
- [x] 在 `docs/codex-onboarding.md` 增加 V3 入口，明确：
  `V1 完成记录见 docs/frontend-ui-refactor-plan.md`
  `V2 完成记录见 docs/frontend-ui-visual-v2-plan.md`
  `V3 进行中计划见 docs/frontend-performance-v3-plan.md`
- [x] 记录当前基线：
  默认批量页首屏网络请求链路、手工页首次切换网络链路、当前 `vite build` chunk 结果、当前 `document.body.scrollWidth` 四档结果。
- [x] 证据统一放入 `docs/ui-performance-v3/baseline/` 和 `docs/ui-performance-v3/final/`，并在 `Execution Log` 写明文件路径与关键数字。

### 1. 首屏请求与初始化收口
- [x] `App` 认证完成后不再无条件执行 `loadAccounts()`；默认批量页首屏只允许发起认证、任务列表、腾讯文档配置、SSE 和静态资源请求。
- [x] `useAccounts` 增加 `hasLoadedAccounts` 与 `ensureAccountsLoaded()`，用于显式控制账号库首次加载；保留现有返回的 `accounts`、`selectedAccountId`、`activeAccount` 语义不变。
- [x] `ManualWorkspace` 新增接收 `ensureAccountsLoaded`；当用户第一次切到手工页时再拉账号库，之后复用已加载数据，不重复首屏抢请求。
- [x] `useBatchTasksWorkspace` 启动时只加载 `listTasks` 和 `getTencentDocsConfig`，去掉启动阶段的 `loadAccounts()`。
- [x] 批量页里的账号匹配链路保持现有行为，但只有在用户点击 `匹配账号库` 或后续与账号匹配相关动作时，才拉取批量页自己的账号数据。
- [x] `runTencentDocsInspect()` 不再阻塞批量页首屏启动；当腾讯文档目标已配置时，改为首屏渲染完成后用 `requestIdleCallback`，无该 API 时回退 `setTimeout(300)` 触发静默检查。
- [x] `DemandBoard`、`HandoffControlCenter`、`DiagnosticsPanel` 在延后检查期间展示明确的 loading/skeleton/inline notice，而不是空白或误导性“暂无数据”。

### 2. 资源加载与依赖路径优化
- [x] 保留当前 `lazy + Suspense` 边界，不把已经拆开的 `BatchTasksWorkspace`、`ManualWorkspace`、`LoginSessionPanel` 合回首包。
- [x] 把 `App` 壳层里仅用于头部和标签栏的少量图标从 `lucide-react` 热路径中移出，改为本地轻量内联 SVG 图标组件；`lucide-react` 继续留在异步工作区模块内，不做全局替换。
- [x] `PageHeader` 继续使用 CSS 动画，不重新引入 `motion/react` 到首页壳层。
- [x] `ConfirmDialog`、`ToastViewport`、`TaskBuilderModal`、`LoginSessionPanel` 维持交互触发型 chunk，不允许重新回到默认首屏请求链路。
- [x] `vite.config.mjs` 继续沿用现有 `manualChunks` 方向，只做稳定性增强，不增加新的运行时依赖或大型分析器依赖。

### 3. 加载态、可访问性与体验约束
- [x] 延后加载后的所有区域保留可访问语义：`status`、`aria-live`、按钮可读名称、键盘焦点和 `prefers-reduced-motion` 不回退。
- [x] 手工页第一次切入前，顶部账号数显示占位值或加载态，但不闪空布局。
- [x] 批量页延后检查期间，首屏仍优先展示英雄区、控制区和任务区骨架，不能让“性能优化”变成“信息消失”。
- [x] 本轮不改视觉方向，不新增新的 UI 框架，不顺手改业务状态机、SSE、轮询或后端接口。

### 4. 验收与测试
- [x] 更新 `tests/batchWorkspace.test.jsx`，覆盖：
  默认进入批量页时不会调用 `api.listAccounts`
  批量页启动时仍会拉 `listTasks` 与 `getTencentDocsConfig`
  腾讯文档静默检查会在首屏后触发，显式“检查交接表/匹配账号库”仍走即时检查
  点击 `匹配账号库` 仍会触发账号加载与强制检查
- [x] 更新 `tests/frontend.test.jsx` 或相关前端测试，覆盖：
  第一次切到手工页时调用一次 `api.listAccounts`，再次切换不重复首载
  延后加载期间的 loading/skeleton/inline notice 正常显示
  已有数据时不闪空
- [x] 确认 `ConfirmDialog`、`ToastViewport`、`TaskBuilderModal`、`LoginSessionPanel` 仍可键盘操作且图标按钮有可访问名称。
- [x] 运行 `npm test`。
- [x] 运行 `npm run build`。
- [x] 使用浏览器验收默认批量页初始网络链路中不再出现 `/api/accounts`。
- [x] 使用浏览器验收默认批量页初始链路中不出现登录抽屉、确认弹窗、toast、建任务弹窗对应 chunk。
- [x] 使用浏览器验收首页初始链路继续不出现 `motion_react`。
- [x] 确认入口 `index-*.js` 不高于当前基线，且 chunk 结果写入 `Execution Log`。
- [x] 验证 `1440 / 1024 / 768 / 390` 四档无横向溢出。
- [x] 验证默认批量页首屏依然优先呈现英雄区与主任务区，不因为延后加载而破坏阅读顺序。

## Interfaces
- 不修改任何后端公共 API，不改 `web/src/api.js` 的请求/响应结构。
- 内部接口改动固定为：
  `useAccounts` 新增 `hasLoadedAccounts`、`ensureAccountsLoaded`
  `ManualWorkspace` 新增 `ensureAccountsLoaded`
  `App` 改为按 tab/动作驱动账号库加载，而不是认证后立即加载
- `useBatchTasksWorkspace` 的外部组件接口不变，只调整内部 boot 顺序与延后检查策略。
- V3 只维护 `docs/frontend-performance-v3-plan.md` 这一份计划文件；V2 文件保留为已完成档案，不混写进度。

## Test Plan
- 行为测试必须覆盖：
  默认进入批量页时不会调用 `api.listAccounts`
  第一次切到手工页时调用一次 `api.listAccounts`，再次切换不重复首载
  批量页启动时仍会拉 `listTasks` 与 `getTencentDocsConfig`
  腾讯文档静默检查会在首屏后触发，显式“检查交接表/匹配账号库”仍走即时检查
  点击 `匹配账号库` 仍会触发账号加载与强制检查
- 交互测试必须覆盖：
  延后加载期间的 loading/skeleton/inline notice 正常显示
  已有数据时不闪空
  `ConfirmDialog`、`ToastViewport`、`TaskBuilderModal`、`LoginSessionPanel` 仍可键盘操作且图标按钮有可访问名称
- 构建与网络验收必须覆盖：
  `npm test` 全量通过
  `npm run build` 通过
  默认批量页初始网络链路中不再出现 `/api/accounts`
  默认批量页初始链路中不出现登录抽屉、确认弹窗、toast、建任务弹窗对应 chunk
  首页初始链路继续不出现 `motion_react`
  入口 `index-*.js` 不高于当前基线，且 chunk 结果写入 `Execution Log`
- 响应式与体验验收必须覆盖：
  `1440 / 1024 / 768 / 390` 四档无横向溢出
  默认批量页首屏依然优先呈现英雄区与主任务区，不因为延后加载而破坏阅读顺序

## Assumptions
- 默认批量页仍是产品主入口，V3 优先优化默认批量页的启动成本，再处理手工页首次进入成本。
- 本轮选择“稳妥优化”，因此不替换 `motion`、不大面积替换 `lucide-react`、不引入新的运行时依赖。
- 允许为 V3 新增本地轻量 helper、占位组件和文档目录，但不新增新的后端契约、路由或全局状态方案。
- 如果实现过程中发现某项优化会明显改变 V2 已确认的视觉表现或交互语义，则以保持 V2 体验稳定为先。

## Known Issues
- 当前无阻塞性遗留问题；生产构建下 `/api/events` 会推送初始账号快照，因此手工页首次切换实测只新增 `ManualWorkspace` chunk 请求，没有额外 `/api/accounts`，这比原计划更省。

## Execution Log
- 2026-03-14：创建 V3 计划文件，目标为“默认首屏请求收口、初始化成本下降、非必要依赖延后加载”，保持 V2 品牌运营台观感不回退。
- 2026-03-14：完成代码改造，核心落点如下：
  `web/src/App.jsx` 移除认证后的无条件 `loadAccounts()`，改为按 tab 驱动账号库加载；
  `web/src/hooks/useAccounts.js` 新增 `hasLoadedAccounts`、`ensureAccountsLoaded()`；
  `web/src/components/ManualWorkspace.jsx` 新增首次切入账号库按需加载与页内 notice；
  `web/src/hooks/useBatchTasksWorkspace.js` 启动阶段只拉 `listTasks` / `getTencentDocsConfig`，并将静默检查改为 `requestIdleCallback` / `setTimeout(300)` 延后触发；
  `web/src/components/batch/HandoffControlCenter.jsx`、`web/src/components/batch/DemandBoard.jsx`、`web/src/components/batch/DiagnosticsPanel.jsx` 补齐延后检查期间的 skeleton / inline notice；
  `web/src/components/ui/PageHeader.jsx`、`web/src/components/ui/ShellIcons.jsx` 把壳层图标从 `lucide-react` 热路径中移出。
- 2026-03-14：完成测试回归。
  `npm test` 通过，结果为 `13 passed / 99 passed`。
  新增/更新验证点包括：
  默认批量页启动不调用 `api.listAccounts`；
  初始静默检查确实延后到 idle 回调后触发；
  手工页首次切入才触发账号库加载，重复切换不重复首载；
  延后加载期间的 loading / notice 可见。
- 2026-03-14：完成构建验收。
  Baseline（HEAD / V2）chunk：
  `dist/assets/index-BulbZPuW.js` `14.72 kB` gzip `5.88 kB`
  `dist/assets/BatchTasksWorkspace-DASj9cUU.js` `71.25 kB` gzip `20.99 kB`
  `dist/assets/ManualWorkspace-BEx3Z_lH.js` `16.89 kB` gzip `5.96 kB`
  `dist/assets/icon-vendor-RtffICTF.js` `19.92 kB` gzip `4.41 kB`
  `dist/assets/motion-vendor-DYbArN-X.js` `126.75 kB` gzip `41.68 kB`
  `dist/assets/react-vendor-D7f9BLy3.js` `141.83 kB` gzip `45.42 kB`
  Final（V3）chunk：
  `dist/assets/index-Cl2xvTT8.js` `14.54 kB` gzip `5.85 kB`
  `dist/assets/BatchTasksWorkspace-CZVIUKUW.js` `74.80 kB` gzip `22.16 kB`
  `dist/assets/ManualWorkspace-C1pbF-E7.js` `17.23 kB` gzip `6.20 kB`
  `dist/assets/icon-vendor-CmNObyB5.js` `18.64 kB` gzip `4.19 kB`
  `dist/assets/motion-vendor-DYbArN-X.js` `126.75 kB` gzip `41.68 kB`
  `dist/assets/react-vendor-D7f9BLy3.js` `141.83 kB` gzip `45.42 kB`
  结论：
  入口 `index-*.js` 已从 `14.72 kB` 收到 `14.54 kB`，低于 V3 开始前基线。
- 2026-03-14：完成浏览器网络链路验收，证据文件如下。
  Baseline 指标与请求：`docs/ui-performance-v3/baseline/baseline-metrics.json`
  Final 指标与请求：`docs/ui-performance-v3/final/final-metrics.json`
  Baseline 截图：
  `docs/ui-performance-v3/baseline/baseline-batch-desktop.png`
  `docs/ui-performance-v3/baseline/baseline-batch-mobile.png`
  `docs/ui-performance-v3/baseline/baseline-manual-desktop.png`
  `docs/ui-performance-v3/baseline/baseline-manual-mobile.png`
  Final 截图：
  `docs/ui-performance-v3/final/final-batch-desktop.png`
  `docs/ui-performance-v3/final/final-batch-mobile.png`
  `docs/ui-performance-v3/final/final-manual-desktop.png`
  `docs/ui-performance-v3/final/final-manual-mobile.png`
  关键差异：
  Baseline 默认批量页初始链路包含两次 `/api/accounts`，且首屏同步拉起账号库；
  Final 默认批量页初始链路只保留 `/api/auth/me`、`/api/events`、`/api/tasks`、`/api/tencent-docs/config` 与静态资源，请求中不再出现 `/api/accounts`；
  Final 默认批量页初始链路未出现 `LoginSessionPanel`、`ConfirmDialog`、`ToastViewport`、`TaskBuilderModal`、`motion-vendor`；
  Final 手工页首次切换实测只新增 `ManualWorkspace` chunk，请求中没有额外 `/api/accounts`，因为初始 SSE 已提供账号快照。
- 2026-03-14：完成响应式验收。
  `docs/ui-performance-v3/baseline/baseline-metrics.json` 与 `docs/ui-performance-v3/final/final-metrics.json` 均记录了 `1440 / 1024 / 768 / 390` 四档结果；
  Final 批量页与手工页在四档视口下均满足 `document.body.scrollWidth === window.innerWidth`，未发现横向溢出。
