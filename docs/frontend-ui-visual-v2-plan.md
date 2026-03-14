# 前端视觉升级 V2 交接计划

## Summary
- 第二轮只做 `React + Vite` 前端视觉升级，不切 Vue，不改后端接口契约，不改现有业务语义。
- 本轮目标不是再做一次“结构整理”，而是把现有界面升级成更明显的“品牌运营台”风格：视觉变化要一眼可见，但仍保持专业、可信、适合日常运营使用。
- V1 完成记录继续保留在 `docs/frontend-ui-refactor-plan.md`；V2 新计划固定落点为 `docs/frontend-ui-visual-v2-plan.md`，后续所有 AI/工程师只在这一个 V2 文件里继续打勾和追加 `Execution Log`。
- `docs/codex-onboarding.md` 需要同时标明：V1 是已完成基线，V2 是当前进行中的视觉升级计划。
- 本轮设计方向固定为：`品牌运营台 / 可加图标和动画 / 两页都升级`。

## Skills
- [x] 保持 `frontend-design-system` 作为视觉系统与 token 设计基准。
- [x] 保持 `react-ui-patterns` 作为加载态、错误态、空态、渐进展示与交互反馈基准。
- [x] 保持 `web-accessibility` 作为语义结构、键盘交互、焦点管理与动效降级基准。
- [x] 已确认本地可复用辅助 skills：`Browser Automation`、`vitest`。
- [x] 安装图标与动画依赖  
  `npm install lucide-react motion`
- [x] 在本计划顶部固定记录本轮设计方向：`品牌运营台 / 可加图标和动画 / 两页都升级`

## Implementation Checklist
### 0. 交接与基线
- [x] 创建 `docs/frontend-ui-visual-v2-plan.md`，内容即本计划，并在文件底部预留 `Execution Log` 区块。
- [x] 在 `docs/codex-onboarding.md` 增加 V2 入口说明，明确：
  `V1 完成记录见 docs/frontend-ui-refactor-plan.md`
  `V2 进行中计划见 docs/frontend-ui-visual-v2-plan.md`
- [x] 复用当前已完成的 V1 页面作为 V2 基线，用 `Browser Automation` 或 Playwright MCP 抓取批量页和手工页的桌面版、手机版基线截图。
- [x] 将 V2 基线截图统一登记到 `docs/ui-visual-v2/baseline/`，并把实际文件路径写入 `Execution Log`。
- [x] 在计划文件中登记当前 V2 已知问题：品牌识别弱、首页冲击力不足、卡片层级过于平均、动作按钮辨识度不够、结果区焦点仍偏分散、登录抽屉仍偏“工具页”质感。

### 1. 视觉系统升级
- [x] 保持浅色主题，但将设计语言升级为“品牌运营台”：主背景改为暖白 + 墨蓝 + 金棕点缀，不走蓝白默认企业后台感。
- [x] 在 `web/src/styles/tokens.css` 扩充并重命名 token 分层，至少补齐：品牌主色、强调色、运营告警色、暖色表面层、深色展示层、渐变、描边强弱、数字字体栈、focus ring、overlay、z-index、动效节奏。
- [x] 明确本轮色彩方向：
  `brand-ink` 负责标题和深色大区块，
  `brand-sand` / `brand-ivory` 负责页面背景与卡面层次，
  `brand-gold` 负责高价值 CTA 和关键数据强调，
  `brand-coral` 负责提醒与运营动作，
  状态色继续保留 success / warning / danger 的可访问表达。
- [x] 明确本轮字体方向：正文继续使用兼容中文的无衬线栈；大标题与 KPI 数字单独使用更有张力的数字优先字体栈，不新增在线字体依赖。
- [x] 在 `web/src/styles/components.css` 中去掉“所有卡片都长得差不多”的旧倾向，建立三层表面语言：品牌英雄区、业务主卡、次级信息卡。
- [x] 为 `PageHeader`、`SectionCard`、`StatCard`、`StatusBadge`、`Toolbar`、`InlineNotice`、`EmptyState`、`ConfirmDialog`、`ToastViewport` 增加 `variant` / `emphasis` / `icon` / `eyebrow` 这类视觉扩展能力，作为 V2 统一原语。
- [x] 所有重要状态都改为“图标 + 文案 + 颜色”三重表达，不允许只靠颜色区分。
- [x] 增加 `prefers-reduced-motion` 降级策略；动画存在感要明显，但默认不造成眩晕、不影响任务阅读。

