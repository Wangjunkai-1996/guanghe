import { useMemo, useState } from 'react'
import { ArrowRight, Hash, LoaderCircle, UserRound } from 'lucide-react'

export function QueryForm({ activeAccount, loading, onSubmit }) {
  const [contentId, setContentId] = useState('')
  const [inputHint, setInputHint] = useState('')

  const canSubmit = Boolean(activeAccount?.accountId && contentId)
  const helperText = useMemo(() => {
    if (!activeAccount?.accountId) return '先从账号列表选择一个账号。'
    return '会保留最近一次结果，并在刷新时局部显示加载状态。'
  }, [activeAccount?.accountId])

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
    <section className="panel manual-query-bar stack-sm">
      <div className="manual-query-bar-header">
        <div>
          <span className="section-eyebrow">Command Bar</span>
          <h3>选账号，输 ID，直接看结论</h3>
        </div>
        <div className="manual-query-account-pill">
          <UserRound size={16} aria-hidden="true" />
          <span>当前账号</span>
          <strong>{activeAccount?.nickname || '未选择'}</strong>
        </div>
      </div>

      <form className="manual-query-inline" onSubmit={handleSubmit}>
        <label className="field manual-query-inline-field">
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

        <div className={`manual-query-inline-hint ${inputHint ? 'tone-warning' : ''}`} aria-live="polite">
          {loading ? (
            <>
              <LoaderCircle size={16} aria-hidden="true" className="spinning-icon" />
              <span>正在查询，上一条结果会继续保留。</span>
            </>
          ) : (
            <span>{inputHint || helperText}</span>
          )}
        </div>

        <button className="primary-btn query-submit-btn" type="submit" disabled={loading || !canSubmit}>
          {loading ? <LoaderCircle size={18} aria-hidden="true" className="spinning-icon" /> : <ArrowRight size={18} aria-hidden="true" />}
          <span>{loading ? '查询中...' : '开始查询'}</span>
        </button>
      </form>
    </section>
  )
}
