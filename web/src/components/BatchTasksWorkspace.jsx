import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { parseTaskBatchInput } from '../lib/taskBatch'
import {
  formatDateTime,
  formatMetricValue,
  formatTaskLoginStatus,
  formatTaskQueryStatus,
  getTaskQueryTone,
  isTaskFinished
} from '../lib/ui'

const METRIC_ORDER = [
  '内容查看次数',
  '内容查看人数',
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
  const [batchErrors, setBatchErrors] = useState([])
  const [actionLoading, setActionLoading] = useState({})
  const [copyingTaskId, setCopyingTaskId] = useState('')

  const loadTasks = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const payload = await api.listTasks()
      setTasks(payload.tasks || [])
      setError('')
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      if (!silent) setLoading(false)
    }
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

  const activeTasks = useMemo(
    () => tasks.filter((task) => !isTaskFinished(task)),
    [tasks]
  )
  const finishedTasks = useMemo(
    () => tasks.filter((task) => isTaskFinished(task)),
    [tasks]
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    const parsed = parseTaskBatchInput(batchInput)
    setBatchErrors(parsed.errors)
    if (parsed.errors.length > 0) return

    setSubmitting(true)
    try {
      await api.createTaskBatch(parsed.tasks)
      setBatchInput('')
      setBatchErrors([])
      await loadTasks({ silent: true })
    } catch (nextError) {
      const items = nextError.details?.items || []
      if (items.length > 0) {
        setBatchErrors(items.map((item) => ({ line: Number(item.index) + 1, message: item.message })))
      } else {
        setBatchErrors([{ line: 0, message: nextError.message }])
      }
    } finally {
      setSubmitting(false)
    }
  }

  const runTaskAction = async (taskId, action) => {
    setActionLoading((current) => ({ ...current, [taskId]: true }))
    try {
      await action()
      await loadTasks({ silent: true })
    } finally {
      setActionLoading((current) => ({ ...current, [taskId]: false }))
    }
  }

  const handleRefreshLogin = async (taskId) => {
    await runTaskAction(taskId, () => api.refreshTaskLogin(taskId))
  }

  const handleRetryQuery = async (taskId) => {
    await runTaskAction(taskId, () => api.retryTaskQuery(taskId))
  }

  const handleDeleteTask = async (taskId) => {
    const confirmed = window.confirm(`确认删除任务 ${taskId} 吗？`)
    if (!confirmed) return
    await runTaskAction(taskId, () => api.deleteTask(taskId))
  }

  const handleCopyQr = async (task) => {
    if (!task.qrImageUrl || !supportsClipboardImage()) return
    setCopyingTaskId(task.taskId)
    try {
      const response = await fetch(task.qrImageUrl, { credentials: 'include' })
      const blob = await response.blob()
      const item = new window.ClipboardItem({ [blob.type || 'image/png']: blob })
      await navigator.clipboard.write([item])
    } finally {
      window.setTimeout(() => setCopyingTaskId(''), 1200)
    }
  }

  return (
    <section className="tasks-workspace stack-lg">
      <section className="panel stack-md">
        <div className="compact-panel-header">
          <div>
            <h2>批量建任务</h2>
            <p>每行一条任务，格式支持“备注,内容ID”或“备注&lt;TAB&gt;内容ID”。创建后会同步生成多个二维码。</p>
          </div>
        </div>
        <form className="stack-md" onSubmit={handleSubmit}>
          <label className="field">
            <span>批量任务输入</span>
            <textarea
              className="batch-textarea"
              placeholder={'达人A,554608495125\n达人B\t537029503554'}
              value={batchInput}
              onChange={(event) => setBatchInput(event.target.value)}
            />
          </label>
          {batchErrors.length > 0 ? (
            <div className="inline-error stack-sm">
              {batchErrors.map((item, index) => (
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

      <section className="panel stack-md">
        <div className="panel-split-header">
          <div className="compact-panel-header">
            <h2>进行中任务</h2>
            <p>适合直接复制/下载二维码后发送到微信群，扫码成功后会自动开始查询。</p>
          </div>
          <span className="section-counter">{activeTasks.length}</span>
        </div>
        {loading ? <div className="result-empty-state"><strong>任务加载中...</strong></div> : null}
        {!loading && error ? <div className="inline-error">{error}</div> : null}
        {!loading && !error && activeTasks.length === 0 ? (
          <div className="result-empty-state">
            <strong>当前没有进行中的任务</strong>
            <p>先在上方批量创建任务，系统会为每条任务生成独立二维码。</p>
          </div>
        ) : null}
        {!loading && !error ? (
          <div className="task-list">
            {activeTasks.map((task) => (
              <TaskCard
                key={task.taskId}
                task={task}
                busy={Boolean(actionLoading[task.taskId])}
                copying={copyingTaskId === task.taskId}
                onCopyQr={handleCopyQr}
                onRefreshLogin={handleRefreshLogin}
                onRetryQuery={handleRetryQuery}
                onDeleteTask={handleDeleteTask}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="panel stack-md">
        <div className="panel-split-header">
          <div className="compact-panel-header">
            <h2>已完成 / 异常任务</h2>
            <p>查询结果、失败原因、原图和日志都会保存在这里，便于后续补查。</p>
          </div>
          <span className="section-counter">{finishedTasks.length}</span>
        </div>
        {!loading && !error && finishedTasks.length === 0 ? (
          <div className="result-empty-state">
            <strong>还没有完成的任务</strong>
            <p>完成扫码并拉取数据后，这里会自动展示结果和异常信息。</p>
          </div>
        ) : null}
        {!loading && !error ? (
          <div className="task-list">
            {finishedTasks.map((task) => (
              <TaskCard
                key={task.taskId}
                task={task}
                busy={Boolean(actionLoading[task.taskId])}
                copying={copyingTaskId === task.taskId}
                onCopyQr={handleCopyQr}
                onRefreshLogin={handleRefreshLogin}
                onRetryQuery={handleRetryQuery}
                onDeleteTask={handleDeleteTask}
              />
            ))}
          </div>
        ) : null}
      </section>
    </section>
  )
}

function TaskCard({ task, busy, copying, onCopyQr, onRefreshLogin, onRetryQuery, onDeleteTask }) {
  const canCopyQr = Boolean(task.qrImageUrl && supportsClipboardImage())
  const canRefresh = !['QUEUED', 'RUNNING'].includes(task.query.status)
  const canRetry = Boolean(task.accountId) && !['QUEUED', 'RUNNING', 'SUCCEEDED'].includes(task.query.status)
  const canDelete = task.query.status !== 'RUNNING'
  const showQr = Boolean(task.qrImageUrl && ['WAITING_QR', 'WAITING_CONFIRM'].includes(task.login.status))

  return (
    <article className="task-card stack-md">
      <div className="task-card-header">
        <div className="stack-sm">
          <strong className="task-title">{task.remark || '未命名任务'}</strong>
          <div className="task-subtitle">内容 ID：{task.contentId}</div>
          <div className="task-subtitle">更新时间：{formatDateTime(task.updatedAt)}</div>
        </div>
        <div className="task-status-pills">
          <span className={`status-pill status-${task.login.status === 'LOGGED_IN' ? 'success' : task.login.status === 'WAITING_CONFIRM' || task.login.status === 'WAITING_QR' ? 'info' : task.login.status === 'EXPIRED' ? 'warning' : 'danger'}`}>
            登录：{formatTaskLoginStatus(task.login.status)}
          </span>
          <span className={`status-pill status-${getTaskQueryTone(task.query.status)}`}>
            查询：{formatTaskQueryStatus(task.query.status)}
          </span>
        </div>
      </div>

      <div className="task-meta-grid">
        <div className="meta-card compact-meta-card">
          <span>登录账号</span>
          <strong>{task.accountNickname || '待扫码'}</strong>
          <small>{task.accountId || '二维码扫码成功后自动回填'}</small>
        </div>
        <div className="meta-card compact-meta-card">
          <span>任务 ID</span>
          <strong>{task.taskId}</strong>
          <small>{task.loginSessionId || '当前无活跃登录会话'}</small>
        </div>
      </div>

      {task.error?.message ? (
        <div className={`task-state-banner tone-${getTaskQueryTone(task.query.status)}`}>
          <strong>{task.error.message}</strong>
          <small>{task.error.code || 'TASK_ERROR'}</small>
        </div>
      ) : null}

      <div className="task-qr-layout">
        <div className="task-qr-panel">
          <div className="task-qr-header">
            <strong>二维码</strong>
            <small>{showQr ? '可直接下载或复制图片发到微信群。' : '当前状态下不展示可扫码二维码。'}</small>
          </div>
          <div className="qr-wrap task-qr-wrap">
            {showQr ? (
              <img className="qr-image" src={task.qrImageUrl} alt={`任务 ${task.remark} 的二维码`} />
            ) : (
              <div className="task-qr-placeholder">
                <strong>{formatTaskLoginStatus(task.login.status)}</strong>
                <small>需要刷新二维码时，直接使用下方按钮重新生成。</small>
              </div>
            )}
          </div>
        </div>

        <TaskResultPreview task={task} />
      </div>

      <div className="task-actions">
        <a
          className="secondary-btn inline-link-btn"
          href={task.qrImageUrl || '#'}
          download={`task-${task.taskId}-qr.png`}
          aria-disabled={!task.qrImageUrl}
          onClick={(event) => {
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
        <button className="secondary-btn" type="button" disabled={!canRetry || busy} onClick={() => onRetryQuery(task.taskId)}>
          重试查询
        </button>
        <button className="secondary-btn danger-ghost-btn" type="button" disabled={!canDelete || busy} onClick={() => onDeleteTask(task.taskId)}>
          删除任务
        </button>
      </div>
    </article>
  )
}

function TaskResultPreview({ task }) {
  const [activeTab, setActiveTab] = useState('summary')
  const previewImageUrl = activeTab === 'summary' ? task.screenshots?.summaryUrl : task.screenshots?.rawUrl

  useEffect(() => {
    setActiveTab('summary')
  }, [task.taskId, task.screenshots?.summaryUrl, task.screenshots?.rawUrl])

  if (task.query.status === 'SUCCEEDED') {
    return (
      <div className="task-result-panel stack-md">
        <div className="metrics-grid task-metrics-grid">
          {METRIC_ORDER.map((metric) => (
            <div key={metric} className="metric-card compact-metric-card">
              <span>{metric}</span>
              <strong>{formatMetricValue(task.metrics?.[metric]?.value)}</strong>
              <small>{task.metrics?.[metric]?.field || '-'}</small>
            </div>
          ))}
        </div>

        <div className="result-actions-row">
          {task.artifacts?.resultUrl ? <a className="secondary-btn inline-link-btn" href={task.artifacts.resultUrl} target="_blank" rel="noreferrer">打开结果 JSON</a> : null}
          {task.artifacts?.networkLogUrl ? <a className="secondary-btn inline-link-btn" href={task.artifacts.networkLogUrl} target="_blank" rel="noreferrer">打开网络日志</a> : null}
        </div>

        <div className="image-panel task-image-panel">
          <div className="image-panel-header">
            <div className="tabs-switcher" role="tablist" aria-label={`任务 ${task.taskId} 截图切换`}>
              <button className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('summary')}>汇总截图</button>
              <button className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('raw')}>原始截图</button>
            </div>
            <small>{task.fetchedAt ? formatDateTime(task.fetchedAt) : '已生成查询结果'}</small>
          </div>
          <div className="image-stage compact-image-stage">
            {previewImageUrl ? <img className="result-image" src={previewImageUrl} alt={activeTab === 'summary' ? '任务汇总截图' : '任务原始截图'} /> : <div className="result-empty-state compact-empty-state"><strong>暂无截图</strong></div>}
          </div>
        </div>
      </div>
    )
  }

  if (task.query.status === 'NO_DATA' || task.query.status === 'FAILED') {
    return (
      <div className="task-result-panel stack-md">
        <div className={`result-state-card tone-${getTaskQueryTone(task.query.status)}`}>
          <div className="result-state-bar">
            <div>
              <span className="result-state-label">结果</span>
              <strong>{formatTaskQueryStatus(task.query.status)}</strong>
            </div>
            <small>{task.error?.code || 'TASK_RESULT'}</small>
          </div>
          <p>{task.error?.message || '任务已结束，请查看下方截图和日志。'}</p>
          <div className="result-actions-row">
            {task.screenshots?.rawUrl ? <a className="secondary-btn inline-link-btn" href={task.screenshots.rawUrl} target="_blank" rel="noreferrer">打开原图</a> : null}
            {task.artifacts?.networkLogUrl ? <a className="secondary-btn inline-link-btn" href={task.artifacts.networkLogUrl} target="_blank" rel="noreferrer">打开网络日志</a> : null}
          </div>
          {task.screenshots?.rawUrl ? <img className="result-image" src={task.screenshots.rawUrl} alt="任务异常截图" /> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="task-result-panel task-placeholder-panel">
      <div className="result-empty-state compact-empty-state">
        <strong>等待自动查询</strong>
        <p>扫码成功并确认登录后，这里会自动刷新出 5 项指标、截图和日志链接。</p>
      </div>
    </div>
  )
}

function supportsClipboardImage() {
  return typeof window !== 'undefined' && typeof window.ClipboardItem !== 'undefined' && Boolean(navigator.clipboard?.write)
}
