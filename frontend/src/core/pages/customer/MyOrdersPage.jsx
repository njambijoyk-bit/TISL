import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import checkoutAPI from '../../../_shared/api/checkout';
import { formatMoney } from '../../../_shared/lib/money';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { ORDER_STATUS } from './orderStatus';

export default function MyOrdersPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [last, setLast] = useState(1);
  useEffect(() => {
    checkoutAPI.orders({ page }).then((r) => { setRows(r.data); setLast(r.last_page); }).catch((e) => setError(errMsg(e, 'Could not load your orders')));
  }, [page]);

  return (
    <>
      <Header />
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px 64px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 20px' }}>My orders</h1>
        {error && <p role="alert" style={{ color: '#991b1b' }}>{error}</p>}
        {!rows && !error && <p>Loading…</p>}
        {rows?.length === 0 && <p style={{ color: '#6b7280' }}>You haven't placed an order yet. <Link to="/products">Start shopping</Link></p>}
        <div style={{ display: 'grid', gap: 12 }}>
          {rows?.map((o) => {
            const [label, color] = ORDER_STATUS[o.status] ?? [o.status, '#6b7280'];
            return (
              <Link key={o.id} to={`/orders/${o.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: 16, borderRadius: 12, border: '1px solid rgba(168,85,247,0.2)', textDecoration: 'none', color: 'inherit' }}>
                <div><strong style={{ fontFamily: 'monospace' }}>{o.number}</strong><div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{o.date}{o.payment === 'unpaid' && ' · awaiting payment'}</div></div>
                <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 700 }}>{formatMoney(o.total, o.currency)}</div><span style={{ fontSize: '0.72rem', fontWeight: 700, color }}>{label}</span></div>
              </Link>
            );
          })}
        </div>
        {last > 1 && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page} of {last}</span>
            <button type="button" disabled={page >= last} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
