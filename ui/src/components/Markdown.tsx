import { jsx as _jsx } from 'react/jsx-runtime'
import { T } from '../theme.ts'

/**
 * Renders agent-authored text as markdown using the DASHBOARD's own renderer —
 * the same component the main chat transcript uses — so code fences, lists,
 * tables, and links look identical inside the board and inside chat.
 *
 * The renderer is looked up on the shared module map at call time instead of
 * being imported. A bare `import { MarkdownRenderer } from '@kirocrew/ui'`
 * would be resolved by the host's import map, and that map does not carry the
 * same specifiers on every gateway version (the running host maps
 * `@kirocrew/app-sdk/ui`, newer source calls it `@kirocrew/ui`). An unmapped
 * bare specifier is a module-resolution failure, which takes the WHOLE app
 * bundle down rather than degrading this one pane — so the lookup is a runtime
 * feature detection with a plain-text fallback.
 */
const hostMarkdownRenderer = () => {
  if (typeof window === 'undefined') return null
  const modules = window.__kirocrew_modules
  if (!modules) return null
  const ui = modules['@kirocrew/ui'] || modules['@kirocrew/app-sdk/ui']
  return (ui && ui.MarkdownRenderer) || null
}

// Only the type scale is set here. Block spacing, code-fence chrome, and link
// colours come from the host stylesheet the renderer's own markup targets.
const proseBase = { color: T.strong, fontSize: 13, lineHeight: 1.6, overflowWrap: 'anywhere', minWidth: 0 }

// The fallback keeps the newlines the model wrote, which is the one thing plain
// text can still get right.
const plainBase = { ...proseBase, margin: 0, whiteSpace: 'pre-wrap' }

export default function Markdown({ text, style }) {
  const content = typeof text === 'string' ? text : ''
  if (!content) return null
  const Renderer = hostMarkdownRenderer()
  if (!Renderer) return _jsx('p', { style: { ...plainBase, ...style }, children: content })
  // softBreaks: agent replies use a single newline to mean a line break far more
  // often than they mean a paragraph join, which is the same call the dashboard
  // makes for assistant messages.
  return _jsx('div', { style: { ...proseBase, ...style }, children: _jsx(Renderer, { content, softBreaks: true }) })
}
