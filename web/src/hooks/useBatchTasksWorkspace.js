import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useSSE } from './useSSE'
import { useToastQueue } from './useToastQueue'
import { compareTasks } from '../components/batch/TaskBoard'
import { parseTaskBatchInput } from '../lib/taskBatch'
import {
  createTencentDocsDiagnosticState,
  matchesFilter,
  countNonEmptyLines
} from '../lib/taskFormat'

function matchesTencentDocsTarget(left, right) {
  const leftDocUrl = String(left?.docUrl || '').trim()
  const rightDocUrl = String(right?.docUrl || '').trim()
  if (!leftDocUrl || !rightDocUrl || leftDocUrl !== rightDocUrl) return false

  const leftSheetName = String(left?.sheetName || '').trim()
  const rightSheetName = String(right?.sheetName || '').trim()
  if (!leftSheetName || !rightSheetName) return true
  return leftSheetName === rightSheetName
}

function buildDiagnosticDemandSummary(demands = []) {
  return {
    totalRows: demands.length,
    completeRows: demands.filter((item) => item.status === 'COMPLETE').length,
    needsFillRows: demands.filter((item) => item.status === 'NEEDS_FILL').length,
    missingContentIdRows: demands.filter((item) => item.status === 'CONTENT_ID_MISSING').length,
    duplicateNicknameRows: demands.filter((item) => item.status === 'DUPLICATE_NICKNAME').length
  }
}

function patchDemandByWriteSummary(demand, updatedColumns = []) {
  if (!demand) return demand
  if (!['NEEDS_FILL', 'COMPLETE'].includes(String(demand.status || ''))) return demand

  const currentMissingColumns = Array.isArray(demand.missingColumns) ? demand.missingColumns : []
  const nextMissingColumns = currentMissingColumns.filter((columnName) => !updatedColumns.includes(columnName))
  const nextStatus = !String(demand.contentId || '').trim()
    ? 'CONTENT_ID_MISSING'
    : (nextMissingColumns.length === 0 ? 'COMPLETE' : 'NEEDS_FILL')

  if (nextStatus === demand.status && nextMissingColumns.length === currentMissingColumns.length) {
    return demand
  }

  return {
    ...demand,
    missingColumns: nextMissingColumns,
    missingCount: nextMissingColumns.length,
    status: nextStatus
  }
}

function patchTencentDocsDiagnosticState(current, { target, match, writeSummary } = {}) {
  if (!current?.payload || !matchesTencentDocsTarget(current.payload.target, target)) return current

  const sheetRow = Number(match?.sheetRow || writeSummary?.sheetRow || 0)
  const updatedColumns = Array.isArray(writeSummary?.columnsUpdated)
    ? writeSummary.columnsUpdated.map((item) => String(item))
    : []

  if (sheetRow <= 0 || updatedColumns.length === 0) return current

  let changed = false
  const nextDemands = (current.payload.demands || []).map((item) => {
    if (Number(item?.sheetRow || 0) !== sheetRow) return item
    const nextItem = patchDemandByWriteSummary(item, updatedColumns)
    if (nextItem !== item) changed = true
    return nextItem
  })

  if (!changed) return current

  return {
    ...current,
    loading: false,
    inspected: true,
    error: null,
    checkedAt: new Date().toISOString(),
    payload: {
      ...current.payload,
      demands: nextDemands,
      summary: buildDiagnosticDemandSummary(nextDemands)
    }
  }
}

function buildTaskSyncSuccessKey(task) {
  return `${task.taskId}:${task.sync?.operationId || task.updatedAt || task.fetchedAt || ''}`
}

function collectSuccessfulSyncTasks(tasks = [], activeTarget = null) {
  if (!activeTarget?.docUrl) return []
  return tasks
    .filter((task) => task.sync?.status === 'SUCCEEDED')
    .filter((task) => matchesTencentDocsTarget(task.sync?.target || task.sheetTarget, activeTarget))
}

function normalizeNickname(value) {
  return String(value || '').trim().toLowerCase()
}

function buildAccountDemandMatches(accounts = [], demands = []) {
  const demandBuckets = new Map()

  demands.forEach((demand) => {
    const key = normalizeNickname(demand?.normalizedNickname || demand?.nickname)
    if (!key) return
    const current = demandBuckets.get(key) || []
    current.push(demand)
    demandBuckets.set(key, current)
  })

  return accounts
    .map((account) => {
      const key = normalizeNickname(account?.nickname)
      if (!key) return null
      const matches = demandBuckets.get(key) || []
      if (matches.length === 0) return null
      const actionableDemand = matches.find((item) => String(item?.status || '') === 'NEEDS_FILL') || matches[0]
      return {
        account,
        demand: actionableDemand,
        matchCount: matches.length
      }
    })
    .filter(Boolean)
}

