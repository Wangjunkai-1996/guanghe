const crypto = require('crypto')
const { LOGIN_URL } = require('../lib/constants')
const { AppError } = require('../lib/errors')

const REQUIRED_METRIC_COLUMNS = ['查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数']
const REQUIRED_INTAKE_HEADERS = ['逛逛昵称', '内容id', ...REQUIRED_METRIC_COLUMNS]
const COVERAGE_STATUS_ORDER = ['EXECUTABLE', 'MISSING_CONTENT_ID', 'MISSING_ACCOUNT', 'AMBIGUOUS', 'COMPLETE']
const RUN_TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'PARTIAL_FAILED', 'STOPPED'])
const ACCOUNT_READY_STATUSES = new Set(['READY'])
const RULE_TARGET_COLUMNS = ['查看次数截图', '查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数']

class V7WorkspaceService {
  constructor({ db, eventBus, loginService, queryService, tencentDocsSyncService, browserManager, accountStore }) {
    this.db = db
    this.eventBus = eventBus
    this.loginService = loginService
    this.queryService = queryService
    this.tencentDocsSyncService = tencentDocsSyncService
    this.browserManager = browserManager
    this.accountStore = accountStore || loginService?.accountStore
    this.processingRuns = new Set()

    this.syncAccountsFromStore({ announce: false })
    this.reconcileInterruptedRuns()

    if (this.accountStore?.on) {
      this.accountStore.on('change', () => {
        this.syncAccountsFromStore({ announce: true })
      })
    }
  }

  reconcileInterruptedRuns() {
    const now = nowIso()
    const interruptedRuns = this.db.prepare(`
      SELECT id
      FROM batch_runs
      WHERE status IN ('QUEUED', 'RUNNING')
    `).all()

    if (interruptedRuns.length === 0) return

    const markTasks = this.db.prepare(`
      UPDATE run_tasks
      SET status = 'FAILED',
          error_code = COALESCE(error_code, 'SERVER_RESTARTED'),
          error_message = COALESCE(error_message, '服务重启后任务被中断，请重试。'),
          updated_at = ?
      WHERE run_id = ?
        AND status IN ('QUEUED', 'QUERYING', 'SYNCING')
    `)
    const touchRun = this.db.prepare(`
      UPDATE batch_runs
      SET status = 'FAILED',
          ended_at = ?,
          updated_at = ?
      WHERE id = ?
    `)
    const touchBatch = this.db.prepare(`
      UPDATE batches
      SET status = 'NEEDS_ATTENTION',
          updated_at = ?
      WHERE active_run_id = ?
    `)

    const tx = this.db.transaction((rows) => {
      for (const row of rows) {
        markTasks.run(now, row.id)
        touchRun.run(now, now, row.id)
        touchBatch.run(now, row.id)
      }
    })

    tx(interruptedRuns)
  }

  syncAccountsFromStore({ announce = true } = {}) {
    if (!this.accountStore?.list) return

    const rawAccounts = this.accountStore.list()
    const existing = new Map(this.db.prepare(`
      SELECT id, last_successful_query_at, raw_json
      FROM account_assets
    `).all().map((row) => [row.id, row]))
    const boundCounts = this.getBoundCoverageCounts()
    const seen = new Set()
    const now = nowIso()

    const upsert = this.db.prepare(`
      INSERT INTO account_assets (
        id,
        nickname,
        status,
        profile_key,
        last_login_at,
        last_successful_query_at,
        health,
        bound_coverage_count,
        raw_json,
        updated_at
      ) VALUES (
        @id,
        @nickname,
        @status,
        @profile_key,
        @last_login_at,
        @last_successful_query_at,
        @health,
        @bound_coverage_count,
        @raw_json,
        @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        nickname = excluded.nickname,
        status = excluded.status,
        profile_key = excluded.profile_key,
        last_login_at = excluded.last_login_at,
        last_successful_query_at = excluded.last_successful_query_at,
        health = excluded.health,
        bound_coverage_count = excluded.bound_coverage_count,
        raw_json = excluded.raw_json,
        updated_at = excluded.updated_at
    `)
    const markMissing = this.db.prepare(`
      UPDATE account_assets
      SET status = 'LOGIN_REQUIRED',
          health = 'RELOGIN',
          updated_at = ?
      WHERE id = ?
    `)

    const tx = this.db.transaction(() => {
      for (const account of rawAccounts) {
        const previous = existing.get(String(account.accountId))
        const lastSuccessfulQueryAt = previous?.last_successful_query_at || null
        const status = normalizeAccountStatus(account.status)
        const health = deriveAccountHealth({
          status,
          lastLoginAt: account.lastLoginAt,
          lastSuccessfulQueryAt
        })

        upsert.run({
          id: String(account.accountId),
          nickname: String(account.nickname || ''),
          status,
          profile_key: String(account.profileDir || ''),
          last_login_at: account.lastLoginAt || null,
          last_successful_query_at: lastSuccessfulQueryAt,
          health,
          bound_coverage_count: boundCounts.get(String(account.accountId)) || 0,
          raw_json: JSON.stringify(account),
          updated_at: now
        })
        seen.add(String(account.accountId))
      }

      for (const accountId of existing.keys()) {
        if (!seen.has(accountId)) {
          markMissing.run(now, accountId)
        }
      }
    })

    tx()

    if (announce) {
      this.emitAccountUpdates()
    }
  }

  emitAccountUpdates() {
    const batchIds = this.db.prepare('SELECT id FROM batches').all().map((row) => row.id)
    for (const batchId of batchIds) {
      this.refreshBatchState(batchId, { emit: false })
      this.eventBus.emitBatch(batchId, 'account.updated', {
        summary: this.getAccountsHealth({ batchId }).summary
      })
      this.eventBus.emitBatch(batchId, 'batch.updated', this.getBatch(batchId))
    }
  }

  listAccounts({ batchId = null } = {}) {
    const accounts = this.listAccountAssets()
    const summary = this.getAccountsHealth({ batchId }).summary
    const batch = batchId ? this.getBatch(batchId) : null
    const shortage = Math.max((batch?.coverageSummary?.executable || 0) - (summary.ready || 0), 0)

    return {
      accounts,
      summary,
      currentBatch: batch,
      batchContext: batch ? {
        batchId: batch.id,
        batchName: batch.name,
        executableRows: batch.coverageSummary?.executable || 0,
        readyAccounts: summary.ready || 0,
        shortage,
        blockers: batch.blockers || []
      } : null
    }
  }

  listAccountAssets() {
    const usageStats = this.getAccountUsageStats()
    const rows = this.db.prepare(`
      SELECT *
      FROM account_assets
      ORDER BY
        CASE status
          WHEN 'READY' THEN 0
          WHEN 'LOGIN_REQUIRED' THEN 1
          WHEN 'EXPIRED' THEN 2
          ELSE 3
        END,
        datetime(COALESCE(last_successful_query_at, last_login_at, updated_at)) DESC
    `).all()

    return rows.map((row) => ({
      id: row.id,
      nickname: row.nickname,
      status: row.status,
      profileKey: row.profile_key,
      lastLoginAt: row.last_login_at,
      lastSuccessfulQueryAt: row.last_successful_query_at,
      health: row.health,
      boundCoverageCount: row.bound_coverage_count,
      boundBatchCount: usageStats.get(row.id)?.boundBatchCount || 0,
      lastBatchId: usageStats.get(row.id)?.lastBatchId || null,
      lastBatchName: usageStats.get(row.id)?.lastBatchName || null,
      lastUsedAt: usageStats.get(row.id)?.lastUsedAt || null,
      raw: parseJson(row.raw_json, {})
    }))
  }

  getAccountsHealth({ batchId = null } = {}) {
    const accounts = this.listAccountAssets()
    const byStatus = {
      READY: 0,
      LOGIN_REQUIRED: 0,
      EXPIRED: 0,
      COOLING: 0
    }
    const byHealth = {
      READY: 0,
      KEEP_ALIVE: 0,
      RELOGIN: 0,
      COLD: 0
    }

    for (const account of accounts) {
      byStatus[account.status] = (byStatus[account.status] || 0) + 1
      byHealth[account.health] = (byHealth[account.health] || 0) + 1
    }

    return {
      summary: {
        total: accounts.length,
        ready: byStatus.READY || 0,
        loginRequired: byStatus.LOGIN_REQUIRED || 0,
        expired: byStatus.EXPIRED || 0,
        cooling: byStatus.COOLING || 0,
        keepAliveSuggested: byHealth.KEEP_ALIVE || 0,
        reloginSuggested: byHealth.RELOGIN || 0,
        batchExecutableRows: batchId ? this.getCoverageSummary(batchId).executable : 0,
        readyGap: batchId ? Math.max(this.getCoverageSummary(batchId).executable - (byStatus.READY || 0), 0) : 0
      },
      recommendedKeepAlive: accounts.filter((item) => item.health === 'KEEP_ALIVE').slice(0, 8),
      recommendedRelogin: accounts.filter((item) => item.health === 'RELOGIN').slice(0, 8)
    }
  }

