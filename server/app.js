const express = require('express')
const path = require('path')
const session = require('express-session')
const { AppError } = require('./lib/errors')

function createApp({ config, loginService, queryService, taskService, tencentDocsSyncService }) {
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json())
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: config.secureCookie,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  }))

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.get('/api/auth/me', (req, res) => {
    res.json({ authenticated: config.toolAuthEnabled ? Boolean(req.session.authenticated) : true })
  })

  app.post('/api/auth/login', (req, res, next) => {
    try {
      if (!config.toolAuthEnabled) {
        req.session.authenticated = true
        return res.json({ ok: true, skipped: true })
      }

      const { password } = req.body || {}
      if (!password || password !== config.toolPassword) {
        throw new AppError(401, 'AUTH_INVALID', '口令不正确')
      }
      req.session.authenticated = true
      res.json({ ok: true })
    } catch (error) {
      next(error)
    }
  })

  app.use('/api', (req, _res, next) => {
    if (req.path === '/health' || req.path === '/auth/login' || req.path === '/auth/me') {
      return next()
    }
    if (!config.toolAuthEnabled) {
      return next()
    }
    if (!req.session.authenticated) {
      return next(new AppError(401, 'AUTH_REQUIRED', '请先登录工具页面'))
    }
    next()
  })

  app.get('/api/accounts', (_req, res) => {
    res.json({ accounts: loginService.listAccounts() })
  })

  app.post('/api/accounts/login-sessions', async (_req, res, next) => {
    try {
      const sessionPayload = await loginService.createLoginSession()
      res.status(201).json(sessionPayload)
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/accounts/login-sessions/:loginSessionId', (req, res, next) => {
    try {
      res.json(loginService.getLoginSession(req.params.loginSessionId))
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/accounts/:accountId', async (req, res, next) => {
    try {
      await loginService.deleteAccount(req.params.accountId)
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  if (taskService) {
    app.get('/api/tasks', (_req, res) => {
      res.json({ tasks: taskService.listTasks() })
    })

    app.post('/api/tasks/batch', async (req, res, next) => {
      try {
        const payload = await taskService.createTasksBatch(req.body?.tasks)
        res.status(201).json(payload)
      } catch (error) {
        next(error)
      }
    })

    app.post('/api/tasks/:taskId/refresh-login', async (req, res, next) => {
      try {
        const task = await taskService.refreshTaskLogin(req.params.taskId)
        res.json(task)
      } catch (error) {
        next(error)
      }
    })

    app.post('/api/tasks/:taskId/retry-query', async (req, res, next) => {
      try {
        const task = await taskService.retryTaskQuery(req.params.taskId)
        res.json(task)
      } catch (error) {
        next(error)
      }
    })

    app.delete('/api/tasks/:taskId', async (req, res, next) => {
      try {
        await taskService.deleteTask(req.params.taskId)
        res.status(204).end()
      } catch (error) {
        next(error)
      }
    })
  }

  app.post('/api/queries', async (req, res, next) => {
    try {
      const { accountId, contentId } = req.body || {}
      if (!accountId || !contentId) {
        throw new AppError(400, 'QUERY_INPUT_INVALID', 'accountId 和 contentId 都不能为空')
      }
      if (!/^\d+$/.test(String(contentId))) {
        throw new AppError(400, 'QUERY_INPUT_INVALID', '内容 ID 只能包含数字')
      }
      const result = await queryService.queryByContentId({ accountId, contentId })
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  if (tencentDocsSyncService) {
    app.get('/api/tencent-docs/config', (_req, res) => {
      res.json(tencentDocsSyncService.getConfig())
    })

    app.post('/api/tencent-docs/jobs/preview', (req, res, next) => {
      try {
        res.json(tencentDocsSyncService.previewJob(req.body || {}))
      } catch (error) {
        next(error)
      }
    })

    app.post('/api/tencent-docs/jobs', (req, res, next) => {
      try {
        const payload = tencentDocsSyncService.createJob(req.body || {})
        res.status(202).json(payload)
      } catch (error) {
        next(error)
      }
    })

    app.get('/api/tencent-docs/jobs/:jobId', (req, res, next) => {
      try {
        res.json(tencentDocsSyncService.getJob(req.params.jobId))
      } catch (error) {
        next(error)
      }
    })
  }

  app.get('/api/artifacts/*', (req, res, next) => {
    try {
      const relativePath = req.params[0]
      const decoded = relativePath.split('/').map(decodeURIComponent).join(path.sep)
      const fullPath = path.resolve(config.artifactsRootDir, decoded)
      if (!fullPath.startsWith(config.artifactsRootDir)) {
        throw new AppError(400, 'ARTIFACT_PATH_INVALID', '文件路径非法')
      }
      res.set('Cache-Control', 'no-store')
      res.sendFile(fullPath)
    } catch (error) {
      next(error)
    }
  })

  if (require('fs').existsSync(config.distDir)) {
    app.use(express.static(config.distDir))
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next()
      res.sendFile(path.join(config.distDir, 'index.html'))
    })
  }

  app.use((error, _req, res, _next) => {
    const statusCode = error.statusCode || 500
    res.status(statusCode).json({
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || '未知错误',
        details: error.details || null
      }
    })
  })

  return app
}

module.exports = { createApp }
