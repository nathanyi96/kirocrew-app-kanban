import { jsx as _jsx } from 'react/jsx-runtime'
import { T } from '../theme.ts'

// `auto-fill` with a min track rather than a breakpoint list: the panel this app
// renders into is resized by the detail drawer, not just by the window, so a
// media query would be answering about the wrong width. 316px is what fits ~34
// characters of body text — the width at which two lines stop being half a
// sentence.
export const GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(316px, 1fr))',
  gap: 11,
  alignItems: 'stretch',
}

export default function TaskGrid({ tasks, renderCard, emptyLabel = 'No tasks' }) {
  if (!tasks.length) {
    return _jsx('p', {
      style: { margin: '8px 2px 0', fontSize: 12, color: T.muted, fontStyle: 'italic' },
      children: emptyLabel,
    })
  }
  return _jsx('div', { style: GRID_STYLE, children: tasks.map(renderCard) })
}
