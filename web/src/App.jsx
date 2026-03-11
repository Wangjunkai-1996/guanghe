import { useEffect, useState } from 'react'
import { api } from './api'
import { LoginForm } from './components/LoginForm'
import { BatchTasksWorkspace } from './components/BatchTasksWorkspace'
import { LoginSessionPanel } from './components/LoginSessionPanel'
import { ManualWorkspace } from './components/ManualWorkspace'
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

  useEffect(() => {
    const handleSwitch = () => setActiveTab('batch')
    window.addEventListener('switch-to-batch-tasks', handleSwitch)
    return () => window.removeEventListener('switch-to-batch-tasks', handleSwitch)
  }, [])

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

  return (
    <div className="workspace-page">
      <header className="panel workspace-hero" style={{ marginBottom: '24px' }}>
        <div className="workspace-hero-copy" style={{ marginBottom: '16px' }}>
          <span className="section-eyebrow">多账号管理</span>
          <h1>光合平台工作台</h1>
        </div>

        <div className="tabs-switcher">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'batch' ? 'active' : ''}`}
            onClick={() => setActiveTab('batch')}
          >
            批量任务与交接表闭环
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            账号管理与单条查询
          </button>
        </div>
      </header>

      {activeTab === 'account' ? (
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
        />
      ) : (
        <BatchTasksWorkspace />
      )}

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
