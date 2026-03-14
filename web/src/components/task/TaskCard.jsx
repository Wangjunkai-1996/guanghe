import React from 'react'
import { CircleAlert, CircleCheckBig, Copy, QrCode, RefreshCw, Sparkles, Smartphone } from 'lucide-react'
import {
  formatDateTime,
  formatMetricValue,
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
  resolveMetricPayload,
  stopPropagation
} from '../../lib/taskFormat'
import { TaskSmsInput } from './TaskSmsInput'
import { StatusBadge } from '../ui/StatusBadge'

const PRIMARY_METRICS = ['查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数']

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
  const primaryMetrics = PRIMARY_METRICS.map((label) => ({
    label,
    payload: resolveMetricPayload(task.metrics, label)
  })).filter((item) => item.payload)
  const taskErrorMessage = task.sync?.status === 'FAILED'
    ? (task.sync.error?.message || '腾讯文档同步失败，请进入详情补同步。')
    : task.error?.message
  const PrimaryActionIcon = task.query?.status === 'SUCCEEDED'
    ? CircleCheckBig
    : task.sync?.status === 'FAILED' || task.query?.status === 'FAILED'
      ? CircleAlert
      : waitingForLogin
        ? QrCode
        : Sparkles

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
      <div className={`task-card-rail tone-${tone}`} aria-hidden="true" />

      <div className="task-queue-top">
        <div className="task-row-main">
          <div className="task-card-title-row">
            <strong>{task.remark || '未命名任务'}</strong>
            <div className="task-card-title-pills">
              {task.taskMode === 'SHEET_DEMAND' ? (
                <StatusBadge tone="warning" size="sm" emphasis="solid">
                  交接表
                </StatusBadge>
              ) : null}
              {recommended ? (
                <StatusBadge tone="accent" size="sm" emphasis="glass" icon={Sparkles}>
                  建议先看
                </StatusBadge>
              ) : null}
            </div>
          </div>
          <small>{getTaskSummary(task)}</small>
        </div>
        <div className="task-row-actions">
          {expanded ? (
            <span className="row-focus-pill active">
              <CircleCheckBig size={15} aria-hidden="true" />
              <span>收起详情</span>
            </span>
          ) : (
            <span className="row-focus-pill">
              {PrimaryActionIcon ? <PrimaryActionIcon size={15} aria-hidden="true" /> : null}
              <span>{getTaskPrimaryActionLabel(task)}</span>
            </span>
          )}
        </div>
      </div>

      <div className="task-card-body-layout">
        <div className="task-card-main-content stack-sm">
          <div className="task-status-pills">
            <StatusBadge tone={getTaskLoginTone(task.login.status)}>
              登录：{formatTaskLoginStatus(task.login.status)}
            </StatusBadge>
            <StatusBadge tone={getTaskQueryTone(task.query.status)}>
              查询：{formatTaskQueryStatus(task.query.status)}
            </StatusBadge>
            <StatusBadge tone={normalizeStatusTone(getTaskSyncTone(task, syncConfig))}>
              同步：{formatTaskSyncStatus(task, syncConfig)}
            </StatusBadge>
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

          {task.query?.status === 'SUCCEEDED' && primaryMetrics.length > 0 ? (
            <div className="task-metric-capsule-row" aria-label="关键指标摘要">
              {primaryMetrics.map((item) => (
                <div key={item.label} className="task-metric-capsule">
                  <span>{item.label}</span>
                  <strong>{formatMetricValue(item.payload?.value)}</strong>
                </div>
              ))}
            </div>
          ) : null}

          {taskErrorMessage ? (
            <div className={`task-card-alert-strip tone-${tone === 'success' ? 'warning' : tone}`}>
              <CircleAlert size={16} aria-hidden="true" />
              <span>{taskErrorMessage}</span>
            </div>
          ) : null}
        </div>

        {waitingForLogin && !waitingForSms && task.qrImageUrl ? (
          <div className="task-card-qr-peek" onClick={stopPropagation}>
            <div className="qr-peek-image-wrap">
              <img className="qr-image" src={task.qrImageUrl} alt="扫码登录" />
            </div>
            <div className="qr-peek-actions">
              <button className="primary-btn compact-btn" type="button" disabled={busy} onClick={() => onCopyQr(task)}>
                <Copy size={16} aria-hidden="true" />
                <span>{copying ? '已复制' : '复制二维码'}</span>
              </button>
              <button className="secondary-btn compact-btn" type="button" disabled={busy} onClick={() => onRefreshLogin(task.taskId)}>
                <RefreshCw size={16} aria-hidden="true" />
                <span>刷新</span>
              </button>
            </div>
          </div>
        ) : null}

        {waitingForSms ? (
          <div className="task-sms-panel-wrap">
            <div className="task-sms-panel-head">
              <Smartphone size={16} aria-hidden="true" />
              <span>需要短信验证码</span>
            </div>
            <TaskSmsInput taskId={task.taskId} onSubmitSmsCode={onSubmitSmsCode} onClick={stopPropagation} />
          </div>
        ) : null}
      </div>
    </article>
  )
})
