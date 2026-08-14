/**
 * Kanban — a task board where each card is a prompt an agent runs.
 *
 * Runs as a KiroCrew external app: a single ESM module, no build step. Only the
 * host import map is available, so there is no Tailwind and no @dnd-kit here —
 * styling is inline against the theme tokens, and dragging uses the native HTML5
 * drag events, which need no dependency.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from 'react/jsx-runtime'
import { useNavigate } from '@kirocrew/app-sdk'

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

const COLUMNS = [
  { id: 'backlog', label: 'Backlog', accent: T.muted },
  { id: 'todo', label: 'To do', accent: T.info },
  { id: 'running', label: 'Running', accent: T.warn },
  { id: 'done', label: 'Done', accent: T.ok },
  { id: 'failed', label: 'Failed', accent: T.danger },
]

/** Columns a card may be dragged into. `running` is set by running, not dragging. */
const DROP_TARGETS = ['backlog', 'todo', 'done', 'failed']

const CRON_PRESETS = [
  { label: 'Daily 9am', cron: '0 9 * * *' },
  { label: 'Hourly', cron: '0 * * * *' },
  { label: 'Every 10m', cron: '*/10 * * * *' },
  { label: 'Weekdays 9am', cron: '0 9 * * MON-FRI' },
]

// ── Helpers ──

async function api(path, options) {
  const res = await fetch(API + path, { credentials: 'same-origin', ...options })
  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      detail = body && body.error ? body.error : ''
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail || `request failed (${res.status})`)
  }
  return res.status === 204 ? null : res.json()
}

const postJson = (path, body) =>
  api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })

function relativeTime(ts) {
  if (!ts) return ''
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function absoluteTime(ts) {
  return ts ? new Date(ts * 1000).toLocaleString() : ''
}

function runDuration(startedAt, endedAt) {
  const end = endedAt || Date.now() / 1000
  const secs = Math.max(0, Math.round(end - startedAt))
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

const RESULT_COLORS = {
  succeeded: T.ok,
  failed: T.danger,
  cancelled: T.muted,
}

// ── Shared style objects ──

const S = {
  pillBtn: {
    borderRadius: '9999px',
    fontSize: '11px',
    fontWeight: 500,
    padding: '5px 14px',
    cursor: 'pointer',
    border: 'none',
  },
  ghostBtn: {
    borderRadius: '9999px',
    fontSize: '11px',
    fontWeight: 500,
    padding: '5px 14px',
    cursor: 'pointer',
    background: 'transparent',
    color: T.accent,
    border: `1px solid ${T.accentSoft}`,
    whiteSpace: 'nowrap',
  },
  input: {
    background: T.bg,
    border: `1px solid ${T.border}`,
    borderRadius: '6px',
    padding: '7px 10px',
    fontSize: '12px',
    color: T.text,
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  label: {
    fontSize: '10px',
    fontWeight: 600,
    color: T.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    display: 'block',
    marginBottom: '5px',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: T.accent,
    fontSize: '11px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontFamily: 'inherit',
  },
}

function Badge({ text, fg, bg }) {
  return _jsx('span', {
    style: {
      background: bg,
      color: fg,
      padding: '2px 7px',
      borderRadius: '9999px',
      fontSize: '10px',
      fontWeight: 600,
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    },
    children: text,
  })
}

// ── Icon ──

function KanbanIcon({ size = 20 }) {
  return _jsxs('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: T.accent,
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    children: [
      _jsx('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }, 'frame'),
      _jsx('path', { d: 'M9 3v12' }, 'c1'),
      _jsx('path', { d: 'M15 3v7' }, 'c2'),
    ],
  })
}

// ── Create dialog ──

function CreateDialog({ onSubmit, onCancel, busy }) {
  const [prompt, setPrompt] = useState('')
  const areaRef = useRef(null)

  useEffect(() => {
    areaRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  const submit = (e) => {
    e.preventDefault()
    const text = prompt.trim()
    if (text && !busy) onSubmit(text)
  }

  return _jsx('div', {
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 40,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    },
    onClick: () => { if (!busy) onCancel() },
    children: _jsxs('form', {
      onSubmit: submit,
      onClick: (e) => e.stopPropagation(),
      style: {
        width: '100%',
        maxWidth: '520px',
        background: T.elevated,
        border: `1px solid ${T.border}`,
        borderRadius: '10px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      },
      children: [
        _jsxs('div', {
          style: { display: 'flex', alignItems: 'center', gap: '8px' },
          children: [
            _jsx(KanbanIcon, { size: 16 }),
            _jsx('span', {
              style: { fontSize: '14px', fontWeight: 600, color: T.strong },
              children: 'New task',
            }),
          ],
        }),
        _jsxs('div', {
          children: [
            _jsx('label', {
              style: S.label,
              htmlFor: 'kanban-prompt',
              children: 'What do you want the agent to do?',
            }),
            _jsx('textarea', {
              id: 'kanban-prompt',
              ref: areaRef,
              value: prompt,
              disabled: busy,
              onChange: (e) => setPrompt(e.target.value),
              placeholder:
                'Describe it in your own words — e.g. "Upgrade the npm dependencies and fix anything that breaks"',
              style: { ...S.input, minHeight: '120px', resize: 'vertical', lineHeight: 1.5 },
            }),
          ],
        }),
        _jsx('p', {
          style: { margin: 0, fontSize: '11px', color: T.muted, lineHeight: 1.5 },
          children:
            'The board writes the title and summary for you, then puts the card in To do so you can look it over before it runs.',
        }),
        _jsxs('div', {
          style: { display: 'flex', gap: '8px' },
          children: [
            _jsx('button', {
              type: 'submit',
              disabled: busy || !prompt.trim(),
              style: {
                ...S.pillBtn,
                flex: 1,
                padding: '8px 14px',
                background: busy || !prompt.trim() ? T.hover : T.accent,
                color: busy || !prompt.trim() ? T.muted : '#fff',
                cursor: busy || !prompt.trim() ? 'default' : 'pointer',
              },
              children: busy ? 'Creating…' : 'Create task',
            }),
            _jsx('button', {
              type: 'button',
              onClick: onCancel,
              disabled: busy,
              style: { ...S.ghostBtn, padding: '8px 14px', color: T.text, borderColor: T.border },
              children: 'Cancel',
            }),
          ],
        }),
      ],
    }),
  })
}

// ── Detail modal ──

function ScheduleSection({ task, onSchedule, saving }) {
  const [enabled, setEnabled] = useState(Boolean(task.schedule?.enabled))
  const [cron, setCron] = useState(task.schedule?.cron || '')

  return _jsxs('div', {
    children: [
      _jsx('span', { style: S.label, children: 'Schedule' }),
      _jsxs('label', {
        style: { display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', marginBottom: '8px' },
        children: [
          _jsx('input', {
            type: 'checkbox',
            checked: enabled,
            onChange: (e) => setEnabled(e.target.checked),
            style: { accentColor: T.accent, cursor: 'pointer' },
          }),
          _jsx('span', { style: { fontSize: '12px', color: T.text }, children: 'Run on a schedule' }),
        ],
      }),
      _jsxs('div', {
        style: { display: 'flex', gap: '6px' },
        children: [
          _jsx('input', {
            value: cron,
            onChange: (e) => setCron(e.target.value),
            placeholder: '0 9 * * MON-FRI',
            'aria-label': 'Cron expression',
            style: { ...S.input, fontFamily: 'var(--mono, monospace)', fontSize: '11px' },
          }),
          _jsx('button', {
            onClick: () => onSchedule({ enabled, cron: cron.trim() }),
            disabled: saving || (enabled && !cron.trim()),
            style: {
              ...S.ghostBtn,
              opacity: saving || (enabled && !cron.trim()) ? 0.5 : 1,
            },
            children: saving ? 'Saving…' : 'Save',
          }),
        ],
      }),
      _jsx('div', {
        style: { display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '8px' },
        children: CRON_PRESETS.map((preset) =>
          _jsx('button', {
            onClick: () => setCron(preset.cron),
            style: {
              background: T.hover,
              border: 'none',
              borderRadius: '9999px',
              padding: '3px 9px',
              fontSize: '10px',
              color: T.muted,
              cursor: 'pointer',
              fontFamily: 'inherit',
            },
            children: preset.label,
          }, preset.cron)
        ),
      }),
      task.schedule?.enabled && task.schedule?.next_run_at
        ? _jsx('p', {
            style: { margin: '8px 0 0', fontSize: '10px', color: T.muted },
            children: `Next run ${absoluteTime(task.schedule.next_run_at)}`,
          })
        : null,
    ],
  })
}

function RunHistory({ task, onOpenSession }) {
  if (!task.executions?.length) return null
  const withError = [...task.executions].reverse().find((e) => e.error)
  return _jsxs('div', {
    children: [
      _jsx('span', { style: S.label, children: `Runs (${task.executions.length})` }),
      _jsx('div', {
        style: { display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '180px', overflowY: 'auto' },
        children: [...task.executions].reverse().map((ex) =>
          _jsxs('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '5px 9px',
              background: T.bg,
              border: `1px solid ${T.border}`,
              borderRadius: '6px',
              fontSize: '11px',
            },
            children: [
              _jsx('span', {
                style: {
                  width: '6px',
                  height: '6px',
                  borderRadius: '9999px',
                  flexShrink: 0,
                  background: RESULT_COLORS[ex.result] || T.warn,
                },
              }),
              _jsx('span', {
                style: { color: RESULT_COLORS[ex.result] || T.warn, fontWeight: 500, flexShrink: 0 },
                children: ex.result || 'running',
              }),
              _jsx('span', { style: { color: T.muted }, children: runDuration(ex.started_at, ex.ended_at) }),
              ex.session_key
                ? _jsx('button', {
                    onClick: () => onOpenSession(ex.session_key),
                    style: { ...S.linkBtn, marginLeft: 'auto', flexShrink: 0 },
                    children: 'open',
                  })
                : null,
            ],
          }, ex.id)
        ),
      }),
      withError
        ? _jsx('p', {
            style: { margin: '7px 0 0', fontSize: '10px', color: T.danger, wordBreak: 'break-word' },
            children: withError.error,
          })
        : null,
    ],
  })
}

function DetailModal({ task, onClose, onSave, onRun, onDelete, onSchedule, onOpenSession, saving }) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')
  const [prompt, setPrompt] = useState(task.prompt || '')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const column = COLUMNS.find((c) => c.id === task.status)
  const dirty =
    title !== task.title ||
    description !== (task.description || '') ||
    prompt !== (task.prompt || '')
  const latest = task.executions?.length ? task.executions[task.executions.length - 1] : null
  const running = task.status === 'running'

  return _jsx('div', {
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 40,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    },
    onClick: onClose,
    children: _jsxs('div', {
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'Task detail',
      onClick: (e) => e.stopPropagation(),
      style: {
        width: '100%',
        maxWidth: '780px',
        maxHeight: '85vh',
        background: T.elevated,
        border: `1px solid ${T.border}`,
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      },
      children: [
        // Header
        _jsxs('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 20px',
            borderBottom: `1px solid ${T.border}`,
          },
          children: [
            _jsx(Badge, {
              text: (column?.label || task.status).toUpperCase(),
              fg: column?.accent || T.muted,
              bg: T.hover,
            }),
            task.schedule?.enabled
              ? _jsx('span', {
                  style: { fontSize: '11px', color: T.info, fontFamily: 'var(--mono, monospace)' },
                  children: task.schedule.cron,
                })
              : null,
            _jsx('span', {
              style: { marginLeft: 'auto', fontSize: '10px', color: T.muted },
              children: `Updated ${relativeTime(task.updated_at)}`,
            }),
            _jsx('button', {
              onClick: onClose,
              'aria-label': 'Close',
              style: { background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '2px 4px' },
              children: '✕',
            }),
          ],
        }),
        // Body
        _jsx('div', {
          style: { flex: 1, overflowY: 'auto', padding: '20px' },
          children: _jsxs('div', {
            style: { display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' },
            children: [
              // Left: the editable card
              _jsxs('div', {
                style: { flex: '1 1 340px', minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '14px' },
                children: [
                  _jsxs('div', {
                    children: [
                      _jsx('label', { style: S.label, htmlFor: 'k-title', children: 'Title' }),
                      _jsx('input', {
                        id: 'k-title',
                        value: title,
                        onChange: (e) => setTitle(e.target.value),
                        style: { ...S.input, color: T.strong },
                      }),
                    ],
                  }),
                  _jsxs('div', {
                    children: [
                      _jsx('label', { style: S.label, htmlFor: 'k-desc', children: 'Description' }),
                      _jsx('textarea', {
                        id: 'k-desc',
                        value: description,
                        onChange: (e) => setDescription(e.target.value),
                        placeholder: 'What is this task about?',
                        style: { ...S.input, minHeight: '70px', resize: 'vertical' },
                      }),
                    ],
                  }),
                  _jsxs('div', {
                    children: [
                      _jsx('label', { style: S.label, htmlFor: 'k-prompt', children: 'Prompt the agent runs' }),
                      _jsx('textarea', {
                        id: 'k-prompt',
                        value: prompt,
                        onChange: (e) => setPrompt(e.target.value),
                        placeholder: 'What the agent is asked to do when this card runs…',
                        style: {
                          ...S.input,
                          minHeight: '140px',
                          resize: 'vertical',
                          fontFamily: 'var(--mono, monospace)',
                          fontSize: '11px',
                          lineHeight: 1.6,
                        },
                      }),
                    ],
                  }),
                  dirty
                    ? _jsx('button', {
                        onClick: () => onSave({ title, description, prompt }),
                        disabled: saving,
                        style: { ...S.pillBtn, background: T.accent, color: '#fff', padding: '8px 14px' },
                        children: saving ? 'Saving…' : 'Save changes',
                      })
                    : null,
                ],
              }),
              // Right: session, schedule, history
              _jsxs('div', {
                style: { flex: '1 1 240px', minWidth: '220px', display: 'flex', flexDirection: 'column', gap: '18px' },
                children: [
                  latest?.session_key
                    ? _jsxs('div', {
                        children: [
                          _jsx('span', { style: S.label, children: 'Session' }),
                          _jsx('button', {
                            onClick: () => onOpenSession(latest.session_key),
                            style: {
                              width: '100%',
                              background: T.accentSoft,
                              border: `1px solid ${T.accentSoft}`,
                              borderRadius: '6px',
                              padding: '9px 12px',
                              color: T.accent,
                              fontSize: '12px',
                              fontWeight: 500,
                              cursor: 'pointer',
                              textAlign: 'left',
                              fontFamily: 'inherit',
                            },
                            children: running ? 'Watch the agent work →' : 'Open the agent session →',
                          }),
                          _jsx('p', {
                            style: { margin: '6px 0 0', fontSize: '10px', color: T.muted, lineHeight: 1.5 },
                            children: running
                              ? 'The agent is working now — open it to follow along.'
                              : 'Read the full transcript of what the agent did.',
                          }),
                        ],
                      })
                    : null,
                  _jsx(ScheduleSection, { task, onSchedule, saving }),
                  _jsx(RunHistory, { task, onOpenSession }),
                ],
              }),
            ],
          }),
        }),
        // Footer
        _jsxs('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 20px',
            borderTop: `1px solid ${T.border}`,
          },
          children: [
            running
              ? _jsxs('span', {
                  style: { display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: T.warn },
                  children: [
                    _jsx('span', { style: { width: '6px', height: '6px', borderRadius: '9999px', background: T.warn } }),
                    'Running…',
                  ],
                })
              : _jsx('button', {
                  onClick: () => onRun(task),
                  style: { ...S.pillBtn, background: T.accent, color: '#fff' },
                  children: task.executions?.length ? '▶ Run again' : '▶ Run',
                }),
            _jsx('button', {
              onClick: () => (confirmDelete ? onDelete(task.id) : setConfirmDelete(true)),
              style: {
                ...S.pillBtn,
                marginLeft: 'auto',
                background: 'rgba(239,68,68,0.14)',
                color: T.danger,
              },
              children: confirmDelete ? 'Really delete' : 'Delete',
            }),
          ],
        }),
      ],
    }),
  })
}

