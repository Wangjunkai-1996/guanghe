# V4 前端页面优化计划

## Summary
- V4 固定为 `视觉收口 + 交互打磨`，不再做大规模结构重构，不改后端接口、不换框架、不引入组件库。
- 本轮沿用并落地的本地 skills 组合为：`frontend-design-system`、`react-ui-patterns`、`web-accessibility`、`Browser Automation`、`vitest`；未安装新的运行时依赖或新增 skill。
- V4 目标是把当前“已升级过但仍偏厚重、发灰、层级重复”的页面，收口成更轻、更清晰、更像单一产品的控制台界面。
- 本轮唯一进行中文档固定为 `docs/frontend-ui-v4-plan.md`；视觉基线截图固定在 `docs/ui-v4/baseline/`，最终验收截图固定在 `docs/ui-v4/final/`。

## Skills
- [x] 使用 `frontend-design-system` 约束 token、surface 层级、按钮轻重和整体页面节奏。
- [x] 使用 `react-ui-patterns` 保持已有数据不闪空、loading/empty/error 反馈不回退。
- [x] 使用 `web-accessibility` 约束焦点、图标按钮可访问名称和 `prefers-reduced-motion` 兼容。
- [x] 使用 `Browser Automation` 做真实页面浏览器验收与截图留档。
- [x] 使用 `vitest` 做前端行为回归，确保视觉收口不伤到现有链路。

## Implementation Checklist
### 0. 文档与基线
- [x] 创建 `docs/frontend-ui-v4-plan.md`，记录目标、范围、验收结果和 `Execution Log`。
- [x] 基线截图统一放入 `docs/ui-v4/baseline/`，沿用 V3 稳定截图作为视觉对照。
- [x] 最终截图统一放入 `docs/ui-v4/final/`，补齐 `batch-desktop`、`batch-mobile`、`manual-desktop`、`manual-mobile` 四张验收图。

### 1. 样式系统收口
- [x] 将 `web/src/styles/components.css` 中重复的 token/base/button/header/manual-entry 旧规则移除，避免样式职责继续漂移。
- [x] 收紧深色 hero 的反色作用域，避免浅色子卡片继承反色后出现正文发灰、对比不足的问题。
- [x] 补齐 V4 轻量化样式：更轻的 `page-header`、更明确的 `ghost-btn`、更聚焦的查询条与结果区、更统一的账号卡片节奏。
- [x] 保持 `tokens.css / base.css / layout.css / components.css / responsive.css` 的职责边界，不通过新增公共 props 解决视觉问题。

### 2. 全局壳层与信息层级
- [x] `PageHeader` 继续作为每个 tab 唯一深色 hero，不再让子模块重复使用同等级 hero 视觉。
- [x] 顶部摘要卡从 3 张收口为 2 张，只保留 `当前模式` 和 `已保存账号`。
- [x] 保留 segmented control，但降低视觉重量，避免与主 CTA 抢主次。

### 3. 批量工作台优化
- [x] `BatchHeroSummary` 从深色 hero 改为浅色主控卡，标题调整为“批量任务主控台”，保留目标、主操作和执行摘要主线。
- [x] 批量页首屏摘要卡从 4 张收口为 3 张：`当前交接表`、`文档登录与同步`、`任务概况`。
- [x] `高级排障` 降为低干扰文本/ghost 入口，默认继续折叠。
- [x] `DemandBoard`、`DiagnosticsPanel` 统一按钮权重，一个业务区只保留一个更强主动作，其余动作降为 secondary 或 ghost。

### 4. 手工工作台优化
- [x] `ManualWorkspace` 移除深色 hero 容器，改为轻量顶部说明条 + 工作区结构。
- [x] 手工页顶部只保留标题说明、`前往批量闭环` 和 `已保存账号` 摘要 chip，不再叠加深色包裹感。
- [x] `QueryForm` 强化为单一主操作区：当前账号、内容 ID、查询按钮形成一条主线，提示语降权。
- [x] `ResultPanel` 保持结果舞台结构，但统一边框、标题区与留白密度，减少发白发空的问题。

### 5. 交互与可访问性
- [x] 统一主按钮、次按钮、ghost 按钮层级，避免多个同权重高亮操作并列。
- [x] 保持 hover / active / focus / loading 的统一反馈，不新增花哨动效。
- [x] 保持已有数据时刷新/查询不闪空。
- [x] `prefers-reduced-motion`、键盘焦点、图标按钮可访问名称继续有效。

### 6. 验收与测试
- [x] 更新前端测试，覆盖页头摘要卡数量、批量页摘要卡数量、手工页 hero 移除等关键视觉行为。
- [x] 运行 `npm test`，结果为 `13 files / 99 tests passed`。
- [x] 运行 `npm run build`，生产构建通过。
- [x] 使用浏览器完成桌面端与移动端截图验收。
- [x] 验证 `1440 / 1024 / 768 / 390` 四档下批量页与手工页均无横向溢出。

