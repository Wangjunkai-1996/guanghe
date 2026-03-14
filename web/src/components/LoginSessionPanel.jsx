import { useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CircleCheckBig, QrCode, ShieldCheck, Smartphone, Sparkles, Waypoints, X } from 'lucide-react'
import { buildFallbackAvatar, formatLoginStatus } from '../lib/ui'
import { InlineNotice } from './ui/InlineNotice'
import { SectionCard } from './ui/SectionCard'
import { StatusBadge } from './ui/StatusBadge'

const STEP_LABELS = ['等待扫码', '等待手机确认', '短信验证', '登录成功']
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

export function LoginSessionPanel({
  loginSession,
  qrCodeDataUrl,
  isOpen,
  onClose,
  onRefresh,
  onSubmitSmsCode
}) {
  const [smsCode, setSmsCode] = useState('')
  const [smsSubmitting, setSmsSubmitting] = useState(false)
  const [smsError, setSmsError] = useState('')
  const titleId = useId()
  const descriptionId = useId()
  const smsInputId = useId()
  const smsHelpId = useId()
  const panelRef = useRef(null)
  const closeButtonRef = useRef(null)
  const smsInputRef = useRef(null)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    if (!loginSession || !isOpen) return

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
        return
      }

      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return

      const focusableElements = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
      if (!focusableElements.length) {
        event.preventDefault()
        panel.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey) {
        if (activeElement === firstElement || activeElement === panel) {
          event.preventDefault()
          lastElement.focus()
        }
        return
      }

      if (activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || !loginSession) return

    if (loginSession.status === 'WAITING_SMS') {
      smsInputRef.current?.focus()
      return
    }

    closeButtonRef.current?.focus()
  }, [isOpen, loginSession?.status])

  useEffect(() => {
    if (!loginSession || loginSession.status === 'WAITING_SMS') return
    setSmsCode('')
    setSmsError('')
    setSmsSubmitting(false)
  }, [loginSession?.loginSessionId, loginSession?.status])

  if (!loginSession || !isOpen) return null

  const tone = getTone(loginSession.status)
  const statusCopy = getStatusCopy(loginSession)
  const activeStepIndex = getActiveStepIndex(loginSession.status)
  const showRefreshAction = !['LOGGED_IN', 'WAITING_SMS'].includes(loginSession.status)

  async function handleSmsSubmit(event) {
    event?.preventDefault?.()
    if (!smsCode.trim() || smsSubmitting) return

    setSmsSubmitting(true)
    setSmsError('')
    try {
      await onSubmitSmsCode?.(smsCode.trim())
      setSmsCode('')
    } catch (error) {
      setSmsError(error.message || '提交失败，请重试')
    } finally {
      setSmsSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="login-drawer-root"
        initial={shouldReduceMotion ? undefined : { opacity: 0 }}
        animate={shouldReduceMotion ? undefined : { opacity: 1 }}
        exit={shouldReduceMotion ? undefined : { opacity: 0 }}
      >
        <button
          className="login-drawer-backdrop"
          type="button"
          onClick={onClose}
          aria-label="关闭登录抽屉"
        />

        <motion.aside
          ref={panelRef}
          className="login-drawer-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={-1}
          initial={shouldReduceMotion ? undefined : { x: 48, opacity: 0 }}
          animate={shouldReduceMotion ? undefined : { x: 0, opacity: 1 }}
          exit={shouldReduceMotion ? undefined : { x: 48, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0, 0.2, 1] }}
        >
        <header className="login-drawer-header">
          <div className="login-drawer-title-block">
            <div className="login-drawer-brandline">
              <div className="login-drawer-brandmark">
                <Waypoints size={18} aria-hidden="true" />
              </div>
              <span className="section-eyebrow">新增账号</span>
              <span className="page-header-badge">Login Flow</span>
            </div>
            <div className="login-drawer-title-row">
              <h2 id={titleId}>扫码登录淘宝账号</h2>
              <StatusBadge tone={tone}>{formatLoginStatus(loginSession.status)}</StatusBadge>
            </div>
            <p id={descriptionId}>{statusCopy.description}</p>
          </div>

          <button
            ref={closeButtonRef}
            className="icon-btn"
            type="button"
            onClick={onClose}
            aria-label="关闭抽屉"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <main className="login-drawer-body">
          <SectionCard as="section" className={`login-drawer-overview tone-${tone}`}>
            <div className="login-drawer-overview-header">
              <div className="login-drawer-overview-copy">
                <span className="login-drawer-caption">当前状态</span>
                <strong>{statusCopy.title}</strong>
                <p>{statusCopy.summary}</p>
              </div>
              <div className="login-drawer-live-region" role="status" aria-live="polite" aria-atomic="true">
                当前状态：{formatLoginStatus(loginSession.status)}
              </div>
            </div>

            <dl className="login-drawer-meta-grid">
              <div className="login-drawer-meta-item">
                <dt>当前步骤</dt>
                <dd>{STEP_LABELS[activeStepIndex]}</dd>
              </div>
              <div className="login-drawer-meta-item">
                <dt>下一步</dt>
                <dd>{statusCopy.nextAction}</dd>
              </div>
              <div className="login-drawer-meta-item">
                <dt>会话 ID</dt>
                <dd className="login-drawer-session-id">{loginSession.loginSessionId}</dd>
              </div>
            </dl>

            {loginSession.error ? (
              <InlineNotice
                tone="danger"
                title="登录流程返回异常"
                description={loginSession.error}
                className="login-drawer-inline-notice"
              />
            ) : null}
          </SectionCard>

          <SectionCard as="section" className="login-drawer-flow-card">
            <div className="login-drawer-section-header">
              <h3>登录流程</h3>
              <p>颜色、文案和步骤状态同步提示当前所处阶段，避免只靠截图判断。</p>
            </div>

            <ol className="login-drawer-stepper" aria-label="登录进度">
              {STEP_LABELS.map((label, index) => {
                const state = getStepState(loginSession.status, index)
                const StepIcon = getStepIcon(index)
                return (
                  <li
                    key={label}
                    className={`login-drawer-step is-${state}`}
                    aria-current={state === 'active' ? 'step' : undefined}
                  >
                    <span className="login-drawer-step-index" aria-hidden="true">
                      <StepIcon size={16} aria-hidden="true" />
                    </span>
                    <div className="login-drawer-step-copy">
                      <strong>{label}</strong>
                      <span>{getStepDescription(state)}</span>
                    </div>
                    <StatusBadge tone={getStepTone(state)} size="sm">
                      {getStepLabel(state)}
                    </StatusBadge>
                  </li>
                )
              })}
            </ol>
          </SectionCard>

          {renderStage({
            loginSession,
            qrCodeDataUrl,
            smsCode,
            smsError,
            smsHelpId,
            smsInputId,
            smsInputRef,
            smsSubmitting,
            handleSmsSubmit,
            setSmsCode
          })}
        </main>

        <footer className="login-drawer-footer">
          <div className="login-drawer-actions">
            {showRefreshAction ? (
              <button className="secondary-btn" type="button" onClick={onRefresh}>
                <QrCode size={18} aria-hidden="true" />
                <span>{loginSession.status === 'EXPIRED' ? '刷新二维码' : '重新生成二维码'}</span>
              </button>
            ) : null}
            <button className="secondary-btn" type="button" onClick={onClose}>
              收起抽屉
            </button>
          </div>

          <p className="login-drawer-footer-note">
            提示：如需查看更详细的后台界面，可设置{' '}
            <code className="login-drawer-footer-code">SHOW_BROWSER=true</code>
            {' '}启动。
          </p>
        </footer>
        </motion.aside>
      </motion.div>
    </AnimatePresence>
  )
}

