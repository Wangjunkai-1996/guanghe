import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { parseTaskBatchInput } from '../lib/taskBatch'
import {
  formatDateTime,
  formatMetricValue,
  formatTaskLoginStatus,
  formatTaskQueryStatus,
  getTaskQueryTone
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
  const [isBuilderOpen, setIsBuilderOpen] = useState(true)
  const [builderTouched, setBuilderTouched] = useState(false)
  const [toasts, setToasts] = useState([])
  const [lastSyncedAt, setLastSyncedAt] = useState('')

  const textareaRef = useRef(null)

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

  const pushToast = useCallback((message, tone = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 2200)
  }, [])

  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      if (!cancelled) {
        await loadTasks()
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
      window.clearInterval(timer)
    }
  }, [loadTasks])

  useEffect(() => {
    if (builderTouched) return
    setIsBuilderOpen(tasks.length === 0)
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
        return [task.remark, task.contentId, task.accountNickname, task.accountId]
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
    await loadTasks()
    pushToast('任务列表已刷新', 'success')
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
  const finishedCount = tasks.filter((task) => task.query?.status === 'SUCCEEDED').length

  return (
    <section className="tasks-workspace stack-lg">
      <section className="panel tasks-overview-panel stack-lg">
        <div className="task-overview-header">
          <div className="compact-panel-header">
            <span className="section-eyebrow">主工作区</span>
            <h2>批量任务工作台</h2>
            <p>先发码，再跟状态；异常处理和结果复核都收进右侧焦点区，减少来回滚动和误点。</p>
          </div>

          <div className="tasks-toolbar-actions">
            <button className="primary-btn" type="button" onClick={isBuilderOpen ? handleBuilderClose : handleBuilderOpen}>
              {isBuilderOpen ? '关闭新建任务' : '新建任务'}
            </button>
            <button className="secondary-btn" type="button" onClick={handleRefreshList}>
              {loading ? '同步中...' : '立即同步'}
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
              <p>先点“新建任务”，粘贴多行内容 ID，即可批量生成二维码并开始跟进。</p>
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
          onClose={() => setIsDetailOpen(false)}
          onCopyQr={handleCopyQr}
          onRefreshLogin={handleRefreshLogin}
          onRetryQuery={handleRetryQuery}
          onDeleteTask={handleDeleteTask}
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

function TaskCard({ task, selected, recommended, onSelect }) {
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
            {recommended ? <span className="task-priority-pill">建议先看</span> : null}
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
      </div>

      <div className="task-meta-grid">
        <div className="task-meta-item">
          <span>内容 ID</span>
          <strong className="mono-cell">{task.contentId}</strong>
        </div>
        <div className="task-meta-item">
          <span>账号</span>
          <strong>{task.accountNickname || '待扫码'}</strong>
        </div>
        <div className="task-meta-item">
          <span>更新时间</span>
          <strong>{formatDateTime(task.updatedAt)}</strong>
        </div>
      </div>

      {task.error?.message ? <div className="task-inline-hint">{task.error.message}</div> : null}
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
  onClose,
  onCopyQr,
  onRefreshLogin,
  onRetryQuery,
  onDeleteTask,
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
  const canCopyQr = Boolean(task.qrImageUrl && supportsClipboardImage())
  const canRefresh = !['QUEUED', 'RUNNING'].includes(task.query.status)
  const canRetry = Boolean(task.accountId) && !['QUEUED', 'RUNNING', 'SUCCEEDED'].includes(task.query.status)
  const showQr = Boolean(task.qrImageUrl && ['WAITING_QR', 'WAITING_CONFIRM'].includes(task.login.status))

  return (
    <aside className="panel task-detail-drawer stack-md">
      <div className="task-detail-header">
        <div className="compact-panel-header">
          <span className="section-eyebrow">焦点区</span>
          <h2>任务详情</h2>
          <p>二维码和结果都只在这里查看，主列表只负责排队和筛选。</p>
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
      </div>

      <div className="task-detail-section stack-md">
        <div className="task-detail-title-row">
          <strong>{task.remark || '未命名任务'}</strong>
          <div className="task-status-pills">
            <span className={`status-pill status-${getTaskLoginTone(task.login.status)}`}>登录：{formatTaskLoginStatus(task.login.status)}</span>
            <span className={`status-pill status-${getTaskQueryTone(task.query.status)}`}>查询：{formatTaskQueryStatus(task.query.status)}</span>
          </div>
        </div>

        <div className="task-summary-grid">
          <div className="meta-card compact-meta-card"><span>内容 ID</span><strong>{task.contentId}</strong><small>任务 ID：{task.taskId}</small></div>
          <div className="meta-card compact-meta-card"><span>登录账号</span><strong>{task.accountNickname || '待扫码'}</strong><small>{task.accountId || '扫码成功后自动回填'}</small></div>
          <div className="meta-card compact-meta-card"><span>更新时间</span><strong>{formatDateTime(task.updatedAt)}</strong><small>{task.fetchedAt ? `查询时间：${formatDateTime(task.fetchedAt)}` : '等待自动查询'}</small></div>
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
            <button className="secondary-btn" type="button" disabled={!canCopyQr || busy} onClick={() => onCopyQr(task)}>
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
        <button className="secondary-btn danger-ghost-btn" type="button" disabled={task.query.status === 'RUNNING' || busy} onClick={() => onDeleteTask(task.taskId)}>
          删除任务
        </button>
      </div>
    </aside>
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

function matchesFilter(task, filterKey) {
  if (filterKey === 'waiting') return isWaitingTask(task)
  if (filterKey === 'in-progress') return isInProgressTask(task)
  if (filterKey === 'exception') return isExceptionalTask(task)
  if (filterKey === 'finished') return task.query?.status === 'SUCCEEDED'
  return true
}

function isWaitingTask(task) {
  return ['WAITING_QR', 'WAITING_CONFIRM'].includes(task.login?.status)
}

function isInProgressTask(task) {
  return ['QUEUED', 'RUNNING'].includes(task.query?.status) || (task.login?.status === 'LOGGED_IN' && task.query?.status === 'IDLE')
}

function isExceptionalTask(task) {
  return ['NO_DATA', 'FAILED'].includes(task.query?.status) || ['EXPIRED', 'FAILED', 'INTERRUPTED'].includes(task.login?.status)
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
  if (task.query?.status === 'SUCCEEDED') return 3
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
  if (isExceptionalTask(task)) return 'danger'
  if (task.query?.status === 'SUCCEEDED') return 'success'
  if (isWaitingTask(task)) return 'info'
  return 'warning'
}

function getTaskSummary(task) {
  if (task.error?.message) return task.error.message
  if (task.query?.status === 'SUCCEEDED') return '5 项指标、截图和结果文件都已生成，可直接复核。'
  if (task.query?.status === 'NO_DATA') return '接口未返回目标内容，建议查看原图和网络日志。'
  if (task.query?.status === 'FAILED') return '查询流程异常结束，建议先看原图和错误信息。'
  if (task.query?.status === 'QUEUED') return '任务已进入查询队列，系统会自动执行。'
  if (task.query?.status === 'RUNNING') return '正在自动查询中，可先继续处理下一条二维码任务。'
  if (task.login?.status === 'WAITING_CONFIRM') return '已扫码，等待手机确认，确认后会自动开始查询。'
  if (task.login?.status === 'WAITING_QR') return '先把二维码发出去，扫码成功后会自动进入查询流程。'
  if (task.login?.status === 'LOGGED_IN') return '登录成功，等待自动查询或可手动重试。'
  return '点击查看二维码、结果和下一步建议。'
}

function getTaskPrimaryActionLabel(task) {
  if (isWaitingTask(task)) return '去发码'
  if (isExceptionalTask(task)) return '处理异常'
  if (task.query?.status === 'SUCCEEDED') return '查看结果'
  return '查看进度'
}

function getWorkspaceHeadline(tasks, filteredTasks) {
  if (tasks.length === 0) return '先新建第一批任务，工作台会自动接管后续扫码和查询跟进。'
  if (filteredTasks.length === 0) return '当前筛选下没有任务，切回全部即可继续处理。'

  const waitingCount = tasks.filter((task) => isWaitingTask(task)).length
  const exceptionCount = tasks.filter((task) => isExceptionalTask(task)).length
  const inProgressCount = tasks.filter((task) => isInProgressTask(task)).length

  if (waitingCount > 0) return `当前有 ${waitingCount} 条待扫码任务，建议优先发码。`
  if (exceptionCount > 0) return `当前有 ${exceptionCount} 条异常任务，建议先处理失败和无数据情况。`
  if (inProgressCount > 0) return `当前有 ${inProgressCount} 条任务正在推进，可继续观察自动查询结果。`
  return '所有任务都已进入完成状态，可按需抽查结果和截图。'
}

function getFilterDescription(filterKey) {
  const current = FILTER_OPTIONS.find((option) => option.value === filterKey)
  if (!current) return '按优先级展示任务，点击任一任务即可进入右侧焦点区。'
  if (filterKey === 'all') return '按优先级展示任务，优先把注意力放在待扫码和异常项。'
  return `当前聚焦：${current.label}。点击任一任务即可在右侧集中处理。`
}

function stopPropagation(event) {
  event?.stopPropagation?.()
}

function supportsClipboardImage() {
  return typeof window !== 'undefined' && typeof window.ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write)
}
