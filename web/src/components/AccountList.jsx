import { useState } from 'react'
import { MoreHorizontal, Plus, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { buildFallbackAvatar, formatAccountStatus, formatDateTime } from '../lib/ui'
import { EmptyState } from './ui/EmptyState'
import { SectionCard } from './ui/SectionCard'
import { StatusBadge } from './ui/StatusBadge'

export function AccountList({ accounts, selectedAccountId, loading, onSelect, onCreate, onDelete }) {
  const [menuOpenId, setMenuOpenId] = useState('')

  return (
    <SectionCard
      className="account-list-panel stack-md"
      eyebrow="账号列表"
      title="切换账号与管理授权"
      description="这里只保留新增账号、切换账号和单条复核。"
      variant="feature"
      actions={(
        <button className="primary-btn" type="button" onClick={onCreate} disabled={loading}>
          <Plus size={18} aria-hidden="true" />
          <span>{loading ? '创建中...' : '新增账号'}</span>
        </button>
      )}
    >

      {accounts.length === 0 ? (
        <EmptyState
          className="sidebar-empty-card"
          eyebrow="账号资源"
          tone="neutral"
          icon={UserRound}
          title="还没有已保存账号"
          description="先新增一个可用账号，后续就能直接切换并查询。"
          actionLabel="立即扫码登录"
          onAction={onCreate}
        />
      ) : (
        <div className="account-list">
          {accounts.map((account) => {
            const selected = account.accountId === selectedAccountId
            const isMenuOpen = menuOpenId === account.accountId
            const tone = account.status === 'READY' ? 'success' : 'warning'

            return (
              <article key={account.accountId} className={`account-card compact-account-card ${selected ? 'selected' : ''}`}>
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
                      <StatusBadge tone={tone} emphasis={selected ? 'solid' : 'soft'} size="sm" icon={account.status === 'READY' ? ShieldCheck : UserRound}>
                        {formatAccountStatus(account.status)}
                      </StatusBadge>
                    </div>
                    <div className="account-meta-grid">
                      <span>{account.accountId}</span>
                      <span>最近登录 {formatDateTime(account.lastLoginAt)}</span>
                    </div>
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
                    <MoreHorizontal size={18} aria-hidden="true" />
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
                        <Trash2 size={16} aria-hidden="true" />
                        <span>删除账号</span>
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
