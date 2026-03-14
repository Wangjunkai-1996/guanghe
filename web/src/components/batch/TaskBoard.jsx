import { useEffect, useId, useRef } from 'react'
import { CircleAlert, CircleCheckBig, LoaderCircle, QrCode, Search, Sparkles, Workflow } from 'lucide-react'
import { formatDateTime } from '../../lib/ui'
import {
  getFilterDescription,
  getTaskPriority,
  getWorkspaceHeadline,
  isExceptionalTask,
  isFinishedTask,
  isInProgressTask,
  isWaitingTask
} from '../../lib/taskFormat'
import { TaskCard } from '../TaskComponents'
import { TaskDetailPane } from '../task/TaskDetailPane'
import { EmptyState } from '../ui/EmptyState'
import { SectionCard } from '../ui/SectionCard'

const FILTER_OPTIONS = [
  { value: 'all', label: '全部任务', tone: 'neutral', icon: Workflow },
  { value: 'waiting', label: '待扫码', tone: 'info', icon: QrCode },
  { value: 'in-progress', label: '进行中', tone: 'warning', icon: LoaderCircle },
  { value: 'exception', label: '异常', tone: 'danger', icon: CircleAlert },
  { value: 'finished', label: '已完成', tone: 'success', icon: CircleCheckBig }
]
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

