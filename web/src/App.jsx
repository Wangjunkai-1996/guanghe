import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { LoginForm } from './components/LoginForm'
import { AccountList } from './components/AccountList'
import { LoginSessionPanel } from './components/LoginSessionPanel'
import { QueryForm } from './components/QueryForm'
import { ResultPanel } from './components/ResultPanel'
import { formatLoginStatus } from './lib/ui'

const LOGIN_SESSION_FINAL_STATUSES = ['LOGGED_IN', 'EXPIRED', 'FAILED']
const LOGIN_SESSION_PENDING_STATUSES = ['WAITING_QR', 'WAITING_CONFIRM']

export default function App() {
  const [booting, setBooting] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')

  const [accounts, setAccounts] = useState([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState('')

  const [loginSession, setLoginSession] = useState(null)
  const [isLoginDrawerOpen, setIsLoginDrawerOpen] = useState(false)
  const loginPollingRef = useRef(null)
  const loginSuccessCloseTimerRef = useRef(null)

  const [queryLoading, setQueryLoading] = useState(false)
  const [queryResult, setQueryResult] = useState(null)
  const [queryError, setQueryError] = useState(null)

  const activeAccount = useMemo(
    () => accounts.find((account) => account.accountId === selectedAccountId) || null,
    [accounts, selectedAccountId]
  )

  const stopPolling = useCallback(() => {
    if (loginPollingRef.current) {
      window.clearInterval(loginPollingRef.current)
      loginPollingRef.current = null
    }
  }, [])

  const clearLoginSuccessTimer = useCallback(() => {
    if (loginSuccessCloseTimerRef.current) {
      window.clearTimeout(loginSuccessCloseTimerRef.current)
      loginSuccessCloseTimerRef.current = null
    }
  }, [])

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const payload = await api.listAccounts()
      const nextAccounts = payload.accounts || []
      setAccounts(nextAccounts)
      setSelectedAccountId((current) => {
        if (current && nextAccounts.some((account) => account.accountId === current)) return current
        return nextAccounts[0]?.accountId || ''
      })
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  const startLoginSessionPolling = useCallback((loginSessionId) => {
    stopPolling()
    loginPollingRef.current = window.setInterval(async () => {
      try {
        const next = await api.getLoginSession(loginSessionId)
        setLoginSession(next)
        if (LOGIN_SESSION_FINAL_STATUSES.includes(next.status)) {
          stopPolling()
          if (next.status === 'LOGGED_IN') {
            await loadAccounts()
            if (next.account?.accountId) {
              setSelectedAccountId(next.account.accountId)
            }
          }
        }
      } catch (_error) {
        stopPolling()
      }
    }, 2000)
  }, [loadAccounts, stopPolling])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
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
      stopPolling()
      clearLoginSuccessTimer()
    }
  }, [clearLoginSuccessTimer, loadAccounts, stopPolling])

  useEffect(() => {
    clearLoginSuccessTimer()
    if (loginSession?.status === 'LOGGED_IN') {
      loginSuccessCloseTimerRef.current = window.setTimeout(() => {
        setIsLoginDrawerOpen(false)
      }, 2000)
    }
  }, [clearLoginSuccessTimer, loginSession])

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
    clearLoginSuccessTimer()
    stopPolling()
    setQueryError(null)
    setIsLoginDrawerOpen(true)
    const payload = await api.createLoginSession()
    setLoginSession(payload)
    startLoginSessionPolling(payload.loginSessionId)
  }

  const handleDeleteAccount = async (accountId) => {
    const confirmed = window.confirm(`确认删除账号 ${accountId} 吗？`)
    if (!confirmed) return

    await api.deleteAccount(accountId)
    setQueryResult(null)
    setQueryError(null)
    if (selectedAccountId === accountId) {
      setSelectedAccountId('')
    }
    await loadAccounts()
  }

  const handleQuery = async ({ contentId }) => {
    if (!activeAccount?.accountId) return
    setQueryLoading(true)
    setQueryError(null)
    setQueryResult(null)
    try {
      const payload = await api.queryContent({ accountId: activeAccount.accountId, contentId })
      setQueryResult(payload)
    } catch (error) {
      setQueryError(error)
    } finally {
      setQueryLoading(false)
    }
  }

  const activeLoginBanner = useMemo(() => {
    if (!loginSession || isLoginDrawerOpen) return null
    if (loginSession.status === 'LOGGED_IN') return null
    if (LOGIN_SESSION_PENDING_STATUSES.includes(loginSession.status)) {
      return {
        tone: 'info',
        title: `新增账号进行中：${formatLoginStatus(loginSession.status)}`,
        actionLabel: '查看扫码抽屉',
        action: () => setIsLoginDrawerOpen(true)
      }
    }
    if (loginSession.status === 'EXPIRED') {
      return {
        tone: 'warning',
        title: '二维码已过期，可直接刷新后继续扫码。',
        actionLabel: '刷新二维码',
        action: handleCreateLoginSession
      }
    }
    if (loginSession.status === 'FAILED') {
      return {
        tone: 'danger',
        title: loginSession.error || '登录失败，请重新生成二维码。',
        actionLabel: '重新生成二维码',
        action: handleCreateLoginSession
      }
    }
    return null
  }, [handleCreateLoginSession, isLoginDrawerOpen, loginSession])

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
      <header className="workspace-header panel">
        <div className="workspace-header-copy">
          <h1>光合平台查询工作台</h1>
          <p>固定查询近 30 日、固定 5 个指标，支持多账号保存与快速切换。</p>
        </div>
        <div className="workspace-header-stats">
          <div className="header-stat-card">
            <span>当前账号</span>
            <strong>{activeAccount?.nickname || '未选择'}</strong>
            <small>{activeAccount?.accountId || '请先从左侧选择账号'}</small>
          </div>
          <div className="header-stat-card">
            <span>已保存账号</span>
            <strong>{accounts.length}</strong>
            <small>内部桌面工具模式</small>
          </div>
        </div>
      </header>

      <div className="workspace-layout">
        <aside className="workspace-sidebar">
          <AccountList
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            loading={accountsLoading}
            onSelect={setSelectedAccountId}
            onCreate={handleCreateLoginSession}
            onDelete={handleDeleteAccount}
          />
        </aside>

        <main className="workspace-main stack-lg">
          {activeLoginBanner ? (
            <div className={`status-banner tone-${activeLoginBanner.tone}`}>
              <div>
                <strong>{activeLoginBanner.title}</strong>
              </div>
              <button className="secondary-btn" type="button" onClick={activeLoginBanner.action}>
                {activeLoginBanner.actionLabel}
              </button>
            </div>
          ) : null}

          <QueryForm
            activeAccount={activeAccount}
            loading={queryLoading}
            onSubmit={handleQuery}
          />

          <ResultPanel
            result={queryResult}
            error={queryError}
            loading={queryLoading}
            activeAccount={activeAccount}
            onRetryLogin={handleCreateLoginSession}
          />
        </main>
      </div>

      <LoginSessionPanel
        loginSession={loginSession}
        qrCodeDataUrl={loginSession?.qrImageUrl || ''}
        isOpen={isLoginDrawerOpen}
        onClose={() => setIsLoginDrawerOpen(false)}
        onRefresh={handleCreateLoginSession}
      />
    </div>
  )
}