## Interfaces
- 不修改任何后端公共 API，不改请求/响应结构、SSE、轮询、任务状态机或腾讯文档数据契约。
- 不新增前端运行时依赖，不引入 Tailwind、shadcn、Radix、Figma SDK 等新体系。
- 不改变当前 tab 切换、任务操作、账号登录或腾讯文档链路的功能边界。
- 共享组件公共接口保持稳定；V4 主要通过 CSS 收口和局部组合调整解决视觉问题。

## Test Plan
- 行为回归重点覆盖：
  全局页头只保留两张摘要卡；
  手工页不再渲染深色 hero 容器；
  批量页摘要区保留三张卡，排障入口默认折叠；
  已有数据时再次刷新/查询不闪空。
- 可访问性重点覆盖：
  `prefers-reduced-motion` 不回退；
  键盘焦点仍可见；
  图标按钮继续拥有可访问名称。
- 浏览器验收重点覆盖：
  每个 tab 首屏只存在一个深色 hero；
  批量页首屏摘要卡不超过 3 张；
  手工页首屏摘要 chip 不超过 1 张；
  浅色卡片正文不再出现明显低对比发灰问题；
  `1440 / 1024 / 768 / 390` 四档无横向溢出。

## Assumptions
- V4 默认不安装新 skill；若后续要做流程化视觉审计，可另开 follow-up 引入更重的视觉测试方案。
- 品牌方向继续沿用“暖白 + 墨蓝 + 金棕”，本轮只做减重、提层级、提可读性，不改品牌基调。
- 这轮优先解决“页面不好看、交互一般”的前台感知问题，不顺带做性能专项或业务重排。

## Known Issues
- 当前无阻塞性遗留问题；后续如果继续做前端专项，建议在 V4 基础上补更细的视觉自动化对比，而不是再回到大规模样式重构。

## Execution Log
- 2026-03-14：创建 V4 计划文件，范围固定为“视觉收口 + 交互打磨”，明确不改后端接口、不换框架、不引入新组件库。
- 2026-03-14：完成主要代码改造。
  `web/src/App.jsx`：页头摘要卡从 3 张收口为 2 张，移除“运营节奏”统计位；
  `web/src/components/batch/BatchHeroSummary.jsx`：改为浅色主控卡，摘要卡从 4 张收口为 3 张，并合并任务概况；
  `web/src/components/batch/DemandBoard.jsx`、`web/src/components/batch/DiagnosticsPanel.jsx`：统一按钮轻重层级，降低排障和次动作干扰；
  `web/src/components/ManualWorkspace.jsx`、`web/src/components/QueryForm.jsx`：移除手工页深色 hero 包裹感，强化查询主线；
  `web/src/styles/components.css`：清理重复旧规则，并追加 V4 轻量化样式收口。
- 2026-03-14：完成测试与构建回归。
  `npm test` 通过，结果为 `13 files / 99 tests passed`。
  `npm run build` 通过，关键产物如下：
  `dist/assets/index-CIkI2tXC.css` `71.99 kB` gzip `13.57 kB`
  `dist/assets/index-CKW0_a1v.js` `14.43 kB` gzip `5.77 kB`
  `dist/assets/ManualWorkspace-CzFQQhm-.js` `17.15 kB` gzip `6.16 kB`
  `dist/assets/BatchTasksWorkspace-Cexchuqg.js` `74.93 kB` gzip `22.23 kB`
- 2026-03-14：完成浏览器视觉验收与截图归档。
  Baseline 截图：
  `docs/ui-v4/baseline/batch-desktop-2026-03-14-v4-baseline.png`
  `docs/ui-v4/baseline/batch-mobile-2026-03-14-v4-baseline.png`
  `docs/ui-v4/baseline/manual-desktop-2026-03-14-v4-baseline.png`
  `docs/ui-v4/baseline/manual-mobile-2026-03-14-v4-baseline.png`
  Final 截图：
  `docs/ui-v4/final/batch-desktop-2026-03-14-v4.png`
  `docs/ui-v4/final/batch-mobile-2026-03-14-v4.png`
  `docs/ui-v4/final/manual-desktop-2026-03-14-v4.png`
  `docs/ui-v4/final/manual-mobile-2026-03-14-v4.png`
  视觉结论：
  每个 tab 首屏仅保留 1 个深色 hero；
  批量页首屏摘要卡为 3 张；
  手工页顶部只保留 1 个账号摘要 chip；
  `1440 / 1024 / 768 / 390` 八组 tab/视口组合实测均无横向溢出。
