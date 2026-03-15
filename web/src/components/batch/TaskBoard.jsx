import { useEffect, useId, useRef } from 'react'
import { CircleAlert, CircleCheckBig, LoaderCircle, QrCode, Search, Sparkles, Workflow } from 'lucide-react'
import {
  getTaskPriority,
  getWorkspaceHeadline,
  isExceptionalTask,
  isFinishedTask,
  isInProgressTask,
  isWaitingTask
} from '../../lib/taskFormat'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { TaskCard } from '../TaskComponents'
import { TaskDetailPane } from '../task/TaskDetailPane'
import { EmptyState } from '../ui/EmptyState'
import { StageSectionCard } from '../ui/StageSectionCard'

const FILTER_OPTIONS = [
  { value: 'all', label: '全部', tone: 'neutral', icon: Workflow },
  { value: 'waiting', label: '待扫码', tone: 'info', icon: QrCode },
  { value: 'in-progress', label: '进行中', tone: 'warning', icon: LoaderCircle },
  { value: 'exception', label: '需处理', tone: 'danger', icon: CircleAlert },
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
  onClearFilters,
  onOpenBuilder,
  onRequestFocusInspector,
  onOpenTaskDrawer,
  desktopDrawerOpenTaskId = '',
  renderDesktopDetail = true,
  mobileExpanded = false,
  onToggleMobile = () => {}
}) {
  const isDesktop = useMediaQuery('(min-width: 901px)')
  const mobileDetailTitleId = useId()
  const mobileDetailPanelRef = useRef(null)
  const taskListRef = useRef(null)
  const focusTask = selectedTask || filteredTasks[0] || null
  const mobileSummary = getQueueMobileSummary({ tasks, filteredTasks, focusTask, error })

  const handleMoveSelection = (taskId, direction) => {
    const currentIndex = filteredTasks.findIndex((task) => task.taskId === taskId)
    if (currentIndex === -1) return
    const nextIndex = Math.min(filteredTasks.length - 1, Math.max(0, currentIndex + direction))
    const nextTask = filteredTasks[nextIndex]
    if (!nextTask) return

    onSelectTask(nextTask.taskId)
    window.requestAnimationFrame(() => {
      taskListRef.current?.querySelector(`[data-task-id="${nextTask.taskId}"]`)?.focus()
    })
  }

  const handleRequestOpenInspector = (taskId) => {
    onSelectTask(taskId)
    if (isDesktop && !renderDesktopDetail) {
      onOpenTaskDrawer?.(taskId)
      return
    }
    onRequestFocusInspector?.(taskId)
  }

  useEffect(() => {
    if (isDesktop || !selectedTask || typeof window === 'undefined') return undefined

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
  }, [isDesktop, onCloseTaskDetail, selectedTask])

  return (
    <StageSectionCard
      id="batch-task-queue-stage"
      className="batch-stage-card batch-task-board stack-lg"
      title="任务队列"
      variant="feature"
      mobileSummary={mobileSummary}
      mobileExpanded={mobileExpanded}
      onToggleMobile={onToggleMobile}
    >
      <div className="task-board-toolbar">
        <div className="task-filter-group" role="toolbar" aria-label="任务状态筛选">
          {FILTER_OPTIONS.map((option) => {
            const count = countTasksByFilter(tasks, option.value)
            const Icon = option.icon

            return (
              <button
                key={option.value}
                className={`task-filter-chip tone-${option.tone} ${filterKey === option.value ? 'active' : ''}`}
                type="button"
                onClick={() => setFilterKey(option.value)}
              >
                <span>
                  <Icon size={15} aria-hidden="true" />
                  {option.label}
                </span>
                <strong>{count}</strong>
              </button>
            )
          })}
        </div>

        <div className="task-board-toolbar-right">
          <button className="secondary-btn" type="button" onClick={onOpenBuilder}>
            创建任务
          </button>

          <label className="toolbar-search-field">
            <span>搜索任务</span>
            <input
              type="search"
              placeholder="搜索达人、内容 ID、账号昵称"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
            />
          </label>

          {(filterKey !== 'all' || searchValue) ? (
            <button className="secondary-btn" type="button" onClick={onClearFilters}>
              清空筛选
            </button>
          ) : null}
        </div>
      </div>

      <div className={`task-console-layout ${isDesktop ? 'is-desktop' : 'is-mobile'}`}>
        <section className="task-list-pane stack-md" aria-label="任务列表">
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
              eyebrow="任务队列"
              tone="neutral"
              icon={Sparkles}
              title="当前没有二维码任务"
              description="先在上方生成二维码任务，再回到这里跟踪结果。"
            />
          ) : null}

          {!loading && !error && tasks.length > 0 && filteredTasks.length === 0 ? (
            <EmptyState
              eyebrow="任务筛选"
              tone="warning"
              icon={Search}
              title="没有匹配当前筛选条件的任务"
              description="可以切回全部，或清空搜索关键字后继续查看。"
              actionLabel="清空筛选"
              onAction={onClearFilters}
            />
          ) : null}

          {!loading && !error && filteredTasks.length > 0 ? (
            <div ref={taskListRef} className="task-queue-list task-master-list">
              {filteredTasks.map((task, index) => (
                <TaskCard
                  key={task.taskId}
                  task={task}
                  syncConfig={syncConfig}
                  selected={selectedTaskId === task.taskId}
                  recommended={index === 0}
                  onSelect={onSelectTask}
                  onMoveSelection={handleMoveSelection}
                  onRequestOpenInspector={handleRequestOpenInspector}
                  openOnClick={isDesktop && !renderDesktopDetail}
                  detailVisible={desktopDrawerOpenTaskId === task.taskId}
                  interactionMode={isDesktop && !renderDesktopDetail ? 'desktop-drawer' : 'drawer'}
                />
              ))}
            </div>
          ) : null}
        </section>

        {isDesktop && renderDesktopDetail ? (
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
              onSubmitSmsCode={onSubmitSmsCode}
            />
          </div>
        ) : null}
      </div>

      {!isDesktop && selectedTask ? (
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
              onSubmitSmsCode={onSubmitSmsCode}
            />
          </div>
        </div>
      ) : null}
    </StageSectionCard>
  )
}

