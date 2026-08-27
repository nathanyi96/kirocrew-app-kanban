import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'
import { VIEW_MODES } from '../lib/view-mode.ts'

const { Columns3, Folder, LayoutGrid, Network } = lucide

const ICONS = { board: Columns3, flat: LayoutGrid, cluster: Network, project: Folder }

export default function ViewSwitcher({ view, onChange }) {
  return _jsx('div', {
    // A radiogroup, not a row of buttons: these are four mutually exclusive
    // states of one control, so arrow-key navigation and the "3 of 4" screen
    // reader position come for free and match what the control looks like.
    role: 'radiogroup',
    'aria-label': 'Board layout',
    style: {
      display: 'inline-flex', gap: 2, padding: 3, borderRadius: 9,
      background: T.elevated, border: `1px solid ${T.border}`,
    },
    children: VIEW_MODES.map(mode => {
      const Icon = ICONS[mode.id]
      const active = mode.id === view
      return _jsxs('button', {
        type: 'button',
        role: 'radio',
        'aria-checked': active,
        title: mode.help,
        onClick: () => onChange(mode.id),
        style: {
          display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none',
          borderRadius: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600,
          cursor: 'pointer',
          background: active ? T.card : 'transparent',
          color: active ? T.strong : T.muted,
          boxShadow: active ? '0 1px 3px rgba(0,0,0,0.32)' : 'none',
        },
        children: [Icon ? _jsx(Icon, { size: 13, 'aria-hidden': true }) : null, mode.label],
      }, mode.id)
    }),
  })
}