function renderStage({
  loginSession,
  qrCodeDataUrl,
  smsCode,
  smsError,
  smsHelpId,
  smsInputId,
  smsInputRef,
  smsSubmitting,
  handleSmsSubmit,
  setSmsCode
}) {
  if (loginSession.status === 'LOGGED_IN') {
    return (
      <SectionCard as="section" className="login-drawer-stage-card">
        <div className="login-drawer-section-header">
          <div className="login-stage-kicker">
            <CircleCheckBig size={18} aria-hidden="true" />
            <span className="section-eyebrow">账号已接入</span>
          </div>
          <h3>登录完成</h3>
          <p>账号已进入可用状态，后续可以直接在手工页或批量页继续查询。</p>
        </div>

        <div className="login-drawer-success-card">
          <img
            className="login-drawer-success-avatar"
            src={buildFallbackAvatar(loginSession.account?.nickname, loginSession.account?.avatar)}
            alt={loginSession.account?.nickname || '已登录账号'}
          />
          <div className="login-drawer-success-copy">
            <strong>{loginSession.account?.nickname || '已登录账号'}</strong>
            <p>账号 ID：{loginSession.account?.accountId || '-'}</p>
            <p>登录成功后 2 秒自动收起抽屉。</p>
          </div>
        </div>
      </SectionCard>
    )
  }

  if (loginSession.status === 'WAITING_SMS') {
    return (
      <SectionCard as="section" className="login-drawer-stage-card">
        <div className="login-drawer-section-header">
          <div className="login-stage-kicker">
            <Smartphone size={18} aria-hidden="true" />
            <span className="section-eyebrow">短信验证</span>
          </div>
          <h3>输入短信验证码</h3>
          <p>检测到风控验证，请查收手机短信并提交验证码，登录流程会自动继续。</p>
        </div>

        <form className="login-drawer-sms-form" onSubmit={handleSmsSubmit}>
          <label className="login-drawer-field" htmlFor={smsInputId}>
            <span className="login-drawer-field-label">短信验证码</span>
            <span className="login-drawer-field-hint">仅支持当前会话收到的最新验证码。</span>
          </label>

          <div className="login-drawer-sms-row">
            <input
              ref={smsInputRef}
              id={smsInputId}
              className="login-drawer-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              placeholder="请输入短信验证码"
              value={smsCode}
              onChange={(event) => setSmsCode(event.target.value.replace(/\s+/g, ''))}
              disabled={smsSubmitting}
              aria-describedby={smsHelpId}
            />
            <button
              className="primary-btn"
              type="submit"
              disabled={smsSubmitting || !smsCode.trim()}
            >
              {smsSubmitting ? '提交中...' : '提交验证码'}
            </button>
          </div>
        </form>

        <p id={smsHelpId} className="login-drawer-inline-help">
          提交后如果仍提示风控，请等待后台状态刷新，不需要重复创建新二维码。
        </p>

        {smsError ? (
          <InlineNotice
            tone="danger"
            title="验证码提交失败"
            description={smsError}
            className="login-drawer-inline-notice"
          />
        ) : null}
      </SectionCard>
    )
  }

  return (
    <SectionCard as="section" className="login-drawer-stage-card">
      <div className="login-drawer-section-header">
        <div className="login-stage-kicker">
          <QrCode size={18} aria-hidden="true" />
          <span className="section-eyebrow">阶段说明</span>
        </div>
        <h3>{getVisualTitle(loginSession.status)}</h3>
        <p>{getVisualDescription(loginSession.status)}</p>
      </div>

      <div className="login-drawer-stage-grid">
        <div className={`qr-wrap login-drawer-qr-frame ${loginSession.status !== 'WAITING_QR' ? 'is-preview' : ''}`}>
          {qrCodeDataUrl ? (
            <img
              className={`qr-image ${loginSession.status !== 'WAITING_QR' ? 'full-preview' : ''}`}
              src={qrCodeDataUrl}
              alt={loginSession.status === 'WAITING_QR' ? '淘宝登录二维码' : '登录过程截图'}
            />
          ) : (
            <div className="login-drawer-qr-placeholder">
              <strong>视图加载中</strong>
              <p>浏览器会在后台实时刷新扫码页面。</p>
            </div>
          )}
        </div>

        <ul className="login-drawer-guide-list" aria-label="当前阶段说明">
          {getGuideItems(loginSession.status).map((item) => (
            <li key={item.title} className="login-drawer-guide-item">
              <strong>{item.title}</strong>
              <p>{item.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </SectionCard>
  )
}

function getTone(status) {
  if (status === 'LOGGED_IN') return 'success'
  if (status === 'EXPIRED' || status === 'WAITING_SMS') return 'warning'
  if (status === 'FAILED') return 'danger'
  return 'info'
}

function getActiveStepIndex(status) {
  if (status === 'WAITING_QR' || status === 'EXPIRED' || status === 'FAILED') return 0
  if (status === 'WAITING_CONFIRM') return 1
  if (status === 'WAITING_SMS') return 2
  return 3
}

function getStatusCopy(loginSession) {
  switch (loginSession.status) {
    case 'WAITING_QR':
      return {
        title: '等待扫码',
        summary: '二维码已准备好，请使用淘宝 App 扫码开始登录。',
        description: '打开淘宝 App 扫码后，系统会自动进入下一阶段。',
        nextAction: '使用手机扫码'
      }
    case 'WAITING_CONFIRM':
      return {
        title: '等待手机确认',
        summary: '二维码已被识别，等待手机端确认登录授权。',
        description: '请保持淘宝 App 在前台，确认后会自动推进到下一个阶段。',
        nextAction: '在手机上确认登录'
      }
    case 'WAITING_SMS':
      return {
        title: '等待短信验证',
        summary: '当前会话需要手机验证码，提交后会继续登录流程。',
        description: '这是风控校验的正常分支，验证码提交成功后无需重新扫码。',
        nextAction: '输入手机短信验证码'
      }
    case 'LOGGED_IN':
      return {
        title: '登录成功',
        summary: '账号已成功接入当前工作台，可以继续查询或切换到批量闭环。',
        description: '登录成功后抽屉会自动收起，账号状态也会同步到左侧账号列表。',
        nextAction: '继续查询或前往批量页'
      }
    case 'EXPIRED':
      return {
        title: '二维码已过期',
        summary: '当前二维码失效，需要刷新后重新扫码。',
        description: '二维码超时属于正常现象，刷新后重新扫码即可继续。',
        nextAction: '刷新二维码'
      }
    case 'FAILED':
      return {
        title: '登录失败',
        summary: loginSession.error || '后台登录流程中断，请重新生成二维码后再试。',
        description: '失败原因已经同步到当前会话卡片，下方仍会展示当前阶段的辅助信息。',
        nextAction: '重新生成二维码'
      }
    default:
      return {
        title: formatLoginStatus(loginSession.status),
        summary: '当前状态正在刷新，请稍候。',
        description: '登录流程会继续在后台运行。',
        nextAction: '等待状态更新'
      }
  }
}

function getStepState(status, index) {
  if (status === 'WAITING_QR' || status === 'EXPIRED' || status === 'FAILED') {
    if (index === 0) return 'active'
    return 'idle'
  }

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

function getStepTone(state) {
  if (state === 'done') return 'success'
  if (state === 'active') return 'info'
  return 'neutral'
}

function getStepLabel(state) {
  if (state === 'done') return '已完成'
  if (state === 'active') return '进行中'
  return '待开始'
}

function getStepDescription(state) {
  if (state === 'done') return '该阶段已完成，可继续往后推进。'
  if (state === 'active') return '当前正在处理这个阶段。'
  return '等待前置步骤完成后自动进入。'
}

function getStepIcon(index) {
  if (index === 0) return QrCode
  if (index === 1) return ShieldCheck
  if (index === 2) return Smartphone
  return Sparkles
}

function getVisualTitle(status) {
  if (status === 'WAITING_CONFIRM') return '等待手机端确认'
  if (status === 'EXPIRED') return '二维码已失效'
  if (status === 'FAILED') return '登录过程被中断'
  return '扫码二维码'
}

function getVisualDescription(status) {
  if (status === 'WAITING_CONFIRM') return '已扫描二维码，保留当前页面即可，等待手机授权完成。'
  if (status === 'EXPIRED') return '刷新二维码后重新扫码，新的二维码会覆盖当前预览。'
  if (status === 'FAILED') return '重新生成二维码即可重启整个登录流程。'
  return '二维码和登录过程截图会实时更新，便于判断当前进度。'
}

function getGuideItems(status) {
  if (status === 'WAITING_CONFIRM') {
    return [
      { title: '当前动作', description: '请在手机端点击确认登录。' },
      { title: '页面行为', description: '后台会自动刷新当前预览，不需要手动切换。' },
      { title: '如果卡住', description: '长时间无变化时，可重新生成二维码。' }
    ]
  }

  if (status === 'EXPIRED') {
    return [
      { title: '当前动作', description: '点击底部“刷新二维码”获取新的登录入口。' },
      { title: '常见原因', description: '二维码超过有效时间或扫码流程被中断。' },
      { title: '建议', description: '刷新后尽快扫码，避免再次超时。' }
    ]
  }

  if (status === 'FAILED') {
    return [
      { title: '当前动作', description: '重新生成二维码并重新开始登录。' },
      { title: '错误处理', description: '如果重复失败，先确认网络或手机端授权流程。' },
      { title: '说明', description: '失败不会影响已保存账号，只会中断当前新增流程。' }
    ]
  }

  return [
    { title: '当前动作', description: '请使用淘宝 App 扫描左侧二维码。' },
    { title: '页面行为', description: '扫码成功后，本抽屉会自动切换到下一步提示。' },
    { title: '补充说明', description: '如二维码加载慢，可稍等数秒或重新生成。' }
  ]
}
