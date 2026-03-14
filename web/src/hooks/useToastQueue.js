import { useCallback, useEffect, useRef, useState } from 'react'

export function useToastQueue(autoDismissMs = 2200) {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef(new Map())

  const removeToast = useCallback((toastId) => {
    const timer = timersRef.current.get(toastId)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(toastId)
    }
    setToasts((current) => current.filter((item) => item.id !== toastId))
  }, [])

  const pushToast = useCallback((tone = 'info', message = '') => {
    if (!message) return ''
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setToasts((current) => [...current, { id, tone, message }])

    const timer = setTimeout(() => {
      removeToast(id)
    }, autoDismissMs)

    timersRef.current.set(id, timer)
    return id
  }, [autoDismissMs, removeToast])

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer))
      timersRef.current.clear()
    }
  }, [])

  return {
    toasts,
    pushToast,
    removeToast
  }
}
