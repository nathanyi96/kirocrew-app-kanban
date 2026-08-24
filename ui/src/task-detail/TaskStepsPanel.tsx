import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'
import { ENGINE_LABELS, RESULT_LABELS } from '../lib/task-utils.ts'
import { duration, relativeTime } from '../lib/formatting.ts'

const { CheckCircle2, Circle, ExternalLink, LoaderCircle, XCircle } = lucide

const statusMeta = status => {
  if (status === 'succeeded' || status === 'done' || status === 'completed') return { Icon: CheckCircle2, color: T.ok, label: 'Succeeded' }
  if (status === 'failed') return { Icon: XCircle, color: T.danger, label: 'Failed' }
  if (status === 'running' || status === 'in_progress') return { Icon: LoaderCircle, color: T.warn, label: 'Running' }
  return { Icon: Circle, color: T.muted, label: RESULT_LABELS[status] || 'Pending' }
}

export default function TaskStepsPanel({ steps }) {
  return _jsxs('section', { 'aria-label': 'Agent steps', children: [
    _jsxs('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 }, children: [_jsx('h3', { style: { margin: 0, color: T.strong, fontSize: 14 }, children: 'Agent steps' }), _jsxs('span', { style: { color: T.muted, fontSize: 10 }, children: [steps.length, steps.length === 1 ? ' run' : ' runs'] })] }),
    steps.length ? _jsx('div', { style: { display: 'flex', flexDirection: 'column', marginTop: 14 }, children: steps.map((step, index) => {
      const meta = statusMeta(step.status)
      return _jsxs('div', { style: { position: 'relative', display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', columnGap: 9, paddingBottom: index === steps.length - 1 ? 0 : 18 }, children: [
        index < steps.length - 1 && _jsx('span', { style: { position: 'absolute', left: 10, top: 20, bottom: -2, width: 1, background: T.border } }),
        _jsx(meta.Icon, { size: 18, style: { position: 'relative', zIndex: 1, color: meta.color, background: T.elevated, borderRadius: '50%', animation: step.status === 'running' ? 'kanban-spin 1s linear infinite' : undefined } }),
        _jsxs('div', { style: { minWidth: 0, padding: '1px 0 0' }, children: [
          _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 7 }, children: [_jsx('strong', { style: { color: T.text, fontSize: 12 }, children: step.title }), _jsx('span', { style: { color: meta.color, fontSize: 9, fontWeight: 700 }, children: meta.label }), step.engine && _jsx('span', { style: { marginLeft: 'auto', color: T.muted, fontSize: 9 }, children: ENGINE_LABELS[step.engine] || step.engine })] }),
          _jsx('p', { style: { margin: '5px 0 0', color: T.muted, fontSize: 11, lineHeight: 1.55, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children: step.summary }),
          (step.started_at || step.ended_at) && _jsxs('div', { style: { display: 'flex', gap: 9, marginTop: 6, color: T.muted, fontSize: 9 }, children: [step.started_at && _jsx('span', { children: relativeTime(step.started_at) }), step.started_at && step.ended_at && _jsx('span', { children: duration(step.started_at, step.ended_at) })] }),
          step.artifacts?.length > 0 && _jsx('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }, children: step.artifacts.map(artifact => _jsxs('a', { href: artifact.url || '#', target: '_blank', rel: 'noreferrer', onClick: event => { if (!artifact.url) event.preventDefault() }, style: { display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', padding: '3px 6px', borderRadius: 6, background: T.accentSoft, color: T.accent, fontSize: 9, textDecoration: 'none' }, children: [_jsx('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: artifact.title }), artifact.url && _jsx(ExternalLink, { size: 9 })] }, artifact.id)) }),
        ] }),
      ] }, step.id)
    }) }) : _jsx('div', { style: { marginTop: 14, padding: 18, borderRadius: 10, border: `1px dashed ${T.borderStrong}`, color: T.muted, fontSize: 12, lineHeight: 1.55, textAlign: 'center' }, children: 'No agent steps yet. Run the task to create the first step.' }),
  ] })
}
