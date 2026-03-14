import { Suspense, lazy, useEffect, useState } from 'react'
import { api } from './api'
import { LoginForm } from './components/LoginForm'
import { PageHeader } from './components/ui/PageHeader'
import { DashboardIcon } from './components/ui/ShellIcons'
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

export default function App() {
  const [booting, setBooting] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  const [activeTab, setActiveTab] = useState('batch')

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
      ; (async () => {
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
  }, [loadAccounts])

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

  const workspaceTabs = [
    {
      key: 'batch',
      label: '批量任务与交接表闭环',
      tabId: 'workspace-tab-batch',
      panelId: 'workspace-panel-batch'
    },
    {
      key: 'account',
      label: '账号管理与单条查询',
      tabId: 'workspace-tab-account',
      panelId: 'workspace-panel-account'
    }
  ]

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="品牌运营控制台"
        badge="Brand Ops"
        icon={DashboardIcon}
        title="光合品牌运营工作台"
        description="围绕腾讯交接表闭环、达人扫码任务和单条内容验证建立统一运营控制台，突出首页层级、状态主线与执行节奏。"
        actions={(
          <div className="page-header-action-cluster">
            <div className="page-header-status-strip">
              <span className="page-header-status-pill">
                当前聚焦：{activeTab === 'batch' ? '批量执行链路' : '账号与单条验证'}
              </span>
              <span className="page-header-status-pill subtle">
                两个工作台共用同一套状态反馈与交互规范
              </span>
            </div>
            <div className="tabs-switcher workspace-segmented-control" role="tablist" aria-label="工作台标签">
            {workspaceTabs.map((tab) => {
              return (
                <button
                  key={tab.key}
                  type="button"
                  id={tab.tabId}
                  role="tab"
                  aria-controls={tab.panelId}
                  aria-selected={activeTab === tab.key}
                  tabIndex={activeTab === tab.key ? 0 : -1}
                  className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <span>{tab.label}</span>
                </button>
              )
            })}
            </div>
          </div>
        )}
        stats={[
          {
            label: '当前模式',
            value: activeTab === 'batch' ? '批量闭环' : '单条验证',
            detail: activeTab === 'batch' ? '腾讯文档驱动工作流' : '账号库与单次验证',
            tone: 'accent',
            emphasis: 'hero'
          },
          {
            label: '已保存账号',
            value: hasLoadedAccounts ? String(accounts.length) : '待载入',
            detail: activeAccount?.nickname
              ? `当前账号：${activeAccount.nickname}`
              : (hasLoadedAccounts ? '可随时切换账号' : '首次切到手工页时再加载账号库'),
            tone: 'info'
          }
        ]}
      />

      <main className="stack-lg">
        {workspaceTabs.map((tab) => {
          if (tab.key !== activeTab) return null

          return (
            <section
              key={tab.key}
              id={tab.panelId}
              role="tabpanel"
              aria-labelledby={tab.tabId}
              className="stack-lg"
            >
              <Suspense
                fallback={(
                  <WorkspaceModuleFallback
                    title={tab.key === 'batch' ? '正在载入批量闭环工作台' : '正在载入账号与单条查询工作台'}
                    description={tab.key === 'batch'
                      ? '批量任务区已拆分为独立模块，正在准备任务队列与交接表界面。'
                      : '手工工作台已拆分为独立模块，正在准备账号库、查询条与结果舞台。'}
                  />
                )}
              >
                {tab.key === 'account' ? (
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
                    onRequestBatchTab={() => setActiveTab('batch')}
                  />
                ) : (
                  <BatchTasksWorkspace />
                )}
              </Suspense>
            </section>
          )
        })}
      </main>

      {(loginSession || isLoginDrawerOpen) ? (
        <Suspense
          fallback={(
            <WorkspaceModuleFallback
              title="正在载入登录抽屉"
              description="扫码登录面板已拆分为按需模块，正在准备二维码与步骤轨道。"
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
    </div>
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
