import { useEffect, useMemo, useState } from 'react'
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'
import { COLUMNS, DROP_TARGETS, ENGINE_OPTIONS, taskActivities, taskArtifacts, taskEngine } from '../lib/task-utils.ts'
import { formatTime } from '../lib/formatting.ts'
import IconButton from '../components/IconButton.tsx'
import EngineBadge from '../components/EngineBadge.tsx'
import AgentProgress from './AgentProgress.tsx'
import ActivityTimeline from './ActivityTimeline.tsx'
import ArtifactsList from './ArtifactsList.tsx'
import FeedbackComposer from './FeedbackComposer.tsx'
import ExecutionHistory from './ExecutionHistory.tsx'

const { ExternalLink, MessageSquare, Play, RotateCw, Trash2, X } = lucide

export default function TaskDetailDrawer({ task, onClose, onUpdate, onMove, onRun, onDelete, onOpenEngine, onFeedback }) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [prompt, setPrompt] = useState(task.prompt)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const isDirty = title !== task.title || description !== task.description || prompt !== task.prompt
  const latest = task.executions.length ? task.executions[task.executions.length - 1] : null
  const currentEngine = taskEngine(task)
  const running = task.status === 'running'
  const col = COLUMNS.find(c => c.id === task.status)
  const label = { display: 'block', fontSize: 11, fontWeight: 500, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }
  const input = { width: '100%', boxSizing: 'border-box', marginTop: 4, background: T.bg, color: T.strong, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }
  const activities = useMemo(() => taskActivities(task), [task])
  const artifacts = useMemo(() => taskArtifacts(task), [task])

  useEffect(() => { setTitle(task.title); setDescription(task.description); setPrompt(task.prompt); setConfirmDiscard(false) }, [task.id])
  const requestClose = () => isDirty ? setConfirmDiscard(true) : onClose()
  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isDirty])
  const save = () => { if (isDirty) onUpdate(task.id, { title, description, prompt }) }
  const primaryAction = running
    ? _jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.warn, padding: '8px 12px' }, children: [_jsx('span', { style: { width: 6, height: 6, borderRadius: '50%', background: T.warn } }), 'Running…'] })
    : _jsxs('button', { type: 'button', onClick: () => onRun(task), style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', border: 'none', borderRadius: 8, background: T.accent, color: '#fff' }, children: [task.executions.length ? _jsx(RotateCw, { size: 14 }) : _jsx(Play, { size: 14 }), task.executions.length ? 'Run again' : 'Run'] })
  const deleteAction = _jsxs('button', { type: 'button', onClick: () => { if (confirmDelete) onDelete(task.id); else setConfirmDelete(true) }, style: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', border: 'none', borderRadius: 8, background: 'rgba(239,68,68,0.12)', color: T.danger }, children: [_jsx(Trash2, { size: 14 }), confirmDelete ? 'Really delete?' : 'Delete'] })

  return _jsxs('div', { style: { position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(460px, 92vw)', zIndex: 50, display: 'flex', flexDirection: 'column', pointerEvents: 'none' }, children: [_jsxs('div', { role: 'dialog', 'aria-modal': false, 'aria-label': 'Task detail', style: { pointerEvents: 'auto', position: 'relative', width: '100%', height: '100%', background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '-12px 0 40px rgba(0,0,0,0.22)' }, children: [
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${T.border}` }, children: [_jsx('select', { 'aria-label': 'Move to', value: task.status, disabled: running, onChange: e => onMove(task.id, e.target.value), style: { background: T.bg, color: col ? col.accent : T.text, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11, fontWeight: 600, padding: '3px 8px' }, children: (running ? COLUMNS.map(c => c.id) : DROP_TARGETS).map(s => _jsx('option', { value: s, children: COLUMNS.find(c => c.id === s).label }, s)) }), _jsxs('span', { style: { marginLeft: 'auto', fontSize: 10, color: T.muted }, children: ['Updated ', formatTime(task.updated_at)] }), _jsx(IconButton, { label: 'Close', onClick: requestClose, children: _jsx(X, { size: 16 }) })] }),
    _jsx('div', { style: { flex: 1, overflowY: 'auto', padding: 20 }, children: _jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 18 }, children: [
      _jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 14 }, children: [_jsxs('div', { children: [_jsx('label', { htmlFor: 'kanban-detail-title', style: label, children: 'Title' }), _jsx('input', { id: 'kanban-detail-title', value: title, onChange: e => setTitle(e.target.value), style: input })] }), _jsxs('div', { children: [_jsx('label', { htmlFor: 'kanban-detail-desc', style: label, children: 'Description' }), _jsx('textarea', { id: 'kanban-detail-desc', value: description, onChange: e => setDescription(e.target.value), style: { ...input, minHeight: 65, resize: 'vertical' } })] }), _jsxs('div', { children: [_jsx('label', { htmlFor: 'kanban-detail-prompt', style: label, children: 'Execution prompt' }), _jsx('textarea', { id: 'kanban-detail-prompt', value: prompt, onChange: e => setPrompt(e.target.value), style: { ...input, minHeight: 100, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 } })] }), isDirty && _jsx('button', { type: 'button', onClick: save, style: { width: '100%', border: 'none', borderRadius: 8, padding: 9, background: T.accent, color: '#fff' }, children: 'Save changes' })] }),
      _jsx(AgentProgress, { task, latest, label }),
      _jsx(ActivityTimeline, { activities, label }),
      _jsx(ArtifactsList, { artifacts, label }),
      _jsx(FeedbackComposer, { task, onFeedback, label }),
      _jsxs('div', { children: [_jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx(EngineBadge, { engine: currentEngine }), _jsx('span', { style: { fontSize: 11, color: T.muted }, children: ENGINE_OPTIONS.find(option => option.id === currentEngine)?.help })] }), latest && (latest.session_key || latest.runner_id) && _jsx('button', { type: 'button', onClick: () => onOpenEngine(task, latest), title: currentEngine === 'task_runner' ? 'Open the task runner' : 'Open the chat', 'aria-label': currentEngine === 'task_runner' ? 'Open the task runner' : 'Open the chat', style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, marginTop: 10, background: T.accentSoft, color: T.accent, border: '1px solid rgba(124,58,237,0.3)', borderRadius: 7 }, children: _jsx(ExternalLink, { size: 13 }) })] }),
      _jsx(ExecutionHistory, { task, onOpenEngine, label }),
    ] }) }),
    _jsxs('div', { style: { display: 'flex', gap: 8, padding: '12px 20px', borderTop: `1px solid ${T.border}` }, children: [primaryAction, deleteAction] }),
    confirmDiscard && _jsxs('div', { role: 'alertdialog', style: { display: 'flex', gap: 8, padding: '10px 20px', borderTop: `1px solid ${T.border}`, background: 'rgba(234,179,8,0.08)', fontSize: 12 }, children: [_jsx('span', { style: { flex: 1 }, children: 'You have unsaved edits. Discard them?' }), _jsx('button', { type: 'button', onClick: () => setConfirmDiscard(false), children: 'Keep editing' }), _jsx('button', { type: 'button', onClick: onClose, children: 'Discard' })] }),
  ] })] })
}
