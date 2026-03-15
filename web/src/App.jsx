import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Bug,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Database,
  FileSpreadsheet,
  History,
  Link2,
  LoaderCircle,
  LogIn,
  Play,
  QrCode,
  Radar,
  RefreshCcw,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  Users,
  X
} from 'lucide-react'
import { useEffect, useRef, useState, startTransition } from 'react'
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams
} from 'react-router-dom'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import { api } from './api'

const BATCH_STAGES = [
  { key: 'intake', label: '交接表接入', icon: Link2 },
  { key: 'accounts', label: '账号接入', icon: Users },
  { key: 'coverage', label: '覆盖率生成', icon: Radar },
  { key: 'rules', label: '规则设定', icon: ShieldCheck },
  { key: 'run', label: '运行与回填', icon: Activity },
  { key: 'history', label: '历史复盘', icon: History }
]

const ACCOUNT_SECTIONS = [
  { key: 'pool', label: '账号池', icon: Users },
  { key: 'keepalive', label: '保活中心', icon: RefreshCcw },
  { key: 'debug', label: '调试台', icon: Bug }
]

export default function App() {
  const [booting, setBooting] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const payload = await api.me()
        if (cancelled) return
        setAuthenticated(Boolean(payload?.authenticated))
      } catch (_error) {
        if (!cancelled) {
          setAuthenticated(false)
        }
      } finally {
        if (!cancelled) {
          setBooting(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogin(password) {
    setAuthLoading(true)
    setAuthError('')
    try {
      await api.login(password)
      setAuthenticated(true)
    } catch (error) {
      setAuthError(error.message || '登录失败')
    } finally {
      setAuthLoading(false)
    }
  }

  if (booting) {
    return <BootScreen />
  }

  if (!authenticated) {
    return <LoginGate loading={authLoading} error={authError} onSubmit={handleLogin} />
  }

  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/batches" element={<BatchesIndexRoute />} />
      <Route path="/batches/:batchId" element={<Navigate to="intake" replace />} />
      <Route path="/batches/:batchId/:stage" element={<BatchStagePage />} />
      <Route path="/accounts" element={<Navigate to="/accounts/pool" replace />} />
      <Route path="/accounts/:section" element={<AccountsSectionPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function HomeRoute() {
  const batchesQuery = useQuery({
    queryKey: ['batches'],
    queryFn: api.listBatches,
    placeholderData: keepPreviousData
  })

  if (batchesQuery.isPending && !batchesQuery.data) {
    return <BootScreen />
  }

  if (batchesQuery.data?.recentBatchId) {
    return <Navigate to={`/batches/${batchesQuery.data.recentBatchId}/intake`} replace />
  }

  return <NewBatchWizard standalone />
}

function BatchesIndexRoute() {
  const batchesQuery = useQuery({
    queryKey: ['batches'],
    queryFn: api.listBatches,
    placeholderData: keepPreviousData
  })

  if (batchesQuery.isPending && !batchesQuery.data) {
    return <BootScreen />
  }

  if (batchesQuery.data?.recentBatchId) {
    return <Navigate to={`/batches/${batchesQuery.data.recentBatchId}/intake`} replace />
  }

  return <NewBatchWizard standalone />
}

function BatchStagePage() {
  const { batchId = '', stage = 'intake' } = useParams()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [targetForm, setTargetForm] = useState({ name: '', docUrl: '', sheetName: '' })
  const [rulesForm, setRulesForm] = useState(defaultRuleForm())
  const [coverageFilter, setCoverageFilter] = useState('EXECUTABLE')
  const [selectedCoverageId, setSelectedCoverageId] = useState('')
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false)
  const taskDrawerReturnRef = useRef(null)
  const loginSession = useLoginSessionController({ batchId })

  useBatchStream(batchId)

  const batchesQuery = useQuery({
    queryKey: ['batches'],
    queryFn: api.listBatches,
    placeholderData: keepPreviousData
  })
  const batchQuery = useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => api.getBatch(batchId),
    placeholderData: keepPreviousData
  })
  const accountsQuery = useQuery({
    queryKey: ['accounts', batchId],
    queryFn: () => api.listAccounts(batchId),
    placeholderData: keepPreviousData
  })
  const coverageQuery = useQuery({
    queryKey: ['coverage', batchId],
    queryFn: () => api.getCoverage(batchId),
    enabled: ['coverage', 'rules', 'run'].includes(stage) || Boolean(batchQuery.data?.coverageSummary?.total),
    placeholderData: keepPreviousData
  })
  const rulesQuery = useQuery({
    queryKey: ['rules', batchId],
    queryFn: () => api.getRules(batchId),
    enabled: ['rules', 'run'].includes(stage) || Boolean(batchQuery.data?.latestRuleSetId),
    placeholderData: keepPreviousData
  })
  const templatesQuery = useQuery({
    queryKey: ['ruleTemplates'],
    queryFn: api.listRuleTemplates,
    enabled: stage === 'rules' || stage === 'history',
    placeholderData: keepPreviousData
  })
  const historyQuery = useQuery({
    queryKey: ['history', batchId],
    queryFn: () => api.getBatchHistory(batchId),
    enabled: stage === 'history',
    placeholderData: keepPreviousData
  })
  const activeRunId = batchQuery.data?.activeRunId
  const runQuery = useQuery({
    queryKey: ['run', batchId, activeRunId],
    queryFn: () => api.getRun(batchId, activeRunId),
    enabled: Boolean(activeRunId) && (stage === 'run' || stage === 'history'),
    placeholderData: keepPreviousData
  })
  const tasksQuery = useQuery({
    queryKey: ['runTasks', batchId, activeRunId],
    queryFn: () => api.listRunTasks(batchId, activeRunId),
    enabled: Boolean(activeRunId) && stage === 'run',
    placeholderData: keepPreviousData
  })

  const updateTargetMutation = useMutation({
    mutationFn: (payload) => api.updateBatchTarget(batchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] })
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      queryClient.invalidateQueries({ queryKey: ['coverage', batchId] })
      queryClient.invalidateQueries({ queryKey: ['rules', batchId] })
    }
  })
  const inspectMutation = useMutation({
    mutationFn: () => api.inspectBatchIntake(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] })
      queryClient.invalidateQueries({ queryKey: ['coverage', batchId] })
      queryClient.invalidateQueries({ queryKey: ['rules', batchId] })
    }
  })
  const generateCoverageMutation = useMutation({
    mutationFn: () => api.generateCoverage(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] })
      queryClient.invalidateQueries({ queryKey: ['coverage', batchId] })
      queryClient.invalidateQueries({ queryKey: ['accounts', batchId] })
    }
  })
  const saveRulesMutation = useMutation({
    mutationFn: (payload) => api.saveRules(batchId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] })
      queryClient.invalidateQueries({ queryKey: ['rules', batchId] })
      queryClient.invalidateQueries({ queryKey: ['history', batchId] })
    }
  })
  const saveTemplateMutation = useMutation({
    mutationFn: (payload) => api.saveRuleTemplate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ruleTemplates'] })
      queryClient.invalidateQueries({ queryKey: ['history', batchId] })
    }
  })
  const applyTemplateMutation = useMutation({
    mutationFn: (templateId) => api.applyRuleTemplate(batchId, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] })
      queryClient.invalidateQueries({ queryKey: ['rules', batchId] })
      queryClient.invalidateQueries({ queryKey: ['history', batchId] })
    }
  })
  const updateBindingMutation = useMutation({
    mutationFn: ({ itemId, accountId }) => api.updateCoverageBinding(batchId, itemId, { accountId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage', batchId] })
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] })
      queryClient.invalidateQueries({ queryKey: ['accounts', batchId] })
    }
  })
  const createRunMutation = useMutation({
    mutationFn: () => api.createRun(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] })
      queryClient.invalidateQueries({ queryKey: ['run', batchId] })
      queryClient.invalidateQueries({ queryKey: ['runTasks', batchId] })
    }
  })
  const retryRunMutation = useMutation({
    mutationFn: (payload) => api.retryRun(batchId, activeRunId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] })
      queryClient.invalidateQueries({ queryKey: ['run', batchId, activeRunId] })
      queryClient.invalidateQueries({ queryKey: ['runTasks', batchId, activeRunId] })
      queryClient.invalidateQueries({ queryKey: ['history', batchId] })
    }
  })
  const cloneBatchMutation = useMutation({
    mutationFn: (payload) => api.cloneBatch(batchId, payload),
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      startTransition(() => {
        navigate(`/batches/${payload.id}/${payload.currentRules?.id ? 'rules' : 'intake'}`)
      })
    }
  })

  useEffect(() => {
    if (!batchQuery.data) return
    setTargetForm({
      name: batchQuery.data.name || '',
      docUrl: batchQuery.data.target?.docUrl || '',
      sheetName: batchQuery.data.target?.sheetName || ''
    })
  }, [batchQuery.data?.id, batchQuery.data?.name, batchQuery.data?.target?.docUrl, batchQuery.data?.target?.sheetName])

  useEffect(() => {
    if (!rulesQuery.data) return
    setRulesForm({
      executionScope: rulesQuery.data.executionScope || 'ALL_EXECUTABLE',
      accountScope: rulesQuery.data.accountScope || 'READY_ONLY',
      skipPolicies: {
        missingContentId: Boolean(rulesQuery.data.skipPolicies?.missingContentId),
        missingAccount: Boolean(rulesQuery.data.skipPolicies?.missingAccount),
        ambiguous: Boolean(rulesQuery.data.skipPolicies?.ambiguous),
        complete: Boolean(rulesQuery.data.skipPolicies?.complete)
      },
      syncPolicy: rulesQuery.data.syncPolicy || 'FILL_EMPTY_ONLY',
      failurePolicy: rulesQuery.data.failurePolicy || 'KEEP_FOR_RETRY',
      concurrencyProfile: rulesQuery.data.concurrencyProfile || 'STANDARD'
    })
  }, [
    rulesQuery.data?.id,
    rulesQuery.data?.executionScope,
    rulesQuery.data?.accountScope,
    rulesQuery.data?.syncPolicy,
    rulesQuery.data?.failurePolicy,
    rulesQuery.data?.concurrencyProfile,
    rulesQuery.data?.skipPolicies?.missingContentId,
    rulesQuery.data?.skipPolicies?.missingAccount,
    rulesQuery.data?.skipPolicies?.ambiguous,
    rulesQuery.data?.skipPolicies?.complete
  ])

  useEffect(() => {
    const nextId = coverageQuery.data?.defaultSelectedId || ''
    if (!coverageQuery.data?.items?.length) {
      setSelectedCoverageId('')
      return
    }
    if (!coverageQuery.data.items.some((item) => item.id === selectedCoverageId)) {
      setSelectedCoverageId(nextId)
    }
  }, [coverageQuery.data?.defaultSelectedId, coverageQuery.data?.items, selectedCoverageId])

  useEffect(() => {
    const nextId = tasksQuery.data?.selectedTaskId || ''
    if (!tasksQuery.data?.tasks?.length) {
      setSelectedTaskId('')
      setTaskDrawerOpen(false)
      return
    }
    if (!tasksQuery.data.tasks.some((item) => item.id === selectedTaskId)) {
      setSelectedTaskId(nextId)
    }
  }, [tasksQuery.data?.selectedTaskId, tasksQuery.data?.tasks, selectedTaskId])

  if (!BATCH_STAGES.some((item) => item.key === stage)) {
    return <Navigate to={`/batches/${batchId}/intake`} replace />
  }

  if (batchQuery.isPending && !batchQuery.data) {
    return <BootScreen />
  }

  if (batchQuery.isError) {
    return (
      <WorkspaceFrame
        workspace="batch"
        batches={batchesQuery.data?.batches || []}
        currentBatch={null}
        heartbeat={null}
        center={<InlinePanel tone="danger" title="批次加载失败" description={batchQuery.error.message} />}
        aside={<EmptyAside title="没有可显示的上下文" />}
      />
    )
  }

  const batch = batchQuery.data
  const coverageItems = coverageQuery.data?.items || []
  const visibleCoverageItems = coverageFilter === 'ALL'
    ? coverageItems
    : coverageItems.filter((item) => item.status === coverageFilter)
  const selectedCoverage = coverageItems.find((item) => item.id === selectedCoverageId) || visibleCoverageItems[0] || null
  const tasks = tasksQuery.data?.tasks || []
  const selectedTask = tasks.find((item) => item.id === selectedTaskId) || tasks[0] || null
  const currentStageMeta = BATCH_STAGES.find((item) => item.key === stage) || BATCH_STAGES[0]
  const accountOptions = accountsQuery.data?.accounts || []

  const heartbeat = buildHeartbeat(batch)
  const primaryAction = buildBatchPrimaryAction({
    stage,
    batch,
    onInspect: async () => {
      await updateTargetMutation.mutateAsync(targetForm)
      await inspectMutation.mutateAsync()
    },
    onCreateSession: loginSession.startSession,
    onGenerateCoverage: () => generateCoverageMutation.mutate(),
    onSaveRules: () => saveRulesMutation.mutate(rulesForm),
    onStartRun: () => createRunMutation.mutate(),
    onRetryFailed: () => retryRunMutation.mutate({ bucket: 'QUERY_FAILED' }),
    onRetrySync: () => retryRunMutation.mutate({ bucket: 'SYNC_FAILED' }),
    onNavigateIntake: () => navigate(`/batches/${batchId}/intake`),
    inspectBusy: updateTargetMutation.isPending || inspectMutation.isPending,
    accountBusy: loginSession.creating,
    coverageBusy: generateCoverageMutation.isPending,
    rulesBusy: saveRulesMutation.isPending || applyTemplateMutation.isPending,
    runBusy: createRunMutation.isPending || retryRunMutation.isPending
  })

  return (
    <WorkspaceFrame
      workspace="batch"
      batches={batchesQuery.data?.batches || []}
      currentBatch={batch}
      heartbeat={heartbeat}
      sideHeader={
        <BatchRail
          batch={batch}
          stage={stage}
          onNavigate={(nextStage) => {
            startTransition(() => {
              navigate(`/batches/${batchId}/${nextStage}`)
            })
          }}
          primaryAction={primaryAction}
          busy={
            batchQuery.isFetching
            || coverageQuery.isFetching
            || rulesQuery.isFetching
            || runQuery.isFetching
            || tasksQuery.isFetching
          }
        />
      }
      center={
        <section className="console-stage">
          <StageHeader
            icon={currentStageMeta.icon}
            title={currentStageMeta.label}
            subtitle={stageSubtitle(stage)}
            busy={primaryAction.busy}
          />
          {stage === 'intake' && (
            <IntakeStage
              batch={batch}
              form={targetForm}
              onChange={setTargetForm}
              saving={updateTargetMutation.isPending || inspectMutation.isPending}
              error={inspectMutation.error?.message || updateTargetMutation.error?.message || ''}
            />
          )}
          {stage === 'accounts' && (
            <BatchAccountsStage
              batch={batch}
              accountsData={accountsQuery.data}
              accountsLoading={accountsQuery.isPending && !accountsQuery.data}
              loginSession={loginSession}
            />
          )}
          {stage === 'coverage' && (
            <CoverageStage
              batch={batch}
              coverage={coverageQuery.data}
              loading={coverageQuery.isPending && !coverageQuery.data}
              filter={coverageFilter}
              onFilter={setCoverageFilter}
              selectedId={selectedCoverageId}
              onSelect={setSelectedCoverageId}
              visibleItems={visibleCoverageItems}
              error={generateCoverageMutation.error?.message || updateBindingMutation.error?.message || ''}
            />
          )}
          {stage === 'rules' && (
            <RulesStage
              batch={batch}
              rules={rulesQuery.data}
              templates={templatesQuery.data?.templates || []}
              rulesForm={rulesForm}
              onChange={setRulesForm}
              saving={saveRulesMutation.isPending}
              savingTemplate={saveTemplateMutation.isPending}
              applyingTemplateId={applyTemplateMutation.isPending ? (applyTemplateMutation.variables || '') : ''}
              onSaveTemplate={() => saveTemplateMutation.mutate({ batchId })}
              onApplyTemplate={(templateId) => applyTemplateMutation.mutate(templateId)}
              error={saveRulesMutation.error?.message || applyTemplateMutation.error?.message || saveTemplateMutation.error?.message || ''}
            />
          )}
          {stage === 'run' && (
            <RunStage
              batch={batch}
              runData={runQuery.data}
              tasksData={tasksQuery.data}
              loading={(runQuery.isPending && !runQuery.data) || (tasksQuery.isPending && !tasksQuery.data && Boolean(activeRunId))}
              selectedTaskId={selectedTaskId}
              onSelectTask={(taskId) => {
                taskDrawerReturnRef.current = document.activeElement
                setSelectedTaskId(taskId)
                setTaskDrawerOpen(true)
              }}
              onRetryBucket={(bucket) => retryRunMutation.mutate({ bucket })}
              error={createRunMutation.error?.message || retryRunMutation.error?.message || ''}
            />
          )}
          {stage === 'history' && (
            <HistoryStage
              batch={batch}
              history={historyQuery.data}
              loading={historyQuery.isPending && !historyQuery.data}
              cloning={cloneBatchMutation.isPending}
              onClone={() => cloneBatchMutation.mutate({ includeRules: true })}
              templates={templatesQuery.data?.templates || []}
              error={cloneBatchMutation.error?.message || ''}
            />
          )}
        </section>
      }
      aside={
        <BatchInspector
          stage={stage}
          batch={batch}
          snapshot={batch.latestSnapshot}
          coverage={coverageQuery.data}
          selectedCoverage={selectedCoverage}
          accounts={accountOptions}
          onBindAccount={(accountId) => {
            if (!selectedCoverage) return
            updateBindingMutation.mutate({
              itemId: selectedCoverage.id,
              accountId
            })
          }}
          updatingBinding={updateBindingMutation.isPending}
          runData={runQuery.data}
          selectedTask={selectedTask}
          history={historyQuery.data}
          loginSession={loginSession}
        />
      }
    >
      <TaskDrawer
        open={taskDrawerOpen}
        task={selectedTask}
        onClose={() => setTaskDrawerOpen(false)}
        returnFocusRef={taskDrawerReturnRef}
      />
    </WorkspaceFrame>
  )
}

