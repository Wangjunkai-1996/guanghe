const { z } = require('zod')
const { AppError } = require('../lib/errors')

const createBatchSchema = z.object({
  name: z.string().trim().optional(),
  docUrl: z.string().trim().optional(),
  sheetName: z.string().trim().optional()
})

const updateTargetSchema = z.object({
  name: z.string().trim().optional(),
  docUrl: z.string().trim().optional(),
  sheetName: z.string().trim().optional()
})

const updateBindingSchema = z.object({
  accountId: z.string().trim().nullable().optional()
})

const rulesSchema = z.object({
  executionScope: z.enum(['ALL_EXECUTABLE', 'NEW_EXECUTABLE', 'SELECTED_ONLY']).optional(),
  accountScope: z.enum(['READY_ONLY', 'READY_PLUS_RECENT']).optional(),
  skipPolicies: z.object({
    missingContentId: z.boolean().optional(),
    missingAccount: z.boolean().optional(),
    ambiguous: z.boolean().optional(),
    complete: z.boolean().optional()
  }).optional(),
  syncPolicy: z.enum(['FILL_EMPTY_ONLY', 'OVERWRITE_TARGET_COLUMNS']).optional(),
  failurePolicy: z.enum(['KEEP_FOR_RETRY', 'KEEP_RESULT_FOR_RESYNC']).optional(),
  concurrencyProfile: z.enum(['SAFE', 'STANDARD', 'AGGRESSIVE']).optional(),
  selectedItemIds: z.array(z.string().trim()).optional()
})

const retryRunSchema = z.object({
  bucket: z.enum(['QUERY_FAILED', 'SYNC_FAILED', 'LOGIN_FAILED']).optional(),
  taskIds: z.array(z.string().trim()).optional()
}).refine((value) => Boolean(value.bucket) || (Array.isArray(value.taskIds) && value.taskIds.length > 0), {
  message: 'bucket 或 taskIds 至少提供一个'
})

const keepAliveSchema = z.object({
  accountIds: z.array(z.string().trim()).optional()
})

const cloneBatchSchema = z.object({
  name: z.string().trim().optional(),
  includeRules: z.boolean().optional()
})

const saveTemplateSchema = z.object({
  batchId: z.string().trim().min(1),
  name: z.string().trim().optional()
})

const debugQuerySchema = z.object({
  accountId: z.string().trim().min(1),
  contentId: z.string().trim().min(1)
})

