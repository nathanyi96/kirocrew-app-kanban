import { useEffect, useMemo, useRef, useState } from 'react'
import { jsx as _jsx } from 'react/jsx-runtime'
import { T } from '../theme.ts'
import { defaultTaskTab, taskActivities, taskArtifacts, taskResourceGroups, taskSteps } from '../lib/task-utils.ts'
import TaskImpactHeader from './TaskImpactHeader.tsx'
import TaskResourceTabs from './TaskResourceTabs.tsx'
import OutcomePane from './OutcomePane.tsx'
import GoalPane from './GoalPane.tsx'
import TaskResourcePane from './TaskResourcePane.tsx'
import ActivityTimeline from './ActivityTimeline.tsx'
import FeedbackComposer from './FeedbackComposer.tsx'

const activityLabel = { display: 'block', fontSize: 11, fontWeight: 650, color: T.strong }

// The drawer is non-modal and the board stays interactive beside it, so the
// width is the user's call: a card whose outcome is a wall of markdown wants a
// wide pane, and picking another card wants a narrow one.
const MIN_WIDTH = 320
const DEFAULT_WIDTH = 440
const WIDTH_KEY = 'kanban:drawer-width'

// The ceiling is viewport-relative so the board never ends up fully covered on
// a laptop, and it is recomputed on every clamp rather than captured once —
// a window the user shrinks after dragging would otherwise keep a width wider
// than the screen.
const maxWidth = () => Math.max(MIN_WIDTH, Math.min(920, Math.round(window.innerWidth * 0.92)))
const clampWidth = value => Math.min(Math.max(Math.round(value), MIN_WIDTH), maxWidth())

// localStorage throws, not returns null, when the browser blocks storage
// (private mode, a hardened profile). Both directions are guarded so the drawer
// still opens at a usable width instead of the whole pane failing to render.
const readWidth = () => {
  try {
    const stored = Number(window.localStorage.getItem(WIDTH_KEY))
    return clampWidth(stored > 0 ? stored : DEFAULT_WIDTH)
  } catch {
    return clampWidth(DEFAULT_WIDTH)
  }
}
const writeWidth = value => {
  try { window.localStorage.setItem(WIDTH_KEY, String(value)) } catch { /* width still applies for this session */ }
}

const handleStyle = {
  position: 'absolute', left: -3, top: 0, bottom: 0, width: 10,
  cursor: 'col-resize', pointerEvents: 'auto', zIndex: 1,
  // touchAction none is what makes a touch drag resize instead of scrolling the
  // page under the drawer.
  touchAction: 'none', background: 'transparent', border: 'none', padding: 0,
}

