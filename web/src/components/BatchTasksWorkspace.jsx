import { Suspense, lazy, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { DiagnosticsPanel } from './batch/DiagnosticsPanel'
import { BatchInspectorPanel } from './batch/BatchInspectorPanel'
import { BatchMissionPanel } from './batch/BatchMissionPanel'
import { BatchTaskDetailDrawer } from './batch/BatchTaskDetailDrawer'
import { DemandQueuePanel } from './batch/DemandQueuePanel'
import { TaskBoard } from './batch/TaskBoard'
import { useBatchTasksWorkspace } from '../hooks/useBatchTasksWorkspace'
import { useMediaQuery } from '../hooks/useMediaQuery'

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
  const isDesktop = useMediaQuery('(min-width: 901px)')
  const [activeConsoleView, setActiveConsoleView] = useState('tasks')
  const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false)
  const [selectedDemandRow, setSelectedDemandRow] = useState(0)
  const inspectorRef = useRef(null)
  const shouldRestoreTaskFocusRef = useRef(false)
  const inspectorTitleId = useId()
  const summary = workspace.docsDiagnostic.payload?.summary || {
    totalRows: 0,
    completeRows: 0,
    needsFillRows: 0,
    missingContentIdRows: 0,
    duplicateNicknameRows: 0
  }

  const filteredDemands = useMemo(() => {
    const keyword = String(workspace.demandSearch || '').trim().toLowerCase()
    return [...(workspace.docsDiagnostic.payload?.demands || [])]
      .sort(compareDemands)
      .filter((item) => matchesDemandFilter(item, workspace.demandFilter))
      .filter((item) => {
        if (!keyword) return true
        return [item.nickname, item.contentId, item.status]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      })
  }, [workspace.demandFilter, workspace.demandSearch, workspace.docsDiagnostic.payload?.demands])

  useEffect(() => {
    if (filteredDemands.length === 0) {
      setSelectedDemandRow(0)
      return
    }

    setSelectedDemandRow((current) => {
      if (current && filteredDemands.some((item) => Number(item.sheetRow || 0) === current)) return current
      return Number(filteredDemands[0].sheetRow || 0)
    })
  }, [filteredDemands])

  const selectedDemand = useMemo(() => {
    if (activeConsoleView !== 'demands') return null
    return filteredDemands.find((item) => Number(item.sheetRow || 0) === selectedDemandRow) || filteredDemands[0] || null
  }, [activeConsoleView, filteredDemands, selectedDemandRow])

  const selectedDemandMatches = useMemo(() => {
    if (!selectedDemand) return []
    return workspace.accountDemandMatches.filter(({ demand }) => {
      if (Number(demand?.sheetRow || 0) === Number(selectedDemand.sheetRow || 0)) return true
      return normalizeNickname(demand?.nickname) === normalizeNickname(selectedDemand.nickname)
    })
  }, [selectedDemand, workspace.accountDemandMatches])

  const showDesktopTaskDrawer = Boolean(
    isDesktop
      && activeConsoleView === 'tasks'
      && isTaskDrawerOpen
      && workspace.selectedTask
  )

  useEffect(() => {
    if (!isDesktop || activeConsoleView !== 'tasks') return
    if (workspace.filteredTasks.length === 0) return
    if (
      workspace.selectedTaskId
      && workspace.filteredTasks.some((task) => task.taskId === workspace.selectedTaskId)
    ) {
      return
    }

    const firstVisibleTask = workspace.filteredTasks[0]
    if (firstVisibleTask?.taskId) {
      workspace.handleSelectTask(firstVisibleTask.taskId)
    }
  }, [activeConsoleView, isDesktop, workspace.filteredTasks, workspace.handleSelectTask, workspace.selectedTaskId])

  const handleFocusInspector = () => {
    inspectorRef.current?.focus()
  }

  const handleOpenTaskDrawer = useCallback((taskId = workspace.selectedTaskId) => {
    if (!isDesktop || !taskId) return

    if (isTaskDrawerOpen && workspace.selectedTaskId === taskId) {
      shouldRestoreTaskFocusRef.current = true
      setIsTaskDrawerOpen(false)
      return
    }

    workspace.handleSelectTask(taskId)
    setIsTaskDrawerOpen(true)
  }, [isDesktop, isTaskDrawerOpen, workspace.handleSelectTask, workspace.selectedTaskId])

  const handleCloseTaskDrawer = useCallback(() => {
    shouldRestoreTaskFocusRef.current = true
    setIsTaskDrawerOpen(false)
  }, [workspace.selectedTaskId])

  const handleFocusTasks = () => {
    setIsTaskDrawerOpen(false)
    setActiveConsoleView('tasks')
  }

  useEffect(() => {
    if (!isTaskDrawerOpen || workspace.selectedTask) return
    setIsTaskDrawerOpen(false)
  }, [isTaskDrawerOpen, workspace.selectedTask])

  useEffect(() => {
    if (activeConsoleView === 'tasks' || !isTaskDrawerOpen) return
    setIsTaskDrawerOpen(false)
  }, [activeConsoleView, isTaskDrawerOpen])

  useEffect(() => {
    if (isDesktop || !isTaskDrawerOpen) return
    setIsTaskDrawerOpen(false)
  }, [isDesktop, isTaskDrawerOpen])

  useEffect(() => {
    if (isTaskDrawerOpen || !isDesktop || activeConsoleView !== 'tasks') return
    if (!shouldRestoreTaskFocusRef.current) return

    shouldRestoreTaskFocusRef.current = false
    window.requestAnimationFrame(() => {
      document.querySelector(`[data-task-id="${workspace.selectedTaskId}"]`)?.focus()
    })
  }, [activeConsoleView, isDesktop, isTaskDrawerOpen, workspace.selectedTaskId])

  const queueTabs = [
    { key: 'tasks', label: `任务队列 ${workspace.tasks.length}` },
    { key: 'demands', label: `需求队列 ${filteredDemands.length}` }
  ]

  return (
    <>
      <section className="tasks-workspace tasks-workspace-v6 stack-lg">
        {workspace.toasts.length ? (
          <Suspense fallback={null}>
            <ToastViewport toasts={workspace.toasts} onDismiss={workspace.removeToast} />
          </Suspense>
        ) : null}

        <div className="batch-v6-grid">
          <aside className="batch-v6-column batch-v6-sidebar">
            <BatchMissionPanel
              syncConfig={workspace.syncConfig}
              docsConfigDraft={workspace.docsConfigDraft}
              docsDiagnostic={workspace.docsDiagnostic}
              diagnosticPending={workspace.diagnosticPending}
              docsLoginStatus={workspace.docsLoginStatus}
              pendingDemandCount={Number(summary.needsFillRows || 0)}
              taskCount={workspace.tasks.length}
              waitingTaskCount={workspace.waitingTaskCount}
              matchedReadyAccounts={workspace.matchedReadyAccounts}
              creatingSheetTasks={workspace.creatingSheetTasks}
              creatingMatchedAccountTasks={workspace.creatingMatchedAccountTasks}
              matchingAccounts={workspace.matchingAccounts}
              sheetTaskCount={workspace.sheetTaskCount}
              onSheetTaskCountChange={workspace.setSheetTaskCount}
              onDraftChange={workspace.handleDocsDraftChange}
              onSaveConfig={workspace.handleSaveTencentDocsConfig}
              onStartLogin={workspace.handleStartTencentDocsLogin}
              onInspect={workspace.handleInspectTencentDocs}
              onCreateSheetTasks={workspace.handleCreateSheetDemandTasks}
              onMatchAccounts={workspace.handleMatchAccountsToDemands}
              onCreateTasksFromAccounts={workspace.handleOpenCreateTasksFromAccounts}
              onFocusQueue={handleFocusTasks}
              diagnosticsOpen={workspace.isDiagnosticsOpen}
              onToggleDiagnostics={workspace.handleToggleDiagnostics}
            />
          </aside>

          <main className="batch-v6-column batch-v6-main">
            <section className="batch-v6-queue-shell stack-md">
              <div className="batch-v6-queue-header">
                <div className="batch-view-toggle" role="tablist" aria-label="主工作面切换">
                  {queueTabs.map((tab) => (
                    <button
                      key={tab.key}
                      className={`tab-btn ${activeConsoleView === tab.key ? 'active' : ''}`}
                      type="button"
                      role="tab"
                      aria-selected={activeConsoleView === tab.key}
                      onClick={() => setActiveConsoleView(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {activeConsoleView === 'tasks' ? (
                <TaskBoard
                  tasks={workspace.tasks}
                  filteredTasks={workspace.filteredTasks}
                  filterKey={workspace.filterKey}
                  searchValue={workspace.searchValue}
                  setFilterKey={workspace.setFilterKey}
                  setSearchValue={workspace.setSearchValue}
                  loading={workspace.loading}
                  error={workspace.error}
                  onRetryLoad={() => workspace.handleRefreshList()}
                  selectedTaskId={workspace.selectedTaskId}
                  selectedTask={workspace.selectedTask}
                  onSelectTask={workspace.handleSelectTask}
                  onCloseTaskDetail={workspace.handleCloseTaskDetail}
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
                  onOpenBuilder={workspace.handleBuilderOpen}
                  onRequestFocusInspector={handleFocusInspector}
                  onOpenTaskDrawer={handleOpenTaskDrawer}
                  desktopDrawerOpenTaskId={showDesktopTaskDrawer ? workspace.selectedTaskId : ''}
                  renderDesktopDetail={!isDesktop}
                />
              ) : (
                <DemandQueuePanel
                  filteredDemands={filteredDemands}
                  demandFilter={workspace.demandFilter}
                  demandSearch={workspace.demandSearch}
                  onDemandFilterChange={workspace.setDemandFilter}
                  onDemandSearchChange={workspace.setDemandSearch}
                  selectedDemandRow={selectedDemandRow}
                  onSelectDemand={setSelectedDemandRow}
                  readyMatchCount={workspace.matchedReadyAccounts.length}
                  onFocusTasks={handleFocusTasks}
                />
              )}
            </section>
          </main>

          <aside
            ref={inspectorRef}
            className={`batch-v6-column batch-v6-inspector ${activeConsoleView === 'tasks' && !workspace.selectedTask ? 'is-empty' : ''}`}
            tabIndex={-1}
          >
            {isDesktop || activeConsoleView === 'demands' ? (
              <BatchInspectorPanel
                view={activeConsoleView}
                task={workspace.selectedTask}
                syncConfig={workspace.syncConfig}
                syncPreview={workspace.selectedTask ? workspace.syncPreviewState[workspace.selectedTask.taskId] || null : null}
                syncAction={workspace.selectedTask ? workspace.syncActionLoading[workspace.selectedTask.taskId] || '' : ''}
                busy={workspace.selectedTask ? Boolean(workspace.actionLoading[workspace.selectedTask.taskId]) : false}
                copying={workspace.selectedTask ? workspace.copyingTaskId === workspace.selectedTask.taskId : false}
                onCopyQr={workspace.handleCopyQr}
                onRefreshLogin={workspace.handleRefreshLogin}
                onRetryQuery={workspace.handleRetryQuery}
                onDeleteTask={workspace.handleDeleteTask}
                onPreviewSync={workspace.handlePreviewTaskSync}
                onSyncTask={workspace.handleSyncTask}
                onSubmitSmsCode={workspace.handleSubmitSmsCode}
                docsLoginSession={workspace.docsLoginSession}
                docsLoginStatus={workspace.docsLoginStatus}
                selectedDemand={selectedDemand}
                selectedDemandMatches={selectedDemandMatches}
                matchedReadyAccounts={workspace.matchedReadyAccounts}
                diagnosticPending={workspace.diagnosticPending}
                docsDiagnostic={workspace.docsDiagnostic}
                onMatchAccounts={workspace.handleMatchAccountsToDemands}
                onCreateTasksFromAccounts={workspace.handleOpenCreateTasksFromAccounts}
                onInspect={workspace.handleInspectTencentDocs}
                onFocusTasks={handleFocusTasks}
                onOpenTaskDrawer={isDesktop && activeConsoleView === 'tasks' ? handleOpenTaskDrawer : undefined}
                isTaskDrawerOpen={showDesktopTaskDrawer}
                titleId={inspectorTitleId}
              />
            ) : null}
          </aside>
        </div>

        {showDesktopTaskDrawer ? (
          <button
            className="batch-task-detail-drawer-backdrop"
            type="button"
            onClick={handleCloseTaskDrawer}
            aria-label="收起任务详情抽屉"
          />
        ) : null}

        {showDesktopTaskDrawer ? (
          <BatchTaskDetailDrawer
            task={workspace.selectedTask}
            syncConfig={workspace.syncConfig}
            syncPreview={workspace.selectedTask ? workspace.syncPreviewState[workspace.selectedTask.taskId] || null : null}
            syncAction={workspace.selectedTask ? workspace.syncActionLoading[workspace.selectedTask.taskId] || '' : ''}
            busy={workspace.selectedTask ? Boolean(workspace.actionLoading[workspace.selectedTask.taskId]) : false}
            copying={workspace.selectedTask ? workspace.copyingTaskId === workspace.selectedTask.taskId : false}
            onClose={handleCloseTaskDrawer}
            onCopyQr={workspace.handleCopyQr}
            onRefreshLogin={workspace.handleRefreshLogin}
            onRetryQuery={workspace.handleRetryQuery}
            onDeleteTask={workspace.handleDeleteTask}
            onPreviewSync={workspace.handlePreviewTaskSync}
            onSyncTask={workspace.handleSyncTask}
            onSubmitSmsCode={workspace.handleSubmitSmsCode}
          />
        ) : null}

        {workspace.shouldShowDiagnostics && workspace.isDiagnosticsOpen ? (
          <DiagnosticsPanel
            open={workspace.isDiagnosticsOpen}
            syncConfig={workspace.syncConfig}
            diagnostic={workspace.docsDiagnostic}
            diagnosticPending={workspace.diagnosticPending}
            onInspect={workspace.handleInspectTencentDocs}
            onToggle={workspace.handleToggleDiagnostics}
          />
        ) : null}

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
      </section>

      {workspace.accountTaskConfirmState.open ? (
        <Suspense fallback={null}>
          <ConfirmDialog
            open={workspace.accountTaskConfirmState.open}
            tone="warning"
            title="确认创建批量任务"
            description={`将为 ${workspace.accountTaskConfirmState.accounts.length} 个已匹配的 READY 账号创建交接表回填任务。`}
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

function normalizeNickname(value) {
  return String(value || '').trim().toLowerCase()
}