function AccountsSectionPage() {
  const { section = 'pool' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [contentId, setContentId] = useState('')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const loginSession = useLoginSessionController()

  const batchesQuery = useQuery({
    queryKey: ['batches'],
    queryFn: api.listBatches,
    placeholderData: keepPreviousData
  })
  const recentBatchId = batchesQuery.data?.recentBatchId || ''
  const recentBatchQuery = useQuery({
    queryKey: ['batch', recentBatchId],
    queryFn: () => api.getBatch(recentBatchId),
    enabled: Boolean(recentBatchId),
    placeholderData: keepPreviousData
  })
  const accountsQuery = useQuery({
    queryKey: ['accounts', 'pool'],
    queryFn: () => api.listAccounts(recentBatchId || null),
    placeholderData: keepPreviousData
  })
  const healthQuery = useQuery({
    queryKey: ['accountHealth', recentBatchId || 'none'],
    queryFn: () => api.getAccountHealth(recentBatchId || null),
    placeholderData: keepPreviousData
  })
  const keepAliveMutation = useMutation({
    mutationFn: (payload) => api.keepAliveAccounts(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['accountHealth'] })
      queryClient.invalidateQueries({ queryKey: ['batch'] })
    }
  })
  const debugQueryMutation = useMutation({
    mutationFn: (payload) => api.debugQuery(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['accountHealth'] })
    }
  })
  const deleteMutation = useMutation({
    mutationFn: (accountId) => api.deleteAccount(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['accountHealth'] })
      queryClient.invalidateQueries({ queryKey: ['batch'] })
    }
  })

  const accounts = accountsQuery.data?.accounts || []
  const selectedAccount = accounts.find((item) => item.id === selectedAccountId) || accounts[0] || null

  useEffect(() => {
    if (!accounts.length) {
      setSelectedAccountId('')
      return
    }
    if (!accounts.some((item) => item.id === selectedAccountId)) {
      setSelectedAccountId(accounts[0].id)
    }
  }, [accounts, selectedAccountId])

  if (!ACCOUNT_SECTIONS.some((item) => item.key === section)) {
    return <Navigate to="/accounts/pool" replace />
  }

  const sectionMeta = ACCOUNT_SECTIONS.find((item) => item.key === section) || ACCOUNT_SECTIONS[0]
  const heartbeat = buildHeartbeat(recentBatchQuery.data || null)

  return (
    <WorkspaceFrame
      workspace="accounts"
      batches={batchesQuery.data?.batches || []}
      currentBatch={recentBatchQuery.data || null}
      heartbeat={heartbeat}
      sideHeader={
        <AccountsRail
          section={section}
          onNavigate={(nextSection) => navigate(`/accounts/${nextSection}`)}
          onOpenBatch={() => {
            if (recentBatchId) {
              navigate(`/batches/${recentBatchId}/intake`)
            }
          }}
          loginSession={loginSession}
        />
      }
      center={
        <section className="console-stage">
          <StageHeader
            icon={sectionMeta.icon}
            title={sectionMeta.label}
            subtitle={accountSectionSubtitle(section)}
            busy={accountsQuery.isFetching || healthQuery.isFetching}
          />
          {section === 'pool' && (
            <AccountsPoolStage
              accounts={accounts}
              loading={accountsQuery.isPending && !accountsQuery.data}
              selectedAccountId={selectedAccountId}
              onSelect={setSelectedAccountId}
              onDelete={(accountId) => deleteMutation.mutate(accountId)}
            />
          )}
          {section === 'keepalive' && (
            <KeepAliveStage
              health={healthQuery.data}
              loading={healthQuery.isPending && !healthQuery.data}
              running={keepAliveMutation.isPending}
              onKeepAlive={(accountIds) => keepAliveMutation.mutate({ accountIds })}
            />
          )}
          {section === 'debug' && (
            <DebugStage
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onSelectAccount={setSelectedAccountId}
              contentId={contentId}
              onContentIdChange={setContentId}
              querying={debugQueryMutation.isPending}
              result={debugQueryMutation.data}
              error={debugQueryMutation.error?.message || ''}
              onRun={() => {
                if (!selectedAccountId || !contentId) return
                debugQueryMutation.mutate({ accountId: selectedAccountId, contentId })
              }}
            />
          )}
        </section>
      }
      aside={
        <AccountsInspector
          section={section}
          selectedAccount={selectedAccount}
          health={healthQuery.data}
          currentBatch={recentBatchQuery.data || null}
          loginSession={loginSession}
          debugResult={debugQueryMutation.data}
        />
      }
    />
  )
}

