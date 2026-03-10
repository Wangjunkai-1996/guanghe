import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { api } from '../api'

const LOGIN_SESSION_FINAL_STATUSES = ['LOGGED_IN', 'EXPIRED', 'FAILED']

export function useLoginSession({ onLoginSuccess } = {}) {
    const [loginSession, setLoginSession] = useState(null)
    const [isLoginDrawerOpen, setIsLoginDrawerOpen] = useState(false)
    const loginPollingRef = useRef(null)
    const loginSuccessCloseTimerRef = useRef(null)

    const stopPolling = useCallback(() => {
        if (loginPollingRef.current) {
            window.clearInterval(loginPollingRef.current)
            loginPollingRef.current = null
        }
    }, [])

    const clearLoginSuccessTimer = useCallback(() => {
        if (loginSuccessCloseTimerRef.current) {
            window.clearTimeout(loginSuccessCloseTimerRef.current)
            loginSuccessCloseTimerRef.current = null
        }
    }, [])

    const startPolling = useCallback((loginSessionId) => {
        stopPolling()
        loginPollingRef.current = window.setInterval(async () => {
            try {
                const next = await api.getLoginSession(loginSessionId)
                setLoginSession(next)
                if (LOGIN_SESSION_FINAL_STATUSES.includes(next.status)) {
                    stopPolling()
                    if (next.status === 'LOGGED_IN' && onLoginSuccess) {
                        onLoginSuccess(next)
                    }
                }
            } catch (_error) {
                stopPolling()
            }
        }, 2000)
    }, [stopPolling, onLoginSuccess])

    const createLoginSession = useCallback(async () => {
        clearLoginSuccessTimer()
        stopPolling()
        setIsLoginDrawerOpen(true)
        const payload = await api.createLoginSession()
        setLoginSession(payload)
        startPolling(payload.loginSessionId)
    }, [clearLoginSuccessTimer, stopPolling, startPolling])

    useEffect(() => {
        clearLoginSuccessTimer()
        if (loginSession?.status === 'LOGGED_IN') {
            loginSuccessCloseTimerRef.current = window.setTimeout(() => {
                setIsLoginDrawerOpen(false)
            }, 2000)
        }
    }, [clearLoginSuccessTimer, loginSession])

    useEffect(() => {
        return () => {
            stopPolling()
            clearLoginSuccessTimer()
        }
    }, [stopPolling, clearLoginSuccessTimer])

    return {
        loginSession,
        isLoginDrawerOpen,
        setIsLoginDrawerOpen,
        createLoginSession
    }
}
