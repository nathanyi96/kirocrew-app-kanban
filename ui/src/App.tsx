import { useCallback, useMemo, useState } from 'react'
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import { useNavigate } from '@kirocrew/app-sdk'
import lucide from 'lucide-react'
import { api, jsonBody } from './api/kanbanApi.ts'
import { T, actionPill } from './theme.ts'
import { COLUMNS } from './lib/task-utils.ts'
import useTasks from './hooks/useTasks.ts'
import TaskCard from './components/TaskCard.tsx'
import KanbanColumn from './components/KanbanColumn.tsx'
import MoveMenu from './components/MoveMenu.tsx'
import CreateTaskForm from './components/CreateTaskForm.tsx'
import TaskDetailDrawer from './task-detail/TaskDetailDrawer.tsx'

const { AlertCircle, KanbanSquare, Plus, Search, X } = lucide

export default function App() {
  const navigate = useNavigate()
  const { tasks, loading, refresh } = useTasks()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [draftPrompt, setDraftPrompt] = useState('')
  const [draftEngine, setDraftEngine] = useState('auto')
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
  const handleCreate = useCallback(({ prompt, engine }) => {
    setShowCreateForm(false)
    api('/tasks', jsonBody({ prompt, status: 'todo', engine })).then(() => { setDraftPrompt(''); setDraftEngine('auto'); refresh() }).catch(err => { setDraftPrompt(prompt); setDraftEngine(engine); setShowCreateForm(true); onError(err) })
  }, [refresh, onError])
  const handleUpdate = useCallback((id, patch) => api(`/tasks/${id}`, { ...jsonBody(patch), method: 'PATCH' }).then(refresh).catch(onError), [refresh, onError])
  const handleDelete = useCallback(id => api(`/tasks/${id}`, { method: 'DELETE' }).then(() => { setSelectedId(null); refresh() }).catch(onError), [refresh, onError])
  const handleOpenEngine = useCallback((task, execution) => {
    const engine = execution?.engine || task.active_engine || task.engine || 'auto'
    if (engine === 'task_runner') { navigate('/projects'); return }
    if (execution?.session_key) { navigate(`/chat?sid=${encodeURIComponent(execution.session_key)}`); return }
    setActionError('This task has not started an engine session yet.')
  }, [navigate])
  const handleFeedback = useCallback((task, message) => {
    if (!task.executions?.[task.executions.length - 1]?.session_key) { setActionError('Run this task first to create an agent session.'); return false }
    return api(`/tasks/${task.id}/feedback`, jsonBody({ message })).then(() => { refresh(); return true }).catch(err => { onError(err); return false })
  }, [refresh, onError])

  const needle = search.trim().toLowerCase()
  const filtered = useMemo(() => needle ? tasks.filter(t => t.title.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle) || t.prompt.toLowerCase().includes(needle) || t.tags.some(tag => tag.toLowerCase().includes(needle))) : tasks, [tasks, needle])
  const selectedTask = tasks.find(t => t.id === selectedId) || null
  const byColumn = status => filtered.filter(t => t.status === status).sort((a, b) => b.updated_at - a.updated_at)

  return _jsxs('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', paddingRight: selectedTask ? 'min(460px, 92vw)' : 0, transition: 'padding-right 180ms ease-out', color: T.text, fontSize: 14 }, children: [
    _jsx('style', { children: '@keyframes kanban-spin { from { transform: rotate(0) } to { transform: rotate(360deg) } }' }),
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 16px 12px' }, children: [
      _jsxs('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 }, children: [_jsx('h1', { style: { margin: 0, fontSize: 19, fontWeight: 600, color: T.strong }, children: 'Kanban' }), _jsxs('span', { style: { fontSize: 12, color: T.muted }, children: [String(tasks.length), ' tasks'] })] }),
      _jsxs('button', { type: 'button', onClick: () => setShowCreateForm(true), style: { display: 'inline-flex', alignItems: 'center', gap: 6, background: T.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, cursor: 'pointer' }, children: [_jsx(Plus, { size: 14 }), 'New task'] }),
      _jsxs('div', { style: { position: 'relative', display: 'inline-flex', alignItems: 'center' }, children: [_jsx(Search, { size: 14, style: { position: 'absolute', left: 10, color: T.muted, pointerEvents: 'none' } }), _jsx('input', { 'aria-label': 'Search tasks', placeholder: 'Search tasks…', value: search, onChange: e => setSearch(e.target.value), style: { background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px 7px 32px', fontSize: 12, width: 200, outline: 'none' } })] }),
      needle && _jsxs('span', { style: { fontSize: 11, color: T.muted }, children: [String(filtered.length), ' matches'] }),
    ] }),
    actionError && _jsxs('div', { role: 'alert', style: { display: 'flex', alignItems: 'flex-start', gap: 8, margin: '0 16px 12px', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.08)', fontSize: 12, color: T.danger }, children: [_jsx('span', { style: { flex: 1 }, children: actionError }), _jsx('button', { type: 'button', 'aria-label': 'Dismiss error', onClick: () => setActionError(null), style: { background: 'transparent', border: 'none', color: T.danger }, children: _jsx(X, { size: 14 }) })] }),
    taskRunnerPrompt && _jsx('div', { role: 'dialog', 'aria-modal': true, 'aria-label': 'Enable Task Runner', style: { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.46)' }, children: _jsxs('div', { style: { width: 'min(460px, 100%)', background: T.card, color: T.text, border: `1px solid ${T.borderStrong}`, borderRadius: 12, padding: 20 }, children: [_jsxs('div', { style: { display: 'flex', gap: 10 }, children: [_jsx(AlertCircle, { size: 18, style: { color: T.warn } }), _jsxs('div', { style: { flex: 1 }, children: [_jsx('h2', { style: { margin: 0, fontSize: 16, color: T.strong }, children: 'Enable Task Runner' }), _jsx('p', { style: { margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }, children: taskRunnerPrompt.message }), _jsx('p', { style: { margin: '8px 0 0', fontSize: 12, color: T.muted }, children: 'Nothing was started and this task remains ready to run.' })] }), _jsx('button', { type: 'button', 'aria-label': 'Close enable prompt', onClick: () => setTaskRunnerPrompt(null), style: { background: 'transparent', border: 'none', color: T.muted }, children: _jsx(X, { size: 15 }) })] }), _jsxs('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }, children: [_jsx('button', { type: 'button', onClick: () => setTaskRunnerPrompt(null), style: { ...actionPill, background: T.hover, color: T.text }, children: 'Not now' }), _jsx('button', { type: 'button', onClick: () => { setTaskRunnerPrompt(null); navigate(taskRunnerPrompt.action?.path || '/projects') }, style: { ...actionPill, background: T.accent, color: '#fff' }, children: taskRunnerPrompt.action?.label || 'Open Task Runner' })] })] }) }),
    _jsx('div', { style: { flex: 1, overflow: 'auto', padding: '0 16px 16px' }, children: loading ? _jsxs('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.muted }, children: [_jsx(KanbanSquare, { size: 20 }), _jsx('span', { style: { marginLeft: 8, fontSize: 13 }, children: 'Loading board…' })] }) : _jsx('div', { style: { display: 'flex', gap: 12, height: '100%', minWidth: 'min-content' }, children: COLUMNS.map(column => _jsx(KanbanColumn, { column, tasks: byColumn(column.id), onDropTask: handleMove, children: byColumn(column.id).map(task => _jsx(TaskCard, { task, onClick: t => setSelectedId(t.id), onRun: column.id === 'running' ? undefined : handleRun, onOpenEngine: handleOpenEngine, onMoveMenu: setMoveMenuTask, runBusy: runBusyId === task.id }, task.id)) }, column.id)) }) }),
    selectedTask && _jsx(TaskDetailDrawer, { task: selectedTask, onClose: () => setSelectedId(null), onUpdate: handleUpdate, onMove: handleMove, onRun: handleRun, onDelete: handleDelete, onOpenEngine: handleOpenEngine, onFeedback: handleFeedback }),
    moveMenuTask && _jsx(MoveMenu, { task: moveMenuTask, onMove: handleMove, onClose: () => setMoveMenuTask(null) }),
    showCreateForm && _jsx(CreateTaskForm, { initialPrompt: draftPrompt, initialEngine: draftEngine, onSubmit: handleCreate, onCancel: () => { setDraftPrompt(''); setDraftEngine('auto'); setShowCreateForm(false) } }),
  ] })
}