### 2. 全局壳层与导航气质升级
- [x] 重做工作台总壳层，让顶部区域从“普通页签切换”升级为“品牌运营控制台头部”：包含品牌标题、当前工作台、关键状态摘要、主次操作区。
- [x] 现有批量页与手工页切换区域升级为更清晰的运营级 segmented control，不改变路由和业务切换逻辑。
- [x] 页面首屏加入可辨识的背景层语言：渐变、柔和网格/噪点、深浅叠层，但不影响数据可读性。
- [x] 统一所有主按钮、次按钮、危险按钮、图标按钮的尺寸、字重、阴影、悬停和按压反馈，避免现在“功能上能点，但品牌感不够”的问题。
- [x] 统一所有 loading / empty / error / success 的视觉语气，做到两页的状态反馈像同一产品，而不是同一项目里两套风格。

### 3. 批量工作台视觉重构
- [x] 保留 `BatchTasksWorkspace.jsx` 的数据容器职责，不改 API 和状态机，只升级其展示气质与区块编排。
- [x] 将 `BatchHeroSummary` 重做成真正的“品牌英雄区”：左侧为运营说明与主 CTA，右侧为 4 个核心 KPI 的高对比摘要卡，不再只是普通统计卡平铺。
- [x] `BatchHeroSummary` 中的“高级排障”入口改为低干扰的次级操作，不再和“手工建任务 / 刷新列表”抢同级注意力。
- [x] `HandoffControlCenter` 重做为“双卡指挥台”：左卡负责交接表配置与检查，右卡负责腾讯文档登录与二维码，强调“先定目标，再通登录态”的工作流。
- [x] `DemandBoard` 升级为更像运营看板的结构：顶部总结条 + 中部匹配账号区 + 底部需求列表区，视觉上明确“准备态 / 可执行态 / 异常态”。
- [x] 缺数达人列表保留表格语义，但行样式已升级为更强的状态识别样式：左侧状态描边、内容 ID 单独强调、异常行更明确、最近检查信息降权。
- [x] 任务执行区继续保留现有任务语义，但将 `TaskBoard` 的卡片升级为“状态轨道 + 二维码/结果区 + 操作区 + 详情折叠区”的稳定布局，不再让信息块均匀堆叠。
- [x] 任务卡需要显式区分四类视觉层级：等待扫码、等待确认/短信、查询成功、异常/失效。
- [x] 查询成功的任务卡要直接展示 5 个关键 KPI 的摘要胶囊；异常卡要把原因、建议操作和证据入口放到首屏可见。
- [x] `DiagnosticsPanel` 保持默认折叠，并通过新的品牌壳层与主业务区做了明显分层。
- [x] `TaskBuilderModal` 升级为更正式的运营弹窗：标题区、规则提示区、输入区、校验区、提交区层次清楚，并加入图标和分段动效。

### 4. 手工工作台视觉重构
- [x] 保留 `ManualWorkspace` 的“账号管理 + 单条查询”职责边界，不把批量链路动作拉回手工页。
- [x] 将手工页顶部改成轻量但更品牌化的页头：显示页面目标、当前账号库规模、登录进行中提示，以及“前往批量闭环”的明显次主操作。
- [x] `AccountList` 升级为更像运营侧边资源栏：账号头像、昵称、状态、更多操作、创建账号入口都要形成更明确的卡片和列表节奏。
- [x] `QueryForm` 重做为“查询控制台条”：当前账号身份卡、内容 ID 输入主框、提交按钮、处理中提示为一个稳定整体，桌面横向、移动端纵向，按钮权重明显高于说明文字。
- [x] `ResultPanel` 重做为“结果舞台”：顶部状态条、5 个主 KPI 高对比卡、次级指标折叠或降权分组、元信息下沉、截图区做成更完整的展示框架。
- [x] 截图区不再只是普通图片块，要有“证据视图”观感：页签切换、边框容器、标题说明、空态占位统一。
- [x] 成功结果态、无数据态、登录失效态、普通错误态要有明显不同的视觉语气，但共享同一套状态结构。
- [x] `LoginSessionPanel` 升级为“品牌抽屉”：头部品牌说明、步骤轨道、二维码聚焦区、短信验证区、成功态账号卡片统一规范，减少当前“功能完整但设计普通”的感觉。
- [x] 登录抽屉中的当前步骤、下一步、会话 ID、异常说明要形成主次分明的信息架构，而不是同层平铺。

