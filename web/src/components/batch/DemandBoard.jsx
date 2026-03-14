import { CircleAlert, CircleCheckBig, Search, SendHorizontal, SquareChartGantt, Users, WandSparkles } from 'lucide-react'
import { formatDateTime } from '../../lib/ui'
import { InlineNotice } from '../ui/InlineNotice'
import { SectionCard } from '../ui/SectionCard'
import { StatCard } from '../ui/StatCard'
import { StatusBadge } from '../ui/StatusBadge'

const SHEET_FILTER_OPTIONS = [
  { value: 'open', label: '仅看待补数' },
  { value: 'exception', label: '仅看异常' },
  { value: 'all', label: '查看全部' },
  { value: 'complete', label: '已完整' }
]

export function DemandBoard({
  accounts,
  accountsLoading,
  syncConfig,
  docsConfigDraft,
  docsDiagnostic,
  diagnosticPending,
  docsLoginSession,
  readyAccountCount,
  matchedAccountCount,
  matchedReadyAccounts,
  onCreateSheetTasks,
  onMatchAccounts,
  onCreateTasksFromAccounts,
  creatingSheetTasks,
  matchingAccounts,
  creatingMatchedAccountTasks,
  demandFilter,
  onDemandFilterChange,
  demandSearch,
  onDemandSearchChange
}) {
  const demands = docsDiagnostic.payload?.demands || []
  const summary = docsDiagnostic.payload?.summary || {
    totalRows: 0,
    completeRows: 0,
    needsFillRows: 0,
    missingContentIdRows: 0,
    duplicateNicknameRows: 0
  }
  const filteredDemands = demands
    .filter((item) => matchesDemandFilter(item, demandFilter))
    .filter((item) => {
      const keyword = String(demandSearch || '').trim().toLowerCase()
      if (!keyword) return true
      return [item.nickname, item.contentId, item.status].some((value) => String(value || '').toLowerCase().includes(keyword))
    })

  const loginStatus = docsLoginSession?.status || syncConfig.login?.status || 'IDLE'
  const showDeferredState = diagnosticPending && !docsDiagnostic.payload && !docsDiagnostic.error
  const canCreateSheetTasks = Boolean(
    syncConfig.enabled
      && docsConfigDraft.docUrl
      && (docsConfigDraft.sheetName || syncConfig.target?.sheetName)
      && loginStatus === 'LOGGED_IN'
  )

  return (
    <SectionCard className="batch-demand-board stack-lg" variant="feature">
      {showDeferredState ? (
        <>
          <InlineNotice
            tone="info"
            eyebrow="需求区预热"
            icon={WandSparkles}
            title="交接表摘要正在后台生成"
            description="首屏先保住主控制流和任务区阅读顺序；缺数达人、缺内容 ID 和异常分布会在静默检查完成后自动补齐。"
          />
          <div className="task-summary-grid handoff-summary-grid" role="status" aria-live="polite">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="meta-card compact-meta-card diagnostic-card skeleton-card batch-skeleton-card">
                <div className="skeleton-line short" />
                <div className="skeleton-line tall" />
                <div className="skeleton-line medium" />
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="task-summary-grid handoff-summary-grid">
          <SummaryCard label="总行数" value={summary.totalRows} helper="已扫描交接表数据行" tone="info" icon={SquareChartGantt} />
          <SummaryCard label="待补数" value={summary.needsFillRows} helper="可自动查数并回填" tone="warning" icon={WandSparkles} />
          <SummaryCard label="缺内容ID" value={summary.missingContentIdRows} helper="需先补内容 ID" tone="danger" icon={CircleAlert} />
          <SummaryCard label="重名异常" value={summary.duplicateNicknameRows} helper="同名达人需人工处理" tone="danger" icon={Users} />
          <SummaryCard label="已完整" value={summary.completeRows} helper="无需重复发码" tone="success" icon={CircleCheckBig} />
        </div>
      )}

      <section className="panel handoff-account-match-panel stack-md v2-console-card">
        <div className="panel-split-header">
          <div className="compact-panel-header">
            <span className="section-eyebrow">账号库联动</span>
            <h2>匹配账号并批量下发</h2>
            <p>把已保存账号与当前交接表需求按昵称做匹配，优先找出 READY 且待补数的组合，再一键创建任务。</p>
          </div>
          <div className="tasks-toolbar-actions">
            <button className="secondary-btn" type="button" onClick={onMatchAccounts} disabled={matchingAccounts || accountsLoading}>
              <Search size={18} aria-hidden="true" />
              <span>{matchingAccounts ? '匹配中...' : '匹配账号库'}</span>
            </button>
            <button
              className="primary-btn"
              type="button"
              onClick={onCreateTasksFromAccounts}
              disabled={creatingMatchedAccountTasks || matchedReadyAccounts.length === 0}
            >
              <SendHorizontal size={18} aria-hidden="true" />
              <span>{creatingMatchedAccountTasks ? '创建中...' : '为匹配账号创建任务'}</span>
            </button>
          </div>
        </div>

        <div className="task-summary-grid diagnostic-summary-grid">
          <SummaryCard label="已保存账号" value={accounts.length} helper="批量页可直接调用账号库" tone="info" />
          <SummaryCard label="可用账号" value={readyAccountCount} helper="状态为 READY 的账号" tone="success" />
          <SummaryCard label="命中交接表" value={matchedAccountCount} helper="昵称可映射到当前需求" tone="warning" />
          <SummaryCard label="可直接下发" value={matchedReadyAccounts.length} helper="READY 且状态为待补数" tone={matchedReadyAccounts.length > 0 ? 'success' : 'info'} />
        </div>

        {matchedReadyAccounts.length > 0 ? (
          <div className="task-actions-inline handoff-account-chip-list">
            {matchedReadyAccounts.slice(0, 8).map(({ account, demand }) => (
              <span key={account.accountId} className="task-meta-chip">
                {account.nickname || account.accountId}
                {demand?.contentId ? ` · ${demand.contentId}` : ''}
              </span>
            ))}
            {matchedReadyAccounts.length > 8 ? (
              <span className="task-meta-chip">+{matchedReadyAccounts.length - 8} 个账号</span>
            ) : null}
          </div>
        ) : showDeferredState ? (
          <div className="task-inline-hint" role="status" aria-live="polite">
            首轮匹配会在交接表静默检查后更准确；如果你现在就要联动账号库，可直接点击“匹配账号库”立即强制刷新。
          </div>
        ) : (
          <div className="task-inline-hint">
            {accountsLoading
              ? '正在读取账号库...'
              : '当前还没有 READY 且待补数的可执行组合；可先点击“匹配账号库”刷新最新交接表与账号命中情况。'}
          </div>
        )}
      </section>

      <section className="panel handoff-demand-panel stack-md v2-console-card">
        <div className="panel-split-header">
          <div className="compact-panel-header">
            <span className="section-eyebrow">交接表需求区</span>
            <h2>缺数达人列表</h2>
            <p>默认只看需要补数和异常达人，发码前先确认内容 ID 和目标行是否正确。</p>
          </div>
        <div className="tasks-toolbar-actions">
            <button className="primary-btn" type="button" onClick={() => onCreateSheetTasks(1)} disabled={!canCreateSheetTasks || creatingSheetTasks === 1}>
              <SendHorizontal size={18} aria-hidden="true" />
              <span>生成 1 个光合二维码</span>
            </button>
            <button className="secondary-btn ghost-btn" type="button" onClick={() => onCreateSheetTasks(2)} disabled={!canCreateSheetTasks || creatingSheetTasks === 2}>
              <SendHorizontal size={18} aria-hidden="true" />
              <span>生成 2 个光合二维码</span>
            </button>
            <button className="secondary-btn ghost-btn" type="button" onClick={() => onCreateSheetTasks(5)} disabled={!canCreateSheetTasks || creatingSheetTasks === 5}>
              <SendHorizontal size={18} aria-hidden="true" />
              <span>生成 5 个光合二维码</span>
            </button>
          </div>
        </div>

        <div className="handoff-demand-toolbar">
          <div className="task-actions-inline">
            {SHEET_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`secondary-btn compact-btn ${demandFilter === option.value ? 'is-active' : ''}`}
                type="button"
                onClick={() => onDemandFilterChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="toolbar-search-field compact-search-field">
            <span>搜索达人</span>
            <input
              type="search"
              value={demandSearch}
              placeholder="搜索达人名、内容ID、状态"
              onChange={(event) => onDemandSearchChange(event.target.value)}
            />
          </label>
        </div>

        {showDeferredState ? (
          <div className="handoff-demand-list handoff-demand-list-loading" role="status" aria-live="polite">
            <div className="handoff-demand-row handoff-demand-head" role="row">
              <span>达人名</span>
              <span>内容 ID</span>
              <span>状态</span>
              <span>缺失列</span>
              <span>最近检查</span>
            </div>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="handoff-demand-row tone-info skeleton-demand-row" role="row">
                <div className="skeleton-line medium" />
                <div className="skeleton-line short" />
                <div className="skeleton-line short" />
                <div className="skeleton-line short" />
                <div className="skeleton-line short" />
              </div>
            ))}
          </div>
        ) : filteredDemands.length === 0 ? (
          <div className="result-empty-state compact-empty-state">
            <strong>当前筛选下没有达人需求</strong>
            <p>可以切换到“查看全部”确认交接表扫描结果，或先检查表头和内容 ID 是否齐全。</p>
          </div>
        ) : (
          <div className="handoff-demand-list" role="table" aria-label="缺数达人列表">
            <div className="handoff-demand-row handoff-demand-head" role="row">
              <span>达人名</span>
              <span>内容 ID</span>
              <span>状态</span>
              <span>缺失列</span>
              <span>最近检查</span>
            </div>
            {filteredDemands.map((item) => (
              <div key={`${item.sheetRow}-${item.nickname}-${item.contentId}`} className={`handoff-demand-row tone-${getDemandTone(item.status)}`} role="row">
                <strong>{item.nickname || '未填写达人名'}</strong>
                <span className="mono-cell">{item.contentId || '-'}</span>
                <StatusBadge tone={getDemandTone(item.status)}>{formatDemandStatus(item.status)}</StatusBadge>
                <span>{item.missingCount > 0 ? `${item.missingCount} 列` : '0 列'}</span>
                <small>{docsDiagnostic.checkedAt ? formatDateTime(docsDiagnostic.checkedAt) : '-'}</small>
              </div>
            ))}
          </div>
        )}
      </section>
    </SectionCard>
  )
}

function SummaryCard({ label, value, helper, tone, icon }) {
  return (
    <StatCard
      label={label}
      value={value}
      detail={helper}
      tone={tone}
      icon={icon}
      emphasis="hero"
      className="meta-card compact-meta-card diagnostic-card"
    />
  )
}

function matchesDemandFilter(item, filter) {
  if (filter === 'exception') return ['CONTENT_ID_MISSING', 'DUPLICATE_NICKNAME'].includes(item.status)
  if (filter === 'complete') return item.status === 'COMPLETE'
  if (filter === 'all') return true
  return item.status === 'NEEDS_FILL'
}

function getDemandTone(status) {
  if (status === 'COMPLETE') return 'success'
  if (status === 'NEEDS_FILL') return 'warning'
  return 'danger'
}

function formatDemandStatus(status) {
  if (status === 'COMPLETE') return '已完整'
  if (status === 'NEEDS_FILL') return '待补数'
  if (status === 'CONTENT_ID_MISSING') return '缺内容ID'
  if (status === 'DUPLICATE_NICKNAME') return '重名异常'
  return status || '未知'
}
