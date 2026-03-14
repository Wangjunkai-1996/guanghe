import React, { useState } from 'react'

export const TaskSmsInput = React.memo(function TaskSmsInput({ taskId, onSubmitSmsCode, onClick }) {
  const [smsCode, setSmsCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [smsError, setSmsError] = useState('')

  const handleSubmit = async () => {
    if (!smsCode.trim()) return
    setSubmitting(true)
    setSmsError('')
    try {
      await onSubmitSmsCode(taskId, smsCode.trim())
      setSmsCode('')
    } catch (error) {
      setSmsError(error.message || '验证码错误，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="task-card-sms-input" onClick={onClick}>
      <p className="sms-hint">检测到风控验证，请输入手机验证码</p>
      <div className="sms-input-row">
        <input
          className="sms-code-input"
          type="text"
          placeholder="请输入验证码"
          value={smsCode}
          maxLength={8}
          onChange={(event) => setSmsCode(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && handleSubmit()}
          disabled={submitting}
        />
        <button
          className="primary-btn compact-btn"
          type="button"
          disabled={submitting || !smsCode.trim()}
          onClick={handleSubmit}
        >
          {submitting ? '提交中...' : '提交'}
        </button>
      </div>
      {smsError ? <p className="sms-error">{smsError}</p> : null}
    </div>
  )
})
