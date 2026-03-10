import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import { LoginForm } from './components/LoginForm'
import { AccountList } from './components/AccountList'
import { BatchTasksWorkspace } from './components/BatchTasksWorkspace'
import { LoginSessionPanel } from './components/LoginSessionPanel'
import { ManualWorkspace } from './components/ManualWorkspace'
import { QueryForm } from './components/QueryForm'
import { ResultPanel } from './components/ResultPanel'
import { formatLoginStatus } from './lib/ui'
import { useAccounts } from './hooks/useAccounts'
import { useLoginSession } from './hooks/useLoginSession'

const LOGIN_SESSION_PENDING_STATUSES = ['WAITING_QR', 'WAITING_CONFIRM']

export default function App() {
  const [booting, setBooting] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [isManualWorkspaceOpen, setIsManualWorkspaceOpen] = useState(false)

  const [queryLoading, setQueryLoading] = useState(false)
  const [queryResult, setQueryResult] = useState(null)
  const [queryError, setQueryError] = useState(null)

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
    if (!authenticated) return undefined
  }, [authenticated])

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
    setQueryError(null)
    await createLoginSession()
  }

  const handleDeleteAccount = async (accountId) => {
    const deleted = await deleteAccount(accountId)
    if (deleted) {
      setQueryResult(null)
      setQueryError(null)
    }
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

      <BatchTasksWorkspace />

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
