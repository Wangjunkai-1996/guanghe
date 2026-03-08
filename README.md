# 光合平台多账号查询工具

一个面向单操作者的网页工具：
- 前端：`React + Vite`
- 后端：`Node.js + Express + Playwright`
- 用途：扫码登录多个光合账号，按账号查询指定内容 ID 的近 30 日固定 5 项指标，并返回字段值、原始截图、汇总截图

## 当前能力

- 工具口令登录，使用 `HTTP-only session cookie` 保护页面
- 多个光合账号长期保存登录态，每个账号独立浏览器 profile
- 同一账号查询串行执行，不同账号允许并发查询
- 页面内发起扫码登录，并展示登录后的账号昵称/头像
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

## 目录结构

- `/server`：后端接口、登录管理、查询服务、截图服务
- `/web`：前端单页应用
- `/data/accounts.json`：已保存账号元数据
- `/.cache/profiles`：Playwright 持久化登录态
- `/artifacts/web`：查询截图和结果文件
- `/scripts/guanghe-fetch.js`：旧版 CLI 脚本，保留作调试参考

## 环境变量

必填建议：
- `TOOL_PASSWORD`：工具页面访问口令
- `SESSION_SECRET`：Session 签名密钥

可选：
- `HOST`：默认 `0.0.0.0`
- `PORT`：默认 `3001`
- `BROWSER_PATH`：Chrome / Chromium 可执行文件路径
- `COOKIE_SECURE`：`true` 时启用安全 Cookie，部署 HTTPS 时建议开启

示例：

```bash
export TOOL_PASSWORD='your-password'
export SESSION_SECRET='your-session-secret'
export PORT=3001
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
- `POST /api/queries`
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

## 已验证示例

- 可查 ID：`554608495125`
- 已知无数据示例：`537029503554`、`553703325997`