export function TaskBoard({
  tasks,
  filteredTasks,
  filterKey,
  searchValue,
  setFilterKey,
  setSearchValue,
  lastSyncedAt,
  loading,
  error,
  onRetryLoad,
  selectedTaskId,
  selectedTask,
  onSelectTask,
  onCloseTaskDetail,
  syncConfig,
  syncPreviewState,
  syncActionLoading,
  copyingTaskId,
  actionLoading,
  onCopyQr,
  onRefreshLogin,
  onSubmitSmsCode,
  onRetryQuery,
  onDeleteTask,
  onPreviewSync,
  onSyncTask,
  onClearFilters
}) {
  const mobileDetailTitleId = useId()
  const mobileDetailPanelRef = useRef(null)
  const waitingCount = tasks.filter((task) => isWaitingTask(task)).length
  const inProgressCount = tasks.filter((task) => isInProgressTask(task)).length
  const exceptionCount = tasks.filter((task) => isExceptionalTask(task)).length
  const finishedCount = tasks.filter((task) => isFinishedTask(task)).length

  useEffect(() => {
    if (!selectedTask || typeof window === 'undefined' || window.innerWidth > 900) return undefined

    const panel = mobileDetailPanelRef.current
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseTaskDetail()
        return
      }

      if (event.key !== 'Tab' || !panel) return

      const focusableElements = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
      if (!focusableElements.length) {
        event.preventDefault()
        panel.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey) {
        if (activeElement === firstElement || activeElement === panel) {
          event.preventDefault()
          lastElement.focus()
        }
        return
      }

      if (activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    window.requestAnimationFrame(() => {
      const focusableElements = Array.from(panel?.querySelectorAll(FOCUSABLE_SELECTOR) || [])
      if (focusableElements.length > 0) {
        focusableElements[0].focus()
        return
      }
      panel?.focus()
    })

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [onCloseTaskDetail, selectedTask])

  return (
    <SectionCard className="batch-task-board stack-lg" variant="feature">
      <div className="task-overview-header">
        <div className="compact-panel-header">
          <span className="section-eyebrow">任务执行区</span>
          <h2>批量任务队列</h2>
          <p>把筛选、扫码、查询结果和腾讯文档回填放到同一块任务画布里，减少来回折叠和视线跳转。</p>
        </div>
      </div>

      <div className="task-stage-grid">
        <TaskStageCard label="全部任务" value={tasks.length} tone="neutral" icon={Workflow} active={filterKey === 'all'} onClick={() => setFilterKey('all')} />
        <TaskStageCard label="待扫码" value={waitingCount} tone="info" icon={QrCode} active={filterKey === 'waiting'} onClick={() => setFilterKey('waiting')} />
        <TaskStageCard label="进行中" value={inProgressCount} tone="warning" icon={LoaderCircle} active={filterKey === 'in-progress'} onClick={() => setFilterKey('in-progress')} />
        <TaskStageCard label="异常" value={exceptionCount} tone="danger" icon={CircleAlert} active={filterKey === 'exception'} onClick={() => setFilterKey('exception')} />
        <TaskStageCard label="已完成" value={finishedCount} tone="success" icon={CircleCheckBig} active={filterKey === 'finished'} onClick={() => setFilterKey('finished')} />
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
            <button className="secondary-btn" type="button" onClick={onClearFilters}>
              查看全部
            </button>
          ) : null}
        </div>
      </div>

      <div className="task-console-layout">
        <section className="task-list-pane stack-md">
          <div className="panel-split-header">
            <div className="compact-panel-header">
              <span className="section-eyebrow">任务过滤器</span>
              <h3>任务队列</h3>
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
            <EmptyState
              eyebrow="任务队列"
              tone="danger"
              icon={CircleAlert}
              title="加载任务失败"
              description={error.message}
              actionLabel="重试加载"
              onAction={onRetryLoad}
            />
          ) : null}

          {!loading && !error && tasks.length === 0 ? (
          <EmptyState
            eyebrow="批量执行"
            tone="neutral"
            icon={Sparkles}
            title="当前没有二维码任务"
            description="可以点击顶部的“创建任务”来导入需要查询的内容 ID。"
          />
        ) : null}

          {!loading && !error && tasks.length > 0 && filteredTasks.length === 0 ? (
            <EmptyState
              eyebrow="任务过滤器"
              tone="warning"
              icon={Search}
              title="没有匹配当前筛选条件的任务"
              description="可以切回“查看全部”，或清空搜索关键字后继续查看。"
              actionLabel="清空筛选"
              onAction={onClearFilters}
            />
          ) : null}

          {!loading && !error && filteredTasks.length > 0 ? (
            <div className="task-queue-list task-master-list">
              {filteredTasks.map((task, index) => (
                <TaskCard
                  key={task.taskId}
                  task={task}
                  syncConfig={syncConfig}
                  selected={selectedTaskId === task.taskId}
                  recommended={index === 0 && filterKey === 'waiting'}
                  onSelect={onSelectTask}
                  onCopyQr={onCopyQr}
                  onRefreshLogin={onRefreshLogin}
                  onSubmitSmsCode={onSubmitSmsCode}
                  copying={copyingTaskId === task.taskId}
                  busy={Boolean(actionLoading[task.taskId])}
                />
              ))}
            </div>
          ) : null}
        </section>

        <div className="task-detail-pane-desktop">
          <TaskDetailPane
            task={selectedTask}
            busy={selectedTask ? Boolean(actionLoading[selectedTask.taskId]) : false}
            copying={selectedTask ? copyingTaskId === selectedTask.taskId : false}
            titleId={selectedTask ? `${selectedTask.taskId}-detail-title` : undefined}
            syncConfig={syncConfig}
            syncPreview={selectedTask ? syncPreviewState[selectedTask.taskId] || null : null}
            syncAction={selectedTask ? syncActionLoading[selectedTask.taskId] || '' : ''}
            onCopyQr={onCopyQr}
            onRefreshLogin={onRefreshLogin}
            onRetryQuery={onRetryQuery}
            onDeleteTask={onDeleteTask}
            onPreviewSync={onPreviewSync}
            onSyncTask={onSyncTask}
          />
        </div>
      </div>

      {selectedTask ? (
        <div className="task-detail-mobile-root">
          <button className="task-detail-mobile-backdrop" type="button" onClick={onCloseTaskDetail} aria-label="关闭任务详情抽屉" />
          <div
            ref={mobileDetailPanelRef}
            className="task-detail-mobile-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={mobileDetailTitleId}
            tabIndex={-1}
          >
            <TaskDetailPane
              task={selectedTask}
              busy={Boolean(actionLoading[selectedTask.taskId])}
              copying={copyingTaskId === selectedTask.taskId}
              titleId={mobileDetailTitleId}
              syncConfig={syncConfig}
              syncPreview={syncPreviewState[selectedTask.taskId] || null}
              syncAction={syncActionLoading[selectedTask.taskId] || ''}
              onClose={onCloseTaskDetail}
              onCopyQr={onCopyQr}
              onRefreshLogin={onRefreshLogin}
              onRetryQuery={onRetryQuery}
              onDeleteTask={onDeleteTask}
              onPreviewSync={onPreviewSync}
              onSyncTask={onSyncTask}
            />
          </div>
        </div>
      ) : null}
    </SectionCard>
  )
}

function TaskStageCard({ label, value, tone, icon: Icon, active, onClick }) {
  return (
    <button className={`task-stage-card tone-${tone} ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <span className="task-stage-card-label">
        {Icon ? <Icon size={16} aria-hidden="true" /> : null}
        <span>{label}</span>
      </span>
      <strong>{value}</strong>
    </button>
  )
}

export function compareTasks(left, right) {
  const priorityDiff = getTaskPriority(left) - getTaskPriority(right)
  if (priorityDiff !== 0) return priorityDiff
  const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime()
  const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime()
  return rightTime - leftTime
}
