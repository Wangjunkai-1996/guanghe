import React, { useEffect, useId, useState } from 'react'
import {
  canDeleteTask,
  canRefreshTaskLogin,
  canRetryTaskQuery,
  formatTaskSyncStatus,
  getTaskPrimaryActionLabel,
  getTaskRecommendations,
  getTaskSummary,
  isExceptionalTask,
  isTaskBusy,
  supportsClipboardImage
} from '../../lib/taskFormat'
import { TaskDetailResultSection } from './TaskDetailResultSection'
import { TaskDetailSheetMatchSection } from './TaskDetailSheetMatchSection'
import { TaskDetailSyncSection } from './TaskDetailSyncSection'
import { TaskSmsInput } from './TaskSmsInput'
import { StatusBadge } from '../ui/StatusBadge'

export const TaskDetailAccordion = React.memo(function TaskDetailAccordion({
  task,
  busy,
  copying,
  syncConfig,
  syncPreview,
  syncAction,
  onCopyQr,
  onRefreshLogin,
  onRetryQuery,
  onDeleteTask,
  onPreviewSync,
  onSyncTask,
  onSubmitSmsCode
}) {
  const [activeResultTab, setActiveResultTab] = useState('summary')
  const [detailTab, setDetailTab] = useState('conclusion')
  const detailTabsId = useId()

  useEffect(() => {
    setActiveResultTab('summary')
    setDetailTab('conclusion')
  }, [task?.taskId, task?.screenshots?.summaryUrl, task?.screenshots?.rawUrl])

  if (!task) return null

  const previewImageUrl = activeResultTab === 'summary' ? task.screenshots?.summaryUrl : task.screenshots?.rawUrl
  const taskBusy = isTaskBusy(task)
  const canCopyQr = Boolean(task.qrImageUrl && supportsClipboardImage())
  const canRefresh = canRefreshTaskLogin(task)
  const canRetry = canRetryTaskQuery(task)
  const canDelete = canDeleteTask(task)
  const recommendations = getTaskRecommendations(task, syncConfig)
  const requiresManual = requiresManualIntervention(task)
  const writebackStatus = formatTaskSyncStatus(task, syncConfig)
  const nextAction = getTaskPrimaryActionLabel(task)
  const detailTabs = [
    { value: 'conclusion', label: '结论' },
    { value: 'sync', label: '文档回填' },
    { value: 'logs', label: '二维码与日志' }
  ]

  const handleDetailTabsKeyDown = (event) => {
    const currentIndex = detailTabs.findIndex((item) => item.value === detailTab)
    if (currentIndex === -1) return

    let nextIndex = currentIndex
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % detailTabs.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + detailTabs.length) % detailTabs.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = detailTabs.length - 1
    } else {
      return
    }

    event.preventDefault()
    const nextTab = detailTabs[nextIndex]
    const tabList = event.currentTarget
    setDetailTab(nextTab.value)
    window.requestAnimationFrame(() => {
      tabList?.querySelector(`[data-tab="${nextTab.value}"]`)?.focus()
    })
  }

  return (
    <div className="task-detail-accordion stack-md">
      <div className={`task-focus-banner tone-${requiresManual ? 'danger' : 'info'}`}>
        <strong>当前建议</strong>
        <small>{getTaskSummary(task)}</small>
        {recommendations.length > 0 ? (
          <div className="task-recommend-list">
            {recommendations.map((item) => (
              <span key={item} className="task-recommend-pill">{item}</span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="task-detail-section">
        <div
          className="tabs-switcher task-detail-tabs"
          role="tablist"
          aria-label={`任务 ${task.taskId} 详情页签`}
          onKeyDown={handleDetailTabsKeyDown}
        >
          {detailTabs.map((item) => (
            <button
              key={item.value}
              className={`tab-btn ${detailTab === item.value ? 'active' : ''}`}
              type="button"
              id={`${detailTabsId}-${item.value}-tab`}
              data-tab={item.value}
              role="tab"
              aria-controls={`${detailTabsId}-${item.value}-panel`}
              aria-selected={detailTab === item.value}
              tabIndex={detailTab === item.value ? 0 : -1}
              onClick={() => setDetailTab(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {detailTab === 'conclusion' ? (
        <div
          className="stack-md"
          role="tabpanel"
          id={`${detailTabsId}-conclusion-panel`}
          aria-labelledby={`${detailTabsId}-conclusion-tab`}
        >
          <div className="task-conclusion-grid">
            <ConclusionCard label="当前建议" value={getTaskSummary(task)} tone={requiresManual ? 'danger' : 'info'} />
            <ConclusionCard label="是否人工介入" value={requiresManual ? '需要' : '不需要'} tone={requiresManual ? 'danger' : 'success'} />
            <ConclusionCard label="回填状态" value={writebackStatus} tone={task.sync?.status === 'SUCCEEDED' ? 'success' : (task.sync?.status === 'FAILED' ? 'danger' : 'warning')} />
            <ConclusionCard label="下一步动作" value={nextAction} tone="warning" />
          </div>

          <div className="task-detail-actions-row">
            {canRetry ? (
              <button className="secondary-btn" type="button" disabled={busy} onClick={() => onRetryQuery(task.taskId)}>
                重试查询
              </button>
            ) : null}
            {canRefresh ? (
              <button className="secondary-btn" type="button" disabled={busy || taskBusy} onClick={() => onRefreshLogin(task.taskId)}>
                刷新二维码
              </button>
            ) : null}
            <details className="task-detail-more-actions">
              <summary>更多操作</summary>
              <div className="task-detail-more-actions-menu">
                <button className="secondary-btn danger-ghost-btn" type="button" disabled={!canDelete || busy} onClick={() => onDeleteTask(task.taskId)}>
                  删除任务
                </button>
              </div>
            </details>
          </div>

          {task.login?.status === 'WAITING_SMS' ? (
            <div className="task-detail-section stack-sm">
              <div className="task-section-header">
                <div>
                  <strong>短信验证码</strong>
                  <small>当前任务需要人工输入验证码后才能继续。</small>
                </div>
              </div>
              <TaskSmsInput taskId={task.taskId} onSubmitSmsCode={onSubmitSmsCode} />
            </div>
          ) : null}

          <TaskDetailResultSection
            activeTab={activeResultTab}
            setActiveTab={setActiveResultTab}
            previewImageUrl={previewImageUrl}
            task={task}
            busy={busy}
            canRetry={canRetry}
            onRetryQuery={onRetryQuery}
            showAdvanced
            onCopyQr={onCopyQr}
            onRefreshLogin={onRefreshLogin}
            copying={copying}
            canCopyQr={canCopyQr}
            canRefresh={canRefresh}
          />
        </div>
      ) : null}

      {detailTab === 'sync' ? (
        <div
          className="stack-md"
          role="tabpanel"
          id={`${detailTabsId}-sync-panel`}
          aria-labelledby={`${detailTabsId}-sync-tab`}
        >
          {task.taskMode === 'SHEET_DEMAND' ? <TaskDetailSheetMatchSection task={task} showAdvanced /> : null}
          <TaskDetailSyncSection
            task={task}
            syncConfig={syncConfig}
            syncPreview={syncPreview}
            syncAction={syncAction}
            onPreviewSync={onPreviewSync}
            onSyncTask={onSyncTask}
            showAdvanced
          />
        </div>
      ) : null}

      {detailTab === 'logs' ? (
        <div
          className="stack-md"
          role="tabpanel"
          id={`${detailTabsId}-logs-panel`}
          aria-labelledby={`${detailTabsId}-logs-tab`}
        >
          <div className="task-detail-section stack-md">
            <div className="task-section-header">
              <div>
                <strong>二维码与截图</strong>
                <small>二维码、结果截图和原始文件统一在这里查看。</small>
              </div>
              <div className="task-actions-inline">
                {task.qrImageUrl ? (
                  <a className="secondary-btn inline-link-btn" href={task.qrImageUrl} download={`task-${task.taskId}-qr.png`}>
                    下载二维码
                  </a>
                ) : null}
                <button className="secondary-btn" type="button" disabled={!canCopyQr || busy || taskBusy} onClick={() => onCopyQr(task)}>
                  {copying ? '已复制' : '复制二维码'}
                </button>
              </div>
            </div>

            <div className="task-log-gallery">
              {task.qrImageUrl ? (
                <div className="task-log-gallery-card">
                  <span>登录二维码</span>
                  <img className="qr-image" src={task.qrImageUrl} alt={`任务 ${task.remark || task.taskId} 的二维码`} />
                </div>
              ) : null}

              {task.screenshots?.summaryUrl ? (
                <a className="task-log-gallery-card" href={task.screenshots.summaryUrl} target="_blank" rel="noreferrer">
                  <span>分析截图</span>
                  <img className="result-image" src={task.screenshots.summaryUrl} alt="任务分析截图" />
                </a>
              ) : null}

              {task.screenshots?.rawUrl ? (
                <a className="task-log-gallery-card" href={task.screenshots.rawUrl} target="_blank" rel="noreferrer">
                  <span>作品截图</span>
                  <img className="result-image" src={task.screenshots.rawUrl} alt="任务作品截图" />
                </a>
              ) : null}
            </div>
          </div>

          <div className="task-detail-section stack-md">
            <div className="task-section-header">
              <div>
                <strong>任务日志</strong>
                <small>查询结果、网络日志和错误文件都在这里归档。</small>
              </div>
            </div>
            <div className="result-actions-row sync-artifact-links">
              {task.artifacts?.resultUrl ? <a className="secondary-btn inline-link-btn" href={task.artifacts.resultUrl} target="_blank" rel="noreferrer">打开结果 JSON</a> : null}
              {task.artifacts?.networkLogUrl ? <a className="secondary-btn inline-link-btn" href={task.artifacts.networkLogUrl} target="_blank" rel="noreferrer">打开网络日志</a> : null}
              {task.sync?.artifacts?.writeLogUrl ? <a className="secondary-btn inline-link-btn" href={task.sync.artifacts.writeLogUrl} target="_blank" rel="noreferrer">打开写入日志</a> : null}
            </div>

            {task.error?.message ? (
              <div className="task-state-banner tone-danger">
                <strong>{task.error.message}</strong>
                <small>{task.error.code || 'TASK_ERROR'}</small>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
})

function ConclusionCard({ label, value, tone }) {
  return (
    <div className={`task-conclusion-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function requiresManualIntervention(task) {
  if (task.login?.status === 'WAITING_SMS') return true
  return isExceptionalTask(task)
}
