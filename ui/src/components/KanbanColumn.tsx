import { useState } from 'react'
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import { T } from '../theme.ts'
import { DROP_TARGETS } from '../lib/task-utils.ts'

export default function KanbanColumn({ column, tasks, onDropTask, children }) {
  const [isOver, setIsOver] = useState(false)
  const droppable = DROP_TARGETS.includes(column.id)
  // 300px, up from 264: at 264 a body line held ~26 latin characters, so the
  // card's two lines of context were half a sentence. Five lanes cost +180px,
  // which still fits a 1440-wide panel.
  return _jsxs('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 300, width: 300, flexShrink: 0 }, children: [
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: '8px 8px 0 0', background: T.elevated }, children: [
      _jsx('span', { style: { width: 8, height: 8, borderRadius: '50%', background: column.accent }, 'aria-hidden': true }),
      _jsx('h3', { style: { margin: 0, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: T.text }, children: column.label }),
      _jsx('span', { style: { marginLeft: 'auto', fontSize: 11, color: T.muted, fontVariantNumeric: 'tabular-nums' }, children: String(tasks.length) }),
    ] }),
    _jsxs('div', {
      onDragOver: droppable ? e => { e.preventDefault(); setIsOver(true) } : undefined,
      onDragLeave: droppable ? () => setIsOver(false) : undefined,
      onDrop: droppable ? e => { e.preventDefault(); setIsOver(false); const id = e.dataTransfer.getData('text/task-id'); if (id) onDropTask(id, column.id) } : undefined,
      style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: 8, borderRadius: '0 0 8px 8px', border: `1px solid ${isOver ? 'rgba(124,58,237,0.4)' : T.border}`, borderTop: 'none', background: isOver ? T.accentSoft : T.bg, overflowY: 'auto', minHeight: 200 },
      children: [children, tasks.length === 0 && _jsx('div', { style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 80 }, children: _jsx('p', { style: { fontSize: 11, color: T.muted, fontStyle: 'italic' }, children: 'No tasks' }) })],
    }),
  ] })
}
