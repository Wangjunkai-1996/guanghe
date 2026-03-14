import { PanelRightClose } from 'lucide-react'
import { EmptyState } from '../ui/EmptyState'
import { TaskDetailAccordion } from './TaskDetailAccordion'

export function TaskDetailPane({
  task,
  syncConfig,
  syncPreview,
  syncAction,
  busy,
  copying,
  onClose,
  titleId,
  onCopyQr,
  onRefreshLogin,
  onRetryQuery,
  onDeleteTask,
  onPreviewSync,
  onSyncTask
}) {
  if (!task) {
    return (
      <section className="panel task-detail-pane empty">
        <EmptyState
          eyebrow="任务详情"
          tone="neutral"
          title="从左侧队列选择一个任务"
          description="选中后会在这里查看二维码、结果、回填预览和异常处理动作。"
        />
      </section>
    )
  }

  return (
    <section className="panel task-detail-pane">
      <div className="task-detail-pane-header">
        <div className="task-detail-pane-copy">
          <span className="section-eyebrow">任务详情</span>
          <h3 id={titleId}>{task.remark || task.contentId || task.taskId}</h3>
          <p>在同一视图里查看结果、二维码与腾讯文档回填，减少来回展开折叠的切换成本。</p>
        </div>
        {onClose ? (
          <button className="icon-btn task-detail-pane-close" type="button" onClick={onClose} aria-label="关闭任务详情抽屉">
            <PanelRightClose size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <TaskDetailAccordion
        task={task}
        busy={busy}
        copying={copying}
        syncConfig={syncConfig}
        syncPreview={syncPreview}
        syncAction={syncAction}
        onCopyQr={onCopyQr}
        onRefreshLogin={onRefreshLogin}
        onRetryQuery={onRetryQuery}
        onDeleteTask={onDeleteTask}
        onPreviewSync={onPreviewSync}
        onSyncTask={onSyncTask}
      />
    </section>
  )
}
