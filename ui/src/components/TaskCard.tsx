import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'
import { ENGINE_LABELS, taskEngine } from '../lib/task-utils.ts'
import { relativeTime } from '../lib/formatting.ts'
import EngineBadge from './EngineBadge.tsx'

const { AlertCircle, Clock, GripVertical, Loader2, MessageSquare, Play } = lucide

export default function TaskCard({ task, onClick, onRun, onOpenEngine, onMoveMenu, runBusy }) {
  const latest = task.executions.length ? task.executions[task.executions.length - 1] : null
  const engine = taskEngine(task)
  const running = task.status === 'running'
  const failed = task.status === 'failed'
  const hasTarget = Boolean(latest && (latest.session_key || latest.runner_id))
  const stripe = failed ? T.danger : running ? T.warn : task.status === 'done' ? T.ok : T.borderStrong

  return _jsxs('div', {
    draggable: !running,
    onDragStart: e => { e.dataTransfer.setData('text/task-id', task.id); e.dataTransfer.effectAllowed = 'move' },
    onClick: () => onClick(task),
    role: 'button', tabIndex: 0,
    onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(task) } },
    style: { position: 'relative', background: T.card, border: `1px solid ${failed ? 'rgba(239,68,68,0.4)' : running ? 'rgba(234,179,8,0.4)' : T.border}`, borderRadius: 8, padding: '12px 12px 12px 18px', cursor: 'pointer' },
    children: [
      _jsx('span', { 'aria-hidden': true, style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: '8px 0 0 8px', background: stripe } }),
      _jsxs('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 8 }, children: [
        !running && _jsx(GripVertical, { size: 13, style: { color: T.muted, flexShrink: 0, marginTop: 2 }, 'aria-hidden': true }),
        _jsx('h4', { style: { margin: 0, flex: 1, fontSize: 13, fontWeight: 500, color: T.strong, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }, children: task.title }),
        task.refining && _jsxs('span', { title: 'Refining…', style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: T.muted, flexShrink: 0 }, children: [_jsx(Loader2, { size: 10, style: { animation: 'kanban-spin 1s linear infinite' } }), 'Refining…'] }),
        task.priority === 'high' && _jsx('span', { style: { flexShrink: 0, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: T.danger, background: 'rgba(239,68,68,0.12)', padding: '2px 6px', borderRadius: 4 }, children: 'High' }),
      ] }),
      (task.description || task.prompt) && _jsx('p', { style: { margin: '6px 0 0', fontSize: 11.5, color: T.muted, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }, children: task.description || task.prompt }),
      _jsxs('div', { style: { marginTop: 7, display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx(EngineBadge, { engine }), _jsx('span', { style: { fontSize: 10, color: T.muted }, children: engine === 'auto' ? 'will route on run' : 'current engine' })] }),
      failed && latest?.error && _jsxs('p', { style: { margin: '6px 0 0', fontSize: 11, color: T.danger, display: 'flex', gap: 4, alignItems: 'flex-start', overflow: 'hidden' }, children: [_jsx(AlertCircle, { size: 11 }), _jsx('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' }, children: latest.error })] }),
      _jsxs('div', { style: { marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: T.muted, flexWrap: 'wrap' }, children: [
        _jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 3 }, children: [_jsx(Clock, { size: 10 }), relativeTime(task.updated_at)] }),
        task.executions.length > 0 && _jsxs('span', { title: `${task.executions.length} run(s)`, style: { display: 'inline-flex', alignItems: 'center', gap: 3 }, children: [_jsx(Play, { size: 10 }), String(task.executions.length)] }),
        ...task.tags.slice(0, 2).map(tag => _jsx('span', { style: { background: T.hover, borderRadius: 4, padding: '2px 6px', fontSize: 10 }, children: tag }, tag)),
      ] }),
      _jsxs('div', { style: { marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10 }, children: [
        hasTarget && _jsxs('button', { type: 'button', onClick: e => { e.stopPropagation(); onOpenEngine(task, latest) }, title: `Open ${ENGINE_LABELS[engine] || 'engine'}`, style: { background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.accent }, children: [engine === 'task_runner' ? _jsx(Play, { size: 11 }) : _jsx(MessageSquare, { size: 11 }), engine === 'task_runner' ? 'Open Task Runner' : running ? 'Watch live' : 'View session'] }),
        !running && _jsx('button', { type: 'button', onClick: e => { e.stopPropagation(); onMoveMenu(task) }, title: 'Move to another column', style: { background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, color: T.muted }, children: 'Move' }),
        !running && onRun && _jsxs('button', { type: 'button', disabled: runBusy, onClick: e => { e.stopPropagation(); onRun(task) }, title: 'Run this task', style: { marginLeft: 'auto', background: 'transparent', border: 'none', cursor: runBusy ? 'wait' : 'pointer', padding: 0, opacity: runBusy ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.muted }, children: [runBusy ? _jsx(Loader2, { size: 11, style: { animation: 'kanban-spin 1s linear infinite' } }) : _jsx(Play, { size: 11, fill: 'currentColor' }), task.executions.length ? 'Run again' : 'Run'] }),
      ] }),
    ],
  })
}