function countTasksByFilter(tasks, filterValue) {
  if (filterValue === 'waiting') return tasks.filter((task) => isWaitingTask(task)).length
  if (filterValue === 'in-progress') return tasks.filter((task) => isInProgressTask(task)).length
  if (filterValue === 'exception') return tasks.filter((task) => isExceptionalTask(task)).length
  if (filterValue === 'finished') return tasks.filter((task) => isFinishedTask(task)).length
  return tasks.length
}

export function compareTasks(left, right) {
  const priorityDiff = getTaskPriority(left) - getTaskPriority(right)
  if (priorityDiff !== 0) return priorityDiff
  const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime()
  const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime()
  return rightTime - leftTime
}

function getQueueMobileSummary({ tasks, filteredTasks, focusTask, error }) {
  if (error) {
    return {
      status: '需处理',
      statusTone: 'danger',
      value: '任务加载失败',
      detail: '展开后可重试加载',
      description: '当前状态：任务列表加载失败。下一步：展开任务队列后重试。'
    }
  }

  if (tasks.length === 0) {
    return {
      status: '未准备',
      statusTone: 'warning',
      value: '暂无任务',
      detail: '先在上方生成二维码任务',
      description: '当前状态：还没有二维码任务。下一步：先生成任务，再回来跟踪。'
    }
  }

  if (filteredTasks.length === 0) {
    return {
      status: '需处理',
      statusTone: 'warning',
      value: `${tasks.length} 个任务`,
      detail: '当前筛选没有命中结果',
      description: '当前状态：筛选结果为空。下一步：展开任务队列后清空筛选。'
    }
  }

  const allFinished = tasks.every((task) => isFinishedTask(task))
  return {
    status: allFinished ? '已完成' : '进行中',
    statusTone: allFinished ? 'success' : 'info',
    value: `${tasks.length} 个任务`,
    detail: focusTask ? `推荐焦点：${focusTask.remark || focusTask.contentId || focusTask.taskId}` : '展开后查看任务详情',
    description: getWorkspaceHeadline(tasks, filteredTasks)
  }
}
