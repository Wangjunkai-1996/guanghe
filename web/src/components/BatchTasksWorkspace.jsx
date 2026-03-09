import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { TencentDocsHandoffHub } from './TencentDocsHandoffHub'
import { parseTaskBatchInput } from '../lib/taskBatch'
import {
  formatDateTime,
  formatMetricValue,
  formatTaskLoginStatus,
  formatTaskQueryStatus,
  formatTaskSyncStatus,
  getTaskQueryTone,
  getTaskSyncTone,
  resolveTaskSyncState
} from '../lib/ui'

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

const TENCENT_DOCS_REQUIRED_HEADERS = [
  '内容id',
  '查看次数截图',
  '查看次数',
  '查看人数',
  '种草成交金额',
  '种草成交人数',
  '商品点击次数'
]

export function BatchTasksWorkspace() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [batchInput, setBatchInput] = useState('')
  const [serverBatchErrors, setServerBatchErrors] = useState([])
  const [actionLoading, setActionLoading] = useState({})
  const [copyingTaskId, setCopyingTaskId] = useState('')
  const [filterKey, setFilterKey] = useState('all')
  const [searchValue, setSearchValue] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [isDetailOpen, setIsDetailOpen] = useState(false)
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
      setError('')
      setLastSyncedAt(new Date().toISOString())
      return nextTasks
    } catch (nextError) {
      setError(nextError.message)
      return []
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const loadSyncConfig = useCallback(async () => {
    try {
      const payload = await api.getTencentDocsConfig()
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
          updatedAt: payload?.login?.updatedAt || '',
          error: payload?.login?.error || null
        },
        error: ''
      }
      setSyncConfig(nextConfig)
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

  const pushToast = useCallback((message, tone = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 2200)
  }, [])

  const runTencentDocsInspect = useCallback(async ({ silent = false, target, maxRows = 200, configOverride } = {}) => {
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
      if (!silent) pushToast(effectiveConfig.error || '当前服务未接入腾讯文档配置读取', 'warning')
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
      if (!silent) pushToast('腾讯文档同步未启用', 'warning')
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
      if (!silent) pushToast('腾讯文档默认目标未配置', 'warning')
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
      setDocsDiagnostic(createTencentDocsDiagnosticState({
        inspected: true,
        payload,
        checkedAt: new Date().toISOString()
      }))
      if (payload?.target?.sheetName) {
        setDocsConfigDraft((current) => ({
          docUrl: current.docUrl || payload.target.docUrl || '',
          sheetName: current.sheetName || payload.target.sheetName || ''
        }))
      }
      if (!silent) pushToast('腾讯文档检查完成', 'success')
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
      if (!silent) pushToast(errorPayload.message, 'danger')
      return null
    }
  }, [pushToast, syncConfig])

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
            pushToast('腾讯文档已登录，可继续检查交接表', 'success')
            void runTencentDocsInspect({ silent: true, target: docsConfigDraft.docUrl ? docsConfigDraft : undefined })
          }
        }
      } catch (_error) {
        stopDocsLoginPolling()
      }
    }, 2000)
  }, [docsConfigDraft, loadSyncConfig, pushToast, runTencentDocsInspect, stopDocsLoginPolling])

  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      if (!cancelled) {
        await Promise.all([loadTasks(), loadSyncConfig()])
      }
    }

    void boot()
    const timer = window.setInterval(() => {
      if (!cancelled) {
        void loadTasks({ silent: true })
      }
    }, 2000)

    return () => {
      cancelled = true
      stopDocsLoginPolling()
      window.clearInterval(timer)
    }
  }, [loadSyncConfig, loadTasks, stopDocsLoginPolling])

  useEffect(() => {
    if (syncConfig.loading) return
    if (!syncConfig.available || !syncConfig.enabled || !syncConfig.defaultTargetConfigured) {
      setDocsDiagnostic(createTencentDocsDiagnosticState())
      return
    }
    void runTencentDocsInspect({ silent: true })
  }, [runTencentDocsInspect, syncConfig.available, syncConfig.defaultTargetConfigured, syncConfig.enabled, syncConfig.loading])

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

  const selectedTask = useMemo(
    () => filteredTasks.find((task) => task.taskId === selectedTaskId) || null,
    [filteredTasks, selectedTaskId]
  )

  const selectedTaskIndex = useMemo(
    () => filteredTasks.findIndex((task) => task.taskId === selectedTaskId),
    [filteredTasks, selectedTaskId]
  )

  useEffect(() => {
    if (filteredTasks.length === 0) {
      setSelectedTaskId('')
      setIsDetailOpen(false)
      return
    }

    if (selectedTaskId && filteredTasks.some((task) => task.taskId === selectedTaskId)) {
      return
    }

    setSelectedTaskId(filteredTasks[0].taskId)
    setIsDetailOpen(true)
  }, [filteredTasks, selectedTaskId])

  const handleRefreshList = async () => {
    const [, nextConfig] = await Promise.all([loadTasks(), loadSyncConfig()])
    if (nextConfig?.enabled && (nextConfig?.defaultTargetConfigured || docsConfigDraft.docUrl)) {
      await runTencentDocsInspect({
        silent: true,
        configOverride: nextConfig,
        target: docsConfigDraft.docUrl ? docsConfigDraft : undefined
      })
    }
    pushToast('任务列表已刷新', 'success')
  }

  const handleSaveTencentDocsConfig = async () => {
    try {
      const payload = await api.updateTencentDocsConfig(docsConfigDraft)
      const nextConfig = {
        loading: false,
        available: true,
        enabled: Boolean(payload?.enabled),
        defaultTargetConfigured: Boolean(payload?.defaultTargetConfigured),
        defaultSheetName: payload?.defaultSheetName || '',
        defaultWriteMode: payload?.defaultWriteMode || 'upsert',
        mode: payload?.mode || 'browser',
        target: payload?.target || { docUrl: '', sheetName: '' },
        login: payload?.login || { status: 'IDLE', updatedAt: '', error: null },
        error: ''
      }
      setSyncConfig(nextConfig)
      setDocsConfigDraft(nextConfig.target)
      pushToast('腾讯文档目标已保存', 'success')
      if (docsConfigDraft.docUrl) {
        await runTencentDocsInspect({ target: docsConfigDraft })
      }
    } catch (nextError) {
      pushToast(nextError.message || '保存腾讯文档目标失败', 'danger')
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
      pushToast('腾讯文档登录二维码已生成', 'success')
    } catch (nextError) {
      pushToast(nextError.message || '生成腾讯文档二维码失败', 'danger')
    }
  }

  const handleCreateSheetDemandTasks = async (count) => {
    setCreatingSheetTasks(count)
    try {
      const payload = await api.createSheetDemandTaskBatch(count)
      const createdCount = payload?.tasks?.length || count
      await loadTasks({ silent: true })
      pushToast(`已生成 ${createdCount} 个交接表扫码任务`, 'success')
    } catch (nextError) {
      pushToast(nextError.message || '生成交接表扫码任务失败', 'danger')
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
      pushToast('请先修正批量任务输入中的错误行', 'warning')
      return
    }

    setSubmitting(true)
    try {
      await api.createTaskBatch(draftValidation.tasks)
      setBatchInput('')
      await loadTasks({ silent: true })
      pushToast(`已创建 ${draftValidation.tasks.length} 条二维码任务`, 'success')
      setBuilderTouched(true)
      setIsBuilderOpen(false)
    } catch (nextError) {
      const items = nextError.details?.items || []
      if (items.length > 0) {
        setServerBatchErrors(items.map((item) => ({ line: Number(item.index) + 1, message: item.message })))
      } else {
        setServerBatchErrors([{ line: 0, message: nextError.message }])
      }
      pushToast(nextError.message || '批量创建失败', 'danger')
    } finally {
      setSubmitting(false)
    }
  }

  const runTaskAction = async (taskId, action, successMessage) => {
    setActionLoading((current) => ({ ...current, [taskId]: true }))
    try {
      await action()
      await loadTasks({ silent: true })
      if (successMessage) pushToast(successMessage, 'success')
    } catch (nextError) {
      pushToast(nextError.message || '任务操作失败', 'danger')
    } finally {
      setActionLoading((current) => ({ ...current, [taskId]: false }))
    }
  }

  const handleRefreshLogin = async (taskId) => {
    await runTaskAction(taskId, () => api.refreshTaskLogin(taskId), '二维码已刷新')
  }

  const handleRetryQuery = async (taskId) => {
    await runTaskAction(taskId, () => api.retryTaskQuery(taskId), '任务已重新加入查询队列')
  }

  const handleDeleteTask = async (taskId) => {
    const confirmed = window.confirm(`确认删除任务 ${taskId} 吗？`)
    if (!confirmed) return
    await runTaskAction(taskId, () => api.deleteTask(taskId), '任务已删除')
  }

  const handleCopyQr = async (task) => {
    if (!task.qrImageUrl || !supportsClipboardImage()) return
    setCopyingTaskId(task.taskId)
    try {
      const response = await fetch(task.qrImageUrl, { credentials: 'include' })
      const blob = await response.blob()
      const item = new window.ClipboardItem({ [blob.type || 'image/png']: blob })
      await navigator.clipboard.write([item])
      pushToast('二维码图片已复制', 'success')
    } catch (nextError) {
      pushToast(nextError.message || '复制二维码失败', 'danger')
    } finally {
      window.setTimeout(() => setCopyingTaskId(''), 1200)
    }
  }


  const handlePreviewTaskSync = async (task) => {
    if (!task?.artifacts?.resultUrl) {
      pushToast('当前任务缺少结果文件，无法预览回填', 'warning')
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
      pushToast('已生成腾讯文档回填预览', 'success')
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
      pushToast(nextError.message || '腾讯文档预览失败', 'danger')
    } finally {
      setSyncActionLoading((current) => ({ ...current, [task.taskId]: '' }))
    }
  }

  const handleSyncTask = async (task) => {
    if (!task?.artifacts?.resultUrl) {
      pushToast('当前任务缺少结果文件，无法同步腾讯文档', 'warning')
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
      await loadTasks({ silent: true })
      pushToast('腾讯文档已完成回填', 'success')
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
      await loadTasks({ silent: true })
      pushToast(nextError.message || '腾讯文档同步失败', 'danger')
    } finally {
      setSyncActionLoading((current) => ({ ...current, [task.taskId]: '' }))
    }
  }

  const openTaskDetail = (taskId) => {
    setSelectedTaskId(taskId)
    setIsDetailOpen(true)
  }

  const moveTaskSelection = (step) => {
    if (filteredTasks.length === 0) return
    const baseIndex = selectedTaskIndex >= 0 ? selectedTaskIndex : 0
    const nextIndex = Math.min(filteredTasks.length - 1, Math.max(0, baseIndex + step))
    setSelectedTaskId(filteredTasks[nextIndex].taskId)
    setIsDetailOpen(true)
  }

  const waitingCount = tasks.filter((task) => isWaitingTask(task)).length
  const inProgressCount = tasks.filter((task) => isInProgressTask(task)).length
  const exceptionCount = tasks.filter((task) => isExceptionalTask(task)).length
  const finishedCount = tasks.filter((task) => task.query?.status === 'SUCCEEDED' && task.sync?.status !== 'FAILED').length

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

      <div className="task-board-layout">
        <section className="panel task-list-panel stack-md">
          <div className="panel-split-header">
            <div className="compact-panel-header">
              <h2>任务队列</h2>
              <p>{getFilterDescription(filterKey)}</p>
            </div>
            <span className="section-counter">{filteredTasks.length}/{tasks.length}</span>
          </div>

          {loading ? <div className="result-empty-state"><strong>任务加载中...</strong></div> : null}
          {!loading && error ? <div className="inline-error">{error}</div> : null}
          {!loading && !error && tasks.length === 0 ? (
            <div className="result-empty-state">
              <strong>还没有任务</strong>
              <p>先点“手工建任务”补建任务，或直接在上方生成交接表驱动二维码。</p>
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
                <TaskCard
                  key={task.taskId}
                  task={task}
                  syncConfig={syncConfig}
                  selected={isDetailOpen && selectedTaskId === task.taskId}
                  recommended={index === 0}
                  onSelect={openTaskDetail}
                />
              ))}
            </div>
          ) : null}
        </section>

        <TaskDetailDrawer
          task={selectedTask}
          open={isDetailOpen}
          taskIndex={selectedTaskIndex}
          taskCount={filteredTasks.length}
          busy={selectedTask ? Boolean(actionLoading[selectedTask.taskId]) : false}
          copying={selectedTask ? copyingTaskId === selectedTask.taskId : false}
          syncConfig={syncConfig}
          syncPreview={selectedTask ? (syncPreviewState[selectedTask.taskId] || null) : null}
          syncAction={selectedTask ? (syncActionLoading[selectedTask.taskId] || '') : ''}
          onClose={() => setIsDetailOpen(false)}
          onCopyQr={handleCopyQr}
          onRefreshLogin={handleRefreshLogin}
          onRetryQuery={handleRetryQuery}
          onDeleteTask={handleDeleteTask}
          onPreviewSync={handlePreviewTaskSync}
          onSyncTask={handleSyncTask}
          onPrevious={() => moveTaskSelection(-1)}
          onNext={() => moveTaskSelection(1)}
        />
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


