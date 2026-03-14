import { useState } from 'react'
import { buildFallbackAvatar, formatAccountStatus, formatDateTime } from '../lib/ui'
import { EmptyState } from './ui/EmptyState'
import { SectionCard } from './ui/SectionCard'
import { StatusBadge } from './ui/StatusBadge'

export function AccountList({ accounts, selectedAccountId, loading, onSelect, onCreate, onDelete }) {
  const [menuOpenId, setMenuOpenId] = useState('')

  return (
    <SectionCard className="sidebar-panel stack-md">
      <div className="sidebar-panel-header">
        <div>
          <h2>账号侧栏</h2>
          <p>这里只保留账号管理与切换；交接表匹配和批量下发已经回到批量工作台处理。</p>
        </div>
        <div className="account-list-actions">
          <button className="primary-btn" type="button" onClick={onCreate} disabled={loading}>
            {loading ? '创建中...' : '新增账号'}
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          className="sidebar-empty-card"
          title="还没有已保存账号"
          description="先新增一个光合账号，后续就能直接切换并查询。"
          actionLabel="立即扫码登录"
          onAction={onCreate}
        />
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
                      <StatusBadge tone={account.status === 'READY' ? 'success' : 'warning'}>
                        {formatAccountStatus(account.status)}
                      </StatusBadge>
                    </div>
                    <div className="account-meta account-meta-spaced">账号 ID：{account.accountId}</div>
                    <div className="account-meta">最近登录：{formatDateTime(account.lastLoginAt)}</div>
                  </div>
                </button>

                <div className="account-card-menu-wrap">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`${account.nickname || account.accountId} 更多操作`}
                    aria-haspopup="menu"
                    aria-expanded={isMenuOpen}
                    aria-controls={isMenuOpen ? `account-menu-${account.accountId}` : undefined}
                    onClick={() => setMenuOpenId(isMenuOpen ? '' : account.accountId)}
                  >
                    ⋯
                  </button>
                  {isMenuOpen ? (
                    <div className="popover-menu" role="menu" id={`account-menu-${account.accountId}`} aria-label={`${account.nickname || account.accountId} 操作菜单`}>
                      <button
                        type="button"
                        className="danger-menu-item"
                        role="menuitem"
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
    </SectionCard>
  )
}