// ── Card ──

function Card({ task, onOpen, onRun, onOpenSession, onDragStart, onDragEnd, dragging }) {
  const latest = task.executions?.length ? task.executions[task.executions.length - 1] : null
  const running = task.status === 'running'
  const failed = task.status === 'failed'
  const subtitle = task.description || task.prompt
  const accent = failed ? T.danger : running ? T.warn : task.status === 'done' ? T.ok : T.borderStrong

  return _jsxs('div', {
    draggable: !running,
    onDragStart: (e) => {
      e.dataTransfer.setData('text/plain', task.id)
      e.dataTransfer.effectAllowed = 'move'
      onDragStart(task)
    },
    onDragEnd,
    onClick: () => onOpen(task),
    onKeyDown: (e) => { if (e.key === 'Enter') onOpen(task) },
    role: 'button',
    tabIndex: 0,
    style: {
      position: 'relative',
      background: T.card,
      border: `1px solid ${failed || running ? accent + '66' : T.border}`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: '6px',
      padding: '11px 12px',
      cursor: running ? 'pointer' : 'grab',
      opacity: dragging ? 0.45 : 1,
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    },
    children: [
      _jsxs('div', {
        style: { display: 'flex', alignItems: 'flex-start', gap: '7px' },
        children: [
          _jsx('span', {
            style: {
              flex: 1,
              fontSize: '13px',
              fontWeight: 500,
              color: T.strong,
              lineHeight: 1.35,
              wordBreak: 'break-word',
            },
            children: task.title,
          }),
          task.priority === 'high'
            ? _jsx(Badge, { text: 'HIGH', fg: T.danger, bg: 'rgba(239,68,68,0.14)' })
            : null,
        ],
      }),
      subtitle
        ? _jsx('p', {
            style: {
              margin: 0,
              fontSize: '11px',
              color: T.muted,
              lineHeight: 1.45,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            },
            children: subtitle,
          })
        : null,
      failed && latest?.error
        ? _jsx('p', {
            style: {
              margin: 0,
              fontSize: '10px',
              color: T.danger,
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            },
            children: latest.error,
          })
        : null,
      _jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: '9px', fontSize: '10px', color: T.muted, flexWrap: 'wrap' },
        children: [
          _jsx('span', { children: relativeTime(task.updated_at) }),
          task.executions?.length
            ? _jsx('span', { children: `▶ ${task.executions.length}` })
            : null,
          task.schedule?.enabled
            ? _jsx('span', { style: { color: T.info }, children: '⏱ cron' })
            : null,
          ...(task.tags || []).slice(0, 2).map((tag) =>
            _jsx('span', {
              style: { background: T.hover, borderRadius: '9999px', padding: '1px 7px' },
              children: tag,
            }, tag)
          ),
        ],
      }),
      latest?.session_key || !running
        ? _jsxs('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: '2px',
              paddingTop: '7px',
              borderTop: `1px solid ${T.border}`,
            },
            children: [
              latest?.session_key
                ? _jsx('button', {
                    onClick: (e) => { e.stopPropagation(); onOpenSession(latest.session_key) },
                    style: S.linkBtn,
                    children: running ? '◉ Watch live' : '◎ View session',
                  })
                : null,
              !running
                ? _jsx('button', {
                    onClick: (e) => { e.stopPropagation(); onRun(task) },
                    style: { ...S.linkBtn, marginLeft: 'auto', color: T.muted },
                    children: task.executions?.length ? '▶ Run again' : '▶ Run',
                  })
                : null,
            ],
          })
        : null,
    ],
  })
}

