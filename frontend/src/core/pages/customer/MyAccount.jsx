import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import checkoutAPI from '../../../_shared/api/checkout';
import { formatMoney } from '../../../_shared/lib/money';
import toast from 'react-hot-toast';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { creditSentence } from '../../components/admin/books/creditText';

const card = { padding: 16, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface-card, #fff)', color: 'var(--text-primary)' };
const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', color: 'var(--text-tertiary)', fontWeight: 700 };
const ctl = { padding: '6px 10px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface-input)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.8rem' };
const td = { padding: '9px 10px', fontSize: '0.84rem', borderTop: '1px solid var(--line)' };

/** What I owe, bill by bill; what I have paid over or in advance; my credit limit; my statement; how to pay. */
export default function MyAccount() {
  const [a, setA] = useState(null);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('90d');          // a preset, or 'custom'
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [fmt, setFmt] = useState('pdf');
  const [busy, setBusy] = useState(false);
  const [outFmt, setOutFmt] = useState('pdf');
  const [outBusy, setOutBusy] = useState(false);
  const downloadOutstandings = async () => {
    setOutBusy(true);
    try { await checkoutAPI.downloadOutstandings({ format: outFmt }); }
    catch (e) { toast.error(errMsg(e, 'Could not export your outstandings')); }
    finally { setOutBusy(false); }
  };
  // what to ask the server for: a preset, or a custom pair once both dates are chosen
  const period = range === 'custom' ? (custom.from ? { from: custom.from, to: custom.to || undefined } : null) : { range };
  useEffect(() => {
    if (!period) return;
    checkoutAPI.account(period).then(setA).catch((e) => setError(errMsg(e, 'Could not load your account')));
  }, [range, custom.from, custom.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const download = async () => {
    if (!period) return;
    setBusy(true);
    try { await checkoutAPI.downloadStatement({ ...period, format: fmt }); }
    catch (e) { toast.error(errMsg(e, 'Could not export your statement')); }
    finally { setBusy(false); }
  };
  const m = (n) => formatMoney(n, a?.base_currency);

  return (
    <>
      <Header />
      <style>{`.acct-export { padding: 6px 14px; border-radius: 8px; border: 1.5px solid var(--color-primary-500); background: var(--color-primary-500); color: #fff; font-weight: 700; font-family: inherit; font-size: 0.8rem; cursor: pointer; transition: transform 150ms, filter 150ms; } .acct-export:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); } .acct-export:disabled { opacity: 0.55; cursor: not-allowed; }`}</style>
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px 64px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 6px' }}>My account</h1>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>What you owe us, what you have paid us over, and how to pay. <Link to="/orders">My orders</Link> · <Link to="/gift-vouchers">My wallet</Link></p>
        {error && <p role="alert" style={{ color: '#991b1b' }}>{error}</p>}
        {!a && !error && <p>Loading…</p>}
        {a && (
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              <div style={card}><div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>YOU OWE</div><div style={{ fontSize: '1.3rem', fontWeight: 800, color: a.owed > 0 ? '#b45309' : '#059669' }}>{m(a.owed)}</div></div>
              <div style={card}><div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>OVERDUE</div><div style={{ fontSize: '1.3rem', fontWeight: 800, color: a.overdue > 0 ? '#b91c1c' : '#059669' }}>{m(a.overdue)}</div></div>
              {a.terms && <div style={card}><div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', fontWeight: 700 }}>CREDIT AVAILABLE</div><div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{m(a.terms.available)}</div><div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>limit {m(a.terms.limit)} · {a.terms.days} days to pay</div></div>}
            </div>

            {a.credits.length > 0 && (
              <div style={{ ...card, background: 'rgba(99,102,241,0.05)' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 800 }}>Money you have paid us</p>
                {a.credits.map((c) => <p key={c.voucher_id} style={{ margin: '3px 0', fontSize: '0.85rem' }}>{creditSentence({ ...c, amount: c.amount })}</p>)}
                <p style={{ margin: '8px 0 0', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Use it at checkout — if it covers the whole order you can pay from it — or ask us for a refund.</p>
              </div>
            )}

            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '14px 16px 6px' }}>
                <p style={{ margin: 0, fontWeight: 800, marginRight: 'auto' }}>What is still to pay</p>
                <select aria-label="Outstandings format" value={outFmt} onChange={(e) => setOutFmt(e.target.value)} style={ctl}>
                  <option value="pdf">PDF</option><option value="html">Printable page</option><option value="csv">CSV (Excel)</option>
                </select>
                <button type="button" className="acct-export" disabled={outBusy || a.bills.length === 0} onClick={downloadOutstandings} title="A letter listing what is outstanding on your ledger, aged by bill date">{outBusy ? 'Preparing…' : 'Ledger outstandings'}</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead><tr><th style={th}>Bill</th><th style={th}>Date</th><th style={th}>Due</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={{ ...th, textAlign: 'right' }}>Still to pay</th></tr></thead>
                <tbody>
                  {a.bills.length === 0 && <tr><td style={{ ...td, color: 'var(--text-secondary)' }} colSpan={5}>Nothing is outstanding. Thank you!</td></tr>}
                  {a.bills.map((b) => (
                    <tr key={b.voucher_number}>
                      <td style={td}><strong style={{ fontFamily: 'monospace' }}>{b.voucher_number}</strong><div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{b.type_name}{b.order_id && <> · <Link to={`/orders/${b.order_id}`}>order</Link></>}</div></td>
                      <td style={td}>{b.date}</td>
                      <td style={{ ...td, color: b.days_late > 0 ? '#b91c1c' : 'inherit' }}>{b.due_date}{b.days_late > 0 && <div style={{ fontSize: '0.7rem' }}>{b.days_late} days late</div>}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{m(b.original)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{m(b.outstanding)}{b.foreign && <div style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-tertiary)' }}>{b.currency} {Number(b.outstanding_fc).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {a.how_to_pay.length > 0 && (
              <div style={card}>
                <p style={{ margin: '0 0 8px', fontWeight: 800 }}>How to pay us</p>
                {a.how_to_pay.map((h) => <p key={h.label} style={{ margin: '4px 0', fontSize: '0.85rem' }}><strong>{h.label}</strong> — {h.instructions}</p>)}
                <p style={{ margin: '8px 0 0', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Quote the invoice number as the reference. We will match your payment to it.</p>
              </div>
            )}

            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '14px 16px 8px' }}>
                <p style={{ margin: 0, fontWeight: 800, marginRight: 'auto' }}>Statement <span style={{ fontWeight: 400, fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>{a.statement.from} to {a.statement.to}</span></p>
                <select aria-label="Statement period" value={range} onChange={(e) => setRange(e.target.value)} style={ctl}>
                  <option value="30d">Last 30 days</option><option value="60d">Last 60 days</option><option value="90d">Last 90 days</option>
                  <option value="6m">Last 6 months</option><option value="12m">Last 12 months</option><option value="ytd">This year</option><option value="custom">Custom dates…</option>
                </select>
                {range === 'custom' && (
                  <>
                    <input type="date" aria-label="From" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} style={ctl} />
                    <input type="date" aria-label="To" value={custom.to} min={custom.from || undefined} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} style={ctl} />
                  </>
                )}
                <select aria-label="Export format" value={fmt} onChange={(e) => setFmt(e.target.value)} style={ctl}>
                  <option value="pdf">PDF</option><option value="csv">CSV (Excel)</option><option value="html">Printable page</option>
                </select>
                <button type="button" className="acct-export" disabled={busy || !period} onClick={download}>{busy ? 'Preparing…' : 'Export'}</button>
              </div>
              {range === 'custom' && !custom.from && <p style={{ margin: 0, padding: '0 16px 8px', fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>Choose a start date. Statements can cover up to a year.</p>}
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead><tr><th style={th}>Date</th><th style={th}>Document</th><th style={{ ...th, textAlign: 'right' }}>Charged</th><th style={{ ...th, textAlign: 'right' }}>Paid / credited</th><th style={{ ...th, textAlign: 'right' }}>Balance</th></tr></thead>
                <tbody>
                  <tr><td style={{ ...td, color: 'var(--text-secondary)' }} colSpan={4}>Brought forward</td><td style={{ ...td, textAlign: 'right' }}>{m(a.statement.opening)}</td></tr>
                  {a.statement.rows.map((r, i) => (
                    <tr key={i}><td style={td}>{r.date}</td><td style={td}>{r.type} <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{r.voucher_number}</span></td>
                      <td style={{ ...td, textAlign: 'right' }}>{r.debit ? m(r.debit) : ''}</td><td style={{ ...td, textAlign: 'right', color: '#059669' }}>{r.credit ? m(r.credit) : ''}</td><td style={{ ...td, textAlign: 'right' }}>{m(r.balance)}</td></tr>
                  ))}
                  {a.statement.rows.length === 0 && <tr><td style={{ ...td, color: 'var(--text-secondary)' }} colSpan={5}>No movements in this period.</td></tr>}
                </tbody>
              </table>
              <p style={{ margin: 0, padding: '8px 16px 14px', fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>A negative balance means we hold money for you.</p>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
