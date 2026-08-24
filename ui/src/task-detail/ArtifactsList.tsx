import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'

const { ExternalLink, FileText, Link } = lucide

export default function ArtifactsList({ artifacts, label }) {
  return _jsxs('div', { children: [
    _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }, children: [_jsx(FileText, { size: 13, style: { color: T.accent } }), _jsx('span', { style: label, children: `Artifacts${artifacts.length ? ` (${artifacts.length})` : ''}` })] }),
    artifacts.length ? _jsx('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 }, children: artifacts.map((artifact, index) => { const href = artifact.url || artifact.href; return _jsxs('a', { href: href || '#', target: '_blank', rel: 'noreferrer', onClick: e => { if (!href) e.preventDefault() }, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: T.bg, color: T.accent, textDecoration: 'none', fontSize: 11, border: `1px solid ${T.border}` }, children: [_jsx(Link, { size: 12 }), _jsx('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: artifact.title || artifact.name || href || 'Open artifact' }), _jsx(ExternalLink, { size: 10, style: { marginLeft: 'auto' } })] }, artifact.id || index) }) }) : _jsx('div', { style: { padding: 10, borderRadius: 8, background: T.bg, color: T.muted, fontSize: 11 }, children: 'No artifacts or links have been produced yet.' }),
  ] })
}
