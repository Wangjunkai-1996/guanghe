import React from 'react'
import { METRIC_ORDER, formatDateTime, formatMetricValue, formatTaskQueryStatus, formatTaskLoginStatus, getTaskQueryTone, resolveMetricPayload } from '../../lib/taskFormat'

export const TaskDetailResultSection = React.memo(function TaskDetailResultSection({ activeTab, setActiveTab, previewImageUrl, task, busy, canRetry, onRetryQuery, showAdvanced }) {
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
})