function attachV7Routes(app, { v7Service }) {
  if (!v7Service) return

  app.get('/api/batches', (_req, res) => {
    res.json(v7Service.listBatches())
  })

  app.post('/api/batches', (req, res, next) => {
    try {
      const input = createBatchSchema.parse(req.body || {})
      res.status(201).json(v7Service.createBatch(input))
    } catch (error) {
      next(asRequestError(error))
    }
  })

  app.get('/api/batches/:batchId', (req, res, next) => {
    try {
      res.json(v7Service.getBatch(req.params.batchId))
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/batches/:batchId/target', (req, res, next) => {
    try {
      const input = updateTargetSchema.parse(req.body || {})
      res.json(v7Service.updateBatchTarget(req.params.batchId, input))
    } catch (error) {
      next(asRequestError(error))
    }
  })

  app.post('/api/batches/:batchId/intake/inspect', async (req, res, next) => {
    try {
      res.json(await v7Service.inspectBatchIntake(req.params.batchId))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/batches/:batchId/snapshots/:snapshotId', (req, res, next) => {
    try {
      res.json(v7Service.getSnapshot(req.params.batchId, req.params.snapshotId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/batches/:batchId/coverage/generate', (req, res, next) => {
    try {
      res.json(v7Service.generateCoverage(req.params.batchId))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/batches/:batchId/coverage', (req, res, next) => {
    try {
      res.json(v7Service.listCoverage(req.params.batchId))
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/batches/:batchId/coverage/:itemId/binding', (req, res, next) => {
    try {
      const input = updateBindingSchema.parse(req.body || {})
      res.json(v7Service.updateCoverageBinding(req.params.batchId, req.params.itemId, input))
    } catch (error) {
      next(asRequestError(error))
    }
  })

  app.get('/api/batches/:batchId/rules', (req, res, next) => {
    try {
      res.json(v7Service.getRules(req.params.batchId))
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/batches/:batchId/rules', (req, res, next) => {
    try {
      const input = rulesSchema.parse(req.body || {})
      res.json(v7Service.saveRules(req.params.batchId, input))
    } catch (error) {
      next(asRequestError(error))
    }
  })

  app.post('/api/batches/:batchId/runs', (req, res, next) => {
    try {
      res.status(201).json(v7Service.createRun(req.params.batchId))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/batches/:batchId/runs/:runId', (req, res, next) => {
    try {
      res.json(v7Service.getRun(req.params.batchId, req.params.runId))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/batches/:batchId/runs/:runId/tasks', (req, res, next) => {
    try {
      res.json(v7Service.listRunTasks(req.params.batchId, req.params.runId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/batches/:batchId/runs/:runId/retry', (req, res, next) => {
    try {
      const input = retryRunSchema.parse(req.body || {})
      res.json(v7Service.retryRun(req.params.batchId, req.params.runId, input))
    } catch (error) {
      next(asRequestError(error))
    }
  })

  app.get('/api/batches/:batchId/history', (req, res, next) => {
    try {
      res.json(v7Service.getBatchHistory(req.params.batchId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/batches/:batchId/clone', (req, res, next) => {
    try {
      const input = cloneBatchSchema.parse(req.body || {})
      res.status(201).json(v7Service.cloneBatch(req.params.batchId, input))
    } catch (error) {
      next(asRequestError(error))
    }
  })

  app.get('/api/accounts', (req, res, next) => {
    try {
      res.json(v7Service.listAccounts({ batchId: req.query.batchId ? String(req.query.batchId) : null }))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/accounts/health', (req, res, next) => {
    try {
      res.json(v7Service.getAccountsHealth({ batchId: req.query.batchId ? String(req.query.batchId) : null }))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/accounts/keepalive', async (req, res, next) => {
    try {
      const input = keepAliveSchema.parse(req.body || {})
      res.json(await v7Service.keepAliveAccounts(input))
    } catch (error) {
      next(asRequestError(error))
    }
  })

  app.post('/api/accounts/debug/query', async (req, res, next) => {
    try {
      const input = debugQuerySchema.parse(req.body || {})
      res.json(await v7Service.debugQuery(input))
    } catch (error) {
      next(asRequestError(error))
    }
  })

  app.get('/api/rule-templates', (_req, res, next) => {
    try {
      res.json(v7Service.listRuleTemplates())
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/rule-templates', (req, res, next) => {
    try {
      const input = saveTemplateSchema.parse(req.body || {})
      res.status(201).json(v7Service.saveRuleTemplate(input))
    } catch (error) {
      next(asRequestError(error))
    }
  })

  app.post('/api/batches/:batchId/rules/apply-template/:templateId', (req, res, next) => {
    try {
      res.json(v7Service.applyRuleTemplate(req.params.batchId, req.params.templateId))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/streams/batches/:batchId', (req, res, next) => {
    try {
      const batchId = String(req.params.batchId)
      v7Service.getBatch(batchId)

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders()

      const sendEvent = (eventName, payload) => {
        res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`)
      }

      sendEvent('batch.updated', v7Service.getBatch(batchId))

      const unsubscribe = v7Service.eventBus.subscribeBatch(batchId, (payload) => {
        sendEvent(payload.event, payload.data)
      })

      const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n')
      }, 15000)

      req.on('close', () => {
        clearInterval(heartbeat)
        unsubscribe()
      })
    } catch (error) {
      next(error)
    }
  })
}

function asRequestError(error) {
  if (error instanceof z.ZodError) {
    return new AppError(400, 'REQUEST_INVALID', error.issues[0]?.message || '请求参数不合法', error.flatten())
  }
  return error
}

module.exports = { attachV7Routes }
