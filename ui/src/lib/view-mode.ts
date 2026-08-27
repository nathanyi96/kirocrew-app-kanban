// The board's four layouts.
//
// One rule decides every difference between them: WHO CARRIES THE STATE. Board
// has lanes, so the lane name is the state and a card only needs a colour stripe.
// The other three have no lanes, so the card itself must carry it — a tinted
// surface plus a state chip. That is why `TaskCard` takes a variant instead of
// each view re-implementing a card.
export const VIEW_MODES = [
  {
    id: 'board',
    label: 'Board',
    help: 'Five lanes, drag a card to change its state',
  },
  {
    id: 'flat',
    label: 'Flat',
    help: 'Every card in one grid, coloured by state',
  },
  {
    id: 'cluster',
    label: 'Clusters',
    help: 'Grouped by topic, proposed in the background and yours to correct',
  },
  {
    id: 'project',
    label: 'Projects',
    help: 'Grouped by the project each card was created in',
  },
]

export const VIEW_IDS = VIEW_MODES.map(view => view.id)
export const DEFAULT_VIEW = 'flat'

const VIEW_KEY = 'kanban:view-mode'

// localStorage THROWS rather than returning null when the browser blocks storage
// (private mode, a hardened profile), so both directions are guarded: a board
// that cannot remember the view must still render one.
export function readViewMode() {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY)
    return VIEW_IDS.includes(stored) ? stored : DEFAULT_VIEW
  } catch {
    return DEFAULT_VIEW
  }
}

export function writeViewMode(view) {
  if (!VIEW_IDS.includes(view)) return
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {
    /* the choice still applies for this session */
  }
}

// Lane order is the reading order for every laneless view: what is moving now
// first, what needs a decision last. Sorting by `updated_at` alone would bury a
// running card under whatever the agent touched most recently.
const FLAT_RANK = { running: 0, todo: 1, backlog: 2, done: 3, failed: 4 }

export function flatSort(tasks) {
  return [...tasks].sort(
    (a, b) => (FLAT_RANK[a.status] ?? 9) - (FLAT_RANK[b.status] ?? 9) || b.updated_at - a.updated_at,
  )
}
