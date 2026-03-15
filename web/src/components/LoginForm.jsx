import { useState } from 'react'

export function LoginForm({ loading, error, onSubmit }) {
  const [password, setPassword] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    await onSubmit(password)
  }

  return (
    <div className="panel auth-card">
      <div className="panel-header auth-card-header">
        <span className="section-eyebrow">访问控制</span>
        <h1>Guanghe</h1>
        <p>输入工具口令后，才能管理账号、发起查询和推进批量任务。</p>
      </div>
      <div className="auth-card-meta" aria-hidden="true">
        <span className="auth-card-meta-chip">批量闭环</span>
        <span className="auth-card-meta-chip">账号管理</span>
        <span className="auth-card-meta-chip">桌面控制台</span>
      </div>
      <form className="stack-md" onSubmit={handleSubmit}>
        <label className="field">
          <span>工具口令</span>
          <input
            autoFocus
            type="password"
            placeholder="请输入访问口令"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? <div className="inline-error">{error}</div> : null}
        <button className="primary-btn" type="submit" disabled={loading || !password.trim()}>
          {loading ? '登录中...' : '登录工具'}
        </button>
      </form>
      <p className="auth-card-footnote">当前状态：认证后进入桌面工作台。下一步：输入口令开始使用。</p>
    </div>
  )
}
