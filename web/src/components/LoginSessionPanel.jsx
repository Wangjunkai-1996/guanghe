import { useState } from 'react'
import { buildFallbackAvatar, formatLoginStatus } from '../lib/ui'

const STEP_LABELS = ['等待扫码', '等待手机确认', '短信验证', '登录成功']

export function LoginSessionPanel({ loginSession, qrCodeDataUrl, isOpen, onClose, onRefresh, onSubmitSmsCode }) {
  const [smsCode, setSmsCode] = useState('')
  const [smsSubmitting, setSmsSubmitting] = useState(false)
  const [smsError, setSmsError] = useState('')

  if (!loginSession) return null

  const tone = getTone(loginSession.status)

  async function handleSmsSubmit() {
    if (!smsCode.trim()) return
    setSmsSubmitting(true)
    setSmsError('')
    try {
      await onSubmitSmsCode(smsCode.trim())
      setSmsCode('')
    } catch (e) {
      setSmsError(e.message || '提交失败，请重试')
    } finally {
      setSmsSubmitting(false)
    }
  }

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
        ) : loginSession.status === 'WAITING_SMS' ? (
          <div className="drawer-sms-card">
            <div className="drawer-helper-text">
              <strong>需要手机验证码</strong>
              <p>检测到风控验证，请查收手机短信，输入验证码后继续登录。</p>
            </div>
            <div className="sms-input-row">
              <input
                className="sms-input"
                type="text"
                maxLength={8}
                placeholder="请输入短信验证码"
                value={smsCode}
                onChange={e => setSmsCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSmsSubmit()}
                disabled={smsSubmitting}
              />
              <button
                className="primary-btn"
                type="button"
                onClick={handleSmsSubmit}
                disabled={smsSubmitting || !smsCode.trim()}
              >
                {smsSubmitting ? '提交中...' : '提交验证码'}
              </button>
            </div>
            {smsError ? <div className="status-card-error">{smsError}</div> : null}
          </div>
        ) : (
          <div className="drawer-qr-card">
            <div className={`qr-wrap drawer-qr-wrap ${loginSession.status !== 'WAITING_QR' ? 'full-preview' : ''}`}>
              {qrCodeDataUrl ? (
                <img className="qr-image" src={qrCodeDataUrl} alt="登录视图" style={loginSession.status !== 'WAITING_QR' ? { objectFit: 'contain', width: '100%' } : {}} />
              ) : (
                <div className="qr-placeholder">视图加载中...</div>
              )}
            </div>
            <div className="drawer-helper-text">
              <strong>后台实时监控</strong>
              <p>
                {loginSession.status === 'WAITING_QR' 
                  ? '请使用淘宝 App 扫码。' 
                  : '正在观察后台页面变化，如有验证码请在下方输入。'}
              </p>
            </div>
          </div>
        )}

        <div className="drawer-actions">
          {loginSession.status !== 'LOGGED_IN' && loginSession.status !== 'WAITING_SMS' ? (
            <button className="secondary-btn" type="button" onClick={onRefresh}>
              {loginSession.status === 'EXPIRED' ? '刷新二维码' : '重新生成二维码'}
            </button>
          ) : null}
          <button className="secondary-btn" type="button" onClick={onClose}>收起抽屉</button>
        </div>
        
        <div className="drawer-footer-note" style={{ fontSize: '11px', color: '#999', padding: '12px 24px', textAlign: 'center' }}>
          提示：如需查看更详细的后台界面，可设置 <code style={{ background: '#eee', padding: '2px 4px' }}>SHOW_BROWSER=true</code> 启动。
        </div>
      </aside>
    </div>
  )
}

function getTone(status) {
  if (status === 'LOGGED_IN') return 'success'
  if (status === 'EXPIRED') return 'warning'
  if (status === 'FAILED') return 'danger'
  if (status === 'WAITING_SMS') return 'warning'
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
  if (status === 'WAITING_SMS') {
    if (index < 2) return 'done'
    if (index === 2) return 'active'
    return 'idle'
  }
  if (status === 'LOGGED_IN') {
    if (index < 3) return 'done'
    return 'active'
  }
  return 'idle'
}
