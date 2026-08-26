import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T, actionPill, toneBorder, toneColor, toneSurface } from '../theme.ts'
import { duration } from '../lib/formatting.ts'
import { taskAttempts, taskProgress, taskRunBlocker, taskStateMeta } from '../lib/task-utils.ts'
import VerificationList from './VerificationList.tsx'

const { AlertTriangle, CircleDot, Clock3, Coins, Pause, Play, RotateCcw, Target } = lucide
const heading = { margin: 0, color: T.muted, fontSize: 9, fontWeight: 750, letterSpacing: '0.09em', textTransform: 'uppercase' }

export default function GoalPane({ task, onConfigureGoal, onContinue, onPause }) {
  const goal = task.goal
  const state = taskStateMeta(task)
  const progress = taskProgress(task)
  const attempts = taskAttempts(task)
  const latest = attempts[attempts.length - 1]
  const activeStep = latest?.steps?.find(step => ['running', 'in_progress', 'reviewing'].includes(step.status))
  const stateColor = toneColor(state.tone)
  const runBlocker = taskRunBlocker(task)

  if (!goal) return _jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 }, children: [
    _jsxs('section', { style: { padding: 15, borderRadius: 12, border: `1px solid ${T.border}`, background: T.bg }, children: [
      _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 7 }, children: [_jsx(Target, { size: 15, style: { color: T.accent } }), _jsx('strong', { style: { color: T.strong, fontSize: 12 }, children: 'One-run task' })] }),
      _jsx('p', { style: { margin: '8px 0 0', color: T.muted, fontSize: 11, lineHeight: 1.55 }, children: 'Enable a bounded goal loop to keep working through retries until explicit checks pass.' }),
      _jsx('button', { type: 'button', onClick: () => onConfigureGoal(task), style: { ...actionPill, marginTop: 12, padding: '7px 10px', background: T.accent, color: '#fff', fontSize: 10 }, children: 'Continue until verified' }),
    ] }),
    attempts.length > 0 && _jsx(AttemptList, { attempts }),
  ] })

  return _jsxs('div', { 'aria-label': 'Goal control', style: { display: 'flex', flexDirection: 'column', gap: 18 }, children: [
    _jsxs('section', { style: { padding: 14, borderRadius: 12, border: `1px solid ${toneBorder(state.tone)}`, background: `linear-gradient(140deg, ${toneSurface(state.tone)}, transparent 70%)` }, children: [
      _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 7 }, children: [_jsx(CircleDot, { size: 14, style: { color: stateColor } }), _jsx('span', { style: { color: stateColor, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }, children: state.label }), _jsx('span', { style: { marginLeft: 'auto', color: T.muted, fontSize: 9 }, children: progress.label })] }),
      _jsx('p', { style: { margin: '9px 0 0', color: T.strong, fontSize: 13, lineHeight: 1.55, fontWeight: 560 }, children: goal.objective }),
      progress.determinate ? _jsx('div', { style: { height: 5, marginTop: 12, overflow: 'hidden', borderRadius: 999, background: T.hover }, children: _jsx('div', { style: { width: `${progress.percent || 0}%`, height: '100%', borderRadius: 999, background: stateColor, transition: 'width 180ms ease' } }) }) : _jsx('div', { style: { position: 'relative', height: 4, marginTop: 12, overflow: 'hidden', borderRadius: 999, background: T.hover }, children: _jsx('span', { style: { position: 'absolute', width: '38%', height: '100%', borderRadius: 999, background: stateColor, animation: 'kanban-indeterminate 1.35s ease-in-out infinite' } }) }),
      goal.stop_reason && _jsxs('div', { style: { display: 'flex', gap: 7, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`, color: state.tone === 'danger' ? T.danger : T.muted, fontSize: 10, lineHeight: 1.45 }, children: [_jsx(AlertTriangle, { size: 12, style: { flexShrink: 0, marginTop: 1 } }), goal.stop_reason] }),
    ] }),
    _jsx('section', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }, children: [
      _jsx(Metric, { Icon: RotateCcw, value: `${goal.attempts}/${goal.max_attempts}`, label: 'attempts' }),
      _jsx(Metric, { Icon: Clock3, value: `${goal.max_minutes}m`, label: 'time limit' }),
      _jsx(Metric, { Icon: Coins, value: `${Math.round((goal.tokens_used || 0) / 1000)}k/${Math.round(goal.token_budget / 1000)}k`, label: 'tokens' }),
    ] }),
    activeStep && _jsxs('section', { children: [_jsx('h3', { style: heading, children: 'Current checkpoint' }), _jsxs('div', { style: { marginTop: 8, padding: 11, borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg }, children: [_jsx('strong', { style: { display: 'block', color: T.text, fontSize: 11 }, children: activeStep.title }), activeStep.summary && _jsx('p', { style: { margin: '5px 0 0', color: T.muted, fontSize: 10, lineHeight: 1.45 }, children: activeStep.summary })] })] }),
    _jsxs('section', { children: [_jsx('h3', { style: { ...heading, marginBottom: 9 }, children: 'Done means' }), _jsx(VerificationList, { checks: goal.criteria })] }),
    attempts.length > 0 && _jsx(AttemptList, { attempts }),
    _jsxs('section', { style: { display: 'flex', flexWrap: 'wrap', gap: 7 }, children: [
      task.status === 'running' && _jsxs('button', { type: 'button', onClick: () => onPause(task), style: { ...actionPill, padding: '6px 10px', background: T.hover, color: T.text, fontSize: 10 }, children: [_jsx(Pause, { size: 11 }), 'Pause loop'] }),
      task.status !== 'running' && state.state !== 'achieved' && !runBlocker && _jsxs('button', { type: 'button', onClick: () => onContinue(task), style: { ...actionPill, padding: '6px 10px', background: T.accent, color: '#fff', fontSize: 10 }, children: [_jsx(Play, { size: 11 }), 'Continue goal'] }),
      task.status !== 'running' && runBlocker && _jsx('span', { role: 'status', style: { color: T.muted, fontSize: 10, lineHeight: 1.45 }, children: `${runBlocker}. Update the goal contract before another attempt.` }),
    ] }),
  ] })
}

function Metric({ Icon, value, label }) {
  return _jsxs('div', { style: { minWidth: 0, padding: '9px 8px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, textAlign: 'center' }, children: [_jsx(Icon, { size: 12, style: { color: T.accent } }), _jsx('strong', { style: { display: 'block', marginTop: 4, color: T.text, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis' }, children: value }), _jsx('span', { style: { display: 'block', marginTop: 2, color: T.muted, fontSize: 8 }, children: label })] })
}

function AttemptList({ attempts }) {
  return _jsxs('section', { children: [_jsxs('div', { style: { display: 'flex', alignItems: 'center' }, children: [_jsx('h3', { style: heading, children: 'Attempts' }), _jsx('span', { style: { marginLeft: 'auto', color: T.muted, fontSize: 9 }, children: attempts.length })] }), _jsx('div', { style: { display: 'flex', flexDirection: 'column', gap: 7, marginTop: 9 }, children: [...attempts].reverse().map(attempt => {
    const color = attempt.status === 'succeeded' ? T.ok : attempt.status === 'failed' ? T.danger : attempt.status === 'running' ? T.warn : T.muted
    const complete = attempt.steps.filter(step => ['passed', 'skipped'].includes(step.status)).length
    return _jsxs('div', { style: { display: 'grid', gridTemplateColumns: '9px minmax(0, 1fr) auto', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg }, children: [
      _jsx('span', { style: { width: 7, height: 7, borderRadius: '50%', background: color } }),
      _jsxs('div', { style: { minWidth: 0 }, children: [_jsx('strong', { style: { display: 'block', color: T.text, fontSize: 10 }, children: attempt.title }), _jsx('span', { style: { display: 'block', marginTop: 2, color: T.muted, fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: attempt.summary || attempt.progress_detail || attempt.error || `${complete}/${attempt.steps.length || 0} checkpoints` })] }),
      _jsx('span', { style: { color: T.muted, fontSize: 8 }, children: attempt.ended_at ? duration(attempt.started_at, attempt.ended_at) : 'live' }),
    ] }, attempt.id)
  }) })] })
}
