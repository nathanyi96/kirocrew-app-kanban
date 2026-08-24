import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'
import { duration, formatTime } from '../lib/formatting.ts'

const { ListChecks } = lucide

export default function AgentProgress({ task, latest, label }) {
  const status = task.status === 'running' ? 'In progress' : task.status === 'done' ? 'Completed' : 'Ready'
  const result = task.latest_result || task.final_result || (latest?.result === 'succeeded' ? 'The agent finished this task and returned a result.' : latest?.error || (latest ? 'The agent has started working on this task.' : 'Run the task to start an agent session.'))
  return _jsxs('div', { style: { padding: 12, borderRadius: 10, background: T.bg, border: `1px solid ${T.border}` }, children: [
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }, children: [_jsx(ListChecks, { size: 13, style: { color: T.accent } }), _jsx('span', { style: label, children: 'Agent progress' }), _jsx('span', { style: { marginLeft: 'auto', fontSize: 10, color: task.status === 'running' ? T.warn : T.muted }, children: status })] }),
    _jsx('p', { style: { margin: 0, fontSize: 12, lineHeight: 1.5, color: T.text }, children: result }),
    (task.next_step || latest?.next_step) && _jsxs('div', { style: { marginTop: 9, paddingTop: 9, borderTop: `1px solid ${T.border}`, fontSize: 11, color: T.muted }, children: [_jsx('strong', { style: { color: T.text }, children: 'Next: ' }), task.next_step || latest.next_step] }),
    latest && _jsxs('div', { style: { display: 'flex', gap: 12, marginTop: 10, fontSize: 10, color: T.muted }, children: [_jsxs('span', { children: ['Latest run ', formatTime(latest.started_at)] }), latest.ended_at && _jsxs('span', { children: ['Duration ', duration(latest.started_at, latest.ended_at)] })] }),
  ] })
}