function WorkspaceFrame({ workspace, batches, currentBatch, heartbeat, sideHeader, center, aside, children = null }) {
  return (
    <div className="app-shell">
      <header className="heartbeat-bar" aria-live="polite">
        <div className="heartbeat-workspaces" role="navigation" aria-label="工作区切换">
          <NavLink className={({ isActive }) => shellTabClass(isActive)} to={currentBatch ? `/batches/${currentBatch.id}/intake` : '/batches'}>
            <Boxes size={16} />
            <span>批次中心</span>
          </NavLink>
          <NavLink className={({ isActive }) => shellTabClass(isActive)} to="/accounts/pool">
            <Users size={16} />
            <span>账号管理</span>
          </NavLink>
        </div>
        <div className="heartbeat-grid">
          {heartbeat ? heartbeat.map((item) => (
            <div key={item.label} className="heartbeat-tile">
              <span className="heartbeat-label">{item.label}</span>
              <span className={`heartbeat-value tone-${item.tone || 'info'}`}>{item.value}</span>
            </div>
          )) : (
            <div className="heartbeat-empty">创建首个批次后，这里会持续显示当前批次状态。</div>
          )}
        </div>
      </header>

      <main className={`workspace-grid workspace-${workspace}`}>
        <aside className="workspace-rail">
          {sideHeader}
          <div className="batch-list-card panel-card">
            <div className="panel-card-head">
              <span className="eyebrow">最近批次</span>
              <span className="panel-mini-count">{batches.length}</span>
            </div>
            {batches.length === 0 ? (
              <EmptyPanel title="还没有批次" description="先在批次中心创建一个可执行批次。" />
            ) : (
              <div className="batch-list">
                {batches.slice(0, 8).map((batch) => (
                  <NavLink key={batch.id} className={({ isActive }) => batchLinkClass(isActive, currentBatch?.id === batch.id)} to={`/batches/${batch.id}/intake`}>
                    <div>
                      <strong>{batch.name}</strong>
                      <span>{batch.target?.sheetName || '未锁定工作表'}</span>
                    </div>
                    <StatusDot tone={toneFromBatchStatus(batch.status)} label={statusLabel(batch.status)} />
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </aside>
        <section className="workspace-main">{center}</section>
        <aside className="workspace-inspector">{aside}</aside>
      </main>

      {children}
    </div>
  )
}

function BatchRail({ batch, stage, onNavigate, primaryAction, busy }) {
  return (
    <>
      <div className="rail-brand panel-card">
        <div className="panel-card-head">
          <span className="eyebrow">批次中心</span>
          <StatusDot tone={toneFromBatchStatus(batch.status)} label={statusLabel(batch.status)} />
        </div>
        <h1>{batch.name}</h1>
        <p>{batch.target?.sheetName || '先锁定交接表，再按阶段推进。'}</p>
      </div>
      <div className="panel-card rail-cta">
        <button
          className="primary-button"
          type="button"
          onClick={primaryAction.onClick}
          disabled={primaryAction.disabled || primaryAction.busy}
        >
          {primaryAction.busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}
          <span>{primaryAction.label}</span>
        </button>
        <div className="cta-subline">
          <span>{primaryAction.helper}</span>
          {busy ? <span className="busy-chip">刷新中</span> : null}
        </div>
      </div>
      <nav className="phase-rail panel-card" aria-label="批次阶段">
        {batch.overview?.phaseRail?.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`phase-link ${stage === item.key ? 'is-current' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            <span className="phase-label">{item.label}</span>
            <span className={`phase-status tone-${toneFromPhaseStatus(item.status)}`}>{item.status}</span>
          </button>
        ))}
      </nav>
    </>
  )
}

function AccountsRail({ section, onNavigate, onOpenBatch, loginSession }) {
  return (
    <>
      <div className="rail-brand panel-card">
        <div className="panel-card-head">
          <span className="eyebrow">账号管理</span>
          <StatusDot tone="info" label="资源中心" />
        </div>
        <h1>账号资产中心</h1>
        <p>持续扫码接入、保活和调试账号，不再把账号能力散落在各个页面里。</p>
      </div>
      <div className="panel-card rail-cta">
        <button
          className="primary-button"
          type="button"
          onClick={loginSession.startSession}
          disabled={loginSession.creating}
        >
          {loginSession.creating ? <LoaderCircle className="spin" size={16} /> : <QrCode size={16} />}
          <span>新增账号</span>
        </button>
        <button className="ghost-button" type="button" onClick={onOpenBatch}>
          <span>回到当前批次</span>
        </button>
      </div>
      <nav className="phase-rail panel-card" aria-label="账号管理导航">
        {ACCOUNT_SECTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`phase-link ${section === item.key ? 'is-current' : ''}`}
            onClick={() => onNavigate(item.key)}
          >
            <span className="phase-label">{item.label}</span>
            <ChevronRight size={14} />
          </button>
        ))}
      </nav>
    </>
  )
}

function IntakeStage({ batch, form, onChange, saving, error }) {
  return (
    <div className="stage-stack">
      <PanelCard title="批次目标" eyebrow="Intake">
        <Field label="批次名称">
          <input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} />
        </Field>
        <Field label="交接表链接">
          <input value={form.docUrl} onChange={(event) => onChange({ ...form, docUrl: event.target.value })} placeholder="https://docs.qq.com/..." />
        </Field>
        <Field label="工作表名称">
          <input value={form.sheetName} onChange={(event) => onChange({ ...form, sheetName: event.target.value })} placeholder="例如：数据汇总" />
        </Field>
        <MutedMeta>
          当前阶段只做一件事：锁定目标表，并明确这张表能不能进入后续阶段。
        </MutedMeta>
      </PanelCard>

      {batch.blockers?.length ? (
        <InlinePanel
          tone="danger"
          title="当前阻塞"
          description={batch.blockers.join('；')}
        />
      ) : null}

      {batch.latestSnapshot ? (
        <PanelCard title={`快照 V${batch.latestSnapshot.version}`} eyebrow="Snapshot">
          <div className="metric-grid compact">
            <MetricCard label="候选行数" value={String(batch.latestSnapshot.summary?.totalRows || 0)} tone="info" />
            <MetricCard label="已完整" value={String(batch.latestSnapshot.summary?.completeRows || 0)} tone="success" />
            <MetricCard label="待补数" value={String(batch.latestSnapshot.summary?.needsFillRows || 0)} tone="warning" />
            <MetricCard label="缺内容 ID" value={String(batch.latestSnapshot.summary?.missingContentIdRows || 0)} tone="danger" />
          </div>
        </PanelCard>
      ) : (
        <EmptyPanel title="尚未生成快照" description="保存目标后执行检查，系统会在这里留下最近一次快照摘要。" />
      )}

      {saving ? <InlinePanel tone="info" title="正在检查交接表" description="已有数据会保留在界面上，完成后只刷新相关面板。" /> : null}
      {error ? <InlinePanel tone="danger" title="检查失败" description={error} /> : null}
    </div>
  )
}

function BatchAccountsStage({ batch, accountsData, accountsLoading, loginSession }) {
  const accounts = accountsData?.accounts || []
  const summary = accountsData?.summary || {}
  const batchContext = accountsData?.batchContext || null
  const readyAccounts = accounts.filter((account) => account.status === 'READY')
  const suggestedKeepAlive = accounts.filter((account) => account.health === 'KEEP_ALIVE').slice(0, 4)
  const suggestedRelogin = accounts.filter((account) => account.health === 'RELOGIN').slice(0, 4)

  return (
    <div className="stage-stack">
      <div className="metric-grid">
        <MetricCard label="READY 账号" value={String(summary.ready || batch.overview?.readyAccounts || 0)} tone="success" />
        <MetricCard label="可执行行数" value={String(batchContext?.executableRows || batch.overview?.executableRows || 0)} tone="info" />
        <MetricCard label="账号缺口" value={String(batchContext?.shortage || summary.readyGap || 0)} tone={(batchContext?.shortage || summary.readyGap || 0) > 0 ? 'warning' : 'success'} />
        <MetricCard label="建议补活" value={String(summary.keepAliveSuggested || 0)} tone="warning" />
      </div>

      <LoginSessionPanel controller={loginSession} />

      {batchContext?.shortage ? (
        <InlinePanel
          tone="warning"
          title="当前批次账号还不够"
          description={`还差 ${batchContext.shortage} 个 READY 账号，继续扫码后覆盖率会自动抬升。`}
        />
      ) : null}

      <div className="split-panels">
        <PanelCard title="最近可用账号" eyebrow="Accounts">
          {accountsLoading && accounts.length === 0 ? (
            <SkeletonRows count={5} />
          ) : readyAccounts.length === 0 ? (
            <EmptyPanel title="还没有 READY 账号" description="先扫码接入账号，覆盖率和批量执行才会真正动起来。" />
          ) : (
            <SelectionList
              ariaLabel="最近可用账号"
              items={readyAccounts.slice(0, 8)}
              selectedId={readyAccounts[0]?.id}
              onSelect={() => {}}
              renderItem={(account) => (
                <div className="queue-row-body">
                  <div>
                    <strong>{account.nickname || account.id}</strong>
                    <span>{account.id} · 已绑定 {account.boundCoverageCount || 0} 行</span>
                  </div>
                  <div className="queue-row-meta">
                    <StatusDot tone={toneFromAccountHealth(account.health)} label={account.health} />
                    <span>{formatDateTime(account.lastSuccessfulQueryAt || account.lastLoginAt)}</span>
                  </div>
                </div>
              )}
            />
          )}
        </PanelCard>
        <PanelCard title="本批建议动作" eyebrow="Health">
          {suggestedKeepAlive.length || suggestedRelogin.length ? (
            <div className="stack-list">
              {suggestedKeepAlive.map((account) => (
                <div key={account.id} className="history-row">
                  <div>
                    <strong>{account.nickname || account.id}</strong>
                    <span>建议补活 · 最近使用 {formatDateTime(account.lastUsedAt || account.lastSuccessfulQueryAt || account.lastLoginAt)}</span>
                  </div>
                  <StatusDot tone="warning" label="KEEP_ALIVE" />
                </div>
              ))}
              {suggestedRelogin.map((account) => (
                <div key={account.id} className="history-row">
                  <div>
                    <strong>{account.nickname || account.id}</strong>
                    <span>建议重新扫码登录</span>
                  </div>
                  <StatusDot tone="danger" label="RELOGIN" />
                </div>
              ))}
            </div>
          ) : (
            <EmptyPanel title="当前没有额外账号动作" description="继续扫码即可；一旦账号需要补活或重登，这里会优先出现名单。" />
          )}
        </PanelCard>
      </div>
    </div>
  )
}

function CoverageStage({ batch, coverage, loading, filter, onFilter, selectedId, onSelect, visibleItems, error }) {
  return (
    <div className="stage-stack">
      <PanelCard title="覆盖率摘要" eyebrow="Coverage">
        {loading && !coverage ? (
          <SkeletonRows count={4} />
        ) : coverage ? (
          <>
            <div className="summary-ribbon">
              {coverage.buckets.map((bucket) => (
                <button
                  key={bucket.key}
                  type="button"
                  className={`summary-chip ${filter === bucket.key ? 'is-active' : ''}`}
                  onClick={() => onFilter(bucket.key)}
                >
                  <span>{bucket.label}</span>
                  <strong>{bucket.count}</strong>
                </button>
              ))}
              <button
                type="button"
                className={`summary-chip ${filter === 'ALL' ? 'is-active' : ''}`}
                onClick={() => onFilter('ALL')}
              >
                <span>全部</span>
                <strong>{coverage.summary.total}</strong>
              </button>
            </div>
            <SelectionList
              ariaLabel="覆盖率列表"
              items={visibleItems}
              selectedId={selectedId}
              onSelect={onSelect}
              empty={<EmptyPanel title="当前筛选为空" description="换一个桶看看，或者先补齐账号与内容 ID。" />}
              renderItem={(item) => (
                <div className="queue-row-body">
                  <div>
                    <strong>{item.nickname || '未命名账号'}</strong>
                    <span>第 {item.sheetRow} 行 · 内容 ID {item.contentId || '缺失'}</span>
                  </div>
                  <div className="queue-row-meta">
                    <StatusDot tone={toneFromCoverageStatus(item.status)} label={coverageLabel(item.status)} />
                    <span>{item.binding?.accountId || '未绑定账号'}</span>
                  </div>
                </div>
              )}
            />
          </>
        ) : (
          <EmptyPanel title="尚未生成覆盖率" description="先锁定交接表并准备账号，然后生成可执行范围。" />
        )}
      </PanelCard>

      {batch.coverageSummary?.ambiguous > 0 || batch.coverageSummary?.missingAccount > 0 ? (
        <InlinePanel
          tone="warning"
          title="当前仍有待处理项"
          description={`缺账号 ${batch.coverageSummary?.missingAccount || 0} 条，歧义 ${batch.coverageSummary?.ambiguous || 0} 条。`}
        />
      ) : null}
      {error ? <InlinePanel tone="danger" title="覆盖率操作失败" description={error} /> : null}
    </div>
  )
}

function RulesStage({
  batch,
  rules,
  templates,
  rulesForm,
  onChange,
  saving,
  savingTemplate,
  applyingTemplateId,
  onSaveTemplate,
  onApplyTemplate,
  error
}) {
  const preview = rules?.preview || batch.currentRules?.preview

  return (
    <div className="stage-stack">
      <PanelCard title="本批规则" eyebrow="Rules">
        <OptionGrid
          label="执行范围"
          value={rulesForm.executionScope}
          options={[
            ['ALL_EXECUTABLE', '全部可执行'],
            ['NEW_EXECUTABLE', '仅新可执行'],
            ['SELECTED_ONLY', '仅已选行']
          ]}
          onChange={(value) => onChange({ ...rulesForm, executionScope: value })}
        />
        <OptionGrid
          label="账号范围"
          value={rulesForm.accountScope}
          options={[
            ['READY_ONLY', '只用 READY'],
            ['READY_PLUS_RECENT', 'READY + 最近成功']
          ]}
          onChange={(value) => onChange({ ...rulesForm, accountScope: value })}
        />
        <OptionGrid
          label="回填策略"
          value={rulesForm.syncPolicy}
          options={[
            ['FILL_EMPTY_ONLY', '只填空列'],
            ['OVERWRITE_TARGET_COLUMNS', '覆盖目标列']
          ]}
          onChange={(value) => onChange({ ...rulesForm, syncPolicy: value })}
        />
        <OptionGrid
          label="失败策略"
          value={rulesForm.failurePolicy}
          options={[
            ['KEEP_FOR_RETRY', '保留待重试'],
            ['KEEP_RESULT_FOR_RESYNC', '保留结果待补同步']
          ]}
          onChange={(value) => onChange({ ...rulesForm, failurePolicy: value })}
        />
        <OptionGrid
          label="并发档位"
          value={rulesForm.concurrencyProfile}
          options={[
            ['SAFE', '安全'],
            ['STANDARD', '标准'],
            ['AGGRESSIVE', '激进']
          ]}
          onChange={(value) => onChange({ ...rulesForm, concurrencyProfile: value })}
        />
        <ToggleChecklist
          value={rulesForm.skipPolicies}
          onChange={(next) => onChange({ ...rulesForm, skipPolicies: next })}
        />
      </PanelCard>

      <PanelCard title="影响预览" eyebrow="Preview">
        <div className="metric-grid compact">
          <MetricCard label="预计执行行数" value={String(preview?.willRunRows || 0)} tone="success" />
          <MetricCard label="预计跳过行数" value={String(preview?.willSkipRows || 0)} tone="warning" />
          <MetricCard label="预计占用账号" value={String(preview?.estimatedAccountUsage || 0)} tone="info" />
          <MetricCard label="目标列数" value={String(preview?.targetColumns?.length || 0)} tone="info" />
        </div>
      </PanelCard>

      <PanelCard title="规则模板" eyebrow="Templates">
        <div className="panel-actions">
          <span className="muted-caption">把当前批次策略沉淀为可复用模板，或者直接套用历史模板。</span>
          <button className="ghost-button compact" type="button" onClick={onSaveTemplate} disabled={savingTemplate || !batch.currentRules?.id}>
            {savingTemplate ? '保存中' : '保存为模板'}
          </button>
        </div>
        {templates.length ? (
          <div className="stack-list">
            {templates.slice(0, 4).map((template) => (
              <div key={template.id} className="history-row">
                <div>
                  <strong>{template.name}</strong>
                  <span>
                    使用 {template.useCount} 次 · {template.rules?.concurrencyProfile || 'STANDARD'} 并发
                  </span>
                </div>
                <button
                  className="link-button"
                  type="button"
                  onClick={() => onApplyTemplate(template.id)}
                  disabled={applyingTemplateId === template.id}
                >
                  {applyingTemplateId === template.id ? '应用中' : '应用模板'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel title="还没有规则模板" description="先把一批跑顺，再把规则沉淀成模板。" />
        )}
      </PanelCard>

      {saving ? <InlinePanel tone="info" title="正在保存规则" description="保存完成后，运行中心会立刻切换到可启动状态。" /> : null}
      {error ? <InlinePanel tone="danger" title="规则保存失败" description={error} /> : null}
    </div>
  )
}

function RunStage({ batch, runData, tasksData, loading, selectedTaskId, onSelectTask, onRetryBucket, error }) {
  return (
    <div className="stage-stack">
      {!batch.activeRunId ? (
        <EmptyPanel title="尚未启动运行" description="规则保存后，就可以在这里启动本批执行并监控回填结果。" />
      ) : loading && !runData ? (
        <SkeletonRows count={6} />
      ) : (
        <>
          <PanelCard title="批次运行卡" eyebrow="Run">
            <div className="metric-grid">
              <MetricCard label="计划任务" value={String(runData?.run?.plannedCount || 0)} tone="info" />
              <MetricCard label="成功" value={String(runData?.run?.successCount || 0)} tone="success" />
              <MetricCard label="失败" value={String(runData?.run?.failedCount || 0)} tone="danger" />
              <MetricCard label="回填失败" value={String(runData?.run?.syncFailedCount || 0)} tone="warning" />
            </div>
            <div className="run-buckets">
              {runData?.buckets?.map((bucket) => (
                <button
                  key={bucket.key}
                  type="button"
                  className="bucket-card"
                  onClick={() => {
                    if (bucket.key === 'QUERY_FAILED' || bucket.key === 'SYNC_FAILED' || bucket.key === 'LOGIN_FAILED') {
                      onRetryBucket(bucket.key)
                    }
                  }}
                >
                  <span>{bucket.label}</span>
                  <strong>{bucket.count}</strong>
                </button>
              ))}
            </div>
          </PanelCard>
          {error ? <InlinePanel tone="danger" title="运行操作失败" description={error} /> : null}
          <PanelCard title="任务明细" eyebrow="Tasks">
            <SelectionList
              ariaLabel="运行任务列表"
              items={tasksData?.tasks || []}
              selectedId={selectedTaskId}
              onSelect={onSelectTask}
              empty={<EmptyPanel title="当前没有任务" description="等运行创建后，这里会自动出现任务队列。" />}
              renderItem={(task) => (
                <div className="queue-row-body">
                  <div>
                    <strong>{task.coverageItemId}</strong>
                    <span>{task.accountId}</span>
                  </div>
                  <div className="queue-row-meta">
                    <StatusDot tone={toneFromRunTask(task)} label={runTaskLabel(task)} />
                    <span>{formatDateTime(task.updatedAt)}</span>
                  </div>
                </div>
              )}
            />
          </PanelCard>
        </>
      )}
    </div>
  )
}

function HistoryStage({ batch, history, loading, cloning, onClone, templates, error }) {
  return (
    <div className="stage-stack">
      <div className="metric-grid">
        <MetricCard label="历史运行" value={String(history?.summary?.totalRuns || 0)} tone="info" />
        <MetricCard label="完整成功" value={String(history?.summary?.completedRuns || 0)} tone="success" />
        <MetricCard label="需处理运行" value={String(history?.summary?.attentionRuns || 0)} tone="warning" />
        <MetricCard label="平均成功率" value={`${history?.summary?.averageSuccessRate || 0}%`} tone="info" />
      </div>

      <PanelCard title="复用动作" eyebrow="Reuse">
        <div className="panel-actions">
          <div>
            <strong>{history?.cloneSuggestion?.suggestedName || `${batch.name} 复制`}</strong>
            <p className="muted-meta">复制批次会继承目标表和当前规则，新批次仍建议重新检查交接表后再启动。</p>
          </div>
          <button className="primary-button compact" type="button" onClick={onClone} disabled={cloning}>
            {cloning ? '复制中' : '复制为新批次'}
          </button>
        </div>
        {history?.templateSuggestion ? (
          <div className="summary-ribbon tight">
            <span className="summary-chip static-chip">
              <span>推荐模板</span>
              <strong>{history.templateSuggestion.name}</strong>
            </span>
            <span className="summary-chip static-chip">
              <span>模板库</span>
              <strong>{templates.length}</strong>
            </span>
          </div>
        ) : null}
      </PanelCard>

      <PanelCard title="历史运行" eyebrow="History">
        {loading && !history ? (
          <SkeletonRows count={5} />
        ) : history?.runs?.length ? (
          <div className="history-list">
            {history.runs.map((run) => (
              <div key={run.id} className="history-row">
                <div>
                  <strong>{run.id.slice(0, 8)}</strong>
                  <span>
                    {formatDateTime(run.startedAt)} - {formatDateTime(run.endedAt)} · {formatDuration(run.durationMs)}
                  </span>
                </div>
                <div className="queue-row-meta">
                  <StatusDot tone={toneFromRunStatus(run.status)} label={statusLabel(run.status)} />
                  <span>{run.successCount}/{run.plannedCount}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyPanel title="暂无历史运行" description="一旦跑过一次批次，这里会留下运行复盘与失败结构。" />
        )}
      </PanelCard>
      {history?.failureBuckets?.length ? (
        <PanelCard title="失败结构" eyebrow="Buckets">
          <div className="run-buckets">
            {history.failureBuckets.map((bucket) => (
              <div key={bucket.key} className="bucket-card static-bucket">
                <span>{bucket.label}</span>
                <strong>{bucket.count}</strong>
              </div>
            ))}
          </div>
        </PanelCard>
      ) : null}
      {error ? <InlinePanel tone="danger" title="历史动作失败" description={error} /> : null}
    </div>
  )
}

function BatchInspector({
  stage,
  batch,
  snapshot,
  coverage,
  selectedCoverage,
  accounts,
  onBindAccount,
  updatingBinding,
  runData,
  selectedTask,
  history,
  loginSession
}) {
  if (stage === 'intake') {
    return (
      <PanelCard title="上下文检查器" eyebrow="Inspector">
        {snapshot ? (
          <>
            <InspectorList
              rows={[
                ['快照版本', `V${snapshot.version}`],
                ['检查时间', formatDateTime(snapshot.checkedAt)],
                ['列头数量', String(snapshot.headers?.length || 0)],
                ['候选行数', String(snapshot.summary?.totalRows || 0)]
              ]}
            />
            {snapshot.blockers?.length ? (
              <InlinePanel tone="warning" title="快照阻塞" description={snapshot.blockers.map((item) => item.message || item).join('；')} />
            ) : (
              <InlinePanel tone="success" title="交接表可进入下一阶段" description="列头和候选行已经锁定，接下来可以持续扫码补足账号。" />
            )}
          </>
        ) : (
          <EmptyPanel title="等待首个快照" description="检查完成后，这里会固定显示最新快照和阻塞项。" />
        )}
      </PanelCard>
    )
  }

  if (stage === 'accounts') {
    return (
      <PanelCard title="扫码状态" eyebrow="Inspector">
        <LoginSessionPanel controller={loginSession} compact />
      </PanelCard>
    )
  }

  if (stage === 'coverage') {
    return (
      <PanelCard title="行级检查器" eyebrow="Inspector">
        {!selectedCoverage ? (
          <EmptyPanel title="选中一条覆盖项" description="右侧会持续显示缺列、绑定建议和手动绑定动作。" />
        ) : (
          <>
            <InspectorList
              rows={[
                ['行号', `第 ${selectedCoverage.sheetRow} 行`],
                ['昵称', selectedCoverage.nickname || '-'],
                ['内容 ID', selectedCoverage.contentId || '缺失'],
                ['状态', coverageLabel(selectedCoverage.status)],
                ['推荐动作', selectedCoverage.recommendation]
              ]}
            />
            <Field label="手动绑定账号">
              <select
                value={selectedCoverage.binding?.accountId || ''}
                onChange={(event) => onBindAccount(event.target.value || null)}
                disabled={updatingBinding}
              >
                <option value="">不绑定</option>
                {accounts.filter((item) => item.status === 'READY').map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.nickname || account.id} · {account.id}
                  </option>
                ))}
              </select>
            </Field>
            {selectedCoverage.missingColumns?.length ? (
              <InlinePanel tone="warning" title="缺失列" description={selectedCoverage.missingColumns.join('、')} />
            ) : null}
          </>
        )}
      </PanelCard>
    )
  }

  if (stage === 'rules') {
    return (
      <PanelCard title="规则状态" eyebrow="Inspector">
        <InspectorList
          rows={[
            ['当前批次', batch.name],
            ['可执行行数', String(batch.coverageSummary?.executable || 0)],
            ['READY 账号', String(batch.overview?.readyAccounts || 0)],
            ['主 CTA', batch.overview?.primaryCta?.label || '保存本批规则']
          ]}
        />
      </PanelCard>
    )
  }

  if (stage === 'run') {
    return (
      <PanelCard title="运行检查器" eyebrow="Inspector">
        {runData?.run ? (
          <>
            <InspectorList
              rows={[
                ['运行状态', statusLabel(runData.run.status)],
                ['开始时间', formatDateTime(runData.run.startedAt)],
                ['结束时间', formatDateTime(runData.run.endedAt)],
                ['完成率', `${runData.summary?.completionRate || 0}%`]
              ]}
            />
            {selectedTask ? (
              <InlinePanel
                tone={toneFromRunTask(selectedTask)}
                title={runTaskLabel(selectedTask)}
                description={selectedTask.errorMessage || selectedTask.resultRef || '选中任务后，右侧抽屉会显示更完整的结果与产物链接。'}
              />
            ) : null}
          </>
        ) : (
          <EmptyPanel title="等待运行创建" description="运行启动后，这里会固定显示进度和当前选中任务摘要。" />
        )}
      </PanelCard>
    )
  }

  return (
    <PanelCard title="历史摘要" eyebrow="Inspector">
      <InspectorList
        rows={[
          ['历史运行', String(history?.summary?.totalRuns || history?.runs?.length || 0)],
          ['最近运行', formatDateTime(history?.summary?.latestRunAt)],
          ['平均成功率', `${history?.summary?.averageSuccessRate || 0}%`],
          ['当前状态', statusLabel(batch.status)]
        ]}
      />
      {history?.failureBuckets?.length ? (
        <div className="inspector-tags">
          {history.failureBuckets.filter((bucket) => bucket.count > 0).map((bucket) => (
            <span key={bucket.key} className={`inspector-tag tone-${toneFromBucket(bucket.key)}`}>
              {bucket.label} {bucket.count}
            </span>
          ))}
        </div>
      ) : null}
    </PanelCard>
  )
}

function AccountsPoolStage({ accounts, loading, selectedAccountId, onSelect, onDelete }) {
  return (
    <PanelCard title="账号池" eyebrow="Pool">
      {loading && !accounts.length ? (
        <SkeletonRows count={6} />
      ) : (
        <SelectionList
          ariaLabel="账号池列表"
          items={accounts}
          selectedId={selectedAccountId}
          onSelect={onSelect}
          empty={<EmptyPanel title="暂无账号" description="扫码接入后，账号会自动进入账号池。" />}
          renderItem={(account) => (
            <div className="queue-row-body">
              <div>
                <strong>{account.nickname || account.id}</strong>
                <span>{account.id}</span>
              </div>
              <div className="queue-row-meta">
                <StatusDot tone={toneFromAccountHealth(account.health)} label={account.health} />
                <button className="link-button danger" type="button" onClick={(event) => {
                  event.stopPropagation()
                  onDelete(account.id)
                }}>
                  删除
                </button>
              </div>
            </div>
          )}
        />
      )}
    </PanelCard>
  )
}

function KeepAliveStage({ health, loading, running, onKeepAlive }) {
  return (
    <div className="stage-stack">
      <div className="metric-grid">
        <MetricCard label="建议保活" value={String(health?.summary?.keepAliveSuggested || 0)} tone="warning" />
        <MetricCard label="建议重登" value={String(health?.summary?.reloginSuggested || 0)} tone="danger" />
        <MetricCard label="READY" value={String(health?.summary?.ready || 0)} tone="success" />
        <MetricCard label="账号缺口" value={String(health?.summary?.readyGap || 0)} tone={(health?.summary?.readyGap || 0) > 0 ? 'warning' : 'info'} />
      </div>
      <PanelCard title="推荐补活账号" eyebrow="Keepalive">
        <button className="primary-button" type="button" onClick={() => onKeepAlive()} disabled={running}>
          {running ? <LoaderCircle className="spin" size={16} /> : <RefreshCcw size={16} />}
          <span>一键批量补活</span>
        </button>
        {loading && !health ? (
          <SkeletonRows count={4} />
        ) : (
          <div className="history-list">
            {(health?.recommendedKeepAlive || []).map((account) => (
              <div key={account.id} className="history-row">
                <div>
                  <strong>{account.nickname || account.id}</strong>
                  <span>{account.id}</span>
                </div>
                <button className="link-button" type="button" onClick={() => onKeepAlive([account.id])}>
                  单账号补活
                </button>
              </div>
            ))}
            {!(health?.recommendedKeepAlive || []).length ? (
              <EmptyPanel title="当前没有推荐补活账号" description="当账号长时间未成功查询时，这里会自动列出优先补活名单。" />
            ) : null}
          </div>
        )}
      </PanelCard>
    </div>
  )
}

function DebugStage({ accounts, selectedAccountId, onSelectAccount, contentId, onContentIdChange, querying, result, error, onRun }) {
  return (
    <div className="stage-stack">
      <PanelCard title="单条调试查询" eyebrow="Debug">
        <div className="command-strip">
          <select value={selectedAccountId} onChange={(event) => onSelectAccount(event.target.value)}>
            <option value="">选择账号</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.nickname || account.id}
              </option>
            ))}
          </select>
          <input value={contentId} onChange={(event) => onContentIdChange(event.target.value)} placeholder="输入内容 ID" />
          <button className="primary-button" type="button" onClick={onRun} disabled={querying || !selectedAccountId || !contentId}>
            {querying ? <LoaderCircle className="spin" size={16} /> : <ScanLine size={16} />}
            <span>查询</span>
          </button>
        </div>
        {error ? <InlinePanel tone="danger" title="调试失败" description={error} /> : null}
      </PanelCard>
      {result ? (
        <PanelCard title="结果概要" eyebrow="Result">
          <div className="metric-grid compact">
            <MetricCard label="内容 ID" value={result.contentId} tone="info" />
            <MetricCard label="账号" value={result.nickname || result.accountId} tone="success" />
            <MetricCard label="查看次数" value={metricValue(result.metrics, '内容查看次数')} tone="warning" />
            <MetricCard label="商品点击次数" value={metricValue(result.metrics, '商品点击次数')} tone="warning" />
          </div>
          <ArtifactLinks result={result} />
        </PanelCard>
      ) : null}
    </div>
  )
}

function AccountsInspector({ section, selectedAccount, health, currentBatch, loginSession, debugResult }) {
  if (section === 'debug' && debugResult) {
    return (
      <PanelCard title="调试摘要" eyebrow="Inspector">
        <InspectorList
          rows={[
            ['账号', debugResult.nickname || debugResult.accountId],
            ['内容 ID', debugResult.contentId],
            ['查询时间', formatDateTime(debugResult.fetchedAt)],
            ['结果文件', debugResult.artifacts?.resultUrl || '-']
          ]}
        />
      </PanelCard>
    )
  }

  if (section === 'keepalive') {
    return (
      <PanelCard title="保活建议" eyebrow="Inspector">
        <InspectorList
          rows={[
            ['推荐补活', String(health?.summary?.keepAliveSuggested || 0)],
            ['推荐重登', String(health?.summary?.reloginSuggested || 0)],
            ['当前批次可执行', String(health?.summary?.batchExecutableRows || 0)]
          ]}
        />
      </PanelCard>
    )
  }

  return (
    <PanelCard title="账号上下文" eyebrow="Inspector">
      {selectedAccount ? (
        <>
          <InspectorList
            rows={[
              ['账号昵称', selectedAccount.nickname || '-'],
              ['账号 ID', selectedAccount.id],
              ['状态', selectedAccount.status],
              ['健康度', selectedAccount.health],
              ['最近登录', formatDateTime(selectedAccount.lastLoginAt)],
              ['绑定批次', String(selectedAccount.boundBatchCount || 0)],
              ['最近批次', selectedAccount.lastBatchName || '-']
            ]}
          />
          {currentBatch ? (
            <InlinePanel
              tone="info"
              title="当前批次上下文"
              description={`${currentBatch.name} · 可执行 ${currentBatch.coverageSummary?.executable || 0} 行`}
            />
          ) : null}
        </>
      ) : (
        <LoginSessionPanel controller={loginSession} compact />
      )}
    </PanelCard>
  )
}

function LoginSessionPanel({ controller, compact = false }) {
  const session = controller.session

  return (
    <div className={`login-session-card ${compact ? 'is-compact' : ''}`}>
      {!session ? (
        <EmptyPanel title="等待扫码会话" description="点击主 CTA 后生成二维码，登录完成会自动刷新账号池。" />
      ) : (
        <>
          <div className="login-session-head">
            <StatusDot tone={toneFromLoginSession(session.status)} label={loginSessionLabel(session.status)} />
            <span>{formatDateTime(session.updatedAt)}</span>
          </div>
          <div className="login-session-body">
            <img
              alt="账号扫码二维码"
              className="login-session-image"
              src={session.qrImageUrl}
            />
            <div className="login-session-copy">
              <strong>{session.account?.nickname || '等待扫码确认'}</strong>
              <p>{session.error || '二维码只在登录态缺失时出现，登录成功后会自动切到账号摘要。'}</p>
            </div>
          </div>
          {session.status === 'WAITING_SMS' ? (
            <div className="sms-bar">
              <input
                value={controller.smsCode}
                onChange={(event) => controller.setSmsCode(event.target.value)}
                placeholder="输入短信验证码"
              />
              <button type="button" className="ghost-button" onClick={controller.submitSms} disabled={controller.submittingSms}>
                {controller.submittingSms ? '提交中' : '提交验证码'}
              </button>
            </div>
          ) : null}
          {controller.error ? <InlinePanel tone="danger" title="扫码会话异常" description={controller.error} /> : null}
        </>
      )}
    </div>
  )
}

function TaskDrawer({ open, task, onClose, returnFocusRef }) {
  const closeButtonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      returnFocusRef?.current?.focus?.()
      return undefined
    }

    closeButtonRef.current?.focus()
    return undefined
  }, [open, returnFocusRef])

  if (!open || !task) return null

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="任务详情抽屉"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="detail-drawer-head">
          <div>
            <span className="eyebrow">Task Detail</span>
            <h2>{runTaskLabel(task)}</h2>
          </div>
          <button ref={closeButtonRef} className="icon-button" type="button" onClick={onClose} aria-label="关闭任务详情">
            <X size={16} />
          </button>
        </div>
        <InspectorList
          rows={[
            ['任务 ID', task.id],
            ['账号', task.accountId],
            ['状态', runTaskLabel(task)],
            ['更新时间', formatDateTime(task.updatedAt)],
            ['错误码', task.errorCode || '-']
          ]}
        />
        {task.errorMessage ? (
          <InlinePanel tone="danger" title="失败信息" description={task.errorMessage} />
        ) : null}
        {task.queryPayload ? (
          <PanelCard title="查询结果" eyebrow="Result">
            <div className="metric-grid compact">
              <MetricCard label="内容 ID" value={task.queryPayload.contentId} tone="info" />
              <MetricCard label="查看次数" value={metricValue(task.queryPayload.metrics, '内容查看次数')} tone="warning" />
              <MetricCard label="查看人数" value={metricValue(task.queryPayload.metrics, '内容查看人数')} tone="warning" />
              <MetricCard label="商品点击次数" value={metricValue(task.queryPayload.metrics, '商品点击次数')} tone="warning" />
            </div>
            <ArtifactLinks result={task.queryPayload} />
          </PanelCard>
        ) : null}
      </aside>
    </div>
  )
}

function NewBatchWizard({ standalone = false }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    docUrl: '',
    sheetName: ''
  })
  const createMutation = useMutation({
    mutationFn: api.createBatch,
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      startTransition(() => {
        navigate(`/batches/${payload.id}/intake`)
      })
    }
  })

  return (
    <div className={`wizard-shell ${standalone ? 'is-standalone' : ''}`}>
      <div className="wizard-panel panel-card">
        <span className="eyebrow">V7 Batch Console</span>
        <h1>从批次开始，而不是从任务开始</h1>
        <p>
          V7 的入口只围绕一条主线展开：接入交接表，持续补足账号，生成覆盖率，保存规则，再启动批量回填。
        </p>
        <Field label="批次名称">
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="例如：3月第二周鞋包投放" />
        </Field>
        <Field label="交接表链接">
          <input value={form.docUrl} onChange={(event) => setForm({ ...form, docUrl: event.target.value })} placeholder="也可以稍后再填" />
        </Field>
        <Field label="工作表名称">
          <input value={form.sheetName} onChange={(event) => setForm({ ...form, sheetName: event.target.value })} placeholder="例如：数据汇总" />
        </Field>
        <button className="primary-button" type="button" onClick={() => createMutation.mutate(form)} disabled={createMutation.isPending}>
          {createMutation.isPending ? <LoaderCircle className="spin" size={16} /> : <Database size={16} />}
          <span>创建首个批次</span>
        </button>
        {createMutation.error ? (
          <InlinePanel tone="danger" title="创建失败" description={createMutation.error.message} />
        ) : null}
      </div>
    </div>
  )
}

function StageHeader({ icon: Icon, title, subtitle, busy }) {
  return (
    <div className="stage-header">
      <div>
        <div className="stage-title-line">
          <Icon size={18} />
          <h2>{title}</h2>
        </div>
        <p>{subtitle}</p>
      </div>
      {busy ? (
        <div className="busy-chip">
          <LoaderCircle className="spin" size={14} />
          <span>处理中</span>
        </div>
      ) : null}
    </div>
  )
}

function PanelCard({ title, eyebrow, children }) {
  return (
    <section className="panel-card">
      <div className="panel-card-head">
        <span className="eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function MetricCard({ label, value, tone }) {
  return (
    <div className={`metric-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function InlinePanel({ tone = 'info', title, description }) {
  return (
    <div className={`inline-panel tone-${tone}`}>
      <div className="inline-panel-head">
        {tone === 'danger' ? <AlertTriangle size={16} /> : tone === 'success' ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}
        <strong>{title}</strong>
      </div>
      <p>{description}</p>
    </div>
  )
}

function EmptyPanel({ title, description }) {
  return (
    <div className="empty-panel">
      <div className="empty-icon">
        <CircleDashed size={18} />
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

function EmptyAside({ title }) {
  return (
    <PanelCard title="上下文检查器" eyebrow="Inspector">
      <EmptyPanel title={title} description="左侧选中批次后，这里会展示阶段上下文与动作摘要。" />
    </PanelCard>
  )
}

function StatusDot({ tone, label }) {
  return (
    <span className={`status-dot tone-${tone}`}>
      <i />
      <span>{label}</span>
    </span>
  )
}

function SelectionList({ items, selectedId, onSelect, renderItem, empty = null, ariaLabel }) {
  const refs = useRef([])
  refs.current = []

  if (!items.length) return empty

  function focusIndex(index) {
    refs.current[index]?.focus()
  }

  return (
    <div className="selection-list" role="listbox" aria-label={ariaLabel}>
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(node) => {
            refs.current[index] = node
          }}
          type="button"
          className={`queue-row ${selectedId === item.id ? 'is-selected' : ''}`}
          aria-selected={selectedId === item.id}
          onClick={() => onSelect(item.id)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              const nextIndex = Math.min(index + 1, items.length - 1)
              onSelect(items[nextIndex].id)
              focusIndex(nextIndex)
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              const nextIndex = Math.max(index - 1, 0)
              onSelect(items[nextIndex].id)
              focusIndex(nextIndex)
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              onSelect(item.id)
            }
          }}
        >
          {renderItem(item)}
        </button>
      ))}
    </div>
  )
}

function OptionGrid({ label, value, options, onChange }) {
  return (
    <div className="option-grid-row">
      <span>{label}</span>
      <div className="option-grid">
        {options.map(([nextValue, nextLabel]) => (
          <button
            key={nextValue}
            type="button"
            className={`option-chip ${value === nextValue ? 'is-active' : ''}`}
            onClick={() => onChange(nextValue)}
          >
            {nextLabel}
          </button>
        ))}
      </div>
    </div>
  )
}

function ToggleChecklist({ value, onChange }) {
  return (
    <div className="toggle-list">
      {[
        ['missingContentId', '跳过缺内容 ID'],
        ['missingAccount', '跳过缺账号'],
        ['ambiguous', '跳过歧义'],
        ['complete', '跳过已完整']
      ].map(([key, label]) => (
        <label key={key} className="toggle-line">
          <input
            type="checkbox"
            checked={Boolean(value[key])}
            onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  )
}

function InspectorList({ rows }) {
  return (
    <dl className="inspector-list">
      {rows.map(([label, value]) => (
        <div key={label} className="inspector-row">
          <dt>{label}</dt>
          <dd>{value || '-'}</dd>
        </div>
      ))}
    </dl>
  )
}

function ArtifactLinks({ result }) {
  const entries = [
    ['结果 JSON', result?.artifacts?.resultUrl],
    ['网络日志', result?.artifacts?.networkLogUrl],
    ['汇总截图', result?.screenshots?.summaryUrl],
    ['原始截图', result?.screenshots?.rawUrl]
  ].filter((item) => item[1])

  if (!entries.length) return null

  return (
    <div className="artifact-list">
      {entries.map(([label, href]) => (
        <a key={label} href={href} target="_blank" rel="noreferrer">
          {label}
        </a>
      ))}
    </div>
  )
}

function MutedMeta({ children }) {
  return <p className="muted-meta">{children}</p>
}

function SkeletonRows({ count }) {
  return (
    <div className="skeleton-group" aria-hidden="true">
      {Array.from({ length: count }, (_item, index) => (
        <div key={index} className="skeleton-row" />
      ))}
    </div>
  )
}

function BootScreen() {
  return (
    <div className="boot-screen">
      <div className="boot-card">
        <LoaderCircle className="spin" size={22} />
        <div>
          <strong>正在进入批次运营台</strong>
          <p>加载最近批次、账号资产和当前运行状态。</p>
        </div>
      </div>
    </div>
  )
}

function LoginGate({ loading, error, onSubmit }) {
  const [password, setPassword] = useState('')
  return (
    <div className="boot-screen">
      <div className="wizard-panel panel-card login-panel">
        <span className="eyebrow">Tool Access</span>
        <h1>进入批次运营台</h1>
        <p>如果服务启用了工具口令，这里会先做一次轻量认证。</p>
        <Field label="工具口令">
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        <button className="primary-button" type="button" onClick={() => onSubmit(password)} disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={16} /> : <LogIn size={16} />}
          <span>登录</span>
        </button>
        {error ? <InlinePanel tone="danger" title="登录失败" description={error} /> : null}
      </div>
    </div>
  )
}

function useBatchStream(batchId) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!batchId) return undefined

    const eventSource = new EventSource(`/api/streams/batches/${batchId}`)
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] })
      queryClient.invalidateQueries({ queryKey: ['coverage', batchId] })
      queryClient.invalidateQueries({ queryKey: ['rules', batchId] })
      queryClient.invalidateQueries({ queryKey: ['run', batchId] })
      queryClient.invalidateQueries({ queryKey: ['runTasks', batchId] })
      queryClient.invalidateQueries({ queryKey: ['history', batchId] })
      queryClient.invalidateQueries({ queryKey: ['accounts'] })
      queryClient.invalidateQueries({ queryKey: ['accountHealth'] })
      queryClient.invalidateQueries({ queryKey: ['batches'] })
    }

    for (const eventName of [
      'batch.updated',
      'snapshot.updated',
      'coverage.updated',
      'rules.updated',
      'run.updated',
      'task.updated',
      'account.updated'
    ]) {
      eventSource.addEventListener(eventName, invalidate)
    }

    return () => {
      eventSource.close()
    }
  }, [batchId, queryClient])
}