  async keepAliveAccounts({ accountIds = [] } = {}) {
    const ids = Array.isArray(accountIds) && accountIds.length > 0
      ? accountIds.map((item) => String(item))
      : this.listAccountAssets().filter((item) => item.health === 'KEEP_ALIVE').map((item) => item.id)

    if (ids.length === 0) {
      return {
        requested: [],
        results: [],
        summary: {
          total: 0,
          succeeded: 0,
          failed: 0
        }
      }
    }

    const results = []
    for (const accountId of ids) {
      const rawAccount = this.accountStore?.get ? this.accountStore.get(accountId) : null
      if (!rawAccount || !ACCOUNT_READY_STATUSES.has(String(rawAccount.status || ''))) {
        results.push({
          accountId,
          ok: false,
          message: '账号当前不可保活，请先重新登录。'
        })
        continue
      }

      try {
        await this.browserManager.runAccountTask(accountId, async () => {
          const { context } = await this.browserManager.getOrCreateAccountContext(rawAccount)
          const page = context.pages()[0] || await context.newPage()
          await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
          await page.waitForTimeout(5000)
          await page.close().catch(() => {})
        })

        this.db.prepare(`
          UPDATE account_assets
          SET status = 'READY',
              health = 'READY',
              last_login_at = ?,
              updated_at = ?
          WHERE id = ?
        `).run(nowIso(), nowIso(), accountId)

        results.push({
          accountId,
          ok: true,
          message: '保活完成'
        })
      } catch (error) {
        this.db.prepare(`
          UPDATE account_assets
          SET status = 'LOGIN_REQUIRED',
              health = 'RELOGIN',
              updated_at = ?
          WHERE id = ?
        `).run(nowIso(), accountId)

        results.push({
          accountId,
          ok: false,
          message: error.message || '保活失败'
        })
      } finally {
        await this.browserManager.closeAccount(accountId).catch(() => {})
      }
    }

    this.emitAccountUpdates()

    return {
      requested: ids,
      results,
      summary: {
        total: results.length,
        succeeded: results.filter((item) => item.ok).length,
        failed: results.filter((item) => !item.ok).length
      }
    }
  }

  async debugQuery({ accountId, contentId }) {
    const payload = await this.queryService.queryByContentId({ accountId, contentId })
    this.markAccountQuerySuccess(accountId)
    this.emitAccountUpdates()
    return payload
  }

  createBatch({ name, docUrl = '', sheetName = '' } = {}) {
    const batchId = crypto.randomUUID()
    const now = nowIso()
    const preparedName = String(name || '').trim() || `新批次 ${formatBatchName(now)}`

    this.db.prepare(`
      INSERT INTO batches (
        id,
        name,
        status,
        target_doc_url,
        target_sheet_name,
        latest_snapshot_id,
        latest_ruleset_id,
        active_run_id,
        blockers_json,
        created_at,
        updated_at
      ) VALUES (?, ?, 'DRAFT', ?, ?, NULL, NULL, NULL, '[]', ?, ?)
    `).run(batchId, preparedName, String(docUrl || '').trim(), String(sheetName || '').trim(), now, now)

    const payload = this.refreshBatchState(batchId)
    this.eventBus.emitBatch(batchId, 'batch.updated', payload)
    return payload
  }

  listBatches() {
    const rows = this.db.prepare(`
      SELECT id
      FROM batches
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
    `).all()
    const batches = rows.map((row) => this.getBatch(row.id))

    return {
      batches,
      recentBatchId: batches[0]?.id || null
    }
  }

  getBatch(batchId) {
    const batch = this.getBatchRecordOrThrow(batchId)
    const snapshot = batch.latest_snapshot_id ? this.getSnapshot(batchId, batch.latest_snapshot_id) : null
    const coverageSummary = this.getCoverageSummary(batchId)
    const rules = this.getRules(batchId)
    const activeRun = batch.active_run_id ? this.getRun(batchId, batch.active_run_id).run : null
    const accountHealth = this.getAccountsHealth({ batchId }).summary
    const history = this.getBatchHistory(batchId)
    const phaseRail = buildPhaseRail({
      batchId,
      snapshot,
      blockers: parseJson(batch.blockers_json, []),
      coverageSummary,
      rules,
      activeRun,
      accountHealth,
      history
    })
    const primaryCta = buildPrimaryCta({
      batchId,
      snapshot,
      blockers: parseJson(batch.blockers_json, []),
      coverageSummary,
      rules,
      activeRun,
      accountHealth
    })
    const batchStatus = deriveBatchStatus({
      blockers: parseJson(batch.blockers_json, []),
      coverageSummary,
      rules,
      activeRun,
      snapshot,
      accountHealth
    })

    return {
      id: batch.id,
      name: batch.name,
      status: batchStatus,
      target: {
        docUrl: batch.target_doc_url,
        sheetName: batch.target_sheet_name
      },
      latestSnapshotId: batch.latest_snapshot_id,
      latestRuleSetId: batch.latest_ruleset_id,
      activeRunId: batch.active_run_id,
      blockers: parseJson(batch.blockers_json, []),
      createdAt: batch.created_at,
      updatedAt: batch.updated_at,
      overview: {
        readyAccounts: accountHealth.ready,
        executableRows: coverageSummary.executable,
        blockersCount: parseJson(batch.blockers_json, []).length,
        rulesReady: Boolean(rules?.id),
        runStatus: activeRun?.status || 'IDLE',
        primaryCta,
        phaseRail
      },
      latestSnapshot: snapshot ? {
        id: snapshot.id,
        version: snapshot.version,
        checkedAt: snapshot.checkedAt,
        summary: snapshot.summary,
        blockers: snapshot.blockers,
        headers: snapshot.headers,
        rowCount: snapshot.rows.length
      } : null,
      coverageSummary,
      currentRules: rules,
      activeRun,
      history
    }
  }

