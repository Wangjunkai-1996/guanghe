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

      <section className="panel manual-entry-strip stack-lg">
        <div className="manual-entry-bar">
          <div className="compact-panel-header">
            <div className="manual-entry-kicker">
              <SearchCheck size={18} aria-hidden="true" />
              <span className="section-eyebrow">手工验证工作台</span>
            </div>
            <h2>账号库与单条查询</h2>
            <p>管理所有授权的光合账号，或者输入单条内容 ID 进行即时的数据验证。</p>
          </div>
          <div className="manual-entry-actions">
            <button className="secondary-btn" type="button" onClick={onRequestBatchTab}>
              <ArrowUpRight size={18} aria-hidden="true" />
              <span>前往批量闭环</span>
            </button>
            <div className="workspace-summary-chip">
              <span>
                <Users size={16} aria-hidden="true" />
                <span>已保存账号</span>
              </span>
              <strong>{isAccountInventoryPending ? '...' : accounts.length}</strong>
              <small>
                {manualEntryStatus
                  ? '当前仍有登录流程进行中'
                  : (isAccountInventoryPending ? '首次进入手工页后按需加载账号库' : '单条查询与账号切换都可在这里完成')}
              </small>
            </div>
          </div>
        </div>

        <div className="manual-query-shell stack-lg">
          {isAccountInventoryPending ? (
            <InlineNotice
              tone="info"
              eyebrow="账号库按需加载"
              icon={Users}
              title="手工页正在读取账号库"
              description="默认首屏优先给批量闭环工作台让路；当你首次切到这里时，账号资源会按需加载，当前布局会保持稳定不闪空。"
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

          <div className="workspace-layout manual-workspace-layout">
            <aside className="workspace-sidebar">
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