function useLoginSessionController({ batchId = null } = {}) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState(null)
  const [sessionId, setSessionId] = useState('')
  const [error, setError] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const createMutation = useMutation({
    mutationFn: api.createLoginSession,
    onSuccess: (payload) => {
      setSession(payload)
      setSessionId(payload.loginSessionId)
      setError('')
    },
    onError: (nextError) => {
      setError(nextError.message || '创建扫码会话失败')
    }
  })
  const submitSmsMutation = useMutation({
    mutationFn: ({ nextSessionId, code }) => api.submitSmsCode(nextSessionId, code),
    onError: (nextError) => {
      setError(nextError.message || '验证码提交失败')
    }
  })

  useEffect(() => {
    if (!sessionId) return undefined
    if (['LOGGED_IN', 'FAILED', 'EXPIRED'].includes(session?.status)) return undefined

    const timer = window.setInterval(async () => {
      try {
        const payload = await api.getLoginSession(sessionId)
        setSession(payload)
        if (payload.status === 'LOGGED_IN') {
          queryClient.invalidateQueries({ queryKey: ['accounts'] })
          queryClient.invalidateQueries({ queryKey: ['accountHealth'] })
          queryClient.invalidateQueries({ queryKey: ['batches'] })
          if (batchId) {
            queryClient.invalidateQueries({ queryKey: ['batch', batchId] })
            queryClient.invalidateQueries({ queryKey: ['coverage', batchId] })
          }
        }
      } catch (nextError) {
        setError(nextError.message || '扫码会话刷新失败')
        window.clearInterval(timer)
      }
    }, 2000)

    return () => window.clearInterval(timer)
  }, [sessionId, session?.status, queryClient, batchId])

  return {
    session,
    error,
    smsCode,
    setSmsCode,
    creating: createMutation.isPending,
    submittingSms: submitSmsMutation.isPending,
    startSession: () => createMutation.mutate(),
    submitSms: () => {
      if (!sessionId || !smsCode) return
      submitSmsMutation.mutate({ nextSessionId: sessionId, code: smsCode })
    }
  }
}

