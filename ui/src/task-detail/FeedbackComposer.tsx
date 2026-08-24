import { useEffect, useState } from 'react'
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'
import { taskEngine, taskRunBlocker } from '../lib/task-utils.ts'

const { Send } = lucide

export default function FeedbackComposer({ task, latest, onFeedback, onOpenEngine }) {
  const [feedback, setFeedback] = useState('')
  const [sent, setSent] = useState(false)
  const engine = taskEngine(task)
  const taskRunner = engine === 'task_runner'
  const hasChat = Boolean(latest?.session_key)
  const hasExecution = taskRunner ? Boolean(latest?.runner_id) : hasChat
  const running = task.status === 'running'
  const runBlocker = taskRunBlocker(task)
  const enabled = hasExecution && !running && !runBlocker

  useEffect(() => { setFeedback(''); setSent(false) }, [task.id])

  const placeholder = running
    ? 'Agent is working…'
    : runBlocker ? `${runBlocker}…` : hasExecution ? (taskRunner ? 'Give the goal a corrective instruction…' : 'Give the agent a next instruction…') : 'Run the task to start an agent execution…'

  return _jsxs('form', { onSubmit: async event => {
    event.preventDefault()
    if (!enabled || !feedback.trim()) return
    const ok = await onFeedback(task, feedback.trim())
    if (ok) {
      setFeedback('')
      setSent(true)
      setTimeout(() => setSent(false), 2200)
    }
  }, children: [
    _jsxs('div', { style: { display: 'flex', gap: 7, padding: 6, borderRadius: 11, background: T.bg, border: `1px solid ${enabled && feedback.trim() ? 'rgba(124,58,237,0.55)' : T.border}` }, children: [
      _jsx('input', { id: `kanban-feedback-${task.id}`, 'aria-label': taskRunner ? 'Give instruction for next goal attempt' : 'Reply to agent', value: feedback, disabled: !enabled, onChange: event => setFeedback(event.target.value), placeholder, style: { minWidth: 0, flex: 1, padding: '6px 7px', border: 'none', outline: 'none', background: 'transparent', color: T.strong, fontSize: 12, fontFamily: 'inherit', opacity: enabled ? 1 : 0.66 } }),
      _jsx('button', { type: 'submit', 'aria-label': 'Send feedback', title: 'Send feedback', disabled: !enabled || !feedback.trim(), style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flexShrink: 0, border: 'none', borderRadius: 8, background: T.accent, color: '#fff', cursor: enabled && feedback.trim() ? 'pointer' : 'not-allowed', opacity: enabled && feedback.trim() ? 1 : 0.38 }, children: _jsx(Send, { size: 13 }) }),
    ] }),
    sent && _jsx('div', { role: 'status', style: { marginTop: 5, color: T.ok, fontSize: 9 }, children: 'Instruction sent to the agent.' }),
  ] })
}
