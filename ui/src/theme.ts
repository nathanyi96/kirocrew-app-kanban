export const T = {
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

export const actionPill = {
  display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none',
  borderRadius: 7, padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}

export const toneColor = tone => tone === 'ok'
  ? T.ok
  : tone === 'danger'
    ? T.danger
    : tone === 'info'
      ? T.info
      : tone === 'warn'
        ? T.warn
        : T.muted

export const toneSurface = tone => tone === 'ok'
  ? 'rgba(34,197,94,0.11)'
  : tone === 'danger'
    ? 'rgba(239,68,68,0.11)'
    : tone === 'info'
      ? 'rgba(8,145,178,0.11)'
      : tone === 'warn'
        ? 'rgba(234,179,8,0.11)'
        : 'rgba(127,127,136,0.11)'

export const toneBorder = tone => tone === 'ok'
  ? 'rgba(34,197,94,0.38)'
  : tone === 'danger'
    ? 'rgba(239,68,68,0.38)'
    : tone === 'info'
      ? 'rgba(8,145,178,0.38)'
      : tone === 'warn'
        ? 'rgba(234,179,8,0.38)'
        : 'rgba(127,127,136,0.3)'
