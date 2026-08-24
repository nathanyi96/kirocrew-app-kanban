export function relativeTime(ts) {
  const secs = Math.max(0, Math.round(Date.now() / 1000 - ts))
  if (secs < 60) return 'now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`
  return `${Math.floor(secs / 86400)}d ago`
}

export function formatTime(ts) {
  return new Date(ts * 1000).toLocaleString()
}

export function duration(startedAt, endedAt) {
  const end = endedAt ?? Date.now() / 1000
  const secs = Math.max(0, Math.round(end - startedAt))
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}
