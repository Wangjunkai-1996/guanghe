import { useMemo, useState } from 'react'
import { ArrowRight, Hash, LoaderCircle, SearchCheck, UserRound } from 'lucide-react'
import { CommandBar } from './ui/CommandBar'

export function QueryForm({ activeAccount, loading, onSubmit }) {
  const [contentId, setContentId] = useState('')
  const [inputHint, setInputHint] = useState('')

  const canSubmit = Boolean(activeAccount?.accountId && contentId)
  const helperText = useMemo(() => {
    if (!activeAccount?.accountId) return '先在左侧选择账号，或新增账号后再发起验证。'
    return '固定查询近 30 日的 5 个主 KPI，并同步生成汇总图与原始截图。'
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
    <CommandBar
      className="query-command-bar"
      eyebrow="验证命令条"
      title="单条内容验证"
      description={helperText}
      meta={(
        <div className="query-command-meta">
          <span className="query-command-chip">
            <UserRound size={16} aria-hidden="true" />
            <span>当前账号</span>
            <strong>{activeAccount?.nickname || '未选择'}</strong>
          </span>
          <small>{activeAccount?.accountId || '请先在左侧选择可用账号'}</small>
        </div>
      )}
    >
      <form className="query-command-strip" onSubmit={handleSubmit}>
        <label className="field query-input-field query-command-field">
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

      <p className={`query-toolbar-helper-note ${inputHint ? 'tone-warning' : ''}`}>
        {inputHint || '主 KPI 会优先展示在结果舞台，次要信息收纳到折叠区中。'}
      </p>
    </CommandBar>
  )
}
