import { useState } from 'react'
import { buildFallbackAvatar, formatAccountStatus, formatDateTime } from '../lib/ui'

export function AccountList({ accounts, selectedAccountId, loading, onSelect, onCreate, onDelete, sheetDemands, matchLoading, onMatchSheet, batchQuerying, onBatchQuery, queryProgress }) {
  const [menuOpenId, setMenuOpenId] = useState('')

  const getMatchBadge = (account) => {
    if (!sheetDemands) return null
    const reqNick = (account.nickname || '').trim().toLowerCase()
    const match = sheetDemands.find(d => d.normalizedNickname === reqNick)
    
    if (!match) return <span className="status-pill status-neutral" style={{ fontSize: '0.7em', marginTop: '4px' }}>不在交接表</span>
    if (match.status === 'COMPLETE') return <span className="status-pill status-success" style={{ fontSize: '0.7em', marginTop: '4px' }}>表内 (已填完)</span>
    if (match.status === 'NEEDS_FILL') return <span className="status-pill status-warning" style={{ fontSize: '0.7em', marginTop: '4px' }}>表内 (缺数据, {match.contentId})</span>
    if (match.status === 'CONTENT_ID_MISSING') return <span className="status-pill status-danger" style={{ fontSize: '0.7em', marginTop: '4px' }}>表内 (缺内容 ID)</span>
    return <span className="status-pill status-info" style={{ fontSize: '0.7em', marginTop: '4px' }}>表内 ({match.status})</span>
  }

  return (
    <section className="panel sidebar-panel stack-md">
      <div className="sidebar-panel-header">
        <div>
          <h2>账号侧栏</h2>
          <p>从这里切换账号，右侧查询区会自动跟随当前账号。</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button className="primary-btn" type="button" onClick={onCreate} disabled={loading}>
              {loading ? '创建中...' : '新增账号'}
            </button>
            <button className="secondary-btn" type="button" onClick={onMatchSheet} disabled={matchLoading || batchQuerying}>
              {matchLoading ? '匹配中...' : '匹配交接表'}
            </button>
            {sheetDemands && (
                <button className="primary-btn" type="button" onClick={onBatchQuery} disabled={batchQuerying || matchLoading}>
                {batchQuerying ? '跑批填表中...' : '一键查询填表'}
                </button>
            )}
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="sidebar-empty-card">
          <strong>还没有已保存账号</strong>
          <p>先新增一个光合账号，后续就能直接切换并查询。</p>
          <button className="secondary-btn" type="button" onClick={onCreate}>立即扫码登录</button>
        </div>
      ) : (
        <div className="account-list">
          {accounts.map((account) => {
            const selected = account.accountId === selectedAccountId
            const isMenuOpen = menuOpenId === account.accountId
            const progress = queryProgress?.[account.accountId]
            
            return (
              <article key={account.accountId} className={`account-card ${selected ? 'selected' : ''}`}>
                <button
                  type="button"
                  className="account-select"
                  onClick={() => {
                    setMenuOpenId('')
                    onSelect(account.accountId)
                  }}
                >
                  <img src={buildFallbackAvatar(account.nickname, account.avatar)} alt={account.nickname} />
                  <div className="account-copy">
                    <div className="account-title-row">
                      <strong className="account-name">{account.nickname || '未命名账号'}</strong>
                      <span className={`status-pill status-${account.status === 'READY' ? 'success' : 'warning'}`}>
                        {formatAccountStatus(account.status)}
                      </span>
                    </div>
                    {getMatchBadge(account)}
                    {progress && (
                        <div className={`account-meta`} style={{ color: progress.status === 'failed' ? '#ff4d4f' : '#1677ff', marginTop: '4px' }}>
                            {progress.status === 'loading' ? '⌛ ' : progress.status === 'success' ? '✅ ' : '❌ '}
                            {progress.message}
                        </div>
                    )}
                    <div className="account-meta" style={{ marginTop: '8px' }}>账号 ID：{account.accountId}</div>
                    <div className="account-meta">最近登录：{formatDateTime(account.lastLoginAt)}</div>
                  </div>
                </button>

                <div className="account-card-menu-wrap">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`更多操作-${account.accountId}`}
                    onClick={() => setMenuOpenId(isMenuOpen ? '' : account.accountId)}
                  >
                    ⋯
                  </button>
                  {isMenuOpen ? (
                    <div className="popover-menu">
                      <button
                        type="button"
                        className="danger-menu-item"
                        onClick={() => {
                          setMenuOpenId('')
                          onDelete(account.accountId)
                        }}
                      >
                        删除账号
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
