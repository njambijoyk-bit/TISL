import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { money } from './booksFmt';
import { creditSentence } from './creditText';

/**
 * On a posted invoice: money the party has paid that is not yet matched to a bill (an overpayment, or an advance paid on
 * purpose), as plain sentences with a tick each, a button to use the ticked ones on this invoice, a Refund button, and any
 * already used here with a way to give it back.
 */
export default function CreditPanel({ v, canWrite, onDone }) {
  const nav = useNavigate();
  const base = v.type.base_type;
  const sales = base === 'sales';
  const open = Number(v.outstanding) || 0;
  const applied = v.credit_applied ?? [];
  const [credits, setCredits] = useState([]);
  const [ticked, setTicked] = useState(null);   // null = every one, until they untick
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!v.party_ledger_id || v.status !== 'posted') return;
    booksAPI.openBills(v.party_ledger_id).then((d) => setCredits((d.credits ?? []).filter((c) => c.kind === (sales ? 'credit' : 'prepaid')))).catch(() => {});
  }, [v.party_ledger_id, v.status, v.id, open, sales]);

  if (!['sales', 'purchase'].includes(base) || v.status !== 'posted' || (credits.length === 0 && !applied.length)) return null;
  const who = v.party_ledger?.name;
  const on = (id) => (ticked ?? credits.map((c) => c.voucher_id)).includes(id);
  const toggle = (id) => setTicked((cur) => { const all = cur ?? credits.map((c) => c.voucher_id); return all.includes(id) ? all.filter((x) => x !== id) : [...all, id]; });
  const chosen = credits.filter((c) => on(c.voucher_id));
  const usable = Math.min(open, chosen.reduce((t, c) => t + c.amount, 0));

  const apply = async () => {
    setBusy(true);
    try { const res = await booksAPI.applyCredit(v.id, { credit_voucher_ids: chosen.map((c) => c.voucher_id) }); toast.success(res.message); onDone(); }
    catch (x) { toast.error(errMsg(x, 'Could not use the overpayment'), { duration: 7000 }); }
    finally { setBusy(false); }
  };
  const release = async (creditId) => {
    if (!window.confirm('Give this back? The invoice will be outstanding again.')) return;
    try { const res = await booksAPI.releaseCredit(v.id, creditId); toast.success(res.message); onDone(); }
    catch (x) { toast.error(errMsg(x, 'Could not give it back'), { duration: 7000 }); }
  };
  const refund = async (c) => {
    try {
      const types = await booksAPI.types();
      const pay = types.find((t) => t.base_type === 'payment' && t.is_active);
      if (!pay) { toast.error('There is no active Payment voucher type.'); return; }
      nav(`/admin/books/vouchers/new?type=${pay.id}&refund=${c.voucher_id}`);
    } catch (x) { toast.error(errMsg(x, 'Could not open the refund')); }
  };

  return (
    <div style={{ ...card, padding: 14, marginBottom: 16, fontSize: '0.82rem' }}>
      {credits.length > 0 && (
        <>
          <p style={{ margin: '0 0 8px', fontWeight: 700 }}>{sales ? 'Money held for the customer' : 'Money paid to the supplier in advance'}</p>
          <div style={{ display: 'grid', gap: 6 }}>
            {credits.map((c) => (
              <div key={c.voucher_id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {canWrite && open > 0.005 && <input type="checkbox" checked={on(c.voucher_id)} onChange={() => toggle(c.voucher_id)} aria-label={`Use ${c.voucher_number}`} />}
                <span style={{ flex: 1, minWidth: 220 }}>{creditSentence(c, who, !sales)}{canWrite && open > 0.005 ? ' — use it on this invoice?' : ''}</span>
                {canWrite && sales && <button type="button" onClick={() => refund(c)} style={{ ...btnGhost, padding: '2px 10px', fontSize: '0.72rem' }}>Refund</button>}
              </div>
            ))}
          </div>
          {canWrite && open > 0.005 && (
            <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" disabled={busy || usable <= 0.004} onClick={apply} style={{ ...btnPrimary, padding: '7px 14px', opacity: busy || usable <= 0.004 ? 0.6 : 1 }}>{busy ? 'Applying…' : `Use ${money(usable)} on ${v.voucher_number}`}</button>
              <span style={{ color: colors.textMuted }}>No money moves; the invoice is settled from what was paid.</span>
            </div>
          )}
        </>
      )}
      {applied.length > 0 && (
        <div style={{ marginTop: credits.length ? 10 : 0, borderTop: credits.length ? `1px solid ${colors.tint(0.08)}` : 'none', paddingTop: credits.length ? 8 : 0 }}>
          {applied.map((a) => (
            <div key={a.voucher_id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span>Settled from the extra paid on <strong>{a.voucher_number}</strong>: {money(a.amount)}</span>
              {canWrite && <button type="button" onClick={() => release(a.voucher_id)} style={{ ...btnGhost, padding: '2px 10px', fontSize: '0.72rem' }}>Give back</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