  updateBatchTarget(batchId, { docUrl, sheetName, name } = {}) {
    const batch = this.getBatchRecordOrThrow(batchId)
    const nextDocUrl = docUrl === undefined ? batch.target_doc_url : String(docUrl || '').trim()
    const nextSheetName = sheetName === undefined ? batch.target_sheet_name : String(sheetName || '').trim()
    const nextName = name === undefined ? batch.name : String(name || '').trim()
    const now = nowIso()

    const tx = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE batches
        SET name = ?,
            target_doc_url = ?,
            target_sheet_name = ?,
            latest_snapshot_id = NULL,
            latest_ruleset_id = NULL,
            active_run_id = NULL,
            blockers_json = '[]',
            updated_at = ?
        WHERE id = ?
      `).run(nextName || batch.name, nextDocUrl, nextSheetName, now, batchId)

      this.db.prepare('DELETE FROM coverage_items WHERE batch_id = ?').run(batchId)
    })

    tx()

    const payload = this.refreshBatchState(batchId)
    this.eventBus.emitBatch(batchId, 'batch.updated', payload)
    return payload
  }

  async inspectBatchIntake(batchId) {
    const batch = this.getBatchRecordOrThrow(batchId)
    const target = {
      docUrl: String(batch.target_doc_url || '').trim(),
      sheetName: String(batch.target_sheet_name || '').trim()
    }

    if (!target.docUrl || !target.sheetName) {
      const blockers = buildMissingTargetBlockers(target)
      this.setBatchBlockers(batchId, blockers)
      this.eventBus.emitBatch(batchId, 'batch.updated', this.getBatch(batchId))
      throw new AppError(400, 'BATCH_TARGET_REQUIRED', '请先填写交接表链接和工作表名称')
    }

    try {
      const inspected = await this.tencentDocsSyncService.inspectSheet({
        target,
        maxRows: 500,
        forceRefresh: true
      })

      const blockers = buildIntakeBlockers(inspected)
      const snapshotId = crypto.randomUUID()
      const version = (this.db.prepare('SELECT COALESCE(MAX(version), 0) AS current_version FROM snapshots WHERE batch_id = ?').get(batchId)?.current_version || 0) + 1
      const checkedAt = nowIso()
      const snapshotPayload = {
        id: snapshotId,
        batchId,
        version,
        headers: inspected.headers || [],
        rows: inspected.rows || [],
        summary: {
          ...(inspected.summary || {}),
          totalRows: Number(inspected.summary?.totalRows || inspected.rowCount || 0)
        },
        blockers,
        checkedAt
      }

      const tx = this.db.transaction(() => {
        this.db.prepare(`
          INSERT INTO snapshots (
            id,
            batch_id,
            version,
            headers_json,
            rows_json,
            summary_json,
            blockers_json,
            checked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          snapshotId,
          batchId,
          version,
          JSON.stringify(snapshotPayload.headers),
          JSON.stringify(snapshotPayload.rows),
          JSON.stringify(snapshotPayload.summary),
          JSON.stringify(snapshotPayload.blockers),
          checkedAt
        )

        this.db.prepare(`
          UPDATE batches
          SET latest_snapshot_id = ?,
              latest_ruleset_id = NULL,
              active_run_id = NULL,
              blockers_json = ?,
              updated_at = ?
          WHERE id = ?
        `).run(snapshotId, JSON.stringify(blockers.map((item) => item.message)), checkedAt, batchId)

        this.db.prepare('DELETE FROM coverage_items WHERE batch_id = ?').run(batchId)
      })

      tx()

      const payload = this.refreshBatchState(batchId)
      this.eventBus.emitBatch(batchId, 'snapshot.updated', snapshotPayload)
      this.eventBus.emitBatch(batchId, 'batch.updated', payload)
      return snapshotPayload
    } catch (error) {
      const blockers = [{
        code: error.code || 'INTAKE_FAILED',
        message: error.message || '交接表检查失败'
      }]
      this.setBatchBlockers(batchId, blockers.map((item) => item.message))
      this.eventBus.emitBatch(batchId, 'batch.updated', this.getBatch(batchId))
      throw error
    }
  }

  getSnapshot(batchId, snapshotId) {
    this.getBatchRecordOrThrow(batchId)
    const row = this.db.prepare(`
      SELECT *
      FROM snapshots
      WHERE id = ? AND batch_id = ?
    `).get(snapshotId, batchId)

    if (!row) {
      throw new AppError(404, 'SNAPSHOT_NOT_FOUND', '快照不存在')
    }

    return {
      id: row.id,
      batchId: row.batch_id,
      version: row.version,
      headers: parseJson(row.headers_json, []),
      rows: parseJson(row.rows_json, []),
      summary: parseJson(row.summary_json, {}),
      blockers: parseJson(row.blockers_json, []),
      checkedAt: row.checked_at
    }
  }

  generateCoverage(batchId) {
    const batch = this.getBatchRecordOrThrow(batchId)
    if (!batch.latest_snapshot_id) {
      throw new AppError(400, 'SNAPSHOT_REQUIRED', '请先检查交接表')
    }

    const snapshot = this.getSnapshot(batchId, batch.latest_snapshot_id)
    const accounts = this.listAccountAssets().filter((item) => item.status === 'READY')
    const previousItems = this.getCoverageItems(batchId)
    const manualBindings = new Map(
      previousItems
        .filter((item) => item.binding?.mode === 'MANUAL' && item.binding?.accountId)
        .map((item) => [coverageIdentity(item), item.binding.accountId])
    )
    const historicalBindings = this.getHistoricalBindings(batchId)
    const nextItems = []
    const now = nowIso()

    for (const row of snapshot.rows.filter(isCoverageCandidateRow)) {
      const identity = rowIdentity(row)
      const nickname = String(row.nickname || row.cells?.['逛逛昵称'] || '').trim()
      const contentId = String(row.contentId || row.cells?.['内容id'] || row.cells?.['内容ID'] || '').trim()
      const accountIdHint = String(
        row.accountId
        || row.cells?.['逛逛ID']
        || row.cells?.['账号ID']
        || row.cells?.['账号id']
        || ''
      ).trim()
      const missingColumns = REQUIRED_METRIC_COLUMNS.filter((columnName) => !hasCellValue(row.cells?.[columnName]))
      const complete = contentId && missingColumns.length === 0

      let binding = {
        accountId: null,
        mode: 'AUTO',
        matchedBy: 'NICKNAME',
        confidence: 0
      }
      let ambiguous = false

      const manualAccountId = manualBindings.get(identity)
      if (manualAccountId && accounts.some((item) => item.id === manualAccountId)) {
        binding = {
          accountId: manualAccountId,
          mode: 'MANUAL',
          matchedBy: 'MANUAL',
          confidence: 1
        }
      } else {
        const historicalAccountId = historicalBindings.get(contentId || normalizeNickname(nickname))
        if (historicalAccountId && accounts.some((item) => item.id === historicalAccountId)) {
          binding = {
            accountId: historicalAccountId,
            mode: 'HISTORICAL',
            matchedBy: 'ACCOUNT_ID',
            confidence: 0.92
          }
        } else {
          const accountIdMatches = accountIdHint ? accounts.filter((item) => item.id === accountIdHint) : []
          const nicknameMatches = normalizeNickname(nickname)
            ? accounts.filter((item) => normalizeNickname(item.nickname) === normalizeNickname(nickname))
            : []

          if (accountIdMatches.length > 1 || nicknameMatches.length > 1) {
            ambiguous = true
          } else if (accountIdMatches.length === 1) {
            binding = {
              accountId: accountIdMatches[0].id,
              mode: 'AUTO',
              matchedBy: 'ACCOUNT_ID',
              confidence: 0.96
            }
          } else if (nicknameMatches.length === 1) {
            binding = {
              accountId: nicknameMatches[0].id,
              mode: 'AUTO',
              matchedBy: 'NICKNAME',
              confidence: 0.78
            }
          }
        }
      }

      let status = 'EXECUTABLE'
      if (!contentId) {
        status = 'MISSING_CONTENT_ID'
      } else if (complete) {
        status = 'COMPLETE'
      } else if (ambiguous) {
        status = 'AMBIGUOUS'
      } else if (!binding.accountId) {
        status = 'MISSING_ACCOUNT'
      }

      nextItems.push({
        id: crypto.randomUUID(),
        batchId,
        snapshotId: snapshot.id,
        sheetRow: Number(row.sheetRow || 0),
        nickname,
        contentId,
        status,
        missingColumns,
        binding,
        recommendation: buildCoverageRecommendation(status),
        result: null,
        updatedAt: now
      })
    }

    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM coverage_items WHERE batch_id = ?').run(batchId)

      const insert = this.db.prepare(`
        INSERT INTO coverage_items (
          id,
          batch_id,
          snapshot_id,
          sheet_row,
          nickname,
          content_id,
          status,
          missing_columns_json,
          binding_json,
          recommendation,
          result_json,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      for (const item of nextItems) {
        insert.run(
          item.id,
          item.batchId,
          item.snapshotId,
          item.sheetRow,
          item.nickname,
          item.contentId,
          item.status,
          JSON.stringify(item.missingColumns),
          JSON.stringify(item.binding),
          item.recommendation,
          item.result ? JSON.stringify(item.result) : null,
          item.updatedAt
        )
      }

      this.db.prepare(`
        UPDATE batches
        SET active_run_id = NULL,
            updated_at = ?
        WHERE id = ?
      `).run(now, batchId)
    })

    tx()
    this.syncAccountsFromStore({ announce: false })
    const payload = this.listCoverage(batchId)
    this.refreshBatchState(batchId)
    this.eventBus.emitBatch(batchId, 'coverage.updated', payload)
    this.eventBus.emitBatch(batchId, 'batch.updated', this.getBatch(batchId))
    return payload
  }

  listCoverage(batchId) {
    this.getBatchRecordOrThrow(batchId)
    const items = this.getCoverageItems(batchId)
    const summary = buildCoverageSummary(items)
    const ordered = sortCoverageItems(items)

    return {
      summary,
      items: ordered,
      buckets: [
        { key: 'EXECUTABLE', label: '可执行', count: summary.executable },
        { key: 'MISSING_CONTENT_ID', label: '缺内容ID', count: summary.missingContentId },
        { key: 'MISSING_ACCOUNT', label: '缺账号', count: summary.missingAccount },
        { key: 'AMBIGUOUS', label: '歧义', count: summary.ambiguous },
        { key: 'COMPLETE', label: '已完整', count: summary.complete }
      ],
      defaultSelectedId: ordered.find((item) => item.status === 'EXECUTABLE')?.id || ordered[0]?.id || null
    }
  }

  updateCoverageBinding(batchId, itemId, { accountId = null } = {}) {
    const item = this.getCoverageItemOrThrow(itemId, batchId)
    const account = accountId ? this.getAccountAssetOrThrow(accountId) : null
    const binding = account
      ? {
        accountId: account.id,
        mode: 'MANUAL',
        matchedBy: 'MANUAL',
        confidence: 1
      }
      : {
        accountId: null,
        mode: 'MANUAL',
        matchedBy: 'MANUAL',
        confidence: 0
      }

    const status = !item.contentId
      ? 'MISSING_CONTENT_ID'
      : (item.missingColumns.length === 0 ? 'COMPLETE' : (binding.accountId ? 'EXECUTABLE' : 'MISSING_ACCOUNT'))
    const now = nowIso()

    this.db.prepare(`
      UPDATE coverage_items
      SET status = ?,
          binding_json = ?,
          recommendation = ?,
          updated_at = ?
      WHERE id = ? AND batch_id = ?
    `).run(status, JSON.stringify(binding), buildCoverageRecommendation(status), now, itemId, batchId)

    this.syncAccountsFromStore({ announce: false })
    const payload = this.listCoverage(batchId)
    this.refreshBatchState(batchId)
    this.eventBus.emitBatch(batchId, 'coverage.updated', payload)
    this.eventBus.emitBatch(batchId, 'batch.updated', this.getBatch(batchId))
    return this.getCoverageItemOrThrow(itemId, batchId)
  }

  getRules(batchId) {
    this.getBatchRecordOrThrow(batchId)
    const batch = this.getBatchRecordOrThrow(batchId)
    const row = batch.latest_ruleset_id
      ? this.db.prepare(`
        SELECT *
        FROM rulesets
        WHERE id = ? AND batch_id = ?
      `).get(batch.latest_ruleset_id, batchId)
      : null

    if (!row) {
      const draft = buildDefaultRuleSet()
      return {
        ...draft,
        id: null,
        batchId,
        preview: this.computeRulePreview(batchId, draft),
        savedAt: null
      }
    }

    const payload = parseJson(row.payload_json, buildDefaultRuleSet())
    return {
      ...payload,
      id: row.id,
      batchId,
      savedAt: row.saved_at
    }
  }

  saveRules(batchId, input = {}) {
    this.getBatchRecordOrThrow(batchId)
    const nextRules = normalizeRuleSet({
      ...buildDefaultRuleSet(),
      ...input
    })
    const preview = this.computeRulePreview(batchId, nextRules)
    const savedAt = nowIso()
    const rulesetId = crypto.randomUUID()
    const payload = {
      ...nextRules,
      preview
    }

    this.db.prepare(`
      INSERT INTO rulesets (
        id,
        batch_id,
        payload_json,
        saved_at
      ) VALUES (?, ?, ?, ?)
    `).run(rulesetId, batchId, JSON.stringify(payload), savedAt)

    this.db.prepare(`
      UPDATE batches
      SET latest_ruleset_id = ?,
          updated_at = ?
      WHERE id = ?
    `).run(rulesetId, savedAt, batchId)

    const result = this.getRules(batchId)
    this.refreshBatchState(batchId)
    this.eventBus.emitBatch(batchId, 'rules.updated', result)
    this.eventBus.emitBatch(batchId, 'batch.updated', this.getBatch(batchId))
    return result
  }

  computeRulePreview(batchId, ruleInput = {}) {
    const rules = normalizeRuleSet({
      ...buildDefaultRuleSet(),
      ...ruleInput
    })
    const items = this.getCoverageItems(batchId)
    const successfulCoverageIds = this.getSuccessfulCoverageIds(batchId)
    const selected = selectCoverageForExecution(items, rules, successfulCoverageIds)
    const willRunRows = selected.length
    const willSkipRows = items.length - willRunRows
    const estimatedAccountUsage = new Set(selected.map((item) => item.binding?.accountId).filter(Boolean)).size

    return {
      willRunRows,
      willSkipRows,
      estimatedAccountUsage,
      targetColumns: RULE_TARGET_COLUMNS
    }
  }

  createRun(batchId) {
    const batch = this.getBatchRecordOrThrow(batchId)
    if (batch.active_run_id) {
      const activeRun = this.getRun(batchId, batch.active_run_id).run
      if (!RUN_TERMINAL_STATUSES.has(activeRun.status)) {
        throw new AppError(409, 'RUN_ALREADY_ACTIVE', '当前批次仍有运行中的队列，请先等待结束或处理失败桶')
      }
    }

    if (!batch.latest_ruleset_id) {
      throw new AppError(400, 'RULES_REQUIRED', '请先保存本批规则')
    }

    const rules = this.getRules(batchId)
    const coverageItems = selectCoverageForExecution(
      this.getCoverageItems(batchId),
      rules,
      this.getSuccessfulCoverageIds(batchId)
    )

    if (coverageItems.length === 0) {
      throw new AppError(400, 'NO_EXECUTABLE_ROWS', '当前没有可执行的覆盖项')
    }

    const runId = crypto.randomUUID()
    const now = nowIso()
    const tx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO batch_runs (
          id,
          batch_id,
          ruleset_id,
          status,
          planned_count,
          running_count,
          success_count,
          failed_count,
          sync_failed_count,
          started_at,
          ended_at,
          updated_at,
          rule_snapshot_json
        ) VALUES (?, ?, ?, 'QUEUED', ?, 0, 0, 0, 0, NULL, NULL, ?, ?)
      `).run(runId, batchId, rules.id, coverageItems.length, now, JSON.stringify(rules))

      const insertTask = this.db.prepare(`
        INSERT INTO run_tasks (
          id,
          run_id,
          batch_id,
          coverage_item_id,
          account_id,
          status,
          result_ref,
          artifact_refs_json,
          error_code,
          error_message,
          updated_at,
          query_payload_json,
          sync_payload_json
        ) VALUES (?, ?, ?, ?, ?, 'QUEUED', NULL, '[]', NULL, NULL, ?, NULL, NULL)
      `)

      for (const item of coverageItems) {
        insertTask.run(
          crypto.randomUUID(),
          runId,
          batchId,
          item.id,
          item.binding.accountId,
          now
        )
      }

      this.db.prepare(`
        UPDATE batches
        SET active_run_id = ?,
            updated_at = ?
        WHERE id = ?
      `).run(runId, now, batchId)
    })

    tx()

    this.refreshBatchState(batchId)
    const payload = this.getRun(batchId, runId)
    this.eventBus.emitBatch(batchId, 'run.updated', payload)
    this.eventBus.emitBatch(batchId, 'batch.updated', this.getBatch(batchId))
    queueMicrotask(() => {
      void this.processRun(runId)
    })
    return payload
  }

  getRun(batchId, runId) {
    this.getBatchRecordOrThrow(batchId)
    const row = this.db.prepare(`
      SELECT *
      FROM batch_runs
      WHERE id = ? AND batch_id = ?
    `).get(runId, batchId)

    if (!row) {
      throw new AppError(404, 'RUN_NOT_FOUND', '批次运行不存在')
    }

    const tasks = this.getRunTasks(runId)
    const buckets = summarizeRunBuckets(tasks, this.getCoverageItems(batchId))
    const summary = {
      completionRate: row.planned_count === 0 ? 0 : Math.round((row.success_count / row.planned_count) * 100),
      plannedCount: row.planned_count,
      successCount: row.success_count,
      failedCount: row.failed_count,
      syncFailedCount: row.sync_failed_count,
      runningCount: row.running_count
    }

    return {
      run: {
        id: row.id,
        batchId: row.batch_id,
        ruleSetId: row.ruleset_id,
        status: row.status,
        plannedCount: row.planned_count,
        runningCount: row.running_count,
        successCount: row.success_count,
        failedCount: row.failed_count,
        syncFailedCount: row.sync_failed_count,
        startedAt: row.started_at,
        endedAt: row.ended_at
      },
      summary,
      buckets,
      selectedTaskId: tasks.find((item) => item.status === 'FAILED')?.id || tasks[0]?.id || null
    }
  }

  listRunTasks(batchId, runId) {
    this.getRun(batchId, runId)
    const tasks = sortRunTasks(this.getRunTasks(runId))
    return {
      tasks,
      buckets: summarizeRunBuckets(tasks, this.getCoverageItems(batchId)),
      selectedTaskId: tasks.find((item) => item.status === 'FAILED')?.id || tasks[0]?.id || null
    }
  }

  retryRun(batchId, runId, { bucket = null, taskIds = null } = {}) {
    this.getRun(batchId, runId)
    const tasks = this.getRunTasks(runId)
    const selectedIds = Array.isArray(taskIds) && taskIds.length > 0
      ? new Set(taskIds.map((item) => String(item)))
      : new Set(tasks.filter((item) => matchesRetryBucket(item, bucket)).map((item) => item.id))

    if (selectedIds.size === 0) {
      throw new AppError(400, 'RUN_RETRY_TARGET_EMPTY', '没有可重试的任务')
    }

    const now = nowIso()
    const update = this.db.prepare(`
      UPDATE run_tasks
      SET status = 'QUEUED',
          error_code = NULL,
          error_message = NULL,
          result_ref = CASE
            WHEN ? = 'SYNC_FAILED' THEN result_ref
            ELSE NULL
          END,
          query_payload_json = CASE
            WHEN ? = 'SYNC_FAILED' THEN query_payload_json
            ELSE NULL
          END,
          sync_payload_json = NULL,
          updated_at = ?
      WHERE id = ?
    `)

    const tx = this.db.transaction(() => {
      for (const taskId of selectedIds) {
        update.run(bucket || '', bucket || '', now, taskId)
      }

      this.db.prepare(`
        UPDATE batch_runs
        SET status = 'QUEUED',
            ended_at = NULL,
            updated_at = ?
        WHERE id = ?
      `).run(now, runId)
    })
    tx()

    this.refreshRunAggregate(runId)
    this.eventBus.emitBatch(batchId, 'task.updated', this.listRunTasks(batchId, runId))
    this.eventBus.emitBatch(batchId, 'run.updated', this.getRun(batchId, runId))
    this.eventBus.emitBatch(batchId, 'batch.updated', this.getBatch(batchId))

    queueMicrotask(() => {
      void this.processRun(runId)
    })

    return this.getRun(batchId, runId)
  }

  async processRun(runId) {
    if (this.processingRuns.has(runId)) return
    this.processingRuns.add(runId)

    try {
      const runRow = this.getRunRowOrThrow(runId)
      const rules = parseJson(runRow.rule_snapshot_json, buildDefaultRuleSet())
      const concurrency = resolveConcurrency(rules.concurrencyProfile)
      const queuedTasks = this.db.prepare(`
        SELECT id
        FROM run_tasks
        WHERE run_id = ? AND status = 'QUEUED'
        ORDER BY datetime(updated_at) ASC
      `).all(runId).map((row) => row.id)

      if (queuedTasks.length === 0) {
        this.refreshRunAggregate(runId)
        return
      }

      this.db.prepare(`
        UPDATE batch_runs
        SET status = 'RUNNING',
            started_at = COALESCE(started_at, ?),
            updated_at = ?
        WHERE id = ?
      `).run(nowIso(), nowIso(), runId)

      const taskIds = [...queuedTasks]
      let cursor = 0
      const workers = Array.from({ length: Math.min(concurrency, taskIds.length) }, () =>
        (async () => {
          while (true) {
            const currentIndex = cursor
            cursor += 1
            if (currentIndex >= taskIds.length) return
            await this.processRunTask(taskIds[currentIndex], rules)
          }
        })()
      )

      await Promise.all(workers)
      this.refreshRunAggregate(runId)
    } finally {
      this.processingRuns.delete(runId)
    }
  }

  async processRunTask(taskId, rules) {
    const task = this.getRunTaskOrThrow(taskId)
    const coverageItem = this.getCoverageItemOrThrow(task.coverageItemId, task.batchId)
    const batch = this.getBatchRecordOrThrow(task.batchId)
    let queryPayload = task.queryPayload
    let resultRef = task.resultRef
    let artifactRefs = [...task.artifactRefs]

    try {
      const rawAccount = this.accountStore?.get ? this.accountStore.get(task.accountId) : null
      if (!rawAccount || !ACCOUNT_READY_STATUSES.has(String(rawAccount.status || ''))) {
        throw new AppError(401, 'ACCOUNT_LOGIN_REQUIRED', '账号登录态已失效，请重新扫码登录')
      }

      if (!resultRef || !queryPayload) {
        this.patchRunTask(taskId, {
          status: 'QUERYING',
          updatedAt: nowIso()
        })

        queryPayload = await this.queryService.queryByContentId({
          accountId: task.accountId,
          contentId: coverageItem.contentId
        })
        resultRef = queryPayload?.artifacts?.resultUrl || null
        artifactRefs = compactStrings([
          queryPayload?.screenshots?.summaryUrl,
          queryPayload?.screenshots?.rawUrl,
          queryPayload?.screenshots?.analysisFullUrl,
          queryPayload?.artifacts?.resultUrl,
          queryPayload?.artifacts?.networkLogUrl
        ])

        this.markAccountQuerySuccess(task.accountId)
        this.patchRunTask(taskId, {
          status: 'SYNCING',
          resultRef,
          artifactRefs,
          queryPayload,
          updatedAt: nowIso()
        })
      } else {
        this.patchRunTask(taskId, {
          status: 'SYNCING',
          updatedAt: nowIso()
        })
      }

      const syncPayload = await this.performCoverageSync({
        resultUrl: resultRef,
        target: {
          docUrl: batch.target_doc_url,
          sheetName: batch.target_sheet_name
        },
        coverageItem,
        syncPolicy: rules.syncPolicy
      })

      this.patchRunTask(taskId, {
        status: 'SUCCEEDED',
        resultRef,
        artifactRefs,
        queryPayload,
        syncPayload,
        errorCode: null,
        errorMessage: null,
        updatedAt: nowIso()
      })

      this.patchCoverageItem(coverageItem.id, {
        status: 'COMPLETE',
        missingColumns: [],
        recommendation: '已完成回填',
        result: {
          query: queryPayload,
          sync: syncPayload
        },
        updatedAt: nowIso()
      })
    } catch (error) {
      const errorCode = error.code || 'RUN_TASK_FAILED'
      const errorMessage = error.message || '任务执行失败'
      if (errorCode === 'ACCOUNT_LOGIN_REQUIRED') {
        this.db.prepare(`
          UPDATE account_assets
          SET status = 'LOGIN_REQUIRED',
              health = 'RELOGIN',
              updated_at = ?
          WHERE id = ?
        `).run(nowIso(), task.accountId)
      }

      if (queryPayload && (classifyRunTaskBucket({ ...task, errorCode, status: 'FAILED' }) === 'SYNC_FAILED' || rules.failurePolicy === 'KEEP_RESULT_FOR_RESYNC')) {
        this.patchCoverageItem(coverageItem.id, {
          status: 'EXECUTABLE',
          missingColumns: coverageItem.missingColumns,
          recommendation: '查询结果已保留，可继续补同步',
          result: {
            query: queryPayload,
            sync: null
          },
          updatedAt: nowIso()
        })
      }

      this.patchRunTask(taskId, {
        status: 'FAILED',
        resultRef,
        artifactRefs,
        queryPayload,
        syncPayload: null,
        errorCode,
        errorMessage,
        updatedAt: nowIso()
      })
    } finally {
      this.refreshRunAggregate(task.runId)
      this.eventBus.emitBatch(task.batchId, 'task.updated', this.listRunTasks(task.batchId, task.runId))
      this.eventBus.emitBatch(task.batchId, 'run.updated', this.getRun(task.batchId, task.runId))
      this.eventBus.emitBatch(task.batchId, 'batch.updated', this.getBatch(task.batchId))
    }
  }

  async performCoverageSync({ resultUrl, target, coverageItem, syncPolicy }) {
    if (!resultUrl) {
      throw new AppError(400, 'RESULT_REQUIRED', '缺少查询结果，无法执行回填')
    }

    if (syncPolicy === 'OVERWRITE_TARGET_COLUMNS') {
      return this.tencentDocsSyncService.syncHandoffRow({
        source: { resultUrl },
        target,
        match: {
          sheetRow: coverageItem.sheetRow,
          nickname: coverageItem.nickname,
          contentId: coverageItem.contentId
        }
      })
    }

    const prepared = await this.tencentDocsSyncService.prepareHandoffSync({
      source: { resultUrl },
      target,
      match: {
        sheetRow: coverageItem.sheetRow,
        nickname: coverageItem.nickname,
        contentId: coverageItem.contentId
      }
    })

    const columns = (prepared.columns || []).filter((item) => coverageItem.missingColumns.includes(item.columnName))
    if (columns.length === 0) {
      return {
        operationId: prepared.operationId,
        artifacts: prepared.artifacts,
        writeSummary: {
          action: 'SKIPPED',
          sheetRow: prepared.match.sheetRow,
          columnsUpdated: []
        }
      }
    }

    const writeSummary = await this.tencentDocsSyncService.runSerializedBrowserOperation(async () => {
      this.tencentDocsSyncService.ensureBrowserProfileAvailable()
      return this.tencentDocsSyncService.adapter.updateRowCells({
        target: prepared.target,
        sheetRow: prepared.match.sheetRow,
        cells: columns,
        artifactDir: prepared.artifactDir
      })
    })

    return {
      operationId: prepared.operationId,
      target: prepared.target,
      match: prepared.match,
      artifacts: prepared.artifacts,
      writeSummary
    }
  }

  getBatchHistory(batchId) {
    const batch = this.getBatchRecordOrThrow(batchId)
    const rows = this.db.prepare(`
      SELECT *
      FROM batch_runs
      WHERE batch_id = ?
      ORDER BY datetime(updated_at) DESC
    `).all(batchId)

    const runs = rows.map((row) => {
      const tasks = this.getRunTasks(row.id)
      const bucketCounts = summarizeRunBuckets(tasks, this.getCoverageItems(batchId))
      const durationMs = calculateDurationMs(row.started_at, row.ended_at)

      return {
        id: row.id,
        status: row.status,
        plannedCount: row.planned_count,
        successCount: row.success_count,
        failedCount: row.failed_count,
        syncFailedCount: row.sync_failed_count,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        updatedAt: row.updated_at,
        durationMs,
        bucketCounts
      }
    })

    const totalRuns = runs.length
    const completedRuns = runs.filter((run) => run.status === 'SUCCEEDED').length
    const attentionRuns = runs.filter((run) => run.status === 'FAILED' || run.status === 'PARTIAL_FAILED').length
    const durationValues = runs.map((run) => run.durationMs).filter((value) => value > 0)
    const averageSuccessRate = totalRuns === 0
      ? 0
      : Math.round(runs.reduce((sum, run) => sum + (run.plannedCount === 0 ? 0 : (run.successCount / run.plannedCount) * 100), 0) / totalRuns)
    const averageDurationMinutes = durationValues.length === 0
      ? 0
      : Math.round(durationValues.reduce((sum, value) => sum + value, 0) / durationValues.length / 60000)
    const failureBuckets = aggregateHistoryBuckets(runs)
    const rules = batch.latest_ruleset_id ? this.getRules(batchId) : null

    return {
      runs,
      summary: {
        totalRuns,
        completedRuns,
        attentionRuns,
        averageSuccessRate,
        averageDurationMinutes: Number.isFinite(averageDurationMinutes) ? averageDurationMinutes : 0,
        latestRunAt: runs[0]?.updatedAt || null
      },
      failureBuckets,
      templateSuggestion: rules?.id ? {
        name: `${batch.name} 当前规则`,
        batchId,
        ruleSetId: rules.id,
        preview: rules.preview
      } : null,
      cloneSuggestion: {
        suggestedName: `${batch.name} 复制`,
        docUrl: batch.target_doc_url,
        sheetName: batch.target_sheet_name,
        includeRules: Boolean(rules?.id)
      }
    }
  }

  cloneBatch(sourceBatchId, { name, includeRules = true } = {}) {
    const source = this.getBatch(sourceBatchId)
    const cloned = this.createBatch({
      name: String(name || '').trim() || `${source.name} 复制`,
      docUrl: source.target?.docUrl || '',
      sheetName: source.target?.sheetName || ''
    })

    if (includeRules && source.currentRules?.id) {
      this.saveRules(cloned.id, stripRuleMeta(source.currentRules))
    }

    return this.getBatch(cloned.id)
  }

  listRuleTemplates() {
    const rows = this.db.prepare(`
      SELECT *
      FROM rule_templates
      ORDER BY
        datetime(COALESCE(last_used_at, updated_at)) DESC,
        use_count DESC,
        datetime(created_at) DESC
    `).all()

    return {
      templates: rows.map((row) => ({
        id: row.id,
        name: row.name,
        sourceBatchId: row.source_batch_id,
        sourceRuleSetId: row.source_ruleset_id,
        useCount: row.use_count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastUsedAt: row.last_used_at,
        rules: parseJson(row.payload_json, buildDefaultRuleSet())
      }))
    }
  }

  saveRuleTemplate({ batchId, name } = {}) {
    const batch = this.getBatch(batchId)
    const rules = this.getRules(batchId)
    if (!rules?.id) {
      throw new AppError(400, 'RULES_REQUIRED', '请先保存本批规则后再沉淀模板')
    }

    const templateId = crypto.randomUUID()
    const now = nowIso()
    const payload = stripRuleMeta(rules)
    const templateName = String(name || '').trim() || `${batch.name} 规则模板`

    this.db.prepare(`
      INSERT INTO rule_templates (
        id,
        name,
        source_batch_id,
        source_ruleset_id,
        payload_json,
        created_at,
        updated_at,
        last_used_at,
        use_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0)
    `).run(templateId, templateName, batchId, rules.id, JSON.stringify(payload), now, now)

    return this.listRuleTemplates().templates.find((item) => item.id === templateId)
  }

  applyRuleTemplate(batchId, templateId) {
    this.getBatchRecordOrThrow(batchId)
    const template = this.getRuleTemplateOrThrow(templateId)
    const now = nowIso()

    this.db.prepare(`
      UPDATE rule_templates
      SET use_count = use_count + 1,
          last_used_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(now, now, templateId)

    return this.saveRules(batchId, template.rules)
  }

  refreshBatchState(batchId, { emit = false } = {}) {
    const payload = this.getBatch(batchId)
    this.db.prepare(`
      UPDATE batches
      SET status = ?,
          updated_at = ?
      WHERE id = ?
    `).run(payload.status, nowIso(), batchId)

    if (emit) {
      this.eventBus.emitBatch(batchId, 'batch.updated', this.getBatch(batchId))
    }

    return this.getBatch(batchId)
  }

  refreshRunAggregate(runId) {
    const run = this.getRunRowOrThrow(runId)
    const tasks = this.getRunTasks(runId)
    const runningCount = tasks.filter((item) => item.status === 'QUERYING' || item.status === 'SYNCING').length
    const successCount = tasks.filter((item) => item.status === 'SUCCEEDED').length
    const failedCount = tasks.filter((item) => item.status === 'FAILED').length
    const syncFailedCount = tasks.filter((item) => classifyRunTaskBucket(item) === 'SYNC_FAILED').length
    const hasQueued = tasks.some((item) => item.status === 'QUEUED')

    let status = run.status
    let endedAt = run.ended_at
    if (runningCount > 0 || hasQueued) {
      status = 'RUNNING'
      endedAt = null
    } else if (failedCount === 0) {
      status = 'SUCCEEDED'
      endedAt = nowIso()
    } else if (successCount > 0) {
      status = 'PARTIAL_FAILED'
      endedAt = nowIso()
    } else {
      status = 'FAILED'
      endedAt = nowIso()
    }

    this.db.prepare(`
      UPDATE batch_runs
      SET status = ?,
          running_count = ?,
          success_count = ?,
          failed_count = ?,
          sync_failed_count = ?,
          ended_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(status, runningCount, successCount, failedCount, syncFailedCount, endedAt, nowIso(), runId)
  }

  getCoverageSummary(batchId) {
    return buildCoverageSummary(this.getCoverageItems(batchId))
  }

  getCoverageItems(batchId) {
    const rows = this.db.prepare(`
      SELECT *
      FROM coverage_items
      WHERE batch_id = ?
    `).all(batchId)

    return rows.map((row) => ({
      id: row.id,
      batchId: row.batch_id,
      snapshotId: row.snapshot_id,
      sheetRow: row.sheet_row,
      nickname: row.nickname,
      contentId: row.content_id,
      status: row.status,
      missingColumns: parseJson(row.missing_columns_json, []),
      binding: parseJson(row.binding_json, {}),
      recommendation: row.recommendation,
      result: parseJson(row.result_json, null),
      updatedAt: row.updated_at
    }))
  }

  getRunTasks(runId) {
    const rows = this.db.prepare(`
      SELECT *
      FROM run_tasks
      WHERE run_id = ?
    `).all(runId)

    return rows.map((row) => ({
      id: row.id,
      runId: row.run_id,
      batchId: row.batch_id,
      coverageItemId: row.coverage_item_id,
      accountId: row.account_id,
      status: row.status,
      resultRef: row.result_ref,
      artifactRefs: parseJson(row.artifact_refs_json, []),
      errorCode: row.error_code,
      errorMessage: row.error_message,
      updatedAt: row.updated_at,
      queryPayload: parseJson(row.query_payload_json, null),
      syncPayload: parseJson(row.sync_payload_json, null)
    }))
  }

  getHistoricalBindings(_batchId) {
    const rows = this.db.prepare(`
      SELECT coverage_items.content_id AS content_id,
             coverage_items.nickname AS nickname,
             run_tasks.account_id AS account_id
      FROM run_tasks
      JOIN coverage_items ON coverage_items.id = run_tasks.coverage_item_id
      WHERE run_tasks.status = 'SUCCEEDED'
      ORDER BY datetime(run_tasks.updated_at) DESC
    `).all()

    const map = new Map()
    for (const row of rows) {
      const contentId = String(row.content_id || '').trim()
      const nicknameKey = normalizeNickname(row.nickname)
      if (contentId && !map.has(contentId)) {
        map.set(contentId, String(row.account_id))
      }
      if (nicknameKey && !map.has(nicknameKey)) {
        map.set(nicknameKey, String(row.account_id))
      }
    }
    return map
  }

  getSuccessfulCoverageIds(batchId) {
    return new Set(
      this.db.prepare(`
        SELECT DISTINCT coverage_item_id
        FROM run_tasks
        WHERE batch_id = ?
          AND status = 'SUCCEEDED'
      `).all(batchId).map((row) => row.coverage_item_id)
    )
  }

  getBoundCoverageCounts() {
    const rows = this.getCoverageItemsAll()
    const map = new Map()
    for (const row of rows) {
      const accountId = String(row.binding?.accountId || '').trim()
      if (!accountId) continue
      map.set(accountId, (map.get(accountId) || 0) + 1)
    }
    return map
  }

  getAccountUsageStats() {
    const summaryRows = this.db.prepare(`
      SELECT run_tasks.account_id AS account_id,
             COUNT(DISTINCT run_tasks.batch_id) AS bound_batch_count,
             MAX(run_tasks.updated_at) AS last_used_at
      FROM run_tasks
      GROUP BY run_tasks.account_id
    `).all()
    const recentRows = this.db.prepare(`
      SELECT tasks.account_id AS account_id,
             tasks.batch_id AS last_batch_id,
             tasks.updated_at AS last_used_at,
             batches.name AS last_batch_name
      FROM run_tasks AS tasks
      JOIN (
        SELECT account_id, MAX(datetime(updated_at)) AS last_used_at
        FROM run_tasks
        GROUP BY account_id
      ) AS latest
        ON latest.account_id = tasks.account_id
       AND datetime(tasks.updated_at) = latest.last_used_at
      JOIN batches ON batches.id = tasks.batch_id
    `).all()
    const recentMap = new Map(recentRows.map((row) => [row.account_id, row]))

    const map = new Map()
    for (const row of summaryRows) {
      const recent = recentMap.get(row.account_id)
      map.set(row.account_id, {
        boundBatchCount: Number(row.bound_batch_count || 0),
        lastUsedAt: recent?.last_used_at || row.last_used_at || null,
        lastBatchId: recent?.last_batch_id || null,
        lastBatchName: recent?.last_batch_name || null
      })
    }
    return map
  }

  getCoverageItemsAll() {
    const rows = this.db.prepare('SELECT * FROM coverage_items').all()
    return rows.map((row) => ({
      binding: parseJson(row.binding_json, {})
    }))
  }

  patchRunTask(taskId, patch) {
    const task = this.getRunTaskOrThrow(taskId)
    const next = {
      ...task,
      ...patch
    }

    this.db.prepare(`
      UPDATE run_tasks
      SET status = ?,
          result_ref = ?,
          artifact_refs_json = ?,
          error_code = ?,
          error_message = ?,
          updated_at = ?,
          query_payload_json = ?,
          sync_payload_json = ?
      WHERE id = ?
    `).run(
      next.status,
      next.resultRef || null,
      JSON.stringify(next.artifactRefs || []),
      next.errorCode || null,
      next.errorMessage || null,
      next.updatedAt || nowIso(),
      next.queryPayload ? JSON.stringify(next.queryPayload) : null,
      next.syncPayload ? JSON.stringify(next.syncPayload) : null,
      taskId
    )
  }

  patchCoverageItem(itemId, patch) {
    const item = this.getCoverageItemOrThrow(itemId)
    const next = {
      ...item,
      ...patch
    }

    this.db.prepare(`
      UPDATE coverage_items
      SET status = ?,
          missing_columns_json = ?,
          binding_json = ?,
          recommendation = ?,
          result_json = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      next.status,
      JSON.stringify(next.missingColumns || []),
      JSON.stringify(next.binding || {}),
      next.recommendation || '',
      next.result ? JSON.stringify(next.result) : null,
      next.updatedAt || nowIso(),
      itemId
    )
  }

  markAccountQuerySuccess(accountId) {
    const asset = this.getAccountAssetOrThrow(accountId)
    this.db.prepare(`
      UPDATE account_assets
      SET status = 'READY',
          health = 'READY',
          last_successful_query_at = ?,
          updated_at = ?
      WHERE id = ?
    `).run(nowIso(), nowIso(), asset.id)
  }

  setBatchBlockers(batchId, blockers) {
    this.db.prepare(`
      UPDATE batches
      SET blockers_json = ?,
          updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(blockers), nowIso(), batchId)
  }

  getAccountAssetOrThrow(accountId) {
    const row = this.db.prepare(`
      SELECT *
      FROM account_assets
      WHERE id = ?
    `).get(accountId)

    if (!row) {
      throw new AppError(404, 'ACCOUNT_NOT_FOUND', '账号不存在')
    }

    return {
      id: row.id,
      nickname: row.nickname,
      status: row.status,
      profileKey: row.profile_key,
      lastLoginAt: row.last_login_at,
      lastSuccessfulQueryAt: row.last_successful_query_at,
      health: row.health,
      boundCoverageCount: row.bound_coverage_count
    }
  }

  getRuleTemplateOrThrow(templateId) {
    const row = this.db.prepare(`
      SELECT *
      FROM rule_templates
      WHERE id = ?
    `).get(templateId)

    if (!row) {
      throw new AppError(404, 'RULE_TEMPLATE_NOT_FOUND', '规则模板不存在')
    }

    return {
      id: row.id,
      name: row.name,
      sourceBatchId: row.source_batch_id,
      sourceRuleSetId: row.source_ruleset_id,
      useCount: row.use_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at,
      rules: parseJson(row.payload_json, buildDefaultRuleSet())
    }
  }

  getBatchRecordOrThrow(batchId) {
    const row = this.db.prepare(`
      SELECT *
      FROM batches
      WHERE id = ?
    `).get(batchId)

    if (!row) {
      throw new AppError(404, 'BATCH_NOT_FOUND', '批次不存在')
    }

    return row
  }

  getCoverageItemOrThrow(itemId, batchId = null) {
    const row = batchId
      ? this.db.prepare(`
        SELECT *
        FROM coverage_items
        WHERE id = ? AND batch_id = ?
      `).get(itemId, batchId)
      : this.db.prepare(`
        SELECT *
        FROM coverage_items
        WHERE id = ?
      `).get(itemId)

    if (!row) {
      throw new AppError(404, 'COVERAGE_ITEM_NOT_FOUND', '覆盖项不存在')
    }

    return {
      id: row.id,
      batchId: row.batch_id,
      snapshotId: row.snapshot_id,
      sheetRow: row.sheet_row,
      nickname: row.nickname,
      contentId: row.content_id,
      status: row.status,
      missingColumns: parseJson(row.missing_columns_json, []),
      binding: parseJson(row.binding_json, {}),
      recommendation: row.recommendation,
      result: parseJson(row.result_json, null),
      updatedAt: row.updated_at
    }
  }

  getRunRowOrThrow(runId) {
    const row = this.db.prepare(`
      SELECT *
      FROM batch_runs
      WHERE id = ?
    `).get(runId)

    if (!row) {
      throw new AppError(404, 'RUN_NOT_FOUND', '批次运行不存在')
    }

    return row
  }

  getRunTaskOrThrow(taskId) {
    const row = this.db.prepare(`
      SELECT *
      FROM run_tasks
      WHERE id = ?
    `).get(taskId)

    if (!row) {
      throw new AppError(404, 'RUN_TASK_NOT_FOUND', '运行任务不存在')
    }

    return {
      id: row.id,
      runId: row.run_id,
      batchId: row.batch_id,
      coverageItemId: row.coverage_item_id,
      accountId: row.account_id,
      status: row.status,
      resultRef: row.result_ref,
      artifactRefs: parseJson(row.artifact_refs_json, []),
      errorCode: row.error_code,
      errorMessage: row.error_message,
      updatedAt: row.updated_at,
      queryPayload: parseJson(row.query_payload_json, null),
      syncPayload: parseJson(row.sync_payload_json, null)
    }
  }
}