### 5. 图标、动效与交互质感
- [x] 统一采用 `lucide-react` 作为图标来源，覆盖页头、状态标签、按钮、空态、通知、任务状态和登录步骤，不混用多套图标风格。
- [x] 统一采用 `motion` 作为 React 动效方案，只用于页面首屏进入、卡片渐进出现、弹窗/抽屉、accordion、tab 切换和 toast 入场，不做大面积无意义漂浮动效。
- [x] 页面进入动效突出“专业感”而不是“花哨感”，采用轻微上移 + 渐显节奏。
- [x] 主按钮 hover 和 active 反馈已明显增强，且不会造成布局抖动；卡片 hover 只用于高价值可点击区域。
- [x] 对任务刷新、任务状态变化、查询结果出现采用“渐进显示”而非突然跳变，遵循 `react-ui-patterns` 的渐进披露原则。
- [x] 所有异步提交按钮保持 loading 锁定；有旧数据时优先保留内容并显示局部 loading，不闪空。
- [x] 新增 skeleton 和品牌化 loading 占位，替换过于朴素的加载表现。
- [x] 原有 toast 体系继续使用，但视觉上统一成 V2 风格，并区分 success / info / warning / danger。

### 6. 可访问性与响应式收口
- [x] 本轮视觉升级没有回退现有语义结构，继续保持 `header`、`main`、`aside`、`dialog`、`tablist`、`tabpanel`、`status` 等语义正确。
- [x] 所有新增图标按钮保留了可读名称；纯图标没有成为唯一可点击入口。
- [x] 所有动画都在 `prefers-reduced-motion: reduce` 下关闭或显著减弱。
- [x] 批量页、手工页继续保证在 `1440px / 1024px / 768px / 390px` 四档视口下无横向溢出、无关键内容遮挡。
- [x] 深色英雄区、浅色卡片区、告警态、成功态、图标按钮和弱化文字已按 WCAG 2.1 AA 可读性方向收口；当前未引入自动化对比度扫描脚本。
- [x] 焦点态在 V2 新样式里继续保持清晰可见，没有因为更“精致”而隐形。
- [x] 抽屉、弹窗、accordion、tab 切换、任务详情展开与搜索筛选继续支持键盘操作。

### 7. 验收与测试
- [x] 更新 `tests/frontend.test.jsx`，覆盖新的查询控制台条、结果舞台、旧数据加载保留、图标按钮命名与 reduced motion 下的确认弹窗渲染。
- [x] 更新 `tests/batchWorkspace.test.jsx`，覆盖新的英雄区、双卡控制区、需求列表结构、任务卡主层级与诊断区折叠逻辑。
- [x] 新增对图标按钮可访问名称的测试。
- [x] 新增对 `prefers-reduced-motion` 降级分支的测试。
- [x] 新增对“有旧数据时局部 loading 不闪空”的展示测试。
- [x] 运行 `npm test`。
- [x] 运行 `npm run build`。
- [x] 用 Playwright MCP 完成 V2 最终截图验收，输出批量页和手工页的桌面版、手机版最终截图。
- [x] 将最终截图统一登记到 `docs/ui-visual-v2/final/`，并把路径写入 `Execution Log`。
- [x] 将测试结果、构建结果、视觉验收截图路径、剩余风险和后续建议统一写入 `Execution Log`。

