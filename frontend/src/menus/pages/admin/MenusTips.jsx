import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewTips } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';

const money = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const tab = (on) => ({ padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.85rem', border: `1.5px solid ${on ? '#0f172a' : 'var(--line, #cbd5e1)'}`, background: on ? '#0f172a' : 'transparent', color: on ? '#fff' : 'inherit' });
const th = { textAlign: 'left', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.textMuted, padding: '6px 8px' };
const td = { padding: '7px 8px', borderTop: '1px solid var(--line, #e5e7eb)', fontSize: '0.88rem' };

/** Hand one tip over: who gets it, which cash or bank account it is paid out of, and a narration if there is something to say. */
function IssueModal({ tip, data, onClose, onDone }) {
  const mine = data.can.issue_self && data.me ? String(data.me.id) : null;
  const others = data.can.issue;
  const [to, setTo] = useState(!others && mine ? mine : '');   // a user id, or 'other' for someone who is not on the list
  const [name, setName] = useState('');
  const [from, setFrom] = useState(String(data.sources[0]?.ledger_id ?? ''));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const own = mine !== null && to === mine;   // one's own tip always says why
  const ready = ((to && to !== 'other') || (to === 'other' && name.trim() !== '')) && (!own || note.trim() !== '');

  const go = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.issueTip(tip.id, { ...(to === 'other' ? { to_name: name.trim() } : { to_user_id: Number(to) }), from_ledger_id: Number(from), ...(note.trim() ? { narration: note.trim() } : {}) });
      toast.success(r.message);
      onDone(r);
    } catch (e) { toast.error(errMsg(e, 'Could not hand the tip over'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title="Hand the tip over" subtitle={`${money(tip.amount)}${tip.customer ? ` from ${tip.customer}` : ''}${tip.order_number ? `, ${tip.order_number}` : ''}`} onClose={onClose} width={480}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={onClose}>Back</button><button type="button" style={{ ...btnPrimary, opacity: busy || !ready || !from ? 0.5 : 1 }} disabled={busy || !ready || !from} onClick={go}>{busy ? 'Handing over…' : `Hand over ${money(tip.amount)}`}</button></div>}>
      <div style={{ display: 'grid', gap: 12 }} data-testid="issue-tip">
        <Field label="Handed to" htmlFor="tip-to">
          <SelectInput id="tip-to" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose a person</option>
            {others && data.recipients.filter((r) => String(r.id) !== mine).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            {mine && <option value={mine}>Myself ({data.me.name})</option>}
            {others && <option value="other">Someone else (type the name)</option>}
          </SelectInput>
        </Field>
        {to === 'other' && <Field label="Name" htmlFor="tip-name"><TextInput id="tip-name" maxLength={160} value={name} onChange={(e) => setName(e.target.value)} /></Field>}
        <Field label="Paid out of" htmlFor="tip-from" hint="The money leaves this cash or bank account and the tips payable account is cleared by the same amount.">
          <SelectInput id="tip-from" value={from} onChange={(e) => setFrom(e.target.value)}>
            {data.sources.length === 0 && <option value="">No cash or bank account is set on a way of paying</option>}
            {data.sources.map((s) => <option key={s.ledger_id} value={s.ledger_id}>{s.name}</option>)}
          </SelectInput>
        </Field>
        <Field label={own ? 'Narration (required: say why it is yours)' : 'Narration (optional)'} htmlFor="tip-note"><TextInput id="tip-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** A tip handed over by mistake: the payout is cancelled and the tip waits again. The reason is always asked and kept. */
function ReverseModal({ tip, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.reverseTip(tip.id, { reason: reason.trim() });
      toast.success(r.message);
      onDone(r);
    } catch (e) { toast.error(errMsg(e, 'Could not take the tip back'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title="Take the tip back" subtitle={`${money(tip.amount)} handed to ${tip.issued_to ?? 'someone'}`} onClose={onClose} width={460}
      footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={onClose}>Back</button><button type="button" style={{ ...btnPrimary, opacity: busy || !reason.trim() ? 0.5 : 1 }} disabled={busy || !reason.trim()} onClick={go}>{busy ? 'Taking back…' : 'Take it back'}</button></div>}>
      <div style={{ display: 'grid', gap: 12 }} data-testid="reverse-tip">
        <p style={{ margin: 0, fontSize: '0.85rem' }}>The payout is cancelled in the books and the tip goes back to Pending, where it can be handed over again. This is logged with your name.</p>
        <Field label="Why was it handed over by mistake?" htmlFor="tip-reason"><TextInput id="tip-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function Rows({ rows, data, onIssue, onReverse, pending }) {
  if (rows.length === 0) return <p style={{ margin: 0, padding: 14, color: colors.textMuted }}>{pending ? 'No tips are waiting.' : 'No tips today.'}</p>;
  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th style={th}>Taken</th><th style={th}>From</th><th style={th}>Order</th><th style={th}>Rung up by</th><th style={th}>Served by</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>{pending ? '' : 'Handed over'}</th></tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} data-tip={t.id} data-status={t.status}>
              <td style={td}>{when(t.taken_at)}</td>
              <td style={td}>{t.customer || (t.short_no ? `No. ${t.short_no}` : '')}</td>
              <td style={td}>{t.order_number}</td>
              <td style={td}>{t.received_by}</td>
              <td style={td}>{t.served_by}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{money(t.amount)}</td>
              <td style={td}>
                {t.status === 'pending' && (data.can.issue || data.can.issue_self) && <button type="button" disabled={!data.window.open} title={data.window.open ? '' : 'The window for handing tips out is closed'} onClick={() => onIssue(t)} style={{ ...btnPrimary, padding: '5px 12px', fontSize: '0.8rem', opacity: data.window.open ? 1 : 0.5 }}>Issue</button>}
                {t.status === 'issued' && <span>{t.issued_to}{t.issued_by ? `, by ${t.issued_by}` : ''}{t.issued_at ? `, ${when(t.issued_at)}` : ''}{t.narration ? `. ${t.narration}` : ''}</span>}
                {t.status === 'issued' && data.can.reverse && <button type="button" onClick={() => onReverse(t)} style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.78rem', marginLeft: 8 }}>Take back</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MenusTips() {
  const user = useAuthStore((s) => s.user);
  const [data, setData] = useState(null);
  const [view, setView] = useState('pending');
  const [issuing, setIssuing] = useState(null);
  const [reversing, setReversing] = useState(null);
  const load = useCallback(() => menusAPI.tips().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the tips'))), []);
  useEffect(() => { load(); }, [load]);

  if (!canViewTips(user)) return <AdminLayout><NoAccess what="the tips" /></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto', display: 'grid', gap: 14 }} data-testid="menus-tips">
        <HubHeader title="Tips" description="Tips wait here until a person hands them over. They never expire." />
        {data && !data.ready && <p role="status" style={{ color: colors.textMuted }}>Run database script 212_menus_tips.sql to switch the tips box on.</p>}
        {data?.ready && (
          <>
            <p role="status" data-testid="tips-window" style={{ margin: 0, fontSize: '0.85rem', color: data.window.open ? '#047857' : '#b45309' }}>{data.window.words}. {data.window.open ? 'It is open now.' : 'It is closed now: tips stay in the box.'}</p>
            <dl data-testid="tips-totals" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              {[['Waiting to be handed over', data.totals.pending], ['Taken today', data.totals.taken_today], ['Handed over today', data.totals.issued_today]].map(([k, v]) => (
                <div key={k} style={{ ...card, padding: 12 }}><dt style={{ fontSize: '0.7rem', color: colors.textFaint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800 }}>{money(v)}</dd></div>
              ))}
            </dl>
            <div role="tablist" aria-label="Tips" style={{ display: 'flex', gap: 8 }}>
              <button type="button" role="tab" aria-selected={view === 'pending'} style={tab(view === 'pending')} onClick={() => setView('pending')}>Pending · {data.pending.length}</button>
              <button type="button" role="tab" aria-selected={view === 'today'} style={tab(view === 'today')} onClick={() => setView('today')}>Today · {data.today.length}</button>
            </div>
            <Rows rows={view === 'pending' ? data.pending : data.today} data={data} pending={view === 'pending'} onIssue={setIssuing} onReverse={setReversing} />
          </>
        )}
        {reversing && data && <ReverseModal tip={reversing} onClose={() => setReversing(null)} onDone={(r) => { setReversing(null); setData(r); }} />}
        {issuing && data && <IssueModal tip={issuing} data={data} onClose={() => setIssuing(null)} onDone={(r) => { setIssuing(null); setData(r); }} />}
      </div>
    </AdminLayout>
  );
}
