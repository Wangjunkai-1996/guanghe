import { useState, useCallback, useMemo } from 'react'
import { api } from '../api'
import { useSSE } from './useSSE'

export function useAccounts({ onLoaded } = {}) {
    const [accounts, setAccounts] = useState([])
    const [accountsLoading, setAccountsLoading] = useState(false)
    const [selectedAccountId, setSelectedAccountId] = useState('')

    const activeAccount = useMemo(
        () => accounts.find((account) => account.accountId === selectedAccountId) || null,
        [accounts, selectedAccountId]
    )

    const loadAccounts = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setAccountsLoading(true)
        try {
            const payload = await api.listAccounts()
            const nextAccounts = payload.accounts || []
            setAccounts(nextAccounts)
            setSelectedAccountId((current) => {
                if (current && nextAccounts.some((account) => account.accountId === current)) return current
                return nextAccounts[0]?.accountId || ''
            })
            if (onLoaded) {
                onLoaded(nextAccounts)
            }
        } finally {
            if (!silent) setAccountsLoading(false)
        }
    }, [onLoaded])

    const deleteAccount = useCallback(async (accountId) => {
        const confirmed = window.confirm(`确认删除账号 ${accountId} 吗？`)
        if (!confirmed) return false

        await api.deleteAccount(accountId)
        if (selectedAccountId === accountId) {
            setSelectedAccountId('')
        }
        await loadAccounts()
        return true
    }, [selectedAccountId, loadAccounts])

    useSSE('accounts', (nextAccounts) => {
        setAccounts(nextAccounts)
        setSelectedAccountId((current) => {
            if (current && nextAccounts.some((account) => account.accountId === current)) return current
            return nextAccounts[0]?.accountId || ''
        })
    })

    return {
        accounts,
        accountsLoading,
        selectedAccountId,
        setSelectedAccountId,
        activeAccount,
        loadAccounts,
        deleteAccount
    }
}
