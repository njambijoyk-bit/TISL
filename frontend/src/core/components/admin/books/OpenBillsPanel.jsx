import { useEffect, useMemo, useState } from 'react';
import useAuthStore from '../../../../_shared/store/authStore';
import WriteOffModal from './WriteOffModal';
import booksAPI from '../../../../_shared/api/books';
import { card, colors } from '../../../../_shared/theme/tokens';
import { money } from './booksFmt';
import { creditSentence } from './creditText';

const th = { padding: '7px 10px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '7px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const r = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

/** Oldest due first, each bill up to what is left of the amount. */
const autoAllocate = (bills, amount) => {
  let left = Number(amount) || 0;
  const out = {};
  bills.forEach((b) => {
    if (left <= 0.004) return;
    const take = Math.min(left, b.outstanding);
    out[b.voucher_id] = Math.round(take * 100) / 100;
    left = Math.round((left - take) * 100) / 100;
  });
  return out;
};

/**
 * What the chosen party owes us / we owe them, bill by bill, for a Receipt or Payment. Shows the open bills with a box to
 * settle each; whatever is not settled is kept on account (an advance) for the party.
 */
export default function OpenBillsPanel({ ledgerId, base, amount, exceptId, alloc, setAlloc, touched, setTouched, advance = false }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [writing, setWriting] = useState(false);
  const role = useAuthStore((s) => s.user?.role);
  const receipt = base === 'receipt';

  useEffect(() => {
    if (!ledgerId) { setData(null); return undefined; }
    let live = true;
    booksAPI.openBills(ledgerId, exceptId).then((d) => { if (live) { setData(d); setError(null); } }).catch(() => { if (live) setError('Could not load the open bills'); });
    return () => { live = false; };
  }, [ledgerId, exceptId]);

  const bills = useMemo(() => (data?.bills ?? []).filter((b) => b.side === (receipt ? 'receivable' : 'payable')), [data, receipt]);

  // until they type in a box themselves, the amount is spread over the oldest bills
  // an advance is paid on purpose for something else, so no bill is settled by it
  useEffect(() => { if (advance) setAlloc({}); else if (!touched) setAlloc(autoAllocate(bills, amount)); }, [bills, amount, touched, advance]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ledgerId) return null;
  if (error) return <p role="alert" style={{ color: colors.dangerText, fontSize: '0.8rem' }}>{error}</p>;
  if (!data) return <p style={{ color: colors.textMuted, fontSize: '0.8rem' }}>Loading bills…</p>;

  const t = data.totals;
  const other = receipt ? t.we_owe : t.owed_to_us;
  const credits = (data.credits ?? []).filter((c) => c.kind === (receipt ? 'credit' : 'prepaid'));
  const allocated = Math.round(Object.values(alloc).reduce((x, v) => x + (Number(v) || 0), 0) * 100) / 100;
  const onAccount = Math.round(((Number(amount) || 0) - allocated) * 100) / 100;
  // a bill can never be settled for more than it is owed: a bigger number snaps back to the full bill
  const set = (id, v, max) => { setTouched(true); setAlloc((a) => ({ ...a, [id]: v === '' ? '' : Math.min(Math.max(0, Number(v)), max) })); };

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', background: colors.tint(0.03), display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: '0.8rem', alignItems: 'baseline' }}>
        <strong>{data.ledger.name}</strong>
        <span>{receipt ? 'Owes us' : 'We owe them'} <strong style={{ color: (receipt ? t.owed_to_us : t.we_owe) > 0 ? colors.warningText : colors.text }}>{money(receipt ? t.owed_to_us : t.we_owe)}</strong></span>
        {receipt && t.overdue > 0 && <span style={{ color: colors.dangerText }}>{money(t.overdue)} overdue</span>}
        {credits.length > 0 && <span>{receipt ? 'Overpaid / paid in advance' : 'Paid in advance'} <strong style={{ color: colors.successText }}>{money(credits.reduce((x, c) => x + c.amount, 0))}</strong></span>}
        {receipt && t.owed_to_us > 0.005 && ['finance', 'super_admin'].includes(role) && <button type="button" onClick={() => setWriting(true)} style={{ border: 'none', background: 'none', color: colors.dangerText, cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}>Write off the balance…</button>}
        {other > 0 && <span style={{ color: colors.textMuted }}>{receipt ? 'We also owe them' : 'They also owe us'} {money(other)}</span>}
      </div>

      {credits.length > 0 && (
        <div style={{ padding: '8px 16px', fontSize: '0.78rem', color: colors.textMuted, borderTop: `1px solid ${colors.tint(0.06)}` }}>
          {credits.map((c) => <div key={c.voucher_id}>{creditSentence(c, data.ledger.name, !receipt)}</div>)}
        </div>
      )}

      {bills.length === 0 ? (
        <p style={{ margin: 0, padding: '14px 16px', fontSize: '0.8rem', color: colors.textMuted }}>No open {receipt ? 'invoices' : 'bills'} for this party. Whatever you {receipt ? 'receive' : 'pay'} is kept on account.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead><tr><th style={th}>Bill</th><th style={th}>Date</th><th style={th}>Due</th><th style={{ ...th, ...r }}>Original</th><th style={{ ...th, ...r }}>Outstanding</th><th style={{ ...th, ...r }}>Settle now</th></tr></thead>
            <tbody>
              {bills.map((b) => {
                const v = alloc[b.voucher_id] ?? '';
                return (
                  <tr key={b.voucher_id}>
                    <td style={td}><strong>{b.voucher_number}</strong>{b.reference && <span style={{ color: colors.textFaint }}> · {b.reference}</span>}</td>
                    <td style={td}>{b.date}</td>
                    <td style={{ ...td, color: b.days_late > 0 ? colors.dangerText : colors.text }}>{b.due_date}{b.days_late > 0 && ` (${b.days_late}d late)`}</td>
                    <td style={{ ...td, ...r }}>{money(b.original)}</td>
                    <td style={{ ...td, ...r }}>{money(b.outstanding)}</td>
                    <td style={{ ...td, ...r, whiteSpace: 'nowrap' }}>
                      <input type="number" step="0.01" min="0" max={b.outstanding} aria-label={`Settle ${b.voucher_number}`} value={v} onChange={(e) => set(b.voucher_id, e.target.value, b.outstanding)} disabled={advance}
                        style={{ width: 150, padding: '6px 8px', borderRadius: 6, border: `1px solid ${colors.tint(0.15)}`, textAlign: 'right', opacity: advance ? 0.5 : 1 }} />
                      <button type="button" onClick={() => set(b.voucher_id, b.outstanding, b.outstanding)} disabled={advance} style={{ marginLeft: 6, border: 'none', background: 'none', color: colors.primary, cursor: 'pointer', fontSize: '0.7rem', textDecoration: 'underline' }}>all</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {writing && <WriteOffModal party={{ ledgerId, name: data.ledger.name, owed: t.owed_to_us }} onClose={() => setWriting(false)} onDone={() => { setWriting(false); booksAPI.openBills(ledgerId, exceptId).then(setData).catch(() => {}); }} />}
      <div style={{ padding: '10px 16px', borderTop: `1px solid ${colors.tint(0.08)}`, display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.8rem', alignItems: 'center' }}>
        <span>Settling <strong>{money(allocated)}</strong></span>
        <span style={{ color: onAccount < -0.004 ? colors.dangerText : colors.text }}>{onAccount < -0.004 ? `Bills add up to more than the amount by ${money(-onAccount)}` : <>On account <strong>{money(onAccount)}</strong>{onAccount > 0.004 && <span style={{ color: colors.textMuted }}> — kept as {advance ? 'an advance' : 'an overpayment'}, to use on {receipt ? 'their' : 'our'} next {receipt ? 'invoice' : 'bill'}</span>}</>}</span>
        {advance && <span style={{ color: colors.textMuted }}>Advance — the whole amount is kept on account; no bill is settled.</span>}
        {!advance && touched && bills.length > 0 && <button type="button" onClick={() => setTouched(false)} style={{ border: 'none', background: 'none', color: colors.primary, cursor: 'pointer', fontSize: '0.75rem', textDecoration: 'underline' }}>Spread the amount over the oldest bills</button>}
      </div>
    </div>
  );
}
