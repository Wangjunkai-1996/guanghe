import { useMemo, useState } from 'react'

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
    <section className="panel query-toolbar-panel">
      <div className="query-toolbar-copy">
        <h2>查询工具条</h2>
        <p>{helperText}</p>
      </div>

      <form className="query-toolbar" onSubmit={handleSubmit}>
        <div className="current-account-chip">
          <span className="chip-label">当前账号</span>
          <strong>{activeAccount?.nickname || '未选择账号'}</strong>
          <small>{activeAccount?.accountId || '请先在左侧选择'}</small>
        </div>

        <label className="field query-input-field">
          <span>内容 ID</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="例如：554608495125"
            value={contentId}
            onChange={handleChange}
          />
        </label>

        <button className="primary-btn query-submit-btn" type="submit" disabled={loading || !canSubmit}>
          {loading ? '查询中...' : '开始查询'}
        </button>
      </form>

      {loading ? <div className="query-processing-hint">正在查询并生成截图…</div> : null}
    </section>
  )
}
