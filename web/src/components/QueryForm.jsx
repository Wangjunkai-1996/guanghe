import { useMemo, useState } from 'react'
import { ArrowRight, BadgeInfo, Hash, LoaderCircle, SearchCheck, UserRound } from 'lucide-react'
import { SectionCard } from './ui/SectionCard'
import { StatusBadge } from './ui/StatusBadge'

export function QueryForm({ activeAccount, loading, onSubmit }) {
  const [contentId, setContentId] = useState('')
  const [inputHint, setInputHint] = useState('')

  const canSubmit = Boolean(activeAccount?.accountId && contentId)
  const helperText = useMemo(() => {
    if (!activeAccount?.accountId) return '请先在左侧选择账号，或新增账号扫码登录。'
    if (inputHint) return inputHint
    return '固定查询近 30 日的 5 个指标，并同步生成原始截图和汇总截图。'
  }, [activeAccount?.accountId, inputHint])

  const handleChange = (event) => {
    const rawValue = event.target.value
    const sanitized = rawValue.replace(/\D+/g, '')
    setContentId(sanitized)
    setInputHint(rawValue !== sanitized ? '仅支持数字内容 ID，已自动过滤非数字字符。' : '')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!activeAccount?.accountId) {
      setInputHint('请先选择一个可用账号。')
      return
    }
    if (!contentId) {
      setInputHint('请输入数字内容 ID。')
      return
    }
    await onSubmit({ contentId })
  }

  return (
    <SectionCard className="query-toolbar-panel" variant="feature">
      <div className="query-toolbar-copy">
        <div className="query-toolbar-kicker">
          <SearchCheck size={18} aria-hidden="true" />
          <span className="section-eyebrow">查询控制台条</span>
        </div>
        <h2>查询工具条</h2>
        <p>{helperText}</p>
      </div>

      <form className="query-toolbar" onSubmit={handleSubmit}>
        <div className="current-account-chip">
          <span className="chip-label">
            <UserRound size={16} aria-hidden="true" />
            <span>当前账号</span>
          </span>
          <strong>{activeAccount?.nickname || '未选择账号'}</strong>
          <small>{activeAccount?.accountId || '请先在左侧选择'}</small>
        </div>

        <label className="field query-input-field">
          <span className="query-input-label">
            <Hash size={16} aria-hidden="true" />
            <span>内容 ID</span>
          </span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="例如：554608495125"
            value={contentId}
            onChange={handleChange}
          />
        </label>

        <button className="primary-btn query-submit-btn" type="submit" disabled={loading || !canSubmit}>
          {loading ? <LoaderCircle size={18} aria-hidden="true" className="spinning-icon" /> : <ArrowRight size={18} aria-hidden="true" />}
          <span>{loading ? '查询中...' : '开始查询'}</span>
        </button>
      </form>

      {loading ? (
        <div className="query-processing-hint" aria-live="polite">
          <LoaderCircle size={16} aria-hidden="true" className="spinning-icon" />
          <span>正在查询并生成截图…</span>
        </div>
      ) : null}

      {!loading && !inputHint ? (
        <StatusBadge tone={inputHint ? 'warning' : 'info'} emphasis="glass" icon={BadgeInfo}>
          固定查询近 30 日主 KPI，并同步生成原图与汇总图。
        </StatusBadge>
      ) : null}
    </SectionCard>
  )
}