function buildBatchPrimaryAction({
  stage,
  batch,
  onInspect,
  onCreateSession,
  onGenerateCoverage,
  onSaveRules,
  onStartRun,
  onRetryFailed,
  onRetrySync,
  onNavigateIntake,
  inspectBusy,
  accountBusy,
  coverageBusy,
  rulesBusy,
  runBusy
}) {
  if (stage === 'intake') {
    return {
      label: '锁定并检查交接表',
      onClick: onInspect,
      helper: '保存目标并生成最新快照',
      busy: inspectBusy
    }
  }
  if (stage === 'accounts') {
    return {
      label: '新增账号',
      onClick: onCreateSession,
      helper: '持续补足当前批次可用账号',
      busy: accountBusy
    }
  }
  if (stage === 'coverage') {
    return {
      label: '生成可执行范围',
      onClick: onGenerateCoverage,
      helper: '重新计算分桶与账号绑定',
      busy: coverageBusy
    }
  }
  if (stage === 'rules') {
    return {
      label: '保存本批规则',
      onClick: onSaveRules,
      helper: '保存后运行中心才允许启动',
      busy: rulesBusy
    }
  }

  const label = batch.overview?.primaryCta?.label || '启动批量执行'
  let onClick = onStartRun
  if (label === '补跑失败项') onClick = onRetryFailed
  if (label === '继续回填') onClick = onRetrySync
  if (label === '重新检查批次') onClick = onNavigateIntake

  return {
    label,
    onClick,
    helper: '运行页默认先看运行卡和失败桶，再下钻任务详情',
    disabled: Boolean(batch.overview?.primaryCta?.disabled),
    busy: runBusy
  }
}

