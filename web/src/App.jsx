import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { DatabaseZap, FileSpreadsheet, SearchCheck, Workflow } from 'lucide-react'
import { api } from './api'
import { LoginForm } from './components/LoginForm'
import { AppShell } from './components/ui/AppShell'
import { formatTencentDocsLoginStatus, getTencentDocsLoginTone } from './lib/ui'
import { useAccounts } from './hooks/useAccounts'
import { useLoginSession } from './hooks/useLoginSession'

const BatchTasksWorkspace = lazy(() =>
  import('./components/BatchTasksWorkspace').then((module) => ({ default: module.BatchTasksWorkspace }))
)
const ManualWorkspace = lazy(() =>
  import('./components/ManualWorkspace').then((module) => ({ default: module.ManualWorkspace }))
)
const LoginSessionPanel = lazy(() =>
  import('./components/LoginSessionPanel').then((module) => ({ default: module.LoginSessionPanel }))
)

const WORKSPACES = [
  {
    key: 'batch',
    label: '批量闭环',
    shortLabel: '任务指挥台',
    description: '交接表驱动的发码、查数与回填闭环',
    eyebrow: 'Batch Control',
    title: '批量任务控制台',
    intro: '围绕交接表目标、缺数达人和二维码队列组织批量执行节奏，优先保证闭环效率和异常可见性。',
    icon: Workflow
  },
  {
    key: 'manual',
    label: '账号查询',
    shortLabel: '验证工作台',
    description: '账号库维护与单条内容即时验证',
    eyebrow: 'Manual Verify',
    title: '账号与单条验证',
    intro: '用更轻的画布完成账号维护、内容 ID 校验和结果复核，把单条查询收成一条清晰主线。',
    icon: SearchCheck
  }
]

