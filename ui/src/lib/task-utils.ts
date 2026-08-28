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
  { id: 'chat', label: 'Chat', help: 'One live Chat session' },
  { id: 'task_runner', label: 'Task Runner', help: 'Multi-step execution with progress' },
  { id: 'autopilot', label: 'Autopilot', help: 'Plan first, then approve in a Chat session' },
  { id: 'auto', label: 'Auto', help: 'Chat for simple prompts; Task Runner for multi-step work' },
]

// The engine a new card gets when the user does not pick one. Chat is the
// default because it is the predictable answer — the card runs in one visible
// session the user can watch and reply in. `auto` stays available but is opt-in:
// it silently re-routes a prompt to Task Runner, which is a surprise when the
// user only wanted to ask something. Every default engine in the UI reads THIS
// constant, so the choice lives in one place.
export const DEFAULT_ENGINE = 'chat'

// The card-level slice of the Host's approval ladder. The names and the labels
// are the Host's own (`normal` / `trust_reads` / `trust`, shown in chat as
// Normal / Reads / Trust), so a card says the same thing the chat picker says
// about the same session.
//
// `yolo` is deliberately NOT a card setting: it is a PROCESS-WIDE switch in the
// Host (it turns off approvals in every chat, not this card), it is SEL-audited
// on activation, and it can be refused by the enterprise governance ceiling.
// Offering it per card would be a lie about its scope, so the board exposes it
// only as what it is — a global toggle — and hands it to the Host's own audited
// endpoint rather than setting it here.
export const APPROVAL_MODES = [
  { id: 'normal', label: 'Normal', help: 'Asks before running anything' },
  { id: 'trust_reads', label: 'Reads', help: 'Looks things up on its own, asks before changes' },
  { id: 'trust', label: 'Trust', help: 'Runs this card without asking' },
]

export const APPROVAL_MODE_LABELS = Object.fromEntries(APPROVAL_MODES.map(mode => [mode.id, mode.label]))

export const DEFAULT_APPROVAL_MODE = 'normal'

/** A card's approval mode, tolerant of a record written before the field existed. */
export const taskApprovalMode = task => (
  APPROVAL_MODE_LABELS[task?.approval_mode] ? task.approval_mode : DEFAULT_APPROVAL_MODE
)

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

// The FIRST non-empty line of an agent summary, reduced to prose.
//
// The outcome pane renders that same summary as real markdown, so this is the
// one place the raw syntax would still be visible: the impact header is a single
// line and cannot host block elements, which is why it STRIPS the markup rather
// than rendering it. Without the inline pass a heading- or emphasis-heavy result
// reads as `` `main` and **three fixes** `` right above a pane that renders the
// identical text properly, which looks like the renderer failed.
//
// Images before links, because an image is a link with a leading `!` and the
// link pass would otherwise leave the `!` behind.
const cleanLine = value => String(value || '')
  .split('\n')
  .map(line => line
    .replace(/^\s*>+\s*/, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|#{1,6}\s*)/, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/(\*\*\*|___)(.*?)\1/g, '$2')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(?=\S)(.*?)(?<=\S)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .trim())
  .find(Boolean) || ''

export { cleanLine }

// The first line of PROSE, which is not the same as the first non-empty line.
//
// An agent summary very often opens with a heading — `## Summary` — and taking
// the first line there renders a card whose entire body is the word "Summary".
// Headings are therefore skipped while any real content follows, and only used
// as the answer when the text is nothing but a heading.
const cleanProse = value => {
  const lines = String(value || '').split('\n')
  let headingFallback = ''
  for (const line of lines) {
    const isHeading = /^\s*#{1,6}\s/.test(line)
    const cleaned = cleanLine(line)
    if (!cleaned) continue
    if (isHeading) {
      if (!headingFallback) headingFallback = cleaned
      continue
    }
    return cleaned
  }
  return headingFallback
}

export { cleanProse }

// What the card's one body line says, which depends ENTIRELY on where the task is.
//
// The old card read `result_packet.summary` and nothing else, so a card that had
// never run rendered with no body at all — the state most cards on a board are
// in, and the one where the user most needs to know what the card is for. Each
// branch names the most recent thing that happened, and every branch is
// non-empty as long as the card carries any text at all.
//
// `cleanLine` runs on the agent-authored branches because a summary is raw
// markdown: without it a heading- or emphasis-heavy result leaks `##` and `**`
// onto the card. The user-authored branches are already plain prose.
export function cardBody(task) {
  const latest = task.executions?.length ? task.executions[task.executions.length - 1] : null
  const packet = taskResultPacket(task)
  if (task.status === 'running') {
    return {
      text: cleanProse(latest?.progress_detail || latest?.progress || packet.summary) || 'The agent is working on this task.',
      tone: 'live',
    }
  }
  if (task.status === 'failed') {
    return { text: cleanProse(latest?.error || packet.summary) || 'The latest run needs attention.', tone: 'error' }
  }
  if (task.status === 'done') {
    return { text: cleanProse(packet.summary || latest?.summary) || 'The run finished — review the evidence.', tone: 'result' }
  }
  // Never run: the card's own text is the only thing that exists, and it is what
  // the user wrote, so it needs no markdown stripping.
  const intent = task.description || task.goal?.objective || task.prompt || ''
  return { text: intent, tone: 'intent' }
}

// The one short qualifier on the meta line, or '' when the surrounding chrome
// already says it. A Backlog card in the Backlog column saying "Not started" is
// the redundancy this deliberately returns nothing for — and so is a running
// card saying "Working" next to a Running chip and a spinner.
export function cardQualifier(task) {
  const progress = taskProgress(task)
  // Only a REAL measurement earns space here; the indeterminate label is the
  // word the chip already carries.
  if (task.status === 'running') return progress.determinate ? progress.label : ''
  if (task.status === 'failed') return ''
  if (task.status === 'done') {
    const criteria = taskVerification(task).filter(check => check.required !== false)
    const passed = criteria.filter(check => check.status === 'passed').length
    return criteria.length ? `${passed}/${criteria.length} verified` : ''
  }
  return ''
}

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
