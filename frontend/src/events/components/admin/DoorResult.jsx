import { AlertTriangle, CheckCircle2, XCircle, Undo2 } from 'lucide-react';
import { whenText } from '../../lib/eventFormat';

const LOOK = {
  ok: { bg: '#047857', icon: CheckCircle2, title: 'Let them in' },
  manual: { bg: '#047857', icon: CheckCircle2, title: 'Let them in' },
  already: { bg: '#b45309', icon: AlertTriangle, title: 'Already used' },
  wrong_event: { bg: '#b91c1c', icon: XCircle, title: 'Wrong event' },
  wrong_session: { bg: '#b91c1c', icon: XCircle, title: 'Wrong date' },
  not_valid: { bg: '#b91c1c', icon: XCircle, title: 'Not valid' },
  not_found: { bg: '#b91c1c', icon: XCircle, title: 'Not one of our tickets' },
};

/** The answer to the last scan, big enough to read at arm's length: green to let them in, amber for a ticket already used, red to stop them. */
export default function DoorResult({ r, onUndo, canUndo }) {
  if (!r) {
    return <div role="status" style={{ padding: 28, borderRadius: 16, textAlign: 'center', background: 'var(--surface-card, #fff)', border: '1.5px dashed var(--line)', color: 'var(--text-secondary)', fontWeight: 700 }}>Ready. Scan a ticket.</div>;
  }
  const look = LOOK[r.result] ?? LOOK.not_found;
  const Icon = look.icon;

  return (
    <div role="status" aria-live="assertive" style={{ padding: 22, borderRadius: 16, background: look.bg, color: '#fff', display: 'grid', gap: 6, justifyItems: 'center', textAlign: 'center' }}>
      <Icon size={44} aria-hidden="true" />
      <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{look.title}</div>
      {r.ticket && <div style={{ fontSize: '1.15rem', fontWeight: 800 }}>{r.ticket.holder_name || 'No name'}</div>}
      {r.ticket && <div style={{ opacity: 0.9 }}>{r.ticket.type}{r.session?.label ? ` · ${r.session.label}` : r.session ? ` · ${whenText(r.session.starts_at)}` : ''} · <code>{r.ticket.reference}</code></div>}
      <div style={{ opacity: 0.95 }}>{r.message}</div>
      {r.ok && canUndo && r.checkin_id && <button type="button" onClick={() => onUndo(r)} style={{ marginTop: 6, display: 'inline-flex', gap: 6, alignItems: 'center', padding: '7px 14px', borderRadius: 999, border: '1.5px solid rgba(255,255,255,0.7)', background: 'transparent', color: '#fff', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}><Undo2 size={14} /> Checked in by mistake? Undo</button>}
    </div>
  );
}
