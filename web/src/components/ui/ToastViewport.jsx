export function ToastViewport({ toasts = [] }) {
  if (!toasts.length) return null

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-card tone-${toast.tone}`}>
          {toast.message}
        </div>
      ))}
    </div>
  )
}
