import { useCallback, useEffect, useState } from 'react'
import { api, jsonBody } from '../api/kanbanApi.ts'
import useTaskPolling from './useTaskPolling.ts'

/** What a failed board read means, in words the user can act on.
 *
 * A 404 here is NOT "no tasks": the app's own routes are missing from the
 * running gateway, which happens when the app was installed or enabled from the
 * CLI while the gateway was already up — route registration lives in the gateway
 * process, so a CLI enable never reaches it. Saying that beats rendering a
 * convincing, empty board and letting the user discover it on create.
 */
function describeLoadFailure(err) {
  const message = err instanceof Error ? err.message : String(err)
  if (/^404|not found/i.test(message)) {
    return 'The board could not reach its backend (404). Kanban\u2019s routes are not registered in the running Kiro Crew — re-enable the app from Settings \u203a Apps, or restart the gateway.'
  }
  return `The board could not be loaded: ${message}`
}

export default function useTasks() {
  const [tasks, setTasks] = useState([])
  const [approvals, setApprovals] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const data = await api('/tasks')
      setTasks(data.tasks || [])
      // Live slot state, not board state: an empty object is the normal answer,
      // so it is replaced rather than merged — a resolved approval must vanish.
      setApprovals(data.approvals || {})
      setLoadError(null)
    } catch (err) {
      console.warn('kanban: poll failed:', err)
      setLoadError(describeLoadFailure(err))
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

  return { tasks, setTasks, approvals, loading, loadError, refresh }
}
