import { useState } from 'react'
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'

const { Send } = lucide

export default function FeedbackComposer({ task, onFeedback, label }) {
  const [feedback, setFeedback] = useState('')
  const [sent, setSent] = useState(false)
  return _jsxs('form', { onSubmit: async e => { e.preventDefault(); if (!feedback.trim()) return; const ok = await onFeedback(task, feedback.trim()); if (ok) { setFeedback(''); setSent(true); setTimeout(() => setSent(false), 2200) } }, children: [
    _jsx('label', { htmlFor: 'kanban-feedback', style: { ...label, marginBottom: 6 }, children: 'Reply to agent' }),
    _jsxs('div', { style: { display: 'flex', gap: 6 }, children: [_jsx('input', { id: 'kanban-feedback', value: feedback, onChange: e => setFeedback(e.target.value), placeholder: 'Give an instruction for the next step…', style: { width: '100%', boxSizing: 'border-box', background: T.bg, color: T.strong, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13, outline: 'none', flex: 1 } }), _jsx('button', { type: 'submit', 'aria-label': 'Send feedback', title: 'Send feedback', disabled: !feedback.trim(), style: { border: 'none', borderRadius: 8, padding: '0 11px', background: T.accent, color: '#fff', cursor: feedback.trim() ? 'pointer' : 'not-allowed', opacity: feedback.trim() ? 1 : 0.45 }, children: _jsx(Send, { size: 14 }) })] }),
    sent && _jsx('div', { style: { marginTop: 5, fontSize: 10, color: T.ok }, children: 'Feedback sent to the agent.' }),
  ] })
}
