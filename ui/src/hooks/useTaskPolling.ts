import { useEffect, useRef } from 'react'

export default function useTaskPolling(tasks, refresh) {
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks
  useEffect(() => {
    let stopped = false
    let timer = null
    const tick = async () => {
      await refresh()
      if (stopped) return
      const busy = tasksRef.current.some(t => t.refining || t.status === 'running')
      timer = setTimeout(tick, busy ? 1500 : 5000)
    }
    tick()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [refresh])
}
