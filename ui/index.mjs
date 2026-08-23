/**
 * Kanban — a task board where each card is a prompt an agent runs.
 *
 * Runs as a KiroCrew external app: a single ESM module, no build step. Only the
 * host import map is available (react, react/jsx-runtime, lucide-react,
 * @kirocrew/app-sdk) — no Tailwind, no @dnd-kit, no react-query — so styling is
 * inline against the theme tokens, dragging uses native HTML5 drag events, and
 * data fetching is a hand-rolled poll whose cadence tightens while any card is
 * running or still being named.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from 'react/jsx-runtime'
import { useNavigate } from '@kirocrew/app-sdk'
import lucide from 'lucide-react'

// The vendor stub names only the most common icons; everything else comes off
// the default-export proxy, which forwards to the host's full icon set.
const {
  AlertCircle, Clock, ExternalLink, GripVertical, KanbanSquare, Loader2,
  MessageSquare, Play, Plus, RotateCw, Search, Sparkles, Trash2, X,
} = lucide

const API = '/api/apps/kanban'

// ── Theme ──
// Tokens with fallbacks: an older host that lacks one still renders.
const T = {
  bg: 'var(--bg, #12141a)',
  card: 'var(--card, #181b22)',
  elevated: 'var(--bg-elevated, #1a1d25)',
  hover: 'var(--bg-hover, #262a35)',
  text: 'var(--text, #e4e4e7)',
  strong: 'var(--text-strong, #fafafa)',
  muted: 'var(--muted, #7f7f88)',
  border: 'var(--border, #27272a)',
  borderStrong: 'var(--border-strong, #3f3f46)',
  accent: '#7c3aed',
  accentSoft: 'rgba(124,58,237,0.14)',
  ok: 'var(--ok, #22c55e)',
  warn: 'var(--warn, #eab308)',
  danger: 'var(--danger, #ef4444)',
  info: 'var(--info, #0891b2)',
}

const actionPill = {
  display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none',
  borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}

const COLUMNS = [
  { id: 'backlog', label: 'Backlog', accent: T.muted },
  { id: 'todo', label: 'To do', accent: T.info },
  { id: 'running', label: 'Running', accent: T.warn },
  { id: 'done', label: 'Done', accent: T.ok },
  { id: 'failed', label: 'Failed', accent: T.danger },
]

/** Columns a card may be moved into. `running` is set by running, not by hand. */
const DROP_TARGETS = ['backlog', 'todo', 'done', 'failed']

// Full literal labels indexed by the enum, never text assembled from parts, so
// an unknown result renders the neutral fallback instead of "undefined".
const RESULT_LABELS = {
  succeeded: 'Succeeded',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

const ENGINE_OPTIONS = [
  { id: 'auto', label: 'Auto', help: 'Chat for simple prompts; Task Runner for multi-step work' },
  { id: 'chat', label: 'Chat', help: 'One live Chat session' },
  { id: 'task_runner', label: 'Task Runner', help: 'Multi-step execution with progress' },
  { id: 'autopilot', label: 'Autopilot', help: 'Plan first, then approve in a Chat session' },
]

const ENGINE_LABELS = Object.fromEntries(ENGINE_OPTIONS.map(engine => [engine.id, engine.label]))

function taskEngine(task) {
  const latest = task.executions && task.executions.length
    ? task.executions[task.executions.length - 1]
    : null
  return latest?.engine || task.active_engine || task.engine || 'auto'
}

function EngineBadge({ engine }) {
  const label = ENGINE_LABELS[engine] || 'Auto'
  return _jsx('span', {
    style: {
      display: 'inline-flex', alignItems: 'center', borderRadius: 999,
      padding: '2px 7px', fontSize: 10, fontWeight: 600, color: T.accent,
      background: T.accentSoft, border: '1px solid rgba(124,58,237,0.25)',
    },
    children: label,
  })
}

// ── API helpers ──

class KanbanApiError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'KanbanApiError'
    this.code = details.code || ''
    this.action = details.action || null
  }
}

/**
 * Turn a non-2xx response into an Error carrying the message a user should
 * read. Every kanban endpoint answers a refusal with `{error, code}`, so the
 * `error` string is the sentence to show; the status line is the fallback for
 * a body that is not that shape (a proxy's HTML page, a crash before the
 * handler ran).
 */
async function api(path, options) {
  const res = await fetch(API + path, { credentials: 'same-origin', ...options })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let message = `${res.status}${body ? `: ${body}` : ''}`
    let details = {}
    try {
      const parsed = JSON.parse(body)
      details = parsed && typeof parsed === 'object' ? parsed : {}
      if (parsed && typeof parsed.error === 'string' && parsed.error) message = parsed.error
    } catch { /* not JSON — keep the status line */ }
    throw new KanbanApiError(message, details)
  }
  if (res.status === 204) return null
  return res.json()
}

const jsonBody = (obj) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
})

// ── Formatting ──

