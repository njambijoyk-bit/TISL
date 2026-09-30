import { creditSentence } from '../../components/admin/books/creditText';
import { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import checkoutAPI from '../../../_shared/api/checkout';
import customerLoyaltyAPI from '../../../_shared/api/customerLoyalty';
import { formatMoney } from '../../../_shared/lib/money';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { useAuthStore } from '../../../_shared/store/index';

const input = { padding: 10, borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' };
const card = { border: '1px solid #e5e7eb', borderRadius: 14, padding: 16 };
const STATUS = { active: ['Ready to use', '#10b981'], used: ['Used', '#6b7280'], expired: ['Expired', '#6b7280'], cancelled: ['Cancelled', '#ef4444'] };
const PRESETS = [500, 1000, 2500, 5000];

const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '');
const OrderLink = ({ order }) => (order ? <Link to={`/orders/${order.id}`} style={{ fontSize: '0.72rem' }}>{order.number}</Link> : null);

function Points({ points, base, onDone }) {
  const [busy, setBusy] = useState(null);
  const redeem = async (rule) => {
    if (!window.confirm(`Redeem ${rule.points_required.toLocaleString()} points for ${rule.name}?`)) return;
    setBusy(rule.id);
    try { const r = await customerLoyaltyAPI.selfRedeem({ rule_id: rule.id }); toast.success(r.message || 'Redeemed'); onDone(); }
    catch (e) { toast.error(errMsg(e, 'Could not redeem'), { duration: 8000 }); }
    finally { setBusy(null); }
  };
  return (
    <section style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#6b7280', fontWeight: 700 }}>LOYALTY POINTS</p>
          <p style={{ margin: '2px 0 0', fontSize: '1.8rem', fontWeight: 800 }}>{points.balance.toLocaleString()}</p>
          {points.value > 0 && <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280' }}>worth about {formatMoney(points.value, base.code)}</p>}
        </div>
        {points.expiring_soon && (
          <p style={{ margin: 0, padding: '8px 12px', borderRadius: 10, background: 'rgba(245,158,11,0.12)', fontSize: '0.78rem', alignSelf: 'flex-start' }}>
            {points.expiring_soon.points.toLocaleString()} points expire on {points.expiring_soon.on}
          </p>
        )}
      </div>
      {points.rules.length > 0 && (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          {points.rules.map((r) => {
            const can = points.balance >= r.points_required && r.points_required >= points.min_redemption_points;
            return (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid #f3f4f6', borderRadius: 10 }}>
                <span style={{ fontSize: '0.85rem' }}><strong>{r.name}</strong> <span style={{ color: '#6b7280' }}>· {r.points_required.toLocaleString()} points</span></span>
                <button type="button" disabled={!can || busy === r.id} onClick={() => redeem(r)}
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', fontWeight: 700, color: 'white', background: can ? 'var(--color-primary-600)' : '#d1d5db', cursor: can ? 'pointer' : 'not-allowed' }}>
                  {busy === r.id ? '…' : 'Redeem'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Voucher({ g }) {
  const [open, setOpen] = useState(false);
  const [label, color] = STATUS[g.status] ?? [g.status, '#6b7280'];
  const cur = g.currency?.code;
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setOpen((o) => !o)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}>
        <div>
          <p style={{ margin: 0, fontFamily: 'monospace', fontWeight: 700, userSelect: 'all' }}>{g.code}</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#6b7280' }}>{g.expires_at ? `Expires ${g.expires_at}` : 'No expiry'}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontWeight: 800 }}>{formatMoney(g.balance, cur)}</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color }}>{label} · of {formatMoney(g.initial_amount, cur)}</p>
        </div>
      </div>
      {open && (
        <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 6, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
          {g.movements.map((m) => (
            <li key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.8rem' }}>
              <span>{m.label} <OrderLink order={m.order} /> <span style={{ color: '#9ca3af' }}>· {m.date}</span></span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{sign(m.amount)}{formatMoney(Math.abs(m.amount), cur)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The customer's wallet: gift vouchers and loyalty points, every movement with the order it came from, and buying a voucher. */
export default function MyGiftVouchers() {
  const nav = useNavigate();
  const { user } = useAuthStore();
  const [w, setW] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('vouchers');
  const [f, setF] = useState({ amount: '', recipient_name: '', message: '', phone: user?.phone || '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const load = useCallback(() => customerLoyaltyAPI.wallet().then(setW).catch((e) => setError(errMsg(e, 'Could not load your wallet'))), []);
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

  const tabBtn = (id, text) => (
    <button key={id} type="button" onClick={() => setTab(id)}
      style={{ padding: '8px 16px', borderRadius: 999, border: '1.5px solid #e5e7eb', background: tab === id ? '#eef2ff' : 'white', fontWeight: tab === id ? 800 : 600, cursor: 'pointer' }}>{text}</button>
  );

  return (
    <>
      <Header />
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px 64px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 6px' }}>My wallet</h1>
        <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: '0.85rem' }}>Gift vouchers and loyalty points. Points you redeem, refunds and gifts land here too. <Link to="/orders">My orders</Link></p>
        {error && <p role="alert" style={{ color: '#991b1b' }}>{error}</p>}
        {!w && !error && <p>Loading…</p>}

        {w && (
          <>
            <Points points={w.points} base={w.base} onDone={load} />
            {(w.credits ?? []).length > 0 && (
              <div style={{ margin: '14px 0 0', padding: 14, borderRadius: 12, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)' }}>
                <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: '0.9rem' }}>Money you have paid us</p>
                {w.credits.map((c) => <p key={c.voucher_id} style={{ margin: '3px 0', fontSize: '0.85rem' }}>{creditSentence(c)}</p>)}
                <p style={{ margin: '8px 0 0', fontSize: '0.74rem', color: '#6b7280' }}>You can use it on your next order at checkout, or ask us for a refund.</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '18px 0 12px' }}>
              {tabBtn('vouchers', `Gift vouchers (${w.vouchers.filter((g) => g.status === 'active').length})`)}
              {tabBtn('history', 'History')}
              {tabBtn('buy', 'Buy a voucher')}
            </div>

            {tab === 'vouchers' && (
              w.vouchers.length === 0
                ? <p style={{ color: '#6b7280' }}>You don't have any gift vouchers yet.</p>
                : <div style={{ display: 'grid', gap: 10 }}>{w.vouchers.map((g) => <Voucher key={g.id} g={g} />)}</div>
            )}

            {tab === 'history' && (
              w.history.length === 0
                ? <p style={{ color: '#6b7280' }}>Nothing has happened in your wallet yet.</p>
                : (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {w.history.map((h) => (
                      <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 12px', border: '1px solid #f3f4f6', borderRadius: 10, fontSize: '0.82rem' }}>
                        <span>
                          <strong>{h.label}</strong> <OrderLink order={h.order} />
                          <span style={{ display: 'block', color: '#9ca3af', fontSize: '0.72rem' }}>{h.date}{h.detail ? ` · ${h.detail}` : ''}</span>
                        </span>
                        <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: h.amount < 0 ? '#b91c1c' : '#047857', fontWeight: 700 }}>
                          {sign(h.amount)}{h.kind === 'points' ? `${Math.abs(h.amount).toLocaleString()} pts` : formatMoney(Math.abs(h.amount), h.unit)}
                          <span style={{ display: 'block', color: '#9ca3af', fontWeight: 500, fontSize: '0.7rem' }}>balance {h.kind === 'points' ? `${h.balance_after.toLocaleString()} pts` : formatMoney(h.balance_after, h.unit)}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                )
            )}

            {tab === 'buy' && (
              <form onSubmit={buy} style={{ ...card, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PRESETS.map((n) => (
                    <button key={n} type="button" onClick={() => setF((x) => ({ ...x, amount: String(n) }))}
                      style={{ padding: '8px 14px', borderRadius: 999, border: '1.5px solid #e5e7eb', background: Number(f.amount) === n ? '#eef2ff' : 'white', cursor: 'pointer', fontWeight: 600 }}>{n.toLocaleString()}</button>
                  ))}
                </div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Amount ({w.base.code})
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
                <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>You'll pay on the next page. The code is issued as soon as the payment arrives and stays in your account — you can give it to anyone.</p>
              </form>
            )}
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
