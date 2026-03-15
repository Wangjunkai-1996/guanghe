import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, SearchCheck, Sparkles, Users } from 'lucide-react'
import { api } from '../api'
import { AccountList } from './AccountList'
import { QueryForm } from './QueryForm'
import { ResultPanel } from './ResultPanel'
import { formatLoginStatus } from '../lib/ui'
import { useToastQueue } from '../hooks/useToastQueue'
import { InlineNotice } from './ui/InlineNotice'

const ConfirmDialog = lazy(() =>
  import('./ui/ConfirmDialog').then((module) => ({ default: module.ConfirmDialog }))
)
const ToastViewport = lazy(() =>
  import('./ui/ToastViewport').then((module) => ({ default: module.ToastViewport }))
)

const LOGIN_SESSION_PENDING_STATUSES = ['WAITING_QR', 'WAITING_CONFIRM', 'WAITING_SMS']

export function ManualWorkspace({
  accounts,
  accountsLoading,
  hasLoadedAccounts = false,
  selectedAccountId,
  setSelectedAccountId,
  activeAccount,
  ensureAccountsLoaded = async () => accounts,
  loginSession,
  isLoginDrawerOpen,
  setIsLoginDrawerOpen,
  handleCreateLoginSession,
  handleDeleteAccount,
  onRequestBatchTab
}) {
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryResult, setQueryResult] = useState(null)
  const [queryError, setQueryError] = useState(null)
  const [accountInventoryReady, setAccountInventoryReady] = useState(() => hasLoadedAccounts || accounts.length > 0)
  const { toasts, pushToast, removeToast } = useToastQueue()

  useEffect(() => {
    let cancelled = false

    const loadInventory = async () => {
      try {
        await ensureAccountsLoaded()
      } finally {
        if (!cancelled) {
          setAccountInventoryReady(true)
        }
      }
    }

    void loadInventory()

    return () => {
      cancelled = true
    }
  }, [ensureAccountsLoaded])

  useEffect(() => {
    if (hasLoadedAccounts) {
      setAccountInventoryReady(true)
    }
  }, [hasLoadedAccounts])

  const handleQuery = async ({ contentId }) => {
    if (!activeAccount?.accountId) return
    setQueryLoading(true)
    setQueryError(null)
    try {
      const payload = await api.queryContent({ accountId: activeAccount.accountId, contentId })
      setQueryResult(payload)
    } catch (error) {
      setQueryError(error)
    } finally {
      setQueryLoading(false)
    }
  }

  const [accountDeleteState, setAccountDeleteState] = useState({ open: false, accountId: '', label: '', loading: false })

  const handleConfirmDeleteAccount = async () => {
    if (!accountDeleteState.accountId) {
      setAccountDeleteState({ open: false, accountId: '', label: '', loading: false })
      return
    }

    setAccountDeleteState((current) => ({ ...current, loading: true }))
    try {
      await handleDeleteAccount(accountDeleteState.accountId)
      setQueryResult(null)
      setQueryError(null)
      pushToast('success', `${accountDeleteState.label || accountDeleteState.accountId} 已从本地账号库移除。`)
      setAccountDeleteState({ open: false, accountId: '', label: '', loading: false })
    } catch (error) {
      pushToast('danger', error.message || '删除账号失败，请稍后重试。')
      setAccountDeleteState({ open: false, accountId: '', label: '', loading: false })
    }
  }

  const activeLoginBanner = useMemo(() => {
    if (!loginSession || isLoginDrawerOpen) return null
    if (loginSession.status === 'LOGGED_IN') return null
    if (LOGIN_SESSION_PENDING_STATUSES.includes(loginSession.status)) {
      return {
        tone: 'info',
        title: `新增账号进行中：${formatLoginStatus(loginSession.status)}`,
        description: '扫码和手机确认完成后，账号会自动写入左侧账号库。',
        actionLabel: '查看扫码抽屉',
        action: () => setIsLoginDrawerOpen(true)
      }
    }
    if (loginSession.status === 'EXPIRED') {
      return {
        tone: 'warning',
        title: '二维码已过期，可直接刷新后继续扫码。',
        description: '重新生成二维码后，登录抽屉会继续跟踪当前登录流程。',
        actionLabel: '刷新二维码',
        action: handleCreateLoginSession
      }
    }
    if (loginSession.status === 'FAILED') {
      return {
        tone: 'danger',
        title: loginSession.error || '登录失败，请重新生成二维码。',
        description: '建议重新生成二维码并再次扫码，必要时检查手机端确认流程。',
        actionLabel: '重新生成二维码',
        action: handleCreateLoginSession
      }
    }
    return null
  }, [handleCreateLoginSession, isLoginDrawerOpen, loginSession, setIsLoginDrawerOpen])

  const manualEntryStatus = useMemo(() => {
    if (!loginSession) return null
    if (loginSession.status === 'LOGGED_IN') return null
    return formatLoginStatus(loginSession.status)
  }, [loginSession])

  const isAccountInventoryPending = !accountInventoryReady && !hasLoadedAccounts

  return (
    <>
      {toasts.length ? (
        <Suspense fallback={null}>
          <ToastViewport toasts={toasts} onDismiss={removeToast} />
        </Suspense>
      ) : null}

      <section className="panel manual-workspace-vnext stack-lg">
        <div className="manual-workspace-header">
          <div>
            <span className="section-eyebrow">Account Admin</span>
            <h2>账号管理</h2>
            <p>这是辅助工作区，只负责账号维护、单条查询和结果复核。</p>
          </div>
          <button className="secondary-btn" type="button" onClick={onRequestBatchTab}>
            <ArrowUpRight size={18} aria-hidden="true" />
            <span>前往批量闭环</span>
          </button>
        </div>

        {isAccountInventoryPending ? (
          <InlineNotice
            tone="info"
            eyebrow="账号库按需加载"
            icon={Users}
            title="账号库正在按需加载"
            description="首次进入账号管理时再读取账号库，避免批量页首屏被账号资源阻塞。"
          />
        ) : null}

        {activeLoginBanner ? (
          <InlineNotice
            tone={activeLoginBanner.tone}
            eyebrow="登录流程提示"
            icon={Sparkles}
            title={activeLoginBanner.title}
            description={activeLoginBanner.description}
            actionLabel={activeLoginBanner.actionLabel}
            onAction={activeLoginBanner.action}
          />
        ) : null}

        <div className="manual-vnext-layout">
          <aside className="manual-vnext-sidebar">
            <AccountList
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              loading={accountsLoading}
              onSelect={setSelectedAccountId}
              onCreate={handleCreateLoginSession}
              onDelete={(accountId) => {
                const targetAccount = accounts.find((account) => account.accountId === accountId)
                setAccountDeleteState({
                  open: true,
                  accountId,
                  label: targetAccount?.nickname || accountId,
                  loading: false
                })
              }}
            />
          </aside>

          <main className="manual-vnext-main stack-lg">
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
      </section>

      {accountDeleteState.open ? (
        <Suspense fallback={null}>
          <ConfirmDialog
            open={accountDeleteState.open}
            tone="warning"
            title="确认删除账号"
            description={`删除后将移除账号 ${accountDeleteState.label} 的本地登录记录，后续需要重新扫码登录。`}
            confirmLabel="删除账号"
            cancelLabel="暂不删除"
            loading={accountDeleteState.loading}
            onConfirm={handleConfirmDeleteAccount}
            onCancel={() => setAccountDeleteState({ open: false, accountId: '', label: '', loading: false })}
          />
        </Suspense>
      ) : null}
    </>
  )
}
