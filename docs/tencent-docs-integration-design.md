# 腾讯文档自动回填设计方案

## 1. 目标

在现有“光合平台多账号查询工具”基础上，新增一条**查询结果自动回填腾讯文档**的能力，满足以下目标：

- 支持把单次查询结果写入腾讯文档表格/智能表格。
- 支持 `追加` 与 `按业务键更新（upsert）` 两种写入模式。
- 不破坏当前 `/api/queries` 的返回结构和现有工作流。
- 支持后续扩展到“查询完成后自动同步”与“批量结果同步”。
- 在多人/多窗口并行开发时，尽量通过**新增模块、独立路由、独立配置**避免冲突。

## 2. 现状与约束

### 2.1 当前项目现状

当前项目已经具备：

- 工具级口令登录。
- 多光合账号登录态持久化。
- 按账号串行查询、跨账号并发。
- 查询结果输出为：5 个指标、原始截图、汇总截图、`results.json`、`network-log.json`。

### 2.2 业务约束

腾讯文档回填不是独立业务，而是现有“查询结果产出链路”的下游步骤，因此设计上应：

- 复用现有查询结果，不重新抓取。
- 以“标准化结果对象”作为写文档输入。
- 保留失败可重试、写入可审计、字段可映射的能力。

### 2.3 并行开发约束

当前还有其他窗口在开发其他模块，因此本功能设计必须遵守：

- **不修改现有查询接口语义**。
- **优先新增目录和新增路由**，避免改动已有核心文件。
- **配置隔离**，避免影响现有 `.env` 与启动流程。
- **功能开关化**，未启用时对现有系统零影响。

## 3. 能力判断与总体策略

根据腾讯云官方资料，腾讯文档企业版/私有化版本提供 API 与系统集成能力；同时腾讯文档企业版覆盖在线表格、智能表格等文档类型。因此，这里推荐采用：

- **优先方案：Adapter 分层**
  - `API Adapter`：适用于企业版/私有化、后续若拿到正式 API 接入资料时启用。
  - `Browser Adapter`：适用于普通 Web 版或 API 能力不足时，使用浏览器自动化完成登录、定位表格、写入单元格。
- **当前落地建议：先做 Browser Adapter**
  - 与现有项目技术栈更一致（当前已经在用 Playwright）。
  - 更适合先把业务流程跑通。
  - 后续如确认拥有企业版 API，再平滑切换到 API Adapter。

> 说明：这里的 “API-first + 浏览器兜底” 是结合官方产品能力后做出的工程推断，不把实现强绑定到某个未确认可用的未公开接口上。

## 4. 总体架构

```text
查询流程
  └─ GuangheQueryService
       └─ 生成标准查询结果（metrics + screenshots + artifacts）
             └─ TencentDocsSyncService
                  ├─ MappingResolver
                  ├─ IdempotencyGuard
                  ├─ SyncJobStore
                  └─ Adapter
                      ├─ TencentDocsBrowserAdapter
                      └─ TencentDocsApiAdapter
```

### 4.1 核心原则

- 查询服务只负责“拿到结果”。
- 腾讯文档同步服务只负责“把结果写出去”。
- 两者之间只通过标准化 DTO 交互。
- 同步动作采用“任务化”模型，避免把查询请求和写文档请求强耦合。

## 5. 标准数据模型

## 5.1 `QueryResultExport`

建议新增统一导出对象，作为同步腾讯文档的唯一输入：

```json
{
  "accountId": "1001",
  "nickname": "测试账号",
  "contentId": "554608495125",
  "fetchedAt": "2026-03-08T15:00:00.000Z",
  "metrics": {
    "内容查看次数": { "value": "83611", "field": "consumePv" },
    "内容查看人数": { "value": "18033", "field": "consumeUv" },
    "种草成交金额": { "value": "155.13", "field": "payAmtZcLast" },
    "种草成交人数": { "value": "1", "field": "payBuyerCntZc" },
    "商品点击次数": { "value": "3", "field": "ipvPv" }
  },
  "screenshots": {
    "rawUrl": "/api/artifacts/.../04-results.png",
    "summaryUrl": "/api/artifacts/.../05-summary-strip.png"
  },
  "artifacts": {
    "resultUrl": "/api/artifacts/.../results.json",
    "networkLogUrl": "/api/artifacts/.../network-log.json"
  }
}
```

