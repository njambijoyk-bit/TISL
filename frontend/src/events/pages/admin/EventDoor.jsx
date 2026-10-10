import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Download, Search, UserCheck, Undo2 } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import Tabs from '../../../core/components/admin/ui/Tabs';
import ConfirmModal from '../../../core/components/admin/ui/ConfirmModal';
import { SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import CodeScanner from '../../../core/components/admin/codes/CodeScanner';
import eventsAPI from '../../../_shared/api/events';
import useAuthStore from '../../../_shared/store/authStore';
import { hasPermission } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, card, colors } from '../../../_shared/theme/tokens';
import DoorResult from '../../components/admin/DoorResult';
import BoxOffice from '../../components/admin/BoxOffice';
import { whenText } from '../../lib/eventFormat';

const ALL_TABS = [{ id: 'scan', label: 'Scan' }, { id: 'guests', label: 'Guest list' }, { id: 'sell', label: 'Sell', perm: 'sell' }, { id: 'log', label: 'Scan log' }];
const RESULT_LABEL = { ok: 'In', manual: 'In (by hand)', already: 'Already used', wrong_event: 'Wrong event', wrong_session: 'Wrong date', not_valid: 'Not valid', not_found: 'Not ours', undone: 'Undone' };
const hm = (s) => (s ? String(s).slice(11, 16) : '');

