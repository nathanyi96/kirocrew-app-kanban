import { jsx as _jsx } from 'react/jsx-runtime'
import { T } from '../theme.ts'

export default function IconButton({ label, onClick, children, style, disabled = false }) {
  return _jsx('button', {
    type: 'button',
    'aria-label': label,
    title: label,
    onClick,
    disabled,
    style: {
      background: 'transparent', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', padding: 4,
      borderRadius: 6, color: T.muted, display: 'inline-flex', alignItems: 'center',
      opacity: disabled ? 0.45 : 1,
      ...style,
    },
    children,
  })
}