function TencentDocsDiagnosticPanel({ syncConfig, diagnostic, onInspect }) {
  const headers = diagnostic.payload?.headers || []
  const missingHeaders = getMissingTencentDocsHeaders(headers)
  const loginStatus = getTencentDocsLoginStatus(syncConfig, diagnostic)
  const sheetStatus = getTencentDocsSheetStatus(syncConfig, diagnostic, missingHeaders)
  const statusItems = [
    {
      label: '功能开关',
      tone: syncConfig.available ? (syncConfig.enabled ? 'success' : 'warning') : 'danger',
      value: syncConfig.available ? (syncConfig.enabled ? '已启用' : '未启用') : '未接入',
      detail: syncConfig.available ? `模式：${syncConfig.mode || 'browser'}` : (syncConfig.error || '未暴露腾讯文档配置接口')
    },
    {
      label: '默认目标',
      tone: syncConfig.defaultTargetConfigured ? 'success' : 'warning',
      value: syncConfig.defaultTargetConfigured ? (syncConfig.defaultSheetName || '已配置') : '待配置',
      detail: syncConfig.defaultTargetConfigured ? '将优先使用默认 docUrl 和 sheetName' : '请先配置默认腾讯文档地址与工作表名'
    },
    {
      label: '登录/读表',
      tone: loginStatus.tone,
      value: loginStatus.value,
      detail: loginStatus.detail
    },
    {
      label: '表头检查',
      tone: sheetStatus.tone,
      value: sheetStatus.value,
      detail: sheetStatus.detail
    }
  ]

  return (
    <section className="panel tencent-diagnostic-panel stack-md">
      <div className="panel-split-header">
        <div className="compact-panel-header">
          <span className="section-eyebrow">腾讯文档</span>
          <h2>同步诊断</h2>
          <p>先确认默认目标、登录态和表头是否正常，再去处理批量任务里的补同步，排障会省很多时间。</p>
        </div>
        <div className="tasks-toolbar-actions">
          <button
            className="secondary-btn"
            type="button"
            disabled={diagnostic.loading || !syncConfig.available}
            onClick={onInspect}
          >
            {diagnostic.loading ? '诊断中...' : '立即诊断'}
          </button>
        </div>
      </div>

      <div className="task-summary-grid diagnostic-summary-grid">
        {statusItems.map((item) => (
          <div key={item.label} className={`meta-card compact-meta-card diagnostic-card tone-${item.tone}`}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </div>
        ))}
      </div>

      {diagnostic.checkedAt ? (
        <div className="task-sync-meta diagnostic-meta">
          <strong>最近诊断时间</strong>
          <small>{formatDateTime(diagnostic.checkedAt)}</small>
        </div>
      ) : null}

      {diagnostic.error ? (
        <div className={`task-state-banner tone-${loginStatus.tone}`}>
          <strong>{diagnostic.error.message}</strong>
          <small>{diagnostic.error.code || 'TENCENT_DOCS_INSPECT_FAILED'}</small>
        </div>
      ) : null}

      {headers.length > 0 ? (
        <div className="sync-preview-card stack-sm">
          <strong>当前表头</strong>
          <small>{`共 ${headers.length} 列，已读取 ${diagnostic.payload?.rowCount || 0} 行预览数据`}</small>
          <div className="sync-columns-list">
            {headers.map((header) => (
              <span key={header} className="task-recommend-pill">{header}</span>
            ))}
          </div>
        </div>
      ) : null}

      {missingHeaders.length > 0 ? (
        <div className="task-state-banner tone-warning">
          <strong>模板列缺失</strong>
          <small>{`当前缺少：${missingHeaders.join('、')}`}</small>
        </div>
      ) : null}

      {diagnostic.payload?.artifacts ? (
        <div className="result-actions-row sync-artifact-links">
          {diagnostic.payload.artifacts.beforeReadUrl ? <a className="secondary-btn inline-link-btn" href={diagnostic.payload.artifacts.beforeReadUrl} target="_blank" rel="noreferrer">读表前截图</a> : null}
          {diagnostic.payload.artifacts.afterReadUrl ? <a className="secondary-btn inline-link-btn" href={diagnostic.payload.artifacts.afterReadUrl} target="_blank" rel="noreferrer">读表后截图</a> : null}
          {diagnostic.payload.artifacts.selectionTsvUrl ? <a className="secondary-btn inline-link-btn" href={diagnostic.payload.artifacts.selectionTsvUrl} target="_blank" rel="noreferrer">打开选区 TSV</a> : null}
          {diagnostic.payload.artifacts.previewJsonUrl ? <a className="secondary-btn inline-link-btn" href={diagnostic.payload.artifacts.previewJsonUrl} target="_blank" rel="noreferrer">打开诊断 JSON</a> : null}
          {diagnostic.payload.artifacts.errorUrl ? <a className="secondary-btn inline-link-btn" href={diagnostic.payload.artifacts.errorUrl} target="_blank" rel="noreferrer">打开错误截图</a> : null}
        </div>
      ) : null}
    </section>
  )
}

