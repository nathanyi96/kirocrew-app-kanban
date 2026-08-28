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
  return request(API + path, options)
}

/** The HOST's own API, not this app's.
 *
 * Answering a permission request and changing the Host's approval mode are Host
 * operations, and the Host requires them to come from the OWNER's dashboard
 * request — an app backend calling them is refused with 403 by design. The
 * board's UI runs inside the owner's dashboard page, so it is the one caller
 * that may legitimately make them: same-origin, same session, exactly the
 * request the chat UI's own buttons make.
 */
export async function hostApi(path, options) {
  return request(path, options)
}

async function request(url, options) {
  const res = await fetch(url, { credentials: 'same-origin', ...options })
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