export default function TaskDetailDrawer({ task, onClose, onMove, onRun, onDelete, onOpenEngine, onFeedback, onConfigureGoal, onGoalAction }) {
  const [activeTab, setActiveTab] = useState(() => defaultTaskTab(task))
  const [width, setWidth] = useState(readWidth)
  const widthRef = useRef(width)
  const dragging = useRef(false)
  const previousState = useRef(task.goal?.status || task.status)
  const latest = task.executions?.length ? task.executions[task.executions.length - 1] : null
  const activities = useMemo(() => taskActivities(task), [task])
  const artifacts = useMemo(() => taskArtifacts(task), [task])
  const resources = useMemo(() => taskResourceGroups(task), [task])
  const steps = useMemo(() => taskSteps(task, artifacts), [task, artifacts])

  useEffect(() => setActiveTab(defaultTaskTab(task)), [task.id])
  useEffect(() => {
    const currentState = task.goal?.status || task.status
    if (previousState.current !== currentState) setActiveTab(defaultTaskTab(task))
    previousState.current = currentState
  }, [task.goal?.status, task.status])
  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  // One writer for the width, so the ref the drag and the resize listener read
  // can never drift from the state React renders.
  const applyWidth = (value, persist = false) => {
    const next = clampWidth(value)
    widthRef.current = next
    setWidth(next)
    if (persist) writeWidth(next)
  }

  // A viewport the user shrinks after dragging would otherwise leave the drawer
  // wider than the screen, so the stored width is re-clamped against the new one.
  useEffect(() => {
    const onResize = () => applyWidth(widthRef.current)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const startDrag = event => {
    event.preventDefault()
    dragging.current = true
    // Pointer capture keeps the drag alive when the cursor outruns the 10px
    // handle, which it always does.
    event.currentTarget.setPointerCapture?.(event.pointerId)
    document.body.style.userSelect = 'none'
  }
  const onDrag = event => {
    if (!dragging.current) return
    // The drawer is pinned to the right edge, so its width is the distance from
    // the pointer to that edge.
    applyWidth(window.innerWidth - event.clientX)
  }
  const endDrag = event => {
    if (!dragging.current) return
    dragging.current = false
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    document.body.style.userSelect = ''
    writeWidth(widthRef.current)
  }
  const onHandleKeyDown = event => {
    // Left widens because the drawer grows leftwards from the right edge.
    if (event.key === 'ArrowLeft') { event.preventDefault(); applyWidth(widthRef.current + 24, true) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); applyWidth(widthRef.current - 24, true) }
    else if (event.key === 'Home') { event.preventDefault(); applyWidth(maxWidth(), true) }
    else if (event.key === 'End') { event.preventDefault(); applyWidth(MIN_WIDTH, true) }
  }

  const counts = {
    goal: task.goal?.criteria?.length || steps.length,
    artifacts: artifacts.length,
    changes: resources.changes.length,
    audit: activities.length,
  }

  const focusComposer = () => document.getElementById(`kanban-feedback-${task.id}`)?.focus()
  const panel = activeTab === 'goal'
    ? _jsx(GoalPane, { task, onConfigureGoal, onContinue: onRun, onPause: current => onGoalAction(current, 'pause') })
    : activeTab === 'artifacts'
      ? _jsx(TaskResourcePane, { kind: 'artifacts', resources: artifacts })
      : activeTab === 'changes'
        ? _jsx(TaskResourcePane, { kind: 'changes', resources: resources.changes })
        : activeTab === 'audit'
        ? _jsx(ActivityTimeline, { activities, artifacts, label: activityLabel })
        : _jsx(OutcomePane, { task, onAccept: current => onGoalAction(current, 'accept'), onContinue: onRun, onRequestChanges: focusComposer })

  return _jsx('div', { style: { position: 'fixed', top: 0, right: 0, bottom: 0, width, zIndex: 50, display: 'flex', flexDirection: 'column', pointerEvents: 'none' }, children: [
    _jsx('div', {
      role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Resize task detail',
      'aria-valuenow': width, 'aria-valuemin': MIN_WIDTH, 'aria-valuemax': maxWidth(), tabIndex: 0,
      onPointerDown: startDrag, onPointerMove: onDrag, onPointerUp: endDrag, onPointerCancel: endDrag,
      onKeyDown: onHandleKeyDown, onDoubleClick: () => applyWidth(DEFAULT_WIDTH, true),
      style: handleStyle,
    }, 'resize'),
    _jsx('div', { role: 'dialog', 'aria-modal': false, 'aria-label': 'Task detail', style: { pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.elevated, borderLeft: `1px solid ${T.borderStrong}`, borderRadius: '14px 0 0 14px', boxShadow: '-12px 0 36px rgba(0,0,0,0.18)', animation: 'kanban-drawer-in 180ms ease-out' }, children: [
    _jsx(TaskImpactHeader, { task, latest, onClose, onMove, onRun, onDelete, onOpenEngine }, 'header'),
    _jsx(TaskResourceTabs, { activeTab, onChange: setActiveTab, counts }, 'tabs'),
    _jsx('div', { role: 'tabpanel', style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 18px 24px' }, children: panel }, 'panel'),
    _jsx('footer', { style: { padding: '10px 12px 12px', borderTop: `1px solid ${T.border}`, background: T.card }, children: _jsx(FeedbackComposer, { task, latest, onFeedback, onOpenEngine }) }, 'composer'),
    ] }, 'panel'),
  ] })
}
