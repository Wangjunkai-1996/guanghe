import { useState, useCallback, useMemo } from 'react'
import { api } from '../api'
import { useSSE } from './useSSE'

export function useAccounts({ onLoaded } = {}) {
    const [accounts, setAccounts] = useState([])
    const [accountsLoading, setAccountsLoading] = useState(false)
    const [hasLoadedAccounts, setHasLoadedAccounts] = useState(false)
    const [selectedAccountId, setSelectedAccountId] = useState('')

    const activeAccount = useMemo(
        () => accounts.find((account) => account.accountId === selectedAccountId) || null,
        [accounts, selectedAccountId]
    )

    const applyAccounts = useCallback((nextAccounts) => {
        setAccounts(nextAccounts)
        setHasLoadedAccounts(true)
        setSelectedAccountId((current) => {
            if (current && nextAccounts.some((account) => account.accountId === current)) return current
            return nextAccounts[0]?.accountId || ''
        })
        if (onLoaded) {
            onLoaded(nextAccounts)
        }
        return nextAccounts
    }, [onLoaded])

    const loadAccounts = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setAccountsLoading(true)
        try {
            const payload = await api.listAccounts()
            const nextAccounts = payload.accounts || []
            return applyAccounts(nextAccounts)
        } finally {
            if (!silent) setAccountsLoading(false)
        }
    }, [applyAccounts])

    const ensureAccountsLoaded = useCallback(async (options = {}) => {
        if (hasLoadedAccounts) return accounts
        return loadAccounts(options)
    }, [accounts, hasLoadedAccounts, loadAccounts])

    const deleteAccount = useCallback(async (accountId) => {
        await api.deleteAccount(accountId)
        if (selectedAccountId === accountId) {
            setSelectedAccountId('')
        }
        await loadAccounts()
        return true
    }, [selectedAccountId, loadAccounts])

    useSSE('accounts', (nextAccounts) => {
        applyAccounts(nextAccounts || [])
    })

    return {
        accounts,
        accountsLoading,
        hasLoadedAccounts,
        selectedAccountId,
        setSelectedAccountId,
        activeAccount,
        loadAccounts,
        ensureAccountsLoaded,
        deleteAccount
    }
}