/** The door of an event: scan tickets, see how many have come, find a guest by name or phone and let them in by hand, and download the list. Made for a phone. */
export default function EventDoor() {
  const { id } = useParams();
  const user = useAuthStore((s) => s.user);
  const can = { checkin: hasPermission(user, 'events.checkin'), export: hasPermission(user, 'events.view'), refund: hasPermission(user, 'events.refund'), sell: hasPermission(user, 'events.sell') };
  const TABS = ALL_TABS.filter((t) => !t.perm || can[t.perm]);
  const [tab, setTab] = useState('scan');
  const [door, setDoor] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [last, setLast] = useState(null);
  const [guests, setGuests] = useState({ data: [], total: 0, page: 1, last_page: 1 });
  const [q, setQ] = useState('');
  const [arrived, setArrived] = useState('');
  const [page, setPage] = useState(1);
  const [refunding, setRefunding] = useState(null);
  const queue = useRef(Promise.resolve());

  const load = useCallback(() => eventsAPI.door(id, sessionId).then((d) => { setDoor(d); setSessionId((cur) => cur ?? d.current_session_id); }).catch((e) => toast.error(errMsg(e, 'Could not load the door'))), [id, sessionId]);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);   // other devices at the same door keep the numbers fresh

  const loadGuests = useCallback(() => eventsAPI.guests(id, { q: q || undefined, arrived: arrived || undefined, session_id: sessionId || undefined, page }).then(setGuests).catch((e) => toast.error(errMsg(e, 'Could not load the guest list'))), [id, q, arrived, sessionId, page]);
  useEffect(() => { if (tab !== 'guests') return undefined; const t = setTimeout(loadGuests, q ? 300 : 0); return () => clearTimeout(t); }, [tab, loadGuests, q]);

  // scans are answered one after another, so two quick scans never overtake each other
  const scan = useCallback((code) => {
    queue.current = queue.current.then(async () => {
      try { const r = await eventsAPI.checkin(id, code, sessionId); setLast(r); load(); } catch (e) { toast.error(errMsg(e, 'Could not check that ticket')); }
    });
  }, [id, sessionId, load]);

  const undo = async (r) => {
    try { await eventsAPI.undoCheckin(id, r.checkin_id); toast.success('Undone'); setLast(null); load(); if (tab === 'guests') loadGuests(); } catch (e) { toast.error(errMsg(e, 'Could not undo')); }
  };
  const letIn = async (g) => {
    try { const r = await eventsAPI.checkinManual(id, g.id, sessionId); setLast(r); if (r.ok) toast.success(`${g.holder_name || 'Guest'} is in`); else toast.error(r.message); load(); loadGuests(); } catch (e) { toast.error(errMsg(e, 'Could not check in')); }
  };
  const refund = async (note) => {
    try { const r = await eventsAPI.refundTicket(id, refunding.id, { note: note || undefined }); toast.success(r.message); setRefunding(null); loadGuests(); load(); } catch (e) { toast.error(errMsg(e, 'Could not refund'), { duration: 9000 }); setRefunding(null); }
  };
  const download = async () => { try { await eventsAPI.exportGuests(id); } catch (e) { toast.error(errMsg(e, 'Could not download')); } };

  const pct = door && door.expected ? Math.min(100, Math.round((door.arrived / door.expected) * 100)) : 0;

  return (
    <AdminLayout>
      <div style={{ padding: '20px 16px 48px', maxWidth: 760, margin: '0 auto' }}>
        <Link to="/admin/events" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: colors.textMuted, textDecoration: 'none', marginBottom: 10 }}><ArrowLeft size={14} /> Events</Link>
        <h1 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 800, color: colors.primary }}>{door?.event.title ?? 'Door'}</h1>
        {door?.event.status === 'cancelled' && <p role="alert" style={{ color: colors.dangerText, fontWeight: 700 }}>This event is cancelled.</p>}

        {door && (
          <div style={{ ...card, padding: 14, margin: '10px 0 16px', display: 'grid', gap: 10 }}>
            {door.sessions.length > 1 && (
              <SelectInput aria-label="Date being checked in" value={sessionId ?? ''} onChange={(e) => { setSessionId(Number(e.target.value)); setPage(1); }}>
                {door.sessions.map((s) => <option key={s.id} value={s.id}>{s.label ? `${s.label} · ` : ''}{whenText(s.starts_at)}</option>)}
              </SelectInput>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '2rem', fontWeight: 900 }}>{door.arrived}<span style={{ fontSize: '1rem', fontWeight: 600, color: colors.textMuted }}> of {door.expected} in</span></span>
              <span style={{ fontWeight: 700, color: colors.textMuted }}>{Math.max(0, door.expected - door.arrived)} to come</span>
            </div>
            <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Arrived" style={{ height: 8, borderRadius: 999, background: colors.tint(0.12), overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: '#047857' }} /></div>
          </div>
        )}

        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        {tab === 'scan' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <DoorResult r={last} onUndo={undo} canUndo={can.checkin} />
            {can.checkin ? <CodeScanner onScan={scan} placeholder="Scan a ticket, or type its code, then Enter" /> : <p style={{ color: colors.textMuted }}>You can see the door but not check people in.</p>}
          </div>
        )}

        {tab === 'sell' && can.sell && <BoxOffice eventId={id} onSold={load} />}

        {tab === 'guests' && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 220px' }}>
                <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: 10, color: colors.textFaint }} />
                <TextInput value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, phone, email or reference" aria-label="Search guests" style={{ paddingLeft: 30 }} />
              </div>
              <SelectInput aria-label="Arrived" value={arrived} onChange={(e) => { setArrived(e.target.value); setPage(1); }} style={{ width: 'auto' }}>
                <option value="">Everyone</option><option value="no">Not yet in</option><option value="yes">Already in</option>
              </SelectInput>
              {can.export && <button type="button" style={btnGhost} onClick={download}><Download size={14} /> Spreadsheet</button>}
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>{guests.total} ticket{guests.total === 1 ? '' : 's'}</p>
            {guests.data.map((g) => (
              <div key={g.id} style={{ ...card, padding: 12, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', opacity: g.state === 'cancelled' ? 0.6 : 1 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800 }}>{g.holder_name || g.buyer_name || 'No name'}{g.state === 'cancelled' && <span style={{ color: colors.danger, fontWeight: 700 }}> · cancelled</span>}</div>
                  <div style={{ fontSize: '0.78rem', color: colors.textMuted }}>{g.type} · <code>{g.reference}</code>{g.buyer_phone ? <> · <a href={`tel:${g.buyer_phone}`} style={{ color: 'inherit' }}>{g.buyer_phone}</a></> : ''}</div>
                  {g.arrived && <div style={{ fontSize: '0.78rem', color: '#047857', fontWeight: 700 }}>In at {hm(g.arrived.at)}{g.arrived.by ? ` · ${g.arrived.by}` : ''}</div>}
                </div>
                {can.refund && g.state === 'valid' && g.price > 0 && <button type="button" style={{ ...btnGhost, padding: '6px 10px', fontSize: '0.74rem', color: colors.danger }} onClick={() => setRefunding(g)} aria-label={`Refund ${g.holder_name || g.reference}`}><Undo2 size={13} /> Refund</button>}
                {can.checkin && g.state === 'valid' && (g.arrived
                  ? <button type="button" style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.76rem' }} onClick={() => undo({ checkin_id: g.arrived.checkin_id })}>Undo</button>
                  : <button type="button" style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.8rem', fontWeight: 800 }} onClick={() => letIn(g)}><UserCheck size={14} /> Let in</button>)}
              </div>
            ))}
            {guests.last_page > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center', fontSize: '0.8rem', color: colors.textMuted }}>
                <button type="button" style={btnGhost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                Page {page} of {guests.last_page}
                <button type="button" style={btnGhost} disabled={page >= guests.last_page} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            )}
          </div>
        )}

        {tab === 'log' && (
          <div style={{ display: 'grid', gap: 6 }}>
            {door?.recent.length === 0 && <p style={{ color: colors.textMuted }}>Nothing scanned yet.</p>}
            {door?.recent.map((r) => (
              <div key={r.id} style={{ ...card, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.82rem', opacity: r.result === 'undone' ? 0.55 : 1 }}>
                <span><strong>{hm(r.at)}</strong> · {r.holder_name || (r.result === 'not_found' ? 'Unknown code' : '—')}{r.reference ? <> · <code>{r.reference}</code></> : ''}</span>
                <span style={{ fontWeight: 800, color: r.result === 'ok' || r.result === 'manual' ? '#047857' : r.result === 'undone' ? colors.textMuted : r.result === 'already' ? '#b45309' : colors.danger, whiteSpace: 'nowrap' }}>{RESULT_LABEL[r.result] ?? r.result}{r.by ? ` · ${r.by}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {refunding && <ConfirmModal title="Refund this ticket?" message={`${refunding.holder_name || refunding.buyer_name} · ${refunding.reference}: the ticket is cancelled, its QR stops working, and its price and tax go back to the buyer from the account the payment came in to.`} confirmLabel="Refund it" danger withReason reasonLabel="A note for the buyer (optional)" onConfirm={refund} onClose={() => setRefunding(null)} />}
    </AdminLayout>
  );
}