### 5.2 `TencentDocsRow`

同步前，将 `QueryResultExport` 通过映射规则转换为一行：

```json
{
  "查询时间": "2026-03-08 23:00",
  "账号昵称": "测试账号",
  "账号ID": "1001",
  "内容ID": "554608495125",
  "内容查看次数": "83611",
  "内容查看人数": "18033",
  "种草成交金额": "155.13",
  "种草成交人数": "1",
  "商品点击次数": "3",
  "原图链接": "https://host/api/artifacts/.../04-results.png",
  "汇总图链接": "https://host/api/artifacts/.../05-summary-strip.png",
  "结果JSON": "https://host/api/artifacts/.../results.json"
}
```

## 6. 写入模式设计

### 6.1 `append`

直接在目标表尾部新增一行。

适合：

- 每次查询都要留痕。
- 需要保留历史版本。

### 6.2 `upsert`

按业务键查找已有行，找到则更新，找不到则新增。

默认推荐业务键：

- `contentId`
- `accountId`

如需区分每日快照，也可以扩展为：

- `contentId`
- `accountId`
- `date(fetchedAt)`

### 6.3 `replace-range`（后续可选）

适合批量导出时，整体覆盖某个区域。

当前版本不建议优先实现，因为风险和误写成本更高。

## 7. 任务模型

为了不把同步逻辑塞进现有查询接口，建议增加同步任务模型。

### 7.1 任务状态

- `PENDING`
- `RUNNING`
- `SUCCEEDED`
- `FAILED`
- `CANCELLED`

### 7.2 任务对象

```json
{
  "jobId": "sync_01",
  "status": "PENDING",
  "mode": "upsert",
  "target": {
    "docId": "doc_xxx",
    "sheetId": "sheet_xxx",
    "sheetName": "数据汇总"
  },
  "source": {
    "accountId": "1001",
    "contentId": "554608495125",
    "resultUrl": "/api/artifacts/.../results.json"
  },
  "mapping": {
    "账号ID": "accountId",
    "账号昵称": "nickname",
    "内容ID": "contentId",
    "内容查看次数": "metrics.内容查看次数.value"
  },
  "createdAt": "2026-03-08T15:00:00.000Z",
  "updatedAt": "2026-03-08T15:00:00.000Z",
  "error": null,
  "writeSummary": null
}
```

## 8. 接口结构设计

## 8.1 原则

- **新增独立路由族**，不破坏现有 `/api/queries`。
- 当前阶段不把“同步腾讯文档”直接并入查询接口。
- 等功能稳定后，再考虑给 `/api/queries` 增加一个可选参数实现“一次查询后自动同步”。

## 8.2 建议接口

### `GET /api/tencent-docs/config`

读取当前腾讯文档同步配置（脱敏后返回）。

返回示例：

```json
{
  "enabled": true,
  "mode": "browser",
  "targetConfigured": true,
  "defaultSheetName": "数据汇总",
  "defaultWriteMode": "upsert"
}
```

### `POST /api/tencent-docs/validate`

校验当前配置是否可用。

用途：

- 检查目标文档是否可打开。
- 检查工作表是否存在。
- 检查关键列是否存在。
- 浏览器模式下检查登录态是否有效。

请求示例：

```json
{
  "docUrl": "https://docs.qq.com/sheet/...",
  "sheetName": "数据汇总"
}
```

### `POST /api/tencent-docs/jobs/preview`

只做预览，不实际写入。

用途：

- 把某次查询结果映射成“将写入的一行”。
- 提前发现字段名对不上、空值、格式问题。

请求示例：

```json
{
  "source": {
    "accountId": "1001",
    "contentId": "554608495125",
    "resultUrl": "/api/artifacts/.../results.json"
  },
  "mappingProfile": "default"
}
```

返回示例：

```json
{
  "row": {
    "账号ID": "1001",
    "内容ID": "554608495125",
    "内容查看次数": "83611"
  },
  "warnings": []
}
```

### `POST /api/tencent-docs/jobs`

创建一个同步任务。

请求示例：