function TaskBuilderModal({
  draftLines,
  draftValidation,
  displayBatchErrors,
  batchInput,
  submitting,
  textareaRef,
  onClose,
  onChange,
  onSubmit
}) {
  return (
    <div className="builder-modal-root" role="dialog" aria-modal="true" aria-labelledby="batch-builder-title">
      <div className="builder-modal-backdrop" onClick={onClose} />

      <section className="panel builder-modal-panel stack-md">
        <div className="task-detail-header">
          <div className="compact-panel-header">
            <span className="section-eyebrow">批量导入</span>
            <h2 id="batch-builder-title">新建批量任务</h2>
            <p>先看可创建数量和错误，再一次性发出二维码任务，避免一边粘贴一边来回切页面。</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭新建任务">×</button>
        </div>

        <div className="task-builder-stats">
          <div className="task-builder-stat">
            <span>总行数</span>
            <strong>{draftLines}</strong>
          </div>
          <div className="task-builder-stat">
            <span>可创建</span>
            <strong>{draftValidation.tasks.length}</strong>
          </div>
          <div className="task-builder-stat danger">
            <span>错误数</span>
            <strong>{displayBatchErrors.length}</strong>
          </div>
        </div>

        <form className="stack-md" onSubmit={onSubmit}>
          <label className="field">
            <span>批量任务输入</span>
            <textarea
              ref={textareaRef}
              className="batch-textarea"
              placeholder={'达人A,554608495125\n达人B\t537029503554'}
              value={batchInput}
              onChange={(event) => onChange(event.target.value)}
            />
          </label>

          <div className="builder-helper-list">
            <span>格式 1：备注,内容ID</span>
            <span>格式 2：备注&lt;TAB&gt;内容ID</span>
            <span>建议一次控制在 1–5 条</span>
          </div>

          {displayBatchErrors.length > 0 ? (
            <div className="inline-error stack-sm">
              {displayBatchErrors.map((item, index) => (
                <div key={`${item.line}-${index}`}>
                  {item.line > 0 ? `第 ${item.line} 行：` : ''}
                  {item.message}
                </div>
              ))}
            </div>
          ) : null}

          <div className="task-composer-actions">
            <button className="primary-btn" type="submit" disabled={submitting}>
              {submitting ? '创建中...' : '批量创建二维码任务'}
            </button>
            <small>创建后系统会自动进入扫码跟进流程。</small>
          </div>
        </form>
      </section>
    </div>
  )
}