function nowIso() {
  return new Date().toISOString()
}

function parseJson(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch (_error) {
    return fallback
  }
}

function normalizeAccountStatus(status) {
  const normalized = String(status || '').trim().toUpperCase()
  if (normalized === 'READY') return 'READY'
  if (normalized === 'EXPIRED') return 'EXPIRED'
  if (normalized === 'COOLING') return 'COOLING'
  return 'LOGIN_REQUIRED'
}

function deriveAccountHealth({ status, lastLoginAt, lastSuccessfulQueryAt }) {
  if (status === 'COOLING') return 'KEEP_ALIVE'
  if (status === 'EXPIRED') return 'RELOGIN'
  if (status !== 'READY') return 'RELOGIN'
  if (!lastSuccessfulQueryAt) return 'COLD'
  const ageMs = Date.now() - new Date(lastSuccessfulQueryAt).getTime()
  if (ageMs > 3 * 24 * 60 * 60 * 1000) return 'KEEP_ALIVE'
  if (lastLoginAt && Date.now() - new Date(lastLoginAt).getTime() > 10 * 24 * 60 * 60 * 1000) return 'KEEP_ALIVE'
  return 'READY'
}

function buildMissingTargetBlockers(target) {
  const blockers = []
  if (!target.docUrl) blockers.push('未填写交接表链接')
  if (!target.sheetName) blockers.push('未填写工作表名称')
  return blockers
}