### 8. 持续优化补充
- [x] 补齐 `web/public/favicon.svg`，并在 `web/index.html` 注入品牌图标与 `theme-color`，消除默认 favicon 缺失问题。
- [x] 将 `BatchTasksWorkspace`、`ManualWorkspace`、`LoginSessionPanel` 改为 `React.lazy + Suspense` 按需加载，避免非当前工作台和未打开抽屉提前进入入口包。
- [x] 在 `vite.config.mjs` 增加更稳妥的 chunk 分层策略，拆出 `react-vendor`、`motion-vendor`、`icon-vendor`。
- [x] 为懒加载模块补齐品牌化占位态，继续保持统一视觉语气。
- [x] 用浏览器验证新 favicon 返回 `200` 且页面控制台无新增错误。
- [x] 重新运行 `npm test`、`npm run build`，并把最新构建产物写入 `Execution Log`。

### 9. 首屏性能继续收口
- [x] 将 `PageHeader` 从 `motion/react` 改为 CSS 驱动的首屏进入动画，保留视觉节奏但移除首页壳层对 `motion` 的同步依赖。
- [x] 将 `BatchTasksWorkspace` 内的 `TaskBuilderModal`、`ConfirmDialog`、`ToastViewport` 改为按需动态导入，只在真正打开时加载。
- [x] 将 `ManualWorkspace` 内的 `ConfirmDialog`、`ToastViewport` 改为按需动态导入，只在删除确认或 toast 出现时加载。
- [x] 用浏览器网络请求验证首页初始请求链路中不再出现 `motion_react`。
- [x] 重新运行 `npm test`、`npm run build`，并把收口后的 chunk 结果写入 `Execution Log`。

## Interfaces
- 不修改任何后端公共 API，不改 `web/src/api.js` 的请求/响应结构。
- 新增前端依赖仅限：`lucide-react`、`motion`。
- 内部接口升级但未改变业务数据来源：
  `web/src/components/ui/` 的现有原语增加视觉扩展 props；
  新增 `web/src/components/ui/ToneIcon.jsx` 作为统一状态图标原语；
  `BatchTasksWorkspace`、`ManualWorkspace`、`LoginSessionPanel` 继续沿用现有数据契约；
  所有状态机、SSE、轮询、任务同步语义保持不变。
- 文档交接接口更新为双入口：
  `docs/frontend-ui-refactor-plan.md` 作为 V1 已完成档案，
  `docs/frontend-ui-visual-v2-plan.md` 作为 V2 唯一进行中计划。

## Test Plan
- 批量页已验证：
  首屏英雄区明显先于诊断区吸引注意；
  交接表配置、腾讯文档登录、账号匹配、缺数达人筛选、任务详情展开和回填入口继续可用；
  成功任务、等待任务、异常任务在视觉上可一眼区分；
  高级排障默认折叠且展开后不破坏主流程阅读。
- 手工页已验证：
  账号选择、删除账号、创建登录、发起单条查询仍然可用；
  查询控制台条在桌面和移动端都保持稳定布局；
  成功、无数据、登录失效三种结果态既明显不同，又维持统一结构；
  登录抽屉的步骤轨道、二维码区、短信验证区、成功态账号卡都能键盘操作。
- 交互已验证：
  未回退到原生 `alert` / `confirm`；
  图标按钮保留可访问名称；
  有已有结果时再次查询只出现局部 loading，不闪空整块内容；
  `prefers-reduced-motion` 下动效分支可正常渲染。
- 响应式已验证：
  `390px` 视口下 `document.body.scrollWidth <= window.innerWidth`；
  批量页和手工页都没有卡片裁切、按钮挤压、截图区域溢出或抽屉遮挡关键操作。

## Assumptions
- V1 功能重构已经稳定完成，本轮优先解决“变化不够明显”的视觉感知问题，不再重复做结构性大搬家。
- 本轮仍不引入 Tailwind、shadcn、Radix 或新的前端框架；视觉升级继续通过 React 组件、CSS variables、少量 `motion` 动效完成。
- 本轮默认使用“品牌运营台”方向，视觉上更成熟、更有识别度，但不走炫技或重营销页路线。
- 后续任何 AI/工程师继续这个专项时，只更新 `docs/frontend-ui-visual-v2-plan.md` 这一份 V2 文件并持续打勾；V1 文件只保留历史完成记录，不再混写第二轮进度。

