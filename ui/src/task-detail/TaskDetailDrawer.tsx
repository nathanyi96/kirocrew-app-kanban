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

export default function TaskDetailDrawer({ task, onClose, onMove, onRun, onDelete, onOpenEngine, onFeedback, onConfigureGoal, onGoalAction }) {
  const [activeTab, setActiveTab] = useState(() => defaultTaskTab(task))
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

  return _jsx('div', { style: { position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px, 78vw)', zIndex: 50, display: 'flex', flexDirection: 'column', pointerEvents: 'none' }, children: _jsx('div', { role: 'dialog', 'aria-modal': false, 'aria-label': 'Task detail', style: { pointerEvents: 'auto', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.elevated, borderLeft: `1px solid ${T.borderStrong}`, borderRadius: '14px 0 0 14px', boxShadow: '-12px 0 36px rgba(0,0,0,0.18)', animation: 'kanban-drawer-in 180ms ease-out' }, children: [
    _jsx(TaskImpactHeader, { task, latest, onClose, onMove, onRun, onDelete, onOpenEngine }, 'header'),
    _jsx(TaskResourceTabs, { activeTab, onChange: setActiveTab, counts }, 'tabs'),
    _jsx('div', { role: 'tabpanel', style: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 18px 24px' }, children: panel }, 'panel'),
    _jsx('footer', { style: { padding: '10px 12px 12px', borderTop: `1px solid ${T.border}`, background: T.card }, children: _jsx(FeedbackComposer, { task, latest, onFeedback, onOpenEngine }) }, 'composer'),
  ] }) })
}
