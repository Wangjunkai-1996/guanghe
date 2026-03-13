import {
    METRIC_ORDER,
    formatDateTime,
    formatMetricValue,
    supportsClipboardImage,
    stopPropagation,
    isTaskBusy,
    canRefreshTaskLogin,
    canRetryTaskQuery,
    canDeleteTask,
    canPreviewTaskSync,
    canSyncTask,
    resolveTaskSyncState,
    getTaskSyncDescription,
    formatTaskLoginStatus,
    formatTaskQueryStatus,
    formatTaskSyncStatus,
    getTaskQueryTone,
    getTaskLoginTone,
    getTaskSyncTone,
    getTaskOverallTone,
    getTaskSheetMatchTone,
    formatTaskSheetMatchStatus,
    getTaskSheetMatchDetail,
    getTaskSheetMatchSource,
    getTaskSummary,
    getTaskPrimaryActionLabel,
    normalizeStatusTone,
    getTaskRecommendations,
    resolveMetricPayload
} from '../lib/taskFormat'
import React, { useState, useEffect } from 'react'
import { TaskDetailResultSection } from './task/TaskDetailResultSection'
import { TaskDetailSheetMatchSection } from './task/TaskDetailSheetMatchSection'
import { TaskDetailSyncSection } from './task/TaskDetailSyncSection'

export const TaskSmsInput = React.memo(function TaskSmsInput({ taskId, onSubmitSmsCode, onClick }) {
    const [smsCode, setSmsCode] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [smsError, setSmsError] = useState('')

    const handleSubmit = async () => {
        if (!smsCode.trim()) return
        setSubmitting(true)
        setSmsError('')
        try {
            await onSubmitSmsCode(taskId, smsCode.trim())
            setSmsCode('')
        } catch (e) {
            setSmsError(e.message || '验证码错误，请重试')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="task-card-sms-input" onClick={onClick}>
            <p className="sms-hint">检测到风控验证，请输入手机验证码</p>
            <div className="sms-input-row">
                <input
                    className="sms-code-input"
                    type="text"
                    placeholder="请输入验证码"
                    value={smsCode}
                    maxLength={8}
                    onChange={e => setSmsCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    disabled={submitting}
                />
                <button className="primary-btn compact-btn" type="button" disabled={submitting || !smsCode.trim()} onClick={handleSubmit}>
                    {submitting ? '提交中...' : '提交'}
                </button>
            </div>
            {smsError ? <p className="sms-error">{smsError}</p> : null}
        </div>
    )
})

export const TaskCard = React.memo(function TaskCard({ task, syncConfig, selected, recommended, onSelect, expanded, onToggleExpand, onCopyQr, onRefreshLogin, onSubmitSmsCode, copying, busy }) {
    const tone = getTaskOverallTone(task)
    const waitingForLogin = ['WAITING_QR', 'WAITING_CONFIRM', 'WAITING_SMS'].includes(task.login.status)
    const waitingForSms = task.login.status === 'WAITING_SMS'
    const sheetMatchSource = task.taskMode === 'SHEET_DEMAND' ? getTaskSheetMatchSource(task) : ''

    return (
        <article
            className={`task-queue-card tone-${tone} ${selected || expanded ? 'selected' : ''} ${waitingForLogin ? 'has-qr-peek' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => onToggleExpand ? onToggleExpand(task.taskId) : onSelect(task.taskId)}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    if (onToggleExpand) {
                        onToggleExpand(task.taskId)
                    } else {
                        onSelect(task.taskId)
                    }
                }
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

export const TaskBuilderModal = React.memo(function TaskBuilderModal({
    draftLines,
    draftValidation,
    displayBatchErrors,
    batchInput,
    submitting,
    textareaRef,
    serverBatchErrors,
    onClose,
    onChange,
    onSubmit
}) {
    return (
        <div className="builder-modal-root" role="dialog" aria-modal="true" aria-labelledby="batch-builder-title">
            <div className="builder-modal-backdrop" onClick={onClose} />

            <section className="panel builder-modal-panel stack-md">
                <div className="task-detail-header">
                    <div className="compact-panel-header">
                        <span className="section-eyebrow">批量导入</span>
                        <h2 id="batch-builder-title">新建批量任务</h2>
                        <p>先看可创建数量和错误，再一次性发出二维码任务，避免一边粘贴一边来回切页面。</p>
                    </div>
                    <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭新建任务">×</button>
                </div>

                <div className="task-builder-stats">
                    <div className="task-builder-stat">
                        <span>总行数</span>
                        <strong>{draftLines}</strong>
                    </div>
                    <div className="task-builder-stat">
                        <span>可创建</span>
                        <strong>{draftValidation.tasks.length}</strong>
                    </div>
                    <div className="task-builder-stat danger">
                        <span>错误数</span>
                        <strong>{displayBatchErrors.length}</strong>
                    </div>
                </div>

                <form className="stack-md" onSubmit={onSubmit}>
                    <label className="field">
                        <span>批量任务输入</span>
                        <textarea
                            ref={textareaRef}
                            className="batch-textarea"
                            placeholder={'达人A,554608495125\n达人B\t537029503554'}
                            value={batchInput}
                            onChange={(event) => onChange(event.target.value)}
                        />
                    </label>

                    <div className="builder-helper-list">
                        <span>格式 1：备注,内容ID</span>
                        <span>格式 2：备注&lt;TAB&gt;内容ID</span>
                        <span>建议一次控制在 1–5 条</span>
                    </div>

                    {displayBatchErrors.length > 0 ? (
                        <div className="inline-error stack-sm">
                            {displayBatchErrors.map((item, index) => (
                                <div key={`${item.line}-${index}`}>
                                    {item.line > 0 ? `第 ${item.line} 行：` : ''}
                                    {item.message}
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {serverBatchErrors && serverBatchErrors.length > 0 ? (
                        <div className="inline-error stack-sm">
                            {serverBatchErrors.map((err, index) => (
                                <div key={index}>{err.message || '未知服务器错误'}</div>
                            ))}
                        </div>
                    ) : null}

                    <div className="task-composer-actions">
                        <button className="primary-btn" type="submit" disabled={submitting}>
                            {submitting ? '创建中...' : '批量创建二维码任务'}
                        </button>
                        <small>创建后系统会自动进入扫码跟进流程。</small>
                    </div>
                </form>
            </section>
        </div>
    )
})

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
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [detailTab, setDetailTab] = useState('results')

    useEffect(() => {
        setActiveTab('summary')
    }, [task?.taskId, task?.screenshots?.summaryUrl, task?.screenshots?.rawUrl])

    useEffect(() => {
        setShowAdvanced(false)
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
                        showAdvanced={true}
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
                    {task.taskMode === 'SHEET_DEMAND' ? <TaskDetailSheetMatchSection task={task} showAdvanced={true} /> : null}
                    <TaskDetailSyncSection
                        task={task}
                        syncConfig={syncConfig}
                        syncPreview={syncPreview}
                        syncAction={syncAction}
                        onPreviewSync={onPreviewSync}
                        onSyncTask={onSyncTask}
                        showAdvanced={true}
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
