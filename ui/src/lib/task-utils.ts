export const COLUMNS = [
  { id: 'backlog', label: 'Backlog', accent: 'var(--muted, #7f7f88)' },
  { id: 'todo', label: 'To do', accent: 'var(--info, #0891b2)' },
  { id: 'running', label: 'Running', accent: 'var(--warn, #eab308)' },
  { id: 'done', label: 'Done', accent: 'var(--ok, #22c55e)' },
  { id: 'failed', label: 'Failed', accent: 'var(--danger, #ef4444)' },
]

export const DROP_TARGETS = ['backlog', 'todo', 'done', 'failed']

export const RESULT_LABELS = { succeeded: 'Succeeded', failed: 'Failed', cancelled: 'Cancelled' }

export const ENGINE_OPTIONS = [
  { id: 'auto', label: 'Auto', help: 'Chat for simple prompts; Task Runner for multi-step work' },
  { id: 'chat', label: 'Chat', help: 'One live Chat session' },
  { id: 'task_runner', label: 'Task Runner', help: 'Multi-step execution with progress' },
  { id: 'autopilot', label: 'Autopilot', help: 'Plan first, then approve in a Chat session' },
]

export const ENGINE_LABELS = Object.fromEntries(ENGINE_OPTIONS.map(engine => [engine.id, engine.label]))

export function taskEngine(task) {
  const latest = task.executions && task.executions.length ? task.executions[task.executions.length - 1] : null
  return latest?.engine || task.active_engine || task.engine || 'auto'
}

export function taskActivities(task) {
  if (Array.isArray(task.activities)) return [...task.activities].reverse()
  return [...(task.executions || [])].reverse().map((exec, index) => ({
    id: exec.id || `run-${index}`,
    title: exec.result === 'succeeded' ? 'Agent completed a run' : exec.result === 'failed' ? 'Agent run failed' : 'Agent is working',
    summary: exec.error || (exec.result === 'succeeded' ? 'The latest execution returned successfully.' : 'The agent has started processing this task.'),
    created_at: exec.ended_at || exec.started_at,
    status: exec.result || 'running',
  }))
}

export const taskArtifacts = task => Array.isArray(task.artifacts) ? task.artifacts : []
