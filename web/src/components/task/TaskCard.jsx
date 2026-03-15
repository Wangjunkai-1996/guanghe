import React from 'react'
import {
  formatMetricValue,
  formatTaskSheetMatchStatus,
  formatTaskSyncStatus,
  getTaskOverallTone,
  getTaskSummary,
  isExceptionalTask,
  isFinishedTask,
  isInProgressTask,
  isWaitingTask,
  resolveMetricPayload
} from '../../lib/taskFormat'
import { StatusBadge } from '../ui/StatusBadge'

const PRIMARY_METRICS = ['查看次数', '查看人数', '种草成交金额', '种草成交人数', '商品点击次数']

export const TaskCard = React.memo(function TaskCard({
  task,
  syncConfig,
  selected,
  recommended,
  onSelect,
  onMoveSelection,
  onRequestOpenInspector,
  interactionMode = 'drawer',
  openOnClick = false,
  detailVisible = false
}) {
  const tone = getTaskOverallTone(task)
  const primaryMetrics = PRIMARY_METRICS.map((label) => ({
    label,
    payload: resolveMetricPayload(task.metrics, label)
  })).filter((item) => item.payload)
  const blockerText = getTaskSummary(task)
  const overallLabel = getTaskOverallLabel(task)
  const detailHint = interactionMode === 'desktop-drawer'
    ? (detailVisible ? '抽屉已展开 · 再点收起' : '点击打开抽屉')
    : (selected ? '详情已展开' : '点击查看详情')

  return (
    <article
      className={`task-queue-card task-queue-card-vnext tone-${tone} ${selected ? 'selected' : ''}`}
      data-task-id={task.taskId}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => {
        if (openOnClick) {
          onRequestOpenInspector?.(task.taskId)
          return
        }
        onSelect(task.taskId)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          onMoveSelection?.(task.taskId, 1)
          return
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault()
          onMoveSelection?.(task.taskId, -1)
          return
        }

        if (event.key === 'Escape') {
          event.preventDefault()
          onSelect(task.taskId)
          return
        }

        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        if (selected) {
          onRequestOpenInspector?.(task.taskId)
          return
        }
        onSelect(task.taskId)
      }}
    >
      <div className={`task-card-rail tone-${tone}`} aria-hidden="true" />

      <div className="task-card-header-vnext">
        <div className="task-card-title-block">
          <div className="task-card-title-row">
            <strong>{task.remark || task.contentId || task.taskId}</strong>
            <div className="task-card-title-pills">
              {task.taskMode === 'SHEET_DEMAND' ? (
                <StatusBadge tone="warning" size="sm" emphasis="soft">
                  交接表
                </StatusBadge>
              ) : null}
              {recommended ? (
                <StatusBadge tone="info" size="sm" emphasis="soft">
                  推荐焦点
                </StatusBadge>
              ) : null}
            </div>
          </div>
          <small>{blockerText}</small>
        </div>

        <div className="task-card-status-stack">
          <StatusBadge tone={tone} emphasis={selected ? 'solid' : 'soft'}>
            {overallLabel}
          </StatusBadge>
          <small>{detailHint}</small>
        </div>
      </div>

      <div className="task-card-info-grid">
        <div className="task-info-item">
          <span>内容 ID</span>
          <strong className="mono-cell">{task.contentId || '-'}</strong>
        </div>
        <div className="task-info-item">
          <span>账号</span>
          <strong>{task.accountNickname || '待扫码'}</strong>
        </div>
        <div className="task-info-item">
          <span>同步</span>
          <strong>{formatTaskSyncStatus(task, syncConfig)}</strong>
        </div>
        {task.taskMode === 'SHEET_DEMAND' ? (
          <div className="task-info-item">
            <span>交接表</span>
            <strong>{formatTaskSheetMatchStatus(task.sheetMatch?.status)}</strong>
          </div>
        ) : null}
      </div>

      {primaryMetrics.length > 0 ? (
        <div className="task-card-metrics-vnext" aria-label="5 个核心指标">
          {primaryMetrics.map((item) => (
            <div key={item.label} className="task-metric-capsule">
              <span>{item.label}</span>
              <strong>{formatMetricValue(item.payload?.value)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div className={`task-card-blocker tone-${tone === 'success' ? 'warning' : tone}`}>
          <span>当前阻塞</span>
          <strong>{blockerText}</strong>
        </div>
      )}
    </article>
  )
})

function getTaskOverallLabel(task) {
  if (isExceptionalTask(task)) return '需处理'
  if (isWaitingTask(task)) return '未准备'
  if (isInProgressTask(task)) return '进行中'
  if (isFinishedTask(task)) return '已完成'
  return '进行中'
}
