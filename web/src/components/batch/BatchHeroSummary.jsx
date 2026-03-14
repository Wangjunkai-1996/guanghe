import {
  FileSpreadsheet,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  Wrench
} from 'lucide-react'
import { formatDateTime, formatTencentDocsLoginStatus, getTencentDocsLoginTone } from '../../lib/ui'
import { SectionCard } from '../ui/SectionCard'
import { StatCard } from '../ui/StatCard'
import { StatusBadge } from '../ui/StatusBadge'

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
    <SectionCard className="batch-hero-summary stack-md" variant="hero" emphasis="strong">
      <div className="batch-hero-shell">
        <div className="batch-hero-copy">
          <div className="batch-hero-kicker-row">
            <span className="section-eyebrow">顶部控制中心</span>
            <StatusBadge tone={getTencentDocsLoginTone(loginStatus)} emphasis="glass">
              {formatTencentDocsLoginStatus(loginStatus)}
            </StatusBadge>
          </div>
          <h2>品牌化批量任务主控台</h2>
          <p>先锁定交接表目标和腾讯文档登录态，再把待补数达人、二维码任务和异常处理放进同一条运营节奏里。</p>

          <div className="batch-hero-inline-highlights">
            <div className="batch-hero-inline-card">
              <Sparkles size={18} aria-hidden="true" />
              <div>
                <strong>{activeTarget?.sheetName || '尚未选定交接表'}</strong>
                <small>{activeTarget?.docUrl || '请先录入并保存腾讯文档链接'}</small>
              </div>
            </div>
            <div className="batch-hero-inline-card">
              <QrCode size={18} aria-hidden="true" />
              <div>
                <strong>{waitingCount > 0 ? `${waitingCount} 条任务待扫码` : '二维码队列可继续发起'}</strong>
                <small>{loginUpdatedAt ? `文档登录更新于 ${formatDateTime(loginUpdatedAt)}` : '文档登录态尚未建立'}</small>
              </div>
            </div>
          </div>
        </div>

        <div className="batch-hero-actions-panel">
          <div className="batch-hero-action-stack">
            <button className="primary-btn hero-primary-btn" type="button" onClick={onToggleBuilder}>
              <Wrench size={18} aria-hidden="true" />
              <span>{isBuilderOpen ? '关闭手工建任务' : '手工建任务'}</span>
            </button>
            <button className="secondary-btn hero-secondary-btn" type="button" onClick={onRefresh}>
              <RefreshCw size={18} aria-hidden="true" />
              <span>{loading ? '刷新中...' : '刷新列表'}</span>
            </button>
            <button className="secondary-btn hero-secondary-btn quiet-action-btn" type="button" onClick={onToggleDiagnostics}>
              <ShieldAlert size={18} aria-hidden="true" />
              <span>{diagnosticsOpen ? '收起高级排障' : '展开高级排障'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="batch-hero-grid">
        <StatCard
          label="腾讯文档目标"
          value={activeTarget?.sheetName || '未选择'}
          detail={activeTarget?.docUrl || '请先录入并保存腾讯文档链接'}
          tone="info"
          icon={FileSpreadsheet}
          emphasis="hero"
        />
        <StatCard
          label="文档登录状态"
          value={formatTencentDocsLoginStatus(loginStatus)}
          detail={loginUpdatedAt ? formatDateTime(loginUpdatedAt) : '尚未建立登录态'}
          tone={getTencentDocsLoginTone(loginStatus)}
          icon={QrCode}
          emphasis="hero"
        />
        <StatCard
          label="待补数达人"
          value={pendingDemandCount}
          detail={waitingCount > 0 ? `当前有 ${waitingCount} 条任务等待扫码` : '可按需继续发起二维码任务'}
          tone="warning"
          icon={Sparkles}
          emphasis="hero"
        />
        <StatCard
          label="异常任务数"
          value={exceptionCount}
          detail={lastSyncedAt ? `任务队列最近更新：${formatDateTime(lastSyncedAt)}` : '任务队列正在初始化'}
          tone={exceptionCount > 0 ? 'danger' : 'success'}
          icon={exceptionCount > 0 ? TriangleAlert : ShieldAlert}
          emphasis="hero"
        />
      </div>
    </SectionCard>
  )
}
