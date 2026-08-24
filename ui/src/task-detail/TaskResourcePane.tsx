import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'

const { ExternalLink, FileText, FolderOpen, GitCompare, Link2 } = lucide

const META = {
  artifacts: { title: 'Artifacts', empty: 'No files, links, or commits have been produced yet.', Icon: FolderOpen },
  files: { title: 'Files and artifacts', empty: 'No files or links have been produced yet.', Icon: FolderOpen },
  changes: { title: 'Changes and diffs', empty: 'No diff or patch links have been reported yet.', Icon: GitCompare },
  notes: { title: 'Markdown and notes', empty: 'No Markdown notes have been reported yet.', Icon: FileText },
}

export default function TaskResourcePane({ kind, resources }) {
  const meta = META[kind]
  return _jsxs('section', { 'aria-label': meta.title, children: [
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 7 }, children: [_jsx(meta.Icon, { size: 14, style: { color: T.accent } }), _jsx('h3', { style: { margin: 0, color: T.strong, fontSize: 14 }, children: meta.title }), _jsx('span', { style: { marginLeft: 'auto', color: T.muted, fontSize: 10 }, children: resources.length })] }),
    resources.length ? _jsx('div', { style: { display: 'flex', flexDirection: 'column', gap: 7, marginTop: 13 }, children: resources.map(resource => {
      const href = resource.url || resource.href
      return _jsxs('a', { href: href || '#', target: '_blank', rel: 'noreferrer', onClick: event => { if (!href) event.preventDefault() }, style: { display: 'grid', gridTemplateColumns: '26px minmax(0, 1fr) 14px', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: href ? T.accent : T.text, textDecoration: 'none' }, children: [
        _jsx('span', { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, background: T.accentSoft }, children: _jsx(Link2, { size: 12 }) }),
        _jsxs('span', { style: { minWidth: 0 }, children: [_jsx('span', { style: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, fontWeight: 600 }, children: resource.title }), resource.kind && _jsx('span', { style: { display: 'block', marginTop: 2, color: T.muted, fontSize: 9 }, children: resource.kind })] }),
        href && _jsx(ExternalLink, { size: 11 }),
      ] }, resource.id)
    }) }) : _jsx('div', { style: { marginTop: 14, padding: 18, borderRadius: 10, border: `1px dashed ${T.borderStrong}`, color: T.muted, fontSize: 12, lineHeight: 1.55, textAlign: 'center' }, children: meta.empty }),
  ] })
}