function buildIntakeBlockers(inspected = {}) {
  const blockers = []
  const headers = Array.isArray(inspected.headers) ? inspected.headers : []
  const missingHeaders = REQUIRED_INTAKE_HEADERS.filter((header) => !headers.includes(header))
  if (missingHeaders.length > 0) {
    blockers.push({
      code: 'HEADER_MISSING',
      message: `缺少必要列：${missingHeaders.join('、')}`
    })
  }
  if ((inspected.rowCount || 0) === 0) {
    blockers.push({
      code: 'ROW_EMPTY',
      message: '当前工作表没有可处理的交接行'
    })
  }
  return blockers
}

function buildCoverageRecommendation(status) {
  switch (status) {
    case 'EXECUTABLE':
      return '可直接进入本批执行'
    case 'MISSING_CONTENT_ID':
      return '先补充内容 ID'
    case 'MISSING_ACCOUNT':
      return '先补足 READY 账号或手动绑定'
    case 'AMBIGUOUS':
      return '先处理歧义账号绑定'
    case 'COMPLETE':
      return '该行已完整，无需执行'
    default:
      return '待处理'
  }
}

function buildCoverageSummary(items = []) {
  return {
    total: items.length,
    executable: items.filter((item) => item.status === 'EXECUTABLE').length,
    missingContentId: items.filter((item) => item.status === 'MISSING_CONTENT_ID').length,
    missingAccount: items.filter((item) => item.status === 'MISSING_ACCOUNT').length,
    ambiguous: items.filter((item) => item.status === 'AMBIGUOUS').length,
    complete: items.filter((item) => item.status === 'COMPLETE').length
  }
}