## Known Issues
- 当前无阻塞性遗留问题。
- 品牌 favicon 已补齐，浏览器侧已验证 `GET /favicon.svg => 200`，当前未再出现默认 favicon 缺失报错。
- 构建已从单一主包改为多 chunk，且首页初始请求链路中已不再拉取 `motion_react`；当前 `motion-vendor`（`126.75 kB`）与 `react-vendor`（`141.83 kB`）主要在需要时再加载，后续若继续做性能专项，可再评估更细粒度的交互级拆分。

## Execution Log
- 2026-03-14：创建 V2 计划文件，固定设计方向为“品牌运营台 / 可加图标和动画 / 两页都升级”。
- 2026-03-14：安装前端视觉升级依赖：
  - `lucide-react`
  - `motion`
- 2026-03-14：使用 Playwright MCP 采集 V2 基线截图并归档到 `docs/ui-visual-v2/baseline/`：
  - `docs/ui-visual-v2/baseline/batch-desktop-2026-03-14.png`
  - `docs/ui-visual-v2/baseline/batch-mobile-2026-03-14.png`
  - `docs/ui-visual-v2/baseline/manual-desktop-2026-03-14.png`
  - `docs/ui-visual-v2/baseline/manual-mobile-2026-03-14.png`
- 2026-03-14：完成 V2 设计系统升级：
  - 重写 `web/src/styles/tokens.css`、`base.css`、`layout.css`，建立品牌色、数字字体、overlay、focus ring、z-index 和动效节奏。
  - 在 `web/src/styles/components.css` 与 `responsive.css` 追加 V2 品牌运营台视觉层，统一按钮、卡片、状态、页面壳层、抽屉和弹窗风格。
  - 新增 `web/src/components/ui/ToneIcon.jsx`，并为 `PageHeader`、`SectionCard`、`StatCard`、`StatusBadge`、`Toolbar`、`InlineNotice`、`EmptyState`、`ConfirmDialog`、`ToastViewport` 补齐视觉扩展能力。
- 2026-03-14：完成全局壳层与页面重构：
  - `web/src/App.jsx` 升级为品牌运营控制台头部，增加状态摘要与 segmented control。
  - 批量页已重做 `BatchHeroSummary`、`HandoffControlCenter`、`DemandBoard`、`TaskBoard`、`TaskBuilderModal` 的品牌化视觉与状态层级。
  - 手工页已重做 `ManualWorkspace`、`AccountList`、`QueryForm`、`ResultPanel`、`LoginSessionPanel` 的品牌化视觉与状态表达。
  - `web/src/components/task/TaskCard.jsx` 现支持 5 个 KPI 摘要胶囊、异常提示条、二维码/短信态分层与状态轨道。
- 2026-03-14：完成图标、动效、反馈与可访问性收口：
  - 全站统一采用 `lucide-react` 图标语言。
  - 页面头部、toast、确认弹窗、登录抽屉、批量创建弹窗均接入 `motion` 动效。
  - 所有重要状态现统一为“图标 + 文案 + 颜色”三重表达。
  - 图标按钮均补齐可读名称；保留 `prefers-reduced-motion` 与焦点态。
- 2026-03-14：更新测试覆盖：
  - `tests/frontend.test.jsx` 新增旧结果保留加载、图标菜单可访问名称、reduced motion 渲染覆盖。
  - `tests/batchWorkspace.test.jsx` 新增品牌英雄区核心动作可见性覆盖。
- 2026-03-14：验证结果：
  - `npm test` 通过，`13` 个测试文件、`98` 个测试全部通过。
  - `npm run build` 通过；产物为 `dist/assets/index-BuVbIM7x.css`（`70.41 kB`，gzip `13.23 kB`）与 `dist/assets/index-Kd9HqvIo.js`（`420.53 kB`，gzip `132.09 kB`）。
- 2026-03-14：使用 Playwright MCP 完成 V2 最终截图验收并归档到 `docs/ui-visual-v2/final/`：
  - `docs/ui-visual-v2/final/batch-desktop-2026-03-14.png`
  - `docs/ui-visual-v2/final/batch-mobile-2026-03-14.png`
  - `docs/ui-visual-v2/final/manual-desktop-2026-03-14.png`
  - `docs/ui-visual-v2/final/manual-mobile-2026-03-14.png`
