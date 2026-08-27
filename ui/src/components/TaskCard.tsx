import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T, toneColor, toneSurface } from '../theme.ts'
import {
  ENGINE_LABELS, cardBody, cardQualifier, taskEngine, taskProgress,
  taskRunBlocker, taskStateMeta,
} from '../lib/task-utils.ts'
import { relativeTime } from '../lib/formatting.ts'

const { AlertCircle, Flag, Loader2, MessageSquare, MoreHorizontal, Play, RotateCw } = lucide

// Which colour a card's state paints with. The five board lanes map onto the
// theme's five tones, so a card looks the same colour in every view.
const STATE_TONE = { backlog: 'muted', todo: 'info', running: 'warn', done: 'ok', failed: 'danger' }

// A tint light enough that five hues in one grid read as a colour code rather
// than a candy shop, with the saturated colour reserved for the chip and border.
const TINT = {
  muted: 'rgba(127,127,136,0.055)',
  info: 'rgba(8,145,178,0.06)',
  warn: 'rgba(234,179,8,0.07)',
  ok: 'rgba(34,197,94,0.06)',
  danger: 'rgba(239,68,68,0.07)',
}
const EDGE = {
  muted: 'rgba(127,127,136,0.30)',
  info: 'rgba(8,145,178,0.34)',
  warn: 'rgba(234,179,8,0.38)',
  ok: 'rgba(34,197,94,0.32)',
  danger: 'rgba(239,68,68,0.36)',
}

const STATE_LABEL = { backlog: 'Backlog', todo: 'To do', running: 'Running', done: 'Review', failed: 'Failed' }

const bodyColor = tone => (tone === 'error' ? T.danger : T.text)

/**
 * One board card.
 *
 * `variant` is the whole design: 'board' sits in a lane that already names the
 * state, so it gets a 3px stripe and no state chip. 'flat' has no lane, so the
 * card itself carries the state as a tinted surface plus a chip — without that
 * the grid views would show twelve identical grey rectangles.
 *
 * The action row is revealed on hover and keyboard focus rather than always
 * drawn, which is what buys the vertical space the body line now uses. Focus is
 * included on purpose: a hover-only affordance is unreachable by keyboard.
 */
