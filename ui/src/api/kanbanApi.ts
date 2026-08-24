const API = '/api/apps/kanban'

export class KanbanApiError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'KanbanApiError'
    this.code = details.code || ''
    this.action = details.action || null
  }
}

/** Shared HTTP client for all board mutations and reads. */
export async function api(path, options) {
  const res = await fetch(API + path, { credentials: 'same-origin', ...options })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let message = `${res.status}${body ? `: ${body}` : ''}`
    let details = {}
    try {
      const parsed = JSON.parse(body)
      details = parsed && typeof parsed === 'object' ? parsed : {}
      if (parsed && typeof parsed.error === 'string' && parsed.error) message = parsed.error
    } catch { /* keep the status fallback */ }
    throw new KanbanApiError(message, details)
  }
  if (res.status === 204) return null
  return res.json()
}

export const jsonBody = obj => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
})
