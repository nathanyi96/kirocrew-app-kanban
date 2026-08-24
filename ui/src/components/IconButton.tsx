import { jsx as _jsx } from 'react/jsx-runtime'
import { T } from '../theme.ts'

export default function IconButton({ label, onClick, children, style }) {
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
