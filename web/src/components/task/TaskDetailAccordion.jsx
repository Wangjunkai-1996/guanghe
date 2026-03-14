import React, { useEffect, useState } from 'react'
import {
  canDeleteTask,
  canRefreshTaskLogin,
  canRetryTaskQuery,
  formatDateTime,
  formatTaskLoginStatus,
  getTaskOverallTone,
  getTaskQueryTone,
  getTaskRecommendations,
  getTaskSummary,
  isTaskBusy,
  stopPropagation,
  supportsClipboardImage
} from '../../lib/taskFormat'
import { TaskDetailResultSection } from './TaskDetailResultSection'
import { TaskDetailSheetMatchSection } from './TaskDetailSheetMatchSection'
import { TaskDetailSyncSection } from './TaskDetailSyncSection'

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
  onSyncTask
}) {
  const [activeTab, setActiveTab] = useState('summary')
  const [detailTab, setDetailTab] = useState('results')

  useEffect(() => {
    setActiveTab('summary')
  }, [task?.taskId, task?.screenshots?.summaryUrl, task?.screenshots?.rawUrl])

  useEffect(() => {
    setDetailTab('results')
  }, [task?.taskId])

  if (!task) return null

  const previewImageUrl = activeTab === 'summary' ? task.screenshots?.summaryUrl : task.screenshots?.rawUrl
  const taskBusy = isTaskBusy(task)
  const canCopyQr = Boolean(task.qrImageUrl && supportsClipboardImage())
  const canRefresh = canRefreshTaskLogin(task)
  const canRetry = canRetryTaskQuery(task)
  const canDelete = canDeleteTask(task)
  const showQr = Boolean(task.qrImageUrl && ['WAITING_QR', 'WAITING_CONFIRM'].includes(task.login.status))
  const recommendations = getTaskRecommendations(task, syncConfig)

  return (
    <div className="task-detail-accordion stack-md">
      <div className={`task-focus-banner tone-${getTaskOverallTone(task)}`}>
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
        <div className="tabs-switcher task-detail-tabs" role="tablist" aria-label={`任务 ${task.taskId} 详情页签`}>
          <button className={`tab-btn ${detailTab === 'results' ? 'active' : ''}`} type="button" onClick={() => setDetailTab('results')}>概览与结果</button>
          <button className={`tab-btn ${detailTab === 'sync' ? 'active' : ''}`} type="button" onClick={() => setDetailTab('sync')}>文档回填</button>
          <button className={`tab-btn ${detailTab === 'logs' ? 'active' : ''}`} type="button" onClick={() => setDetailTab('logs')}>二维码与日志</button>
        </div>
      </div>

      {detailTab === 'results' ? (
        <>
          <div className="task-detail-section stack-md">
            <div className="task-summary-grid">
              <div className="meta-card compact-meta-card"><span>内容 ID</span><strong>{task.contentId || '-'}</strong></div>
              <div className="meta-card compact-meta-card"><span>登录账号</span><strong>{task.accountNickname || '待扫码'}</strong><small>{task.accountId || '扫码成功后自动回填'}</small></div>
              <div className="meta-card compact-meta-card"><span>更新时间</span><strong>{formatDateTime(task.updatedAt)}</strong><small>{task.fetchedAt ? `查询时间：${formatDateTime(task.fetchedAt)}` : '等待自动查询'}</small></div>
            </div>
          </div>
          <TaskDetailResultSection
            activeTab={activeTab}
            setActiveTab={setActiveTab}
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
        </>
      ) : null}

      {detailTab === 'sync' ? (
        <>
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
        </>
      ) : null}

      {detailTab === 'logs' ? (
        <>
          <div className="task-detail-section stack-md">
            <div className="task-section-header">
              <div>
                <strong>二维码区</strong>
                <small>{showQr ? '适合直接下载或复制图片发到微信群。' : '当前状态没有可用二维码，可按需刷新后继续。'}</small>
              </div>
              <div className="task-actions-inline" onClick={stopPropagation}>
                <a
                  className={`secondary-btn inline-link-btn ${!task.qrImageUrl ? 'disabled' : ''}`}
                  href={task.qrImageUrl || '#'}
                  download={`task-${task.taskId}-qr.png`}
                  onClick={(event) => {
                    stopPropagation(event)
                    if (!task.qrImageUrl) event.preventDefault()
                  }}
                >
                  下载二维码
                </a>
                <button className="secondary-btn" type="button" disabled={!canCopyQr || busy || taskBusy} onClick={() => onCopyQr(task)}>
                  {copying ? '已复制' : '复制图片'}
                </button>
                <button className="secondary-btn" type="button" disabled={!canRefresh || busy} onClick={() => onRefreshLogin(task.taskId)}>
                  刷新二维码
                </button>
              </div>
            </div>
            <div className="qr-wrap task-detail-qr-wrap">
              {showQr ? (
                <img className="qr-image" src={task.qrImageUrl} alt={`任务 ${task.remark} 的二维码`} />
              ) : (
                <div className="task-qr-placeholder">
                  <strong>{formatTaskLoginStatus(task.login.status)}</strong>
                  <small>如果二维码过期、会话中断或登录失败，可刷新重新生成。</small>
                </div>
              )}
            </div>
          </div>

          <div className="task-detail-section stack-md">
            <div className="task-section-header">
              <div>
                <strong>任务日志与文件</strong>
                <small>查询阶段的原始日志或开发者错误信息</small>
              </div>
            </div>
            <div className="task-actions-inline">
              {task.artifacts?.resultUrl ? <a className="secondary-btn inline-link-btn" href={task.artifacts.resultUrl} target="_blank" rel="noreferrer">打开结果 JSON</a> : null}
              {task.artifacts?.networkLogUrl ? <a className="secondary-btn inline-link-btn" href={task.artifacts.networkLogUrl} target="_blank" rel="noreferrer">打开网络日志</a> : null}
            </div>
            {task.error?.message ? (
              <div className={`task-state-banner tone-${getTaskQueryTone(task.query.status)}`}>
                <strong>{task.error.message}</strong>
                <small>{task.error.code || 'TASK_ERROR'}</small>
              </div>
            ) : null}
          </div>
        </>
      ) : null}

      <div className="task-actions-footer" onClick={stopPropagation}>
        <button className="secondary-btn" type="button" disabled={!canRetry || busy} onClick={() => onRetryQuery(task.taskId)}>
          重试查询
        </button>
        <button className="secondary-btn danger-ghost-btn" type="button" disabled={!canDelete || busy} onClick={() => onDeleteTask(task.taskId)}>
          删除任务
        </button>
      </div>
    </div>
  )
})
