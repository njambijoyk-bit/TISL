import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import booksAPI from '../../../_shared/api/books';
import useCurrencyStore from '../../../_shared/store/currencyStore';
import { useBaseCode } from '../../../_shared/lib/baseCurrency';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, btnGhost, card, colors, input } from '../../../_shared/theme/tokens';
import { money } from '../../components/admin/books/booksFmt';

const small = { ...input, padding: '6px 8px', fontSize: '0.8rem' };
const lab = { display: 'block', fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, marginBottom: 3 };

/**
 * A customer's credit: terms and limit live on the customer, the balance is their ledger in the books.
 * (This replaces the old credit accounts, schedules and credit invoices.)
 */
export default function CreditTab({ customer, notify }) {
  useBaseCode();
  const currencies = useCurrencyStore((s) => s.currencies);
  const [acc, setAcc] = useState(null);
  const [error, setError] = useState(null);
  const [terms, setTerms] = useState(null);
  const [ledgers, setLedgers] = useState([]);
  const [adj, setAdj] = useState({ direction: 'debit', amount: '', counter_ledger_id: '', note: '' });
  const [interest, setInterest] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const a = await booksAPI.customerAccount(customer.id);
      setAcc(a); setError(null);
      setTerms({ has_credit_account: !!a.terms.has_credit_account, credit_limit: a.terms.credit_limit ?? '', credit_currency_id: a.terms.credit_currency_id ?? '', credit_terms_days: a.terms.credit_terms_days ?? 30, credit_interest_rate: a.terms.credit_interest_rate ?? '' });
    } catch (e) { setError(errMsg(e, 'Could not load the account (credit needs finance access)')); }
  }, [customer.id]);
  useEffect(() => { load(); booksAPI.ledgers({ all: 1, active_only: 1 }).then((r) => setLedgers(Array.isArray(r) ? r : r.data ?? [])).catch(() => {}); }, [load]);

  const say = (m) => (notify ? notify(m) : toast.success(m));

  const saveTerms = async () => {
    setBusy(true);
    try {
      await booksAPI.saveCreditTerms(customer.id, { ...terms, credit_limit: terms.credit_limit === '' ? 0 : Number(terms.credit_limit), credit_currency_id: terms.credit_currency_id || null, credit_interest_rate: terms.credit_interest_rate === '' ? null : Number(terms.credit_interest_rate) });
      say('Credit terms saved'); load();
    } catch (e) { toast.error(errMsg(e, 'Could not save the terms'), { duration: 7000 }); } finally { setBusy(false); }
  };
  const doAdjust = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await booksAPI.adjustAccount(customer.id, { ...adj, amount: Number(adj.amount) }); say(r.message); setAdj({ direction: 'debit', amount: '', counter_ledger_id: '', note: '' }); load(); }
    catch (x) { toast.error(errMsg(x, 'Could not post the adjustment'), { duration: 7000 }); } finally { setBusy(false); }
  };
  const doInterest = async () => {
    setBusy(true);
    try { const r = await booksAPI.chargeInterest(customer.id, { amount: Number(interest) }); say(r.message); setInterest(''); load(); }
    catch (x) { toast.error(errMsg(x, 'Could not charge interest'), { duration: 7000 }); } finally { setBusy(false); }
  };

  if (error) return <p role="alert" style={{ color: colors.dangerText }}>{error}</p>;
  if (!acc || !terms) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  const cur = acc.base_currency.code;
  const set = (k) => (e) => setTerms((t) => ({ ...t, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ ...card, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        <div><span style={lab}>OWES ({cur})</span><strong style={{ fontSize: '1.2rem', color: acc.owed > 0 ? colors.warningText : colors.successText }}>{money(acc.owed)}</strong></div>
        <div><span style={lab}>LIMIT ({cur})</span><strong style={{ fontSize: '1.2rem' }}>{acc.limit_base ? money(acc.limit_base) : '—'}</strong></div>
        <div><span style={lab}>AVAILABLE ({cur})</span><strong style={{ fontSize: '1.2rem' }}>{acc.limit_base ? money(acc.available) : '—'}</strong></div>
        <div><span style={lab}>OVERDUE ({cur})</span><strong style={{ fontSize: '1.2rem', color: colors.dangerText }}>{money((acc.ageing.d1_30 || 0) + (acc.ageing.d31_60 || 0) + (acc.ageing.d61_90 || 0) + (acc.ageing.d90_plus || 0))}</strong></div>
        <div style={{ alignSelf: 'end' }}><Link to={`/admin/books?tab=reports&report=ledger&ledger=${acc.ledger.id}`}>Full statement →</Link></div>
      </div>

      <div style={{ ...card, padding: 16 }}>
        <p style={{ margin: '0 0 10px', fontWeight: 700 }}>Credit terms</p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem', marginBottom: 10 }}><input type="checkbox" checked={terms.has_credit_account} onChange={set('has_credit_account')} /> This customer can buy on account</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
          <div><label style={lab}>Credit limit</label><input type="number" min="0" step="0.01" value={terms.credit_limit} onChange={set('credit_limit')} style={small} /></div>
          <div><label style={lab}>Limit currency</label><select value={terms.credit_currency_id} onChange={set('credit_currency_id')} style={small}><option value="">Customer's currency</option>{currencies.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></div>
          <div><label style={lab}>Payment terms (days)</label><input type="number" min="0" value={terms.credit_terms_days} onChange={set('credit_terms_days')} style={small} /></div>
          <div><label style={lab}>Interest rate % (per month)</label><input type="number" min="0" step="0.01" value={terms.credit_interest_rate} onChange={set('credit_interest_rate')} style={small} /></div>
        </div>
        <div style={{ marginTop: 12 }}><button type="button" style={btnPrimary} disabled={busy} onClick={saveTerms}>Save terms</button></div>
      </div>

      <div style={{ ...card, padding: 16 }}>
        <p style={{ margin: '0 0 10px', fontWeight: 700 }}>Open invoices</p>
        {acc.open_bills.length === 0 ? <p style={{ color: colors.textMuted, fontSize: '0.82rem', margin: 0 }}>Nothing outstanding.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <tbody>{acc.open_bills.map((b) => (
              <tr key={b.voucher_id} style={{ borderTop: `1px solid ${colors.tint(0.06)}` }}>
                <td style={{ padding: 6 }}><Link to={`/admin/books/vouchers/${b.voucher_id}`}>{b.voucher_number}</Link></td><td>{b.date}</td><td>due {b.due_date}</td>
                <td style={{ color: b.days_late ? colors.dangerText : colors.textMuted }}>{b.days_late ? `${b.days_late}d late` : 'current'}</td><td style={{ textAlign: 'right' }}>{money(b.open)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {terms.credit_interest_rate > 0 && acc.open_bills.some((b) => b.days_late > 0) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <input type="number" min="0" step="0.01" placeholder="Interest amount" value={interest} onChange={(e) => setInterest(e.target.value)} style={{ ...small, width: 160 }} />
            <button type="button" style={btnGhost} disabled={busy || !interest} onClick={doInterest}>Charge interest</button>
          </div>
        )}
      </div>

      <form onSubmit={doAdjust} style={{ ...card, padding: 16 }}>
        <p style={{ margin: '0 0 10px', fontWeight: 700 }}>Adjust the account</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
          <div><label style={lab}>Direction</label><select value={adj.direction} onChange={(e) => setAdj((a) => ({ ...a, direction: e.target.value }))} style={small}><option value="debit">Charge them (they owe more)</option><option value="credit">Credit them (they owe less)</option></select></div>
          <div><label style={lab}>Amount ({cur})</label><input required type="number" min="0.01" step="0.01" value={adj.amount} onChange={(e) => setAdj((a) => ({ ...a, amount: e.target.value }))} style={small} /></div>
          <div><label style={lab}>Other side</label><select required value={adj.counter_ledger_id} onChange={(e) => setAdj((a) => ({ ...a, counter_ledger_id: e.target.value }))} style={small}><option value="">Choose a ledger…</option>{ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></div>
          <div><label style={lab}>Reason</label><input required value={adj.note} onChange={(e) => setAdj((a) => ({ ...a, note: e.target.value }))} style={small} /></div>
        </div>
        <div style={{ marginTop: 12 }}><button type="submit" style={btnGhost} disabled={busy}>Post adjustment</button></div>
      </form>
    </div>
  );
}