function TaskCard({ task, syncConfig, selected, recommended, onSelect }) {
  const tone = getTaskOverallTone(task)

  return (
    <article
      className={`task-queue-card tone-${tone} ${selected ? 'selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(task.taskId)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(task.taskId)
        }
      }}
    >
      <div className="task-queue-top">
        <div className="task-row-main">
          <div className="task-card-title-row">
            <strong>{task.remark || '未命名任务'}</strong>
            <div className="task-card-title-pills">
              {task.taskMode === 'SHEET_DEMAND' ? <span className="task-priority-pill task-mode-pill">交接表</span> : null}
              {recommended ? <span className="task-priority-pill">建议先看</span> : null}
            </div>
          </div>
          <small>{getTaskSummary(task)}</small>
        </div>
        <span className="row-focus-pill">{getTaskPrimaryActionLabel(task)}</span>
      </div>

      <div className="task-status-pills">
        <span className={`status-pill status-${getTaskLoginTone(task.login.status)}`}>
          登录：{formatTaskLoginStatus(task.login.status)}
        </span>
        <span className={`status-pill status-${getTaskQueryTone(task.query.status)}`}>
          查询：{formatTaskQueryStatus(task.query.status)}
        </span>
        <span className={`status-pill status-${normalizeStatusTone(getTaskSyncTone(task, syncConfig))}`}>
          同步：{formatTaskSyncStatus(task, syncConfig)}
        </span>
      </div>

      <div className="task-meta-grid">
        <div className="task-meta-item">
          <span>内容 ID</span>
          <strong className="mono-cell">{task.contentId || '-'}</strong>
        </div>
        <div className="task-meta-item">
          <span>账号</span>
          <strong>{task.accountNickname || '待扫码'}</strong>
        </div>
        <div className="task-meta-item">
          <span>更新时间</span>
          <strong>{formatDateTime(task.updatedAt)}</strong>
        </div>
        {task.taskMode === 'SHEET_DEMAND' ? (
          <div className="task-meta-item">
            <span>交接表</span>
            <strong>{formatTaskSheetMatchStatus(task.sheetMatch?.status)}</strong>
          </div>
        ) : null}
      </div>

      {task.sync?.status === 'FAILED' ? <div className="task-inline-hint">{task.sync.error?.message || '腾讯文档同步失败，请进入详情补同步。'}</div> : null}
      {!task.sync?.error?.message && task.error?.message ? <div className="task-inline-hint">{task.error.message}</div> : null}
    </article>
  )
}

function TaskDetailDrawer({
  task,
  open,
  taskIndex,
  taskCount,
  busy,
  copying,
  syncConfig,
  syncPreview,
  syncAction,
  onClose,
  onCopyQr,
  onRefreshLogin,
  onRetryQuery,
  onDeleteTask,
  onPreviewSync,
  onSyncTask,
  onPrevious,
  onNext
}) {
  const [activeTab, setActiveTab] = useState('summary')

  useEffect(() => {
    setActiveTab('summary')
  }, [task?.taskId, task?.screenshots?.summaryUrl, task?.screenshots?.rawUrl])

  if (!open || !task) {
    return (
      <aside className="panel task-detail-drawer placeholder stack-md">
        <div className="compact-panel-header">
          <span className="section-eyebrow">焦点区</span>
          <h2>任务详情</h2>
          <p>从左侧选择一条任务，这里会集中展示二维码、结果和下一步建议。</p>
        </div>

        <div className="result-empty-state compact-empty-state">
          <strong>尚未选择任务</strong>
          <p>建议优先点击待扫码或异常任务，这样发码和异常处理都会更顺手。</p>
        </div>
      </aside>
    )
  }

  const previewImageUrl = activeTab === 'summary' ? task.screenshots?.summaryUrl : task.screenshots?.rawUrl
  const taskBusy = isTaskBusy(task)
  const canCopyQr = Boolean(task.qrImageUrl && supportsClipboardImage())
  const canRefresh = canRefreshTaskLogin(task)
  const canRetry = canRetryTaskQuery(task)
  const canDelete = canDeleteTask(task)
  const showQr = Boolean(task.qrImageUrl && ['WAITING_QR', 'WAITING_CONFIRM'].includes(task.login.status))
  const recommendations = getTaskRecommendations(task, syncConfig)

  return (
    <aside className="panel task-detail-drawer stack-md">
      <div className="task-detail-header">
        <div className="compact-panel-header">
          <span className="section-eyebrow">焦点区</span>
          <h2>任务详情</h2>
          <p>二维码、查询结果和腾讯文档回填都集中在这里处理，主列表只负责排队和筛选。</p>
        </div>

        <div className="task-detail-nav">
          <button className="secondary-btn compact-btn" type="button" onClick={onPrevious} disabled={taskIndex <= 0}>
            上一条
          </button>
          <span>{taskCount > 0 ? `${taskIndex + 1}/${taskCount}` : '0/0'}</span>
          <button className="secondary-btn compact-btn" type="button" onClick={onNext} disabled={taskIndex >= taskCount - 1}>
            下一条
          </button>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭任务详情">×</button>
        </div>
      </div>

      <div className={`task-focus-banner tone-${getTaskOverallTone(task)}`}>
        <strong>当前建议</strong>
        <small>{getTaskSummary(task)}</small>
        {recommendations.length > 0 ? (
          <div className="task-recommend-list">
            {recommendations.map((item) => (
              <span key={item} className="task-recommend-pill">{item}</span>
            ))}
          </div>
        ) : null}
      </div>

      {task.taskMode === 'SHEET_DEMAND' ? <TaskDetailSheetMatchSection task={task} /> : null}

      <div className="task-detail-section stack-md">
        <div className="task-detail-title-row">
          <strong>{task.remark || '未命名任务'}</strong>
          <div className="task-status-pills">
            <span className={`status-pill status-${getTaskLoginTone(task.login.status)}`}>登录：{formatTaskLoginStatus(task.login.status)}</span>
            <span className={`status-pill status-${getTaskQueryTone(task.query.status)}`}>查询：{formatTaskQueryStatus(task.query.status)}</span>
            <span className={`status-pill status-${normalizeStatusTone(getTaskSyncTone(task, syncConfig))}`}>同步：{formatTaskSyncStatus(task, syncConfig)}</span>
          </div>
        </div>

        <div className="task-summary-grid">
          <div className="meta-card compact-meta-card"><span>内容 ID</span><strong>{task.contentId || '-'}</strong><small>任务 ID：{task.taskId}</small></div>
          <div className="meta-card compact-meta-card"><span>登录账号</span><strong>{task.accountNickname || '待扫码'}</strong><small>{task.accountId || '扫码成功后自动回填'}</small></div>
          <div className="meta-card compact-meta-card"><span>更新时间</span><strong>{formatDateTime(task.updatedAt)}</strong><small>{task.fetchedAt ? `查询时间：${formatDateTime(task.fetchedAt)}` : '等待自动查询'}</small></div>
          {task.taskMode === 'SHEET_DEMAND' ? (
            <div className="meta-card compact-meta-card"><span>交接表匹配</span><strong>{formatTaskSheetMatchStatus(task.sheetMatch?.status)}</strong><small>{getTaskSheetMatchDetail(task)}</small></div>
          ) : null}
        </div>
      </div>

      <div className="task-detail-section stack-md">
        <div className="task-section-header">
          <div>
            <strong>二维码区</strong>
            <small>{showQr ? '适合直接下载或复制图片发到微信群。' : '当前状态没有可用二维码，可按需刷新后继续。'}</small>
          </div>
          <div className="task-actions-inline" onClick={stopPropagation}>
            <a
              className={`secondary-btn inline-link-btn ${!task.qrImageUrl ? 'disabled' : ''}`}
              href={task.qrImageUrl || '#'}
              download={`task-${task.taskId}-qr.png`}
              onClick={(event) => {
                stopPropagation(event)
                if (!task.qrImageUrl) event.preventDefault()
              }}
            >
              下载二维码
            </a>
            <button className="secondary-btn" type="button" disabled={!canCopyQr || busy || taskBusy} onClick={() => onCopyQr(task)}>
              {copying ? '已复制' : '复制二维码图片'}
            </button>
            <button className="secondary-btn" type="button" disabled={!canRefresh || busy} onClick={() => onRefreshLogin(task.taskId)}>
              刷新二维码
            </button>
          </div>
        </div>
        <div className="qr-wrap task-detail-qr-wrap">
          {showQr ? (
            <img className="qr-image" src={task.qrImageUrl} alt={`任务 ${task.remark} 的二维码`} />
          ) : (
            <div className="task-qr-placeholder">
              <strong>{formatTaskLoginStatus(task.login.status)}</strong>
              <small>如果二维码过期、会话中断或登录失败，可点击“刷新二维码”重新生成。</small>
            </div>
          )}
        </div>
      </div>

      <TaskDetailResultSection
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        previewImageUrl={previewImageUrl}
        task={task}
        busy={busy}
        canRetry={canRetry}
        onRetryQuery={onRetryQuery}
      />

      <TaskDetailSyncSection
        task={task}
        syncConfig={syncConfig}
        syncPreview={syncPreview}
        syncAction={syncAction}
        onPreviewSync={onPreviewSync}
        onSyncTask={onSyncTask}
      />

      {task.error?.message ? (
        <div className={`task-state-banner tone-${getTaskQueryTone(task.query.status)}`}>
          <strong>{task.error.message}</strong>
          <small>{task.error.code || 'TASK_ERROR'}</small>
        </div>
      ) : null}

      <div className="task-actions-footer" onClick={stopPropagation}>
        <button className="secondary-btn" type="button" disabled={!canRetry || busy} onClick={() => onRetryQuery(task.taskId)}>
          重试查询
        </button>
        <button className="secondary-btn danger-ghost-btn" type="button" disabled={!canDelete || busy} onClick={() => onDeleteTask(task.taskId)}>
          删除任务
        </button>
      </div>
    </aside>
  )
}

function TaskDetailSheetMatchSection({ task }) {
  return (
    <div className="task-detail-section stack-md">
      <div className="task-section-header">
        <div>
          <strong>交接表匹配</strong>
          <small>交接表任务会在达人扫码成功后，按达人昵称命中目标行，再决定是否自动查询和回填。</small>
        </div>
      </div>

      <div className={`task-state-banner tone-${getTaskSheetMatchTone(task.sheetMatch?.status)}`}>
        <strong>{formatTaskSheetMatchStatus(task.sheetMatch?.status)}</strong>
        <small>{getTaskSheetMatchDetail(task)}</small>
      </div>

      <div className="task-summary-grid">
        <div className="meta-card compact-meta-card"><span>目标工作表</span><strong>{task.sheetTarget?.sheetName || '未设置'}</strong><small>{task.sheetTarget?.docUrl || '请先保存腾讯文档目标'}</small></div>
        <div className="meta-card compact-meta-card"><span>目标行</span><strong>{task.sheetMatch?.sheetRow ? `第 ${task.sheetMatch.sheetRow} 行` : '待命中'}</strong><small>{task.sheetMatch?.nickname || task.accountNickname || '等待达人扫码'}</small></div>
        <div className="meta-card compact-meta-card"><span>缺失列</span><strong>{task.sheetMatch?.missingColumns?.length || 0} 列</strong><small>{task.sheetMatch?.missingColumns?.length ? task.sheetMatch.missingColumns.join('、') : '当前没有缺失列'}</small></div>
      </div>
    </div>
  )
}

function TaskDetailResultSection({ activeTab, setActiveTab, previewImageUrl, task, busy, canRetry, onRetryQuery }) {
  const tone = getTaskQueryTone(task.query.status)

  if (task.query.status === 'SUCCEEDED') {
    return (
      <div className="task-detail-section stack-md">
        <div className="task-section-header">
          <div>
            <strong>结果区</strong>
            <small>优先读 5 项指标摘要，截图和日志只在需要校对时再打开。</small>
          </div>
          <div className="task-actions-inline">
            {task.screenshots?.summaryUrl ? <a className="secondary-btn inline-link-btn" href={task.screenshots.summaryUrl} target="_blank" rel="noreferrer">查看汇总图</a> : null}
            {task.screenshots?.rawUrl ? <a className="secondary-btn inline-link-btn" href={task.screenshots.rawUrl} target="_blank" rel="noreferrer">查看原图</a> : null}
            {task.artifacts?.resultUrl ? <a className="secondary-btn inline-link-btn" href={task.artifacts.resultUrl} target="_blank" rel="noreferrer">打开结果 JSON</a> : null}
            {task.artifacts?.networkLogUrl ? <a className="secondary-btn inline-link-btn" href={task.artifacts.networkLogUrl} target="_blank" rel="noreferrer">打开网络日志</a> : null}
          </div>
        </div>

        <div className="task-detail-metrics-grid">
          {METRIC_ORDER.map((metric) => (
            <div key={metric} className="metric-card compact-metric-card">
              <span>{metric}</span>
              <strong>{formatMetricValue(task.metrics?.[metric]?.value)}</strong>
              <small>{task.metrics?.[metric]?.field || '-'}</small>
            </div>
          ))}
        </div>

        <div className="image-panel task-image-panel">
          <div className="image-panel-header">
            <div className="tabs-switcher" role="tablist" aria-label={`任务 ${task.taskId} 截图切换`}>
              <button className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('summary')}>汇总截图</button>
              <button className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('raw')}>原始截图</button>
            </div>
            <small>{task.fetchedAt ? formatDateTime(task.fetchedAt) : '已生成查询结果'}</small>
          </div>
          <div className="image-stage compact-image-stage detail-image-stage">
            {previewImageUrl ? (
              <img className="result-image" src={previewImageUrl} alt={activeTab === 'summary' ? '任务汇总截图' : '任务原始截图'} />
            ) : (
              <div className="result-empty-state compact-empty-state"><strong>暂无截图</strong></div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (task.query.status === 'NO_DATA' || task.query.status === 'FAILED') {
    return (
      <div className="task-detail-section stack-md">
        <div className={`result-state-card tone-${tone}`}>
          <div className="result-state-bar">
            <div>
              <span className="result-state-label">结果</span>
              <strong>{formatTaskQueryStatus(task.query.status)}</strong>
            </div>
            <small>{task.error?.code || 'TASK_RESULT'}</small>
          </div>
          <p>{task.error?.message || '任务已结束，请查看截图和日志。'}</p>
          <div className="result-actions-row">
            {task.screenshots?.rawUrl ? <a className="secondary-btn inline-link-btn" href={task.screenshots.rawUrl} target="_blank" rel="noreferrer">打开原图</a> : null}
            {task.artifacts?.networkLogUrl ? <a className="secondary-btn inline-link-btn" href={task.artifacts.networkLogUrl} target="_blank" rel="noreferrer">打开网络日志</a> : null}
            <button className="secondary-btn" type="button" disabled={!canRetry || busy} onClick={() => onRetryQuery(task.taskId)}>重试查询</button>
          </div>
          {task.screenshots?.rawUrl ? <img className="result-image" src={task.screenshots.rawUrl} alt="任务异常截图" /> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="task-detail-section stack-md">
      <div className={`result-state-card tone-${tone}`}>
        <div className="result-state-bar">
          <div>
            <span className="result-state-label">结果</span>
            <strong>{formatTaskQueryStatus(task.query.status)}</strong>
          </div>
          <small>{formatTaskLoginStatus(task.login.status)}</small>
        </div>
        <p>扫码确认成功后，系统会自动把任务推进到查询队列。你可以先继续处理其他二维码任务。</p>
      </div>
    </div>
  )
}

function TaskDetailSyncSection({ task, syncConfig, syncPreview, syncAction, onPreviewSync, onSyncTask }) {
  const syncState = resolveTaskSyncState(task, syncConfig)
  const tone = normalizeStatusTone(getTaskSyncTone(task, syncConfig))
  const previewData = syncPreview?.data || null
  const previewError = syncPreview?.error || null
  const previewWarnings = previewData?.warnings || []
  const previewLoading = syncAction === 'preview'
  const syncing = syncAction === 'sync' || task.sync?.status === 'RUNNING'
  const effectiveError = previewError || task.sync?.error || null
  const effectiveArtifacts = task.sync?.artifacts || previewError?.details?.artifacts || previewData?.artifacts || null
  const effectiveTarget = task.sync?.target || previewData?.target || null
  const effectiveMatch = task.sync?.match || previewData?.match || null
  const effectiveWriteSummary = task.sync?.writeSummary || previewData?.writeSummary || null
  const canPreview = canPreviewTaskSync(task, syncConfig) && !previewLoading && !syncing
  const canSync = canSyncTask(task, syncConfig) && !previewLoading && !syncing
  const columnCount = Array.isArray(previewData?.columns) ? previewData.columns.length : 0
  const updatedCount = Array.isArray(effectiveWriteSummary?.columnsUpdated) ? effectiveWriteSummary.columnsUpdated.length : 0

  return (
    <div className="task-detail-section stack-md">
      <div className="task-section-header">
        <div>
          <strong>腾讯文档同步</strong>
          <small>查询成功后会自动尝试回填；失败不会影响已生成的指标、截图和结果文件。</small>
        </div>
        <div className="task-actions-inline">
          <button className="secondary-btn" type="button" disabled={!canPreview} onClick={() => onPreviewSync(task)}>
            {previewLoading ? '预览中...' : '预览回填'}
          </button>
          <button className="secondary-btn" type="button" disabled={!canSync} onClick={() => onSyncTask(task)}>
            {syncing ? '同步中...' : '立即同步'}
          </button>
        </div>
      </div>

      <div className={`task-state-banner tone-${tone}`}>
        <strong>同步：{formatTaskSyncStatus(task, syncConfig)}</strong>
        <small>{getTaskSyncDescription(task, syncConfig)}</small>
      </div>

      <div className="task-summary-grid">
        <div className="meta-card compact-meta-card">
          <span>目标工作表</span>
          <strong>{effectiveTarget?.sheetName || syncConfig.defaultSheetName || '未配置'}</strong>
          <small>
            {effectiveTarget?.docUrl
              ? effectiveTarget.docUrl
              : syncConfig.loading
                ? '正在读取默认配置'
                : syncConfig.defaultTargetConfigured
                  ? '使用默认腾讯文档目标'
                  : '请先配置默认 docUrl 和 sheetName'}
          </small>
        </div>
        <div className="meta-card compact-meta-card">
          <span>匹配结果</span>
          <strong>{effectiveMatch?.sheetRow ? `第 ${effectiveMatch.sheetRow} 行` : '待匹配'}</strong>
          <small>{effectiveMatch?.contentId || task.contentId}</small>
        </div>
        <div className="meta-card compact-meta-card">
          <span>写入结果</span>
          <strong>{effectiveWriteSummary?.action || (previewData ? '预览完成' : formatTaskSyncStatus(task, syncConfig))}</strong>
          <small>
            {updatedCount > 0
              ? `已更新 ${updatedCount} 列`
              : columnCount > 0
                ? `预计更新 ${columnCount} 列`
                : `模式：${syncConfig.defaultWriteMode || 'upsert'}`}
          </small>
        </div>
      </div>

      {effectiveError ? (
        <div className="task-state-banner tone-danger">
          <strong>{effectiveError.message}</strong>
          <small>{effectiveError.code || 'TENCENT_DOCS_SYNC_FAILED'}</small>
        </div>
      ) : null}

      {previewWarnings.length > 0 ? (
        <div className="task-state-banner tone-warning">
          <strong>预览提示</strong>
          <small>{previewWarnings.join('；')}</small>
        </div>
      ) : null}

      {previewData ? (
        <div className="sync-preview-card stack-sm">
          <strong>预览摘要</strong>
          <small>
            {previewData.match?.sheetRow
              ? `将命中第 ${previewData.match.sheetRow} 行，并回填 ${columnCount} 列`
              : `已生成预览，本次预计回填 ${columnCount} 列`}
          </small>
          {columnCount > 0 ? (
            <div className="sync-columns-list">
              {previewData.columns.map((column) => {
                const label = typeof column === 'string' ? column : column.columnName || column.columnLetter || '-'
                return <span key={label} className="task-recommend-pill">{label}</span>
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {effectiveArtifacts ? (
        <div className="result-actions-row sync-artifact-links">
          {effectiveArtifacts.beforeReadUrl ? <a className="secondary-btn inline-link-btn" href={effectiveArtifacts.beforeReadUrl} target="_blank" rel="noreferrer">读表前截图</a> : null}
          {effectiveArtifacts.afterReadUrl ? <a className="secondary-btn inline-link-btn" href={effectiveArtifacts.afterReadUrl} target="_blank" rel="noreferrer">读表后截图</a> : null}
          {effectiveArtifacts.beforeFillUrl ? <a className="secondary-btn inline-link-btn" href={effectiveArtifacts.beforeFillUrl} target="_blank" rel="noreferrer">写入前截图</a> : null}
          {effectiveArtifacts.afterFillUrl ? <a className="secondary-btn inline-link-btn" href={effectiveArtifacts.afterFillUrl} target="_blank" rel="noreferrer">写入后截图</a> : null}
          {effectiveArtifacts.previewJsonUrl ? <a className="secondary-btn inline-link-btn" href={effectiveArtifacts.previewJsonUrl} target="_blank" rel="noreferrer">打开预览 JSON</a> : null}
          {effectiveArtifacts.selectionTsvUrl ? <a className="secondary-btn inline-link-btn" href={effectiveArtifacts.selectionTsvUrl} target="_blank" rel="noreferrer">打开选区 TSV</a> : null}
          {effectiveArtifacts.writeLogUrl ? <a className="secondary-btn inline-link-btn" href={effectiveArtifacts.writeLogUrl} target="_blank" rel="noreferrer">打开写入日志</a> : null}
          {effectiveArtifacts.errorUrl ? <a className="secondary-btn inline-link-btn" href={effectiveArtifacts.errorUrl} target="_blank" rel="noreferrer">打开错误截图</a> : null}
        </div>
      ) : null}

      {syncState === 'PENDING' ? (
        <div className="task-state-banner tone-info">
          <strong>等待查询完成</strong>
          <small>任务只有在查询成功后才会触发自动同步或开放手动补同步。</small>
        </div>
      ) : null}
    </div>
  )
}

function matchesFilter(task, filterKey) {
  if (filterKey === 'waiting') return isWaitingTask(task)
  if (filterKey === 'in-progress') return isInProgressTask(task)
  if (filterKey === 'exception') return isExceptionalTask(task)
  if (filterKey === 'finished') return isFinishedTask(task)
  return true
}

function isWaitingTask(task) {
  return ['WAITING_QR', 'WAITING_CONFIRM'].includes(task.login?.status)
}

function isInProgressTask(task) {
  if (task.sheetMatch?.status === 'NEEDS_FILL' && task.query?.status === 'IDLE') return true
  return ['QUEUED', 'RUNNING'].includes(task.query?.status) || task.sync?.status === 'RUNNING' || (task.login?.status === 'LOGGED_IN' && task.query?.status === 'IDLE' && !isTaskSheetTerminal(task))
}

function isFinishedTask(task) {
  if (task.sheetMatch?.status === 'ALREADY_COMPLETE') return true
  return task.query?.status === 'SUCCEEDED' && task.sync?.status !== 'FAILED'
}

function isExceptionalTask(task) {
  return ['NO_DATA', 'FAILED'].includes(task.query?.status)
    || ['EXPIRED', 'FAILED', 'INTERRUPTED'].includes(task.login?.status)
    || task.sync?.status === 'FAILED'
    || ['NOT_IN_SHEET', 'CONTENT_ID_MISSING', 'DUPLICATE_NICKNAME', 'ROW_CHANGED'].includes(task.sheetMatch?.status)
}

function isTaskSheetTerminal(task) {
  return ['ALREADY_COMPLETE', 'NOT_IN_SHEET', 'CONTENT_ID_MISSING', 'DUPLICATE_NICKNAME', 'ROW_CHANGED'].includes(task.sheetMatch?.status)
}

function compareTasks(left, right) {
  const priorityDiff = getTaskPriority(left) - getTaskPriority(right)
  if (priorityDiff !== 0) return priorityDiff
  const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime()
  const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime()
  return rightTime - leftTime
}

function getTaskPriority(task) {
  if (isWaitingTask(task)) return 0
  if (isInProgressTask(task)) return 1
  if (isExceptionalTask(task)) return 2
  if (isFinishedTask(task)) return 3
  return 4
}

function countNonEmptyLines(input) {
  return String(input || '')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .length
}

function getTaskLoginTone(status) {
  if (status === 'LOGGED_IN') return 'success'
  if (status === 'WAITING_QR' || status === 'WAITING_CONFIRM') return 'info'
  if (status === 'EXPIRED') return 'warning'
  return 'danger'
}

function getTaskOverallTone(task) {
  if (task.sheetMatch?.status === 'ALREADY_COMPLETE') return 'success'
  if (isExceptionalTask(task)) return 'danger'
  if (task.query?.status === 'SUCCEEDED') return 'success'
  if (isWaitingTask(task)) return 'info'
  return 'warning'
}

function formatTaskSheetMatchStatus(status) {
  if (status === 'NEEDS_FILL') return '待补数'
  if (status === 'ALREADY_COMPLETE') return '数据已全'
  if (status === 'CONTENT_ID_MISSING') return '缺内容ID'
  if (status === 'DUPLICATE_NICKNAME') return '达人重名'
  if (status === 'NOT_IN_SHEET') return '表中无此达人'
  if (status === 'ROW_CHANGED') return '目标行已变更'
  return status || '待匹配'
}

function getTaskSheetMatchTone(status) {
  if (status === 'ALREADY_COMPLETE') return 'success'
  if (status === 'NEEDS_FILL') return 'warning'
  if (['CONTENT_ID_MISSING', 'DUPLICATE_NICKNAME', 'NOT_IN_SHEET', 'ROW_CHANGED'].includes(status)) return 'danger'
  return 'info'
}

function getTaskSheetMatchDetail(task) {
  if (task.sheetMatch?.status === 'NEEDS_FILL') return `已命中第 ${task.sheetMatch.sheetRow} 行，内容 ID：${task.sheetMatch.contentId || '-'}`
  if (task.sheetMatch?.status === 'ALREADY_COMPLETE') return `第 ${task.sheetMatch.sheetRow} 行数据已完整，无需重复查询`
  if (task.sheetMatch?.status === 'CONTENT_ID_MISSING') return `第 ${task.sheetMatch.sheetRow} 行命中成功，但内容 ID 为空`
  if (task.sheetMatch?.status === 'DUPLICATE_NICKNAME') return '交接表中存在同名达人，需先人工处理'
  if (task.sheetMatch?.status === 'NOT_IN_SHEET') return '当前扫码达人未出现在交接表中'
  if (task.sheetMatch?.status === 'ROW_CHANGED') return '写表前发现目标行已被修改，请重新检查交接表'
  return task.sheetTarget?.sheetName ? `目标工作表：${task.sheetTarget.sheetName}` : '扫码后会自动匹配交接表达人行'
}

function getTaskSummary(task) {
  if (task.sync?.status === 'FAILED') return task.sync.error?.message || '腾讯文档同步失败，建议先预览再补同步。'
  if (task.sync?.status === 'RUNNING') return '查询结果已生成，正在自动回填腾讯文档。'
  if (task.sheetMatch?.status === 'ALREADY_COMPLETE') return '该达人在交接表中的目标数据已完整，无需重复查询。'
  if (task.sheetMatch?.status === 'CONTENT_ID_MISSING') return '交接表已命中达人，但内容 ID 缺失，请先补齐。'
  if (task.sheetMatch?.status === 'DUPLICATE_NICKNAME') return '交接表里存在同名达人，当前版本不会自动决策。'
  if (task.sheetMatch?.status === 'NOT_IN_SHEET') return '扫码达人不在交接表里，本次不会自动查数。'
  if (task.sheetMatch?.status === 'ROW_CHANGED') return '目标行已被修改，请重新检查交接表后再继续。'
  if (task.error?.message) return task.error.message
  if (task.query?.status === 'SUCCEEDED' && task.sync?.status === 'SUCCEEDED') return '5 项指标、截图和腾讯文档回填都已完成，可直接复核。'
  if (task.query?.status === 'SUCCEEDED') return '5 项指标和截图已生成，可继续预览或立即同步腾讯文档。'
  if (task.query?.status === 'NO_DATA') return '接口未返回目标内容，建议查看原图和网络日志。'
  if (task.query?.status === 'FAILED') return '查询流程异常结束，建议先看原图和错误信息。'
  if (task.query?.status === 'QUEUED') return '任务已进入查询队列，系统会自动执行。'
  if (task.query?.status === 'RUNNING') return '正在自动查询中，可先继续处理下一条二维码任务。'
  if (task.taskMode === 'SHEET_DEMAND' && task.login?.status === 'LOGGED_IN' && task.query?.status === 'IDLE' && !task.sheetMatch) return '扫码成功，正在按达人昵称匹配交接表。'
  if (task.login?.status === 'WAITING_CONFIRM') return '已扫码，等待手机确认，确认后会自动开始查询。'
  if (task.login?.status === 'WAITING_QR') return '先把二维码发出去，扫码成功后会自动进入查询流程。'
  if (task.login?.status === 'LOGGED_IN') return '登录成功，等待自动查询或可手动重试。'
  return '点击查看二维码、结果和下一步建议。'
}

function getTaskPrimaryActionLabel(task) {
  if (isWaitingTask(task)) return '去发码'
  if (task.sheetMatch?.status === 'ALREADY_COMPLETE') return '已完整'
  if (['CONTENT_ID_MISSING', 'DUPLICATE_NICKNAME', 'NOT_IN_SHEET', 'ROW_CHANGED'].includes(task.sheetMatch?.status)) return '处理交接表'
  if (task.sync?.status === 'FAILED') return '补同步'
  if (isExceptionalTask(task)) return '处理异常'
  if (task.query?.status === 'SUCCEEDED') return '查看结果'
  return '查看进度'
}

function getWorkspaceHeadline(tasks, filteredTasks) {
  if (tasks.length === 0) return '先在上方配置交接表并生成二维码任务，工作台会自动接管扫码、查询和回填跟进。'
  if (filteredTasks.length === 0) return '当前筛选下没有任务，切回全部即可继续处理。'

  const waitingCount = tasks.filter((task) => isWaitingTask(task)).length
  const exceptionCount = tasks.filter((task) => isExceptionalTask(task)).length
  const inProgressCount = tasks.filter((task) => isInProgressTask(task)).length

  if (waitingCount > 0) return `当前有 ${waitingCount} 条待扫码任务，建议优先发码。`
  if (exceptionCount > 0) return `当前有 ${exceptionCount} 条异常任务，建议先处理交接表异常、查询异常或同步失败。`
  if (inProgressCount > 0) return `当前有 ${inProgressCount} 条任务正在推进，可继续观察自动查询和回填结果。`
  return '所有任务都已进入完成状态，可按需抽查结果、截图和腾讯文档写入日志。'
}

function getFilterDescription(filterKey) {
  const current = FILTER_OPTIONS.find((option) => option.value === filterKey)
  if (!current) return '按优先级展示任务，点击任一任务即可进入右侧焦点区。'
  if (filterKey === 'all') return '按优先级展示任务，优先把注意力放在待扫码、交接表异常和同步失败项。'
  return `当前聚焦：${current.label}。点击任一任务即可在右侧集中处理。`
}

function isTaskBusy(task) {
  return ['QUEUED', 'RUNNING'].includes(task?.query?.status) || task?.sync?.status === 'RUNNING'
}

function canRefreshTaskLogin(task) {
  return !isTaskBusy(task)
}

function canRetryTaskQuery(task) {
  return Boolean(task?.accountId) && !isTaskBusy(task) && !['SUCCEEDED'].includes(task?.query?.status)
}

function canDeleteTask(task) {
  return !isTaskBusy(task)
}

function canPreviewTaskSync(task, syncConfig) {
  const hasTarget = task?.taskMode === 'SHEET_DEMAND'
    ? Boolean(task?.sheetTarget?.docUrl && task?.sheetTarget?.sheetName)
    : Boolean(syncConfig?.defaultTargetConfigured)
  return task?.query?.status === 'SUCCEEDED' && Boolean(task?.artifacts?.resultUrl) && Boolean(syncConfig?.enabled) && hasTarget && task?.sync?.status !== 'RUNNING'
}

function canSyncTask(task, syncConfig) {
  return canPreviewTaskSync(task, syncConfig)
}

function getTaskRecommendations(task, syncConfig) {
  if (task.login?.status === 'WAITING_QR') return ['下载或复制二维码发群', '提醒达人扫码后手机确认']
  if (task.login?.status === 'WAITING_CONFIRM') return ['等待手机确认', '若长时间无响应可刷新二维码']
  if (['EXPIRED', 'FAILED', 'INTERRUPTED'].includes(task.login?.status)) return ['先刷新二维码', '重新发群并等待达人扫码']
  if (task.sheetMatch?.status === 'ALREADY_COMPLETE') return ['该达人数据已全，可结束此任务', '继续处理下一位达人']
  if (task.sheetMatch?.status === 'CONTENT_ID_MISSING') return ['先在交接表补内容 ID', '补完后点击重试查询']
  if (task.sheetMatch?.status === 'DUPLICATE_NICKNAME') return ['先处理交接表中的同名达人', '处理后再点击重试查询']
  if (task.sheetMatch?.status === 'NOT_IN_SHEET') return ['确认达人是否应存在于交接表', '如需继续请先补到交接表后重试']
  if (task.sheetMatch?.status === 'ROW_CHANGED') return ['先重新检查交接表目标行', '确认后重新预览或重试查询']
  if (task.query?.status === 'NO_DATA') return ['打开原图和网络日志复核内容 ID', '确认无误后可结束此任务']
  if (task.query?.status === 'FAILED') return ['先看原图和错误信息', '确认账号状态后再重试查询']
  if (task.sync?.status === 'FAILED') return ['先点预览回填确认命中行', '确认腾讯文档登录态后点击立即同步']
  if (task.query?.status === 'SUCCEEDED' && syncConfig?.enabled && canPreviewTaskSync(task, syncConfig) && task.sync?.status !== 'SUCCEEDED') return ['先预览回填确认目标行', '确认无误后立即同步']
  if (task.query?.status === 'SUCCEEDED' && task.sync?.status === 'SUCCEEDED') return ['抽查汇总图和写入日志', '继续处理下一条任务']
  if (task.query?.status === 'RUNNING' || task.query?.status === 'QUEUED') return ['等待自动查询完成', '先继续处理其他二维码任务']
  return []
}

function getTaskSyncDescription(task, syncConfig) {
  const syncState = resolveTaskSyncState(task, syncConfig)
  if (syncState === 'PENDING') return '查询成功后才会自动触发腾讯文档回填，也会开放手动补同步。'
  if (syncState === 'RUNNING') return '正在读取腾讯文档并回填目标行，期间会保存写入前后截图和写入日志。'
  if (syncState === 'SUCCEEDED') return '腾讯文档已回填成功，可通过写入日志和截图复核实际效果。'
  if (syncState === 'FAILED') return task.sync?.error?.message || '腾讯文档回填失败，可先预览再立即同步。'
  if (syncState === 'DISABLED') return '腾讯文档同步未启用；当前任务的查询结果已保留，可稍后再配置回填。'
  if (syncState === 'NOT_CONFIGURED') return '腾讯文档默认目标未配置；请先设置 docUrl 和 sheetName。'
  if (syncState === 'UNAVAILABLE') return syncConfig?.error || '当前服务未提供腾讯文档同步配置。'
  return '查询结果已准备好，可先预览命中行和列，再决定是否立即同步。'
}

function createTencentDocsDiagnosticState(overrides = {}) {
  return {
    loading: false,
    inspected: false,
    payload: null,
    error: null,
    checkedAt: '',
    ...overrides
  }
}

function getMissingTencentDocsHeaders(headers = []) {
  const normalizedHeaders = new Set(headers.map(normalizeTencentDocsHeader))
  return TENCENT_DOCS_REQUIRED_HEADERS.filter((header) => !normalizedHeaders.has(normalizeTencentDocsHeader(header)))
}

function normalizeTencentDocsHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '')
}

function getTencentDocsLoginStatus(syncConfig, diagnostic) {
  if (!syncConfig.available) {
    return {
      tone: 'danger',
      value: '未接入',
      detail: syncConfig.error || '当前服务未暴露腾讯文档配置接口'
    }
  }
  if (!syncConfig.enabled) {
    return {
      tone: 'warning',
      value: '未启用',
      detail: '当前未开启腾讯文档同步，不会尝试读表或回填'
    }
  }
  if (!syncConfig.defaultTargetConfigured) {
    return {
      tone: 'warning',
      value: '待配置',
      detail: '默认目标未配置，暂时无法检查登录态和工作表'
    }
  }
  if (diagnostic.loading) {
    return {
      tone: 'info',
      value: '检查中',
      detail: '正在读取默认工作表并确认登录态'
    }
  }
  if (diagnostic.error?.code === 'TENCENT_DOCS_LOGIN_REQUIRED') {
    return {
      tone: 'danger',
      value: '需登录',
      detail: '腾讯文档当前未登录，请先在持久化 profile 中完成登录'
    }
  }
  if (diagnostic.payload) {
    return {
      tone: 'success',
      value: '已登录',
      detail: `已读到 ${diagnostic.payload.rowCount || 0} 行预览数据`
    }
  }
  if (diagnostic.error) {
    return {
      tone: 'danger',
      value: '检查失败',
      detail: diagnostic.error.message || '腾讯文档读表失败'
    }
  }
  return {
    tone: 'warning',
    value: '待检查',
    detail: '建议先点“立即诊断”确认登录态和工作表状态'
  }
}

function getTencentDocsSheetStatus(syncConfig, diagnostic, missingHeaders) {
  if (!syncConfig.available) {
    return {
      tone: 'danger',
      value: '未接入',
      detail: syncConfig.error || '当前服务未暴露腾讯文档配置接口'
    }
  }
  if (!syncConfig.enabled) {
    return {
      tone: 'warning',
      value: '未启用',
      detail: '启用后才会检查工作表和模板列'
    }
  }
  if (!syncConfig.defaultTargetConfigured) {
    return {
      tone: 'warning',
      value: '待配置',
      detail: '请先设置默认工作表名和文档地址'
    }
  }
  if (diagnostic.loading) {
    return {
      tone: 'info',
      value: '检查中',
      detail: '正在拉取表头和选区预览'
    }
  }
  if (diagnostic.error?.code === 'TENCENT_DOCS_SHEET_NOT_FOUND') {
    return {
      tone: 'danger',
      value: '表不存在',
      detail: diagnostic.error.message
    }
  }
  if (diagnostic.error?.code === 'TENCENT_DOCS_READ_FAILED') {
    return {
      tone: 'danger',
      value: '读表失败',
      detail: diagnostic.error.message
    }
  }
  if (diagnostic.payload && missingHeaders.length === 0) {
    return {
      tone: 'success',
      value: '表头完整',
      detail: `关键列已就绪：${TENCENT_DOCS_REQUIRED_HEADERS.length} 项`
    }
  }
  if (diagnostic.payload && missingHeaders.length > 0) {
    return {
      tone: 'warning',
      value: '缺少列',
      detail: `缺少 ${missingHeaders.length} 个关键列，补齐后再同步更稳妥`
    }
  }
  return {
    tone: 'warning',
    value: '待检查',
    detail: '建议先点“立即诊断”读取真实表头'
  }
}

function normalizeStatusTone(tone) {
  return tone === 'neutral' ? 'info' : tone
}

function stopPropagation(event) {
  event?.stopPropagation?.()
}

function supportsClipboardImage() {
  return typeof window !== 'undefined' && typeof window.ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write)
}
