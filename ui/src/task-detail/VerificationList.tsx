import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'

const { CheckCircle2, Circle, CircleHelp, LoaderCircle, XCircle } = lucide

const metaFor = status => {
  if (status === 'passed') return { Icon: CheckCircle2, color: T.ok, label: 'Verified' }
  if (status === 'failed') return { Icon: XCircle, color: T.danger, label: 'Failed' }
  if (status === 'running') return { Icon: LoaderCircle, color: T.warn, label: 'Checking' }
  if (status === 'unknown') return { Icon: CircleHelp, color: T.info, label: 'Unknown' }
  return { Icon: Circle, color: T.muted, label: 'Pending' }
}

export default function VerificationList({ checks = [], compact = false }) {
  if (!checks.length) return _jsx('div', { style: { padding: 12, borderRadius: 9, border: `1px dashed ${T.borderStrong}`, color: T.muted, fontSize: 11, lineHeight: 1.5 }, children: 'No verification evidence has been recorded yet.' })
  return _jsx('div', { style: { display: 'flex', flexDirection: 'column', gap: compact ? 6 : 8 }, children: checks.map(check => {
    const meta = metaFor(check.status)
    return _jsxs('div', { style: { display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr)', gap: 8, padding: compact ? '7px 8px' : '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg }, children: [
      _jsx(meta.Icon, { size: 15, style: { marginTop: 1, color: meta.color, animation: check.status === 'running' ? 'kanban-spin 1s linear infinite' : undefined } }),
      _jsxs('div', { style: { minWidth: 0 }, children: [
        _jsxs('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8 }, children: [
          _jsx('strong', { style: { flex: 1, color: T.text, fontSize: 11, lineHeight: 1.4 }, children: check.label }),
          _jsx('span', { style: { flexShrink: 0, color: meta.color, fontSize: 8, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.05em' }, children: meta.label }),
        ] }),
        check.evidence && _jsx('p', { style: { margin: '4px 0 0', color: T.muted, fontSize: 10, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children: check.evidence }),
        check.source && _jsx('span', { style: { display: 'block', marginTop: 4, color: T.muted, fontSize: 8 }, children: check.source.replaceAll('_', ' ') }),
      ] }),
    ] }, check.id || check.label)
  }) })
}
