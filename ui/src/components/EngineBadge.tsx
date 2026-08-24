import { jsx as _jsx } from 'react/jsx-runtime'
import { ENGINE_LABELS } from '../lib/task-utils.ts'
import { T } from '../theme.ts'

export default function EngineBadge({ engine }) {
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
