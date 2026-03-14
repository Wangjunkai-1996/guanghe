import { Suspense, lazy } from 'react'
import { BatchHeroSummary } from './batch/BatchHeroSummary'
import { DemandBoard } from './batch/DemandBoard'
import { DiagnosticsPanel } from './batch/DiagnosticsPanel'
import { HandoffControlCenter } from './batch/HandoffControlCenter'
import { TaskBoard } from './batch/TaskBoard'
import { useBatchTasksWorkspace } from '../hooks/useBatchTasksWorkspace'

const TaskBuilderModal = lazy(() =>
  import('./batch/TaskBuilderModal').then((module) => ({ default: module.TaskBuilderModal }))
)
const ConfirmDialog = lazy(() =>
  import('./ui/ConfirmDialog').then((module) => ({ default: module.ConfirmDialog }))
)
const ToastViewport = lazy(() =>
  import('./ui/ToastViewport').then((module) => ({ default: module.ToastViewport }))
)

export function BatchTasksWorkspace() {
  const workspace = useBatchTasksWorkspace()

  return (
    <>
      <section className="tasks-workspace stack-lg">
        <BatchHeroSummary
          activeTarget={workspace.activeTencentDocsTarget}
          loginStatus={workspace.docsLoginStatus}
          loginUpdatedAt={workspace.docsLoginUpdatedAt}
          pendingDemandCount={workspace.pendingDemandCount}
          waitingCount={workspace.waitingTaskCount}
          exceptionCount={workspace.exceptionTaskCount}
          lastSyncedAt={workspace.lastSyncedAt}
          isBuilderOpen={workspace.isBuilderOpen}
          loading={workspace.loading}
          diagnosticsOpen={workspace.isDiagnosticsOpen}
          onToggleBuilder={workspace.isBuilderOpen ? workspace.handleBuilderClose : workspace.handleBuilderOpen}
          onRefresh={() => workspace.handleRefreshList()}
          onToggleDiagnostics={workspace.handleToggleDiagnostics}
        />

        <HandoffControlCenter
          syncConfig={workspace.syncConfig}
          docsConfigDraft={workspace.docsConfigDraft}
          onDraftChange={workspace.handleDocsDraftChange}
          onSaveConfig={workspace.handleSaveTencentDocsConfig}
          onInspect={workspace.handleInspectTencentDocs}
          docsDiagnostic={workspace.docsDiagnostic}
          diagnosticPending={workspace.diagnosticPending}
          docsLoginSession={workspace.docsLoginSession}
          onStartLogin={workspace.handleStartTencentDocsLogin}
        />

        <DemandBoard
          accounts={workspace.accounts}
          accountsLoading={workspace.accountsLoading}
          syncConfig={workspace.syncConfig}
          docsConfigDraft={workspace.docsConfigDraft}
          docsDiagnostic={workspace.docsDiagnostic}
          diagnosticPending={workspace.diagnosticPending}
          docsLoginSession={workspace.docsLoginSession}
          readyAccountCount={workspace.readyAccounts.length}
          matchedAccountCount={workspace.accountDemandMatches.length}
          matchedReadyAccounts={workspace.matchedReadyAccounts}
          onCreateSheetTasks={workspace.handleCreateSheetDemandTasks}
          onMatchAccounts={workspace.handleMatchAccountsToDemands}
          onCreateTasksFromAccounts={workspace.handleOpenCreateTasksFromAccounts}
          creatingSheetTasks={workspace.creatingSheetTasks}
          matchingAccounts={workspace.matchingAccounts}
          creatingMatchedAccountTasks={workspace.creatingMatchedAccountTasks}
          demandFilter={workspace.demandFilter}
          onDemandFilterChange={workspace.setDemandFilter}
          demandSearch={workspace.demandSearch}
          onDemandSearchChange={workspace.setDemandSearch}
        />

        {workspace.shouldShowDiagnostics ? (
          <DiagnosticsPanel
            open={workspace.isDiagnosticsOpen}
            syncConfig={workspace.syncConfig}
            diagnostic={workspace.docsDiagnostic}
            diagnosticPending={workspace.diagnosticPending}
            onInspect={workspace.handleInspectTencentDocs}
            onToggle={workspace.handleToggleDiagnostics}
          />
        ) : null}

        <TaskBoard
          tasks={workspace.tasks}
          filteredTasks={workspace.filteredTasks}
          filterKey={workspace.filterKey}
          searchValue={workspace.searchValue}
          setFilterKey={workspace.setFilterKey}
          setSearchValue={workspace.setSearchValue}
          lastSyncedAt={workspace.lastSyncedAt}
          loading={workspace.loading}
          error={workspace.error}
          onRetryLoad={() => workspace.handleRefreshList()}
          expandedTaskId={workspace.expandedTaskId}
          onToggleExpand={workspace.handleToggleExpand}
          syncConfig={workspace.syncConfig}
          syncPreviewState={workspace.syncPreviewState}
          syncActionLoading={workspace.syncActionLoading}
          copyingTaskId={workspace.copyingTaskId}
          actionLoading={workspace.actionLoading}
          onCopyQr={workspace.handleCopyQr}
          onRefreshLogin={workspace.handleRefreshLogin}
          onSubmitSmsCode={workspace.handleSubmitSmsCode}
          onRetryQuery={workspace.handleRetryQuery}
          onDeleteTask={workspace.handleDeleteTask}
          onPreviewSync={workspace.handlePreviewTaskSync}
          onSyncTask={workspace.handleSyncTask}
          onClearFilters={workspace.handleClearTaskFilters}
        />

        {workspace.isBuilderOpen ? (
          <Suspense fallback={<DeferredPanelFallback title="正在准备新建任务面板" description="正在载入批量建任务弹窗与校验面板。" />}>
            <TaskBuilderModal
              draftLines={workspace.draftLines}
              draftValidation={workspace.draftValidation}
              displayBatchErrors={workspace.displayBatchErrors}
              batchInput={workspace.batchInput}
              submitting={workspace.submitting}
              textareaRef={workspace.textareaRef}
              serverBatchErrors={workspace.serverBatchErrors}
              onClose={workspace.handleBuilderClose}
              onChange={workspace.handleBatchInputChange}
              onSubmit={workspace.handleSubmit}
            />
          </Suspense>
        ) : null}

        {workspace.toasts.length ? (
          <Suspense fallback={null}>
            <ToastViewport toasts={workspace.toasts} />
          </Suspense>
        ) : null}
      </section>

      {workspace.accountTaskConfirmState.open ? (
        <Suspense fallback={null}>
          <ConfirmDialog
            open={workspace.accountTaskConfirmState.open}
            tone="warning"
            title="确认为匹配账号创建批量任务"
            description={`将为 ${workspace.accountTaskConfirmState.accounts.length} 个已匹配的 READY 账号创建交接表回填任务，后续扫码、查询和回填进度都会在批量页持续追踪。`}
            confirmLabel="创建批量任务"
            cancelLabel="暂不创建"
            loading={workspace.creatingMatchedAccountTasks}
            onConfirm={workspace.handleConfirmCreateTasksFromAccounts}
            onCancel={() => workspace.setAccountTaskConfirmState({ open: false, accounts: [] })}
          >
            <div className="confirm-dialog-list">
              {workspace.accountTaskConfirmState.accounts.map((account) => (
                <span key={account.accountId} className="task-meta-chip">
                  {account.nickname || account.accountId}
                </span>
              ))}
            </div>
          </ConfirmDialog>
        </Suspense>
      ) : null}

      {workspace.taskDeleteState.open ? (
        <Suspense fallback={null}>
          <ConfirmDialog
            open={workspace.taskDeleteState.open}
            tone="warning"
            title="确认删除批量任务"
            description={`删除后将移除任务 ${workspace.taskDeleteState.label} 的二维码跟踪与结果记录。`}
            confirmLabel="删除任务"
            cancelLabel="暂不删除"
            loading={Boolean(workspace.actionLoading[workspace.taskDeleteState.taskId])}
            onConfirm={workspace.handleConfirmDeleteTask}
            onCancel={() => workspace.setTaskDeleteState({ open: false, taskId: '', label: '' })}
          />
        </Suspense>
      ) : null}
    </>
  )
}

function DeferredPanelFallback({ title, description }) {
  return (
    <div className="workspace-module-fallback deferred-panel-fallback" role="status" aria-live="polite">
      <span className="section-eyebrow">模块载入中</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}
