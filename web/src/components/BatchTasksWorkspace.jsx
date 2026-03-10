import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useSSE } from '../hooks/useSSE'
import { TencentDocsHandoffHub } from './TencentDocsHandoffHub'
import { TencentDocsDiagnosticPanel } from './TencentDocsDiagnosticPanel'
import { TaskCard, TaskBuilderModal, TaskDetailAccordion } from './TaskComponents'
import { parseTaskBatchInput } from '../lib/taskBatch'
import {
  formatDateTime,
  formatMetricValue,
  supportsClipboardImage,
  stopPropagation,
  isTaskBusy,
  canRefreshTaskLogin,
  canRetryTaskQuery,
  canDeleteTask,
  canPreviewTaskSync,
  canSyncTask,
  resolveTaskSyncState,
  getTaskSyncDescription,
  formatTaskLoginStatus,
  formatTaskQueryStatus,
  formatTaskSyncStatus,
  getTaskQueryTone,
  getTaskLoginTone,
  getTaskSyncTone,
  getTaskOverallTone,
  getTaskSheetMatchTone,
  formatTaskSheetMatchStatus,
  getTaskSheetMatchDetail,
  getTaskSummary,
  getTaskPrimaryActionLabel,
  normalizeStatusTone,
  getTaskRecommendations,
  TENCENT_DOCS_REQUIRED_HEADERS,
  getMissingTencentDocsHeaders,
  getTencentDocsLoginStatus,
  getTencentDocsSheetStatus,
  createTencentDocsDiagnosticState,
  getTaskPriority,
  isWaitingTask,
  isInProgressTask,
  isExceptionalTask,
  isFinishedTask,
  matchesFilter,
  countNonEmptyLines,
  getWorkspaceHeadline,
  getFilterDescription
} from '../lib/taskFormat'

const METRIC_ORDER = [
  '内容查看次数',
  '内容查看人数',
  '种草成交金额',
  '种草成交人数',
  '商品点击次数'
]

const FILTER_OPTIONS = [
  { value: 'all', label: '全部任务', tone: 'neutral' },
  { value: 'waiting', label: '待扫码', tone: 'info' },
  { value: 'in-progress', label: '进行中', tone: 'warning' },
  { value: 'exception', label: '异常', tone: 'danger' },
  { value: 'finished', label: '已完成', tone: 'success' }
]

