import { useState } from 'react'

export function LoginForm({ loading, error, onSubmit }) {
  const [password, setPassword] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    await onSubmit(password)
  }

  return (
    <div className="panel auth-card">
      <div className="panel-header">
        <h1>光合平台查询工具</h1>
        <p>输入工具口令后，才能管理账号和发起查询。</p>
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
    </div>
  )
}
