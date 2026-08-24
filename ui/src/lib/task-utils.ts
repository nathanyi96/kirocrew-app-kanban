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

export const GOAL_STATUS = {
  ready: { label: 'Ready', tone: 'muted' },
  working: { label: 'Working', tone: 'warn' },
  needs_input: { label: 'Needs input', tone: 'warn' },
  needs_review: { label: 'Needs review', tone: 'info' },
  achieved: { label: 'Achieved', tone: 'ok' },
  paused: { label: 'Paused', tone: 'muted' },
  blocked: { label: 'Blocked', tone: 'danger' },
  budget_exhausted: { label: 'Budget exhausted', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
}

const ACTIVITY_TITLES = {
  created: 'Task created',
  refined: 'Task clarified',
  edited: 'Task updated',
  moved: 'Task moved',
  started: 'Agent started a run',
  run_started: 'Agent started a run',
  settled: 'Agent replied',
  run_settled: 'Agent replied',
  goal_updated: 'Goal updated',
  accepted: 'Outcome accepted',
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
  if (/\b(diff|patch|change|commit|branch)\b|\.(diff|patch)(?:$|[?#])/.test(value)) return 'changes'
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
    artifacts: all,
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
  const projected = (task.executions || []).flatMap(exec => Array.isArray(exec.steps)
    ? exec.steps.map(step => ({
      ...step,
      engine: exec.engine,
      started_at: exec.started_at,
      ended_at: exec.ended_at,
      artifacts: resources.filter(resource => resource.step_id === step.id || step.artifact_ids?.includes(resource.id)),
    }))
    : [])
  if (projected.length) return projected
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
  const criteria = (task.goal?.criteria || task.result_packet?.verification || []).filter(check => check.required !== false)
  if (criteria.length) {
    const passed = criteria.filter(check => check.status === 'passed').length
    return { percent: Math.round((passed / criteria.length) * 100), label: `${passed} of ${criteria.length} verified`, determinate: true }
  }
  const steps = Array.isArray(latest?.steps) ? latest.steps : []
  if (steps.length) {
    const complete = steps.filter(step => ['passed', 'skipped', 'completed', 'succeeded'].includes(step.status)).length
    return { percent: Math.round((complete / steps.length) * 100), label: `${complete} of ${steps.length} checkpoints`, determinate: true }
  }
  const raw = String(latest?.progress || task.progress || '')
  const fraction = raw.match(/(\d+)\s*(?:\/|of)\s*(\d+)/i)
  if (fraction && Number(fraction[2]) > 0) {
    const current = Number(fraction[1])
    const total = Number(fraction[2])
    return { percent: Math.min(100, Math.round((current / total) * 100)), label: `${current} of ${total}`, determinate: true }
  }
  const percentage = raw.match(/(\d{1,3})\s*%/)
  if (percentage) {
    const percent = Math.min(100, Number(percentage[1]))
    return { percent, label: `${percent}%`, determinate: true }
  }
  if (task.goal?.status === 'achieved' || task.result_packet?.status === 'verified') return { percent: 100, label: 'Verified', determinate: true }
  if (task.status === 'done') return { percent: null, label: 'Finished · review evidence', determinate: false }
  if (task.status === 'failed') return { percent: null, label: 'Needs attention', determinate: false }
  if (task.status === 'running') return { percent: null, label: 'Working', determinate: false }
  return { percent: 0, label: 'Not started', determinate: true }
}

export function taskState(task) {
  if (task.goal?.status) return task.goal.status
  if (task.status === 'running') return 'working'
  if (task.status === 'failed') return 'blocked'
  if (task.result_packet?.status === 'verified') return 'achieved'
  if (task.status === 'done') return 'needs_review'
  return 'ready'
}

export function taskStateMeta(task) {
  const state = taskState(task)
  return { state, ...(GOAL_STATUS[state] || GOAL_STATUS.ready) }
}

export function taskRunBlocker(task, now = Date.now() / 1000) {
  const goal = task.goal
  if (!goal || goal.mode !== 'loop') return null
  if (goal.status === 'achieved') return 'Goal is already achieved'
  if (goal.attempts >= goal.max_attempts) return `Goal attempt limit reached (${goal.attempts}/${goal.max_attempts})`
  if (goal.token_budget && goal.tokens_used >= goal.token_budget) return 'Goal token budget exhausted'
  if (goal.started_at && goal.max_minutes && now - goal.started_at >= goal.max_minutes * 60) return 'Goal time budget exhausted'
  return null
}

export function defaultTaskTab(task) {
  const state = taskState(task)
  if (['working', 'needs_input', 'blocked', 'budget_exhausted', 'paused'].includes(state)) return 'goal'
  return 'outcome'
}

export function taskVerification(task) {
  const latest = task.executions?.[task.executions.length - 1]
  return task.result_packet?.verification || task.goal?.criteria || latest?.verifications || []
}

export function taskResultPacket(task) {
  const latest = task.executions?.[task.executions.length - 1]
  if (task.result_packet) return task.result_packet
  const status = task.status === 'running' ? 'working' : latest?.result === 'failed' ? 'failed' : latest?.result === 'succeeded' ? 'needs_review' : 'pending'
  return {
    status,
    summary: latest?.summary || latest?.progress_detail || latest?.error || '',
    verification: taskVerification(task),
    artifact_ids: (latest?.artifacts || []).map(item => item.id),
    risks: latest?.error ? [latest.error] : [],
    next_actions: task.status === 'running' ? ['Wait for the next verified checkpoint'] : ['Run the task to produce an outcome'],
    changed_files: 0,
  }
}

export function taskAttempts(task) {
  return (task.executions || []).map((exec, index) => ({
    ...exec,
    number: index + 1,
    title: `Attempt ${index + 1}`,
    status: exec.result || (task.status === 'running' && index === task.executions.length - 1 ? 'running' : 'pending'),
    steps: Array.isArray(exec.steps) ? exec.steps : [],
  }))
}

export function taskFocus(task) {
  const latest = task.executions?.[task.executions.length - 1]
  const state = taskStateMeta(task)
  const packet = taskResultPacket(task)
  const status = state.label
  const result = packet.summary || latest?.summary || task.latest_result || task.final_result || latest?.error || ''
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
  return { status, state: state.state, current, result, next, progress: taskProgress(task), keyPoints: taskKeyPoints(task) }
}
