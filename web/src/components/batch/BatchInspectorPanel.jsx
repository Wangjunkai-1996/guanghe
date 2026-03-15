import { CircleAlert, FileSearch, QrCode, Rows3, Users } from 'lucide-react'
import { formatDateTime, formatTencentDocsLoginStatus, getTencentDocsLoginTone } from '../../lib/ui'
import {
  formatTaskLoginStatus,
  formatTaskQueryStatus,
  formatTaskSheetMatchStatus,
  formatTaskSyncStatus,
  getTaskLoginTone,
  getTaskOverallTone,
  getTaskPrimaryActionLabel,
  getTaskQueryTone,
  getTaskSheetMatchTone,
  getTaskSummary,
  getTaskSyncTone
} from '../../lib/taskFormat'
import { EmptyState } from '../ui/EmptyState'
import { InlineNotice } from '../ui/InlineNotice'
import { StatusBadge } from '../ui/StatusBadge'
import { TaskDetailPane } from '../task/TaskDetailPane'

export function BatchInspectorPanel({
  view,
  task,
  syncConfig,
  syncPreview,
  syncAction,
  busy,
  copying,
  onCopyQr,
  onRefreshLogin,
  onRetryQuery,
  onDeleteTask,
  onPreviewSync,
  onSyncTask,
  onSubmitSmsCode,
  docsLoginSession,
  docsLoginStatus,
  selectedDemand,
  selectedDemandMatches,
  matchedReadyAccounts,
  diagnosticPending,
  docsDiagnostic,
  onMatchAccounts,
  onCreateTasksFromAccounts,
  onInspect,
  onFocusTasks,
  onOpenTaskDrawer,
  isTaskDrawerOpen = false,
  titleId
}) {
  if (view === 'tasks') {
    if (task) {
      if (onOpenTaskDrawer) {
        return (
          <TaskSelectionInspector
            task={task}
            syncConfig={syncConfig}
            onOpenTaskDrawer={onOpenTaskDrawer}
            isTaskDrawerOpen={isTaskDrawerOpen}
          />
        )
      }

      return (
        <TaskDetailPane
          task={task}
          syncConfig={syncConfig}
          syncPreview={syncPreview}
          syncAction={syncAction}
          busy={busy}
          copying={copying}
          titleId={titleId}
          onCopyQr={onCopyQr}
          onRefreshLogin={onRefreshLogin}
          onRetryQuery={onRetryQuery}
          onDeleteTask={onDeleteTask}
          onPreviewSync={onPreviewSync}
          onSyncTask={onSyncTask}
          onSubmitSmsCode={onSubmitSmsCode}
        />
      )
    }

    if (docsLoginSession?.qrImageUrl && ['WAITING_QR', 'WAITING_CONFIRM'].includes(docsLoginSession.status || docsLoginStatus)) {
      return (
        <section className="panel batch-inspector-panel stack-md">
          <div className="batch-inspector-header">
            <div>
              <h2>腾讯文档登录</h2>
            </div>
            <StatusBadge tone={getTencentDocsLoginTone(docsLoginSession.status || docsLoginStatus)} emphasis="soft">
              {formatTencentDocsLoginStatus(docsLoginSession.status || docsLoginStatus)}
            </StatusBadge>
          </div>

          <div className="inspector-qr-card">
            <img className="qr-image" src={docsLoginSession.qrImageUrl} alt="腾讯文档登录二维码" />
          </div>
        </section>
      )
    }

    return (
      <section className="panel batch-inspector-panel empty">
        <EmptyState
          eyebrow="Inspector"
          tone="neutral"
          icon={FileSearch}
          title="从主队列选择一条任务"
          description="这里会持续展示结论、回填、截图和日志，不需要在页面里来回找信息。"
        />
      </section>
    )
  }

  if (!selectedDemand) {
    return (
      <section className="panel batch-inspector-panel empty">
        <EmptyState
          eyebrow="Inspector"
          tone="neutral"
          icon={Rows3}
          title="从需求队列选择一行"
          description="这里会显示缺失列、匹配账号候选和建议动作。"
        />
      </section>
    )
  }

  const readyCandidates = selectedDemandMatches.filter(({ account }) => String(account?.status || '') === 'READY')
  const tone = getTaskSheetMatchTone(selectedDemand.status)

  return (
    <section className="panel batch-inspector-panel stack-md">
      <div className="batch-inspector-header">
        <div>
          <span className="section-eyebrow">Demand Inspector</span>
          <h2>{selectedDemand.nickname || `第 ${selectedDemand.sheetRow} 行`}</h2>
          <p>先判断当前行是否可执行，再看有没有 READY 账号可直接下发。</p>
        </div>
        <StatusBadge tone={tone} emphasis="soft">
          {formatDemandStatus(selectedDemand.status)}
        </StatusBadge>
      </div>

      {docsDiagnostic.error ? (
        <InlineNotice
          tone="danger"
          eyebrow="检查异常"
          icon={CircleAlert}
          title={docsDiagnostic.error.message || '最近一次工作表检查失败'}
          description="建议先重新检查工作表，再决定是否处理这条需求。"
        />
      ) : null}

      {diagnosticPending ? (
        <InlineNotice
          tone="info"
          eyebrow="后台检查中"
          icon={Rows3}
          title="工作表摘要仍在更新"
          description="已有信息仍可查看，但建议在检查完成后再做最终判断。"
        />
      ) : null}

      <div className="inspector-demand-grid">
        <InspectorDatum label="所在行" value={selectedDemand.sheetRow || '-'} />
        <InspectorDatum label="内容 ID" value={selectedDemand.contentId || '待补充'} />
        <InspectorDatum label="缺失列" value={formatMissingColumns(selectedDemand)} />
        <InspectorDatum label="最近检查" value={docsDiagnostic.checkedAt ? formatDateTime(docsDiagnostic.checkedAt) : '未检查'} />
      </div>

      <div className="inspector-panel-block">
        <div className="inspector-panel-block-header">
          <strong>匹配账号候选</strong>
          <small>{selectedDemandMatches.length > 0 ? `${selectedDemandMatches.length} 个候选账号` : '暂未匹配到账号'}</small>
        </div>

        {selectedDemandMatches.length > 0 ? (
          <div className="handoff-account-chip-list">
            {selectedDemandMatches.map(({ account }) => (
              <span key={account.accountId} className="task-meta-chip">
                {account.nickname || account.accountId}
              </span>
            ))}
          </div>
        ) : (
          <div className="task-inline-hint">当前没有匹配到账号，建议先执行 READY 账号匹配。</div>
        )}
      </div>

      <div className="inspector-panel-block">
        <div className="inspector-panel-block-header">
          <strong>下一步建议</strong>
          <small>{getDemandRecommendation(selectedDemand.status, readyCandidates.length)}</small>
        </div>

        <div className="batch-inspector-actions">
          <button className="secondary-btn" type="button" onClick={onMatchAccounts}>
            <Users size={16} aria-hidden="true" />
            <span>匹配 READY 账号</span>
          </button>
          <button
            className="secondary-btn"
            type="button"
            onClick={onCreateTasksFromAccounts}
            disabled={matchedReadyAccounts.length === 0}
          >
            <QrCode size={16} aria-hidden="true" />
            <span>为匹配账号创建任务</span>
          </button>
          <button className="secondary-btn" type="button" onClick={onInspect}>
            <Rows3 size={16} aria-hidden="true" />
            <span>重新检查工作表</span>
          </button>
          <button className="secondary-btn ghost-btn" type="button" onClick={onFocusTasks}>
            回到任务队列
          </button>
        </div>
      </div>
    </section>
  )
}

