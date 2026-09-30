import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { money } from './booksFmt';

/**
 * Credit on account against one invoice: what the party has paid in advance (or been credited) and not yet used,
 * with a button to settle this invoice from it, and any credit already applied with a way to give it back.
 */
export default function CreditPanel({ v, canWrite, onDone }) {
  const base = v.type.base_type;
  const sales = base === 'sales';
  const open = Number(v.outstanding) || 0;
  const applied = v.credit_applied ?? [];
  const [credits, setCredits] = useState([]);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!v.party_ledger_id || v.status !== 'posted') return;
    booksAPI.openBills(v.party_ledger_id).then((d) => setCredits((d.credits ?? []).filter((c) => c.kind === (sales ? 'credit' : 'prepaid')))).catch(() => {});
  }, [v.party_ledger_id, v.status, v.id, open, sales]);

  const held = credits.reduce((t, c) => t + c.amount, 0);
  if (!['sales', 'purchase'].includes(base) || v.status !== 'posted' || (held <= 0.004 && !applied.length)) return null;
  const most = Math.min(open, held);

  const apply = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const res = await booksAPI.applyCredit(v.id, amount === '' ? {} : { amount: Number(amount) }); toast.success(res.message); setAmount(''); onDone(); }
    catch (x) { toast.error(errMsg(x, 'Could not apply the credit'), { duration: 7000 }); }
    finally { setBusy(false); }
  };
  const release = async (creditId) => {
    if (!window.confirm('Give this credit back? The invoice will be outstanding again.')) return;
    try { const res = await booksAPI.releaseCredit(v.id, creditId); toast.success(res.message); onDone(); }
    catch (x) { toast.error(errMsg(x, 'Could not give the credit back'), { duration: 7000 }); }
  };

  return (
    <div style={{ ...card, padding: 14, marginBottom: 16, fontSize: '0.82rem' }}>
      <p style={{ margin: '0 0 8px', fontWeight: 700 }}>{sales ? 'Credit on account' : 'Paid in advance'}: <span style={{ color: colors.successText }}>{money(held)}</span></p>
      {credits.length > 0 && <p style={{ margin: '0 0 8px', color: colors.textMuted }}>{credits.map((c) => `${c.voucher_number} ${money(c.amount)}`).join(' · ')}</p>}
      {canWrite && open > 0.005 && held > 0.004 && (
        <form onSubmit={apply} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="number" step="0.01" min="0.01" max={most} placeholder={`All ${money(most)}`} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount of credit to apply"
            style={{ width: 140, padding: '6px 8px', borderRadius: 6, border: `1px solid ${colors.tint(0.15)}`, textAlign: 'right' }} />
          <button type="submit" disabled={busy} style={{ ...btnPrimary, padding: '7px 14px', opacity: busy ? 0.6 : 1 }}>{busy ? 'Applying…' : `Apply to ${v.voucher_number}`}</button>
          <span style={{ color: colors.textMuted }}>No money moves; the invoice is settled from the credit.</span>
        </form>
      )}
      {applied.length > 0 && (
        <div style={{ marginTop: 10, borderTop: `1px solid ${colors.tint(0.08)}`, paddingTop: 8 }}>
          {applied.map((a) => (
            <div key={a.voucher_id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span>Credit applied from <strong>{a.voucher_number}</strong>: {money(a.amount)}</span>
              {canWrite && <button type="button" onClick={() => release(a.voucher_id)} style={{ ...btnGhost, padding: '2px 10px', fontSize: '0.72rem' }}>Give back</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
