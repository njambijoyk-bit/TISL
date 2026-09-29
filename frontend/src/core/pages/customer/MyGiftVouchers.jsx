import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import api from '../../../_shared/api/axios';
import checkoutAPI from '../../../_shared/api/checkout';
import { formatMoney } from '../../../_shared/lib/money';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { useAuthStore } from '../../../_shared/store/index';

const input = { padding: 10, borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' };
const STATUS = { active: ['Ready to use', '#10b981'], used: ['Used', '#6b7280'], expired: ['Expired', '#6b7280'], cancelled: ['Cancelled', '#ef4444'] };
const PRESETS = [500, 1000, 2500, 5000];

/** A customer's gift vouchers, and buying one (for themselves or someone else). Paid for like any order; the code appears once the payment arrives. */
export default function MyGiftVouchers() {
  const nav = useNavigate();
  const { user } = useAuthStore();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [f, setF] = useState({ amount: '', recipient_name: '', message: '', phone: user?.phone || '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const load = useCallback(() => api.get('/gift-vouchers').then((r) => setRows(r.data)).catch((e) => setError(errMsg(e, 'Could not load your gift vouchers'))), []);
  useEffect(() => { load(); }, [load]);

  const buy = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const res = await checkoutAPI.place({
        gift_vouchers: [{ amount: Number(f.amount), recipient_name: f.recipient_name || undefined, message: f.message || undefined }],
        payment_mode: 'pay_later', customer_email: user?.email, customer_phone: f.phone, phone: f.phone,
      });
      toast.success('Order created — pay to receive the gift voucher code');
      nav(`/orders/${res.order.id}`);
    } catch (x) { toast.error(errMsg(x, 'Could not create the order'), { duration: 8000 }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <Header />
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px 64px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 6px' }}>Gift vouchers</h1>
        <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: '0.85rem' }}>Spend a code at checkout. Points you redeem, refunds and gifts land here too. <Link to="/orders">My orders</Link></p>

        {error && <p role="alert" style={{ color: '#991b1b' }}>{error}</p>}
        {!rows && !error && <p>Loading…</p>}
        {rows?.length === 0 && <p style={{ color: '#6b7280' }}>You don't have any gift vouchers yet.</p>}
        <div style={{ display: 'grid', gap: 10, marginBottom: 28 }}>
          {rows?.map((g) => {
            const [label, color] = STATUS[g.status] ?? [g.status, '#6b7280'];
            return (
              <div key={g.id} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: 0, fontFamily: 'monospace', fontWeight: 700 }}>{g.code}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>{g.expires_at ? `Expires ${g.expires_at}` : 'No expiry'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontWeight: 800 }}>{formatMoney(g.balance, g.currency?.code)}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color }}>{label} · of {formatMoney(g.initial_amount, g.currency?.code)}</p>
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={buy} style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 18, display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Buy a gift voucher</h2>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PRESETS.map((n) => (
              <button key={n} type="button" onClick={() => setF((x) => ({ ...x, amount: String(n) }))}
                style={{ padding: '8px 14px', borderRadius: 999, border: '1.5px solid #e5e7eb', background: Number(f.amount) === n ? '#eef2ff' : 'white', cursor: 'pointer', fontWeight: 600 }}>{n.toLocaleString()}</button>
            ))}
          </div>
          <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Amount
            <input required type="number" min="1" step="1" value={f.amount} onChange={set('amount')} style={input} />
          </label>
          <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>For (optional)
            <input value={f.recipient_name} onChange={set('recipient_name')} style={input} placeholder="Their name" />
          </label>
          <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Your phone (for the payment)
            <input required value={f.phone} onChange={set('phone')} style={input} placeholder="07…" />
          </label>
          <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Message (optional)
            <input maxLength={300} value={f.message} onChange={set('message')} style={input} placeholder="Happy birthday!" />
          </label>
          <button type="submit" disabled={busy} style={{ padding: '11px 18px', borderRadius: 10, border: 'none', fontWeight: 700, color: 'white', background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', cursor: 'pointer', justifySelf: 'start' }}>
            {busy ? 'Creating…' : 'Continue to payment'}
          </button>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>You'll pay on the next page. The voucher code is issued as soon as the payment arrives and stays in your account — you can give it to anyone.</p>
        </form>
      </main>
      <Footer />
    </>
  );
}
