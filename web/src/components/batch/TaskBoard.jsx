import { CircleAlert, CircleCheckBig, LoaderCircle, QrCode, Search, Sparkles, Workflow } from 'lucide-react'
import { formatDateTime } from '../../lib/ui'
import { getFilterDescription, getTaskPriority, getWorkspaceHeadline, isExceptionalTask, isFinishedTask, isInProgressTask, isWaitingTask } from '../../lib/taskFormat'
import { TaskCard, TaskDetailAccordion } from '../TaskComponents'
import { EmptyState } from '../ui/EmptyState'
import { SectionCard } from '../ui/SectionCard'

const FILTER_OPTIONS = [
  { value: 'all', label: '全部任务', tone: 'neutral', icon: Workflow },
  { value: 'waiting', label: '待扫码', tone: 'info', icon: QrCode },
  { value: 'in-progress', label: '进行中', tone: 'warning', icon: LoaderCircle },
  { value: 'exception', label: '异常', tone: 'danger', icon: CircleAlert },
  { value: 'finished', label: '已完成', tone: 'success', icon: CircleCheckBig }
]

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
  expandedTaskId,
  onToggleExpand,
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
  const waitingCount = tasks.filter((task) => isWaitingTask(task)).length
  const inProgressCount = tasks.filter((task) => isInProgressTask(task)).length
  const exceptionCount = tasks.filter((task) => isExceptionalTask(task)).length
  const finishedCount = tasks.filter((task) => isFinishedTask(task)).length

  return (
    <SectionCard className="batch-task-board stack-lg" variant="feature">
      <div className="task-overview-header">
        <div className="compact-panel-header">
          <span className="section-eyebrow">任务执行区</span>
          <h2>批量任务工作台</h2>
          <p>交接表驱动链路优先；这里保留任务队列、焦点区和手工兜底入口，方便补查和异常处理。</p>
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

      <section className="task-table-panel stack-md">
        <div className="panel-split-header">
          <div className="compact-panel-header">
            <span className="section-eyebrow">筛选区</span>
            <h3>任务过滤器</h3>
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
            description="可以点击顶部的“手工建任务”来导入需要查询的内容 ID。"
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
          <div className="task-queue-list">
            {filteredTasks.map((task, index) => (
              <div key={task.taskId} className="task-accordion-item">
                <TaskCard
                  task={task}
                  syncConfig={syncConfig}
                  expanded={expandedTaskId === task.taskId}
                  recommended={index === 0 && filterKey === 'waiting'}
                  onToggleExpand={onToggleExpand}
                  onCopyQr={onCopyQr}
                  onRefreshLogin={onRefreshLogin}
                  onSubmitSmsCode={onSubmitSmsCode}
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
                      onCopyQr={onCopyQr}
                      onRefreshLogin={onRefreshLogin}
                      onRetryQuery={onRetryQuery}
                      onDeleteTask={onDeleteTask}
                      onPreviewSync={onPreviewSync}
                      onSyncTask={onSyncTask}
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>
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
