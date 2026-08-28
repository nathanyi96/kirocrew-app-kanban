import { useState } from 'react'
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'
import { APPROVAL_MODES, taskApprovalMode } from '../lib/task-utils.ts'

const { Rocket, ShieldAlert, ShieldCheck } = lucide

const pill = {
  padding: '5px 10px', borderRadius: 8, border: 'none',
  fontSize: 11, fontWeight: 600, cursor: 'pointer',
}

/**
 * How much this card's agent may do on its own, and the answer to whatever it is
 * asking for right now.
 *
 * Two different things sit here on purpose, because they are the two halves of
 * one question. The SELECT is the durable setting: it is stored on the card and
 * applied to the card's session before its next run. The band above it appears
 * only while a turn is actually blocked, and answering it goes to the Host.
 *
 * The timing note is not decoration. A board card runs on an app-owned session,
 * which the Host gives a deny-fast approval window (about three minutes, against
 * two hours for a chat a human is sitting in front of), so an unanswered request
 * is refused and the run continues without that tool. Saying so is the
 * difference between "I ignored it" and "I did not know it would expire".
 */
export default function PermissionBar({ task, pendingApproval, onApproval, onApprovalMode, onHostYolo }) {
  const mode = taskApprovalMode(task)
  const [showGlobal, setShowGlobal] = useState(false)
  return _jsxs('section', {
    'aria-label': 'Permission',
    style: { padding: '9px 12px', borderTop: `1px solid ${T.border}`, background: T.bg, display: 'flex', flexDirection: 'column', gap: 8 },
    children: [
      pendingApproval && _jsxs('div', {
        role: 'alert',
        style: { display: 'flex', flexDirection: 'column', gap: 7, padding: '8px 9px', borderRadius: 9, border: '1px solid rgba(234,179,8,0.55)', background: 'rgba(234,179,8,0.12)' },
        children: [
          _jsxs('span', { style: { display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11.5, lineHeight: 1.4, color: T.strong }, children: [
            _jsx(ShieldAlert, { size: 13, style: { flexShrink: 0, marginTop: 1, color: T.warn }, 'aria-hidden': true }),
            _jsxs('span', { children: ['The agent is asking to run ', _jsx('strong', { children: pendingApproval.tool }), pendingApproval.tool_input ? _jsxs('span', { style: { color: T.muted }, children: [' — ', pendingApproval.tool_input.slice(0, 120)] }) : null] }),
          ] }),
          _jsx('span', { style: { fontSize: 10, color: T.muted, lineHeight: 1.4 }, children: 'Unanswered requests on a board card are denied after about three minutes, and the run continues without that tool.' }),
          _jsxs('div', { style: { display: 'flex', gap: 6 }, children: [
            _jsx('button', { type: 'button', onClick: () => onApproval(task, 'approved'), style: { ...pill, background: T.accent, color: '#fff' }, children: 'Allow once' }),
            _jsx('button', { type: 'button', onClick: () => onApproval(task, 'trust'), style: { ...pill, background: T.hover, color: T.text }, children: 'Allow and stop asking' }),
            _jsx('button', { type: 'button', onClick: () => onApproval(task, 'rejected'), style: { ...pill, background: 'transparent', color: T.danger, border: `1px solid ${T.border}` }, children: 'Deny' }),
          ] }),
        ],
      }),
      _jsxs('label', { style: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: T.muted }, children: [
        _jsx(ShieldCheck, { size: 13, style: { flexShrink: 0 }, 'aria-hidden': true }),
        'Permission',
        _jsx('select', {
          value: mode,
          'aria-label': 'Permission for this task',
          onChange: event => onApprovalMode(task, event.target.value),
          style: { flex: 1, minWidth: 0, background: T.card, color: T.strong, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 7px', fontSize: 11.5 },
          children: APPROVAL_MODES.map(option => _jsx('option', { value: option.id, children: `${option.label} — ${option.help}` }, option.id)),
        }),
      ] }),
      _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: T.muted }, children: [
        _jsx(Rocket, { size: 11, style: { flexShrink: 0 }, 'aria-hidden': true }),
        _jsx('span', { style: { flex: 1 }, children: 'YOLO is a Kiro Crew-wide switch, not a card setting' }),
        showGlobal
          ? _jsxs('span', { style: { display: 'flex', gap: 5 }, children: [
            _jsx('button', { type: 'button', onClick: () => { onHostYolo(true); setShowGlobal(false) }, style: { ...pill, fontSize: 10, background: T.danger, color: '#fff' }, children: 'Turn on everywhere' }),
            _jsx('button', { type: 'button', onClick: () => { onHostYolo(false); setShowGlobal(false) }, style: { ...pill, fontSize: 10, background: T.hover, color: T.text }, children: 'Turn off' }),
            _jsx('button', { type: 'button', onClick: () => setShowGlobal(false), style: { ...pill, fontSize: 10, background: 'transparent', color: T.muted }, children: 'Cancel' }),
          ] })
          : _jsx('button', { type: 'button', onClick: () => setShowGlobal(true), style: { ...pill, fontSize: 10, background: 'transparent', color: T.accent }, children: 'Change' }),
      ] }),
    ],
  })
}