function buildHeartbeat(batch) {
  if (!batch) return null
  return [
    { label: '当前批次', value: batch.name, tone: toneFromBatchStatus(batch.status) },
    { label: '交接表', value: batch.target?.sheetName || '未锁定', tone: batch.latestSnapshot ? 'success' : 'warning' },
    { label: '可执行行数', value: String(batch.coverageSummary?.executable || 0), tone: (batch.coverageSummary?.executable || 0) > 0 ? 'success' : 'warning' },
    { label: 'READY 账号', value: String(batch.overview?.readyAccounts || 0), tone: (batch.overview?.readyAccounts || 0) > 0 ? 'success' : 'warning' },
    { label: '规则状态', value: batch.currentRules?.id ? '已保存' : '未保存', tone: batch.currentRules?.id ? 'success' : 'warning' },
    { label: '运行状态', value: statusLabel(batch.activeRun?.status || 'DRAFT'), tone: toneFromRunStatus(batch.activeRun?.status || 'DRAFT') },
    { label: '需处理', value: String((batch.blockers?.length || 0) + (batch.coverageSummary?.ambiguous || 0) + (batch.coverageSummary?.missingAccount || 0)), tone: ((batch.blockers?.length || 0) + (batch.coverageSummary?.ambiguous || 0) + (batch.coverageSummary?.missingAccount || 0)) > 0 ? 'danger' : 'success' }
  ]
}

