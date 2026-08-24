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

const ACTIVITY_TITLES = {
  created: 'Task created',
  refined: 'Task clarified',
  edited: 'Task updated',
  moved: 'Task moved',
  started: 'Agent started a run',
  run_started: 'Agent started a run',
  settled: 'Agent replied',
  run_settled: 'Agent replied',
}

const cleanLine = value => String(value || '')
  .split('\n')
  .map(line => line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s*)/, '').trim())
  .find(Boolean) || ''

const activityStatus = (kind, summary) => {
  const normalized = `${kind || ''} ${summary || ''}`.toLowerCase()
  if (normalized.includes('fail')) return 'failed'
  if (normalized.includes('settled') || normalized.includes('done') || normalized.includes('complete')) return 'succeeded'
  return 'running'
}

export function taskEngine(task) {
  const latest = task.executions && task.executions.length ? task.executions[task.executions.length - 1] : null
  return latest?.engine || task.active_engine || task.engine || 'auto'
}

export function taskActivities(task) {
  const stored = Array.isArray(task.activities)
    ? task.activities
    : Array.isArray(task.activity) ? task.activity : null
  if (stored) {
    return [...stored].reverse().map((item, index) => ({
      ...item,
      id: item.id || `activity-${index}`,
      title: item.title || ACTIVITY_TITLES[item.kind] || 'Task update',
      summary: item.summary || item.detail || 'The task was updated.',
      created_at: item.created_at || item.at,
      status: item.status || activityStatus(item.kind, item.summary),
    }))
  }
  return [...(task.executions || [])].reverse().map((exec, index) => ({
    id: exec.id || `run-${index}`,
    execution_id: exec.id,
    title: exec.result === 'succeeded' ? 'Agent replied' : exec.result === 'failed' ? 'Agent run failed' : 'Agent is working',
    summary: exec.summary || exec.progress_detail || exec.error || (exec.result === 'succeeded' ? 'The latest execution returned successfully.' : 'The agent has started processing this task.'),
    created_at: exec.ended_at || exec.started_at,
    status: exec.result || 'running',
  }))
}

const resourceName = url => {
  try {
    const parsed = new URL(url)
    return decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname)
  } catch {
    return url
  }
}

