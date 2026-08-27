import { useState } from 'react'
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'
import TaskGrid from './TaskGrid.tsx'

const { ChevronDown, ChevronRight, Loader2, RefreshCw, Sparkles } = lucide

const TALLY_ORDER = ['running', 'todo', 'backlog', 'done', 'failed']
const TALLY_COLOR = { backlog: T.muted, todo: T.info, running: T.warn, done: T.ok, failed: T.danger }

// A collapsed group still has to say what is inside it, and a count alone does
// not: this is the state distribution as coloured dots, so a collapsed project
// with a failure still shows red.
function Tally({ tasks }) {
  return _jsx('span', {
    style: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10.5, color: T.muted },
    children: TALLY_ORDER.filter(status => tasks.some(t => t.status === status)).map(status => _jsxs('span', {
      style: { display: 'inline-flex', alignItems: 'center', gap: 4 },
      children: [
        _jsx('span', { 'aria-hidden': true, style: { width: 6, height: 6, borderRadius: '50%', background: TALLY_COLOR[status], display: 'inline-block' } }),
        String(tasks.filter(t => t.status === status).length),
      ],
    }, status)),
  })
}

/**
 * Cluster and Project view share this: both are the flat grid cut into labelled,
 * collapsible sections, differing only in where the label comes from and what
 * the header offers.
 *
 * Collapse state is local and per-label rather than persisted — a group list
 * that the clustering pass can rewrite would leave stale keys behind, and a
 * section the user cannot see is a worse failure than one that reopens.
 */
export default function GroupedGrid({ groups, renderCard, aiLabelled = false, refreshing = false, onRefresh, emptyLabel }) {
  const [collapsed, setCollapsed] = useState({})

  if (!groups.length) {
    return _jsx('p', { style: { margin: '8px 2px 0', fontSize: 12, color: T.muted, fontStyle: 'italic' }, children: emptyLabel || 'No tasks' })
  }

  return _jsx('div', {
    children: groups.map(group => {
      const isCollapsed = Boolean(collapsed[group.label])
      const Caret = isCollapsed ? ChevronRight : ChevronDown
      return _jsxs('section', { style: { marginBottom: 22 }, children: [
        _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 9, padding: '7px 2px 11px' }, children: [
          _jsxs('button', {
            type: 'button',
            'aria-expanded': !isCollapsed,
            onClick: () => setCollapsed(current => ({ ...current, [group.label]: !current[group.label] })),
            style: { display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: T.strong },
            children: [
              _jsx(Caret, { size: 13, style: { color: T.muted }, 'aria-hidden': true }),
              _jsx('span', { style: { fontSize: 13, fontWeight: 650 }, children: group.label }),
            ],
          }),
          _jsxs('span', { style: { fontSize: 11, color: T.muted }, children: [String(group.tasks.length), group.tasks.length === 1 ? ' card' : ' cards'] }),
          // The AI badge rides on the GROUP, not the card: it is the grouping
          // that was proposed, and saying so is what makes correcting it feel
          // allowed rather than like fighting the tool.
          aiLabelled && !group.ungrouped && _jsxs('span', {
            style: { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 650, color: T.accent, background: T.accentSoft, border: '1px solid rgba(124,58,237,0.28)', borderRadius: 5, padding: '2px 6px' },
            children: [_jsx(Sparkles, { size: 10 }), 'AI'],
          }),
          group.note && _jsx('span', { style: { fontSize: 10.5, color: T.muted }, children: group.note }),
          _jsx(Tally, { tasks: group.tasks }),
          _jsx('span', { style: { flex: 1, height: 1, background: T.border } }),
          onRefresh && group === groups[0] && _jsxs('button', {
            type: 'button',
            onClick: onRefresh,
            disabled: refreshing,
            title: 'Propose new groups now',
            style: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.muted, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 6, padding: '3px 8px', cursor: refreshing ? 'wait' : 'pointer' },
            children: [
              refreshing
                ? _jsx(Loader2, { size: 11, style: { animation: 'kanban-spin 1s linear infinite' } })
                : _jsx(RefreshCw, { size: 11 }),
              refreshing ? 'Grouping…' : 'Regroup',
            ],
          }),
        ] }),
        !isCollapsed && _jsx(TaskGrid, { tasks: group.tasks, renderCard }),
        isCollapsed && _jsx('div', {
          style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: `1px dashed ${T.borderStrong}`, borderRadius: 9, background: 'rgba(0,0,0,0.14)', fontSize: 12, color: T.muted },
          children: `${group.tasks.length} ${group.tasks.length === 1 ? 'card' : 'cards'} hidden`,
        }),
      ] }, group.label)
    }),
  })
}