```json
{
  "source": {
    "accountId": "1001",
    "contentId": "554608495125",
    "resultUrl": "/api/artifacts/.../results.json"
  },
  "target": {
    "docUrl": "https://docs.qq.com/sheet/...",
    "sheetName": "数据汇总"
  },
  "mode": "upsert",
  "matchKeys": ["内容ID", "账号ID"],
  "mappingProfile": "default"
}
```

返回示例：

```json
{
  "jobId": "sync_01",
  "status": "PENDING"
}
```

### `GET /api/tencent-docs/jobs/:jobId`

查询同步任务状态。

返回示例：

```json
{
  "jobId": "sync_01",
  "status": "SUCCEEDED",
  "writeSummary": {
    "action": "UPDATED",
    "rowIndex": 18,
    "matchedBy": ["内容ID", "账号ID"]
  },
  "error": null
}
```

### `POST /api/tencent-docs/jobs/:jobId/retry`

重试失败任务。

### `GET /api/tencent-docs/history`

查询近期同步历史，用于前端展示。

支持参数：

- `status`
- `accountId`
- `contentId`
- `limit`

## 9. 内部模块划分

建议新增如下目录，不改现有查询服务主体：

```text
server/
  integrations/
    tencentDocs/
      index.js
      service.js
      jobStore.js
      mapping.js
      errors.js
      types.js
      adapters/
        browserAdapter.js
        apiAdapter.js
```

### 9.1 `service.js`

负责：

- 创建任务
- 加载结果数据
- 调用 mapping
- 调用 adapter
- 更新任务状态

### 9.2 `jobStore.js`

第一阶段可直接用 JSON 文件持久化：

- `data/tencent-docs-jobs.json`

后续如任务量变大，再换 SQLite/DB。

### 9.3 `mapping.js`

负责：

- `QueryResultExport -> TencentDocsRow`
- 字段格式化
- 默认空值兜底
- 日期格式化
- 货币/数字格式处理

### 9.4 `browserAdapter.js`

负责：

- 打开腾讯文档目标页
- 定位工作表
- 查找标题行
- 按列名匹配列索引
- 读取关键列已有数据
- 执行 append 或 upsert
- 返回 `writeSummary`

### 9.5 `apiAdapter.js`

先定义接口，不急着落实现。

## 10. Browser Adapter 关键流程

### 10.1 登录策略

建议为腾讯文档单独维护浏览器 profile，不与光合账号 profile 混用：

- `/.cache/profiles/tencent-docs`

原因：

- 光合与腾讯文档是不同站点。
- 避免相互污染 Cookie/Storage。
- 方便独立续登与排障。

### 10.2 页面交互流程

1. 打开目标腾讯文档 URL。
2. 若未登录，进入“等待登录”状态，提示人工扫码/确认。
3. 登录后进入指定工作表。
4. 扫描首行/表头区域，建立 `列名 -> 列索引`。
5. 若是 `append`：定位最后一行后写入。
6. 若是 `upsert`：按关键列组合值查找匹配行。
7. 找到则覆盖目标列，找不到则新建一行。
8. 截图留痕，并产出写入日志。

### 10.3 稳定性策略

- 不依赖易变 CSS 选择器，优先使用：
  - 文本识别
  - 表头内容匹配
  - 可视区域截图审计
- 每次写入后都进行：
  - 行值回读校验
  - 成功截图
  - 任务日志记录

## 11. 幂等与并发控制

### 11.1 幂等策略

为了避免同一结果重复写入，任务层建议引入 `idempotencyKey`：

```text
{docId}:{sheetName}:{mode}:{accountId}:{contentId}:{fetchedAt}
```

如果是 `upsert` 场景，也可以改成：

```text
{docId}:{sheetName}:{accountId}:{contentId}
```

### 11.2 并发控制

当前项目已经对光合账号查询做了串行队列；腾讯文档同步建议再单独增加：

- **按文档维度串行**
- 或 **按 sheet 维度串行**

原因：

- 浏览器自动写表时并发写同一文档容易互相覆盖。
- 即使来源是多个账号，也不建议同时写同一张表。

建议实现：

- `docKey = {docId}:{sheetName}`
- 同一个 `docKey` 下任务串行执行。

## 12. 错误模型