export function BatchTasksWorkspace() {
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
  const [toasts, setToasts] = useState([])
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

  const textareaRef = useRef(null)
  const docsLoginPollingRef = useRef(null)

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

  const addToast = useCallback((tone = 'info', message) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 2200)
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

  const runTencentDocsInspect = useCallback(async ({ silent = false, target, maxRows = 200, configOverride, persistResolvedTarget = false } = {}) => {
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
      const payload = await api.inspectTencentDocsSheet({ target: effectiveTarget, maxRows })
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
        await Promise.all([loadTasks(), loadSyncConfig()])
      }
    }

    void boot()

    return () => {
      cancelled = true
      stopDocsLoginPolling()
    }
  }, [loadSyncConfig, loadTasks, stopDocsLoginPolling])

  useSSE('tasks', (nextTasks) => {
    setTasks(nextTasks)
    setLastSyncedAt(new Date().toISOString())
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
      persistResolvedTarget: Boolean(syncConfig.target?.docUrl && !syncConfig.target?.sheetName)
    })
  }, [runTencentDocsInspect, syncConfig.available, syncConfig.defaultTargetConfigured, syncConfig.enabled, syncConfig.loading, syncConfig.target])

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

  const handleRefreshList = async () => {
    const [, nextConfig] = await Promise.all([loadTasks(), loadSyncConfig()])
    if (nextConfig?.enabled && (nextConfig?.defaultTargetConfigured || docsConfigDraft.docUrl)) {
      await runTencentDocsInspect({
        silent: true,
        configOverride: nextConfig,
        target: docsConfigDraft.docUrl ? docsConfigDraft : undefined
      })
    }
    addToast('success', '任务列表已刷新')
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
          persistResolvedTarget: !draftTarget.sheetName
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
    const confirmed = window.confirm(`确认删除任务 ${taskId} 吗？`)
    if (!confirmed) return
    await runTaskAction(taskId, () => api.deleteTask(taskId), '任务已删除')
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
      window.alert('复制失败，请重试或直接下载。')
    } finally {
      setTimeout(() => setCopyingTaskId(null), 2000)
    }
  }, [])

  const handlePreviewTaskSync = useCallback(async (task) => {
    if (!task?.artifacts?.resultUrl) {
      addToast('当前任务缺少结果文件，无法预览回填', 'warning')
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
      addToast('已生成腾讯文档回填预览', 'success')
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
      addToast(nextError.message || '腾讯文档预览失败', 'danger')
    } finally {
      setSyncActionLoading((current) => ({ ...current, [task.taskId]: '' }))
    }
  }, [addToast])

  const handleSyncTask = useCallback(async (task) => {
    if (!task?.artifacts?.resultUrl) {
      addToast('当前任务缺少结果文件，无法同步腾讯文档', 'warning')
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
      await handleRefreshList()
      addToast('腾讯文档已完成回填', 'success')
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
      await handleRefreshList()
      addToast(nextError.message || '腾讯文档同步失败', 'danger')
    } finally {
      setSyncActionLoading((current) => ({ ...current, [task.taskId]: '' }))
    }
  }, [addToast, handleRefreshList])

  const waitingCount = tasks.filter((task) => isWaitingTask(task)).length
  const inProgressCount = tasks.filter((task) => isInProgressTask(task)).length
  const exceptionCount = tasks.filter((task) => isExceptionalTask(task)).length
  const finishedCount = tasks.filter((task) => isFinishedTask(task)).length

  return (
    <section className="tasks-workspace stack-lg">
      <TencentDocsHandoffHub
        syncConfig={syncConfig}
        docsConfigDraft={docsConfigDraft}
        onDraftChange={(patch) => setDocsConfigDraft((current) => ({ ...current, ...patch }))}
        onSaveConfig={handleSaveTencentDocsConfig}
        onInspect={() => runTencentDocsInspect({ target: docsConfigDraft.docUrl ? docsConfigDraft : undefined })}
        docsDiagnostic={docsDiagnostic}
        docsLoginSession={docsLoginSession}
        onStartLogin={handleStartTencentDocsLogin}
        onCreateSheetTasks={handleCreateSheetDemandTasks}
        creatingSheetTasks={creatingSheetTasks}
        demandFilter={demandFilter}
        onDemandFilterChange={setDemandFilter}
        demandSearch={demandSearch}
        onDemandSearchChange={setDemandSearch}
      />

      {(docsDiagnostic.inspected || docsDiagnostic.loading || docsDiagnostic.error || syncConfig.defaultTargetConfigured || docsConfigDraft.docUrl) ? (
        <TencentDocsDiagnosticPanel
          syncConfig={syncConfig}
          diagnostic={docsDiagnostic}
          onInspect={() => runTencentDocsInspect({ target: docsConfigDraft.docUrl ? docsConfigDraft : undefined })}
        />
      ) : null}

      <section className="panel tasks-overview-panel stack-lg">
        <div className="task-overview-header">
          <div className="compact-panel-header">
            <span className="section-eyebrow">主工作区</span>
            <h2>批量任务工作台</h2>
            <p>交接表驱动链路优先；这里保留任务队列、焦点区和手工建任务入口，方便补查和异常兜底。</p>
          </div>

          <div className="tasks-toolbar-actions">
            <button className="primary-btn" type="button" onClick={isBuilderOpen ? handleBuilderClose : handleBuilderOpen}>
              {isBuilderOpen ? '关闭手工建任务' : '手工建任务'}
            </button>
            <button className="secondary-btn" type="button" onClick={handleRefreshList}>
              {loading ? '刷新中...' : '刷新列表'}
            </button>
          </div>
        </div>

        <div className="task-stage-grid">
          <TaskStageCard
            label="全部任务"
            value={tasks.length}
            tone="neutral"
            active={filterKey === 'all'}
            onClick={() => setFilterKey('all')}
          />
          <TaskStageCard
            label="待扫码"
            value={waitingCount}
            tone="info"
            active={filterKey === 'waiting'}
            onClick={() => setFilterKey('waiting')}
          />
          <TaskStageCard
            label="进行中"
            value={inProgressCount}
            tone="warning"
            active={filterKey === 'in-progress'}
            onClick={() => setFilterKey('in-progress')}
          />
          <TaskStageCard
            label="异常"
            value={exceptionCount}
            tone="danger"
            active={filterKey === 'exception'}
            onClick={() => setFilterKey('exception')}
          />
          <TaskStageCard
            label="已完成"
            value={finishedCount}
            tone="success"
            active={filterKey === 'finished'}
            onClick={() => setFilterKey('finished')}
          />
        </div>

        <div className="tasks-overview-footer">
          <div className="task-sync-meta">
            <strong>{getWorkspaceHeadline(tasks, filteredTasks)}</strong>
            <small>{lastSyncedAt ? `自动同步中 · 上次更新 ${formatDateTime(lastSyncedAt)}` : '正在连接任务队列…'}</small>
          </div>

          <div className="tasks-toolbar-filters compact-filters">
            <label className="toolbar-search-field">
              <span>搜索任务</span>
              <input
                type="search"
                placeholder="搜索备注、内容 ID、账号昵称"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
              />
            </label>

            {(filterKey !== 'all' || searchValue) ? (
              <button
                className="secondary-btn"
                type="button"
                onClick={() => {
                  setFilterKey('all')
                  setSearchValue('')
                }}
              >
                查看全部
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="task-board-layout single-column">
        <section className="task-table-panel stack-md">
          <div className="panel-split-header">
            <div className="compact-panel-header">
              <span className="section-eyebrow">筛选区</span>
              <h2>任务过滤器</h2>
              <p>{getFilterDescription(filterKey, FILTER_OPTIONS)}</p>
            </div>
            <span className="section-counter">{filteredTasks.length}/{tasks.length}</span>
          </div>

          {loading && tasks.length === 0 ? (
            <div className="task-loading-shimmer">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="shimmer-row" />
              ))}
            </div>
          ) : null}

          {error && tasks.length === 0 ? (
            <div className="result-empty-state">
              <strong className="status-card-error">加载任务失败</strong>
              <p>{error.message}</p>
              <button className="secondary-btn" type="button" onClick={handleRefreshList}>
                重试加载
              </button>
            </div>
          ) : null}

          {!loading && !error && tasks.length === 0 ? (
            <div className="result-empty-state">
              <strong>当前没有二维码任务</strong>
              <p>可以点击上方的“新建批量任务”来导入需要查询的内容ID。</p>
            </div>
          ) : null}
          {!loading && !error && tasks.length > 0 && filteredTasks.length === 0 ? (
            <div className="result-empty-state">
              <strong>没有匹配当前筛选条件的任务</strong>
              <p>可以切回“查看全部”，或清空搜索关键字后继续查看。</p>
            </div>
          ) : null}

          {!loading && !error && filteredTasks.length > 0 ? (
            <div className="task-queue-list">
              {filteredTasks.map((task, index) => (
                <div key={task.taskId} className="task-accordion-item">
                  <TaskCard
                    task={task}
                    syncConfig={syncConfig}
                    expanded={expandedTaskId === task.taskId}
                    recommended={index === 0 && filterKey === 'waiting'}
                    onToggleExpand={handleToggleExpand}
                    onCopyQr={handleCopyQr}
                    onRefreshLogin={handleRefreshLogin}
                    onSubmitSmsCode={handleSubmitSmsCode}
                    copying={copyingTaskId === task.taskId}
                    busy={Boolean(actionLoading[task.taskId])}
                  />
                  {expandedTaskId === task.taskId ? (
                    <div className="task-accordion-content">
                      <TaskDetailAccordion
                        task={task}
                        busy={Boolean(actionLoading[task.taskId])}
                        copying={copyingTaskId === task.taskId}
                        syncConfig={syncConfig}
                        syncPreview={syncPreviewState[task.taskId] || null}
                        syncAction={syncActionLoading[task.taskId] || ''}
                        onCopyQr={handleCopyQr}
                        onRefreshLogin={handleRefreshLogin}
                        onRetryQuery={handleRetryQuery}
                        onDeleteTask={handleDeleteTask}
                        onPreviewSync={handlePreviewTaskSync}
                        onSyncTask={handleSyncTask}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      {isBuilderOpen ? (
        <TaskBuilderModal
          draftLines={draftLines}
          draftValidation={draftValidation}
          displayBatchErrors={displayBatchErrors}
          batchInput={batchInput}
          submitting={submitting}
          textareaRef={textareaRef}
          serverBatchErrors={serverBatchErrors}
          onClose={handleBuilderClose}
          onChange={(value) => {
            setBatchInput(value)
            if (serverBatchErrors.length > 0) setServerBatchErrors([])
          }}
          onSubmit={handleSubmit}
        />
      ) : null}

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast-card tone-${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </section>
  )
}

function TaskStageCard({ label, value, tone, active, onClick }) {
  return (
    <button className={`task-stage-card tone-${tone} ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  )
}

function compareTasks(left, right) {
  const priorityDiff = getTaskPriority(left) - getTaskPriority(right)
  if (priorityDiff !== 0) return priorityDiff
  const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime()
  const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime()
  return rightTime - leftTime
}


