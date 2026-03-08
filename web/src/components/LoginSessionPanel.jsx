import { buildFallbackAvatar, formatLoginStatus } from '../lib/ui'

const STEP_LABELS = ['等待扫码', '等待手机确认', '登录成功']

export function LoginSessionPanel({ loginSession, qrCodeDataUrl, isOpen, onClose, onRefresh }) {
  if (!loginSession) return null

  const tone = getTone(loginSession.status)

  return (
    <div className={`drawer-root ${isOpen ? 'open' : ''}`} aria-hidden={!isOpen}>
      <button className="drawer-backdrop" type="button" onClick={onClose} aria-label="关闭登录抽屉" />
      <aside className="drawer-panel">
        <div className="drawer-header">
          <div>
            <h2>新增账号扫码登录</h2>
            <p>请使用淘宝扫码，并在手机上确认登录。</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭抽屉">×</button>
        </div>

        <div className="drawer-stepper">
          {STEP_LABELS.map((label, index) => {
            const state = getStepState(loginSession.status, index)
            return (
              <div key={label} className={`drawer-step ${state}`}>
                <span>{index + 1}</span>
                <strong>{label}</strong>
              </div>
            )
          })}
        </div>

        <div className={`drawer-status-card tone-${tone}`}>
          <div>
            <span className="status-card-label">当前状态</span>
            <strong>{formatLoginStatus(loginSession.status)}</strong>
          </div>
          <div className="status-card-meta">会话 ID：{loginSession.loginSessionId}</div>
          {loginSession.error ? <div className="status-card-error">{loginSession.error}</div> : null}
        </div>

        {loginSession.status === 'LOGGED_IN' ? (
          <div className="login-success-card">
            <img src={buildFallbackAvatar(loginSession.account?.nickname, loginSession.account?.avatar)} alt={loginSession.account?.nickname || '已登录账号'} />
            <div>
              <strong>{loginSession.account?.nickname || '已登录账号'}</strong>
              <div>账号 ID：{loginSession.account?.accountId || '-'}</div>
              <div>登录成功后 2 秒自动收起抽屉</div>
            </div>
          </div>
        ) : (
          <div className="drawer-qr-card">
            <div className="qr-wrap drawer-qr-wrap">
              {qrCodeDataUrl ? <img className="qr-image" src={qrCodeDataUrl} alt="登录二维码" /> : <div className="qr-placeholder">二维码生成中...</div>}
            </div>
            <div className="drawer-helper-text">
              <strong>操作提示</strong>
              <p>如果二维码过期或登录失败，直接点击下方按钮刷新即可，无需离开页面。</p>
            </div>
          </div>
        )}

        <div className="drawer-actions">
          {loginSession.status !== 'LOGGED_IN' ? (
            <button className="secondary-btn" type="button" onClick={onRefresh}>
              {loginSession.status === 'EXPIRED' ? '刷新二维码' : '重新生成二维码'}
            </button>
          ) : null}
          <button className="secondary-btn" type="button" onClick={onClose}>收起抽屉</button>
        </div>
      </aside>
    </div>
  )
}

function getTone(status) {
  if (status === 'LOGGED_IN') return 'success'
  if (status === 'EXPIRED') return 'warning'
  if (status === 'FAILED') return 'danger'
  return 'info'
}

function getStepState(status, index) {
  if (status === 'FAILED' || status === 'EXPIRED') return index === 0 ? 'active' : 'idle'
  if (status === 'WAITING_QR') return index === 0 ? 'active' : 'idle'
  if (status === 'WAITING_CONFIRM') {
    if (index === 0) return 'done'
    if (index === 1) return 'active'
    return 'idle'
  }
  if (status === 'LOGGED_IN') {
    if (index < 2) return 'done'
    return 'active'
  }
  return 'idle'
}
