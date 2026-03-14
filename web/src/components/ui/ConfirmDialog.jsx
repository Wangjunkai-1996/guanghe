import { useEffect, useId, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ToneIcon } from './ToneIcon'

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'warning',
  loading = false,
  onConfirm,
  onCancel,
  children = null
}) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef(null)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    if (!open) return undefined

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel?.()
        return
      }

      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return

      const focusableElements = Array.from(panel.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ))

      if (focusableElements.length === 0) {
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

    const panel = panelRef.current
    panel?.focus()
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [open, onCancel])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="confirm-dialog-root"
          initial={shouldReduceMotion ? undefined : { opacity: 0 }}
          animate={shouldReduceMotion ? undefined : { opacity: 1 }}
          exit={shouldReduceMotion ? undefined : { opacity: 0 }}
        >
          <button
            className="confirm-dialog-backdrop"
            type="button"
            onClick={onCancel}
            aria-label="关闭确认弹窗"
          />
          <motion.div
            ref={panelRef}
            className={`panel confirm-dialog-panel tone-${tone}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 18, scale: 0.98 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.2, 0, 0.2, 1] }}
          >
            <div className="confirm-dialog-copy">
              <div className="confirm-dialog-kicker">
                <ToneIcon tone={tone} className="confirm-dialog-kicker-icon" />
                <span className="section-eyebrow">重要确认</span>
              </div>
              <h2 id={titleId}>{title}</h2>
              {description ? <p id={descriptionId}>{description}</p> : null}
            </div>

            {children ? <div className="confirm-dialog-body">{children}</div> : null}

            <div className="confirm-dialog-actions">
              <button className="secondary-btn" type="button" onClick={onCancel} disabled={loading}>
                {cancelLabel}
              </button>
              <button className="primary-btn" type="button" onClick={onConfirm} disabled={loading}>
                {loading ? '处理中...' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