function buildDefaultRuleSet() {
  return {
    executionScope: 'ALL_EXECUTABLE',
    accountScope: 'READY_ONLY',
    skipPolicies: {
      missingContentId: true,
      missingAccount: true,
      ambiguous: true,
      complete: true
    },
    syncPolicy: 'FILL_EMPTY_ONLY',
    failurePolicy: 'KEEP_FOR_RETRY',
    concurrencyProfile: 'STANDARD',
    selectedItemIds: []
  }
}

function normalizeRuleSet(ruleSet) {
  return {
    executionScope: ruleSet.executionScope || 'ALL_EXECUTABLE',
    accountScope: ruleSet.accountScope || 'READY_ONLY',
    skipPolicies: {
      missingContentId: Boolean(ruleSet.skipPolicies?.missingContentId),
      missingAccount: Boolean(ruleSet.skipPolicies?.missingAccount),
      ambiguous: Boolean(ruleSet.skipPolicies?.ambiguous),
      complete: Boolean(ruleSet.skipPolicies?.complete)
    },
    syncPolicy: ruleSet.syncPolicy || 'FILL_EMPTY_ONLY',
    failurePolicy: ruleSet.failurePolicy || 'KEEP_FOR_RETRY',
    concurrencyProfile: ruleSet.concurrencyProfile || 'STANDARD',
    selectedItemIds: Array.isArray(ruleSet.selectedItemIds) ? ruleSet.selectedItemIds.map((item) => String(item)) : []
  }
}