// ── Column ──

function Column({ column, tasks, onOpen, onRun, onOpenSession, dragging, onDragStart, onDragEnd, onDrop }) {
  const [over, setOver] = useState(false)
  const droppable = DROP_TARGETS.includes(column.id)

  return _jsxs('div', {
    style: { display: 'flex', flexDirection: 'column', width: '286px', flexShrink: 0, maxHeight: '100%' },
    children: [
      _jsxs('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          padding: '8px 12px',
          background: T.hover,
          borderRadius: '6px 6px 0 0',
        },
        children: [
          _jsx('span', {
            style: { width: '7px', height: '7px', borderRadius: '9999px', background: column.accent },
          }),
          _jsx('span', {
            style: {
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: column.accent,
            },
            children: column.label,
          }),
          _jsx('span', {
            style: { marginLeft: 'auto', fontSize: '10px', color: T.muted, fontVariantNumeric: 'tabular-nums' },
            children: String(tasks.length),
          }),
        ],
      }),
      _jsxs('div', {
        onDragOver: (e) => {
          if (!droppable || !dragging) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (!over) setOver(true)
        },
        onDragLeave: () => setOver(false),
        onDrop: (e) => {
          e.preventDefault()
          setOver(false)
          if (droppable) onDrop(column.id)
        },
        style: {
          flex: 1,
          minHeight: '180px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '8px',
          background: over ? T.accentSoft : T.bg,
          border: `1px solid ${over ? T.accent : T.border}`,
          borderTop: 'none',
          borderRadius: '0 0 6px 6px',
          transition: 'background 120ms ease',
        },
        children: [
          ...tasks.map((task) =>
            _jsx(Card, {
              task,
              onOpen,
              onRun,
              onOpenSession,
              onDragStart,
              onDragEnd,
              dragging: dragging?.id === task.id,
            }, task.id)
          ),
          tasks.length === 0
            ? _jsx('div', {
                style: {
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minHeight: '70px',
                  fontSize: '11px',
                  color: T.muted,
                  fontStyle: 'italic',
                },
                children: over ? 'Drop here' : 'No tasks',
              })
            : null,
        ],
      }),
    ],
  })
}

