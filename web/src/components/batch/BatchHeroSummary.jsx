import { FileSpreadsheet, QrCode, RefreshCw, ScanSearch, TriangleAlert, WandSparkles, Wrench } from 'lucide-react'
import { formatDateTime, formatTencentDocsLoginStatus, getTencentDocsLoginTone } from '../../lib/ui'
import { CommandBar } from '../ui/CommandBar'
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
  onInspect,
  onRefresh,
  onToggleDiagnostics
}) {
  const pendingCount = normalizeCount(pendingDemandCount)
  const waitingQueueCount = normalizeCount(waitingCount)
  const exceptionQueueCount = normalizeCount(exceptionCount)
  const activeLoginTone = getTencentDocsLoginTone(loginStatus)

  return (
    <CommandBar
      className="batch-command-bar"
      eyebrow="任务指挥台"
      title="批量闭环工作区"
      description="先锁定交接表和文档登录态，再从待补数需求出发创建任务、发码、查数与回填。"
      meta={(
        <div className="batch-command-meta">
          <StatusBadge tone={activeLoginTone} emphasis="glass">
            腾讯文档 {formatTencentDocsLoginStatus(loginStatus)}
          </StatusBadge>
          <small>{lastSyncedAt ? `任务队列更新于 ${formatDateTime(lastSyncedAt)}` : '任务队列等待首次刷新'}</small>
        </div>
      )}
      actions={(
        <>
          <button className="primary-btn" type="button" onClick={onToggleBuilder}>
            <Wrench size={18} aria-hidden="true" />
            <span>{isBuilderOpen ? '关闭手工建任务' : '创建任务'}</span>
          </button>
          <button className="secondary-btn" type="button" onClick={onInspect}>
            <ScanSearch size={18} aria-hidden="true" />
            <span>检查工作表</span>
          </button>
          <button className="secondary-btn" type="button" onClick={onRefresh}>
            <RefreshCw size={18} aria-hidden="true" />
            <span>{loading ? '刷新中...' : '刷新'}</span>
          </button>
        </>
      )}
    >
      <div className="command-bar-grid">
        <StatCard
          label="待补数"
          value={pendingCount}
          detail={activeTarget?.sheetName ? `当前工作表：${activeTarget.sheetName}` : '请先锁定目标工作表'}
          tone="warning"
          icon={FileSpreadsheet}
          emphasis="hero"
          className="command-metric-tile"
        />
        <StatCard
          label="待扫码"
          value={waitingQueueCount}
          detail={waitingQueueCount > 0 ? '优先处理二维码队列' : '当前可以继续发起新任务'}
          tone="info"
          icon={QrCode}
          emphasis="hero"
          className="command-metric-tile"
        />
        <StatCard
          label="进行中"
          value={Math.max(0, waitingQueueCount + pendingCount - exceptionQueueCount)}
          detail={loginUpdatedAt ? `登录态更新 ${formatDateTime(loginUpdatedAt)}` : '等待建立文档登录态'}
          tone="accent"
          icon={WandSparkles}
          emphasis="hero"
          className="command-metric-tile"
        />
        <StatCard
          label="异常"
          value={exceptionQueueCount}
          detail={diagnosticsOpen ? '高级排障已展开' : '需要时可展开高级排障'}
          tone={exceptionQueueCount > 0 ? 'danger' : 'neutral'}
          icon={TriangleAlert}
          emphasis="hero"
          className="command-metric-tile"
        />
      </div>

      <div className="batch-command-footnote">
        <button className="secondary-btn ghost-btn compact-btn" type="button" onClick={onToggleDiagnostics}>
          <span>{diagnosticsOpen ? '收起高级排障' : '展开高级排障'}</span>
        </button>
        <small>{activeTarget?.docUrl || '保存腾讯文档链接后，这里会持续显示当前目标文档。'}</small>
      </div>
    </CommandBar>
  )
}

function normalizeCount(value) {
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}
