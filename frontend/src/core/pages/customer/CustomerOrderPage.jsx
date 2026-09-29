import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import checkoutAPI from '../../../_shared/api/checkout';
import { formatMoney } from '../../../_shared/lib/money';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { ORDER_STATUS } from './orderStatus';

export default function CustomerOrderPage() {
  const { id } = useParams();
  const [o, setO] = useState(null);
  const [error, setError] = useState(null);
  const [opts, setOpts] = useState(null);
  const [pay, setPay] = useState({ open: false, methodId: '', phone: '', gift: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => checkoutAPI.order(id).then(setO).catch((e) => setError(errMsg(e, 'Could not load this order'))), [id]);
  useEffect(() => { load(); checkoutAPI.options().then(setOpts).catch(() => {}); }, [load]);

  if (error) return <><Header /><main style={{ padding: 32 }}><p role="alert" style={{ color: '#991b1b' }}>{error}</p><Link to="/orders">Back</Link></main><Footer /></>;
  if (!o) return <><Header /><main style={{ padding: 32 }}>Loading…</main><Footer /></>;

  const cur = o.currency;
  const m = (n) => formatMoney(n, cur);
  const [label, color] = ORDER_STATUS[o.status] ?? [o.status, '#6b7280'];
  const canPay = o.payment === 'unpaid' && o.status !== 'cancelled' && (opts?.payment_methods?.length ?? 0) > 0;
  const canCancel = o.payment === 'unpaid' && o.status !== 'cancelled' && !(o.documents?.length);

  const startPay = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const res = await checkoutAPI.payOrder(id, { payment_method_id: Number(pay.methodId), phone: pay.phone, gift_voucher_code: pay.gift || undefined });
      toast.success(res.message);
      setPay((p) => ({ ...p, open: false }));
      // poll for the confirmation
      let n = 0;
      const iv = setInterval(async () => {
        n += 1;
        try {
          const a = await checkoutAPI.attempt(res.attempt.id, n % 3 === 0);
          if (a.status !== 'pending') { clearInterval(iv); if (a.status === 'confirmed') toast.success('Payment received — thank you!'); else toast.error(a.failure_reason || 'The payment did not go through.'); load(); }
        } catch { /* keep polling */ }
        if (n > 40) clearInterval(iv);
      }, 4000);
    } catch (err) { toast.error(errMsg(err, 'Could not start the payment'), { duration: 8000 }); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!confirm('Cancel this order?')) return;
    try { await checkoutAPI.cancelOrder(id); toast.success('Order cancelled'); load(); } catch (e) { toast.error(errMsg(e, 'Could not cancel'), { duration: 8000 }); }
  };

  return (
    <>
      <Header />
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px 64px' }}>
        <Link to="/orders" style={{ fontSize: '0.8rem', color: '#6b7280' }}>← My orders</Link>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '8px 0' }}>Order <span style={{ fontFamily: 'monospace' }}>{o.number}</span></h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem' }}><span style={{ color, fontWeight: 700 }}>{label}</span> · {o.date}{o.branch && ` · ${o.branch}`}</p>
        {o.stock_pending && <p style={{ padding: 10, borderRadius: 8, background: 'rgba(245,158,11,0.1)', fontSize: '0.82rem' }}>Paid — some items are being restocked; we'll deliver as soon as they arrive.</p>}
        {o.contact?.shipping_address && <p style={{ fontSize: '0.82rem' }}><strong>Delivering to:</strong> {o.contact.shipping_address}</p>}

        <div style={{ overflowX: 'auto', margin: '16px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead><tr style={{ textAlign: 'left', color: '#9ca3af', fontSize: '0.7rem' }}><th style={{ padding: 8 }}>Item</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {o.lines.map((l) => (
                <tr key={l.id} style={{ borderTop: '1px solid #f3f4f6', color: l.is_component ? '#6b7280' : 'inherit' }}>
                  <td style={{ padding: 8, paddingLeft: l.is_component ? 24 : 8 }}>{l.is_component && '└ '}{l.description}{l.variant_label && l.variant_label !== 'Standard' ? ` — ${l.variant_label}` : ''}</td>
                  <td style={{ textAlign: 'right' }}>{l.quantity} {l.unit_code}</td>
                  <td style={{ textAlign: 'right' }}>{l.is_component ? '' : m(l.amount)}</td>
                </tr>
              ))}
              {o.charges.map((c, i) => <tr key={`c${i}`} style={{ borderTop: '1px solid #f3f4f6' }}><td style={{ padding: 8 }} colSpan={2}>{c.description}</td><td style={{ textAlign: 'right' }}>{Number(c.amount) === 0 ? 'Free' : m(c.amount)}</td></tr>)}
              {o.discount_total > 0 && <tr style={{ borderTop: '1px solid #f3f4f6', color: '#059669' }}><td style={{ padding: 8 }} colSpan={2}>Discounts</td><td style={{ textAlign: 'right' }}>−{m(o.discount_total)}</td></tr>}
              {o.tax_total > 0 && <tr style={{ borderTop: '1px solid #f3f4f6' }}><td style={{ padding: 8 }} colSpan={2}>Tax</td><td style={{ textAlign: 'right' }}>{m(o.tax_total)}</td></tr>}
              <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: 800 }}><td style={{ padding: 8 }} colSpan={2}>Total</td><td style={{ textAlign: 'right' }}>{m(o.total)}</td></tr>
            </tbody>
          </table>
        </div>

        {o.gift_vouchers?.length > 0 && (
          <div style={{ margin: '14px 0', padding: 14, borderRadius: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
            <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: '0.9rem' }}>Your gift voucher{o.gift_vouchers.length > 1 ? 's' : ''}</p>
            {o.gift_vouchers.map((g) => (
              <p key={g.id} style={{ margin: '4px 0', fontSize: '0.85rem' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 700, userSelect: 'all' }}>{g.code}</span> — {m(g.initial_amount)}{g.expires_at ? ` · expires ${g.expires_at}` : ''}
                {g.note && <span style={{ color: '#6b7280' }}> · {g.note.replace(/^Sold on \S+\s*/, '')}</span>}
              </p>
            ))}
            <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#6b7280' }}>Use the code at checkout, or give it to someone. It is also listed under <Link to="/gift-vouchers">Gift vouchers</Link>.</p>
          </div>
        )}

        {o.documents?.length > 0 && <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>Documents: {o.documents.map((d) => `${d.type} ${d.number}`).join(' · ')}</p>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {canPay && !pay.open && <button type="button" onClick={() => setPay((p) => ({ ...p, open: true, methodId: opts.payment_methods[0].id }))} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', fontWeight: 700, color: 'white', background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))', cursor: 'pointer' }}>Pay now</button>}
          {canCancel && <button type="button" onClick={cancel} style={{ padding: '10px 18px', borderRadius: 10, border: '1.5px solid #fca5a5', background: 'white', color: '#b91c1c', fontWeight: 700, cursor: 'pointer' }}>Cancel order</button>}
        </div>

        {pay.open && (
          <form onSubmit={startPay} style={{ display: 'grid', gap: 10, maxWidth: 420, marginTop: 16 }}>
            <select value={pay.methodId} onChange={(e) => setPay((p) => ({ ...p, methodId: e.target.value }))} style={{ padding: 9, borderRadius: 8, border: '1.5px solid #e5e7eb' }}>
              {opts.payment_methods.map((mm) => <option key={mm.id} value={mm.id}>{mm.name}</option>)}
            </select>
            <input required placeholder="M-Pesa number" value={pay.phone} onChange={(e) => setPay((p) => ({ ...p, phone: e.target.value }))} style={{ padding: 9, borderRadius: 8, border: '1.5px solid #e5e7eb' }} />
            {opts.gift_vouchers_enabled && <input placeholder="Gift voucher code (optional)" value={pay.gift} onChange={(e) => setPay((p) => ({ ...p, gift: e.target.value }))} style={{ padding: 9, borderRadius: 8, border: '1.5px solid #e5e7eb' }} />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setPay((p) => ({ ...p, open: false }))}>Cancel</button>
              <button type="submit" disabled={busy} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#6d28d9', color: 'white', fontWeight: 700 }}>{busy ? 'Sending…' : 'Send payment prompt'}</button>
            </div>
          </form>
        )}
      </main>
      <Footer />
    </>
  );
}
