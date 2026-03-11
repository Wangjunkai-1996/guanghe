import { useMemo, useState } from 'react'
import { api } from '../api'
import { AccountList } from './AccountList'
import { QueryForm } from './QueryForm'
import { ResultPanel } from './ResultPanel'
import { formatLoginStatus } from '../lib/ui'

const LOGIN_SESSION_PENDING_STATUSES = ['WAITING_QR', 'WAITING_CONFIRM', 'WAITING_SMS']

export function ManualWorkspace({
    accounts,
    accountsLoading,
    selectedAccountId,
    setSelectedAccountId,
    activeAccount,
    loginSession,
    isLoginDrawerOpen,
    setIsLoginDrawerOpen,
    handleCreateLoginSession,
    handleDeleteAccount
}) {
    const [queryLoading, setQueryLoading] = useState(false)
    const [queryResult, setQueryResult] = useState(null)
    const [queryError, setQueryError] = useState(null)

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

    const [matchLoading, setMatchLoading] = useState(false)
    const [sheetDemands, setSheetDemands] = useState(null)
    const [sheetTarget, setSheetTarget] = useState(null)
    const [batchQuerying, setBatchQuerying] = useState(false)
    const [queryProgress, setQueryProgress] = useState({})

    const handleMatchSheet = async () => {
        try {
            setMatchLoading(true)
            const configPayload = await api.getTencentDocsConfig()
            if (!configPayload.defaultTargetConfigured) {
                alert('请先在"批量任务"标签页中配置默认的腾讯文档链接和工作表名称')
                return
            }
            setSheetTarget(configPayload.target)
            const payload = await api.inspectTencentDocsSheet({ target: configPayload.target, maxRows: 200, forceRefresh: true })
            setSheetDemands(payload.demands || [])
        } catch (error) {
            alert(error.message || '匹配失败')
        } finally {
            setMatchLoading(false)
        }
    }

    const handleBatchQuery = async () => {
        if (!sheetDemands || !sheetTarget) return
        
        const accountsToQuery = accounts.filter(acc => {
            const reqNick = (acc.nickname || '').trim().toLowerCase()
            const match = sheetDemands.find(d => d.normalizedNickname === reqNick)
            return match && match.status === 'NEEDS_FILL' && acc.status === 'READY'
        })

        if (accountsToQuery.length === 0) {
            alert('当前没有需要在交接表中自动填表的可查询账号（必须在表中、缺数据、且账号状态可用）。')
            return
        }

        if (!window.confirm(`找到 ${accountsToQuery.length} 个账号需要自动查询并填表，是否开始？\n这将会为每个账号在"批量任务"中创建跟踪任务。`)) {
            return
        }

        setBatchQuerying(true)

        try {
            await api.createSheetDemandTaskFromAccounts({
                accountIds: accountsToQuery.map(a => a.accountId),
                sheetTarget
            })
            window.alert('任务下发成功！即将切换到"批量任务"中进行进度查看。')
            // trigger custom event to switch tabs in parent component
            window.dispatchEvent(new CustomEvent('switch-to-batch-tasks'))
        } catch (error) {
            alert(error.message || '操作失败')
        } finally {
            setBatchQuerying(false)
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

    const manualEntryStatus = useMemo(() => {
        if (!loginSession) return null
        if (loginSession.status === 'LOGGED_IN') return null
        return formatLoginStatus(loginSession.status)
    }, [loginSession])

    return (
        <section className="panel manual-entry-strip open">
            <div className="manual-entry-bar">
                <div className="compact-panel-header">
                    <h2>账号库与单条查询</h2>
                    <p>管理所有授权的光合账号，或者输入单条内容 ID 进行即时的数据验证。</p>
                </div>
                <div className="manual-entry-actions">
                    {manualEntryStatus ? <span className="status-pill status-info">{manualEntryStatus}</span> : null}
                    <div className="workspace-summary-chip">
                        <span>已保存账号</span>
                        <strong>{accounts.length}</strong>
                    </div>
                </div>
            </div>

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
                            onDelete={(accountId) => { handleDeleteAccount(accountId); setQueryResult(null); setQueryError(null) }}
                            sheetDemands={sheetDemands}
                            matchLoading={matchLoading}
                            onMatchSheet={handleMatchSheet}
                            batchQuerying={batchQuerying}
                            onBatchQuery={handleBatchQuery}
                            queryProgress={queryProgress}
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
    )
}