function selectCoverageForExecution(items, rules, successfulCoverageIds = new Set()) {
  return items.filter((item) => {
    if (item.status !== 'EXECUTABLE') return false
    if (rules.executionScope === 'NEW_EXECUTABLE' && successfulCoverageIds.has(item.id)) return false
    if (rules.executionScope === 'SELECTED_ONLY' && !rules.selectedItemIds.includes(item.id)) return false
    return Boolean(item.binding?.accountId)
  })
}

function sortCoverageItems(items) {
  return [...items].sort((left, right) => {
    const orderDiff = COVERAGE_STATUS_ORDER.indexOf(left.status) - COVERAGE_STATUS_ORDER.indexOf(right.status)
    if (orderDiff !== 0) return orderDiff
    return Number(left.sheetRow || 0) - Number(right.sheetRow || 0)
  })
}

function sortRunTasks(tasks) {
  return [...tasks].sort((left, right) => {
    const leftBucket = classifyRunTaskBucket(left)
    const rightBucket = classifyRunTaskBucket(right)
    const bucketOrder = ['LOGIN_FAILED', 'QUERY_FAILED', 'SYNC_FAILED', 'RUNNING', 'SUCCEEDED']
    const bucketDiff = bucketOrder.indexOf(leftBucket) - bucketOrder.indexOf(rightBucket)
    if (bucketDiff !== 0) return bucketDiff
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  })
}