export default function App() {
  const [booting, setBooting] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [activeWorkspace, setActiveWorkspace] = useState('batch')
  const [shellDocsStatus, setShellDocsStatus] = useState({
    loading: true,
    available: false,
    status: 'IDLE',
    updatedAt: '',
    error: ''
  })

  const {
    accounts,
    accountsLoading,
    selectedAccountId,
    setSelectedAccountId,
    activeAccount,
    loadAccounts,
    hasLoadedAccounts,
    ensureAccountsLoaded,
    deleteAccount
  } = useAccounts()

  const {
    loginSession,
    isLoginDrawerOpen,
    setIsLoginDrawerOpen,
    createLoginSession
  } = useLoginSession({
    onLoginSuccess: async (session) => {
      await loadAccounts({ silent: true })
      if (session.account?.accountId) {
        setSelectedAccountId(session.account.accountId)
      }
    }
  })

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const payload = await api.me()
        if (cancelled) return
        setAuthenticated(Boolean(payload.authenticated))
      } catch (_error) {
        if (!cancelled) setAuthenticated(false)
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!authenticated) return undefined

    let cancelled = false

    ;(async () => {
      try {
        const payload = await api.getTencentDocsConfig()
        if (cancelled) return
        setShellDocsStatus({
          loading: false,
          available: true,
          status: payload?.login?.status || 'IDLE',
          updatedAt: payload?.login?.updatedAt || '',
          error: ''
        })
      } catch (error) {
        if (cancelled) return
        setShellDocsStatus({
          loading: false,
          available: false,
          status: 'IDLE',
          updatedAt: '',
          error: error.message || '腾讯文档状态暂不可用'
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authenticated, activeWorkspace])

  const handleLogin = async (password) => {
    setAuthLoading(true)
    setAuthError('')
    try {
      await api.login(password)
      setAuthenticated(true)
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleCreateLoginSession = async () => {
    await createLoginSession()
  }

  const handleDeleteAccount = async (accountId) => {
    await deleteAccount(accountId)
  }

  const activeWorkspaceMeta = useMemo(
    () => WORKSPACES.find((workspace) => workspace.key === activeWorkspace) || WORKSPACES[0],
    [activeWorkspace]
  )

  const shellStatusItems = useMemo(() => {
    const accountValue = hasLoadedAccounts ? String(accounts.length) : '按需加载'
    const accountDetail = activeAccount?.nickname
      ? `当前账号：${activeAccount.nickname}`
      : (hasLoadedAccounts ? '切到账号查询后可直接开始验证' : '账号库会在进入验证页后按需载入')

    const docsValue = shellDocsStatus.loading
      ? '同步中'
      : (shellDocsStatus.available ? formatTencentDocsLoginStatus(shellDocsStatus.status) : '未接入')
    const docsDetail = shellDocsStatus.error
      ? shellDocsStatus.error
      : (shellDocsStatus.updatedAt ? `最近同步 ${shellDocsStatus.updatedAt.slice(0, 16).replace('T', ' ')}` : '在批量闭环页可继续检查登录态')

    return [
      {
        label: '账号库',
        value: accountValue,
        detail: accountDetail,
        icon: DatabaseZap,
        tone: hasLoadedAccounts ? 'info' : 'neutral',
        badge: hasLoadedAccounts ? 'Ready' : 'Lazy'
      },
      {
        label: '腾讯文档',
        value: docsValue,
        detail: docsDetail,
        icon: FileSpreadsheet,
        tone: shellDocsStatus.available ? getTencentDocsLoginTone(shellDocsStatus.status) : 'neutral',
        badge: shellDocsStatus.available ? 'Sync' : 'Idle'
      }
    ]
  }, [accounts.length, activeAccount?.nickname, hasLoadedAccounts, shellDocsStatus])

  if (booting) {
    return <div className="page-shell centered">加载中...</div>
  }

  if (!authenticated) {
    return (
      <div className="page-shell centered auth-shell">
        <LoginForm loading={authLoading} error={authError} onSubmit={handleLogin} />
      </div>
    )
  }

  return (
    <>
      <AppShell
        brandTitle="光合平台工作台"
        brandDescription="把批量闭环、账号验证与文档回填收成一个更有产品感的运营控制台。"
        workspaces={WORKSPACES}
        activeWorkspace={activeWorkspace}
        onSelectWorkspace={setActiveWorkspace}
        statusItems={shellStatusItems}
      >
        <div className="app-shell-canvas stack-lg">
          <section className="panel workspace-overview">
            <div className="workspace-overview-copy">
              <span className="section-eyebrow">{activeWorkspaceMeta.eyebrow}</span>
              <h1>{activeWorkspaceMeta.title}</h1>
              <p>{activeWorkspaceMeta.intro}</p>
            </div>
            <div className="workspace-overview-meta">
              <span className="workspace-overview-chip">
                当前焦点
                <strong>{activeWorkspaceMeta.shortLabel}</strong>
              </span>
              <span className="workspace-overview-chip subtle">
                视觉方向
                <strong>浅色科技感</strong>
              </span>
            </div>
          </section>

          <main className="workspace-view">
            <Suspense
              fallback={(
                <WorkspaceModuleFallback
                  title={activeWorkspace === 'batch' ? '正在载入批量闭环模块' : '正在载入账号验证模块'}
                  description={activeWorkspace === 'batch'
                    ? '正在准备任务指挥台、交接表控制区和详情画布。'
                    : '正在准备账号轨道、验证命令条和结果舞台。'}
                />
              )}
            >
              {activeWorkspace === 'manual' ? (
                <ManualWorkspace
                  accounts={accounts}
                  accountsLoading={accountsLoading}
                  selectedAccountId={selectedAccountId}
                  setSelectedAccountId={setSelectedAccountId}
                  activeAccount={activeAccount}
                  hasLoadedAccounts={hasLoadedAccounts}
                  ensureAccountsLoaded={ensureAccountsLoaded}
                  loginSession={loginSession}
                  isLoginDrawerOpen={isLoginDrawerOpen}
                  setIsLoginDrawerOpen={setIsLoginDrawerOpen}
                  handleCreateLoginSession={handleCreateLoginSession}
                  handleDeleteAccount={handleDeleteAccount}
                  onRequestBatchTab={() => setActiveWorkspace('batch')}
                />
              ) : (
                <BatchTasksWorkspace />
              )}
            </Suspense>
          </main>
        </div>
      </AppShell>

      {(loginSession || isLoginDrawerOpen) ? (
        <Suspense
          fallback={(
            <WorkspaceModuleFallback
              title="正在载入登录抽屉"
              description="正在准备二维码、步骤轨道和短信验证面板。"
              compact
            />
          )}
        >
          <LoginSessionPanel
            loginSession={loginSession}
            qrCodeDataUrl={loginSession?.qrImageUrl || ''}
            isOpen={isLoginDrawerOpen}
            onClose={() => setIsLoginDrawerOpen(false)}
            onRefresh={handleCreateLoginSession}
            onSubmitSmsCode={async (code) => {
              if (!loginSession?.loginSessionId) return
              await api.submitSmsCode(loginSession.loginSessionId, code)
            }}
          />
        </Suspense>
      ) : null}
    </>
  )
}

function WorkspaceModuleFallback({ title, description, compact = false }) {
  return (
    <div
      className={`workspace-module-fallback${compact ? ' compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <span className="section-eyebrow">模块载入中</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}
