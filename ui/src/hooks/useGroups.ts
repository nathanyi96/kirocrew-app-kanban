import { useCallback, useEffect, useRef, useState } from 'react'
import { api, jsonBody } from '../api/kanbanApi.ts'

const EMPTY = { projects: [], clusters: [], assignments: {}, clusters_refreshing: false, clusters_stale: false }

/**
 * Groupings for the cluster and project views.
 *
 * The endpoint answers from cache and refreshes in the background, so this hook
 * polls ONCE MORE a few seconds after a response that reported a pass in flight
 * — that is the only situation where the answer is known to be about to change,
 * so it is the only situation worth a second request.
 *
 * `enabled` keeps the board from fetching groupings at all while the user is in
 * a view that does not group: opening the board should not trigger a model call.
 */
export default function useGroups(enabled, boardRevision) {
  const [groups, setGroups] = useState(EMPTY)
  const [loading, setLoading] = useState(false)
  const timer = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const data = await api('/groups')
      setGroups(data || EMPTY)
      return data
    } catch (err) {
      console.warn('kanban: groups fetch failed:', err)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  const regroup = useCallback(async () => {
    try {
      await api('/clusters/refresh', jsonBody({}))
      setGroups(current => ({ ...current, clusters_refreshing: true }))
    } catch (err) {
      // 409 means a pass is already running, which is the outcome the caller
      // wanted anyway — surface nothing.
      if (err?.code) console.warn('kanban: regroup rejected:', err)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    setLoading(true)
    let cancelled = false
    refresh().then(data => {
      if (cancelled || !data?.clusters_refreshing) return
      timer.current = window.setTimeout(() => { if (!cancelled) refresh() }, 6000)
    })
    return () => {
      cancelled = true
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [enabled, boardRevision, refresh])

  return { groups, loading, refresh, regroup }
}