- 2026-03-14：响应式验收结果：
  - `batch-desktop`: `document.body.scrollWidth = 1440`, `window.innerWidth = 1440`
  - `manual-desktop`: `document.body.scrollWidth = 1440`, `window.innerWidth = 1440`
  - `batch-mobile`: `document.body.scrollWidth = 390`, `window.innerWidth = 390`
  - `manual-mobile`: `document.body.scrollWidth = 390`, `window.innerWidth = 390`
- 2026-03-14：完成 V2 持续优化补充：
  - 新增 `web/public/favicon.svg`，并在 `web/index.html` 注入品牌 favicon 与 `theme-color`。
  - `web/src/App.jsx` 已将 `BatchTasksWorkspace`、`ManualWorkspace`、`LoginSessionPanel` 改为 `React.lazy + Suspense` 按需加载，并补齐品牌化模块占位态。
  - `vite.config.mjs` 已加入 `react-vendor`、`motion-vendor`、`icon-vendor` 的 chunk 分层策略。
- 2026-03-14：持续优化后的验证结果：
  - `npm test` 再次通过，`13` 个测试文件、`98` 个测试全部通过。
  - `npm run build` 再次通过；产物已拆分为：
    - `dist/assets/index-EZpkjyhY.js`（`14.87 kB`，gzip `5.95 kB`）
    - `dist/assets/BatchTasksWorkspace-CG6dn_s5.js`（`72.80 kB`，gzip `21.38 kB`）
    - `dist/assets/ManualWorkspace-m8lpYwiI.js`（`16.26 kB`，gzip `5.73 kB`）
    - `dist/assets/LoginSessionPanel-D3q0TMYN.js`（`12.24 kB`，gzip `4.90 kB`）
    - `dist/assets/react-vendor-D7f9BLy3.js`（`141.83 kB`，gzip `45.42 kB`）
    - `dist/assets/motion-vendor-DYbArN-X.js`（`126.75 kB`，gzip `41.68 kB`）
    - `dist/assets/icon-vendor-BNx9YloZ.js`（`19.92 kB`，gzip `4.41 kB`）
  - Playwright 浏览器验证通过：`GET /favicon.svg => 200`，控制台 `Errors: 0`。
- 2026-03-14：完成首屏性能继续收口：
  - `web/src/components/ui/PageHeader.jsx` 已去除 `motion/react` 依赖，改为 CSS 驱动的品牌首屏进入动画。
  - `web/src/components/BatchTasksWorkspace.jsx` 已将 `TaskBuilderModal`、`ConfirmDialog`、`ToastViewport` 改为按需动态导入。
  - `web/src/components/ManualWorkspace.jsx` 已将 `ConfirmDialog`、`ToastViewport` 改为按需动态导入。
- 2026-03-14：首屏性能收口后的验证结果：
  - `npm test` 再次通过，`13` 个测试文件、`98` 个测试全部通过。
  - `npm run build` 再次通过；当前主要产物为：
    - `dist/assets/index-BulbZPuW.js`（`14.72 kB`，gzip `5.88 kB`）
    - `dist/assets/BatchTasksWorkspace-DASj9cUU.js`（`71.25 kB`，gzip `20.99 kB`）
    - `dist/assets/ManualWorkspace-BEx3Z_lH.js`（`16.89 kB`，gzip `5.96 kB`）
    - `dist/assets/TaskBuilderModal-D8BsZKNS.js`（`2.98 kB`，gzip `1.32 kB`）
    - `dist/assets/ConfirmDialog-Dk9PyNxR.js`（`2.47 kB`，gzip `1.14 kB`）
    - `dist/assets/ToastViewport-LyFno_YK.js`（`0.70 kB`，gzip `0.43 kB`）
    - `dist/assets/LoginSessionPanel-CWp3oXlB.js`（`12.24 kB`，gzip `4.90 kB`）
    - `dist/assets/react-vendor-D7f9BLy3.js`（`141.83 kB`，gzip `45.42 kB`）
    - `dist/assets/motion-vendor-DYbArN-X.js`（`126.75 kB`，gzip `41.68 kB`）
  - Playwright 浏览器网络验证通过：首页初始请求链路未出现 `motion_react`，控制台 `Errors: 0`。
