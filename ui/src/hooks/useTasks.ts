import { useCallback, useEffect, useState } from 'react'
import { api, jsonBody } from '../api/kanbanApi.ts'
import useTaskPolling from './useTaskPolling.ts'

export default function useTasks() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await api('/tasks')
      setTasks(data.tasks || [])
    } catch (err) {
      console.warn('kanban: poll failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useTaskPolling(tasks, refresh)

  useEffect(() => {
    const key = 'kanban-reconciled'
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
    api('/reconcile', jsonBody({})).catch(() => {}).finally(refresh)
  }, [refresh])

  return { tasks, setTasks, loading, refresh }
}
