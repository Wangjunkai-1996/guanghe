import { useEffect, useState } from 'react'
import { api } from './api'
import { LoginForm } from './components/LoginForm'
import { BatchTasksWorkspace } from './components/BatchTasksWorkspace'
import { LoginSessionPanel } from './components/LoginSessionPanel'
import { ManualWorkspace } from './components/ManualWorkspace'
import { PageHeader } from './components/ui/PageHeader'
import { useAccounts } from './hooks/useAccounts'
import { useLoginSession } from './hooks/useLoginSession'

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
          if (payload.authenticated) {
            await loadAccounts()
          }
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
      await loadAccounts()
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
    { key: 'batch', label: '批量任务与交接表闭环', tabId: 'workspace-tab-batch', panelId: 'workspace-panel-batch' },
    { key: 'account', label: '账号管理与单条查询', tabId: 'workspace-tab-account', panelId: 'workspace-panel-account' }
  ]

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="多账号管理"
        title="光合平台工作台"
        description="围绕腾讯交接表闭环和单条内容验证建立统一工作台，后续会持续向运营控制台形态收敛。"
        actions={(
          <div className="tabs-switcher" role="tablist" aria-label="工作台标签">
            {workspaceTabs.map((tab) => (
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
                {tab.label}
              </button>
            ))}
          </div>
        )}
        stats={[
          {
            label: '当前模式',
            value: activeTab === 'batch' ? '批量闭环' : '单条查询',
            detail: activeTab === 'batch' ? '腾讯文档驱动工作流' : '账号库与单次验证'
          },
          {
            label: '已保存账号',
            value: accountsLoading ? '...' : String(accounts.length),
            detail: activeAccount?.nickname ? `当前账号：${activeAccount.nickname}` : '可随时切换账号'
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
              {tab.key === 'account' ? (
                <ManualWorkspace
                  accounts={accounts}
                  accountsLoading={accountsLoading}
                  selectedAccountId={selectedAccountId}
                  setSelectedAccountId={setSelectedAccountId}
                  activeAccount={activeAccount}
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
            </section>
          )
        })}
      </main>

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
    </div>
  )
}
