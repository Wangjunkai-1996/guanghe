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
  { value: 'all', label: '全部' },
  { value: 'waiting', label: '待扫码' },
  { value: 'in-progress', label: '进行中' },
  { value: 'exception', label: '异常' },
  { value: 'finished', label: '已完成' }
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

  const textareaRef = useRef(null)

  const loadTasks = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const payload = await api.listTasks()
      setTasks(payload.tasks || [])
      setError('')
      return payload.tasks || []
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

  const draftValidation = useMemo(() => parseTaskBatchInput(batchInput), [batchInput])
  const draftLines = useMemo(() => countNonEmptyLines(batchInput), [batchInput])
  const displayBatchErrors = serverBatchErrors.length > 0 ? serverBatchErrors : draftValidation.errors

  const filteredTasks = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase()
    return [...tasks]
      .filter((task) => matchesFilter(task, filterKey))
      .filter((task) => {
        if (!keyword) return true
        return [task.remark, task.contentId, task.accountNickname]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      })
      .sort(compareTasks)
  }, [filterKey, searchValue, tasks])

  const selectedTask = useMemo(
    () => filteredTasks.find((task) => task.taskId === selectedTaskId) || null,
    [filteredTasks, selectedTaskId]
  )

  useEffect(() => {
    if (!selectedTaskId) return
    if (!selectedTask) {
      setSelectedTaskId('')
      setIsDetailOpen(false)
    }
  }, [selectedTask, selectedTaskId])

  const handleRefreshList = async () => {
    await loadTasks()
    pushToast('任务列表已刷新', 'success')
  }

  const handleBuilderToggle = () => {
    setBuilderTouched(true)
    setIsBuilderOpen((current) => !current)
    if (!isBuilderOpen) {
      window.requestAnimationFrame(() => textareaRef.current?.focus())
    }
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
    if (selectedTaskId === taskId) {
      setSelectedTaskId('')
      setIsDetailOpen(false)
    }
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

  const waitingCount = tasks.filter((task) => isWaitingTask(task)).length
  const exceptionCount = tasks.filter((task) => isExceptionalTask(task)).length

  return (
    <section className="tasks-workspace stack-lg">
      <div className="tasks-toolbar-shell stack-md">
        <section className="panel tasks-toolbar-panel stack-md">
          <div className="tasks-toolbar-top">
            <div className="compact-panel-header">
              <h2>批量任务工作台</h2>
              <p>先筛出待扫码任务，再从右侧详情抽屉下载/复制二维码发到微信群，扫码成功后系统会自动查询。</p>
            </div>
            <div className="tasks-toolbar-actions">
              <button className="primary-btn" type="button" onClick={handleBuilderToggle}>
                {isBuilderOpen ? '收起新建任务' : '新建任务'}
              </button>
              <button className="secondary-btn" type="button" onClick={handleRefreshList}>
                刷新列表
              </button>
            </div>
          </div>

          <div className="tasks-toolbar-filters">
            <label className="toolbar-search-field">
              <span>搜索</span>
              <input
                type="search"
                placeholder="搜索备注、内容 ID、账号昵称"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
              />
            </label>

            <label className="toolbar-select-field">
              <span>状态筛选</span>
              <select value={filterKey} onChange={(event) => setFilterKey(event.target.value)}>
                {FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <div className="toolbar-chip-group" role="group" aria-label="快捷筛选">
              <button
                className={`toolbar-chip-btn ${filterKey === 'waiting' ? 'active' : ''}`}
                type="button"
                onClick={() => setFilterKey('waiting')}
              >
                仅看待扫码 ({waitingCount})
              </button>
              <button
                className={`toolbar-chip-btn ${filterKey === 'exception' ? 'active' : ''}`}
                type="button"
                onClick={() => setFilterKey('exception')}
              >
                仅看异常 ({exceptionCount})
              </button>
              <button className="toolbar-chip-btn" type="button" onClick={() => setFilterKey('all')}>
                查看全部
              </button>
            </div>
          </div>
        </section>

        {isBuilderOpen ? (
          <section className="panel task-builder-panel stack-md">
            <div className="panel-split-header">
              <div className="compact-panel-header">
                <h2>新建批量任务</h2>
                <p>每行一条，支持“备注,内容ID”或“备注&lt;TAB&gt;内容ID”，创建后会立即生成二维码。</p>
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
            </div>

            <form className="stack-md" onSubmit={handleSubmit}>
              <label className="field">
                <span>批量任务输入</span>
                <textarea
                  ref={textareaRef}
                  className="batch-textarea"
                  placeholder={'达人A,554608495125\n达人B\t537029503554'}
                  value={batchInput}
                  onChange={(event) => {
                    setBatchInput(event.target.value)
                    if (serverBatchErrors.length > 0) setServerBatchErrors([])
                  }}
                />
              </label>
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
                <small>建议一次控制在 1–5 个任务内，便于稳定扫码和自动查询。</small>
              </div>
            </form>
          </section>
        ) : null}
      </div>

      <div className="task-board-layout">
        <section className="panel task-table-panel stack-md">
          <div className="panel-split-header">
            <div className="compact-panel-header">
              <h2>任务列表</h2>
              <p>默认按待扫码、进行中、异常、已完成排序。点击任一任务行，在右侧查看二维码和结果详情。</p>
            </div>
            <span className="section-counter">{filteredTasks.length}/{tasks.length}</span>
          </div>

          {loading ? <div className="result-empty-state"><strong>任务加载中...</strong></div> : null}
          {!loading && error ? <div className="inline-error">{error}</div> : null}
          {!loading && !error && tasks.length === 0 ? (
            <div className="result-empty-state">
              <strong>还没有任务</strong>
              <p>点击上方“新建任务”后粘贴多行任务，即可批量生成二维码。</p>
            </div>
          ) : null}
          {!loading && !error && tasks.length > 0 && filteredTasks.length === 0 ? (
            <div className="result-empty-state">
              <strong>没有匹配当前筛选条件的任务</strong>
              <p>可以切回“全部”，或者清空搜索关键字后再查看。</p>
            </div>
          ) : null}

          {!loading && !error && filteredTasks.length > 0 ? (
            <>
              <div className="task-table-header" role="presentation">
                <span>备注</span>
                <span>内容 ID</span>
                <span>登录状态</span>
                <span>查询状态</span>
                <span>账号</span>
                <span>更新时间</span>
                <span>快捷操作</span>
              </div>
              <div className="task-table-body">
                {filteredTasks.map((task) => (
                  <TaskRow
                    key={task.taskId}
                    task={task}
                    selected={isDetailOpen && selectedTaskId === task.taskId}
                    busy={Boolean(actionLoading[task.taskId])}
                    copying={copyingTaskId === task.taskId}
                    onSelect={openTaskDetail}
                    onCopyQr={handleCopyQr}
                    onRefreshLogin={handleRefreshLogin}
                    onRetryQuery={handleRetryQuery}
                    onDeleteTask={handleDeleteTask}
                  />
                ))}
              </div>
            </>
          ) : null}
        </section>

        <TaskDetailDrawer
          task={selectedTask}
          open={isDetailOpen}
          busy={selectedTask ? Boolean(actionLoading[selectedTask.taskId]) : false}
          copying={selectedTask ? copyingTaskId === selectedTask.taskId : false}
          onClose={() => setIsDetailOpen(false)}
          onCopyQr={handleCopyQr}
          onRefreshLogin={handleRefreshLogin}
          onRetryQuery={handleRetryQuery}
          onDeleteTask={handleDeleteTask}
        />
      </div>

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

function TaskRow({ task, selected, busy, copying, onSelect, onCopyQr, onRefreshLogin, onRetryQuery, onDeleteTask }) {
  const canCopyQr = Boolean(task.qrImageUrl && supportsClipboardImage())
  const canRefresh = !['QUEUED', 'RUNNING'].includes(task.query.status)
  const canRetry = Boolean(task.accountId) && !['QUEUED', 'RUNNING', 'SUCCEEDED'].includes(task.query.status)

  return (
    <article
      className={`task-table-row ${selected ? 'selected' : ''} ${isWaitingTask(task) ? 'highlighted' : ''}`}
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
      <div className="task-row-main">
        <strong>{task.remark || '未命名任务'}</strong>
        <small>{task.error?.message || '点击查看二维码、截图和处理建议'}</small>
      </div>
      <div className="task-row-cell mono-cell">{task.contentId}</div>
      <div className="task-row-cell">
        <span className={`status-pill status-${getTaskLoginTone(task.login.status)}`}>
          {formatTaskLoginStatus(task.login.status)}
        </span>
      </div>
      <div className="task-row-cell">
        <span className={`status-pill status-${getTaskQueryTone(task.query.status)}`}>
          {formatTaskQueryStatus(task.query.status)}
        </span>
      </div>
      <div className="task-row-cell">
        <strong>{task.accountNickname || '待扫码'}</strong>
        <small>{task.accountId || '-'}</small>
      </div>
      <div className="task-row-cell">
        <strong>{formatDateTime(task.updatedAt)}</strong>
        <small>{task.taskId}</small>
      </div>
      <div className="task-row-actions" onClick={stopPropagation}>
        <button className="row-action-btn" type="button" onClick={() => onSelect(task.taskId)}>查看详情</button>
        <a
          className={`row-action-btn ${!task.qrImageUrl ? 'disabled' : ''}`}
          href={task.qrImageUrl || '#'}
          download={`task-${task.taskId}-qr.png`}
          onClick={(event) => {
            stopPropagation(event)
            if (!task.qrImageUrl) event.preventDefault()
          }}
        >
          下载二维码
        </a>
        <button className="row-action-btn" type="button" disabled={!canCopyQr || busy} onClick={() => onCopyQr(task)}>
          {copying ? '已复制' : '复制二维码'}
        </button>
        <button className="row-action-btn" type="button" disabled={!canRefresh || busy} onClick={() => onRefreshLogin(task.taskId)}>刷新</button>
        <button className="row-action-btn" type="button" disabled={!canRetry || busy} onClick={() => onRetryQuery(task.taskId)}>重试</button>
        <button className="row-action-btn danger" type="button" disabled={task.query.status === 'RUNNING' || busy} onClick={() => onDeleteTask(task.taskId)}>删除</button>
      </div>
    </article>
  )
}

function TaskDetailDrawer({ task, open, busy, copying, onClose, onCopyQr, onRefreshLogin, onRetryQuery, onDeleteTask }) {
  const [activeTab, setActiveTab] = useState('summary')

  useEffect(() => {
    setActiveTab('summary')
  }, [task?.taskId, task?.screenshots?.summaryUrl, task?.screenshots?.rawUrl])

  if (!open || !task) {
    return (
      <aside className="panel task-detail-drawer placeholder stack-md">
        <div className="compact-panel-header">
          <h2>任务详情</h2>
          <p>从左侧任务列表选择一条任务，这里会集中展示二维码、指标结果和下一步操作。</p>
        </div>
        <div className="result-empty-state compact-empty-state">
          <strong>尚未选择任务</strong>
          <p>建议先筛选“待扫码”并点击任务行，这样发码和后续跟进都会更顺手。</p>
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
          <h2>任务详情</h2>
          <p>二维码和结果都只在这里查看，减少主列表滚动和视觉干扰。</p>
        </div>
        <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭任务详情">×</button>
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

function stopPropagation(event) {
  event?.stopPropagation?.()
}

function supportsClipboardImage() {
  return typeof window !== 'undefined' && typeof window.ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write)
}
