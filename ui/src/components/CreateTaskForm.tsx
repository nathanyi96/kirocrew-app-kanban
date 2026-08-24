import { useEffect, useState } from 'react'
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'
import { ENGINE_OPTIONS } from '../lib/task-utils.ts'

const { Plus, Sparkles, X } = lucide

export default function CreateTaskForm({ initialPrompt, initialEngine, onSubmit, onCancel }) {
  const [prompt, setPrompt] = useState(initialPrompt || '')
  const [engine, setEngine] = useState(initialEngine || 'auto')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const requestClose = () => prompt.trim() ? setConfirmDiscard(true) : onCancel()
  useEffect(() => { const onKey = e => { if (e.key === 'Escape') requestClose() }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) })
  return _jsx('div', { style: { position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.35)' }, children: _jsxs('form', { onSubmit: e => { e.preventDefault(); if (prompt.trim()) onSubmit({ prompt: prompt.trim(), engine }) }, style: { width: '100%', maxWidth: 520, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }, children: [
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [_jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx(Sparkles, { size: 16, style: { color: T.accent } }), _jsx('h3', { style: { margin: 0, fontSize: 14, color: T.strong }, children: 'New task' })] }), _jsx('button', { type: 'button', 'aria-label': 'Close', onClick: requestClose, style: { background: 'transparent', border: 'none', color: T.muted }, children: _jsx(X, { size: 16 }) })] }),
    _jsx('label', { style: { fontSize: 12, color: T.muted }, children: _jsx('textarea', { autoFocus: true, value: prompt, onChange: e => setPrompt(e.target.value), placeholder: 'What do you want done?', style: { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 8, minHeight: 120, background: T.bg, color: T.strong, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontFamily: 'inherit' } }) }),
    _jsx('select', { value: engine, onChange: e => setEngine(e.target.value), style: { background: T.bg, color: T.strong, border: `1px solid ${T.border}`, borderRadius: 8, padding: 9 }, children: ENGINE_OPTIONS.map(option => _jsx('option', { value: option.id, children: `${option.label} — ${option.help}` }, option.id)) }),
    _jsxs('div', { style: { display: 'flex', gap: 8 }, children: [_jsxs('button', { type: 'submit', disabled: !prompt.trim(), style: { flex: 1, display: 'inline-flex', justifyContent: 'center', gap: 6, padding: 10, border: 'none', borderRadius: 8, background: T.accent, color: '#fff' }, children: [_jsx(Plus, { size: 14 }), 'Create task'] }), _jsx('button', { type: 'button', onClick: requestClose, style: { padding: '0 14px', border: `1px solid ${T.border}`, borderRadius: 8, background: 'transparent', color: T.text }, children: 'Cancel' })] }),
    confirmDiscard && _jsxs('div', { role: 'alertdialog', style: { padding: 10, background: 'rgba(234,179,8,0.1)', color: T.text }, children: ['Discard what you typed? ', _jsx('button', { type: 'button', onClick: () => setConfirmDiscard(false), children: 'Keep editing' }), _jsx('button', { type: 'button', onClick: onCancel, children: 'Discard' })] }),
  ] }) })
}
