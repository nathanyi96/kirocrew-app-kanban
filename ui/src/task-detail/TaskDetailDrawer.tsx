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
import PermissionBar from './PermissionBar.tsx'

const activityLabel = { display: 'block', fontSize: 11, fontWeight: 650, color: T.strong }

// The drawer is non-modal and the board stays interactive beside it, so the
// width is the user's call: a card whose outcome is a wall of markdown wants a
// wide pane, and picking another card wants a narrow one.
const MIN_WIDTH = 320
// 620, up from 440. The pane hosts markdown results, code blocks and a
// verification list; 440 held ~48 characters, which wrapped a diff into noodles.
// 620 holds ~72 and still leaves three lanes of a 1440-wide board visible.
const DEFAULT_WIDTH = 620
const WIDTH_KEY = 'kanban:drawer-width'

// The board reserves space for the drawer by padding itself, and it reads THIS
// custom property to do it. Publishing the live width is what fixes the older
// decoupling bug: the padding was a second hardcoded 440, so every pixel the
// user dragged past the default covered a board lane — and the lanes are drop
// targets, so it broke dragging, not just the view.
const WIDTH_VAR = '--kanban-drawer-w'

// The ceiling is relative to the CONTENT AREA the drawer is docked in, not the
// window: the dashboard shell spends width on its rail and panels, so 92vw could
// hand the drawer more than the board has and cover the lanes entirely. It is
// recomputed on every clamp rather than captured once — a window the user shrinks
// after dragging would otherwise keep a width wider than the area.
let hostElement = null
const hostBox = () => {
  const box = hostElement?.getBoundingClientRect()
  return box && box.width > 0 ? box : { right: window.innerWidth, width: window.innerWidth }
}
const maxWidth = () => Math.max(MIN_WIDTH, Math.min(920, Math.round(hostBox().width * 0.92)))
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

