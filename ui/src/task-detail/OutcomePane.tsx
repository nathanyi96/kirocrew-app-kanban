import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import lucide from 'lucide-react'
import { T, actionPill, toneBorder, toneSurface } from '../theme.ts'
import { taskArtifacts, taskResultPacket, taskRunBlocker, taskStateMeta, taskVerification } from '../lib/task-utils.ts'
import Markdown from '../components/Markdown.tsx'
import VerificationList from './VerificationList.tsx'

const { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, FileText, GitCommitHorizontal, Sparkles } = lucide
const heading = { margin: 0, color: T.muted, fontSize: 9, fontWeight: 750, letterSpacing: '0.09em', textTransform: 'uppercase' }

const packetMeta = status => {
  if (status === 'verified') return { label: 'Verified outcome', color: T.ok, tone: 'ok', Icon: CheckCircle2 }
  if (status === 'failed') return { label: 'Outcome blocked', color: T.danger, tone: 'danger', Icon: AlertTriangle }
  if (status === 'working') return { label: 'Outcome in progress', color: T.warn, tone: 'warn', Icon: Sparkles }
  if (status === 'pending') return { label: 'Outcome pending', color: T.muted, tone: 'muted', Icon: Sparkles }
  return { label: status === 'paused' ? 'Outcome paused' : 'Review outcome', color: T.info, tone: 'info', Icon: Sparkles }
}

export default function OutcomePane({ task, onAccept, onContinue, onRequestChanges }) {
  const packet = taskResultPacket(task)
  const state = taskStateMeta(task)
  const checks = taskVerification(task)
  const artifacts = taskArtifacts(task)
  const meta = packetMeta(packet.status)
  const featured = artifacts.filter(item => packet.artifact_ids?.includes(item.id)).slice(0, 4)
  const outputs = featured.length ? featured : artifacts.slice(0, 4)
  const working = task.status === 'running'
  const canAccept = !working && ['needs_review', 'verified'].includes(packet.status) && state.state !== 'achieved'
  const canContinue = !taskRunBlocker(task)

  return _jsxs('div', { 'aria-label': 'Task outcome', style: { display: 'flex', flexDirection: 'column', gap: 18 }, children: [
    _jsxs('section', { style: { padding: 14, borderRadius: 12, border: `1px solid ${toneBorder(meta.tone)}`, background: `linear-gradient(140deg, ${toneSurface(meta.tone)}, transparent 72%)` }, children: [
      _jsxs('div', { style: { display: 'flex', alignItems: 'center', gap: 7 }, children: [_jsx(meta.Icon, { size: 15, style: { color: meta.color } }), _jsx('span', { style: { color: meta.color, fontSize: 10, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '0.06em' }, children: meta.label }), packet.changed_files > 0 && _jsxs('span', { style: { marginLeft: 'auto', color: T.muted, fontSize: 9 }, children: [packet.changed_files, ' changed outputs'] })] }),
      packet.summary
        ? _jsx(Markdown, { text: packet.summary, style: { marginTop: 10, fontWeight: 500 } })
        : _jsx('p', { style: { margin: '10px 0 0', color: T.muted, fontSize: 13, lineHeight: 1.6, overflowWrap: 'anywhere' }, children: working ? 'The agent is working toward the first verified outcome.' : 'Run this task to produce a result and supporting evidence.' }),
    ] }),
    _jsxs('section', { children: [
      _jsxs('div', { style: { display: 'flex', alignItems: 'center', marginBottom: 9 }, children: [_jsx('h3', { style: heading, children: 'Verification' }), checks.length > 0 && _jsxs('span', { style: { marginLeft: 'auto', color: T.muted, fontSize: 9 }, children: [checks.filter(check => check.status === 'passed').length, '/', checks.filter(check => check.required !== false).length, ' passed'] })] }),
      _jsx(VerificationList, { checks }),
    ] }),
    _jsxs('section', { children: [
      _jsxs('div', { style: { display: 'flex', alignItems: 'center', marginBottom: 9 }, children: [_jsx('h3', { style: heading, children: 'Outputs' }), _jsxs('span', { style: { marginLeft: 'auto', color: T.muted, fontSize: 9 }, children: [artifacts.length, artifacts.length === 1 ? ' artifact' : ' artifacts'] })] }),
      outputs.length ? _jsx('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }, children: outputs.map(item => {
        const href = item.url || item.href
        const Icon = item.kind === 'commit' || item.kind === 'branch' ? GitCommitHorizontal : FileText
        return _jsxs('a', { href: href || '#', target: '_blank', rel: 'noreferrer', onClick: event => { if (!href) event.preventDefault() }, style: { minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, padding: 9, borderRadius: 9, border: `1px solid ${T.border}`, background: T.bg, color: href ? T.accent : T.text, textDecoration: 'none' }, children: [
          _jsx(Icon, { size: 13, style: { flexShrink: 0 } }),
          _jsx('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 650 }, children: item.title }),
          href && _jsx(ExternalLink, { size: 9, style: { flexShrink: 0 } }),
        ] }, item.id)
      }) }) : _jsx('div', { style: { padding: 12, borderRadius: 9, border: `1px dashed ${T.borderStrong}`, color: T.muted, fontSize: 11 }, children: 'Produced files, links, and commits will stay discoverable here.' }),
    ] }),
    packet.risks?.length > 0 && _jsxs('section', { children: [_jsx('h3', { style: heading, children: 'Risks / blockers' }), _jsx('div', { style: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }, children: packet.risks.map((risk, index) => _jsxs('div', { style: { display: 'flex', gap: 7, color: T.text, fontSize: 11, lineHeight: 1.45 }, children: [_jsx(AlertTriangle, { size: 12, style: { flexShrink: 0, marginTop: 2, color: T.warn } }), risk] }, `${index}-${risk}`)) })] }),
    packet.next_actions?.length > 0 && _jsxs('section', { children: [_jsx('h3', { style: heading, children: 'Next' }), _jsx('div', { style: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }, children: packet.next_actions.slice(0, 3).map((action, index) => _jsxs('div', { style: { display: 'flex', gap: 7, color: T.text, fontSize: 11, lineHeight: 1.45 }, children: [_jsx(ArrowRight, { size: 12, style: { flexShrink: 0, marginTop: 2, color: T.accent } }), action] }, `${index}-${action}`)) })] }),
    !working && task.executions?.length > 0 && _jsxs('section', { style: { display: 'flex', flexWrap: 'wrap', gap: 7, paddingTop: 2 }, children: [
      canAccept && _jsx('button', { type: 'button', onClick: () => onAccept(task), style: { ...actionPill, padding: '6px 10px', background: T.ok, color: '#07150b', fontSize: 10 }, children: 'Accept result' }),
      canContinue && _jsx('button', { type: 'button', onClick: () => onContinue(task), style: { ...actionPill, padding: '6px 10px', background: T.accentSoft, color: T.accent, fontSize: 10 }, children: task.goal ? 'Continue goal' : 'Run another attempt' }),
      canContinue && _jsx('button', { type: 'button', onClick: onRequestChanges, style: { ...actionPill, padding: '6px 10px', background: T.hover, color: T.text, fontSize: 10 }, children: 'Request changes' }),
    ] }),
  ] })
}
