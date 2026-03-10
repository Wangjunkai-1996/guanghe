import { useEffect } from 'react'

let globalSource = null
let subscribers = { accounts: new Set(), tasks: new Set() }
let reconnectTimeout = null

export function connectSSE() {
    if (globalSource) return

    try {
        globalSource = new EventSource('/api/events')

        globalSource.addEventListener('accounts', (e) => {
            try {
                const data = JSON.parse(e.data)
                subscribers.accounts.forEach((cb) => cb(data.accounts))
            } catch (err) {
                console.error('Failed to parse active accounts from SSE', err)
            }
        })

        globalSource.addEventListener('tasks', (e) => {
            try {
                const data = JSON.parse(e.data)
                subscribers.tasks.forEach((cb) => cb(data.tasks))
            } catch (err) {
                console.error('Failed to parse active tasks from SSE', err)
            }
        })

        globalSource.onerror = () => {
            globalSource.close()
            globalSource = null
            clearTimeout(reconnectTimeout)
            reconnectTimeout = setTimeout(connectSSE, 3000)
        }
    } catch (err) {
        console.error('Failed to connect to SSE', err)
    }
}

export function useSSE(event, callback) {
    useEffect(() => {
        connectSSE()
        subscribers[event].add(callback)
        return () => {
            subscribers[event].delete(callback)
        }
    }, [event, callback])
}