function summarizeRunBuckets(tasks, coverageItems) {
  const byKey = {
    LOGIN_FAILED: [],
    QUERY_FAILED: [],
    SYNC_FAILED: [],
    BLOCKED: coverageItems.filter((item) => item.status !== 'EXECUTABLE' && item.status !== 'COMPLETE'),
    RUNNING: [],
    SUCCEEDED: []
  }

  for (const task of tasks) {
    const bucket = classifyRunTaskBucket(task)
    byKey[bucket].push(task)
  }

  return [
    { key: 'LOGIN_FAILED', label: '登录失败', count: byKey.LOGIN_FAILED.length },
    { key: 'QUERY_FAILED', label: '查询失败', count: byKey.QUERY_FAILED.length },
    { key: 'SYNC_FAILED', label: '回填失败', count: byKey.SYNC_FAILED.length },
    { key: 'BLOCKED', label: '歧义阻塞', count: byKey.BLOCKED.length },
    { key: 'RUNNING', label: '运行中', count: byKey.RUNNING.length },
    { key: 'SUCCEEDED', label: '已完成', count: byKey.SUCCEEDED.length }
  ]
}

function classifyRunTaskBucket(task) {
  if (task.status === 'QUERYING' || task.status === 'SYNCING' || task.status === 'QUEUED') return 'RUNNING'
  if (task.status === 'SUCCEEDED') return 'SUCCEEDED'
  if (String(task.errorCode || '').includes('LOGIN_REQUIRED')) return 'LOGIN_FAILED'
  if (String(task.errorCode || '').startsWith('ROW_') || String(task.errorCode || '').startsWith('WRITE_') || String(task.errorCode || '').includes('SYNC')) return 'SYNC_FAILED'
  return 'QUERY_FAILED'
}

function matchesRetryBucket(task, bucket) {
  if (!bucket) return task.status === 'FAILED'
  return classifyRunTaskBucket(task) === bucket
}

function resolveConcurrency(profile) {
  switch (profile) {
    case 'SAFE':
      return 1
    case 'AGGRESSIVE':
      return 4
    default:
      return 2
  }
}

function deriveBatchStatus({ blockers, coverageSummary, rules, activeRun, snapshot, accountHealth }) {
  if (activeRun?.status === 'RUNNING' || activeRun?.status === 'QUEUED') return 'RUNNING'
  if (blockers.length > 0) return 'BLOCKED'
  if (!snapshot) return 'DRAFT'
  if ((accountHealth.ready || 0) === 0) return 'BLOCKED'
  if (!rules?.id) return 'DRAFT'
  if (activeRun?.status === 'SUCCEEDED') return 'COMPLETED'
  if (activeRun?.status === 'FAILED' || activeRun?.status === 'PARTIAL_FAILED') return 'NEEDS_ATTENTION'
  if (coverageSummary.ambiguous > 0 || coverageSummary.missingAccount > 0 || coverageSummary.missingContentId > 0) return 'NEEDS_ATTENTION'
  if (coverageSummary.executable > 0) return 'READY'
  return 'DRAFT'
}

function buildPhaseRail({ batchId, snapshot, blockers, coverageSummary, rules, activeRun, accountHealth, history }) {
  const accountReady = (accountHealth.ready || 0) > 0
  const coverageReady = coverageSummary.total > 0
  const runHref = `/batches/${batchId}/run`
  const historyReady = (history?.runs?.length || 0) > 0

  return [
    {
      key: 'intake',
      label: '交接表接入',
      href: `/batches/${batchId}/intake`,
      status: !snapshot ? '未就绪' : (blockers.length > 0 ? '需处理' : '已完成')
    },
    {
      key: 'accounts',
      label: '账号接入',
      href: `/batches/${batchId}/accounts`,
      status: accountReady ? '已完成' : '未就绪'
    },
    {
      key: 'coverage',
      label: '覆盖率生成',
      href: `/batches/${batchId}/coverage`,
      status: !coverageReady
        ? '未就绪'
        : (coverageSummary.executable > 0 ? '可执行' : '需处理')
    },
    {
      key: 'rules',
      label: '规则设定',
      href: `/batches/${batchId}/rules`,
      status: rules?.id ? '已完成' : '未就绪'
    },
    {
      key: 'run',
      label: '运行与回填',
      href: runHref,
      status: activeRun?.status === 'RUNNING' || activeRun?.status === 'QUEUED'
        ? '运行中'
        : (activeRun?.status === 'SUCCEEDED'
          ? '已完成'
          : (activeRun?.status === 'FAILED' || activeRun?.status === 'PARTIAL_FAILED'
            ? '需处理'
            : (rules?.id && coverageSummary.executable > 0 ? '可执行' : '未就绪')))
    },
    {
      key: 'history',
      label: '历史复盘',
      href: `/batches/${batchId}/history`,
      status: historyReady ? '已完成' : '未就绪'
    }
  ]
}

function buildPrimaryCta({ batchId, snapshot, blockers, coverageSummary, rules, activeRun, accountHealth }) {
  if (!snapshot || blockers.length > 0) {
    return { label: '锁定并检查交接表', href: `/batches/${batchId}/intake` }
  }
  if ((accountHealth.ready || 0) === 0) {
    return { label: '新增账号', href: `/batches/${batchId}/accounts` }
  }
  if (coverageSummary.total === 0) {
    return { label: '生成可执行范围', href: `/batches/${batchId}/coverage` }
  }
  if (!rules?.id) {
    return { label: '保存本批规则', href: `/batches/${batchId}/rules` }
  }
  if (!activeRun) {
    return { label: '启动批量执行', href: `/batches/${batchId}/run` }
  }
  if (activeRun.status === 'FAILED' || activeRun.status === 'PARTIAL_FAILED') {
    return {
      label: activeRun.syncFailedCount > 0 && activeRun.failedCount === activeRun.syncFailedCount ? '继续回填' : '补跑失败项',
      href: `/batches/${batchId}/run`
    }
  }
  if (activeRun.status === 'SUCCEEDED') {
    return { label: '重新检查批次', href: `/batches/${batchId}/intake` }
  }
  return { label: '批次运行中', href: `/batches/${batchId}/run`, disabled: true }
}

function normalizeNickname(value) {
  return String(value || '').replace(/\s+/g, '').trim().toLowerCase()
}

function hasCellValue(value) {
  const normalized = String(value ?? '').trim()
  return Boolean(normalized && normalized !== '-' && normalized !== '--')
}

function isCoverageCandidateRow(row = {}) {
  const nickname = String(row.nickname || row.cells?.['逛逛昵称'] || '').trim()
  const contentId = String(row.contentId || row.cells?.['内容id'] || row.cells?.['内容ID'] || '').trim()
  return Boolean(nickname || contentId)
}

function rowIdentity(row) {
  return `${Number(row.sheetRow || 0)}:${String(row.contentId || '').trim()}:${normalizeNickname(row.nickname || row.cells?.['逛逛昵称'] || '')}`
}

function coverageIdentity(item) {
  return `${Number(item.sheetRow || 0)}:${String(item.contentId || '').trim()}:${normalizeNickname(item.nickname)}`
}

function compactStrings(values) {
  return values.filter((item) => typeof item === 'string' && item.trim())
}

function stripRuleMeta(rules = {}) {
  return normalizeRuleSet({
    executionScope: rules.executionScope,
    accountScope: rules.accountScope,
    skipPolicies: rules.skipPolicies,
    syncPolicy: rules.syncPolicy,
    failurePolicy: rules.failurePolicy,
    concurrencyProfile: rules.concurrencyProfile,
    selectedItemIds: rules.selectedItemIds
  })
}

function aggregateHistoryBuckets(runs = []) {
  const counts = {
    LOGIN_FAILED: 0,
    QUERY_FAILED: 0,
    SYNC_FAILED: 0,
    BLOCKED: 0,
    RUNNING: 0,
    SUCCEEDED: 0
  }

  for (const run of runs) {
    for (const bucket of run.bucketCounts || []) {
      counts[bucket.key] = (counts[bucket.key] || 0) + Number(bucket.count || 0)
    }
  }

  return [
    { key: 'LOGIN_FAILED', label: '登录失败', count: counts.LOGIN_FAILED },
    { key: 'QUERY_FAILED', label: '查询失败', count: counts.QUERY_FAILED },
    { key: 'SYNC_FAILED', label: '回填失败', count: counts.SYNC_FAILED },
    { key: 'BLOCKED', label: '覆盖率阻塞', count: counts.BLOCKED },
    { key: 'RUNNING', label: '运行中', count: counts.RUNNING },
    { key: 'SUCCEEDED', label: '已完成', count: counts.SUCCEEDED }
  ]
}

function calculateDurationMs(startedAt, endedAt) {
  if (!startedAt || !endedAt) return 0
  const start = new Date(startedAt).getTime()
  const end = new Date(endedAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
  return end - start
}

function formatBatchName(isoString) {
  return isoString.slice(5, 16).replace('T', ' ')
}

module.exports = { V7WorkspaceService }