function defaultRuleForm() {
  return {
    executionScope: 'ALL_EXECUTABLE',
    accountScope: 'READY_ONLY',
    skipPolicies: {
      missingContentId: true,
      missingAccount: true,
      ambiguous: true,
      complete: true
    },
    syncPolicy: 'FILL_EMPTY_ONLY',
    failurePolicy: 'KEEP_FOR_RETRY',
    concurrencyProfile: 'STANDARD'
  }
}

function stageSubtitle(stage) {
  switch (stage) {
    case 'intake':
      return '先锁定目标表，再判断它能不能进入批次。'
    case 'accounts':
      return '持续扫码接入和保活账号，让可执行范围实时抬升。'
    case 'coverage':
      return '先判断哪些行能跑，再处理缺口和歧义。'
    case 'rules':
      return '把执行策略显式化，并在保存前看到影响预览。'
    case 'run':
      return '先处理失败桶，再下钻具体任务和产物。'
    default:
      return '把这次执行沉淀成模板、历史和下一批次的起点。'
  }
}

function accountSectionSubtitle(section) {
  switch (section) {
    case 'pool':
      return '这里维护全部账号资产、健康度和最近活跃时间。'
    case 'keepalive':
      return '先按推荐名单补活，再决定是否回到批次继续推进。'
    default:
      return '单账号单内容 ID 调试，只承担验证，不承担主流程叙事。'
  }
}

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return `${date.getMonth() + 1}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatDuration(durationMs) {
  if (!durationMs || durationMs <= 0) return '未结束'
  const minutes = Math.round(durationMs / 60000)
  if (minutes < 1) return '少于 1 分钟'
  return `${minutes} 分钟`
}

function metricValue(metrics, key) {
  return String(metrics?.[key]?.value || '-')
}

function toneFromBatchStatus(status) {
  switch (status) {
    case 'COMPLETED':
      return 'success'
    case 'READY':
      return 'info'
    case 'RUNNING':
      return 'warning'
    case 'BLOCKED':
      return 'danger'
    case 'NEEDS_ATTENTION':
      return 'warning'
    default:
      return 'info'
  }
}

function toneFromPhaseStatus(status) {
  switch (status) {
    case '已完成':
      return 'success'
    case '运行中':
      return 'warning'
    case '需处理':
      return 'danger'
    case '可执行':
      return 'info'
    default:
      return 'info'
  }
}

function toneFromCoverageStatus(status) {
  switch (status) {
    case 'COMPLETE':
      return 'success'
    case 'EXECUTABLE':
      return 'info'
    case 'AMBIGUOUS':
      return 'warning'
    default:
      return 'danger'
  }
}

function toneFromAccountHealth(health) {
  switch (health) {
    case 'READY':
      return 'success'
    case 'KEEP_ALIVE':
      return 'warning'
    case 'RELOGIN':
      return 'danger'
    default:
      return 'info'
  }
}

function toneFromLoginSession(status) {
  switch (status) {
    case 'LOGGED_IN':
      return 'success'
    case 'WAITING_SMS':
      return 'warning'
    case 'FAILED':
    case 'EXPIRED':
      return 'danger'
    default:
      return 'info'
  }
}

function toneFromRunStatus(status) {
  switch (status) {
    case 'SUCCEEDED':
      return 'success'
    case 'FAILED':
    case 'PARTIAL_FAILED':
      return 'danger'
    case 'RUNNING':
    case 'QUEUED':
      return 'warning'
    default:
      return 'info'
  }
}

function toneFromRunTask(task) {
  if (task.status === 'SUCCEEDED') return 'success'
  if (task.status === 'FAILED') {
    if (String(task.errorCode || '').includes('LOGIN_REQUIRED')) return 'danger'
    if (String(task.errorCode || '').includes('SYNC') || String(task.errorCode || '').startsWith('ROW_')) return 'warning'
    return 'danger'
  }
  return 'info'
}

function toneFromBucket(bucketKey) {
  if (bucketKey === 'SUCCEEDED') return 'success'
  if (bucketKey === 'RUNNING') return 'warning'
  if (bucketKey === 'SYNC_FAILED') return 'warning'
  if (bucketKey === 'LOGIN_FAILED' || bucketKey === 'QUERY_FAILED' || bucketKey === 'BLOCKED') return 'danger'
  return 'info'
}

function statusLabel(status) {
  switch (status) {
    case 'DRAFT':
      return '未就绪'
    case 'READY':
      return '可执行'
    case 'RUNNING':
      return '运行中'
    case 'NEEDS_ATTENTION':
      return '需处理'
    case 'COMPLETED':
      return '已完成'
    case 'BLOCKED':
      return '需处理'
    case 'QUEUED':
      return '排队中'
    case 'FAILED':
      return '需处理'
    case 'PARTIAL_FAILED':
      return '需处理'
    case 'SUCCEEDED':
      return '已完成'
    default:
      return status || '-'
  }
}

function coverageLabel(status) {
  switch (status) {
    case 'EXECUTABLE':
      return '可执行'
    case 'MISSING_CONTENT_ID':
      return '缺内容 ID'
    case 'MISSING_ACCOUNT':
      return '缺账号'
    case 'AMBIGUOUS':
      return '歧义'
    case 'COMPLETE':
      return '已完整'
    default:
      return status
  }
}

function loginSessionLabel(status) {
  switch (status) {
    case 'WAITING_QR':
      return '等待扫码'
    case 'WAITING_CONFIRM':
      return '等待确认'
    case 'WAITING_SMS':
      return '等待短信'
    case 'LOGGED_IN':
      return '已登录'
    case 'FAILED':
      return '登录失败'
    case 'EXPIRED':
      return '二维码过期'
    default:
      return status || '待处理'
  }
}

function runTaskLabel(task) {
  if (task.status === 'SUCCEEDED') return '已完成'
  if (task.status === 'QUERYING') return '查询中'
  if (task.status === 'SYNCING') return '回填中'
  if (task.status === 'QUEUED') return '排队中'
  if (String(task.errorCode || '').includes('LOGIN_REQUIRED')) return '等待重登'
  if (String(task.errorCode || '').includes('SYNC') || String(task.errorCode || '').startsWith('ROW_')) return '回填失败'
  return '查询失败'
}

function shellTabClass(isActive) {
  return `shell-tab ${isActive ? 'is-active' : ''}`
}

function batchLinkClass(isActive, isCurrentBatch) {
  return `batch-link ${(isActive || isCurrentBatch) ? 'is-active' : ''}`
}
