import { useState } from 'react'
import { buildFallbackAvatar, formatAccountStatus, formatDateTime } from '../lib/ui'

export function AccountList({ accounts, selectedAccountId, loading, onSelect, onCreate, onDelete }) {
  const [menuOpenId, setMenuOpenId] = useState('')

  return (
    <section className="panel sidebar-panel stack-md">
      <div className="sidebar-panel-header">
        <div>
          <h2>账号侧栏</h2>
          <p>从这里切换账号，右侧查询区会自动跟随当前账号。</p>
        </div>
        <button className="primary-btn" type="button" onClick={onCreate} disabled={loading}>
          {loading ? '创建中...' : '新增账号扫码登录'}
        </button>
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
                    <div className="account-meta">账号 ID：{account.accountId}</div>
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