// The handle sits INSIDE the panel's own edge (left: 0), not protruding past it.
// A negative offset put the grab strip outside the drawer's box, where it depends
// on nothing else being painted there and on no ancestor having re-anchored the
// panel — both of which are outside this app's control, and either one makes the
// drawer silently un-resizable. Inside the edge it is always grabbable.
const handleStyle = {
  position: 'absolute', left: 0, top: 0, bottom: 0, width: 12,
  cursor: 'col-resize', pointerEvents: 'auto', zIndex: 2,
  // touchAction none is what makes a touch drag resize instead of scrolling the
  // page under the drawer.
  touchAction: 'none', background: 'transparent', border: 'none', padding: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

export default function TaskDetailDrawer({ task, pendingApproval = null, onClose, onMove, onRun, onDelete, onOpenEngine, onFeedback, onConfigureGoal, onGoalAction, onApproval = () => {}, onApprovalMode = () => {}, onHostYolo = () => {} }) {
  const [activeTab, setActiveTab] = useState(() => defaultTaskTab(task))
  const [width, setWidth] = useState(readWidth)
  const rootRef = useRef(null)
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

  // Click-away dismiss WITHOUT a scrim. A full-screen backdrop would make the
  // drawer modal and swallow every board gesture behind it — the lanes are drop
  // targets and the view switcher must stay live — so the outside click is
  // detected on the document instead.
  //
  // Three things are deliberately NOT an outside click:
  //   - a pointer inside the drawer (including the resize handle, which sits
  //     outside the panel's own box but inside this root);
  //   - a card, because picking another card must SWITCH the drawer, and this
  //     listener would otherwise close it in the same gesture that selects;
  //   - anything inside another dialog or menu (create form, move menu, the
  //     Task Runner prompt), which own their own dismissal.
  useEffect(() => {
    const onPointerDown = event => {
      if (dragging.current) return
      const target = event.target
      if (!(target instanceof Element)) return
      if (rootRef.current?.contains(target)) return
      if (target.closest('[data-task-id]')) return
      if (target.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) return
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [onClose])

  // One writer for the width, so the ref the drag and the resize listener read
  // can never drift from the state React renders — nor from the custom property
  // the board pads itself with.
  const applyWidth = (value, persist = false) => {
    const next = clampWidth(value)
    widthRef.current = next
    setWidth(next)
    try { document.documentElement.style.setProperty(WIDTH_VAR, `${next}px`) } catch { /* padding falls back to the default */ }
    if (persist) writeWidth(next)
  }

  // Publish the opening width, and drop the property when the drawer closes so
  // the board does not keep reserving space for a pane that is gone.
  useEffect(() => {
    // `offsetParent` is the positioned board root the drawer is docked inside —
    // the box every width calculation must measure against.
    hostElement = rootRef.current?.offsetParent || null
    applyWidth(widthRef.current)
    return () => {
      hostElement = null
      try { document.documentElement.style.removeProperty(WIDTH_VAR) } catch { /* see above */ }
    }
  }, [])

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
    // Pointer capture keeps the drag alive when the cursor outruns the handle,
    // which it always does. It can throw for a pointer id the element does not
    // own; the drag still works off the handle's own move events, so a throw
    // must not abort the gesture before `userSelect` is suppressed.
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch { /* move events still arrive */ }
    document.body.style.userSelect = 'none'
  }
  const onDrag = event => {
    if (!dragging.current) return
    // The drawer is pinned to the RIGHT EDGE OF THE BOARD AREA, so its width is
    // the distance from the pointer to that edge — not to the window edge, which
    // differs from it whenever the dashboard shows anything beside the board.
    applyWidth(hostBox().right - event.clientX)
  }
  const endDrag = event => {
    if (!dragging.current) return
    dragging.current = false
    try { event.currentTarget.releasePointerCapture?.(event.pointerId) } catch { /* capture may never have been taken */ }
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

  // `absolute`, not `fixed`. Fixed made the drawer a VIEWPORT panel: it spanned
  // the dashboard's own top bar and rail, and it depended on no ancestor having
  // re-anchored it (a transform, filter or `contain` anywhere above turns `fixed`
  // into "relative to that box" and moves the drawer somewhere nobody asked for).
  // Docked inside the board's own positioned root, its geometry is the board's
  // geometry, which is the only box this app actually controls.
  return _jsx('div', { ref: rootRef, style: { position: 'absolute', top: 0, right: 0, bottom: 0, width, zIndex: 30, display: 'flex', flexDirection: 'column', pointerEvents: 'none' }, children: [
    _jsx('div', {
      role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Resize task detail',
      'aria-valuenow': width, 'aria-valuemin': MIN_WIDTH, 'aria-valuemax': maxWidth(), tabIndex: 0,
      title: 'Drag to resize · double-click to reset',
      onPointerDown: startDrag, onPointerMove: onDrag, onPointerUp: endDrag, onPointerCancel: endDrag,
      onKeyDown: onHandleKeyDown, onDoubleClick: () => applyWidth(DEFAULT_WIDTH, true),
      className: 'kanban-drawer-grip',
      style: handleStyle,
      // A grab strip nobody can see is a feature nobody finds: the grip is faint
      // at rest and lights up on hover or keyboard focus (CSS in App.tsx).
    }, _jsx('span', { className: 'kanban-drawer-grip-bar', 'aria-hidden': true }, 'bar')),
    _jsx('div', { role: 'dialog', 'aria-modal': false, 'aria-label': 'Task detail', style: { pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.elevated, borderLeft: `1px solid ${T.borderStrong}`, borderRadius: '14px 0 0 14px', boxShadow: '-12px 0 36px rgba(0,0,0,0.18)', animation: 'kanban-drawer-in 180ms ease-out' }, children: [
    _jsx(TaskImpactHeader, { task, latest, onClose, onMove, onRun, onDelete, onOpenEngine }, 'header'),
    _jsx(TaskResourceTabs, { activeTab, onChange: setActiveTab, counts }, 'tabs'),
    _jsx('div', { role: 'tabpanel', style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 18px 24px' }, children: panel }, 'panel'),
    _jsx(PermissionBar, { task, pendingApproval, onApproval, onApprovalMode, onHostYolo }, 'permission'),
    _jsx('footer', { style: { padding: '10px 12px 12px', borderTop: `1px solid ${T.border}`, background: T.card }, children: _jsx(FeedbackComposer, { task, latest, onFeedback, onOpenEngine }) }, 'composer'),
    ] }, 'panel'),
  ] })
}
