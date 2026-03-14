import { formatDateTime, formatTencentDocsLoginStatus, getTencentDocsLoginTone } from '../../lib/ui'
import { SectionCard } from '../ui/SectionCard'

export function BatchHeroSummary({
  activeTarget,
  loginStatus,
  loginUpdatedAt,
  pendingDemandCount,
  waitingCount,
  exceptionCount,
  lastSyncedAt,
  isBuilderOpen,
  loading,
  diagnosticsOpen,
  onToggleBuilder,
  onRefresh,
  onToggleDiagnostics
}) {
  return (
    <SectionCard className="batch-hero-summary stack-md">
      <div className="panel-split-header">
        <div className="compact-panel-header">
          <span className="section-eyebrow">顶部控制中心</span>
          <h2>批量任务控制中心</h2>
          <p>优先确认腾讯文档目标、登录态与待补数规模，再决定是否发码或进入高级排障。</p>
        </div>

        <div className="tasks-toolbar-actions">
          <button className="primary-btn" type="button" onClick={onToggleBuilder}>
            {isBuilderOpen ? '关闭手工建任务' : '手工建任务'}
          </button>
          <button className="secondary-btn" type="button" onClick={onRefresh}>
            {loading ? '刷新中...' : '刷新列表'}
          </button>
          <button className="secondary-btn" type="button" onClick={onToggleDiagnostics}>
            {diagnosticsOpen ? '收起高级排障' : '展开高级排障'}
          </button>
        </div>
      </div>

      <div className="batch-hero-grid">
        <div className="meta-card compact-meta-card diagnostic-card tone-info">
          <span>腾讯文档目标</span>
          <strong>{activeTarget?.sheetName || '未选择'}</strong>
          <small>{activeTarget?.docUrl || '请先录入并保存腾讯文档链接'}</small>
        </div>
        <div className={`meta-card compact-meta-card diagnostic-card tone-${getTencentDocsLoginTone(loginStatus)}`}>
          <span>文档登录状态</span>
          <strong>{formatTencentDocsLoginStatus(loginStatus)}</strong>
          <small>{loginUpdatedAt ? formatDateTime(loginUpdatedAt) : '尚未建立登录态'}</small>
        </div>
        <div className="meta-card compact-meta-card diagnostic-card tone-warning">
          <span>待补数达人</span>
          <strong>{pendingDemandCount}</strong>
          <small>{waitingCount > 0 ? `当前有 ${waitingCount} 条任务等待扫码` : '可按需继续发起二维码任务'}</small>
        </div>
        <div className={`meta-card compact-meta-card diagnostic-card tone-${exceptionCount > 0 ? 'danger' : 'success'}`}>
          <span>异常任务数</span>
          <strong>{exceptionCount}</strong>
          <small>{lastSyncedAt ? `任务队列最近更新：${formatDateTime(lastSyncedAt)}` : '任务队列正在初始化'}</small>
        </div>
      </div>
    </SectionCard>
  )
}
