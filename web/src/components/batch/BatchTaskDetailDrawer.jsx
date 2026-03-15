import { useEffect, useId, useRef } from 'react'
import { ExternalLink, FileImage, FileJson, Logs, PanelRightClose } from 'lucide-react'
import {
  formatDateTime,
  formatTaskLoginStatus,
  formatTaskQueryStatus,
  formatTaskSheetMatchStatus,
  formatTaskSyncStatus,
  getTaskLoginTone,
  getTaskOverallTone,
  getTaskPrimaryActionLabel,
  getTaskQueryTone,
  getTaskSheetMatchTone,
  getTaskSummary,
  getTaskSyncTone
} from '../../lib/taskFormat'
import { InlineNotice } from '../ui/InlineNotice'
import { StatusBadge } from '../ui/StatusBadge'
import { TaskDetailAccordion } from '../task/TaskDetailAccordion'

export function BatchTaskDetailDrawer({
  task,
  syncConfig,
  syncPreview,
  syncAction,
  busy,
  copying,
  onClose,
  onCopyQr,
  onRefreshLogin,
  onRetryQuery,
  onDeleteTask,
  onPreviewSync,
  onSyncTask,
  onSubmitSmsCode
}) {
  const titleId = useId()
  const drawerRef = useRef(null)
  const closeButtonRef = useRef(null)

  useEffect(() => {
    window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus()
    })
  }, [])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose?.()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  if (!task) return null

  const overallTone = getTaskOverallTone(task)
  const taskLabel = task.remark || task.contentId || task.taskId
  const artifactLinks = [
    { href: task.screenshots?.summaryUrl, label: '查看分析图', icon: FileImage },
    { href: task.artifacts?.resultUrl, label: '结果 JSON', icon: FileJson },
    { href: task.artifacts?.networkLogUrl, label: '网络日志', icon: Logs }
  ].filter((item) => item.href)
  const statusBadges = [
    {
      key: 'login',
      tone: getTaskLoginTone(task.login?.status),
      label: `登录 ${formatTaskLoginStatus(task.login?.status)}`
    },
    {
      key: 'query',
      tone: getTaskQueryTone(task.query?.status),
      label: `查询 ${formatTaskQueryStatus(task.query?.status)}`
    },
    {
      key: 'sync',
      tone: getTaskSyncTone(task, syncConfig),
      label: `回填 ${formatTaskSyncStatus(task, syncConfig)}`
    }
  ]

  if (task.taskMode === 'SHEET_DEMAND') {
    statusBadges.push({
      key: 'sheet',
      tone: getTaskSheetMatchTone(task.sheetMatch?.status),
      label: `交接表 ${formatTaskSheetMatchStatus(task.sheetMatch?.status)}`
    })
  }

  return (
    <aside
      ref={drawerRef}
      className="batch-task-detail-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      <div className="batch-task-detail-drawer-shell">
        <header className="batch-task-detail-drawer-topbar">
          <div className="batch-task-detail-drawer-topbar-copy">
            <strong>任务详情</strong>
          </div>

          <div className="batch-task-detail-drawer-topbar-actions">
            <button
              className="secondary-btn ghost-btn batch-task-drawer-collapse"
              type="button"
              onClick={onClose}
            >
              收起
            </button>

            <button
              ref={closeButtonRef}
              className="icon-btn task-detail-pane-close"
              type="button"
              onClick={onClose}
              aria-label="关闭任务详情抽屉"
            >
              <PanelRightClose size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        <section className="batch-task-detail-page stack-lg" aria-labelledby={titleId}>
          <header className="batch-task-detail-hero">
            <div className="batch-task-detail-header">
              <div className="batch-task-detail-copy">
                <div className="batch-task-detail-title-row">
                  <h2 id={titleId}>{taskLabel}</h2>
                  <StatusBadge tone={overallTone} emphasis="soft">
                    {getTaskPrimaryActionLabel(task)}
                  </StatusBadge>
                </div>
                <p>{getTaskSummary(task)}</p>
              </div>
            </div>

            <div className="batch-task-detail-inline-meta" aria-label="任务摘要">
              <span>账号 {task.accountNickname || task.accountId || '待扫码'}</span>
              <span>内容ID {task.contentId || '待补充'}</span>
              <span>更新 {formatDateTime(task.updatedAt || task.fetchedAt || task.createdAt)}</span>
            </div>

            <div className="batch-task-detail-status-strip" aria-label="任务状态">
              {statusBadges.map((item) => (
                <StatusBadge key={item.key} tone={item.tone} emphasis="soft" size="sm">
                  {item.label}
                </StatusBadge>
              ))}
            </div>
          </header>

          <div className="batch-task-detail-layout">
            <div className="panel batch-task-detail-main-surface">
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
            </div>

            <aside className="batch-task-detail-side">
              <section className="panel batch-task-detail-side-card stack-md">
                <div className="batch-task-detail-side-header">
                  <strong>任务索引</strong>
                  <small>先确认对象，再决定操作</small>
                </div>

                <div className="batch-task-detail-meta">
                  <MetaRow label="任务 ID" value={task.taskId} mono />
                  <MetaRow label="内容 ID" value={task.contentId || '待补充'} mono />
                  <MetaRow label="账号" value={task.accountNickname || task.accountId || '待扫码'} />
                  <MetaRow label="任务来源" value={task.taskMode === 'SHEET_DEMAND' ? '交接表闭环' : '手工创建'} />
                  {task.taskMode === 'SHEET_DEMAND' ? (
                    <MetaRow label="交接表状态">
                      <StatusBadge tone={getTaskSheetMatchTone(task.sheetMatch?.status)} emphasis="soft" size="sm">
                        {formatTaskSheetMatchStatus(task.sheetMatch?.status)}
                      </StatusBadge>
                    </MetaRow>
                  ) : null}
                </div>
              </section>

              <section className="panel batch-task-detail-side-card stack-md">
                <div className="batch-task-detail-side-header">
                  <strong>处理提示</strong>
                  <small>阻塞原因持续可见</small>
                </div>

                <InlineNotice
                  tone={task.sync?.status === 'FAILED' || task.error?.message ? 'danger' : 'info'}
                  eyebrow="当前判断"
                  title={task.error?.message || getTaskSummary(task)}
                  description="抽屉会跟随当前任务更新，列表里切别的任务时这里会直接切换，不用再跳页。"
                />
              </section>

              {artifactLinks.length > 0 ? (
                <section className="panel batch-task-detail-side-card stack-md">
                  <div className="batch-task-detail-side-header">
                    <strong>快速打开</strong>
                    <small>直接查看结果材料</small>
                  </div>

                  <div className="batch-task-detail-links">
                    {artifactLinks.map((item) => {
                      const Icon = item.icon
                      return (
                        <a
                          key={item.label}
                          className="secondary-btn inline-link-btn"
                          href={item.href}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Icon size={16} aria-hidden="true" />
                          <span>{item.label}</span>
                          <ExternalLink size={14} aria-hidden="true" />
                        </a>
                      )
                    })}
                  </div>
                </section>
              ) : null}
            </aside>
          </div>
        </section>
      </div>
    </aside>
  )
}

function MetaRow({ label, value, mono = false, children = null }) {
  return (
    <div className="batch-task-detail-meta-row">
      <span>{label}</span>
      {children || <strong className={mono ? 'mono-cell' : ''}>{value}</strong>}
    </div>
  )
}
