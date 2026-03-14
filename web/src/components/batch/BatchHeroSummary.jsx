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
  const pendingCount = normalizeCount(pendingDemandCount)
  const waitingQueueCount = normalizeCount(waitingCount)
  const exceptionQueueCount = normalizeCount(exceptionCount)
  const taskOverview = pendingCount + waitingQueueCount + exceptionQueueCount

  return (
    <SectionCard className="batch-hero-summary stack-md" variant="feature" emphasis="strong">
      <div className="batch-hero-shell">
        <div className="batch-hero-copy">
          <div className="batch-hero-kicker-row">
            <span className="section-eyebrow">顶部控制中心</span>
            <StatusBadge tone={getTencentDocsLoginTone(loginStatus)} emphasis="glass">
              {formatTencentDocsLoginStatus(loginStatus)}
            </StatusBadge>
          </div>
          <h2>批量任务主控台</h2>
          <p>先锁定交接表目标和腾讯文档登录态，再进入待补数、二维码任务与异常处理的统一执行节奏。</p>

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
            <button className="secondary-btn hero-secondary-btn quiet-action-btn ghost-btn" type="button" onClick={onToggleDiagnostics}>
              <ShieldAlert size={18} aria-hidden="true" />
              <span>{diagnosticsOpen ? '收起高级排障' : '展开高级排障'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="batch-hero-grid">
        <StatCard
          label="当前交接表"
          value={activeTarget?.sheetName || '未选择'}
          detail={activeTarget?.docUrl || '请先录入并保存腾讯文档链接'}
          tone="info"
          icon={FileSpreadsheet}
          emphasis="hero"
        />
        <StatCard
          label="文档登录与同步"
          value={formatTencentDocsLoginStatus(loginStatus)}
          detail={loginUpdatedAt ? `最近同步 ${formatDateTime(loginUpdatedAt)}` : '尚未建立登录态'}
          tone={getTencentDocsLoginTone(loginStatus)}
          icon={QrCode}
          emphasis="hero"
        />
        <StatCard
          label="任务概况"
          value={taskOverview}
          detail={`待补数 ${pendingCount} · 待扫码 ${waitingQueueCount} · 异常 ${exceptionQueueCount}`}
          tone="warning"
          icon={exceptionCount > 0 ? TriangleAlert : ShieldAlert}
          emphasis="hero"
        />
      </div>
      <div className="batch-hero-footnote">
        <small>{lastSyncedAt ? `任务队列最近更新：${formatDateTime(lastSyncedAt)}` : '任务队列正在初始化'}</small>
      </div>
    </SectionCard>
  )
}

function normalizeCount(value) {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}