export function useBatchTasksWorkspace() {
  const [accounts, setAccounts] = useState([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // For Accordion UI
  const [expandedTaskId, setExpandedTaskId] = useState(null)

  const [submitting, setSubmitting] = useState(false)
  const [batchInput, setBatchInput] = useState('')
  const [serverBatchErrors, setServerBatchErrors] = useState([])
  const [actionLoading, setActionLoading] = useState({})
  const [copyingTaskId, setCopyingTaskId] = useState('')
  const [filterKey, setFilterKey] = useState('all')
  const [searchValue, setSearchValue] = useState('')
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [builderTouched, setBuilderTouched] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState('')
  const [syncConfig, setSyncConfig] = useState({
    loading: true,
    available: true,
    enabled: false,
    defaultTargetConfigured: false,
    defaultSheetName: '',
    defaultWriteMode: 'upsert',
    mode: 'browser',
    target: { docUrl: '', sheetName: '' },
    login: { status: 'IDLE', updatedAt: '', error: null },
    error: ''
  })
  const [docsConfigDraft, setDocsConfigDraft] = useState({ docUrl: '', sheetName: '' })
  const [docsLoginSession, setDocsLoginSession] = useState(null)
  const [demandFilter, setDemandFilter] = useState('open')
  const [demandSearch, setDemandSearch] = useState('')
  const [creatingSheetTasks, setCreatingSheetTasks] = useState(0)
  const [syncPreviewState, setSyncPreviewState] = useState({})
  const [syncActionLoading, setSyncActionLoading] = useState({})
  const [docsDiagnostic, setDocsDiagnostic] = useState(createTencentDocsDiagnosticState())
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false)
  const [matchingAccounts, setMatchingAccounts] = useState(false)
  const [creatingMatchedAccountTasks, setCreatingMatchedAccountTasks] = useState(false)
  const [accountTaskConfirmState, setAccountTaskConfirmState] = useState({ open: false, accounts: [] })
  const [taskDeleteState, setTaskDeleteState] = useState({ open: false, taskId: '', label: '' })
  const { toasts, pushToast: addToast } = useToastQueue()

  const activeTencentDocsTarget = useMemo(
    () => (docsConfigDraft.docUrl ? docsConfigDraft : (syncConfig.target?.docUrl ? syncConfig.target : null)),
    [docsConfigDraft, syncConfig.target]
  )

  const textareaRef = useRef(null)
  const docsLoginPollingRef = useRef(null)
  const successfulSyncKeysRef = useRef(new Set())
  const activeTencentDocsTargetRef = useRef(null)
  const docsDiagnosticRef = useRef(createTencentDocsDiagnosticState())

  const stopDocsLoginPolling = useCallback(() => {
    if (docsLoginPollingRef.current) {
      window.clearInterval(docsLoginPollingRef.current)
      docsLoginPollingRef.current = null
    }
  }, [])

  const loadTasks = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const payload = await api.listTasks()
      const nextTasks = payload.tasks || []
      setTasks(nextTasks)
      setError(null)
      setLastSyncedAt(new Date().toISOString())
      return nextTasks
    } catch (nextError) {
      setError(nextError)
      return []
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const loadAccounts = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setAccountsLoading(true)
    try {
      const payload = await api.listAccounts()
      const nextAccounts = payload.accounts || []
      setAccounts(nextAccounts)
      return nextAccounts
    } catch (nextError) {
      if (!silent) addToast('danger', nextError.message || '账号库读取失败')
      return []
    } finally {
      if (!silent) setAccountsLoading(false)
    }
  }, [])

  const loadSyncConfig = useCallback(async () => {
    try {
      const payload = await api.getTencentDocsConfig()
      const nextConfig = applyTencentDocsConfigPayload(payload)
      setDocsConfigDraft((current) => ({
        docUrl: current.docUrl || nextConfig.target.docUrl || '',
        sheetName: current.sheetName || nextConfig.target.sheetName || ''
      }))
      return nextConfig
    } catch (nextError) {
      const nextConfig = {
        loading: false,
        available: false,
        enabled: false,
        defaultTargetConfigured: false,
        defaultSheetName: '',
        defaultWriteMode: 'upsert',
        mode: 'browser',
        target: { docUrl: '', sheetName: '' },
        login: { status: 'IDLE', updatedAt: '', error: null },
        error: nextError.message || '腾讯文档配置读取失败'
      }
      setSyncConfig(nextConfig)
      return nextConfig
    }
  }, [])

  const applyTencentDocsConfigPayload = useCallback((payload) => {
    const nextConfig = {
      loading: false,
      available: true,
      enabled: Boolean(payload?.enabled),
      defaultTargetConfigured: Boolean(payload?.defaultTargetConfigured),
      defaultSheetName: payload?.defaultSheetName || '',
      defaultWriteMode: payload?.defaultWriteMode || 'upsert',
      mode: payload?.mode || 'browser',
      target: {
        docUrl: payload?.target?.docUrl || '',
        sheetName: payload?.target?.sheetName || ''
      },
      login: {
        status: payload?.login?.status || 'IDLE',
        loginSessionId: payload?.login?.loginSessionId || '',
        qrImageUrl: payload?.login?.qrImageUrl || '',
        updatedAt: payload?.login?.updatedAt || '',
        error: payload?.login?.error || null
      },
      error: ''
    }
    setSyncConfig(nextConfig)
    setDocsLoginSession((current) => {
      const nextSessionId = String(nextConfig.login?.loginSessionId || '')
      if (nextSessionId && ['WAITING_QR', 'WAITING_CONFIRM'].includes(nextConfig.login.status)) {
        return {
          loginSessionId: nextSessionId,
          status: nextConfig.login.status,
          qrImageUrl: nextConfig.login.qrImageUrl || '',
          updatedAt: nextConfig.login.updatedAt || '',
          error: nextConfig.login.error || null
        }
      }
      if (current?.loginSessionId && current.loginSessionId === nextSessionId && nextConfig.login.status === 'LOGGED_IN') {
        return null
      }
      return current && ['WAITING_QR', 'WAITING_CONFIRM'].includes(current.status) ? current : null
    })
    return nextConfig
  }, [])

  const accountDemandMatches = useMemo(
    () => buildAccountDemandMatches(accounts, docsDiagnostic.payload?.demands || []),
    [accounts, docsDiagnostic.payload?.demands]
  )

  const readyAccounts = useMemo(
    () => accounts.filter((account) => String(account?.status || '') === 'READY'),
    [accounts]
  )

  const matchedReadyAccounts = useMemo(
    () => accountDemandMatches.filter(({ account, demand }) => {
      return String(account?.status || '') === 'READY' && String(demand?.status || '') === 'NEEDS_FILL'
    }),
    [accountDemandMatches]
  )

  const applySyncResultToDocsDiagnostic = useCallback((syncResult) => {
    if (!syncResult?.target?.docUrl) return
    setDocsDiagnostic((current) => {
      const nextState = patchTencentDocsDiagnosticState(current, {
        target: syncResult.target,
        match: syncResult.match,
        writeSummary: syncResult.writeSummary
      })
      docsDiagnosticRef.current = nextState
      return nextState
    })
  }, [])
  const persistTencentDocsTarget = useCallback(async (target, { silent = false } = {}) => {
    if (!target?.docUrl || !target?.sheetName) return null
    try {
      const payload = await api.updateTencentDocsConfig(target)
      const nextConfig = applyTencentDocsConfigPayload(payload)
      setDocsConfigDraft({
        docUrl: target.docUrl,
        sheetName: target.sheetName
      })
      if (!silent) addToast('success', `已自动锁定工作表：${target.sheetName}`)
      return nextConfig
    } catch (nextError) {
      if (!silent) addToast('warning', nextError.message || '自动保存工作表失败')
      return null
    }
  }, [applyTencentDocsConfigPayload, addToast])

  const runTencentDocsInspect = useCallback(async ({ silent = false, target, maxRows = 200, configOverride, persistResolvedTarget = false, forceRefresh = false } = {}) => {
    const effectiveConfig = configOverride || syncConfig
    const effectiveTarget = target && target.docUrl ? target : undefined
    if (!effectiveConfig.available) {
      setDocsDiagnostic(createTencentDocsDiagnosticState({
        inspected: true,
        error: {
          code: 'TENCENT_DOCS_UNAVAILABLE',
          message: effectiveConfig.error || '当前服务未接入腾讯文档配置读取',
          details: null
        }
      }))
      if (!silent) addToast('warning', effectiveConfig.error || '当前服务未接入腾讯文档配置读取')
      return null
    }

    if (!effectiveConfig.enabled) {
      setDocsDiagnostic(createTencentDocsDiagnosticState({
        inspected: true,
        error: {
          code: 'TENCENT_DOCS_NOT_CONFIGURED',
          message: '腾讯文档同步未启用，请先设置 TENCENT_DOCS_ENABLED=true',
          details: null
        }
      }))
      if (!silent) addToast('warning', '腾讯文档同步未启用')
      return null
    }

    if (!effectiveConfig.defaultTargetConfigured && !effectiveTarget) {
      setDocsDiagnostic(createTencentDocsDiagnosticState({
        inspected: true,
        error: {
          code: 'TENCENT_DOCS_TARGET_MISSING',
          message: '腾讯文档默认目标未配置，请先设置 docUrl 和 sheetName',
          details: null
        }
      }))
      if (!silent) addToast('warning', '腾讯文档默认目标未配置')
      return null
    }

    setDocsDiagnostic((current) => ({
      ...current,
      loading: true,
      inspected: true,
      error: null
    }))

    try {
      const payload = await api.inspectTencentDocsSheet({ target: effectiveTarget, maxRows, forceRefresh })
      const resolvedTarget = {
        docUrl: effectiveTarget?.docUrl || payload?.target?.docUrl || '',
        sheetName: payload?.target?.sheetName || ''
      }
      setDocsDiagnostic(createTencentDocsDiagnosticState({
        inspected: true,
        payload,
        checkedAt: new Date().toISOString()
      }))
      if (resolvedTarget.sheetName) {
        setDocsConfigDraft((current) => ({
          docUrl: current.docUrl || resolvedTarget.docUrl || '',
          sheetName: current.sheetName || resolvedTarget.sheetName || ''
        }))
      }
      const shouldPersistResolvedTarget = persistResolvedTarget
        && resolvedTarget.docUrl
        && resolvedTarget.sheetName
        && (!effectiveTarget?.sheetName || effectiveTarget.sheetName !== resolvedTarget.sheetName)
      if (shouldPersistResolvedTarget) {
        await persistTencentDocsTarget(resolvedTarget, { silent: true })
      }
      if (!silent) {
        addToast(
          'success',
          resolvedTarget.sheetName && !effectiveTarget?.sheetName
            ? `已识别当前工作表：${resolvedTarget.sheetName}`
            : '腾讯文档检查完成'
        )
      }
      return payload
    } catch (nextError) {
      const errorPayload = {
        code: nextError.code || 'TENCENT_DOCS_INSPECT_FAILED',
        message: nextError.message || '腾讯文档诊断失败',
        details: nextError.details || null
      }
      setDocsDiagnostic(createTencentDocsDiagnosticState({
        inspected: true,
        error: errorPayload,
        checkedAt: new Date().toISOString()
      }))
      if (!silent) addToast('danger', errorPayload.message)
      return null
    }
  }, [persistTencentDocsTarget, addToast, syncConfig])

  const processSuccessfulTaskEvents = useCallback((nextTasks) => {
    const activeTarget = activeTencentDocsTargetRef.current
    if (!activeTarget?.docUrl) {
      successfulSyncKeysRef.current = new Set()
      return
    }

    const succeededTasks = collectSuccessfulSyncTasks(nextTasks, activeTarget)
    const nextSuccessKeys = new Set(succeededTasks.map((task) => buildTaskSyncSuccessKey(task)))
    const newSuccessfulTasks = succeededTasks.filter((task) => !successfulSyncKeysRef.current.has(buildTaskSyncSuccessKey(task)))
    successfulSyncKeysRef.current = nextSuccessKeys

    if (newSuccessfulTasks.length === 0) return

    let nextDiagnostic = docsDiagnosticRef.current
    let patched = false
    newSuccessfulTasks.forEach((task) => {
      const patchedDiagnostic = patchTencentDocsDiagnosticState(nextDiagnostic, {
        target: task.sync?.target || task.sheetTarget,
        match: task.sync?.match || task.sheetMatch,
        writeSummary: task.sync?.writeSummary || null
      })
      if (patchedDiagnostic !== nextDiagnostic) {
        nextDiagnostic = patchedDiagnostic
        patched = true
      }
    })

    if (patched) {
      docsDiagnosticRef.current = nextDiagnostic
      setDocsDiagnostic(nextDiagnostic)
      return
    }

    if (!docsDiagnosticRef.current?.payload) return

    void runTencentDocsInspect({
      silent: true,
      target: activeTarget,
      forceRefresh: false
    }).catch(() => null)
  }, [runTencentDocsInspect])

  const startDocsLoginPolling = useCallback((loginSessionId) => {
    stopDocsLoginPolling()
    docsLoginPollingRef.current = window.setInterval(async () => {
      try {
        const payload = await api.getTencentDocsLoginSession(loginSessionId)
        setDocsLoginSession(payload)
        if (['LOGGED_IN', 'EXPIRED', 'FAILED'].includes(payload.status)) {
          stopDocsLoginPolling()
          await loadSyncConfig()
          if (payload.status === 'LOGGED_IN') {
            addToast('success', '腾讯文档已登录，可继续检查交接表')
            void runTencentDocsInspect({ silent: true, target: docsConfigDraft.docUrl ? docsConfigDraft : undefined })
          }
        }
      } catch (_error) {
        stopDocsLoginPolling()
      }
    }, 2000)
  }, [docsConfigDraft, loadSyncConfig, addToast, runTencentDocsInspect, stopDocsLoginPolling])

  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      if (!cancelled) {
        await Promise.all([loadTasks(), loadSyncConfig(), loadAccounts()])
      }
    }

    void boot()

    return () => {
      cancelled = true
      stopDocsLoginPolling()
    }
  }, [loadAccounts, loadSyncConfig, loadTasks, stopDocsLoginPolling])

  useEffect(() => {
    activeTencentDocsTargetRef.current = activeTencentDocsTarget
  }, [activeTencentDocsTarget])

  useEffect(() => {
    docsDiagnosticRef.current = docsDiagnostic
  }, [docsDiagnostic])

  useEffect(() => {
    successfulSyncKeysRef.current = new Set(
      collectSuccessfulSyncTasks(tasks, activeTencentDocsTarget).map((task) => buildTaskSyncSuccessKey(task))
    )
  }, [activeTencentDocsTarget, tasks])

  useSSE('tasks', (nextTasks) => {
    processSuccessfulTaskEvents(nextTasks)
    setTasks(nextTasks)
    setLastSyncedAt(new Date().toISOString())
  })

  useSSE('accounts', (nextAccounts) => {
    setAccounts(nextAccounts)
  })


  useEffect(() => {
    if (!docsLoginSession?.loginSessionId) return undefined
    if (!['WAITING_QR', 'WAITING_CONFIRM'].includes(docsLoginSession.status)) return undefined
    startDocsLoginPolling(docsLoginSession.loginSessionId)
    return undefined
  }, [docsLoginSession?.loginSessionId, docsLoginSession?.status, startDocsLoginPolling])

  useEffect(() => {
    if (syncConfig.loading) return
    if (!syncConfig.available || !syncConfig.enabled) {
      setDocsDiagnostic(createTencentDocsDiagnosticState())
      return
    }

    if (!syncConfig.target?.docUrl && !syncConfig.defaultTargetConfigured) {
      setDocsDiagnostic(createTencentDocsDiagnosticState())
      return
    }

    void runTencentDocsInspect({
      silent: true,
      target: syncConfig.target?.docUrl ? syncConfig.target : undefined,
      persistResolvedTarget: Boolean(syncConfig.target?.docUrl && !syncConfig.target?.sheetName),
      forceRefresh: false
    })
  }, [runTencentDocsInspect, syncConfig.available, syncConfig.defaultTargetConfigured, syncConfig.enabled, syncConfig.loading, syncConfig.target])

  useEffect(() => {
    if (docsDiagnostic.error) {
      setIsDiagnosticsOpen(true)
    }
  }, [docsDiagnostic.error])

  useEffect(() => {
    if (builderTouched) return
    setIsBuilderOpen(false)
  }, [builderTouched, tasks.length])

  useEffect(() => {
    if (!isBuilderOpen) return undefined
    const rafId = window.requestAnimationFrame(() => {
      textareaRef.current?.focus()
    })
    return () => window.cancelAnimationFrame?.(rafId)
  }, [isBuilderOpen])

  useEffect(() => {
    if (!isBuilderOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsBuilderOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isBuilderOpen])

  const draftValidation = useMemo(() => parseTaskBatchInput(batchInput), [batchInput])
  const draftLines = useMemo(() => countNonEmptyLines(batchInput), [batchInput])
  const displayBatchErrors = serverBatchErrors.length > 0
    ? serverBatchErrors
    : batchInput.trim()
      ? draftValidation.errors
      : []

  const filteredTasks = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase()
    return [...tasks]
      .filter((task) => matchesFilter(task, filterKey))
      .filter((task) => {
        if (!keyword) return true
        return [task.remark, task.contentId, task.accountNickname, task.accountId, task.sheetMatch?.nickname, task.sheetMatch?.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      })
      .sort(compareTasks)
  }, [filterKey, searchValue, tasks])

  const expandedTask = useMemo(
    () => tasks.find((t) => t.taskId === expandedTaskId) || null,
    [tasks, expandedTaskId]
  )

  const handleToggleExpand = useCallback((taskId) => {
    setExpandedTaskId((current) => (current === taskId ? null : taskId))
  }, [])

  const handleRefreshList = async ({ inspectAfterRefresh = true, inspectForceRefresh = true, toast = true, reloadConfig = true } = {}) => {
    const [, nextConfig] = await Promise.all([loadTasks(), reloadConfig ? loadSyncConfig() : Promise.resolve(syncConfig)])
    if (inspectAfterRefresh && nextConfig?.enabled && (nextConfig?.defaultTargetConfigured || docsConfigDraft.docUrl)) {
      await runTencentDocsInspect({
        silent: true,
        configOverride: nextConfig,
        target: docsConfigDraft.docUrl ? docsConfigDraft : undefined,
        forceRefresh: inspectForceRefresh
      })
    }
    if (toast) addToast('success', '任务列表已刷新')
  }

  const handleSaveTencentDocsConfig = async () => {
    const draftTarget = {
      docUrl: String(docsConfigDraft.docUrl || '').trim(),
      sheetName: String(docsConfigDraft.sheetName || '').trim()
    }

    try {
      const payload = await api.updateTencentDocsConfig(draftTarget)
      const nextConfig = applyTencentDocsConfigPayload(payload)
      setDocsConfigDraft({
        docUrl: draftTarget.docUrl || nextConfig.target.docUrl || '',
        sheetName: draftTarget.sheetName || nextConfig.target.sheetName || ''
      })
      addToast('success', '腾讯文档目标已保存')
      if (draftTarget.docUrl) {
        await runTencentDocsInspect({
          target: draftTarget,
          configOverride: nextConfig,
          persistResolvedTarget: !draftTarget.sheetName,
          forceRefresh: true
        })
      }
    } catch (nextError) {
      addToast('danger', nextError.message || '保存腾讯文档目标失败')
    }
  }

  const handleStartTencentDocsLogin = async () => {
    try {
      stopDocsLoginPolling()
      const payload = await api.createTencentDocsLoginSession({
        target: docsConfigDraft.docUrl ? docsConfigDraft : undefined
      })
      setDocsLoginSession(payload)
      startDocsLoginPolling(payload.loginSessionId)
      addToast('success', '腾讯文档登录二维码已生成')
    } catch (nextError) {
      addToast('danger', nextError.message || '生成腾讯文档二维码失败')
    }
  }

  const handleCreateSheetDemandTasks = async (count) => {
    setCreatingSheetTasks(count)
    try {
      const payload = await api.createSheetDemandTaskBatch(count)
      const createdCount = payload?.tasks?.length || count
      await loadTasks({ silent: true })
      addToast('success', `已生成 ${createdCount} 个交接表扫码任务`)
    } catch (nextError) {
      addToast('danger', nextError.message || '生成交接表扫码任务失败')
    } finally {
      setCreatingSheetTasks(0)
    }
  }

  const handleMatchAccountsToDemands = async () => {
    const hasConfiguredTarget = Boolean(docsConfigDraft.docUrl || syncConfig.target?.docUrl)
    if (!hasConfiguredTarget) {
      addToast('warning', '请先保存并检查腾讯文档目标，再匹配账号库')
      return
    }

    setMatchingAccounts(true)
    try {
      const [nextAccounts, payload] = await Promise.all([
        loadAccounts({ silent: true }),
        runTencentDocsInspect({
          target: docsConfigDraft.docUrl ? docsConfigDraft : undefined,
          forceRefresh: true
        })
      ])

      if (!payload) return

      const nextMatches = buildAccountDemandMatches(nextAccounts, payload.demands || [])
      const nextReadyMatches = nextMatches.filter(({ account, demand }) => {
        return String(account?.status || '') === 'READY' && String(demand?.status || '') === 'NEEDS_FILL'
      })

      if (nextReadyMatches.length > 0) {
        addToast('success', `已匹配 ${nextReadyMatches.length} 个可直接创建任务的账号`)
        return
      }

      if (nextMatches.length > 0) {
        addToast('info', `已匹配 ${nextMatches.length} 个账号，但当前没有 READY 且待补数的可执行组合`)
        return
      }

      addToast('warning', '账号库中没有命中当前交接表需求的账号')
    } finally {
      setMatchingAccounts(false)
    }
  }

  const handleOpenCreateTasksFromAccounts = () => {
    if (!docsDiagnostic.payload?.demands?.length) {
      addToast('warning', '请先检查交接表并完成账号库匹配')
      return
    }

    if (matchedReadyAccounts.length === 0) {
      addToast('warning', '当前没有可直接下发的账号')
      return
    }

    setAccountTaskConfirmState({
      open: true,
      accounts: matchedReadyAccounts.map(({ account }) => account)
    })
  }

  const handleBuilderOpen = () => {
    setBuilderTouched(true)
    setIsBuilderOpen(true)
  }

  const handleBuilderClose = () => {
    setBuilderTouched(true)
    setIsBuilderOpen(false)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setServerBatchErrors([])

    if (draftValidation.errors.length > 0) {
      addToast('warning', '请先修正批量任务输入中的错误行')
      return
    }

    setSubmitting(true)
    try {
      await api.createTaskBatch(draftValidation.tasks)
      setBatchInput('')
      await loadTasks({ silent: true })
      addToast('success', `已创建 ${draftValidation.tasks.length} 条二维码任务`)
      setBuilderTouched(true)
      setIsBuilderOpen(false)
    } catch (nextError) {
      const items = nextError.details?.items || []
      if (items.length > 0) {
        setServerBatchErrors(items.map((item) => ({ line: Number(item.index) + 1, message: item.message })))
      } else {
        setServerBatchErrors([{ line: 0, message: nextError.message }])
      }
      addToast('danger', nextError.message || '批量创建失败')
    } finally {
      setSubmitting(false)
    }
  }

  const runTaskAction = async (taskId, action, successMessage) => {
    setActionLoading((current) => ({ ...current, [taskId]: true }))
    try {
      await action()
      await loadTasks({ silent: true })
      if (successMessage) addToast('success', successMessage)
    } catch (nextError) {
      addToast('danger', nextError.message || '任务操作失败')
    } finally {
      setActionLoading((current) => ({ ...current, [taskId]: false }))
    }
  }

  const handleRefreshLogin = async (taskId) => {
    await runTaskAction(taskId, () => api.refreshTaskLogin(taskId), '二维码已刷新')
  }

  const handleSubmitSmsCode = async (taskId, code) => {
    await runTaskAction(taskId, () => api.submitTaskSmsCode(taskId, code), '验证码提交成功')
  }

  const handleRetryQuery = async (taskId) => {
    await runTaskAction(taskId, () => api.retryTaskQuery(taskId), '任务已重新加入查询队列')
  }

  const handleDeleteTask = async (taskId) => {
    const targetTask = tasks.find((task) => task.taskId === taskId)
    setTaskDeleteState({
      open: true,
      taskId,
      label: targetTask?.remark || targetTask?.contentId || taskId
    })
  }

  const handleCopyQr = useCallback(async (task) => {
    if (!task.qrImageUrl) return
    setCopyingTaskId(task.taskId)
    try {
      const response = await fetch(task.qrImageUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new window.ClipboardItem({ [blob.type]: blob })
      ])
      console.log('二维码已复制到剪贴板')
    } catch (e) {
      addToast('danger', '复制失败，请重试或直接下载。')
    } finally {
      setTimeout(() => setCopyingTaskId(null), 2000)
    }
  }, [addToast])

  const handlePreviewTaskSync = useCallback(async (task) => {
    if (!task?.artifacts?.resultUrl) {
      addToast('warning', '当前任务缺少结果文件，无法预览回填')
      return
    }

    setSyncActionLoading((current) => ({ ...current, [task.taskId]: 'preview' }))
    setSyncPreviewState((current) => ({
      ...current,
      [task.taskId]: {
        ...(current[task.taskId] || {}),
        loading: true,
        error: null
      }
    }))

    try {
      const payload = await api.previewTencentDocsHandoff({
        resultUrl: task.artifacts.resultUrl,
        target: task.taskMode === 'SHEET_DEMAND' ? task.sheetTarget : undefined,
        match: task.taskMode === 'SHEET_DEMAND' && task.sheetMatch?.sheetRow
          ? {
            sheetRow: task.sheetMatch.sheetRow,
            nickname: task.sheetMatch.nickname,
            contentId: task.sheetMatch.contentId
          }
          : undefined
      })
      setSyncPreviewState((current) => ({
        ...current,
        [task.taskId]: {
          loading: false,
          error: null,
          data: payload
        }
      }))
      addToast('success', '已生成腾讯文档回填预览')
    } catch (nextError) {
      setSyncPreviewState((current) => ({
        ...current,
        [task.taskId]: {
          loading: false,
          data: current[task.taskId]?.data || null,
          error: {
            code: nextError.code || 'TENCENT_DOCS_PREVIEW_FAILED',
            message: nextError.message || '腾讯文档预览失败',
            details: nextError.details || null
          }
        }
      }))
      addToast('danger', nextError.message || '腾讯文档预览失败')
    } finally {
      setSyncActionLoading((current) => ({ ...current, [task.taskId]: '' }))
    }
  }, [addToast])

  const handleSyncTask = useCallback(async (task) => {
    if (!task?.artifacts?.resultUrl) {
      addToast('warning', '当前任务缺少结果文件，无法同步腾讯文档')
      return
    }

    setSyncActionLoading((current) => ({ ...current, [task.taskId]: 'sync' }))
    try {
      const payload = await api.syncTencentDocsHandoff({
        taskId: task.taskId,
        resultUrl: task.artifacts.resultUrl,
        target: task.taskMode === 'SHEET_DEMAND' ? task.sheetTarget : undefined,
        match: task.taskMode === 'SHEET_DEMAND' && task.sheetMatch?.sheetRow
          ? {
            sheetRow: task.sheetMatch.sheetRow,
            nickname: task.sheetMatch.nickname,
            contentId: task.sheetMatch.contentId
          }
          : undefined
      })
      setSyncPreviewState((current) => ({
        ...current,
        [task.taskId]: {
          loading: false,
          error: null,
          data: payload
        }
      }))
      if (payload?.operationId) {
        successfulSyncKeysRef.current = new Set([...successfulSyncKeysRef.current, `${task.taskId}:${payload.operationId}`])
      }
      applySyncResultToDocsDiagnostic(payload)
      await handleRefreshList({ inspectAfterRefresh: false, toast: false, reloadConfig: false })
      if (payload?.target?.docUrl) {
        await runTencentDocsInspect({
          silent: true,
          target: payload.target,
          forceRefresh: false
        }).catch(() => null)
      }
      addToast('success', '腾讯文档已完成回填')
    } catch (nextError) {
      setSyncPreviewState((current) => ({
        ...current,
        [task.taskId]: {
          loading: false,
          data: current[task.taskId]?.data || null,
          error: {
            code: nextError.code || 'TENCENT_DOCS_SYNC_FAILED',
            message: nextError.message || '腾讯文档同步失败',
            details: nextError.details || null
          }
        }
      }))
      await handleRefreshList({ inspectAfterRefresh: false, toast: false, reloadConfig: false })
      addToast('danger', nextError.message || '腾讯文档同步失败')
    } finally {
      setSyncActionLoading((current) => ({ ...current, [task.taskId]: '' }))
    }
  }, [addToast, applySyncResultToDocsDiagnostic, handleRefreshList, runTencentDocsInspect])

  const pendingDemandCount = Number(docsDiagnostic.payload?.summary?.needsFillRows || 0)
  const docsLoginStatus = docsLoginSession?.status || syncConfig.login?.status || 'IDLE'
  const docsLoginUpdatedAt = docsLoginSession?.updatedAt || syncConfig.login?.updatedAt || ''
  const waitingTaskCount = filteredTasks.filter((task) => task.login?.status === 'WAITING_QR' || task.login?.status === 'WAITING_CONFIRM').length
  const exceptionTaskCount = filteredTasks.filter((task) => {
    return String(task.query?.status) === 'FAILED'
      || String(task.sync?.status) === 'FAILED'
      || ['FAILED', 'EXPIRED', 'INTERRUPTED'].includes(String(task.login?.status))
  }).length
  const shouldShowDiagnostics = docsDiagnostic.inspected
    || docsDiagnostic.loading
    || docsDiagnostic.error
    || syncConfig.defaultTargetConfigured
    || docsConfigDraft.docUrl

  const handleClearTaskFilters = useCallback(() => {
    setFilterKey('all')
    setSearchValue('')
  }, [])

  const handleConfirmDeleteTask = async () => {
    if (!taskDeleteState.taskId) return
    const taskId = taskDeleteState.taskId
    setTaskDeleteState({ open: false, taskId: '', label: '' })
    await runTaskAction(taskId, () => api.deleteTask(taskId), '任务已删除')
  }

  const handleConfirmCreateTasksFromAccounts = async () => {
    if (accountTaskConfirmState.accounts.length === 0) {
      setAccountTaskConfirmState({ open: false, accounts: [] })
      return
    }

    const sheetTarget = {
      docUrl: docsConfigDraft.docUrl || syncConfig.target?.docUrl || docsDiagnostic.payload?.target?.docUrl || '',
      sheetName: docsConfigDraft.sheetName || syncConfig.target?.sheetName || docsDiagnostic.payload?.target?.sheetName || ''
    }

    if (!sheetTarget.docUrl || !sheetTarget.sheetName) {
      addToast('warning', '请先锁定腾讯文档目标工作表，再创建匹配账号任务')
      setAccountTaskConfirmState({ open: false, accounts: [] })
      return
    }

    setCreatingMatchedAccountTasks(true)
    try {
      await api.createSheetDemandTaskFromAccounts({
        accountIds: accountTaskConfirmState.accounts.map((account) => account.accountId),
        sheetTarget
      })
      setAccountTaskConfirmState({ open: false, accounts: [] })
      await loadTasks({ silent: true })
      addToast('success', `已为 ${matchedReadyAccounts.length} 个匹配账号创建批量任务`)
    } catch (nextError) {
      addToast('danger', nextError.message || '从账号库创建批量任务失败')
    } finally {
      setCreatingMatchedAccountTasks(false)
    }
  }
  const handleDocsDraftChange = useCallback((patch) => {
    setDocsConfigDraft((current) => ({ ...current, ...patch }))
  }, [])

  const handleInspectTencentDocs = useCallback(() => {
    return runTencentDocsInspect({
      target: docsConfigDraft.docUrl ? docsConfigDraft : undefined,
      forceRefresh: true
    })
  }, [docsConfigDraft, runTencentDocsInspect])

  const handleToggleDiagnostics = useCallback(() => {
    setIsDiagnosticsOpen((current) => !current)
  }, [])

  const handleBatchInputChange = useCallback((value) => {
    setBuilderTouched(true)
    setBatchInput(value)
    if (serverBatchErrors.length > 0) setServerBatchErrors([])
  }, [serverBatchErrors.length])

  return {
    accounts,
    accountsLoading,
    tasks,
    filteredTasks,
    loading,
    error,
    expandedTaskId,
    submitting,
    batchInput,
    serverBatchErrors,
    actionLoading,
    copyingTaskId,
    filterKey,
    searchValue,
    isBuilderOpen,
    toasts,
    lastSyncedAt,
    syncConfig,
    docsConfigDraft,
    docsLoginSession,
    demandFilter,
    demandSearch,
    creatingSheetTasks,
    syncPreviewState,
    syncActionLoading,
    docsDiagnostic,
    isDiagnosticsOpen,
    matchingAccounts,
    creatingMatchedAccountTasks,
    accountTaskConfirmState,
    taskDeleteState,
    activeTencentDocsTarget,
    readyAccounts,
    accountDemandMatches,
    matchedReadyAccounts,
    draftValidation,
    draftLines,
    displayBatchErrors,
    textareaRef,
    pendingDemandCount,
    docsLoginStatus,
    docsLoginUpdatedAt,
    waitingTaskCount,
    exceptionTaskCount,
    shouldShowDiagnostics,
    setFilterKey,
    setSearchValue,
    setDemandFilter,
    setDemandSearch,
    setAccountTaskConfirmState,
    setTaskDeleteState,
    handleToggleExpand,
    handleRefreshList,
    handleSaveTencentDocsConfig,
    handleStartTencentDocsLogin,
    handleCreateSheetDemandTasks,
    handleMatchAccountsToDemands,
    handleOpenCreateTasksFromAccounts,
    handleBuilderOpen,
    handleBuilderClose,
    handleBatchInputChange,
    handleSubmit,
    handleCopyQr,
    handleRefreshLogin,
    handleSubmitSmsCode,
    handleRetryQuery,
    handleDeleteTask,
    handlePreviewTaskSync,
    handleSyncTask,
    handleClearTaskFilters,
    handleConfirmDeleteTask,
    handleConfirmCreateTasksFromAccounts,
    handleDocsDraftChange,
    handleInspectTencentDocs,
    handleToggleDiagnostics
  }
}
