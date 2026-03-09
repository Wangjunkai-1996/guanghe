import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { LoginForm } from './components/LoginForm'
import { AccountList } from './components/AccountList'
import { BatchTasksWorkspace } from './components/BatchTasksWorkspace'
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
  const [isManualWorkspaceOpen, setIsManualWorkspaceOpen] = useState(false)

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

  const loadAccounts = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setAccountsLoading(true)
    try {
      const payload = await api.listAccounts()
      const nextAccounts = payload.accounts || []
      setAccounts(nextAccounts)
      setSelectedAccountId((current) => {
        if (current && nextAccounts.some((account) => account.accountId === current)) return current
        return nextAccounts[0]?.accountId || ''
      })
    } finally {
      if (!silent) setAccountsLoading(false)
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
            await loadAccounts({ silent: true })
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
    if (!authenticated) return undefined
    const timer = window.setInterval(() => {
      void loadAccounts({ silent: true })
    }, 10000)
    return () => window.clearInterval(timer)
  }, [authenticated, loadAccounts])

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
    if (!loginSession || isLoginDrawerOpen || !isManualWorkspaceOpen) return null
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
  }, [handleCreateLoginSession, isLoginDrawerOpen, isManualWorkspaceOpen, loginSession])

  const manualEntryStatus = useMemo(() => {
    if (!loginSession) return null
    if (loginSession.status === 'LOGGED_IN') return null
    return formatLoginStatus(loginSession.status)
  }, [loginSession])

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
      <header className="panel workspace-hero">
        <div className="workspace-hero-copy">
          <span className="section-eyebrow">主流程优先</span>
          <h1>光合平台查询工作台</h1>
          <p>首页只保留批量发码和任务跟进主路径；账号补查下沉为次级入口，用于临时校对、补查和新增账号。</p>
        </div>

        <div className="workspace-hero-actions">
          <div className="workspace-summary-chip">
            <span>已保存账号</span>
            <strong>{accounts.length}</strong>
          </div>
          <div className="workspace-summary-chip wide">
            <span>手动补查当前账号</span>
            <strong>{activeAccount?.nickname || '未选择'}</strong>
            <small>{activeAccount?.accountId || '需要时再展开次级入口'}</small>
          </div>
          <button className="secondary-btn" type="button" onClick={() => setIsManualWorkspaceOpen((current) => !current)}>
            {isManualWorkspaceOpen ? '收起账号补查' : '打开账号补查'}
          </button>
        </div>
      </header>

      <BatchTasksWorkspace />

      <section className={`panel manual-entry-strip ${isManualWorkspaceOpen ? 'open' : ''}`}>
        <div className="manual-entry-bar">
          <div className="compact-panel-header">
            <h2>账号查询（次级入口）</h2>
            <p>仅在需要补查单个账号、手动扫码新增账号或校对批量任务结果时使用，不干扰主工作台。</p>
          </div>
          <div className="manual-entry-actions">
            {manualEntryStatus ? <span className="status-pill status-info">{manualEntryStatus}</span> : null}
            <button className="secondary-btn" type="button" onClick={() => setIsManualWorkspaceOpen((current) => !current)}>
              {isManualWorkspaceOpen ? '收起账号查询' : '展开账号查询'}
            </button>
          </div>
        </div>

        {isManualWorkspaceOpen ? (
          <div className="manual-query-shell stack-lg">
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

            <div className="workspace-layout manual-workspace-layout">
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
          </div>
        ) : null}
      </section>

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
