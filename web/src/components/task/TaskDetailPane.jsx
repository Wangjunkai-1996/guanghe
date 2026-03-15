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
  onSyncTask,
  onSubmitSmsCode
}) {
  if (!task) {
    return (
      <section className="panel task-detail-pane empty">
        <EmptyState
          eyebrow="任务详情"
          tone="neutral"
          title="从左侧队列选择一个任务"
          description="详情会先给结论，再决定是否需要人工介入、回填预览或日志排查。"
        />
      </section>
    )
  }

  return (
    <section className="panel task-detail-pane">
      <div className="task-detail-pane-header">
        <div className="task-detail-pane-copy">
          <span className="section-eyebrow">Inspector</span>
          <h3 id={titleId}>{task.remark || task.contentId || task.taskId}</h3>
          <p>先看结论，再决定是否继续回填、查看截图或人工介入。</p>
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
        onSubmitSmsCode={onSubmitSmsCode}
      />
    </section>
  )
}
