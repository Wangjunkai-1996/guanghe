import { CircleAlert, CircleCheckBig, Search, SendHorizontal, SquareChartGantt, Users, WandSparkles } from 'lucide-react'
import { formatDateTime } from '../../lib/ui'
import { InlineNotice } from '../ui/InlineNotice'
import { SectionCard } from '../ui/SectionCard'
import { StageSectionCard } from '../ui/StageSectionCard'
import { StatCard } from '../ui/StatCard'
import { StatusBadge } from '../ui/StatusBadge'

const SHEET_FILTER_OPTIONS = [
  { value: 'open', label: '仅看待补数' },
  { value: 'exception', label: '仅看异常' },
  { value: 'all', label: '查看全部' },
  { value: 'complete', label: '已完整' }
]
const SHEET_TASK_COUNT_OPTIONS = [1, 2, 5]

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
  sheetTaskCount,
  onSheetTaskCountChange,
  onInspect,
  onMatchAccounts,
  onCreateTasksFromAccounts,
  creatingSheetTasks,
  matchingAccounts,
  creatingMatchedAccountTasks,
  demandFilter,
  onDemandFilterChange,
  demandSearch,
  onDemandSearchChange,
  taskCount = 0,
  onFocusQueue = () => {},
  summaryMobileExpanded = false,
  onToggleSummaryMobile = () => {},
  launchMobileExpanded = false,
  onToggleLaunchMobile = () => {}
}) {
  const demands = docsDiagnostic.payload?.demands || []
  const summary = docsDiagnostic.payload?.summary || {
    totalRows: 0,
    completeRows: 0,
    needsFillRows: 0,
    missingContentIdRows: 0,
    duplicateNicknameRows: 0
  }
  const isChecked = Boolean(docsDiagnostic.inspected && !docsDiagnostic.error)
  const pendingDemandCount = Number(summary.needsFillRows || 0)
  const showDeferredState = diagnosticPending && !docsDiagnostic.payload && !docsDiagnostic.error
  const isCompleteMode = isChecked && !showDeferredState && pendingDemandCount === 0
  const sortedDemands = [...demands].sort(compareDemands)
  const filteredDemands = sortedDemands
    .filter((item) => matchesDemandFilter(item, demandFilter))
    .filter((item) => {
      const keyword = String(demandSearch || '').trim().toLowerCase()
      if (!keyword) return true
      return [item.nickname, item.contentId, item.status].some((value) => String(value || '').toLowerCase().includes(keyword))
    })

  const loginStatus = docsLoginSession?.status || syncConfig.login?.status || 'IDLE'
  const canCreateSheetTasks = Boolean(
    syncConfig.enabled
      && docsConfigDraft.docUrl
      && (docsConfigDraft.sheetName || syncConfig.target?.sheetName)
      && loginStatus === 'LOGGED_IN'
  )
  const canMatchAccounts = isChecked && !showDeferredState
  const summaryMobile = getSummaryMobileState({ showDeferredState, isChecked, isCompleteMode, summary })
  const launchMobile = getLaunchMobileState({
    canCreateSheetTasks,
    canMatchAccounts,
    isCompleteMode,
    pendingDemandCount,
    taskCount
  })
  const primaryLaunchAction = getPrimaryLaunchAction({
    canCreateSheetTasks,
    creatingSheetTasks,
    isChecked,
    isCompleteMode,
    onCreateSheetTasks,
    onFocusQueue,
    onInspect,
    pendingDemandCount,
    sheetTaskCount,
    taskCount
  })

  const handleCountPickerKeyDown = (event, currentCount) => {
    const currentIndex = SHEET_TASK_COUNT_OPTIONS.indexOf(currentCount)
    if (currentIndex === -1) return

    let nextIndex = currentIndex
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (currentIndex + 1) % SHEET_TASK_COUNT_OPTIONS.length
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + SHEET_TASK_COUNT_OPTIONS.length) % SHEET_TASK_COUNT_OPTIONS.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = SHEET_TASK_COUNT_OPTIONS.length - 1
    } else {
      return
    }

    event.preventDefault()
    const nextCount = SHEET_TASK_COUNT_OPTIONS[nextIndex]
    const countPicker = event.currentTarget.parentElement
    onSheetTaskCountChange(nextCount)
    window.requestAnimationFrame(() => {
      countPicker
        ?.querySelector(`[data-count="${nextCount}"]`)
        ?.focus()
    })
  }

  return (
    <div className="batch-demand-board stack-lg">
      <div className="batch-planning-grid">
        <StageSectionCard
          id="batch-summary-stage"
          className="batch-stage-card batch-summary-stage stack-lg"
          eyebrow="阶段 2 / 4"
          title="需求摘要"
          description="只看总行数、待补数、缺内容 ID、重名异常和已完整，先判断本轮是否还需要发起任务。"
          variant="feature"
          mobileSummary={summaryMobile}
          mobileExpanded={summaryMobileExpanded}
          onToggleMobile={onToggleSummaryMobile}
        >
          {showDeferredState ? (
            <>
              <InlineNotice
                tone="info"
                eyebrow="需求区预热"
                icon={WandSparkles}
                title="交接表摘要正在后台生成"
                description="当前状态：首轮检查已延后执行。下一步：等待静默检查完成，或直接重新检查工作表。"
              />
              <div className="demand-summary-grid" role="status" aria-live="polite">
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
            <>
              {isCompleteMode ? (
                <div className="summary-complete-banner">
                  <div>
                    <strong>本轮完成模式</strong>
                    <small>待补数为 0，建议优先抽查已完成任务，或重新检查工作表确认最新状态。</small>
                  </div>
                  <StatusBadge tone="success" emphasis="soft">已完成</StatusBadge>
                </div>
              ) : null}

              <div className="demand-summary-grid">
                <SummaryCard label="总行数" value={summary.totalRows} helper="已扫描交接表数据行" tone="info" icon={SquareChartGantt} />
                <SummaryCard label="待补数" value={summary.needsFillRows} helper="可自动查数并回填" tone="warning" icon={WandSparkles} />
                <SummaryCard label="缺内容ID" value={summary.missingContentIdRows} helper="需先补内容 ID" tone="danger" icon={CircleAlert} />
                <SummaryCard label="重名异常" value={summary.duplicateNicknameRows} helper="同名达人需人工处理" tone="danger" icon={Users} />
                <SummaryCard label="已完整" value={summary.completeRows} helper="无需重复发码" tone="success" icon={CircleCheckBig} />
              </div>

              <div className="summary-stage-footnote">
                <span>{docsDiagnostic.checkedAt ? `最近检查 ${formatDateTime(docsDiagnostic.checkedAt)}` : '等待工作表检查结果'}</span>
                <span>{pendingDemandCount > 0 ? `下一步：优先发起 ${pendingDemandCount} 条待补数任务。` : '下一步：抽查已完成任务或重新检查工作表。'}</span>
              </div>
            </>
          )}
        </StageSectionCard>

        <StageSectionCard
          id="batch-launch-stage"
          className={`batch-stage-card batch-launch-stage stack-lg${isCompleteMode ? ' is-complete-mode' : ''}`}
          eyebrow="阶段 3 / 4"
          title="任务发起"
          description="主动作只保留一个优先级最高的推进入口，账号匹配收为增强动作，避免批量链路被并列按钮打断。"
          variant="feature"
          mobileSummary={launchMobile}
          mobileExpanded={launchMobileExpanded}
          onToggleMobile={onToggleLaunchMobile}
        >
          {!isChecked ? (
            <InlineNotice
              tone="warning"
              eyebrow="等待工作表检查"
              icon={CircleAlert}
              title="先完成工作表检查，再决定是否发起任务"
              description="当前状态：还没有稳定的需求摘要。下一步：返回上一阶段重新检查工作表。"
              actionLabel="重新检查工作表"
              onAction={onInspect}
            />
          ) : (
            <>
              <div className={`launch-command-module${isCompleteMode ? ' is-muted' : ''}`}>
                <div className="launch-command-copy">
                  <span className="section-eyebrow">{isCompleteMode ? '本轮完成模式' : '主动作'}</span>
                  <h3>{isCompleteMode ? '当前没有待补数需求' : '生成二维码任务并推进回填链路'}</h3>
                  <p>
                    {isCompleteMode
                      ? '当前状态：交接表里没有待补数行。下一步：优先查看任务队列抽查结果，必要时重新检查工作表。'
                      : `当前状态：还有 ${pendingDemandCount} 条待补数需求。下一步：先生成二维码任务，再回任务队列跟踪结果。`}
                  </p>
                </div>

                <div className="launch-command-actions">
                  {!isCompleteMode ? (
                    <div className="sheet-task-count-picker" role="radiogroup" aria-label="生成二维码数量">
                      {SHEET_TASK_COUNT_OPTIONS.map((count) => (
                        <button
                          key={count}
                          className={`secondary-btn compact-btn ${sheetTaskCount === count ? 'is-active' : ''}`}
                          type="button"
                          role="radio"
                          data-count={count}
                          aria-checked={sheetTaskCount === count}
                          tabIndex={sheetTaskCount === count ? 0 : -1}
                          onClick={() => onSheetTaskCountChange(count)}
                          onKeyDown={(event) => handleCountPickerKeyDown(event, count)}
                        >
                          {count} 个
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <button
                    className="primary-btn"
                    type="button"
                    onClick={primaryLaunchAction.onClick}
                    disabled={primaryLaunchAction.disabled}
                  >
                    <SendHorizontal size={18} aria-hidden="true" />
                    <span>{primaryLaunchAction.label}</span>
                  </button>

                  {isCompleteMode ? (
                    <button className="secondary-btn" type="button" onClick={onInspect}>
                      重新检查工作表
                    </button>
                  ) : null}
                </div>
              </div>

              <section className="launch-enhancement-panel stack-md">
                <div className="panel-split-header">
                  <div className="compact-panel-header">
                    <span className="section-eyebrow">增强动作</span>
                    <h3>账号匹配</h3>
                    <p>只在工作表检查完成后开放，优先找 READY 且能直接下发的账号组合。</p>
                  </div>
                  <div className="tasks-toolbar-actions">
                    <button className="secondary-btn" type="button" onClick={onMatchAccounts} disabled={!canMatchAccounts || matchingAccounts || accountsLoading}>
                      <Search size={18} aria-hidden="true" />
                      <span>{matchingAccounts ? '匹配中...' : '匹配 READY 账号'}</span>
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

                <div className="launch-account-stats" role="list" aria-label="账号匹配摘要">
                  <span className="launch-account-stat" role="listitem">已保存账号 {accounts.length}</span>
                  <span className="launch-account-stat" role="listitem">READY 账号 {readyAccountCount}</span>
                  <span className="launch-account-stat" role="listitem">命中交接表 {matchedAccountCount}</span>
                  <span className="launch-account-stat tone-success" role="listitem">可直接下发 {matchedReadyAccounts.length}</span>
                </div>

                {matchedReadyAccounts.length > 0 ? (
                  <div className="handoff-account-chip-list">
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
                ) : (
                  <div className="task-inline-hint">
                    {accountsLoading
                      ? '账号库正在读取，读取完成后可立即执行 READY 账号匹配。'
                      : readyAccountCount === 0
                        ? '当前没有 READY 账号。建议先到账号管理页补充账号，再回到这里重新匹配。'
                        : '当前没有可直接下发的匹配结果。建议重新匹配账号，或先处理缺内容 ID 与重名异常。'}
                  </div>
                )}
              </section>
            </>
          )}
        </StageSectionCard>
      </div>

      <SectionCard
        className="handoff-demand-panel stack-md"
        eyebrow="需求明细"
        title="缺数达人列表"
        description="按待补数、缺内容 ID、重名异常、已完整排序，逐行确认推荐动作。"
        variant="feature"
      >
        <div className="panel-split-header">
          <div className="compact-panel-header">
            <span className="section-eyebrow">紧凑操作表</span>
            <h2>缺数达人列表</h2>
            <p>当前状态：列表已按优先级排序。下一步：先处理待补数，再处理缺内容 ID 和重名异常。</p>
          </div>
          <div className="task-inline-hint subtle">
            {docsDiagnostic.checkedAt ? `最近检查 ${formatDateTime(docsDiagnostic.checkedAt)}` : '等待首次检查'}
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
              <span>目标行</span>
              <span>缺失列</span>
              <span>匹配方式</span>
              <span>推荐动作</span>
            </div>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="handoff-demand-row tone-info skeleton-demand-row" role="row">
                <div className="skeleton-line medium" />
                <div className="skeleton-line short" />
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
            <p>可以切换到“查看全部”确认交接表扫描结果，或重新检查工作表刷新当前需求摘要。</p>
            <button className="secondary-btn" type="button" onClick={onInspect}>
              重新检查工作表
            </button>
          </div>
        ) : (
          <div className="handoff-demand-list" role="table" aria-label="缺数达人列表">
            <div className="handoff-demand-row handoff-demand-head" role="row">
              <span>达人名</span>
              <span>内容 ID</span>
              <span>目标行</span>
              <span>缺失列</span>
              <span>匹配方式</span>
              <span>推荐动作</span>
            </div>
            {filteredDemands.map((item) => (
              <div key={`${item.sheetRow}-${item.nickname}-${item.contentId}`} className={`handoff-demand-row tone-${getDemandTone(item.status)}`} role="row">
                <div className="handoff-primary-cell">
                  <strong>{item.nickname || '未填写达人名'}</strong>
                  <small>{formatDemandStatus(item.status)}</small>
                </div>
                <span className="mono-cell">{item.contentId || '-'}</span>
                <span className="mono-cell handoff-row-index">#{item.sheetRow || '-'}</span>
                <span>{formatMissingColumns(item)}</span>
                <span>{formatDemandMatch(item)}</span>
                <StatusBadge tone={getDemandTone(item.status)}>{getDemandActionLabel(item.status)}</StatusBadge>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
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

function compareDemands(left, right) {
  const priority = getDemandPriority(left.status) - getDemandPriority(right.status)
  if (priority !== 0) return priority
  return Number(left.sheetRow || 0) - Number(right.sheetRow || 0)
}

function getDemandPriority(status) {
  if (status === 'NEEDS_FILL') return 0
  if (status === 'CONTENT_ID_MISSING') return 1
  if (status === 'DUPLICATE_NICKNAME') return 2
  if (status === 'COMPLETE') return 3
  return 4
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

function formatMissingColumns(item) {
  if (!Array.isArray(item.missingColumns) || item.missingColumns.length === 0) return '已完整'
  if (item.missingColumns.length === 1) return item.missingColumns[0]
  return `${item.missingColumns[0]} 等 ${item.missingColumns.length} 列`
}

function formatDemandMatch(item) {
  const matchedBy = item?.details?.matchedBy || item?.matchedBy || []
  if (Array.isArray(matchedBy) && matchedBy.length > 0) return matchedBy.join(' / ')
  if (item.status === 'CONTENT_ID_MISSING') return '待补内容 ID'
  if (item.status === 'DUPLICATE_NICKNAME') return '昵称冲突'
  if (item.contentId) return '按内容 ID'
  return '待识别'
}

function getDemandActionLabel(status) {
  if (status === 'NEEDS_FILL') return '生成任务'
  if (status === 'CONTENT_ID_MISSING') return '补内容 ID'
  if (status === 'DUPLICATE_NICKNAME') return '人工排重'
  if (status === 'COMPLETE') return '抽查结果'
  return '继续处理'
}

function getSummaryMobileState({ showDeferredState, isChecked, isCompleteMode, summary }) {
  if (showDeferredState) {
    return {
      status: '进行中',
      statusTone: 'info',
      value: '摘要生成中',
      detail: '等待静默检查',
      description: '当前状态：需求摘要仍在生成。下一步：展开后查看最新结果。'
    }
  }

  if (!isChecked) {
    return {
      status: '未准备',
      statusTone: 'warning',
      value: '等待检查',
      detail: '先完成工作表检查',
      description: '当前状态：还没有稳定摘要。下一步：先检查工作表。'
    }
  }

  if (isCompleteMode) {
    return {
      status: '已完成',
      statusTone: 'success',
      value: '待补数 0',
      detail: '本轮完成模式',
      description: '当前状态：没有待补数需求。下一步：抽查已完成任务。'
    }
  }

  return {
    status: summary.needsFillRows > 0 ? '需处理' : '进行中',
    statusTone: summary.needsFillRows > 0 ? 'warning' : 'info',
    value: `待补数 ${summary.needsFillRows}`,
    detail: `缺内容 ID ${summary.missingContentIdRows} / 重名异常 ${summary.duplicateNicknameRows}`,
    description: `当前状态：还有 ${summary.needsFillRows} 条待补数。下一步：展开后发起任务。`
  }
}

function getLaunchMobileState({ canCreateSheetTasks, canMatchAccounts, isCompleteMode, pendingDemandCount, taskCount }) {
  if (!canMatchAccounts) {
    return {
      status: '未准备',
      statusTone: 'warning',
      value: '先检查工作表',
      detail: '主动作待开启',
      description: '当前状态：任务发起区尚未开启。下一步：先完成工作表检查。'
    }
  }

  if (isCompleteMode) {
    return {
      status: '已完成',
      statusTone: 'success',
      value: taskCount > 0 ? '查看任务队列' : '重新检查工作表',
      detail: '发码区已弱化',
      description: '当前状态：没有待补数需求。下一步：抽查已完成任务或重新检查工作表。'
    }
  }

  return {
    status: canCreateSheetTasks ? '需处理' : '进行中',
    statusTone: canCreateSheetTasks ? 'warning' : 'info',
    value: `生成 ${pendingDemandCount} 条待补数任务`,
    detail: canCreateSheetTasks ? '主动作已可用' : '等待登录态或目标配置',
    description: '当前状态：可以继续发起二维码任务。下一步：展开后执行主动作。'
  }
}

function getPrimaryLaunchAction({
  canCreateSheetTasks,
  creatingSheetTasks,
  isChecked,
  isCompleteMode,
  onCreateSheetTasks,
  onFocusQueue,
  onInspect,
  pendingDemandCount,
  sheetTaskCount,
  taskCount
}) {
  if (!isChecked) {
    return {
      label: '重新检查工作表',
      onClick: onInspect,
      disabled: false
    }
  }

  if (isCompleteMode) {
    return {
      label: taskCount > 0 ? '抽查已完成任务' : '重新检查工作表',
      onClick: taskCount > 0 ? onFocusQueue : onInspect,
      disabled: false
    }
  }

  return {
    label: creatingSheetTasks > 0 ? '生成中...' : `生成 ${sheetTaskCount} 个二维码任务`,
    onClick: () => onCreateSheetTasks(sheetTaskCount),
    disabled: !canCreateSheetTasks || creatingSheetTasks > 0 || pendingDemandCount === 0
  }
}
