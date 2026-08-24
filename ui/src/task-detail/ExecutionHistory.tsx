import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'
import { RESULT_LABELS, taskEngine } from '../lib/task-utils.ts'
import { duration } from '../lib/formatting.ts'
import EngineBadge from '../components/EngineBadge.tsx'

const { ExternalLink, Play } = lucide

export default function ExecutionHistory({ task, onOpenEngine, label }) {
  if (!task.executions.length) return null
  return _jsxs('div', { children: [_jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }, children: [_jsx(Play, { size: 13, style: { color: T.accent } }), _jsxs('span', { style: label, children: ['Runs (', String(task.executions.length), ')'] })] }), _jsx('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }, children: [...task.executions].reverse().map(exec => { const dot = exec.result === 'succeeded' ? T.ok : exec.result === 'failed' ? T.danger : exec.result === 'cancelled' ? T.muted : T.warn; return _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: T.bg, border: `1px solid ${T.border}`, fontSize: 11 }, children: [_jsx('span', { style: { width: 6, height: 6, borderRadius: '50%', background: dot } }), _jsx('span', { style: { fontWeight: 500, color: dot }, children: exec.result ? RESULT_LABELS[exec.result] || exec.result : 'Running' }), _jsx(EngineBadge, { engine: exec.engine || taskEngine(task) }), _jsx('span', { style: { color: T.muted }, children: duration(exec.started_at, exec.ended_at) }), (exec.session_key || exec.runner_id) && _jsx('button', { type: 'button', onClick: () => onOpenEngine(task, exec), title: 'Open execution', style: { marginLeft: 'auto', background: 'transparent', border: 'none', color: T.accent }, children: _jsx(ExternalLink, { size: 11 }) })] }, exec.id) }) })] })
}
