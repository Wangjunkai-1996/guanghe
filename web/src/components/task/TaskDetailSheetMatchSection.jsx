import React from 'react'
import { formatTaskSheetMatchStatus, getTaskSheetMatchDetail, getTaskSheetMatchTone } from '../../lib/taskFormat'

export const TaskDetailSheetMatchSection = React.memo(function TaskDetailSheetMatchSection({ task, showAdvanced }) {
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
})
