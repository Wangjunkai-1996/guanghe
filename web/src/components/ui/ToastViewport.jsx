import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ToneIcon } from './ToneIcon'

export function ToastViewport({ toasts = [] }) {
  const shouldReduceMotion = useReducedMotion()

  if (!toasts.length) return null

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className={`toast-card tone-${toast.tone}`}
            initial={shouldReduceMotion ? undefined : { opacity: 0, x: 24, y: 12 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, x: 0, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, x: 24, y: 12 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0.2, 1] }}
          >
            <ToneIcon tone={toast.tone} className="toast-card-icon" />
            <span>{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
