import { useCallback, useMemo, useState } from 'react'
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import { useNavigate } from '@kirocrew/app-sdk'
import lucide from 'lucide-react'
import { api, jsonBody } from './api/kanbanApi.ts'
import { T, actionPill } from './theme.ts'
import { COLUMNS } from './lib/task-utils.ts'
import { flatSort, readViewMode, writeViewMode } from './lib/view-mode.ts'
import useTasks from './hooks/useTasks.ts'
import useGroups from './hooks/useGroups.ts'
import TaskCard from './components/TaskCard.tsx'
import KanbanColumn from './components/KanbanColumn.tsx'
import TaskGrid from './components/TaskGrid.tsx'
import GroupedGrid from './components/GroupedGrid.tsx'
import ViewSwitcher from './components/ViewSwitcher.tsx'
import MoveMenu from './components/MoveMenu.tsx'
import CreateTaskForm from './components/CreateTaskForm.tsx'
import TaskDetailDrawer from './task-detail/TaskDetailDrawer.tsx'

const { AlertCircle, KanbanSquare, Plus, Search, X } = lucide

export default function App() {
  const navigate = useNavigate()
  const { tasks, loading, refresh } = useTasks()
  const [view, setView] = useState(readViewMode)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [draftPrompt, setDraftPrompt] = useState('')
  const [draftEngine, setDraftEngine] = useState('auto')
  const [draftGoal, setDraftGoal] = useState(null)
  const [moveMenuTask, setMoveMenuTask] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [taskRunnerPrompt, setTaskRunnerPrompt] = useState(null)
  const [runBusyId, setRunBusyId] = useState(null)

  const onError = useCallback(err => setActionError(err instanceof Error ? err.message : String(err)), [])
  const handleMove = useCallback((taskId, status) => api(`/tasks/${taskId}/move`, jsonBody({ status })).then(refresh).catch(onError), [refresh, onError])
  const handleRun = useCallback(task => {
    setRunBusyId(task.id)
    api(`/tasks/${task.id}/run`, jsonBody({})).then(refresh).catch(err => {
      if (err?.code === 'task_runner_not_enabled') { setTaskRunnerPrompt({ task, message: err.message, action: err.action }); return }
      onError(err)
    }).finally(() => setRunBusyId(null))
  }, [refresh, onError])
  const handleCreate = useCallback(({ prompt, engine, goal }) => {
    setShowCreateForm(false)
    api('/tasks', jsonBody({ prompt, status: 'todo', engine, goal })).then(() => { setDraftPrompt(''); setDraftEngine('auto'); setDraftGoal(null); refresh() }).catch(err => { setDraftPrompt(prompt); setDraftEngine(engine); setDraftGoal(goal || null); setShowCreateForm(true); onError(err) })
  }, [refresh, onError])
  const handleDelete = useCallback(id => api(`/tasks/${id}`, { method: 'DELETE' }).then(() => { setSelectedId(null); refresh() }).catch(onError), [refresh, onError])
  const handleOpenEngine = useCallback((task, execution) => {
    const engine = execution?.engine || task.active_engine || task.engine || 'auto'
    if (engine === 'task_runner') { navigate('/projects'); return }
    if (execution?.session_key) { navigate(`/chat?sid=${encodeURIComponent(execution.session_key)}`); return }
    setActionError('This task has not started an engine session yet.')
  }, [navigate])
  const handleFeedback = useCallback((task, message) => {
    const latest = task.executions?.[task.executions.length - 1]
    if (!latest?.session_key && !latest?.runner_id) { setActionError('Run this task first to create an agent execution.'); return false }
    return api(`/tasks/${task.id}/feedback`, jsonBody({ message })).then(() => { refresh(); return true }).catch(err => { onError(err); return false })
  }, [refresh, onError])
  const handleConfigureGoal = useCallback(task => api(`/tasks/${task.id}/goal`, jsonBody({ goal: {
    mode: 'loop',
    objective: task.prompt || task.title,
    criteria: [
      'The requested outcome is implemented',
      'Relevant checks pass without regressions',
      'The final result and produced artifacts are summarized',
    ],
    max_attempts: 3,
    max_minutes: 60,
    token_budget: 50000,
  } })).then(refresh).catch(onError), [refresh, onError])
  const handleGoalAction = useCallback((task, action) => api(`/tasks/${task.id}/goal/action`, jsonBody({ action })).then(refresh).catch(onError), [refresh, onError])

  const needle = search.trim().toLowerCase()
  const filtered = useMemo(() => needle ? tasks.filter(t => t.title.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle) || t.prompt.toLowerCase().includes(needle) || t.tags.some(tag => tag.toLowerCase().includes(needle))) : tasks, [tasks, needle])
  const selectedTask = tasks.find(t => t.id === selectedId) || null
  const byColumn = status => filtered.filter(t => t.status === status).sort((a, b) => b.updated_at - a.updated_at)

  // Groupings are only fetched for the two views that group, so opening the
  // board never triggers a clustering pass. `boardRevision` re-fetches when the
  // set of cards changes — not on every poll, which would re-ask about a board
  // whose only change was a progress line.
  const grouping = view === 'cluster' || view === 'project'
  const boardRevision = useMemo(() => tasks.map(t => t.id).sort().join(','), [tasks])
  const { groups, regroup } = useGroups(grouping, boardRevision)

  const renderCard = variant => task => _jsx(TaskCard, {
    task,
    variant,
    onClick: t => setSelectedId(t.id),
    onRun: task.status === 'running' ? undefined : handleRun,
    onOpenEngine: handleOpenEngine,
    onMoveMenu: setMoveMenuTask,
    runBusy: runBusyId === task.id,
  }, task.id)

  // The API returns groups as id lists; resolving them against the FILTERED set
  // keeps search working inside a grouped view, and drops a group the search
  // emptied instead of rendering a header over nothing.
  const resolveGroups = source => (source || [])
    .map(group => ({
      ...group,
      tasks: flatSort(group.task_ids.map(id => filtered.find(t => t.id === id)).filter(Boolean)),
    }))
    .filter(group => group.tasks.length)

  const boardBody = () => {
    if (view === 'flat') {
      return _jsx(TaskGrid, { tasks: flatSort(filtered), renderCard: renderCard('flat'), emptyLabel: needle ? 'No tasks match your search' : 'No tasks yet' })
    }
    if (view === 'cluster') {
      return _jsx(GroupedGrid, {
        groups: resolveGroups(groups.clusters),
        renderCard: renderCard('flat'),
        aiLabelled: true,
        refreshing: Boolean(groups.clusters_refreshing),
        onRefresh: regroup,
        emptyLabel: 'No groups yet — the first pass runs in the background.',
      })
    }
    if (view === 'project') {
      return _jsx(GroupedGrid, {
        groups: resolveGroups(groups.projects),
        renderCard: renderCard('flat'),
        emptyLabel: 'No projects yet',
      })
    }
    return _jsx('div', { style: { display: 'flex', gap: 12, height: '100%', minWidth: 'min-content' }, children: COLUMNS.map(column => _jsx(KanbanColumn, { column, tasks: byColumn(column.id), onDropTask: handleMove, children: byColumn(column.id).map(renderCard('board')) }, column.id)) })
  }

  return _jsxs('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', paddingRight: selectedTask ? 'min(var(--kanban-drawer-w, 620px), 92vw)' : 0, transition: 'padding-right 180ms ease-out', color: T.text, fontSize: 14 }, children: [
    _jsx('style', { children: '@keyframes kanban-spin { from { transform: rotate(0) } to { transform: rotate(360deg) } } @keyframes kanban-drawer-in { from { transform: translateX(18px) } to { transform: translateX(0) } } @keyframes kanban-indeterminate { from { transform: translateX(-120%) } to { transform: translateX(330%) } } .kanban-card-actions { max-height: 0; opacity: 0; overflow: hidden; transition: max-height 140ms ease-out, opacity 140ms ease-out } .kanban-card:hover .kanban-card-actions, .kanban-card:focus-within .kanban-card-actions, .kanban-card:focus-visible .kanban-card-actions { max-height: 26px; opacity: 1 } @media (prefers-reduced-motion: reduce) { .kanban-card-actions { transition: none } }' }),
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 16px 12px' }, children: [
      _jsxs('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 }, children: [_jsx('h1', { style: { margin: 0, fontSize: 19, fontWeight: 600, color: T.strong }, children: 'Kanban' }), _jsxs('span', { style: { fontSize: 12, color: T.muted }, children: [String(tasks.length), ' tasks'] })] }),
      _jsx(ViewSwitcher, { view, onChange: nextView => { setView(nextView); writeViewMode(nextView) } }),
      _jsxs('button', { type: 'button', onClick: () => setShowCreateForm(true), style: { display: 'inline-flex', alignItems: 'center', gap: 6, background: T.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }, children: [_jsx(Plus, { size: 14 }), 'New task'] }),
      _jsxs('div', { style: { position: 'relative', display: 'inline-flex', alignItems: 'center' }, children: [_jsx(Search, { size: 14, style: { position: 'absolute', left: 10, color: T.muted, pointerEvents: 'none' } }), _jsx('input', { 'aria-label': 'Search tasks', placeholder: 'Search tasks…', value: search, onChange: e => setSearch(e.target.value), style: { background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px 7px 32px', fontSize: 12, width: 200, outline: 'none' } })] }),
      needle && _jsxs('span', { style: { fontSize: 11, color: T.muted }, children: [String(filtered.length), ' matches'] }),
    ] }),
    actionError && _jsxs('div', { role: 'alert', style: { display: 'flex', alignItems: 'flex-start', gap: 8, margin: '0 16px 12px', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.08)', fontSize: 12, color: T.danger }, children: [_jsx('span', { style: { flex: 1 }, children: actionError }), _jsx('button', { type: 'button', 'aria-label': 'Dismiss error', onClick: () => setActionError(null), style: { background: 'transparent', border: 'none', color: T.danger }, children: _jsx(X, { size: 14 }) })] }),
    taskRunnerPrompt && _jsx('div', { role: 'dialog', 'aria-modal': true, 'aria-label': 'Enable Task Runner', style: { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.46)' }, children: _jsxs('div', { style: { width: 'min(460px, 100%)', background: T.card, color: T.text, border: `1px solid ${T.borderStrong}`, borderRadius: 12, padding: 20 }, children: [_jsxs('div', { style: { display: 'flex', gap: 10 }, children: [_jsx(AlertCircle, { size: 18, style: { color: T.warn } }), _jsxs('div', { style: { flex: 1 }, children: [_jsx('h2', { style: { margin: 0, fontSize: 16, color: T.strong }, children: 'Enable Task Runner' }), _jsx('p', { style: { margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }, children: taskRunnerPrompt.message }), _jsx('p', { style: { margin: '8px 0 0', fontSize: 12, color: T.muted }, children: 'Nothing was started and this task remains ready to run.' })] }), _jsx('button', { type: 'button', 'aria-label': 'Close enable prompt', onClick: () => setTaskRunnerPrompt(null), style: { background: 'transparent', border: 'none', color: T.muted }, children: _jsx(X, { size: 15 }) })] }), _jsxs('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }, children: [_jsx('button', { type: 'button', onClick: () => setTaskRunnerPrompt(null), style: { ...actionPill, background: T.hover, color: T.text }, children: 'Not now' }), _jsx('button', { type: 'button', onClick: () => { setTaskRunnerPrompt(null); navigate(taskRunnerPrompt.action?.path || '/projects') }, style: { ...actionPill, background: T.accent, color: '#fff' }, children: taskRunnerPrompt.action?.label || 'Open Task Runner' })] })] }) }),
    _jsx('div', { style: { flex: 1, overflow: 'auto', padding: '0 16px 16px' }, children: loading ? _jsxs('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.muted }, children: [_jsx(KanbanSquare, { size: 20 }), _jsx('span', { style: { marginLeft: 8, fontSize: 13 }, children: 'Loading board…' })] }) : boardBody() }),
    selectedTask && _jsx(TaskDetailDrawer, { task: selectedTask, onClose: () => setSelectedId(null), onMove: handleMove, onRun: handleRun, onDelete: handleDelete, onOpenEngine: handleOpenEngine, onFeedback: handleFeedback, onConfigureGoal: handleConfigureGoal, onGoalAction: handleGoalAction }),
    moveMenuTask && _jsx(MoveMenu, { task: moveMenuTask, onMove: handleMove, onClose: () => setMoveMenuTask(null) }),
    showCreateForm && _jsx(CreateTaskForm, { initialPrompt: draftPrompt, initialEngine: draftEngine, initialGoal: draftGoal, onSubmit: handleCreate, onCancel: () => { setDraftPrompt(''); setDraftEngine('auto'); setDraftGoal(null); setShowCreateForm(false) } }),
  ] })
}