建议新增错误码：

- `TENCENT_DOCS_NOT_CONFIGURED`
- `TENCENT_DOCS_LOGIN_REQUIRED`
- `TENCENT_DOCS_TARGET_NOT_FOUND`
- `TENCENT_DOCS_SHEET_NOT_FOUND`
- `TENCENT_DOCS_HEADER_NOT_FOUND`
- `TENCENT_DOCS_MATCH_KEYS_MISSING`
- `TENCENT_DOCS_WRITE_FAILED`
- `TENCENT_DOCS_VERIFY_FAILED`

## 13. 配置设计

建议新增环境变量：

```bash
TENCENT_DOCS_ENABLED=false
TENCENT_DOCS_MODE=browser
TENCENT_DOCS_DOC_URL=
TENCENT_DOCS_SHEET_NAME=数据汇总
TENCENT_DOCS_WRITE_MODE=upsert
TENCENT_DOCS_MATCH_KEYS=内容ID,账号ID
TENCENT_DOCS_PROFILE_DIR=.cache/profiles/tencent-docs
TENCENT_DOCS_HEADLESS=true
TENCENT_DOCS_BASE_URL=
```

如后续启用 API 模式，再加：

```bash
TENCENT_DOCS_API_BASE_URL=
TENCENT_DOCS_APP_ID=
TENCENT_DOCS_APP_SECRET=
```

## 14. 前端交互建议

当前阶段只建议新增小范围功能，不重做主流程：

### 14.1 结果区新增按钮

在结果面板新增：

- `预览腾讯文档行`
- `同步到腾讯文档`
- `查看同步状态`

### 14.2 同步状态展示

同步后返回：

- 成功：新增/更新到第几行
- 失败：错误原因 + 重试按钮

### 14.3 配置入口

如果需要给运营同学使用，再增加“腾讯文档配置抽屉”；否则第一阶段仅靠环境变量即可。

## 15. 分阶段实施建议

### Phase 1：最小可用版

- 新增 `QueryResultExport` 标准对象
- 新增 `POST /api/tencent-docs/jobs/preview`
- 新增 `POST /api/tencent-docs/jobs`
- 新增 `GET /api/tencent-docs/jobs/:jobId`
- 实现 `Browser Adapter`
- 支持 `append` / `upsert`
- 单文档串行
- 写入后截图留痕

### Phase 2：体验增强

- 结果页一键同步
- 同步历史页
- 失败重试
- 映射模板管理

### Phase 3：企业能力升级

- 接入 `API Adapter`
- 支持批量结果同步
- 支持计划任务/自动同步
- 支持多目标文档

## 16. 与其他窗口避冲突的开发策略

如果接下来进入实现阶段，我可以按下面方式尽量不和其他窗口冲突：

1. **只新增文件，不修改核心查询文件**
   - 先只动：
     - `server/integrations/tencentDocs/*`
     - `docs/tencent-docs-integration-design.md`
   - 尽量不碰：
     - `server/services/queryService.js`
     - `web/src/App.jsx`
     - `server/app.js`

2. **先做后端独立路由，再考虑前端接线**
   - 第一轮可以只做服务和接口草案，不改页面主流程。

3. **功能开关默认关闭**
   - 即使代码合并，也不会影响现有查询链路。

4. **最后一公里再接现有查询结果页**
   - 等其他窗口稳定后，再把“同步到腾讯文档”按钮接到 UI 上。

## 17. 推荐的下一步实施顺序

推荐下一步按以下顺序开发：

1. 定义 `TencentDocsSyncService` 接口与任务存储。
2. 实现 `preview` 能力，先把映射跑通。
3. 实现 `browserAdapter` 的“打开文档 + 识别表头 + append”。
4. 再实现 `upsert`。
5. 最后接前端按钮与状态展示。

## 18. 参考来源

- 腾讯文档企业版产品页（含 API/系统集成说明）：https://cloud.tencent.com/product/tdb
- 腾讯文档企业版产品概述：https://cloud.tencent.com/document/product/1663/83956
- 腾讯文档企业版常见问题（含集成能力说明）：https://cloud.tencent.com/document/product/1663/83960
- 腾讯文档企业版简介页：https://cloud.tencent.com/document/product/1663