function InspectorDatum({ label, value }) {
  return (
    <div className="inspector-datum">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function TaskSelectionInspector({ task, syncConfig, onOpenTaskDrawer, isTaskDrawerOpen }) {
  const overallTone = getTaskOverallTone(task)

  return (
    <section className="panel batch-inspector-panel batch-task-launcher stack-md">
      <div className="batch-inspector-header">
        <div>
          <h2>{task.remark || task.contentId || task.taskId}</h2>
        </div>
        <StatusBadge tone={overallTone} emphasis="soft">
          {getTaskPrimaryActionLabel(task)}
        </StatusBadge>
      </div>

      <InlineNotice
        tone={task.sync?.status === 'FAILED' || task.error?.message ? 'danger' : 'info'}
        eyebrow="当前判断"
        title={getTaskSummary(task)}
      />

      <div className="inspector-demand-grid">
        <InspectorDatum label="登录" value={formatTaskLoginStatus(task.login?.status)} />
        <InspectorDatum label="查询" value={formatTaskQueryStatus(task.query?.status)} />
        <InspectorDatum label="回填" value={formatTaskSyncStatus(task, syncConfig)} />
        <InspectorDatum
          label="任务类型"
          value={task.taskMode === 'SHEET_DEMAND' ? formatTaskSheetMatchStatus(task.sheetMatch?.status) : '手工任务'}
        />
      </div>

      <div className="inspector-panel-block">
        <div className="inspector-panel-block-header">
          <strong>主动作</strong>
        </div>

        <div className="batch-inspector-actions">
          <button className="primary-btn" type="button" onClick={() => onOpenTaskDrawer(task.taskId)}>
            {isTaskDrawerOpen ? '收起任务抽屉' : '打开任务抽屉'}
          </button>
        </div>
      </div>

      <div className="batch-task-launcher-status-strip" aria-label="任务状态摘要">
        <StatusBadge tone={getTaskLoginTone(task.login?.status)} emphasis="soft" size="sm">
          登录 {formatTaskLoginStatus(task.login?.status)}
        </StatusBadge>
        <StatusBadge tone={getTaskQueryTone(task.query?.status)} emphasis="soft" size="sm">
          查询 {formatTaskQueryStatus(task.query?.status)}
        </StatusBadge>
        <StatusBadge tone={getTaskSyncTone(task, syncConfig)} emphasis="soft" size="sm">
          回填 {formatTaskSyncStatus(task, syncConfig)}
        </StatusBadge>
        {task.taskMode === 'SHEET_DEMAND' ? (
          <StatusBadge tone={getTaskSheetMatchTone(task.sheetMatch?.status)} emphasis="soft" size="sm">
            交接表 {formatTaskSheetMatchStatus(task.sheetMatch?.status)}
          </StatusBadge>
        ) : null}
      </div>
    </section>
  )
}

function formatMissingColumns(item) {
  if (!Array.isArray(item?.missingColumns) || item.missingColumns.length === 0) return '已完整'
  if (item.missingColumns.length === 1) return item.missingColumns[0]
  return `${item.missingColumns.join('、')}`
}

function getDemandRecommendation(status, readyCount) {
  if (status === 'NEEDS_FILL' && readyCount > 0) return `当前有 ${readyCount} 个 READY 账号可直接下发。`
  if (status === 'NEEDS_FILL') return '这行可执行，但仍需先找到 READY 账号。'
  if (status === 'CONTENT_ID_MISSING') return '优先补齐内容 ID，否则无法生成任务。'
  if (status === 'DUPLICATE_NICKNAME') return '先在交接表里人工排重，再回到这里复检。'
  if (status === 'COMPLETE') return '这行已经完整，建议切回任务队列抽查结果。'
  return '建议重新检查工作表后再继续推进。'
}

function formatDemandStatus(status) {
  if (status === 'COMPLETE') return '已完整'
  if (status === 'NEEDS_FILL') return '待补数'
  if (status === 'CONTENT_ID_MISSING') return '缺内容ID'
  if (status === 'DUPLICATE_NICKNAME') return '重名异常'
  return status || '未知'
}