function relativeTime(ts) {
  const secs = Math.max(0, Math.round(Date.now() / 1000 - ts))
  if (secs < 60) return 'now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

function formatTime(ts) {
  return new Date(ts * 1000).toLocaleString()
}

function duration(startedAt, endedAt) {
  const end = endedAt ?? Date.now() / 1000
  const secs = Math.max(0, Math.round(end - startedAt))
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

// ── Small shared pieces ──

function IconButton({ label, onClick, children, style }) {
  return _jsx('button', {
    type: 'button',
    'aria-label': label,
    title: label,
    onClick,
    style: {
      background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
      borderRadius: 6, color: T.muted, display: 'inline-flex', alignItems: 'center',
      ...style,
    },
    children,
  })
}

// ── Task Card ──

function TaskCard({ task, onClick, onRun, onOpenEngine, onMoveMenu, runBusy }) {
  const latest = task.executions.length ? task.executions[task.executions.length - 1] : null
  const engine = taskEngine(task)
  const hasTarget = Boolean(latest && (latest.session_key || latest.runner_id))
  const failed = task.status === 'failed'
  const running = task.status === 'running'
  const subtitle = task.description || task.prompt
  const stripe = failed ? T.danger : running ? T.warn : task.status === 'done' ? T.ok : T.borderStrong

  return _jsxs('div', {
    draggable: !running,
    onDragStart: e => {
      e.dataTransfer.setData('text/task-id', task.id)
      e.dataTransfer.effectAllowed = 'move'
    },
    onClick: () => onClick(task),
    role: 'button',
    tabIndex: 0,
    onKeyDown: e => {
      // role="button" implies both keys activate; Space also scrolls by default.
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(task) }
    },
    style: {
      position: 'relative', background: T.card, border: `1px solid ${failed ? 'rgba(239,68,68,0.4)' : running ? 'rgba(234,179,8,0.4)' : T.border}`,
      borderRadius: 8, padding: '12px 12px 12px 18px', cursor: 'pointer',
    },
    children: [
      _jsx('span', {
        'aria-hidden': true,
        style: {
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
          borderRadius: '8px 0 0 8px', background: stripe,
        },
      }),
      _jsxs('div', {
        style: { display: 'flex', alignItems: 'flex-start', gap: 8 },
        children: [
          !running && _jsx(GripVertical, { size: 13, style: { color: T.muted, flexShrink: 0, marginTop: 2 }, 'aria-hidden': true }),
          _jsx('h4', {
            style: {
              margin: 0, flex: 1, fontSize: 13, fontWeight: 500, color: T.strong,
              lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            },
            children: task.title,
          }),
          // The card exists before it has a real name: say the title is still
          // coming rather than presenting the provisional one as final.
          task.refining && _jsxs('span', {
            title: 'Refining…',
            style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: T.muted, flexShrink: 0 },
            children: [
              _jsx(Loader2, { size: 10, style: { animation: 'kanban-spin 1s linear infinite' }, 'aria-hidden': true }),
              'Refining…',
            ],
          }),
          task.priority === 'high' && _jsx('span', {
            style: {
              flexShrink: 0, fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
              color: T.danger, background: 'rgba(239,68,68,0.12)', padding: '2px 6px', borderRadius: 4,
            },
            children: 'High',
          }),
        ],
      }),
      subtitle && _jsx('p', {
        style: {
          margin: '6px 0 0', fontSize: 11.5, color: T.muted, overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        },
        children: subtitle,
      }),
      _jsxs('div', {
        style: { marginTop: 7, display: 'flex', alignItems: 'center', gap: 6 },
        children: [_jsx(EngineBadge, { engine }), _jsx('span', { style: { fontSize: 10, color: T.muted }, children: engine === 'auto' ? 'will route on run' : 'current engine' })],
      }),
      // Failure reason is the most useful thing a failed card can show.
      failed && latest && latest.error && _jsxs('p', {
        style: {
          margin: '6px 0 0', fontSize: 11, color: T.danger, display: 'flex', gap: 4,
          alignItems: 'flex-start', overflow: 'hidden',
        },
        children: [
          _jsx(AlertCircle, { size: 11, style: { flexShrink: 0, marginTop: 1 } }),
          _jsx('span', {
            style: { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word' },
            children: latest.error,
          }),
        ],
      }),
      _jsxs('div', {
        style: { marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: T.muted, flexWrap: 'wrap' },
        children: [
          _jsxs('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 3 }, children: [_jsx(Clock, { size: 10 }), relativeTime(task.updated_at)] }),
          task.executions.length > 0 && _jsxs('span', {
            title: `${task.executions.length} run(s)`,
            style: { display: 'inline-flex', alignItems: 'center', gap: 3 },
            children: [_jsx(Play, { size: 10 }), String(task.executions.length)],
          }),
          ...task.tags.slice(0, 2).map(tag => _jsx('span', {
            style: { background: T.hover, borderRadius: 4, padding: '2px 6px', fontSize: 10 },
            children: tag,
          }, tag)),
        ],
      }),
      // Action row — the card's own affordances, always reachable. "Move" is the
      // touch path: drag events never fire on touch screens, so without it a
      // phone could create cards but never file them.
      _jsxs('div', {
        style: {
          marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        },
        children: [
          hasTarget && _jsxs('button', {
            type: 'button',
            onClick: e => { e.stopPropagation(); onOpenEngine(task, latest) },
            title: `Open ${ENGINE_LABELS[engine] || 'engine'}`,
            style: {
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.accent,
            },
            children: [engine === 'task_runner' ? _jsx(Play, { size: 11 }) : _jsx(MessageSquare, { size: 11 }), engine === 'task_runner' ? 'Open Task Runner' : running ? 'Watch live' : 'View session'],
          }),
          !running && _jsx('button', {
            type: 'button',
            onClick: e => { e.stopPropagation(); onMoveMenu(task) },
            title: 'Move to another column',
            style: {
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 11, color: T.muted,
            },
            children: 'Move',
          }),
          !running && onRun && _jsxs('button', {
            type: 'button',
            disabled: runBusy,
            onClick: e => { e.stopPropagation(); onRun(task) },
            title: 'Run this task',
            style: {
              marginLeft: 'auto', background: 'transparent', border: 'none',
              cursor: runBusy ? 'wait' : 'pointer', padding: 0, opacity: runBusy ? 0.6 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.muted,
            },
            children: [
              runBusy
                ? _jsx(Loader2, { size: 11, style: { animation: 'kanban-spin 1s linear infinite' } })
                : _jsx(Play, { size: 11, fill: 'currentColor' }),
              task.executions.length ? 'Run again' : 'Run',
            ],
          }),
        ],
      }),
    ],
  })
}

// ── Column ──

function Column({ column, tasks, onDropTask, children }) {
  const [isOver, setIsOver] = useState(false)
  const droppable = DROP_TARGETS.includes(column.id)

  return _jsxs('div', {
    style: { display: 'flex', flexDirection: 'column', minWidth: 264, width: 264, flexShrink: 0 },
    children: [
      _jsxs('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
          borderRadius: '8px 8px 0 0', background: T.elevated,
        },
        children: [
          _jsx('span', { style: { width: 8, height: 8, borderRadius: '50%', background: column.accent }, 'aria-hidden': true }),
          _jsx('h3', {
            style: { margin: 0, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: T.text },
            children: column.label,
          }),
          _jsx('span', { style: { marginLeft: 'auto', fontSize: 11, color: T.muted, fontVariantNumeric: 'tabular-nums' }, children: String(tasks.length) }),
        ],
      }),
      _jsxs('div', {
        onDragOver: droppable ? (e => { e.preventDefault(); setIsOver(true) }) : undefined,
        onDragLeave: droppable ? (() => setIsOver(false)) : undefined,
        onDrop: droppable ? (e => {
          e.preventDefault()
          setIsOver(false)
          const id = e.dataTransfer.getData('text/task-id')
          if (id) onDropTask(id, column.id)
        }) : undefined,
        style: {
          flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: 8,
          borderRadius: '0 0 8px 8px', border: `1px solid ${isOver ? 'rgba(124,58,237,0.4)' : T.border}`,
          borderTop: 'none', background: isOver ? T.accentSoft : T.bg,
          overflowY: 'auto', minHeight: 200,
        },
        children: [
          children,
          tasks.length === 0 && _jsx('div', {
            style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80 },
            children: _jsx('p', { style: { fontSize: 11, color: T.muted, fontStyle: 'italic' }, children: 'No tasks' }),
          }),
        ],
      }),
    ],
  })
}

// ── Move menu (the touch path for filing a card) ──

