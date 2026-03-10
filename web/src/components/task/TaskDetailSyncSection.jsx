import React from 'react'
import { canPreviewTaskSync, canSyncTask, formatTaskSyncStatus, getTaskSyncDescription, getTaskSyncTone, normalizeStatusTone, resolveTaskSyncState } from '../../lib/taskFormat'

export const TaskDetailSyncSection = React.memo(function TaskDetailSyncSection({ task, syncConfig, syncPreview, syncAction, onPreviewSync, onSyncTask, showAdvanced }) {
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
})
