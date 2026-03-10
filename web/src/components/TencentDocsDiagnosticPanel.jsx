import { getMissingTencentDocsHeaders, getTencentDocsLoginStatus, getTencentDocsSheetStatus, formatDateTime } from '../lib/taskFormat'

export function TencentDocsDiagnosticPanel({ syncConfig, diagnostic, onInspect }) {
    const headers = diagnostic.payload?.headers || []
    const missingHeaders = getMissingTencentDocsHeaders(headers)
    const loginStatus = getTencentDocsLoginStatus(syncConfig, diagnostic)
    const sheetStatus = getTencentDocsSheetStatus(syncConfig, diagnostic, missingHeaders)
    const statusItems = [
        {
            label: '功能开关',
            tone: syncConfig.available ? (syncConfig.enabled ? 'success' : 'warning') : 'danger',
            value: syncConfig.available ? (syncConfig.enabled ? '已启用' : '未启用') : '未接入',
            detail: syncConfig.available ? `模式：${syncConfig.mode || 'browser'}` : (syncConfig.error || '未暴露腾讯文档配置接口')
        },
        {
            label: '默认目标',
            tone: syncConfig.defaultTargetConfigured ? 'success' : 'warning',
            value: syncConfig.defaultTargetConfigured ? (syncConfig.defaultSheetName || '已配置') : '待配置',
            detail: syncConfig.defaultTargetConfigured ? '将优先使用默认 docUrl 和 sheetName' : '请先配置默认腾讯文档地址与工作表名'
        },
        {
            label: '登录/读表',
            tone: loginStatus.tone,
            value: loginStatus.value,
            detail: loginStatus.detail
        },
        {
            label: '表头检查',
            tone: sheetStatus.tone,
            value: sheetStatus.value,
            detail: sheetStatus.detail
        }
    ]

    return (
        <section className="panel tencent-diagnostic-panel stack-md">
            <div className="panel-split-header">
                <div className="compact-panel-header">
                    <span className="section-eyebrow">腾讯文档</span>
                    <h2>同步诊断</h2>
                    <p>先确认默认目标、登录态和表头是否正常，再去处理批量任务里的补同步，排障会省很多时间。</p>
                </div>
                <div className="tasks-toolbar-actions">
                    <button
                        className="secondary-btn"
                        type="button"
                        disabled={diagnostic.loading || !syncConfig.available}
                        onClick={onInspect}
                    >
                        {diagnostic.loading ? '诊断中...' : '立即诊断'}
                    </button>
                </div>
            </div>

            <div className="task-summary-grid diagnostic-summary-grid">
                {statusItems.map((item) => (
                    <div key={item.label} className={`meta-card compact-meta-card diagnostic-card tone-${item.tone}`}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                        <small>{item.detail}</small>
                    </div>
                ))}
            </div>

            {diagnostic.checkedAt ? (
                <div className="task-sync-meta diagnostic-meta">
                    <strong>最近诊断时间</strong>
                    <small>{formatDateTime(diagnostic.checkedAt)}</small>
                </div>
            ) : null}

            {diagnostic.error ? (
                <div className={`task-state-banner tone-${loginStatus.tone}`}>
                    <strong>{diagnostic.error.message}</strong>
                    <small>{diagnostic.error.code || 'TENCENT_DOCS_INSPECT_FAILED'}</small>
                </div>
            ) : null}

            {headers.length > 0 ? (
                <div className="sync-preview-card stack-sm">
                    <strong>当前表头</strong>
                    <small>{`共 ${headers.length} 列，已读取 ${diagnostic.payload?.rowCount || 0} 行预览数据`}</small>
                    <div className="sync-columns-list">
                        {headers.map((header) => (
                            <span key={header} className="task-recommend-pill">{header}</span>
                        ))}
                    </div>
                </div>
            ) : null}

            {missingHeaders.length > 0 ? (
                <div className="task-state-banner tone-warning">
                    <strong>模板列缺失</strong>
                    <small>{`当前缺少：${missingHeaders.join('、')}`}</small>
                </div>
            ) : null}

            {diagnostic.payload?.artifacts ? (
                <div className="result-actions-row sync-artifact-links">
                    {diagnostic.payload.artifacts.beforeReadUrl ? <a className="secondary-btn inline-link-btn" href={diagnostic.payload.artifacts.beforeReadUrl} target="_blank" rel="noreferrer">读表前截图</a> : null}
                    {diagnostic.payload.artifacts.afterReadUrl ? <a className="secondary-btn inline-link-btn" href={diagnostic.payload.artifacts.afterReadUrl} target="_blank" rel="noreferrer">读表后截图</a> : null}
                    {diagnostic.payload.artifacts.selectionTsvUrl ? <a className="secondary-btn inline-link-btn" href={diagnostic.payload.artifacts.selectionTsvUrl} target="_blank" rel="noreferrer">打开选区 TSV</a> : null}
                    {diagnostic.payload.artifacts.previewJsonUrl ? <a className="secondary-btn inline-link-btn" href={diagnostic.payload.artifacts.previewJsonUrl} target="_blank" rel="noreferrer">打开诊断 JSON</a> : null}
                    {diagnostic.payload.artifacts.errorUrl ? <a className="secondary-btn inline-link-btn" href={diagnostic.payload.artifacts.errorUrl} target="_blank" rel="noreferrer">打开错误截图</a> : null}
                </div>
            ) : null}
        </section>
    )
}
