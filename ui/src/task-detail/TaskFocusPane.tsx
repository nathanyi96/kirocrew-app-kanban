import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'
import { RESULT_LABELS, taskFocus } from '../lib/task-utils.ts'

const { ArrowRight, Check, CircleDot, Sparkles } = lucide

const sectionTitle = { margin: 0, color: T.muted, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }

export default function TaskFocusPane({ task, latest }) {
  const focus = taskFocus(task)
  const resultLabel = latest?.result ? RESULT_LABELS[latest.result] || latest.result : null
  return _jsxs('div', { 'aria-label': 'Core task', style: { display: 'flex', flexDirection: 'column', gap: 18 }, children: [
    _jsxs('section', { children: [
      _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx(CircleDot, { size: 13, style: { color: task.status === 'running' ? T.warn : T.accent } }), _jsx('h3', { style: sectionTitle, children: 'Right now' }), _jsx('span', { style: { marginLeft: 'auto', color: task.status === 'running' ? T.warn : T.muted, fontSize: 10 }, children: focus.status })] }),
      _jsxs('div', { style: { marginTop: 8, padding: 13, borderRadius: 11, background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(124,58,237,0.035))', border: '1px solid rgba(124,58,237,0.25)' }, children: [
        _jsx('p', { style: { margin: 0, color: T.strong, fontSize: 13, lineHeight: 1.55, fontWeight: 550 }, children: focus.current }),
        _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }, children: [_jsx('div', { style: { flex: 1, height: 5, borderRadius: 999, overflow: 'hidden', background: T.hover }, children: _jsx('div', { style: { width: `${focus.progress.percent}%`, minWidth: focus.progress.percent ? 5 : 0, height: '100%', borderRadius: 999, background: task.status === 'failed' ? T.danger : T.accent, transition: 'width 200ms ease' } }) }), _jsx('span', { style: { color: T.muted, fontSize: 10, whiteSpace: 'nowrap' }, children: focus.progress.label })] }),
      ] }),
    ] }),
    _jsxs('section', { children: [
      _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx(Sparkles, { size: 13, style: { color: T.accent } }), _jsx('h3', { style: sectionTitle, children: 'Latest result' }), resultLabel && _jsx('span', { style: { marginLeft: 'auto', padding: '2px 6px', borderRadius: 999, background: latest.result === 'succeeded' ? 'rgba(34,197,94,0.12)' : latest.result === 'failed' ? 'rgba(239,68,68,0.12)' : T.hover, color: latest.result === 'succeeded' ? T.ok : latest.result === 'failed' ? T.danger : T.muted, fontSize: 9, fontWeight: 700 }, children: resultLabel })] }),
      _jsx('p', { style: { maxHeight: 190, overflowY: 'auto', margin: '8px 0 0', color: focus.result ? T.text : T.muted, fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children: focus.result || 'No result yet. The agent response will be captured here after the first run.' }),
    ] }),
    _jsxs('section', { children: [
      _jsx('h3', { style: sectionTitle, children: 'Key points' }),
      focus.keyPoints.length ? _jsx('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 9 }, children: focus.keyPoints.map((point, index) => _jsxs('div', { style: { display: 'flex', gap: 8, color: T.text, fontSize: 12, lineHeight: 1.5 }, children: [_jsx(Check, { size: 13, style: { flexShrink: 0, marginTop: 2, color: T.ok } }), _jsx('span', { children: point })] }, `${index}-${point}`)) }) : _jsx('p', { style: { margin: '8px 0 0', color: T.muted, fontSize: 12, lineHeight: 1.5 }, children: 'Key decisions and completed work will collect here as the agent replies.' }),
    ] }),
    _jsxs('section', { style: { paddingTop: 13, borderTop: `1px solid ${T.border}` }, children: [
      _jsxs('div', { style: { display: 'flex', gap: 8 }, children: [_jsx(ArrowRight, { size: 13, style: { flexShrink: 0, marginTop: 2, color: T.accent } }), _jsxs('div', { children: [_jsx('h3', { style: sectionTitle, children: 'Next move' }), _jsx('p', { style: { margin: '6px 0 0', color: T.text, fontSize: 12, lineHeight: 1.55 }, children: focus.next })] })] }),
    ] }),
  ] })
}