export default function TaskCard({ task, variant = 'board', onClick, onRun, onOpenEngine, onMoveMenu, runBusy }) {
  const latest = task.executions.length ? task.executions[task.executions.length - 1] : null
  const engine = taskEngine(task)
  const running = task.status === 'running'
  const flat = variant === 'flat'
  const hasTarget = Boolean(latest && (latest.session_key || latest.runner_id))
  const tone = STATE_TONE[task.status] || 'muted'
  const accent = toneColor(tone)
  const goal = taskStateMeta(task)
  const progress = taskProgress(task)
  const body = cardBody(task)
  const qualifier = cardQualifier(task)
  const runBlocker = taskRunBlocker(task)
  // The goal machine can disagree with the lane — "Needs input" while the card
  // sits in Running is the case worth surfacing. A pill that merely repeats the
  // lane is the redundancy this whole redesign removed, so a goal state that
  // MAPS to the current lane is suppressed: a failed card resolves to `blocked`
  // by definition, and showing "Failed · Blocked" says one thing twice.
  const RESTATES_LANE = { failed: ['blocked'], running: ['working'], done: ['needs_review', 'achieved'] }
  const dissent = ['needs_input', 'blocked', 'budget_exhausted', 'paused'].includes(goal.state)
    && !(RESTATES_LANE[task.status] || []).includes(goal.state)
    ? goal
    : null

  const meta = [
    ENGINE_LABELS[engine] || 'Auto',
    task.tags.length ? task.tags[0] + (task.tags.length > 1 ? ` +${task.tags.length - 1}` : '') : '',
    task.executions.length ? `×${task.executions.length}` : '',
    relativeTime(task.updated_at),
  ].filter(Boolean)

  return _jsxs('div', {
    'data-task-id': task.id,
    'data-variant': variant,
    className: 'kanban-card',
    draggable: !running,
    onDragStart: e => { e.dataTransfer.setData('text/task-id', task.id); e.dataTransfer.effectAllowed = 'move' },
    onClick: () => onClick(task),
    role: 'button',
    tabIndex: 0,
    onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(task) } },
    style: {
      position: 'relative', borderRadius: 9, cursor: 'pointer',
      display: 'flex', flexDirection: 'column', gap: 6,
      background: flat ? TINT[tone] : T.card,
      border: `1px solid ${flat ? EDGE[tone] : T.border}`,
      padding: flat ? '12px 13px 11px' : '11px 12px 10px 16px',
      minHeight: flat ? 132 : 0,
    },
    children: [
      !flat && _jsx('span', {
        'aria-hidden': true,
        style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: '9px 0 0 9px', background: accent },
      }),
      _jsxs('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 6 }, children: [
        _jsx('h4', {
          style: {
            margin: 0, flex: 1, fontSize: flat ? 14.5 : 14, fontWeight: 600, color: T.strong,
            lineHeight: 1.3, letterSpacing: '-0.005em', overflow: 'hidden',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          },
          children: task.title,
        }),
        // Refining is a spinner and nothing else: the old "Refining…" label
        // squeezed the title into two lines to say what the spinner says.
        task.refining && _jsx(Loader2, {
          size: 12, 'aria-label': 'Refining', role: 'img',
          style: { flexShrink: 0, marginTop: 3, color: T.muted, animation: 'kanban-spin 1s linear infinite' },
        }),
        running && !task.refining && _jsx(Loader2, {
          size: 12, 'aria-hidden': true,
          style: { flexShrink: 0, marginTop: 3, color: T.warn, animation: 'kanban-spin 1s linear infinite' },
        }),
        // An icon rather than the old uppercase "HIGH" chip, which cost the
        // title a whole line of width to say one bit.
        task.priority === 'high' && _jsx(Flag, {
          size: 12, 'aria-label': 'High priority', role: 'img',
          style: { flexShrink: 0, marginTop: 3, color: T.danger },
        }),
      ] }),

      body.text && _jsxs('p', {
        style: {
          margin: 0, fontSize: 12.5, lineHeight: 1.45, color: bodyColor(body.tone),
          opacity: body.tone === 'intent' ? 0.62 : body.tone === 'error' ? 1 : 0.82,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: flat ? 3 : 2, WebkitBoxOrient: 'vertical',
          ...(body.tone === 'error' ? { display: 'flex', gap: 5, alignItems: 'flex-start' } : {}),
        },
        children: body.tone === 'error'
          ? [_jsx(AlertCircle, { size: 12, style: { flexShrink: 0, marginTop: 2 }, 'aria-hidden': true }), _jsx('span', { children: body.text })]
          : body.text,
      }),

      _jsxs('div', { style: { marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }, children: [
        // A hairline instead of a sentence. Determinate runs show real progress;
        // an indeterminate one reuses the marquee animation that already shipped
        // in the stylesheet and had no consumer.
        (running || progress.percent === 100) && _jsx('div', {
          role: 'progressbar',
          'aria-label': 'Task progress',
          'aria-valuenow': progress.determinate ? progress.percent : undefined,
          style: { position: 'relative', height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' },
          children: progress.determinate
            ? _jsx('span', { style: { display: 'block', height: '100%', width: `${progress.percent || 0}%`, borderRadius: 999, background: accent, transition: 'width 180ms ease' } })
            : _jsx('span', { style: { position: 'absolute', top: 0, bottom: 0, width: '40%', borderRadius: 999, background: accent, animation: 'kanban-indeterminate 1.5s ease-in-out infinite' } }),
        }),

        _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.muted, fontVariantNumeric: 'tabular-nums' }, children: [
          flat && _jsxs('span', {
            style: { display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 5, padding: '2px 7px', fontSize: 10.5, fontWeight: 650, color: accent, background: toneSurface(tone) },
            children: [
              _jsx('span', { 'aria-hidden': true, style: { width: 5, height: 5, borderRadius: '50%', background: accent } }),
              STATE_LABEL[task.status] || task.status,
            ],
          }),
          dissent && _jsx('span', {
            style: { borderRadius: 5, padding: '2px 6px', fontSize: 10, fontWeight: 700, color: toneColor(dissent.tone), background: toneSurface(dissent.tone) },
            children: dissent.label,
          }),
          qualifier && _jsx('span', { style: { color: task.status === 'failed' ? T.danger : task.status === 'done' ? T.ok : T.muted }, children: qualifier }),
          _jsx('span', { style: { marginLeft: 'auto', display: 'inline-flex', gap: 5 }, children: meta.join(' · ') }),
        ] }),

        // Revealed by :hover and :focus-within (see the stylesheet in App), so it
        // costs no height at rest.
        _jsxs('div', { className: 'kanban-card-actions', style: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 11.5 }, children: [
          hasTarget && _jsxs('button', {
            type: 'button',
            onClick: e => { e.stopPropagation(); onOpenEngine(task, latest) },
            style: { background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: T.accent },
            children: [
              engine === 'task_runner' ? _jsx(Play, { size: 11 }) : _jsx(MessageSquare, { size: 11 }),
              engine === 'task_runner' ? 'Task Runner' : running ? 'Watch live' : 'Open session',
            ],
          }),
          !running && onMoveMenu && _jsxs('button', {
            type: 'button',
            onClick: e => { e.stopPropagation(); onMoveMenu(task) },
            // The word "Move" was lane-shaped language. In a grid there is no
            // lane to drag to, so this is the ONLY way to change state there —
            // it says "state", and it is never hidden in a laneless view.
            title: flat ? 'Change state' : 'Move to another lane',
            style: { background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: T.muted },
            children: [_jsx(MoreHorizontal, { size: 12 }), flat ? 'State' : 'Move'],
          }),
          !running && !runBlocker && onRun && _jsxs('button', {
            type: 'button',
            disabled: runBusy,
            onClick: e => { e.stopPropagation(); onRun(task) },
            title: 'Run this task',
            style: { marginLeft: 'auto', background: 'transparent', border: 'none', cursor: runBusy ? 'wait' : 'pointer', padding: 0, opacity: runBusy ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: T.muted },
            children: [
              runBusy
                ? _jsx(Loader2, { size: 11, style: { animation: 'kanban-spin 1s linear infinite' } })
                : task.executions.length ? _jsx(RotateCw, { size: 11 }) : _jsx(Play, { size: 11, fill: 'currentColor' }),
              task.executions.length ? 'Run again' : 'Run',
            ],
          }),
        ] }),
      ] }),
    ],
  })
}
