import { ExternalLink, FileStack, QrCode, ScanSearch, SendHorizontal, TriangleAlert, Users } from 'lucide-react'
import { formatTencentDocsLoginStatus, getTencentDocsLoginTone } from '../../lib/ui'
import { InlineNotice } from '../ui/InlineNotice'
import { StatusBadge } from '../ui/StatusBadge'

const SHEET_TASK_COUNT_OPTIONS = [1, 2, 5]

export function BatchMissionPanel({
  syncConfig,
  docsConfigDraft,
  docsDiagnostic,
  diagnosticPending,
  docsLoginStatus,
  pendingDemandCount,
  taskCount,
  waitingTaskCount,
  matchedReadyAccounts,
  creatingSheetTasks,
  creatingMatchedAccountTasks,
  matchingAccounts,
  sheetTaskCount,
  onSheetTaskCountChange,
  onDraftChange,
  onSaveConfig,
  onStartLogin,
  onInspect,
  onCreateSheetTasks,
  onMatchAccounts,
  onCreateTasksFromAccounts,
  onFocusQueue,
  diagnosticsOpen,
  onToggleDiagnostics
}) {
  const tabs = docsDiagnostic.payload?.tabs || []
  const summary = docsDiagnostic.payload?.summary || {
    needsFillRows: 0,
    missingContentIdRows: 0,
    duplicateNicknameRows: 0,
    completeRows: 0
  }
  const draftDocUrl = String(docsConfigDraft.docUrl || '').trim()
  const resolvedSheetName = String(docsConfigDraft.sheetName || syncConfig.target?.sheetName || '').trim()
  const savedDocUrl = String(syncConfig.target?.docUrl || '').trim()
  const savedSheetName = String(syncConfig.target?.sheetName || '').trim()
  const needsSave = draftDocUrl !== savedDocUrl || (resolvedSheetName && resolvedSheetName !== savedSheetName)
  const targetLocked = Boolean(draftDocUrl && resolvedSheetName && !needsSave)
  const loginReady = docsLoginStatus === 'LOGGED_IN'
  const inspectReady = Boolean(docsDiagnostic.inspected && !docsDiagnostic.error)
  const hasReadyDemand = inspectReady && Number(pendingDemandCount || 0) > 0
  const hasTasks = taskCount > 0
  const primaryAction = getPrimaryAction({
    draftDocUrl,
    resolvedSheetName,
    needsSave,
    loginReady,
    inspectReady,
    hasReadyDemand,
    creatingSheetTasks,
    sheetTaskCount,
    taskCount,
    onSaveConfig,
    onStartLogin,
    onInspect,
    onCreateSheetTasks,
    onFocusQueue
  })
  const stepItems = [
    {
      key: 'target',
      label: '目标锁定',
      detail: targetLocked ? resolvedSheetName : '链接与工作表待确认',
      state: targetLocked ? 'done' : (draftDocUrl ? 'active' : 'pending')
    },
    {
      key: 'login',
      label: '文档登录',
      detail: loginReady ? '编辑态已就绪' : formatTencentDocsLoginStatus(docsLoginStatus),
      state: loginReady ? 'done' : (targetLocked ? 'active' : 'pending')
    },
    {
      key: 'inspect',
      label: '工作表检查',
      detail: inspectReady ? `${summary.needsFillRows} 条待补数` : (diagnosticPending ? '检查中' : '待执行'),
      state: inspectReady ? 'done' : (loginReady ? 'active' : 'pending')
    },
    {
      key: 'queue',
      label: '队列推进',
      detail: hasTasks ? `${taskCount} 条任务` : (hasReadyDemand ? '可生成任务' : '等待推进'),
      state: hasTasks ? 'active' : (hasReadyDemand ? 'active' : 'pending')
    }
  ]

  return (
    <section className="panel batch-mission-panel stack-md">
      <div className="batch-mission-header">
        <div>
          <h2>批量调度台</h2>
        </div>
        <StatusBadge tone={getTencentDocsLoginTone(docsLoginStatus)} emphasis="soft">
          {formatTencentDocsLoginStatus(docsLoginStatus)}
        </StatusBadge>
      </div>

      <div className="mission-stepper" role="list" aria-label="批量闭环准备度">
        {stepItems.map((item) => (
          <div key={item.key} className={`mission-step state-${item.state}`} role="listitem">
            <span className="mission-step-dot" aria-hidden="true" />
            <div className="mission-step-copy">
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </div>
          </div>
        ))}
      </div>

      <div className="mission-target-fields">
        <label className="field">
          <span>腾讯文档链接</span>
          <input
            type="url"
            placeholder="https://docs.qq.com/sheet/..."
            value={docsConfigDraft.docUrl}
            onChange={(event) => onDraftChange({ docUrl: event.target.value })}
          />
        </label>

        <label className="field">
          <span>目标工作表</span>
          <select value={docsConfigDraft.sheetName} onChange={(event) => onDraftChange({ sheetName: event.target.value })}>
            <option value="">请选择工作表</option>
            {tabs.map((tab) => (
              <option key={tab.name} value={tab.name}>
                {tab.name}{tab.selected ? '（当前）' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mission-command-card">
        <div className="mission-command-copy">
          <h3>{primaryAction.title}</h3>
          <div className="mission-command-meta" aria-label="主动作上下文">
            <span>待补数 {pendingDemandCount}</span>
            <span>待扫码 {waitingTaskCount}</span>
          </div>
        </div>

        <div className="mission-command-actions">
          {primaryAction.kind === 'generate' ? (
            <div className="sheet-task-count-picker" role="radiogroup" aria-label="生成二维码数量">
              {SHEET_TASK_COUNT_OPTIONS.map((count) => (
                <button
                  key={count}
                  className={`secondary-btn compact-btn ${sheetTaskCount === count ? 'is-active' : ''}`}
                  type="button"
                  role="radio"
                  aria-checked={sheetTaskCount === count}
                  onClick={() => onSheetTaskCountChange(count)}
                >
                  {count} 个
                </button>
              ))}
            </div>
          ) : null}

          <button className="primary-btn" type="button" onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
            {primaryAction.icon}
            <span>{primaryAction.label}</span>
          </button>
        </div>
      </div>

      <div className="mission-summary-strip" role="list" aria-label="当前批量摘要">
        <MissionSummary label="待补数" value={summary.needsFillRows || 0} tone={summary.needsFillRows > 0 ? 'warning' : 'success'} />
        <MissionSummary label="缺内容ID" value={summary.missingContentIdRows || 0} tone={summary.missingContentIdRows > 0 ? 'danger' : 'neutral'} />
        <MissionSummary label="重名异常" value={summary.duplicateNicknameRows || 0} tone={summary.duplicateNicknameRows > 0 ? 'danger' : 'neutral'} />
        <MissionSummary label="已完整" value={summary.completeRows || 0} tone={(summary.completeRows || 0) > 0 ? 'success' : 'neutral'} />
      </div>

      <div className="mission-secondary-actions">
        {draftDocUrl ? (
          <a className="secondary-btn inline-link-btn" href={draftDocUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            <span>查看原链接</span>
          </a>
        ) : null}

        <button className="secondary-btn" type="button" onClick={onMatchAccounts} disabled={!inspectReady || matchingAccounts}>
          <Users size={16} aria-hidden="true" />
          <span>{matchingAccounts ? '匹配中...' : '匹配 READY 账号'}</span>
        </button>

        <button
          className="secondary-btn"
          type="button"
          onClick={onCreateTasksFromAccounts}
          disabled={matchedReadyAccounts.length === 0 || creatingMatchedAccountTasks}
        >
          <SendHorizontal size={16} aria-hidden="true" />
          <span>{creatingMatchedAccountTasks ? '创建中...' : '为匹配账号创建任务'}</span>
        </button>

        <button className="secondary-btn ghost-btn" type="button" onClick={onToggleDiagnostics}>
          <TriangleAlert size={16} aria-hidden="true" />
          <span>{diagnosticsOpen ? '收起排障' : '打开排障'}</span>
        </button>
      </div>

      {needsSave ? (
        <InlineNotice
          tone="warning"
          eyebrow="目标未收敛"
          icon={FileStack}
          title="当前文档目标有未保存变更"
          description="先保存并检查工作表，再继续登录或发起任务。"
        />
      ) : null}
    </section>
  )
}

function MissionSummary({ label, value, tone }) {
  return (
    <div className={`mission-summary-card tone-${tone}`} role="listitem">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function getPrimaryAction({
  draftDocUrl,
  resolvedSheetName,
  needsSave,
  loginReady,
  inspectReady,
  hasReadyDemand,
  creatingSheetTasks,
  sheetTaskCount,
  taskCount,
  onSaveConfig,
  onStartLogin,
  onInspect,
  onCreateSheetTasks,
  onFocusQueue
}) {
  if (!draftDocUrl || !resolvedSheetName || needsSave) {
    return {
      kind: 'setup',
      title: '锁定目标工作表',
      label: '保存并检查',
      onClick: onSaveConfig,
      disabled: !draftDocUrl,
      icon: <ScanSearch size={18} aria-hidden="true" />
    }
  }

  if (!loginReady) {
    return {
      kind: 'login',
      title: '建立腾讯文档登录态',
      label: '登录腾讯文档',
      onClick: onStartLogin,
      disabled: false,
      icon: <QrCode size={18} aria-hidden="true" />
    }
  }

  if (!inspectReady) {
    return {
      kind: 'inspect',
      title: '检查工作表',
      label: '重新检查工作表',
      onClick: onInspect,
      disabled: false,
      icon: <ScanSearch size={18} aria-hidden="true" />
    }
  }

  if (hasReadyDemand) {
    return {
      kind: 'generate',
      title: '生成二维码任务',
      label: creatingSheetTasks > 0 ? '继续推进任务' : '继续推进任务',
      onClick: () => onCreateSheetTasks(sheetTaskCount),
      disabled: creatingSheetTasks > 0,
      icon: <SendHorizontal size={18} aria-hidden="true" />
    }
  }

  return {
    kind: 'queue',
    title: taskCount > 0 ? '回到任务队列' : '当前没有待补数',
    label: taskCount > 0 ? '继续推进任务' : '重新检查工作表',
    onClick: taskCount > 0 ? onFocusQueue : onInspect,
    disabled: false,
    icon: taskCount > 0 ? <SendHorizontal size={18} aria-hidden="true" /> : <ScanSearch size={18} aria-hidden="true" />
  }
}