// ── App ──

export default function KanbanApp() {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(null)
  const reconciled = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const data = await api('/tasks')
      setTasks(data?.tasks || [])
      setError('')
    } catch (e) {
      setError(e.message || 'could not load the board')
    } finally {
      setLoading(false)
    }
  }, [])

  // First load reconciles runs a restart orphaned, then polls so a settling
  // card updates without the user touching anything.
  useEffect(() => {
    let alive = true
    const tick = async () => {
      if (!reconciled.current) {
        reconciled.current = true
        try { await postJson('/reconcile') } catch { /* best effort */ }
      }
      if (alive) await refresh()
    }
    tick()
    const timer = setInterval(tick, 5000)
    return () => { alive = false; clearInterval(timer) }
  }, [refresh])

  const selected = useMemo(
    () => tasks.find((t) => t.id === selectedId) || null,
    [tasks, selectedId]
  )

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return tasks
    return tasks.filter(
      (t) =>
        (t.title || '').toLowerCase().includes(needle) ||
        (t.description || '').toLowerCase().includes(needle) ||
        (t.prompt || '').toLowerCase().includes(needle) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(needle))
    )
  }, [tasks, search])

  const byColumn = useCallback(
    (status) =>
      filtered
        .filter((t) => t.status === status)
        .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0)),
    [filtered]
  )

  const guard = useCallback(async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      await refresh()
    } catch (e) {
      setError(e.message || 'that did not work')
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const handleCreate = useCallback((prompt) => guard(async () => {
    let card = { title: prompt.slice(0, 60), description: '', prompt }
    try {
      const refined = await postJson('/refine', { prompt })
      if (refined?.title) card = refined
    } catch {
      /* refine is a convenience; fall back to the raw prompt */
    }
    await postJson('/tasks', { ...card, status: 'todo' })
    setCreating(false)
  }), [guard])

  const handleMove = useCallback((taskId, status) => guard(
    () => postJson(`/tasks/${taskId}/move`, { status })
  ), [guard])

  const handleRun = useCallback((task) => guard(
    () => postJson(`/tasks/${task.id}/run`)
  ), [guard])

  const handleSave = useCallback((patch) => guard(
    () => api(`/tasks/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  ), [guard, selectedId])

  const handleDelete = useCallback((taskId) => guard(async () => {
    await api(`/tasks/${taskId}`, { method: 'DELETE' })
    setSelectedId(null)
  }), [guard])

  const handleSchedule = useCallback((rule) => guard(
    () => postJson(`/tasks/${selectedId}/schedule`, rule)
  ), [guard, selectedId])

  /** The dashboard addresses a session by slot key in `sid`; the slug is cosmetic. */
  const openSession = useCallback((sessionKey) => {
    navigate(`/chat?sid=${encodeURIComponent(sessionKey)}`)
  }, [navigate])

  const onDrop = useCallback((status) => {
    const card = dragging
    setDragging(null)
    if (!card || card.status === status) return
    if (card.status === 'running' && status !== 'done' && status !== 'failed') return
    handleMove(card.id, status)
  }, [dragging, handleMove])

  return _jsxs('div', {
    // relative, so the modals below cover this panel and not the whole dashboard
    style: {
      position: 'relative',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      color: T.text,
    },
    children: [
      // Header — title and controls together on the left
      _jsxs('div', {
        style: { display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 16px 12px', flexWrap: 'wrap' },
        children: [
          _jsxs('div', {
            style: { display: 'flex', alignItems: 'center', gap: '9px' },
            children: [
              _jsx(KanbanIcon, {}),
              _jsx('h2', { style: { margin: 0, fontSize: '18px', color: T.strong }, children: 'Kanban' }),
              _jsx('span', {
                style: { fontSize: '11px', color: T.muted },
                children: `${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
              }),
            ],
          }),
          _jsx('button', {
            onClick: () => setCreating(true),
            style: { ...S.pillBtn, background: T.accent, color: '#fff' },
            children: '+ New task',
          }),
          _jsx('input', {
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: 'Search tasks…',
            'aria-label': 'Search tasks',
            style: { ...S.input, width: '210px' },
          }),
          search.trim()
            ? _jsx('span', {
                style: { fontSize: '10px', color: T.muted },
                children: `${filtered.length} match${filtered.length === 1 ? '' : 'es'}`,
              })
            : null,
        ],
      }),
      error
        ? _jsx('div', {
            style: {
              margin: '0 16px 10px',
              padding: '8px 12px',
              background: 'rgba(239,68,68,0.14)',
              color: T.danger,
              borderRadius: '6px',
              fontSize: '11px',
            },
            children: error,
          })
        : null,
      // Board
      _jsx('div', {
        style: { flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '0 16px 16px' },
        children: loading
          ? _jsx('div', {
              style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '12px', color: T.muted },
              children: 'Loading the board…',
            })
          : _jsx('div', {
              style: { display: 'flex', gap: '12px', height: '100%', alignItems: 'stretch' },
              children: COLUMNS.map((column) =>
                _jsx(Column, {
                  column,
                  tasks: byColumn(column.id),
                  onOpen: (t) => setSelectedId(t.id),
                  onRun: handleRun,
                  onOpenSession: openSession,
                  dragging,
                  onDragStart: setDragging,
                  onDragEnd: () => setDragging(null),
                  onDrop,
                }, column.id)
              ),
            }),
      }),
      selected
        ? _jsx(DetailModal, {
            task: selected,
            saving: busy,
            onClose: () => setSelectedId(null),
            onSave: handleSave,
            onRun: handleRun,
            onDelete: handleDelete,
            onSchedule: handleSchedule,
            onOpenSession: openSession,
          })
        : null,
      creating
        ? _jsx(CreateDialog, {
            busy,
            onSubmit: handleCreate,
            onCancel: () => setCreating(false),
          })
        : null,
    ],
  })
}
