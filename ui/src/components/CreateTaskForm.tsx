import { useEffect, useState } from 'react'
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'
import { ENGINE_OPTIONS } from '../lib/task-utils.ts'

const { Check, Plus, Repeat2, Sparkles, X } = lucide

export default function CreateTaskForm({ initialPrompt, initialEngine, initialGoal, onSubmit, onCancel }) {
  const [prompt, setPrompt] = useState(initialPrompt || '')
  const [engine, setEngine] = useState(initialEngine || 'auto')
  const [loop, setLoop] = useState(initialGoal?.mode === 'loop')
  const [criteria, setCriteria] = useState((initialGoal?.criteria || [
    'The requested outcome is implemented',
    'Relevant checks pass without regressions',
    'The final result and produced artifacts are summarized',
  ]).join('\n'))
  const [maxAttempts, setMaxAttempts] = useState(initialGoal?.max_attempts || 3)
  const [maxMinutes, setMaxMinutes] = useState(initialGoal?.max_minutes || 60)
  const [tokenBudget, setTokenBudget] = useState(initialGoal?.token_budget || 50000)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const requestClose = () => prompt.trim() ? setConfirmDiscard(true) : onCancel()
  useEffect(() => { const onKey = e => { if (e.key === 'Escape') requestClose() }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) })
  return _jsx('div', { style: { position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.35)' }, children: _jsxs('form', { onSubmit: e => { e.preventDefault(); if (prompt.trim()) onSubmit({ prompt: prompt.trim(), engine: loop ? 'task_runner' : engine, goal: loop ? { mode: 'loop', objective: prompt.trim(), criteria: criteria.split('\n').map(item => item.replace(/^[-*]\s*/, '').trim()).filter(Boolean), max_attempts: Number(maxAttempts), max_minutes: Number(maxMinutes), token_budget: Number(tokenBudget) } : null }) }, style: { width: '100%', maxWidth: 560, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 12, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }, children: [
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [_jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx(Sparkles, { size: 16, style: { color: T.accent } }), _jsx('h3', { style: { margin: 0, fontSize: 14, color: T.strong }, children: 'New task' })] }), _jsx('button', { type: 'button', 'aria-label': 'Close', onClick: requestClose, style: { background: 'transparent', border: 'none', color: T.muted }, children: _jsx(X, { size: 16 }) })] }),
    _jsx('label', { style: { fontSize: 12, color: T.muted }, children: _jsx('textarea', { autoFocus: true, value: prompt, onChange: e => setPrompt(e.target.value), placeholder: 'What do you want done?', style: { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 8, minHeight: 120, background: T.bg, color: T.strong, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, fontFamily: 'inherit' } }) }),
    _jsx('select', { value: loop ? 'task_runner' : engine, disabled: loop, onChange: e => setEngine(e.target.value), style: { background: T.bg, color: T.strong, border: `1px solid ${T.border}`, borderRadius: 8, padding: 9, opacity: loop ? 0.72 : 1 }, children: ENGINE_OPTIONS.map(option => _jsx('option', { value: option.id, children: `${option.label} — ${option.help}` }, option.id)) }),
    _jsxs('button', { type: 'button', role: 'switch', 'aria-checked': loop, onClick: () => setLoop(value => !value), style: { display: 'grid', gridTemplateColumns: '28px minmax(0, 1fr)', gap: 10, alignItems: 'center', padding: 11, borderRadius: 10, border: `1px solid ${loop ? 'rgba(124,58,237,0.5)' : T.border}`, background: loop ? T.accentSoft : T.bg, color: T.text, textAlign: 'left', cursor: 'pointer' }, children: [
      _jsx('span', { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 8, background: loop ? T.accent : T.hover, color: loop ? '#fff' : T.muted }, children: loop ? _jsx(Check, { size: 13 }) : _jsx(Repeat2, { size: 13 }) }),
      _jsxs('span', { children: [_jsx('strong', { style: { display: 'block', color: T.strong, fontSize: 11 }, children: 'Continue until verified' }), _jsx('span', { style: { display: 'block', marginTop: 2, color: T.muted, fontSize: 10, lineHeight: 1.4 }, children: 'Use bounded Task Runner attempts until the checks pass or a stop condition is reached.' })] }),
    ] }),
    loop && _jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 11, padding: 12, borderRadius: 10, border: `1px solid ${T.border}`, background: T.bg }, children: [
      _jsxs('label', { style: { color: T.muted, fontSize: 10, fontWeight: 650 }, children: ['Done means', _jsx('textarea', { value: criteria, onChange: e => setCriteria(e.target.value), 'aria-label': 'Goal acceptance criteria', style: { display: 'block', width: '100%', minHeight: 82, boxSizing: 'border-box', marginTop: 7, padding: 9, resize: 'vertical', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontFamily: 'inherit', fontSize: 11, lineHeight: 1.5 } })] }),
      _jsx('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }, children: [
        _jsx(LimitInput, { label: 'Attempts', value: maxAttempts, min: 1, max: 10, onChange: setMaxAttempts }),
        _jsx(LimitInput, { label: 'Minutes', value: maxMinutes, min: 5, max: 720, onChange: setMaxMinutes }),
        _jsx(LimitInput, { label: 'Token budget', value: tokenBudget, min: 1000, max: 2000000, step: 1000, onChange: setTokenBudget }),
      ] }),
      _jsx('p', { style: { margin: 0, color: T.muted, fontSize: 9, lineHeight: 1.45 }, children: 'The loop pauses for approvals, repeated failures, or exhausted limits. It never runs without a stopping condition.' }),
    ] }),
    _jsxs('div', { style: { display: 'flex', gap: 8 }, children: [_jsxs('button', { type: 'submit', disabled: !prompt.trim(), style: { flex: 1, display: 'inline-flex', justifyContent: 'center', gap: 6, padding: 10, border: 'none', borderRadius: 8, background: T.accent, color: '#fff' }, children: [_jsx(Plus, { size: 14 }), 'Create task'] }), _jsx('button', { type: 'button', onClick: requestClose, style: { padding: '0 14px', border: `1px solid ${T.border}`, borderRadius: 8, background: 'transparent', color: T.text }, children: 'Cancel' })] }),
    confirmDiscard && _jsxs('div', { role: 'alertdialog', style: { padding: 10, background: 'rgba(234,179,8,0.1)', color: T.text }, children: ['Discard what you typed? ', _jsx('button', { type: 'button', onClick: () => setConfirmDiscard(false), children: 'Keep editing' }), _jsx('button', { type: 'button', onClick: onCancel, children: 'Discard' })] }),
  ] }) })
}

function LimitInput({ label, value, min, max, step = 1, onChange }) {
  return _jsxs('label', { style: { minWidth: 0, color: T.muted, fontSize: 9 }, children: [label, _jsx('input', { type: 'number', value, min, max, step, onChange: event => onChange(Number(event.target.value)), style: { width: '100%', boxSizing: 'border-box', marginTop: 5, padding: '7px 6px', borderRadius: 7, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 10 } })] })
}
