import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import checkoutAPI from '../../../_shared/api/checkout';
import { formatMoney } from '../../../_shared/lib/money';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { creditSentence } from '../../components/admin/books/creditText';

const card = { padding: 16, borderRadius: 12, border: '1px solid rgba(168,85,247,0.2)', background: 'white' };
const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700 };
const td = { padding: '9px 10px', fontSize: '0.84rem', borderTop: '1px solid #f3f4f6' };

/** What I owe, bill by bill; what I have paid over or in advance; my credit limit; my statement; how to pay. */
export default function MyAccount() {
  const [a, setA] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { checkoutAPI.account().then(setA).catch((e) => setError(errMsg(e, 'Could not load your account'))); }, []);
  const m = (n) => formatMoney(n, a?.base_currency);

  return (
    <>
      <Header />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px 64px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 6px' }}>My account</h1>
        <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: '0.85rem' }}>What you owe us, what you have paid us over, and how to pay. <Link to="/orders">My orders</Link> · <Link to="/gift-vouchers">My wallet</Link></p>
        {error && <p role="alert" style={{ color: '#991b1b' }}>{error}</p>}
        {!a && !error && <p>Loading…</p>}
        {a && (
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              <div style={card}><div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 700 }}>YOU OWE</div><div style={{ fontSize: '1.3rem', fontWeight: 800, color: a.owed > 0 ? '#b45309' : '#059669' }}>{m(a.owed)}</div></div>
              <div style={card}><div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 700 }}>OVERDUE</div><div style={{ fontSize: '1.3rem', fontWeight: 800, color: a.overdue > 0 ? '#b91c1c' : '#059669' }}>{m(a.overdue)}</div></div>
              {a.terms && <div style={card}><div style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 700 }}>CREDIT AVAILABLE</div><div style={{ fontSize: '1.3rem', fontWeight: 800 }}>{m(a.terms.available)}</div><div style={{ fontSize: '0.72rem', color: '#6b7280' }}>limit {m(a.terms.limit)} · {a.terms.days} days to pay</div></div>}
            </div>

            {a.credits.length > 0 && (
              <div style={{ ...card, background: 'rgba(99,102,241,0.05)' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 800 }}>Money you have paid us</p>
                {a.credits.map((c) => <p key={c.voucher_id} style={{ margin: '3px 0', fontSize: '0.85rem' }}>{creditSentence({ ...c, amount: c.amount })}</p>)}
                <p style={{ margin: '8px 0 0', fontSize: '0.74rem', color: '#6b7280' }}>Use it at checkout — if it covers the whole order you can pay from it — or ask us for a refund.</p>
              </div>
            )}

            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <p style={{ margin: 0, padding: '14px 16px 6px', fontWeight: 800 }}>What is still to pay</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead><tr><th style={th}>Bill</th><th style={th}>Date</th><th style={th}>Due</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={{ ...th, textAlign: 'right' }}>Still to pay</th></tr></thead>
                <tbody>
                  {a.bills.length === 0 && <tr><td style={{ ...td, color: '#6b7280' }} colSpan={5}>Nothing is outstanding. Thank you!</td></tr>}
                  {a.bills.map((b) => (
                    <tr key={b.voucher_number}>
                      <td style={td}><strong style={{ fontFamily: 'monospace' }}>{b.voucher_number}</strong><div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{b.type_name}{b.order_id && <> · <Link to={`/orders/${b.order_id}`}>order</Link></>}</div></td>
                      <td style={td}>{b.date}</td>
                      <td style={{ ...td, color: b.days_late > 0 ? '#b91c1c' : 'inherit' }}>{b.due_date}{b.days_late > 0 && <div style={{ fontSize: '0.7rem' }}>{b.days_late} days late</div>}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{m(b.original)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{m(b.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {a.how_to_pay.length > 0 && (
              <div style={card}>
                <p style={{ margin: '0 0 8px', fontWeight: 800 }}>How to pay us</p>
                {a.how_to_pay.map((h) => <p key={h.label} style={{ margin: '4px 0', fontSize: '0.85rem' }}><strong>{h.label}</strong> — {h.instructions}</p>)}
                <p style={{ margin: '8px 0 0', fontSize: '0.74rem', color: '#6b7280' }}>Quote the invoice number as the reference. We will match your payment to it.</p>
              </div>
            )}

            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <p style={{ margin: 0, padding: '14px 16px 6px', fontWeight: 800 }}>Statement — last 90 days</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead><tr><th style={th}>Date</th><th style={th}>Document</th><th style={{ ...th, textAlign: 'right' }}>Charged</th><th style={{ ...th, textAlign: 'right' }}>Paid / credited</th><th style={{ ...th, textAlign: 'right' }}>Balance</th></tr></thead>
                <tbody>
                  <tr><td style={{ ...td, color: '#6b7280' }} colSpan={4}>Brought forward</td><td style={{ ...td, textAlign: 'right' }}>{m(a.statement.opening)}</td></tr>
                  {a.statement.rows.map((r, i) => (
                    <tr key={i}><td style={td}>{r.date}</td><td style={td}>{r.type} <span style={{ fontFamily: 'monospace', color: '#6b7280' }}>{r.voucher_number}</span></td>
                      <td style={{ ...td, textAlign: 'right' }}>{r.debit ? m(r.debit) : ''}</td><td style={{ ...td, textAlign: 'right', color: '#059669' }}>{r.credit ? m(r.credit) : ''}</td><td style={{ ...td, textAlign: 'right' }}>{m(r.balance)}</td></tr>
                  ))}
                  {a.statement.rows.length === 0 && <tr><td style={{ ...td, color: '#6b7280' }} colSpan={5}>No movements in the last 90 days.</td></tr>}
                </tbody>
              </table>
              <p style={{ margin: 0, padding: '8px 16px 14px', fontSize: '0.72rem', color: '#9ca3af' }}>A negative balance means we hold money for you.</p>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