function MoveMenu({ task, onMove, onClose }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return _jsxs('div', {
    style: { position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    children: [
      // Scrim is a SIBLING of the dialog, never a wrapper — wrapping would put
      // the dialog's own controls inside a role="button".
      _jsx('button', {
        type: 'button',
        'aria-label': 'Close move menu',
        onClick: onClose,
        style: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', border: 'none', cursor: 'default' },
      }),
      _jsxs('div', {
        role: 'dialog', 'aria-modal': true, 'aria-label': `Move "${task.title}"`,
        style: {
          position: 'relative', background: T.elevated, border: `1px solid ${T.border}`,
          borderRadius: 12, padding: 16, width: 260, boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
        },
        children: [
          _jsx('h3', { style: { margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: T.strong }, children: 'Move to' }),
          ...DROP_TARGETS.filter(s => s !== task.status).map(status => {
            const col = COLUMNS.find(c => c.id === status)
            return _jsxs('button', {
              type: 'button',
              onClick: () => { onMove(task.id, status); onClose() },
              style: {
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: '9px 8px', borderRadius: 8, fontSize: 13, color: T.text, textAlign: 'left',
              },
              onMouseEnter: e => { e.currentTarget.style.background = T.hover },
              onMouseLeave: e => { e.currentTarget.style.background = 'transparent' },
              children: [
                _jsx('span', { style: { width: 8, height: 8, borderRadius: '50%', background: col.accent }, 'aria-hidden': true }),
                col.label,
              ],
            }, status)
          }),
        ],
      }),
    ],
  })
}

// ── Create form ──

function CreateTaskForm({ initialPrompt, initialEngine, onSubmit, onCancel }) {
  const [prompt, setPrompt] = useState(initialPrompt || '')
  const [engine, setEngine] = useState(initialEngine || 'auto')
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // Escape and the close button ASK to close; a typed prompt is what decides.
  // The textarea invites a paragraph that exists nowhere else, so an accidental
  // Escape would destroy the only copy.
  const requestClose = useCallback(() => {
    if (prompt.trim()) { setConfirmDiscard(true); return }
    onCancel()
  }, [prompt, onCancel])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  const submit = e => {
    e.preventDefault()
    if (!prompt.trim()) return
    onSubmit({ prompt: prompt.trim(), engine })
  }

  const pill = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '10px 16px',
  }

  return _jsx('div', {
    style: {
      position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
    },
    children: _jsxs('form', {
      onSubmit: submit,
      style: {
        width: '100%', maxWidth: 520, background: T.elevated, border: `1px solid ${T.border}`,
        borderRadius: 12, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14,
        boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
      },
      children: [
        _jsxs('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
          children: [
            _jsxs('div', {
              style: { display: 'flex', alignItems: 'center', gap: 8 },
              children: [
                _jsx(Sparkles, { size: 16, style: { color: T.accent } }),
                _jsx('h3', { style: { margin: 0, fontSize: 14, fontWeight: 600, color: T.strong }, children: 'New task' }),
              ],
            }),
            _jsx(IconButton, { label: 'Close', onClick: requestClose, children: _jsx(X, { size: 16 }) }),
          ],
        }),
        _jsxs('div', {
          children: [
            _jsx('label', { htmlFor: 'kanban-new-prompt', style: { display: 'block', fontSize: 12, color: T.muted, marginBottom: 8 }, children: 'What do you want done?' }),
            _jsx('textarea', {
              id: 'kanban-new-prompt',
              autoFocus: true,
              value: prompt,
              onChange: e => setPrompt(e.target.value),
              placeholder: 'e.g. Summarize the open review comments on my PR and draft replies…',
              style: {
                width: '100%', boxSizing: 'border-box', background: T.bg, color: T.strong,
                border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px',
                fontSize: 13, minHeight: 120, resize: 'vertical', outline: 'none', fontFamily: 'inherit',
              },
            }),
          ],
        }),
        _jsx('p', {
          style: { margin: 0, fontSize: 11, color: T.muted },
          children: 'Choose an engine, or leave Auto to route simple prompts to Chat and multi-step work to Task Runner.',
        }),
        _jsxs('div', {
          children: [
            _jsx('label', { htmlFor: 'kanban-new-engine', style: { display: 'block', fontSize: 12, color: T.muted, marginBottom: 8 }, children: 'Back this task with' }),
            _jsx('select', {
              id: 'kanban-new-engine',
              'aria-label': 'Engine',
              value: engine,
              onChange: e => setEngine(e.target.value),
              style: {
                width: '100%', boxSizing: 'border-box', background: T.bg, color: T.strong,
                border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13,
              },
              children: ENGINE_OPTIONS.map(option => _jsx('option', { value: option.id, children: `${option.label} — ${option.help}` }, option.id)),
            }),
          ],
        }),
        _jsxs('div', {
          style: { display: 'flex', gap: 8 },
          children: [
            _jsxs('button', {
              type: 'submit',
              disabled: !prompt.trim(),
              style: {
                ...pill, flex: 1, background: T.accent, color: '#fff', border: 'none',
                opacity: prompt.trim() ? 1 : 0.5, cursor: prompt.trim() ? 'pointer' : 'not-allowed',
              },
              children: [_jsx(Sparkles, { size: 14 }), 'Create task'],
            }),
            _jsx('button', {
              type: 'button',
              onClick: requestClose,
              style: { ...pill, background: 'transparent', color: T.text, border: `1px solid ${T.border}` },
              children: 'Cancel',
            }),
          ],
        }),
        // Discard guard, rendered inside the dialog rather than as a native
        // confirm() so it is reachable, themed, and cannot be suppressed by a
        // browser that blocks dialogs.
        confirmDiscard && _jsxs('div', {
          role: 'alertdialog', 'aria-label': 'Discard this prompt?',
          style: {
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            borderRadius: 8, background: 'rgba(234,179,8,0.1)', border: `1px solid ${T.border}`,
          },
          children: [
            _jsx('span', { style: { flex: 1, fontSize: 12, color: T.text }, children: 'Discard what you typed? It is not saved anywhere.' }),
            _jsx('button', {
              type: 'button', onClick: () => setConfirmDiscard(false),
              style: { ...pill, padding: '6px 12px', fontSize: 12, background: T.hover, color: T.text, border: 'none' },
              children: 'Keep editing',
            }),
            _jsx('button', {
              type: 'button', onClick: onCancel,
              style: { ...pill, padding: '6px 12px', fontSize: 12, background: 'rgba(239,68,68,0.12)', color: T.danger, border: 'none' },
              children: 'Discard',
            }),
          ],
        }),
      ],
    }),
  })
}

// ── Task detail modal ──