const resourceCategory = resource => {
  const value = `${resource.type || ''} ${resource.kind || ''} ${resource.title || ''} ${resource.url || resource.href || ''}`.toLowerCase()
  if (/\b(diff|patch|change|commit)\b|\.(diff|patch)(?:$|[?#])/.test(value)) return 'changes'
  if (/\b(markdown|note|readme)\b|\.md(?:$|[?#])/.test(value)) return 'notes'
  return 'files'
}

const normalizeResource = (resource, fallbackId, executionId) => {
  if (typeof resource === 'string') resource = { url: resource }
  const url = resource.url || resource.href || ''
  const normalized = {
    ...resource,
    id: resource.id || fallbackId,
    title: resource.title || resource.name || (url ? resourceName(url) : 'Agent artifact'),
    url,
    execution_id: resource.execution_id || executionId || null,
  }
  return { ...normalized, category: resourceCategory(normalized) }
}

const linksFromText = (text, executionId) => {
  if (!text) return []
  const links = []
  const seen = new Set()
  const markdown = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g
  let match
  while ((match = markdown.exec(text)) !== null) {
    const url = match[2].replace(/[.,;:!?]+$/, '')
    if (seen.has(url)) continue
    seen.add(url)
    links.push(normalizeResource({ title: match[1], url, type: 'link' }, `link-${executionId || 'task'}-${links.length}`, executionId))
  }
  const raw = /https?:\/\/[^\s<>()\]]+/g
  while ((match = raw.exec(text)) !== null) {
    const url = match[0].replace(/[.,;:!?]+$/, '')
    if (seen.has(url)) continue
    seen.add(url)
    links.push(normalizeResource({ url, type: 'link' }, `link-${executionId || 'task'}-${links.length}`, executionId))
  }
  return links
}

export function taskArtifacts(task) {
  const resources = []
  const seen = new Set()
  const add = resource => {
    const key = resource.url || resource.href || resource.path || resource.id || resource.title
    if (!key || seen.has(key)) return
    seen.add(key)
    resources.push(resource)
  }
  ;(Array.isArray(task.artifacts) ? task.artifacts : []).forEach((resource, index) => {
    add(normalizeResource(resource, `artifact-${index}`, resource?.execution_id))
  })
  ;(task.executions || []).forEach((exec, executionIndex) => {
    ;(Array.isArray(exec.artifacts) ? exec.artifacts : []).forEach((resource, resourceIndex) => {
      add(normalizeResource(resource, `artifact-${executionIndex}-${resourceIndex}`, exec.id))
    })
    linksFromText(exec.summary, exec.id).forEach(add)
  })
  linksFromText(task.latest_result || task.final_result, null).forEach(add)
  return resources
}

export function taskResourceGroups(task) {
  const all = taskArtifacts(task)
  return {
    files: all,
    changes: all.filter(resource => resource.category === 'changes'),
    notes: all.filter(resource => resource.category === 'notes'),
  }
}

export function taskSteps(task, resources = taskArtifacts(task)) {
  if (Array.isArray(task.steps) && task.steps.length) {
    return task.steps.map((step, index) => typeof step === 'string' ? {
      id: `step-${index}`,
      title: step,
      summary: '',
      status: index === 0 && task.status === 'running' ? 'running' : 'pending',
      artifacts: [],
    } : {
      ...step,
      id: step.id || `step-${index}`,
      title: step.title || step.name || `Step ${index + 1}`,
      summary: step.summary || step.detail || '',
      status: step.status || 'pending',
      artifacts: resources.filter(resource => resource.step_id === step.id),
    })
  }
  return (task.executions || []).map((exec, index) => ({
    id: exec.id || `run-${index}`,
    title: `Run ${index + 1}`,
    summary: exec.summary || exec.progress_detail || exec.error || (exec.result ? `Execution ${exec.result}.` : 'The agent is working on this run.'),
    status: exec.result || 'running',
    engine: exec.engine,
    started_at: exec.started_at,
    ended_at: exec.ended_at,
    artifacts: resources.filter(resource => resource.execution_id === exec.id),
  }))
}

export function taskKeyPoints(task) {
  if (Array.isArray(task.key_points) && task.key_points.length) {
    return task.key_points.map(point => typeof point === 'string' ? point : point.text || point.title).filter(Boolean).slice(0, 4)
  }
  const latest = task.executions?.[task.executions.length - 1]
  const summaryLines = String(latest?.summary || task.latest_result || task.final_result || '')
    .split('\n')
    .map(line => line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s*)/, '').trim())
    .filter(line => line.length > 3 && !/^https?:\/\//.test(line))
    .map(line => line.slice(0, 280))
  const recentActivity = taskActivities(task)
    .filter(item => !['created', 'refined', 'moved'].includes(item.kind))
    .map(item => item.summary)
  return [...new Set([...summaryLines, ...recentActivity])].slice(0, 4)
}

export function taskProgress(task) {
  const latest = task.executions?.[task.executions.length - 1]
  const raw = String(latest?.progress || task.progress || '')
  const fraction = raw.match(/(\d+)\s*(?:\/|of)\s*(\d+)/i)
  if (fraction && Number(fraction[2]) > 0) {
    const current = Number(fraction[1])
    const total = Number(fraction[2])
    return { percent: Math.min(100, Math.round((current / total) * 100)), label: `${current} of ${total}` }
  }
  const percentage = raw.match(/(\d{1,3})\s*%/)
  if (percentage) {
    const percent = Math.min(100, Number(percentage[1]))
    return { percent, label: `${percent}%` }
  }
  if (task.status === 'done') return { percent: 100, label: 'Complete' }
  if (task.status === 'failed') return { percent: 100, label: 'Needs attention' }
  if (task.status === 'running') return { percent: 58, label: 'In progress' }
  return { percent: 0, label: 'Not started' }
}

export function taskFocus(task) {
  const latest = task.executions?.[task.executions.length - 1]
  const status = task.status === 'running' ? 'In progress' : task.status === 'done' ? 'Completed' : task.status === 'failed' ? 'Needs attention' : 'Ready'
  const result = latest?.summary || task.latest_result || task.final_result || latest?.error || ''
  const current = task.status === 'running'
    ? latest?.progress_detail || latest?.progress || 'The agent is working through the task.'
    : task.status === 'done'
      ? cleanLine(result) || 'The latest agent run completed successfully.'
      : task.status === 'failed'
        ? latest?.error || 'The latest run needs attention.'
        : 'Ready for the agent to start.'
  const next = task.next_step || latest?.next_step || (task.status === 'running'
    ? 'Review the next agent update when it arrives.'
    : task.status === 'done'
      ? 'Review the result or send a follow-up instruction.'
      : task.status === 'failed'
        ? 'Open the run, adjust the instruction, then try again.'
        : 'Run the task to begin the first agent step.')
  return { status, current, result, next, progress: taskProgress(task), keyPoints: taskKeyPoints(task) }
}
