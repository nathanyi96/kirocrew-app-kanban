import { jsx as _jsx } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T } from '../theme.ts'

const { Activity, FileText, FolderOpen, GitCompare, ListChecks, Target } = lucide

const TABS = [
  { id: 'focus', label: 'Core task', Icon: Target },
  { id: 'steps', label: 'Steps', Icon: ListChecks },
  { id: 'files', label: 'Files and artifacts', Icon: FolderOpen },
  { id: 'changes', label: 'Changes and diffs', Icon: GitCompare },
  { id: 'notes', label: 'Markdown and notes', Icon: FileText },
  { id: 'activity', label: 'Activity', Icon: Activity },
]

export default function TaskResourceTabs({ activeTab, onChange, counts }) {
  return _jsx('div', { role: 'tablist', 'aria-label': 'Task resources', style: { display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 4, padding: '8px 12px', background: T.card, borderBottom: `1px solid ${T.border}` }, children: TABS.map(({ id, label, Icon }) => {
    const active = activeTab === id
    const count = counts[id] || 0
    return _jsx('button', { type: 'button', role: 'tab', 'aria-selected': active, 'aria-label': label, title: label, onClick: () => onChange(id), style: { position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 0, height: 34, border: `1px solid ${active ? 'rgba(124,58,237,0.38)' : 'transparent'}`, borderRadius: 8, background: active ? T.accentSoft : 'transparent', color: active ? T.accent : T.muted, cursor: 'pointer' }, children: [
      _jsx(Icon, { size: 15 }, 'icon'),
      count > 0 && _jsx('span', { style: { position: 'absolute', top: 2, right: 3, minWidth: 13, height: 13, boxSizing: 'border-box', padding: '0 3px', borderRadius: 999, background: active ? T.accent : T.hover, color: active ? '#fff' : T.text, fontSize: 8, lineHeight: '13px', textAlign: 'center', fontWeight: 700 }, children: count }, 'count'),
    ] }, id)
  }) })
}