function LegacyTaskDetail({ task, onClose, onUpdate, onMove, onRun, onDelete, onOpenEngine }) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [prompt, setPrompt] = useState(task.prompt)
  const [assignee, setAssignee] = useState(task.assignee || '')
  const [metadataText, setMetadataText] = useState(JSON.stringify(task.metadata || {}, null, 2))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  const isDirty = title !== task.title || description !== task.description || prompt !== task.prompt || assignee !== (task.assignee || '') || metadataText !== JSON.stringify(task.metadata || {}, null, 2)
  const latest = task.executions.length ? task.executions[task.executions.length - 1] : null
  const currentEngine = taskEngine(task)
  const engineHelp = ENGINE_OPTIONS.find(option => option.id === currentEngine)?.help || 'Engine selected for this task'
  const running = task.status === 'running'
  const col = COLUMNS.find(c => c.id === task.status)

  // The parent passes the live record, so a background settle or the namer
  // landing a title arrives here on the board's next poll. Adopt such a change
  // ONLY for a field the user has not touched: a field that already diverges
  // from what was seeded is an in-progress edit, and overwriting it would lose
  // their typing to a background event they never saw.
  const seeded = useRef({ title: task.title, description: task.description, prompt: task.prompt })
  useEffect(() => {
    if (task.title !== seeded.current.title) {
      setTitle(current => (current === seeded.current.title ? task.title : current))
    }
    if (task.description !== seeded.current.description) {
      setDescription(current => (current === seeded.current.description ? task.description : current))
    }
    if (task.prompt !== seeded.current.prompt) {
      setPrompt(current => (current === seeded.current.prompt ? task.prompt : current))
    }
    seeded.current = { title: task.title, description: task.description, prompt: task.prompt }
  }, [task.title, task.description, task.prompt])

  // Every close path funnels through here so an unsaved edit cannot vanish.
  // Escape and a click on the scrim are the two the user does not think of as
  // "closing", which is exactly why they are the ones that lose work.
  const requestClose = useCallback(() => {
    if (isDirty) { setConfirmDiscard(true); return }
    onClose()
  }, [isDirty, onClose])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  const save = () => {
    if (!isDirty) return
    let metadata
    try { metadata = JSON.parse(metadataText || '{}') } catch { return }
    if (!metadata || Array.isArray(metadata) || Object.values(metadata).some(value => typeof value !== 'string')) return
    onUpdate(task.id, { title, description, prompt, assignee: assignee || null, metadata })
  }

  const label = { display: 'block', fontSize: 11, fontWeight: 500, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }
  const input = {
    width: '100%', boxSizing: 'border-box', marginTop: 4, background: T.bg, color: T.strong,
    border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 13,
    outline: 'none', fontFamily: 'inherit',
  }
  const pill = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', padding: '8px 16px', border: 'none',
  }

  return _jsxs('div', {
    style: { position: 'fixed', top: 0, left: 0, bottom: 0, width: '100vw', maxWidth: '100vw', zIndex: 50, display: 'flex', justifyContent: 'flex-end', overflow: 'hidden' },
    children: [
      // Backdrop is a SIBLING of the dialog, never a wrapper — wrapping would
      // put the dialog's own controls inside a role="button". A real <button>
      // gives the click-away dismissal a keyboard path and an accessible name.
      _jsx('button', {
        type: 'button',
        'aria-label': 'Close task detail',
        onClick: requestClose,
        style: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)', border: 'none', cursor: 'default' },
      }),
      _jsxs('div', {
        role: 'dialog', 'aria-modal': true, 'aria-label': 'Task detail',
        style: {
          position: 'relative', width: 'min(460px, 92vw)', height: '100%',
          background: T.elevated, borderLeft: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.28)', animation: 'kanban-drawer-in 180ms ease-out',
        },
        children: [
          // Header: the lane is a CONTROL, not a badge — on a touch screen this
          // select is a way to file the card. Disabled while a run owns the lane
          // (the endpoint refuses that move until the watcher settles it).
          _jsxs('div', {
            style: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: `1px solid ${T.border}` },
            children: [
              _jsx('select', {
                'aria-label': 'Move to',
                value: task.status,
                disabled: running,
                onChange: e => onMove(task.id, e.target.value),
                style: {
                  background: T.bg, color: col ? col.accent : T.text, border: `1px solid ${T.border}`,
                  borderRadius: 6, fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.04em', padding: '3px 8px', cursor: running ? 'not-allowed' : 'pointer',
                },
                children: (running ? COLUMNS.map(c => c.id) : DROP_TARGETS).map(s =>
                  _jsx('option', { value: s, children: COLUMNS.find(c => c.id === s).label }, s)),
              }),
              _jsxs('span', { style: { marginLeft: 'auto', fontSize: 11, color: T.muted }, children: ['Updated ', formatTime(task.updated_at)] }),
              _jsx(IconButton, { label: 'Close', onClick: requestClose, children: _jsx(X, { size: 16 }) }),
            ],
          }),
          // Body
          _jsx('div', {
            style: { flex: 1, overflowY: 'auto', padding: 20 },
            children: _jsxs('div', {
              style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 20 },
              children: [
                _jsxs('div', {
                  style: { display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 },
                  children: [
                    _jsxs('div', { children: [
                      _jsx('label', { htmlFor: 'kanban-detail-title', style: label, children: 'Title' }),
                      _jsx('input', { id: 'kanban-detail-title', value: title, onChange: e => setTitle(e.target.value), style: input }),
                    ] }),
                    _jsxs('div', { children: [
                      _jsx('label', { htmlFor: 'kanban-detail-desc', style: label, children: 'Description' }),
                      _jsx('textarea', { id: 'kanban-detail-desc', value: description, onChange: e => setDescription(e.target.value), placeholder: 'Optional context…', style: { ...input, minHeight: 70, resize: 'vertical' } }),
                    ] }),
                    _jsxs('div', { children: [
                      _jsx('label', { htmlFor: 'kanban-detail-prompt', style: label, children: 'Execution prompt' }),
                      _jsx('textarea', { id: 'kanban-detail-prompt', value: prompt, onChange: e => setPrompt(e.target.value), placeholder: 'What the agent is asked to do…', style: { ...input, minHeight: 140, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 } }),
                    ] }),
                    _jsxs('div', { children: [
                      _jsx('label', { htmlFor: 'kanban-detail-assignee', style: label, children: 'Assignee / owner' }),
                      _jsx('input', { id: 'kanban-detail-assignee', value: assignee, onChange: e => setAssignee(e.target.value), placeholder: 'Unassigned', style: input }),
                    ] }),
                    _jsxs('div', { children: [
                      _jsx('label', { htmlFor: 'kanban-detail-metadata', style: label, children: 'Metadata (JSON)' }),
                      _jsx('textarea', { id: 'kanban-detail-metadata', value: metadataText, onChange: e => setMetadataText(e.target.value), style: { ...input, minHeight: 68, resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 11 } }),
                    ] }),
                    isDirty && _jsx('button', {
                      type: 'button', onClick: save,
                      style: { ...pill, width: '100%', background: T.accent, color: '#fff' },
                      children: 'Save changes',
                    }),
                  ],
                }),
                _jsxs('div', {
                  style: { display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 },
                  children: [
                    _jsxs('div', {
                      children: [
                        _jsx('div', { style: { ...label, marginBottom: 8 }, children: 'Engine' }),
                        _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [
                          _jsx(EngineBadge, { engine: currentEngine }),
                          _jsx('span', { style: { fontSize: 11, color: T.muted }, children: engineHelp }),
                        ] }),
                        _jsx('p', {
                          style: { margin: '6px 0 0', fontSize: 10, color: T.muted },
                          children: currentEngine === 'task_runner'
                            ? 'Navigation opens the Host Task Runner page.'
                            : currentEngine === 'autopilot'
                              ? 'Navigation opens this task’s Autopilot plan/approval Chat session.'
                              : currentEngine === 'chat'
                                ? 'Navigation opens this task’s Chat session.'
                                : 'Auto chooses Chat or Task Runner when you run the task.',
                        }),
                        latest && (latest.session_key || latest.runner_id) && _jsxs('button', {
                          type: 'button',
                          onClick: () => onOpenEngine(task, latest),
                          style: {
                            ...pill, width: '100%', marginTop: 10, background: T.accentSoft, color: T.accent,
                            border: '1px solid rgba(124,58,237,0.3)', justifyContent: 'flex-start',
                          },
                          children: [
                            currentEngine === 'task_runner' ? _jsx(Play, { size: 14 }) : _jsx(MessageSquare, { size: 14 }),
                            currentEngine === 'task_runner' ? 'Open Task Runner' : 'Open agent session',
                            _jsx(ExternalLink, { size: 12, style: { marginLeft: 'auto', opacity: 0.7 } }),
                          ],
                        }),
                      ],
                    }),
                    task.executions.length > 0 && _jsxs('div', {
                      children: [
                        _jsxs('div', {
                          style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
                          children: [
                            _jsx(Play, { size: 13, style: { color: T.accent } }),
                            _jsxs('span', { style: label, children: ['Runs (', String(task.executions.length), ')'] }),
                          ],
                        }),
                        _jsx('div', {
                          style: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' },
                          children: [...task.executions].reverse().map(exec => {
                            const dot = exec.result === 'succeeded' ? T.ok : exec.result === 'failed' ? T.danger : exec.result === 'cancelled' ? T.muted : T.warn
                            return _jsxs('div', {
                              style: {
                                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                                borderRadius: 6, background: T.bg, border: `1px solid ${T.border}`, fontSize: 11,
                              },
                              children: [
                                _jsx('span', { style: { width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }, 'aria-hidden': true }),
                                _jsx('span', { style: { fontWeight: 500, color: dot, flexShrink: 0 }, children: exec.result ? (RESULT_LABELS[exec.result] || exec.result) : 'Running' }),
                                _jsx(EngineBadge, { engine: exec.engine || 'chat' }),
                                _jsx('span', { style: { color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: duration(exec.started_at, exec.ended_at) }),
                                (exec.session_key || exec.runner_id) && _jsxs('button', {
                                  type: 'button',
                                  onClick: () => onOpenEngine(task, exec),
                                  style: {
                                    marginLeft: 'auto', flexShrink: 0, background: 'transparent', border: 'none',
                                    cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center',
                                    gap: 3, fontSize: 10, color: T.accent,
                                  },
                                  children: [_jsx(ExternalLink, { size: 9 }), 'Open'],
                                }),
                              ],
                            }, exec.id)
                          }),
                        }),
                        task.executions.some(e => e.error) && _jsx('p', {
                          style: { margin: '6px 0 0', fontSize: 10, color: T.danger, wordBreak: 'break-word' },
                          children: [...task.executions].reverse().find(e => e.error).error,
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          }),
          task.activity?.length > 0 && _jsxs('div', {
            style: { padding: '0 20px 14px' },
            children: [
              _jsx('div', { style: { ...label, marginBottom: 8 }, children: 'Activity' }),
              _jsx('div', { 'aria-label': 'Task activity', style: { display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 150, overflowY: 'auto' }, children: [...task.activity].reverse().map(item => _jsxs('div', { style: { fontSize: 11, color: T.muted, padding: '5px 8px', borderLeft: `2px solid ${T.accent}` }, children: [_jsx('strong', { style: { color: T.text }, children: item.kind.replaceAll('_', ' ') }), ' — ', item.summary] }, item.id)) }),
            ],
          }),
          // Footer actions
          _jsxs('div', {
            style: { display: 'flex', gap: 8, padding: '12px 20px', borderTop: `1px solid ${T.border}` },
            children: [
              !running ? _jsxs('button', {
                type: 'button', onClick: () => onRun(task),
                style: { ...pill, background: T.accent, color: '#fff' },
                children: [
                  task.executions.length > 0 ? _jsx(RotateCw, { size: 14 }) : _jsx(Play, { size: 14 }),
                  task.executions.length > 0 ? 'Run again' : 'Run',
                ],
              }) : _jsxs('span', {
                style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.warn, padding: '8px 12px' },
                children: [
                  _jsx('span', { style: { width: 6, height: 6, borderRadius: '50%', background: T.warn }, 'aria-hidden': true }),
                  'Running…',
                ],
              }),
              _jsxs('button', {
                type: 'button',
                onClick: () => { if (confirmDelete) onDelete(task.id); else setConfirmDelete(true) },
                style: { ...pill, marginLeft: 'auto', background: 'rgba(239,68,68,0.12)', color: T.danger },
                children: [_jsx(Trash2, { size: 14 }), confirmDelete ? 'Really delete?' : 'Delete'],
              }),
            ],
          }),
          // Discard guard, inside the dialog rather than a native confirm() so
          // it is reachable, themed, and cannot be suppressed by the browser.
          confirmDiscard && _jsxs('div', {
            role: 'alertdialog', 'aria-label': 'Unsaved changes',
            style: {
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px',
              borderTop: `1px solid ${T.border}`, background: 'rgba(234,179,8,0.08)',
            },
            children: [
              _jsx('span', { style: { flex: 1, fontSize: 12, color: T.text }, children: 'You have unsaved edits. Discard them?' }),
              _jsx('button', {
                type: 'button', onClick: () => setConfirmDiscard(false),
                style: { ...pill, padding: '6px 12px', fontSize: 12, background: T.hover, color: T.text },
                children: 'Keep editing',
              }),
              _jsx('button', {
                type: 'button', onClick: onClose,
                style: { ...pill, padding: '6px 12px', fontSize: 12, background: 'rgba(239,68,68,0.12)', color: T.danger },
                children: 'Discard',
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

// ── Task detail drawer ──

/**
 * The drawer follows the issue detail model rather than treating the raw
 * prompt as the page. The first screen answers three questions immediately:
 * what is this, where is it, and what can I do next? The original prompt and
 * description remain available as low-priority context, but do not compete
 * with status, execution, activity, or ownership.
 */
function TaskDetail({ task, onClose, onUpdate, onMove, onRun, onDelete, onOpenEngine }) {
  const [title, setTitle] = useState(task.title)
  const [assignee, setAssignee] = useState(task.assignee || '')
  const [metadataText, setMetadataText] = useState(JSON.stringify(task.metadata || {}, null, 2))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [drawerLeft, setDrawerLeft] = useState(null)
  const drawerOverlayRef = useRef(null)
  const latest = task.executions.length ? task.executions[task.executions.length - 1] : null
  const currentEngine = taskEngine(task)
  const running = task.status === 'running'
  const col = COLUMNS.find(c => c.id === task.status)
  const latestError = [...task.executions].reverse().find(execution => execution.error)?.error
  const latestProgress = latest?.progress_detail || latest?.progress
  const isDirty = title !== task.title || assignee !== (task.assignee || '') || metadataText !== JSON.stringify(task.metadata || {}, null, 2)

  // Adopt background title generation only when the user has not edited it.
  const seededTitle = useRef(task.title)
  useEffect(() => {
    setTitle(current => current === seededTitle.current ? task.title : current)
    seededTitle.current = task.title
  }, [task.title])

  const requestClose = useCallback(() => {
    if (isDirty) { setConfirmDiscard(true); return }
    onClose()
  }, [isDirty, onClose])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') requestClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [requestClose])

  // The host may render the app inside a horizontally translated/scrollable
  // surface. Measure that surface and place the panel at the visual viewport's
  // right edge rather than assuming the surface starts at x=0.
  useEffect(() => {
    const measureDrawer = () => {
      const overlay = drawerOverlayRef.current
      if (!overlay) return
      const panelWidth = Math.min(520, window.innerWidth * 0.94)
      const overlayLeft = overlay.getBoundingClientRect().left
      setDrawerLeft(Math.max(0, window.innerWidth - panelWidth - overlayLeft))
    }
    measureDrawer()
    window.addEventListener('resize', measureDrawer)
    window.addEventListener('scroll', measureDrawer, true)
    return () => {
      window.removeEventListener('resize', measureDrawer)
      window.removeEventListener('scroll', measureDrawer, true)
    }
  }, [])

  const save = () => {
    if (!isDirty) return
    let metadata
    try { metadata = JSON.parse(metadataText || '{}') } catch { return }
    if (!metadata || Array.isArray(metadata) || Object.values(metadata).some(value => typeof value !== 'string')) return
    onUpdate(task.id, { title, assignee: assignee || null, metadata })
  }

  const label = { fontSize: 10, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }
  const muted = { fontSize: 12, color: T.muted, lineHeight: 1.45 }
  const input = {
    width: '100%', boxSizing: 'border-box', background: T.bg, color: T.strong,
    border: `1px solid ${T.border}`, borderRadius: 7, padding: '7px 9px', fontSize: 12,
    outline: 'none', fontFamily: 'inherit',
  }
  const card = {
    background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14,
  }
  const pill = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '8px 12px', border: 'none',
  }
  const outcome = latest?.result ? (RESULT_LABELS[latest.result] || latest.result) : running ? 'Running' : 'Not started'
  const outcomeColor = latest?.result === 'succeeded' ? T.ok : latest?.result === 'failed' ? T.danger : running ? T.warn : T.muted
  const destinationLabel = currentEngine === 'task_runner' ? 'Open Task Runner' : 'Open agent session'
  const destinationIcon = currentEngine === 'task_runner' ? _jsx(Play, { size: 14 }) : _jsx(MessageSquare, { size: 14 })

  return _jsxs('div', {
    // The board can be wider than the viewport because its columns scroll
    // horizontally. Anchor the drawer to the viewport, not that scrollable
    // layout, or only a thin slice of the panel is visible on wide boards.
    ref: drawerOverlayRef,
    style: { position: 'fixed', top: 0, left: 0, bottom: 0, width: '100vw', maxWidth: '100vw', zIndex: 50, display: 'flex', justifyContent: 'flex-end', overflow: 'hidden' },
    children: [
      _jsx('button', {
        type: 'button', 'aria-label': 'Close task detail', onClick: requestClose,
        style: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)', border: 'none', cursor: 'default' },
      }),
      _jsxs('div', {
        role: 'dialog', 'aria-modal': true, 'aria-label': 'Task detail',
        style: {
          // The board's content can be wider than the viewport. Anchor the
          // panel from the viewport's left edge instead of the board's right
          // edge, so a horizontally scrollable board cannot push it offscreen.
          position: 'absolute', top: 0, left: drawerLeft == null ? 0 : drawerLeft, bottom: 0,
          width: 'min(520px, 94vw)', maxWidth: '100vw', background: T.elevated,
          borderLeft: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.28)', animation: 'kanban-drawer-in 180ms ease-out',
        },
        children: [
          // Header: identity and filing controls, matching an issue detail page.
          _jsxs('div', {
            style: { padding: '16px 20px 14px', borderBottom: `1px solid ${T.border}` },
            children: [
              _jsxs('div', {
                style: { display: 'flex', alignItems: 'flex-start', gap: 10 },
                children: [
                  _jsxs('div', { style: { flex: 1, minWidth: 0 }, children: [
                    _jsx('div', { style: { ...label, marginBottom: 6 }, children: 'Task' }),
                    _jsx('input', {
                      id: 'kanban-detail-title', 'aria-label': 'Task title', value: title,
                      onChange: e => setTitle(e.target.value),
                      style: { ...input, padding: 0, border: 'none', background: 'transparent', fontSize: 17, fontWeight: 650, color: T.strong },
                    }),
                  ] }),
                  _jsx(IconButton, { label: 'Close', onClick: requestClose, children: _jsx(X, { size: 17 }) }),
                ],
              }),
              _jsxs('div', {
                style: { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 12 },
                children: [
                  _jsx('select', {
                    'aria-label': 'Move to', value: task.status, disabled: running,
                    onChange: e => onMove(task.id, e.target.value),
                    style: { background: T.bg, color: col ? col.accent : T.text, border: `1px solid ${T.border}`, borderRadius: 999, fontSize: 11, fontWeight: 600, padding: '4px 9px', cursor: running ? 'not-allowed' : 'pointer' },
                    children: (running ? COLUMNS.map(c => c.id) : DROP_TARGETS).map(s => _jsx('option', { value: s, children: COLUMNS.find(c => c.id === s).label }, s)),
                  }),
                  _jsx(EngineBadge, { engine: currentEngine }),
                  task.priority && _jsx('span', { style: { borderRadius: 999, padding: '3px 8px', fontSize: 10, color: task.priority === 'high' ? T.danger : T.muted, background: T.bg, border: `1px solid ${T.border}` }, children: `${task.priority} priority` }),
                  task.refining && _jsxs('span', { style: { ...muted, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10 }, children: [_jsx(Loader2, { size: 10, style: { animation: 'kanban-spin 1s linear infinite' } }), 'Naming…'] }),
                  _jsx('span', { style: { marginLeft: 'auto', fontSize: 10, color: T.muted }, children: `Updated ${relativeTime(task.updated_at)}` }),
                ],
              }),
            ],
          }),

          _jsx('div', {
            style: { flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
            children: [
              // Primary execution card: the next decision is visible without
              // opening another page, while the engine-specific page remains a
              // deliberate escape hatch for deeper work.
              _jsxs('section', {
                'aria-label': 'Current execution', style: card, children: [
                  _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [
                    _jsx('span', { style: { width: 8, height: 8, borderRadius: '50%', background: outcomeColor }, 'aria-hidden': true }),
                    _jsx('span', { style: { fontSize: 14, fontWeight: 600, color: outcomeColor }, children: outcome }),
                    latest && _jsx('span', { style: { ...muted, marginLeft: 'auto' }, children: duration(latest.started_at, latest.ended_at) }),
                  ] }),
                  _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 7, marginTop: 8 }, children: [
                    _jsx('span', { style: { ...muted, fontWeight: 600 }, children: `Engine: ${ENGINE_LABELS[latest?.engine || currentEngine] || 'Auto'}` }),
                    _jsx('span', { style: muted, children: latest ? `Run ${task.executions.length} · ${formatTime(latest.started_at)}` : currentEngine === 'auto' ? 'Engine will be chosen when you run this task' : 'Ready to run' }),
                  ] }),
                  latestProgress && _jsx('div', { style: { marginTop: 10, padding: '8px 10px', borderRadius: 7, background: T.bg, color: T.text, fontSize: 12, lineHeight: 1.45 }, children: latestProgress }),
                  latestError && _jsxs('div', { role: 'alert', style: { marginTop: 10, display: 'flex', gap: 6, color: T.danger, fontSize: 12, lineHeight: 1.45 }, children: [_jsx(AlertCircle, { size: 13, style: { flexShrink: 0, marginTop: 1 } }), latestError] }),
                  _jsxs('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }, children: [
                    latest && (latest.session_key || latest.runner_id) && _jsxs('button', {
                      type: 'button', onClick: () => onOpenEngine(task, latest),
                      style: { ...pill, background: T.accentSoft, color: T.accent, border: '1px solid rgba(124,58,237,0.3)' },
                      children: [destinationIcon, destinationLabel, _jsx(ExternalLink, { size: 12 })],
                    }),
                    !running && _jsxs('button', {
                      type: 'button', onClick: () => onRun(task), style: { ...pill, background: T.accent, color: '#fff' },
                      children: [task.executions.length ? _jsx(RotateCw, { size: 13 }) : _jsx(Play, { size: 13 }), task.executions.length ? 'Run again' : 'Run now'],
                    }),
                  ] }),
                ],
              }),

              // Execution history is the durable record of runs. A completed
              // run is not the same thing as a finished issue; keep every run
              // visible and let the current status remain the source of truth.
              task.executions.length > 0 && _jsxs('section', {
                'aria-label': 'Execution history', style: card, children: [
                  _jsxs('div', { style: { display: 'flex', alignItems: 'center', marginBottom: 10 }, children: [
                    _jsx('span', { style: label, children: 'Execution history' }),
                    _jsx('span', { style: { marginLeft: 'auto', fontSize: 11, color: T.muted }, children: `${task.executions.length} run${task.executions.length === 1 ? '' : 's'}` }),
                  ] }),
                  _jsx('div', { style: { display: 'flex', flexDirection: 'column', gap: 7 }, children: [...task.executions].reverse().map(exec => {
                    const execColor = exec.result === 'succeeded' ? T.ok : exec.result === 'failed' ? T.danger : exec.result === 'cancelled' ? T.muted : T.warn
                    return _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', borderRadius: 7, background: T.bg, border: `1px solid ${T.border}` }, children: [
                      _jsx('span', { style: { width: 6, height: 6, borderRadius: '50%', background: execColor, flexShrink: 0 }, 'aria-hidden': true }),
                      _jsx('span', { style: { color: execColor, fontSize: 11, fontWeight: 600, minWidth: 65 }, children: exec.result ? (RESULT_LABELS[exec.result] || exec.result) : 'Running' }),
                      _jsx(EngineBadge, { engine: exec.engine || 'chat' }),
                      _jsx('span', { style: { ...muted, fontSize: 10 }, children: duration(exec.started_at, exec.ended_at) }),
                      (exec.session_key || exec.runner_id) && _jsx('button', { type: 'button', onClick: () => onOpenEngine(task, exec), style: { marginLeft: 'auto', border: 'none', background: 'transparent', color: T.accent, fontSize: 10, cursor: 'pointer', padding: 0 }, children: 'Open' }),
                    ] }, exec.id)
                  }) }),
                ],
              }),

              task.activity?.length > 0 && _jsxs('section', {
                'aria-label': 'Task activity', style: card, children: [
                  _jsx('div', { style: { ...label, marginBottom: 10 }, children: 'Activity' }),
                  _jsx('div', { style: { display: 'flex', flexDirection: 'column', gap: 0 }, children: [...task.activity].reverse().slice(0, 10).map(item => _jsxs('div', { style: { display: 'flex', gap: 9, padding: '0 0 10px', minHeight: 28 }, children: [
                    _jsx('span', { style: { width: 7, height: 7, marginTop: 4, borderRadius: '50%', background: T.accent, flexShrink: 0 }, 'aria-hidden': true }),
                    _jsxs('div', { style: { minWidth: 0 }, children: [
                      _jsx('div', { style: { fontSize: 11, color: T.text }, children: item.summary }),
                      _jsxs('div', { style: { fontSize: 10, color: T.muted, marginTop: 2 }, children: [item.kind.replaceAll('_', ' '), ' · ', relativeTime(item.at)] }),
                    ] }),
                  ] }, item.id)) }),
                ],
              }),

              _jsxs('section', {
                'aria-label': 'Task properties', style: card, children: [
                  _jsx('div', { style: { ...label, marginBottom: 10 }, children: 'Properties' }),
                  _jsxs('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }, children: [
                    _jsxs('label', { style: { ...muted, display: 'block' }, children: [_jsx('span', { style: label, children: 'Assignee' }), _jsx('input', { 'aria-label': 'Assignee / owner', value: assignee, onChange: e => setAssignee(e.target.value), placeholder: 'Unassigned', style: { ...input, marginTop: 5 } })] }),
                    _jsxs('div', { style: muted, children: [_jsx('div', { style: label, children: 'Priority' }), _jsx('div', { style: { marginTop: 8, color: task.priority === 'high' ? T.danger : T.text, fontSize: 12 }, children: task.priority || 'medium' })] }),
                    _jsxs('div', { style: muted, children: [_jsx('div', { style: label, children: 'Created' }), _jsx('div', { style: { marginTop: 8, color: T.text, fontSize: 11 }, children: formatTime(task.created_at) })] }),
                    _jsxs('div', { style: muted, children: [_jsx('div', { style: label, children: 'Tags' }), _jsx('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }, children: task.tags.length ? task.tags.map(tag => _jsx('span', { style: { background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, padding: '2px 6px', fontSize: 10, color: T.text }, children: tag }, tag)) : _jsx('span', { children: 'None' }) })] }),
                  ] }),
                  isDirty && _jsx('button', { type: 'button', onClick: save, style: { ...pill, width: '100%', marginTop: 12, background: T.accent, color: '#fff' }, children: 'Save properties' }),
                ],
              }),

              // Keep the source text available for audit/debugging without
              // letting it dominate the page. Most visits need the outcome and
              // activity, not a second copy of the create form.
              _jsxs('details', {
                style: { ...card, color: T.text }, children: [
                  _jsx('summary', { style: { cursor: 'pointer', fontSize: 12, fontWeight: 600 }, children: 'Original request' }),
                  _jsxs('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }, children: [
                    task.description && _jsxs('div', { children: [_jsx('div', { style: label, children: 'Description' }), _jsx('p', { style: { ...muted, margin: '5px 0 0', whiteSpace: 'pre-wrap' }, children: task.description })] }),
                    _jsxs('div', { children: [_jsx('div', { style: label, children: 'Prompt sent to engine' }), _jsx('p', { style: { ...muted, margin: '5px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', fontSize: 11 }, children: task.prompt })] }),
                  ] }),
                ],
              }),
            ],
          }),

          _jsxs('div', {
            style: { display: 'flex', gap: 8, padding: '12px 20px', borderTop: `1px solid ${T.border}` },
            children: [
              !running ? _jsxs('button', { type: 'button', onClick: () => onRun(task), style: { ...pill, background: T.accent, color: '#fff' }, children: [task.executions.length ? _jsx(RotateCw, { size: 14 }) : _jsx(Play, { size: 14 }), task.executions.length ? 'Run again' : 'Run'] }) : _jsxs('span', { style: { ...muted, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 4px', color: T.warn }, children: [_jsx(Loader2, { size: 13, style: { animation: 'kanban-spin 1s linear infinite' } }), 'Running…'] }),
              _jsxs('button', { type: 'button', onClick: () => { if (confirmDelete) onDelete(task.id); else setConfirmDelete(true) }, style: { ...pill, marginLeft: 'auto', background: 'rgba(239,68,68,0.12)', color: T.danger }, children: [_jsx(Trash2, { size: 14 }), confirmDelete ? 'Really delete?' : 'Delete'] }),
            ],
          }),
          confirmDiscard && _jsxs('div', { role: 'alertdialog', 'aria-label': 'Unsaved changes', style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderTop: `1px solid ${T.border}`, background: 'rgba(234,179,8,0.08)' }, children: [
            _jsx('span', { style: { flex: 1, fontSize: 12, color: T.text }, children: 'You have unsaved edits. Discard them?' }),
            _jsx('button', { type: 'button', onClick: () => setConfirmDiscard(false), style: { ...pill, padding: '6px 10px', background: T.hover, color: T.text }, children: 'Keep editing' }),
            _jsx('button', { type: 'button', onClick: onClose, style: { ...pill, padding: '6px 10px', background: 'rgba(239,68,68,0.12)', color: T.danger }, children: 'Discard' }),
          ] }),
        ],
      }),
    ],
  })
}

// ── Page ──

export default function KanbanApp() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // The id, not the record. Holding the object would freeze the modal at open
  // time, so a background settle or the namer landing a title would never reach
  // it; keying by id means the modal reads whatever the last poll returned, and
  // a card deleted elsewhere closes it instead of showing a ghost.
  const [selectedId, setSelectedId] = useState(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  // Survives the form's own unmount so a failed create can hand the prompt back.
  const [draftPrompt, setDraftPrompt] = useState('')
  const [draftEngine, setDraftEngine] = useState('auto')
  const [moveMenuTask, setMoveMenuTask] = useState(null)
  // Every mutation can fail in a way the user must see rather than infer from
  // nothing happening (a 400 on a blank title, a 409 on Run while running).
  const [actionError, setActionError] = useState(null)
  const [taskRunnerPrompt, setTaskRunnerPrompt] = useState(null)
  const [runBusyId, setRunBusyId] = useState(null)

  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  const refresh = useCallback(async () => {
    try {
      const data = await api('/tasks')
      setTasks(data.tasks || [])
    } catch (err) {
      // A failed poll is not the user's problem to act on; the previous board
      // stays up and the next tick retries.
      console.warn('kanban: poll failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Reconcile once per mount: settle cards a gateway restart left in Running.
  // Guarded so StrictMode's double-invoke does not fire a second sweep.
  const reconciledRef = useRef(false)
  useEffect(() => {
    if (reconciledRef.current) return
    reconciledRef.current = true
    api('/reconcile', jsonBody({})).catch(() => {}).finally(refresh)
  }, [refresh])

  // Poll faster while a card is running or still being named, back off when the
  // board is quiet.
  useEffect(() => {
    let timer = null
    let stopped = false
    const tick = async () => {
      await refresh()
      if (stopped) return
      const busy = tasksRef.current.some(t => t.refining || t.status === 'running')
      timer = setTimeout(tick, busy ? 1500 : 5000)
    }
    tick()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [refresh])

  const onError = useCallback(err => {
    setActionError(err instanceof Error ? err.message : String(err))
  }, [])

  // ── Actions ──

  const handleMove = useCallback((taskId, status) => {
    api(`/tasks/${taskId}/move`, jsonBody({ status })).then(refresh).catch(onError)
  }, [refresh, onError])

  const handleRun = useCallback(task => {
    setRunBusyId(task.id)
    api(`/tasks/${task.id}/run`, jsonBody({}))
      .then(refresh)
      .catch(err => {
        if (err?.code === 'task_runner_not_enabled') {
          setActionError(null)
          setTaskRunnerPrompt({ task, message: err.message, action: err.action })
          return
        }
        onError(err)
      })
      .finally(() => setRunBusyId(null))
  }, [refresh, onError])

  const handleCreate = useCallback(({ prompt, engine }) => {
    // Dismiss first, then dispatch. Creating a card does not wait on a model —
    // the backend returns a provisional title and names it a few seconds later
    // — so holding the form open until the POST returns would leave the user
    // staring at a filled-in form with nothing happening, and invite a second
    // submit. Dismissing does not risk the text: a failed create re-opens the
    // form with the prompt restored, alongside the error banner.
    setShowCreateForm(false)
    api('/tasks', jsonBody({ prompt, status: 'todo', engine }))
      .then(() => { setDraftPrompt(''); setDraftEngine('auto'); refresh() })
      .catch(err => {
        setDraftPrompt(prompt)
        setDraftEngine(engine)
        setShowCreateForm(true)
        onError(err)
      })
  }, [refresh, onError])

  const handleUpdate = useCallback((id, patch) => {
    api(`/tasks/${id}`, { ...jsonBody(patch), method: 'PATCH' }).then(refresh).catch(onError)
  }, [refresh, onError])

  const handleDelete = useCallback(id => {
    api(`/tasks/${id}`, { method: 'DELETE' })
      .then(() => { setSelectedId(null); refresh() })
      .catch(onError)
  }, [refresh, onError])

  // Route to the Host surface that owns the execution. Autopilot intentionally
  // uses the Chat route too: the slot is created in orchestrator mode, so the
  // destination shows the plan and its human approval controls.
  const handleOpenEngine = useCallback((task, execution) => {
    const engine = execution?.engine || task.active_engine || task.engine || 'auto'
    if (engine === 'task_runner') {
      navigate('/projects')
      return
    }
    if (execution?.session_key) {
      navigate(`/chat?sid=${encodeURIComponent(execution.session_key)}`)
      return
    }
    setActionError('This task has not started an engine session yet.')
  }, [navigate])

  // ── Derived ──

  const needle = search.trim().toLowerCase()
  const filtered = useMemo(() => (
    needle
      ? tasks.filter(t =>
          t.title.toLowerCase().includes(needle) ||
          t.description.toLowerCase().includes(needle) ||
          t.prompt.toLowerCase().includes(needle) ||
          t.tags.some(tag => tag.toLowerCase().includes(needle)))
      : tasks
  ), [tasks, needle])

  const selectedTask = tasks.find(t => t.id === selectedId) || null
  const byColumn = status => filtered.filter(t => t.status === status).sort((a, b) => b.updated_at - a.updated_at)

  // ── Render ──

  return _jsxs('div', {
    style: {
      display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0, height: '100%', overflow: 'hidden', position: 'relative',
      color: T.text, fontSize: 14,
    },
    children: [
      _jsx('style', { children: '@keyframes kanban-spin { from { transform: rotate(0) } to { transform: rotate(360deg) } } @keyframes kanban-drawer-in { from { transform: translateX(100%) } to { transform: translateX(0) } } @media (prefers-reduced-motion: reduce) { * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; } }' }),
      // Header
      _jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', padding: '16px 16px 12px' },
        children: [
          _jsxs('div', {
            style: { display: 'flex', alignItems: 'baseline', gap: 8 },
            children: [
              _jsx('h1', { style: { margin: 0, fontSize: 19, fontWeight: 600, color: T.strong }, children: 'Kanban' }),
              _jsxs('span', { style: { fontSize: 12, color: T.muted }, children: [String(tasks.length), ' tasks'] }),
            ],
          }),
          _jsxs('button', {
            type: 'button',
            onClick: () => setShowCreateForm(true),
            style: {
              display: 'inline-flex', alignItems: 'center', gap: 6, background: T.accent,
              color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
            },
            children: [_jsx(Plus, { size: 14 }), 'New task'],
          }),
          _jsxs('div', {
            style: { position: 'relative', display: 'inline-flex', alignItems: 'center' },
            children: [
              _jsx(Search, { size: 14, style: { position: 'absolute', left: 10, color: T.muted, pointerEvents: 'none' } }),
              _jsx('input', {
                'aria-label': 'Search tasks',
                placeholder: 'Search tasks…',
                value: search,
                onChange: e => setSearch(e.target.value),
                style: {
                  background: T.bg, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8,
                  padding: '7px 12px 7px 32px', fontSize: 12, width: 200, outline: 'none',
                },
              }),
            ],
          }),
          needle && _jsxs('span', { style: { fontSize: 11, color: T.muted }, children: [String(filtered.length), ' matches'] }),
        ],
      }),
      // A refused mutation says so. Dismissible rather than auto-hiding: a 409
      // on Run is the answer to something the user just clicked, and a banner
      // that vanishes on a timer is one they can miss entirely.
      actionError && _jsxs('div', {
        role: 'alert',
        style: {
          display: 'flex', alignItems: 'flex-start', gap: 8, margin: '0 16px 12px',
          padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.5)',
          background: 'rgba(239,68,68,0.08)', fontSize: 12, color: T.danger,
        },
        children: [
          _jsx('span', { style: { flex: 1 }, children: actionError }),
          _jsx(IconButton, { label: 'Dismiss error', onClick: () => setActionError(null), style: { color: T.danger, padding: 0 }, children: _jsx(X, { size: 14 }) }),
        ],
      }),
      taskRunnerPrompt && _jsx('div', {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Enable Task Runner',
        style: {
          position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,0.46)',
        },
        children: _jsxs('div', {
          style: {
            width: 'min(460px, 100%)', background: T.card, color: T.text,
            border: `1px solid ${T.borderStrong}`, borderRadius: 12, padding: 20,
            boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
          },
          children: [
            _jsxs('div', {
              style: { display: 'flex', alignItems: 'flex-start', gap: 10 },
              children: [
                _jsx(AlertCircle, { size: 18, style: { color: T.warn, flexShrink: 0, marginTop: 2 } }),
                _jsxs('div', {
                  style: { flex: 1 },
                  children: [
                    _jsx('h2', { style: { margin: 0, fontSize: 16, color: T.strong }, children: 'Enable Task Runner' }),
                    _jsx('p', { style: { margin: '10px 0 0', fontSize: 13, lineHeight: 1.5 }, children: taskRunnerPrompt.message }),
                    _jsx('p', { style: { margin: '8px 0 0', fontSize: 12, color: T.muted, lineHeight: 1.5 }, children: 'Nothing was started and this task remains ready to run.' }),
                  ],
                }),
                _jsx(IconButton, { label: 'Close enable prompt', onClick: () => setTaskRunnerPrompt(null), children: _jsx(X, { size: 15 }) }),
              ],
            }),
            _jsxs('div', {
              style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 },
              children: [
                _jsx('button', {
                  type: 'button',
                  onClick: () => setTaskRunnerPrompt(null),
                  style: { ...actionPill, background: T.hover, color: T.text },
                  children: 'Not now',
                }),
                _jsx('button', {
                  type: 'button',
                  onClick: () => {
                    setTaskRunnerPrompt(null)
                    navigate(taskRunnerPrompt.action?.path || '/projects')
                  },
                  style: { ...actionPill, background: T.accent, color: '#fff' },
                  children: taskRunnerPrompt.action?.label || 'Open Task Runner',
                }),
              ],
            }),
          ],
        }),
      }),
      // Board
      _jsx('div', {
        style: { flex: 1, minWidth: 0, overflow: 'auto', padding: '0 16px 16px' },
        children: loading
          ? _jsx('div', {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' },
              children: _jsxs('div', {
                style: { display: 'flex', alignItems: 'center', gap: 8, color: T.muted },
                children: [_jsx(KanbanSquare, { size: 20 }), _jsx('span', { style: { fontSize: 13 }, children: 'Loading board…' })],
              }),
            })
          : _jsx('div', {
              style: { display: 'flex', gap: 12, height: '100%', minWidth: 'min-content' },
              children: COLUMNS.map(column => {
                const colTasks = byColumn(column.id)
                return _jsx(Column, {
                  column,
                  tasks: colTasks,
                  onDropTask: handleMove,
                  children: colTasks.map(task => _jsx(TaskCard, {
                    task,
                    onClick: t => setSelectedId(t.id),
                    onRun: column.id === 'running' ? undefined : handleRun,
                    onOpenEngine: handleOpenEngine,
                    onMoveMenu: setMoveMenuTask,
                    runBusy: runBusyId === task.id,
                  }, task.id)),
                }, column.id)
              }),
            }),
      }),
      // Overlays
      selectedTask && _jsx(TaskDetail, {
        task: selectedTask,
        onClose: () => setSelectedId(null),
        onUpdate: handleUpdate,
        onMove: handleMove,
        onRun: handleRun,
        onDelete: handleDelete,
        onOpenEngine: handleOpenEngine,
      }),
      moveMenuTask && _jsx(MoveMenu, {
        task: moveMenuTask,
        onMove: handleMove,
        onClose: () => setMoveMenuTask(null),
      }),
      showCreateForm && _jsx(CreateTaskForm, {
        initialPrompt: draftPrompt,
        initialEngine: draftEngine,
        onSubmit: handleCreate,
        onCancel: () => { setDraftPrompt(''); setDraftEngine('auto'); setShowCreateForm(false) },
      }),
    ],
  })
}
