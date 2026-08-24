import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'
import { relativeTime } from '../lib/formatting.ts'

const { ListChecks } = lucide

export default function ActivityTimeline({ activities, artifacts = [], label }) {
  return _jsxs('div', { children: [
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }, children: [_jsx(ListChecks, { size: 13, style: { color: T.accent } }), _jsx('span', { style: label, children: 'Activity' })] }),
    activities.length ? _jsx('div', { style: { display: 'flex', flexDirection: 'column', gap: 7 }, children: activities.map(item => { const linked = artifacts.filter(artifact => artifact.execution_id && artifact.execution_id === item.execution_id); return _jsxs('div', { style: { display: 'flex', gap: 8, padding: '8px 10px', background: T.bg, borderRadius: 8, border: `1px solid ${T.border}` }, children: [_jsx('span', { style: { width: 7, height: 7, marginTop: 4, borderRadius: '50%', background: item.status === 'succeeded' ? T.ok : item.status === 'failed' ? T.danger : T.warn, flexShrink: 0 } }), _jsxs('div', { style: { minWidth: 0 }, children: [_jsx('div', { style: { fontSize: 11, fontWeight: 600, color: T.text }, children: item.title }), _jsx('div', { style: { marginTop: 3, fontSize: 11, lineHeight: 1.4, color: T.muted }, children: item.summary }), linked.length > 0 && _jsx('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }, children: linked.map(artifact => _jsx('a', { href: artifact.url || '#', target: '_blank', rel: 'noreferrer', onClick: event => { if (!artifact.url) event.preventDefault() }, style: { maxWidth: '100%', padding: '2px 5px', borderRadius: 5, background: T.accentSoft, color: T.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none', fontSize: 9 }, children: artifact.title }, artifact.id)) }), item.created_at && _jsx('div', { style: { marginTop: 4, fontSize: 10, color: T.muted }, children: relativeTime(item.created_at) })] })] }, item.id) }) }) : _jsx('div', { style: { padding: 10, borderRadius: 8, background: T.bg, color: T.muted, fontSize: 11 }, children: 'No activity yet. Agent updates will appear here after each step.' }),
  ] })
}
