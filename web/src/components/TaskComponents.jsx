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
    getTaskSummary,
    getTaskPrimaryActionLabel,
    normalizeStatusTone,
    getTaskRecommendations,
    resolveMetricPayload
} from '../lib/taskFormat'
import { useState, useEffect } from 'react'

export function TaskCard({ task, syncConfig, selected, recommended, onSelect, expanded, onToggleExpand }) {
    const tone = getTaskOverallTone(task)

    return (
        <article
            className={`task-queue-card tone-${tone} ${selected || expanded ? 'selected' : ''}`}
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
                    </div>
                ) : null}
            </div>

            {task.sync?.status === 'FAILED' ? <div className="task-inline-hint">{task.sync.error?.message || '腾讯文档同步失败，请进入详情补同步。'}</div> : null}
            {!task.sync?.error?.message && task.error?.message ? <div className="task-inline-hint">{task.error.message}</div> : null}
        </article>
    )
}

export function TaskBuilderModal({
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
}

export function TaskDetailAccordion({
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

    useEffect(() => {
        setActiveTab('summary')
    }, [task?.taskId, task?.screenshots?.summaryUrl, task?.screenshots?.rawUrl])

    useEffect(() => {
        setShowAdvanced(false)
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

            {task.taskMode === 'SHEET_DEMAND' ? <TaskDetailSheetMatchSection task={task} showAdvanced={showAdvanced} /> : null}

            <div className="task-detail-section stack-md">
                <div className="task-summary-grid">
                    <div className="meta-card compact-meta-card"><span>内容 ID</span><strong>{task.contentId || '-'}</strong></div>
                    <div className="meta-card compact-meta-card"><span>登录账号</span><strong>{task.accountNickname || '待扫码'}</strong><small>{task.accountId || '扫码成功后自动回填'}</small></div>
                    <div className="meta-card compact-meta-card"><span>更新时间</span><strong>{formatDateTime(task.updatedAt)}</strong><small>{task.fetchedAt ? `查询时间：${formatDateTime(task.fetchedAt)}` : '等待自动查询'}</small></div>
                </div>
            </div>

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

            <div className="task-detail-section">
                <div className="task-advanced-toggle">
                    <div>
                        <strong>高级信息</strong>
                        <small>日志、JSON、截图预览与回填明细默认折叠。</small>
                    </div>
                    <button className="secondary-btn" type="button" onClick={() => setShowAdvanced((prev) => !prev)}>
                        {showAdvanced ? '收起高级信息' : '展开高级信息'}
                    </button>
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
                showAdvanced={showAdvanced}
            />

            <TaskDetailSyncSection
                task={task}
                syncConfig={syncConfig}
                syncPreview={syncPreview}
                syncAction={syncAction}
                onPreviewSync={onPreviewSync}
                onSyncTask={onSyncTask}
                showAdvanced={showAdvanced}
            />

            {task.error?.message ? (
                <div className={`task-state-banner tone-${getTaskQueryTone(task.query.status)}`}>
                    <strong>{task.error.message}</strong>
                    <small>{task.error.code || 'TASK_ERROR'}</small>
                </div>
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
}

function TaskDetailSheetMatchSection({ task, showAdvanced }) {
    const sheetName = task.sheetTarget?.sheetName || '未设置'
    const rowText = task.sheetMatch?.sheetRow ? `第 ${task.sheetMatch.sheetRow} 行` : '待命中'
    const missingCount = task.sheetMatch?.missingColumns?.length || 0
    const tone = getTaskSheetMatchTone(task.sheetMatch?.status)

    return (
        <div className="task-detail-section stack-sm">
            <div className="task-section-header">
                <div>
                    <strong>交接表匹配</strong>
                    <small>命中后自动查询并回填。</small>
                </div>
            </div>

            <div className="task-status-row">
                <span className={`status-pill status-${tone}`}>匹配：{formatTaskSheetMatchStatus(task.sheetMatch?.status)}</span>
                <span className="task-meta-chip">表：{sheetName}</span>
                <span className="task-meta-chip">行：{rowText}</span>
                <span className="task-meta-chip">缺失：{missingCount} 列</span>
            </div>

            {showAdvanced ? (
                <>
                    <div className={`task-state-banner tone-${tone}`}>
                        <strong>{formatTaskSheetMatchStatus(task.sheetMatch?.status)}</strong>
                        <small>{getTaskSheetMatchDetail(task)}</small>
                    </div>

                    <div className="task-summary-grid">
                        <div className="meta-card compact-meta-card"><span>目标工作表</span><strong>{sheetName}</strong></div>
                        <div className="meta-card compact-meta-card"><span>目标行</span><strong>{rowText}</strong><small>{task.sheetMatch?.nickname || task.accountNickname || '等待达人扫码'}</small></div>
                        <div className="meta-card compact-meta-card"><span>缺失列</span><strong>{missingCount} 列</strong><small>{missingCount ? task.sheetMatch.missingColumns.join('、') : '当前没有缺失列'}</small></div>
                    </div>
                </>
            ) : null}
        </div>
    )
}

function TaskDetailResultSection({ activeTab, setActiveTab, previewImageUrl, task, busy, canRetry, onRetryQuery, showAdvanced }) {
    const tone = getTaskQueryTone(task.query.status)

    if (task.query.status === 'SUCCEEDED') {
        const summaryThumbUrl = task.screenshots?.summaryUrl || ''
        const rawThumbUrl = task.screenshots?.rawUrl || ''
        const hasPreview = Boolean(summaryThumbUrl || rawThumbUrl)
        return (
            <div className="task-detail-section stack-md">
                <div className="task-section-header">
                    <div>
                        <strong>结果区</strong>
                        <small>优先读 5 项指标摘要，截图与日志按需展开。</small>
                    </div>
                    <div className="task-actions-inline">
                        {task.screenshots?.summaryUrl ? <a className="secondary-btn inline-link-btn" href={task.screenshots.summaryUrl} target="_blank" rel="noreferrer">查看汇总图</a> : null}
                        {task.screenshots?.rawUrl ? <a className="secondary-btn inline-link-btn" href={task.screenshots.rawUrl} target="_blank" rel="noreferrer">查看原图</a> : null}
                        {showAdvanced && task.artifacts?.resultUrl ? <a className="secondary-btn inline-link-btn" href={task.artifacts.resultUrl} target="_blank" rel="noreferrer">打开结果 JSON</a> : null}
                        {showAdvanced && task.artifacts?.networkLogUrl ? <a className="secondary-btn inline-link-btn" href={task.artifacts.networkLogUrl} target="_blank" rel="noreferrer">打开网络日志</a> : null}
                    </div>
                </div>

                <div className="task-detail-metrics-grid">
                    {METRIC_ORDER.map((metric) => (
                        <div key={metric} className="metric-card compact-metric-card">
                            <span>{metric}</span>
                            <strong>{formatMetricValue(resolveMetricPayload(task.metrics, metric)?.value)}</strong>
                            <small>{resolveMetricPayload(task.metrics, metric)?.field || '-'}</small>
                        </div>
                    ))}
                </div>

                {showAdvanced ? (
                    <div className="image-panel task-image-panel">
                        <div className="image-panel-header">
                            <div className="tabs-switcher" role="tablist" aria-label={`任务 ${task.taskId} 截图切换`}>
                                <button className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('summary')}>汇总截图</button>
                                <button className={`tab-btn ${activeTab === 'raw' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('raw')}>原始截图</button>
                            </div>
                            <small>{task.fetchedAt ? formatDateTime(task.fetchedAt) : '已生成查询结果'}</small>
                        </div>
                        <div className="image-stage compact-image-stage detail-image-stage">
                            {previewImageUrl ? (
                                <img className="result-image" src={previewImageUrl} alt={activeTab === 'summary' ? '任务汇总截图' : '任务原始截图'} />
                            ) : (
                                <div className="result-empty-state compact-empty-state"><strong>暂无截图</strong></div>
                            )}
                        </div>
                    </div>
                ) : null}

                {!showAdvanced && hasPreview ? (
                    <div className="detail-thumb-grid">
                        {summaryThumbUrl ? (
                            <a className="detail-thumb" href={summaryThumbUrl} target="_blank" rel="noreferrer" aria-label="查看汇总截图">
                                <img className="detail-thumb-image" src={summaryThumbUrl} alt="汇总截图缩略图" />
                            </a>
                        ) : null}
                        {rawThumbUrl ? (
                            <a className="detail-thumb" href={rawThumbUrl} target="_blank" rel="noreferrer" aria-label="查看原始截图">
                                <img className="detail-thumb-image" src={rawThumbUrl} alt="原始截图缩略图" />
                            </a>
                        ) : null}
                    </div>
                ) : null}
            </div>
        )
    }

    if (task.query.status === 'NO_DATA' || task.query.status === 'FAILED') {
        return (
            <div className="task-detail-section stack-md">
                <div className={`result-state-card tone-${tone}`}>
                    <div className="result-state-bar">
                        <div>
                            <span className="result-state-label">结果</span>
                            <strong>{formatTaskQueryStatus(task.query.status)}</strong>
                        </div>
                        <small>{task.error?.code || 'TASK_RESULT'}</small>
                    </div>
                    <p>{task.error?.message || '任务已结束，请查看截图和日志。'}</p>
                    <div className="result-actions-row">
                        {task.screenshots?.rawUrl ? <a className="secondary-btn inline-link-btn" href={task.screenshots.rawUrl} target="_blank" rel="noreferrer">打开原图</a> : null}
                        {showAdvanced && task.artifacts?.networkLogUrl ? <a className="secondary-btn inline-link-btn" href={task.artifacts.networkLogUrl} target="_blank" rel="noreferrer">打开网络日志</a> : null}
                        <button className="secondary-btn" type="button" disabled={!canRetry || busy} onClick={() => onRetryQuery(task.taskId)}>重试查询</button>
                    </div>
                    {showAdvanced && task.screenshots?.rawUrl ? <img className="result-image" src={task.screenshots.rawUrl} alt="任务异常截图" /> : null}
                    {!showAdvanced && task.screenshots?.rawUrl ? (
                        <div className="detail-thumb-grid single">
                            <a className="detail-thumb" href={task.screenshots.rawUrl} target="_blank" rel="noreferrer" aria-label="查看异常截图">
                                <img className="detail-thumb-image" src={task.screenshots.rawUrl} alt="异常截图缩略图" />
                            </a>
                        </div>
                    ) : null}
                </div>
            </div>
        )
    }

    return (
        <div className="task-detail-section stack-md">
            <div className={`result-state-card tone-${tone}`}>
                <div className="result-state-bar">
                    <div>
                        <span className="result-state-label">结果</span>
                        <strong>{formatTaskQueryStatus(task.query.status)}</strong>
                    </div>
                    <small>{formatTaskLoginStatus(task.login.status)}</small>
                </div>
                <p>扫码确认成功后，系统会自动把任务推进到查询队列。你可以先继续处理其他二维码任务。</p>
            </div>
        </div>
    )
}

function TaskDetailSyncSection({ task, syncConfig, syncPreview, syncAction, onPreviewSync, onSyncTask, showAdvanced }) {
    const syncState = resolveTaskSyncState(task, syncConfig)
    const tone = normalizeStatusTone(getTaskSyncTone(task, syncConfig))
    const previewData = syncPreview?.data || null
    const previewError = syncPreview?.error || null
    const previewWarnings = previewData?.warnings || []
    const previewLoading = syncAction === 'preview'
    const syncing = syncAction === 'sync' || task.sync?.status === 'RUNNING'
    const effectiveError = previewError || task.sync?.error || null
    const effectiveArtifacts = task.sync?.artifacts || previewError?.details?.artifacts || previewData?.artifacts || null
    const effectiveTarget = task.sync?.target || previewData?.target || null
    const effectiveMatch = task.sync?.match || previewData?.match || null
    const effectiveWriteSummary = task.sync?.writeSummary || previewData?.writeSummary || null
    const canPreview = canPreviewTaskSync(task, syncConfig) && !previewLoading && !syncing
    const canSync = canSyncTask(task, syncConfig) && !previewLoading && !syncing
    const columnCount = Array.isArray(previewData?.columns) ? previewData.columns.length : 0
    const targetName = effectiveTarget?.sheetName || syncConfig.defaultSheetName || '未配置'
    const matchRowText = effectiveMatch?.sheetRow ? `第 ${effectiveMatch.sheetRow} 行` : '待匹配'
    const writeAction = effectiveWriteSummary?.action || (previewData ? '预览完成' : formatTaskSyncStatus(task, syncConfig))
    const syncLabel = formatTaskSyncStatus(task, syncConfig)

    return (
        <div className="task-detail-section stack-md">
            <div className="task-section-header">
                <div>
                    <strong>腾讯文档同步</strong>
                    <small>查询成功后会自动尝试回填，日志与明细可按需展开。</small>
                </div>
                <div className="task-actions-inline">
                    <button className="secondary-btn" type="button" disabled={!canPreview} onClick={() => onPreviewSync(task)}>
                        {previewLoading ? '预览...' : '预览回填'}
                    </button>
                    <button className="secondary-btn" type="button" disabled={!canSync} onClick={() => onSyncTask(task)}>
                        {syncing ? '同步中...' : '立即同步'}
                    </button>
                </div>
            </div>

            <div className="task-status-row">
                <span className={`status-pill status-${tone}`}>同步：{syncLabel}</span>
                <span className="task-meta-chip">表：{targetName}</span>
                <span className="task-meta-chip">行：{matchRowText}</span>
                <span className="task-meta-chip">写入：{writeAction}</span>
            </div>

            {showAdvanced ? (
                <>
                    <div className={`task-state-banner tone-${tone}`}>
                        <strong>同步：{syncLabel}</strong>
                        <small>{getTaskSyncDescription(task, syncConfig)}</small>
                    </div>

                    <div className="task-summary-grid">
                        <div className="meta-card compact-meta-card">
                            <span>目标工作表</span>
                            <strong>{targetName}</strong>
                        </div>
                        <div className="meta-card compact-meta-card">
                            <span>匹配结果</span>
                            <strong>{matchRowText}</strong>
                            <small>{effectiveMatch?.contentId || task.contentId}</small>
                        </div>
                        <div className="meta-card compact-meta-card">
                            <span>写入结果</span>
                            <strong>{writeAction}</strong>
                        </div>
                    </div>
                </>
            ) : null}

            {effectiveError ? (
                <div className="task-state-banner tone-danger">
                    <strong>{effectiveError.message}</strong>
                    <small>{effectiveError.code || 'TENCENT_DOCS_SYNC_FAILED'}</small>
                </div>
            ) : null}

            {previewWarnings.length > 0 ? (
                <div className="task-state-banner tone-warning">
                    <strong>预览提示</strong>
                    <small>{previewWarnings.join('；')}</small>
                </div>
            ) : null}

            {showAdvanced && previewData ? (
                <div className="sync-preview-card stack-sm">
                    <strong>预览摘要</strong>
                    <small>
                        {previewData.match?.sheetRow
                            ? `将命中第 ${previewData.match.sheetRow} 行，并回填 ${columnCount} 列`
                            : `已生成预览，本次预计回填 ${columnCount} 列`}
                    </small>
                    {columnCount > 0 ? (
                        <div className="sync-columns-list">
                            {previewData.columns.map((column) => {
                                const label = typeof column === 'string' ? column : column.columnName || column.columnLetter || '-'
                                return <span key={label} className="task-recommend-pill">{label}</span>
                            })}
                        </div>
                    ) : null}
                </div>
            ) : null}

            {showAdvanced && effectiveArtifacts ? (
                <div className="result-actions-row sync-artifact-links">
                    {effectiveArtifacts.previewJsonUrl ? <a className="secondary-btn inline-link-btn" href={effectiveArtifacts.previewJsonUrl} target="_blank" rel="noreferrer">预览 JSON</a> : null}
                    {effectiveArtifacts.writeLogUrl ? <a className="secondary-btn inline-link-btn" href={effectiveArtifacts.writeLogUrl} target="_blank" rel="noreferrer">写入日志</a> : null}
                    {effectiveArtifacts.errorUrl ? <a className="secondary-btn inline-link-btn" href={effectiveArtifacts.errorUrl} target="_blank" rel="noreferrer">错误截图</a> : null}
                </div>
            ) : null}

            {syncState === 'PENDING' && !showAdvanced ? (
                <div className="task-advanced-hint">等待查询完成后可同步。</div>
            ) : null}

            {syncState === 'PENDING' && showAdvanced ? (
                <div className="task-state-banner tone-info">
                    <strong>等待查询完成</strong>
                    <small>任务只有在查询成功后才会触发自动同步或开放手动补同步。</small>
                </div>
            ) : null}
        </div>
    )
}
