import React from 'react'
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
  getTaskSheetMatchSource,
  getTaskSummary,
  getTaskSyncTone,
  normalizeStatusTone,
  stopPropagation
} from '../../lib/taskFormat'
import { TaskSmsInput } from './TaskSmsInput'

export const TaskCard = React.memo(function TaskCard({
  task,
  syncConfig,
  selected,
  recommended,
  onSelect,
  expanded,
  onToggleExpand,
  onCopyQr,
  onRefreshLogin,
  onSubmitSmsCode,
  copying,
  busy
}) {
  const tone = getTaskOverallTone(task)
  const waitingForLogin = ['WAITING_QR', 'WAITING_CONFIRM', 'WAITING_SMS'].includes(task.login.status)
  const waitingForSms = task.login.status === 'WAITING_SMS'
  const sheetMatchSource = task.taskMode === 'SHEET_DEMAND' ? getTaskSheetMatchSource(task) : ''

  return (
    <article
      className={`task-queue-card tone-${tone} ${selected || expanded ? 'selected' : ''} ${waitingForLogin ? 'has-qr-peek' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => (onToggleExpand ? onToggleExpand(task.taskId) : onSelect(task.taskId))}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        if (onToggleExpand) {
          onToggleExpand(task.taskId)
          return
        }
        onSelect(task.taskId)
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
        <div className="task-row-actions">
          {expanded ? (
            <span className="row-focus-pill active">收起详情</span>
          ) : (
            <span className="row-focus-pill">{getTaskPrimaryActionLabel(task)}</span>
          )}
        </div>
      </div>

      <div className="task-card-body-layout">
        <div className="task-card-main-content stack-sm">
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
                {sheetMatchSource ? <small>{sheetMatchSource}</small> : null}
              </div>
            ) : null}
          </div>
        </div>

        {waitingForLogin && !waitingForSms && task.qrImageUrl ? (
          <div className="task-card-qr-peek" onClick={stopPropagation}>
            <div className="qr-peek-image-wrap">
              <img className="qr-image" src={task.qrImageUrl} alt="扫码登录" />
            </div>
            <div className="qr-peek-actions">
              <button className="primary-btn compact-btn" type="button" disabled={busy} onClick={() => onCopyQr(task)}>
                {copying ? '已复制' : '复制二维码'}
              </button>
              <button className="secondary-btn compact-btn" type="button" disabled={busy} onClick={() => onRefreshLogin(task.taskId)}>
                刷新
              </button>
            </div>
          </div>
        ) : null}

        {waitingForSms ? (
          <TaskSmsInput taskId={task.taskId} onSubmitSmsCode={onSubmitSmsCode} onClick={stopPropagation} />
        ) : null}
      </div>

      {task.sync?.status === 'FAILED' ? <div className="task-inline-hint">{task.sync.error?.message || '腾讯文档同步失败，请进入详情补同步。'}</div> : null}
      {!task.sync?.error?.message && task.error?.message ? <div className="task-inline-hint">{task.error.message}</div> : null}
    </article>
  )
})
