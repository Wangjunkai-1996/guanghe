import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X } from 'lucide-react'
import { ToneIcon } from './ToneIcon'

export function ToastViewport({ toasts = [], onDismiss = null }) {
  const shouldReduceMotion = useReducedMotion()

  if (!toasts.length) return null

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className={`toast-card tone-${toast.tone}`}
            title={toast.message}
            aria-label={toast.message}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0.2, 1] }}
          >
            <ToneIcon tone={toast.tone} className="toast-card-icon" />
            <span className="toast-card-message">{toast.message}</span>
            {onDismiss ? (
              <button
                className="toast-card-close"
                type="button"
                aria-label="关闭提示"
                onClick={() => onDismiss(toast.id)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
