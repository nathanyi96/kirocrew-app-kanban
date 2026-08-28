import { useEffect } from 'react'
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import { T } from '../theme.ts'
import { COLUMNS, DROP_TARGETS } from '../lib/task-utils.ts'

export default function MoveMenu({ task, onMove, onClose }) {
  useEffect(() => { const onKey = e => { if (e.key === 'Escape') onClose() }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [onClose])
  return _jsxs('div', { style: { position: 'absolute', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: [
    _jsx('button', { type: 'button', 'aria-label': 'Close move menu', onClick: onClose, style: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', border: 'none', cursor: 'default' } }),
    _jsxs('div', { role: 'dialog', 'aria-modal': true, 'aria-label': `Move "${task.title}"`, style: { position: 'relative', background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, width: 260, boxShadow: '0 12px 40px rgba(0,0,0,0.4)' }, children: [
      _jsx('h3', { style: { margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: T.strong }, children: 'Move to' }),
      ...DROP_TARGETS.filter(s => s !== task.status).map(status => { const col = COLUMNS.find(c => c.id === status); return _jsxs('button', { type: 'button', onClick: () => { onMove(task.id, status); onClose() }, style: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', padding: '9px 8px', borderRadius: 8, fontSize: 13, color: T.text, textAlign: 'left' }, children: [_jsx('span', { style: { width: 8, height: 8, borderRadius: '50%', background: col.accent } }), col.label] }, status) }),
    ] }),
  ] })
}
