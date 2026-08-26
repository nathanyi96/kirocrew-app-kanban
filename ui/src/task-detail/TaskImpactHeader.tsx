import { useEffect, useState } from 'react'
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T, toneBorder, toneColor, toneSurface } from '../theme.ts'
import { COLUMNS, DROP_TARGETS, taskEngine, taskFocus, taskProgress, taskRunBlocker, taskStateMeta } from '../lib/task-utils.ts'
import { formatTime } from '../lib/formatting.ts'
import IconButton from '../components/IconButton.tsx'
import EngineBadge from '../components/EngineBadge.tsx'

const { ExternalLink, Play, RotateCw, Trash2, X } = lucide

export default function TaskImpactHeader({ task, latest, onClose, onMove, onRun, onDelete, onOpenEngine }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const running = task.status === 'running'
  const currentEngine = taskEngine(task)
  const focus = taskFocus(task)
  const state = taskStateMeta(task)
  const progress = taskProgress(task)
  const stateColor = toneColor(state.tone)
  const column = COLUMNS.find(item => item.id === task.status)
  const canOpen = latest && (latest.session_key || latest.runner_id)
  const openLabel = currentEngine === 'task_runner' ? 'Open the task runner' : 'Open the chat'
  const runLabel = task.executions?.length ? 'Run again' : 'Run'
  const runBlocker = taskRunBlocker(task)

  useEffect(() => setConfirmDelete(false), [task.id])

  return _jsxs('header', { style: { padding: '14px 16px 15px', background: 'linear-gradient(145deg, rgba(124,58,237,0.16), rgba(124,58,237,0.035) 58%, transparent)', borderBottom: `1px solid ${T.border}` }, children: [
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [
      _jsx('select', { 'aria-label': 'Move to', value: task.status, disabled: running, onChange: event => onMove(task.id, event.target.value), style: { maxWidth: 104, background: T.bg, color: column?.accent || T.text, border: `1px solid ${column?.accent || T.border}`, borderRadius: 999, fontSize: 10, fontWeight: 700, padding: '4px 8px', outline: 'none' }, children: (running ? COLUMNS.map(item => item.id) : DROP_TARGETS).map(status => _jsx('option', { value: status, children: COLUMNS.find(item => item.id === status)?.label || status }, status)) }),
      _jsx(EngineBadge, { engine: currentEngine }),
      _jsx('span', { style: { padding: '3px 7px', borderRadius: 999, border: `1px solid ${toneBorder(state.tone)}`, background: toneSurface(state.tone), color: stateColor, fontSize: 9, fontWeight: 750 }, children: state.label }),
      _jsxs('span', { style: { color: T.muted, fontSize: 10, whiteSpace: 'nowrap' }, children: ['Updated ', formatTime(task.updated_at)] }),
      _jsx('div', { style: { flex: 1 } }),
      canOpen && _jsx(IconButton, { label: openLabel, onClick: () => onOpenEngine(task, latest), style: { width: 28, height: 28, justifyContent: 'center', color: T.accent, background: T.accentSoft }, children: _jsx(ExternalLink, { size: 14 }) }),
      _jsx(IconButton, { label: running ? 'Agent is running' : runBlocker || runLabel, disabled: running || Boolean(runBlocker), onClick: () => onRun(task), style: { width: 28, height: 28, justifyContent: 'center', color: running ? T.warn : runBlocker ? T.muted : T.text, background: T.hover }, children: task.executions?.length ? _jsx(RotateCw, { size: 14, style: running ? { animation: 'kanban-spin 1s linear infinite' } : undefined }) : _jsx(Play, { size: 14 }) }),
      _jsx(IconButton, { label: confirmDelete ? 'Confirm delete task' : 'Delete task', onClick: () => { if (confirmDelete) onDelete(task.id); else setConfirmDelete(true) }, style: { width: 28, height: 28, justifyContent: 'center', color: confirmDelete ? T.danger : T.muted, background: confirmDelete ? 'rgba(239,68,68,0.12)' : 'transparent' }, children: _jsx(Trash2, { size: 14 }) }),
      _jsx(IconButton, { label: 'Close', onClick: onClose, style: { width: 28, height: 28, justifyContent: 'center' }, children: _jsx(X, { size: 16 }) }),
    ] }),
    _jsx('h2', { style: { margin: '18px 0 0', color: T.strong, fontSize: 20, lineHeight: 1.25, letterSpacing: '-0.018em', fontWeight: 680 }, children: task.title }),
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 9, marginTop: 9 }, children: [_jsx('p', { style: { flex: 1, margin: 0, color: T.muted, fontSize: 11, lineHeight: 1.45 }, children: task.goal?.objective || focus.current }), _jsx('span', { style: { flexShrink: 0, color: stateColor, fontSize: 9, fontWeight: 650 }, children: progress.label })] }),
    confirmDelete && _jsx('div', { role: 'status', style: { marginTop: 10, color: T.danger, fontSize: 10 }, children: 'Click the trash icon again to permanently delete this task.' }),
  ] })
}
