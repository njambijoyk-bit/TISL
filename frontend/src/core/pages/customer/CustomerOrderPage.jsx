import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import checkoutAPI from '../../../_shared/api/checkout';
import { formatMoney } from '../../../_shared/lib/money';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { ORDER_STATUS } from './orderStatus';
import OrderBreakdown from '../../../_shared/components/common/OrderBreakdown';
import SummaryLedger from '../../../_shared/components/common/SummaryLedger';
import { creditSentence } from '../../components/admin/books/creditText';
import useDocId from '../../../_shared/hooks/useDocId';

export default function CustomerOrderPage() {
  const { id: ref } = useParams();
  const navigate = useNavigate();
  const { id, failed } = useDocId(ref);   // the address carries the order number; the id is looked up
  const [o, setO] = useState(null);
  const [error, setError] = useState(null);
  const [opts, setOpts] = useState(null);
  const [pay, setPay] = useState({ open: false, methodId: '', phone: '', gift: '' });
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);       // { qty: {lineId: n}, address, promo } while changing the order
  const [review, setReview] = useState(null);   // { id, note } while asking for a review
  const [ask, setAsk] = useState(null);         // the reason being typed while asking to cancel a paid preorder

  const load = useCallback(() => (id ? checkoutAPI.order(id).then(setO).catch((e) => setError(errMsg(e, 'Could not load this order'))) : (failed ? setError('We could not find that order.') : undefined)), [id, failed]);
  useEffect(() => { if (o?.number && ref !== o.number) navigate(`/orders/${encodeURIComponent(o.number)}`, { replace: true }); }, [o]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); checkoutAPI.options().then(setOpts).catch(() => {}); }, [load]);

  if (error) return <><Header /><main style={{ padding: 32 }}>        <p role="alert" style={{ color: '#991b1b' }}>{error}</p><Link to="/orders">Back</Link></main><Footer /></>;
  if (!o) return <><Header /><main style={{ padding: 32 }}>Loading…</main><Footer /></>;

  const cur = o.currency;
  const m = (n) => formatMoney(n, cur);
  const [label, color] = ORDER_STATUS[o.status] ?? [o.status, '#6b7280'];
  // the order in the same shape the checkout priced it, so it reads the same as the confirmation page and the admin's voucher
  const q = { currency: o.currency, lines: o.lines, subtotal: o.subtotal, tax_total: o.tax_total, total: o.total, due_now: o.total, discounts: o.discounts ?? [], tax_breakdown: o.tax_breakdown ?? [], gift: null, customer: null };
  // owed: not paid yet, or charged to the account (an auction registration) with something still outstanding
  const dep = o.deposit;   // a preorder paid with a deposit: what was paid, what is next
  const payAmount = dep && !pay.full ? dep.due_next : (o.due != null ? o.due : o.total);
  const owed = o.payment === 'unpaid' || (o.payment === 'invoiced' && Number(o.due) > 0.005);
  const canPay = owed && o.status !== 'cancelled' && (opts?.payment_methods?.length ?? 0) > 0;
  const registrationUnpaid = o.registration && o.payment === 'invoiced' && Number(o.due) >= Number(o.total) - 0.005;
  const canCancel = o.status !== 'cancelled' && ((o.payment === 'unpaid' && !(o.documents?.length)) || registrationUnpaid);

  const startPay = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const res = await checkoutAPI.payOrder(id, { payment_method_id: Number(pay.methodId || opts.payment_methods[0].id), phone: pay.phone, gift_voucher_code: pay.gift || undefined, full: (dep && pay.full) || undefined });
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

  const startEdit = () => setEdit({ qty: Object.fromEntries(o.lines.filter((l) => !l.is_component).map((l) => [l.id, l.quantity])), address: o.contact?.shipping_address ?? '', promo: undefined, credit: o.use_credit ?? [] });
  const saveEdit = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const items = o.lines.filter((l) => !l.is_component && Number(edit.qty[l.id]) > 0 && (l.product_id || l.hamper_id))
        .map((l) => ({ product_id: l.hamper_id ? undefined : l.product_id, hamper_id: l.hamper_id || undefined, variant_id: l.variant_id ?? undefined, variant_unit_id: l.variant_unit_id ?? undefined, quantity: Number(edit.qty[l.id]) }));
      if (!items.length) { toast.error('An order needs at least one item — cancel it instead.'); return; }
      const body = { items, shipping_address: edit.address };
      if (edit.promo !== undefined) body.promo_code = edit.promo;
      if ((o.credits ?? []).length) body.use_credit = edit.credit;
      const res = await checkoutAPI.updateOrder(id, body);
      toast.success(res.message, { duration: 6000 }); setEdit(null); load();
    } catch (err) { toast.error(errMsg(err, 'Could not update the order'), { duration: 8000 }); }
    finally { setBusy(false); }
  };
  const sendReview = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const res = await checkoutAPI.reviewDocument(review.id, review.note); toast.success(res.message, { duration: 6000 }); setReview(null); load(); }
    catch (err) { toast.error(errMsg(err, 'Could not send your request'), { duration: 8000 }); }
    finally { setBusy(false); }
  };

  const sendAsk = async (e) => {
    e.preventDefault(); setBusy(true);
    try { const r = await checkoutAPI.requestPreorderCancel(id, ask.trim()); toast.success(r.message, { duration: 8000 }); setAsk(null); load(); }
    catch (err) { toast.error(errMsg(err, 'Could not send the request'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const cancel = async () => {
    if (!confirm('Cancel this order?')) return;
    try { await checkoutAPI.cancelOrder(id); toast.success('Order cancelled'); load(); } catch (e) { toast.error(errMsg(e, 'Could not cancel'), { duration: 8000 }); }
  };

  return (
    <>
      <Header />
      <main style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px 64px' }}>
        <style>{`
          .ord-btn { padding: 10px 18px; border-radius: 10px; border: 1.5px solid var(--line); background: var(--surface-card, #fff); color: var(--text-primary); font-weight: 700; font-family: inherit; cursor: pointer; transition: background 150ms, border-color 150ms, transform 150ms; }
          .ord-btn:hover:not(:disabled) { background: var(--surface-hover); border-color: var(--color-primary-500); transform: translateY(-1px); }
          .ord-btn:active:not(:disabled) { transform: none; }
          .ord-btn-danger { padding: 10px 18px; border-radius: 10px; border: 1.5px solid var(--status-error, #ef4444); background: color-mix(in srgb, var(--status-error, #ef4444) 10%, var(--surface-card, #fff)); color: var(--status-error, #ef4444); font-weight: 700; font-family: inherit; cursor: pointer; transition: background 150ms, color 150ms, transform 150ms; }
          .ord-btn-danger:hover:not(:disabled) { background: var(--status-error, #ef4444); color: #fff; transform: translateY(-1px); }
          .ord-btn-sm { padding: 9px 16px; border-radius: 8px; }
        `}</style>

        <Link to="/orders" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary-500)', textDecoration: 'none' }}>← My orders</Link>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '8px 0' }}>Order <span style={{ fontFamily: 'monospace', color: 'var(--color-primary-500)' }}>{o.number}</span></h1>
        <p style={{ color: '#6b7280', fontSize: '0.85rem' }}><span style={{ color, fontWeight: 700 }}>{label}</span></p>
        {o.preorder && o.status !== 'cancelled' && (
          <p style={{ padding: 10, borderRadius: 8, background: 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)', fontSize: '0.82rem' }}>
            <strong>Preorder.</strong> {o.preorder.delivered > 0 ? `${Math.round(o.preorder.delivered * 100) / 100} of ${Math.round(o.preorder.ordered * 100) / 100} delivered so far. ` : ''}
            {o.status === 'delivered' ? 'Everything has been delivered.' : `We deliver as soon as the stock arrives${o.preorder.promised ? ` (expected by ${o.preorder.promised})` : ''}.`}
          </p>
        )}
        {o.stock_pending && <p style={{ padding: 10, borderRadius: 8, background: 'rgba(245,158,11,0.1)', fontSize: '0.82rem' }}>Paid — some items are being restocked; we'll deliver as soon as they arrive.</p>}
        {/* where the order is: placed, then paid, then delivered */}
        {o.status !== 'cancelled' ? (
          <div aria-label="Order progress" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '14px 0', flexWrap: 'wrap', fontSize: '0.78rem' }}>
            {[['Placed', true], [dep ? (dep.stage === 'done' ? 'Paid' : dep.paid > 0 ? 'Deposit paid' : 'Deposit due') : o.payment === 'invoiced' ? 'Invoiced' : 'Paid', dep ? dep.paid > 0 : o.payment === 'paid' || o.payment === 'invoiced' || o.status === 'paid' || o.status === 'delivered'], ['Delivered', o.status === 'delivered']].map(([step, done], i) => (
              <span key={step} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {i > 0 && <span aria-hidden style={{ width: 28, height: 2, background: done ? '#10b981' : '#e5e7eb' }} />}
                <span style={{ width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, color: 'white', background: done ? '#10b981' : '#d1d5db' }}>{done ? '✓' : i + 1}</span>
                <span style={{ fontWeight: done ? 700 : 500, color: done ? '#065f46' : '#9ca3af' }}>{step}</span>
              </span>
            ))}
          </div>
        ) : <p role="status" style={{ padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#991b1b', fontSize: '0.82rem' }}>This order was cancelled.</p>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, padding: 14, borderRadius: 12, border: '1px solid rgba(168,85,247,0.15)', fontSize: '0.82rem', margin: '0 0 6px' }}>
          <div><span style={{ display: 'block', fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700 }}>PLACED</span>{o.date}{o.branch && <span style={{ color: '#6b7280' }}> · {o.branch}</span>}</div>
          {o.contact?.shipping_address && <div><span style={{ display: 'block', fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700 }}>DELIVERING TO</span>{o.contact.shipping_address}</div>}
          {(o.contact?.phone || o.contact?.email) && <div><span style={{ display: 'block', fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700 }}>CONTACT</span>{[o.contact.phone, o.contact.email].filter(Boolean).join(' · ')}</div>}
          <div><span style={{ display: 'block', fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700 }}>PAYMENT</span>{dep ? (dep.stage === 'done' ? 'Paid in full' : dep.stage === 'deposit' ? `Deposit of ${m(dep.amount)} due (${dep.percent}%)` : `Deposit of ${m(dep.amount)} paid · balance ${m(dep.outstanding)} due on delivery or online`)
            : o.payment === 'paid' ? 'Paid' : o.payment === 'invoiced' ? 'Invoiced — payment due' : 'Not paid yet'}</div>
          {o.narration && <div style={{ gridColumn: '1 / -1' }}><span style={{ display: 'block', fontSize: '0.68rem', color: '#9ca3af', fontWeight: 700 }}>YOUR NOTES</span>{o.narration}</div>}
        </div>

        <div style={{ margin: '16px 0', display: 'grid', gap: 14 }}>
          <OrderBreakdown quote={q} linesOnly qtyCell={edit ? (l) => (l.id && !l.is_component && l.item_type !== 'charge' && (l.product_id || l.hamper_id)
            ? <input type="number" min="0" step="any" aria-label={`Quantity of ${l.description}`} value={edit.qty[l.id] ?? ''} onChange={(e) => setEdit((x) => ({ ...x, qty: { ...x.qty, [l.id]: e.target.value } }))} style={{ width: 80, padding: 4, borderRadius: 6, border: '1.5px solid #e5e7eb', textAlign: 'right' }} />
            : null) : null} />
          <div style={{ maxWidth: 460, marginLeft: 'auto', width: '100%' }}><SummaryLedger quote={q} showCustomer={false} /></div>
        </div>

        {o.payment_intent && !['later'].includes(o.payment_intent.kind) && (
          <div style={{ margin: '10px 0', padding: 12, borderRadius: 10, background: 'rgba(16,185,129,0.06)', fontSize: '0.82rem' }}>
            <strong>How you chose to pay: {o.payment_intent.label}</strong>
            {o.payment_intent.instructions && <div style={{ marginTop: 3 }}>{o.payment_intent.instructions}</div>}
            {['bank', 'mobile'].includes(o.payment_intent.kind) && <div style={{ marginTop: 3, color: '#6b7280' }}>Please quote order <strong>{o.number}</strong> as the reference.</div>}
          </div>
        )}

        {o.credits?.length > 0 && o.editable && !edit && (
          <div style={{ margin: '10px 0', padding: 12, borderRadius: 10, background: 'rgba(99,102,241,0.06)', fontSize: '0.82rem' }}>
            {o.credits.map((c) => <p key={c.voucher_id} style={{ margin: '2px 0' }}>{creditSentence(c)}{(o.use_credit ?? []).includes(c.voucher_id) ? <strong> — will be used on this order</strong> : ' — not being used on this order'}</p>)}
            <p style={{ margin: '4px 0 0', fontSize: '0.72rem', color: '#6b7280' }}>Use <em>Change order</em> to tick or untick it. It is taken off when the order becomes an invoice.</p>
          </div>
        )}

        {o.gift_codes_meant?.length > 0 && !o.documents?.length && <p style={{ fontSize: '0.82rem', color: '#4b5563' }}>Gift voucher{o.gift_codes_meant.length > 1 ? 's' : ''} <strong>{o.gift_codes_meant.join(', ')}</strong> will be applied when this order is paid.</p>}

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

        {o.documents?.length > 0 && (
          <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
            <p style={{ margin: '0 0 4px' }}>Documents</p>
            {o.documents.map((d) => (
              <p key={d.id} style={{ margin: '3px 0' }}>{d.type} {d.number}
                {['sales', 'cash_sale'].includes(d.base_type) && (d.review_state === 'requested'
                  ? <span style={{ marginLeft: 8 }}>· review requested{d.review_ticket && <> (<Link to={`/my-tickets/${d.review_ticket.id}`}>{d.review_ticket.number}</Link>)</>}</span>
                  : d.review_state === 'resolved'
                    ? <>
                        <span style={{ marginLeft: 8 }}>· Issue resolved — ticket <Link to={`/my-tickets/${d.review_ticket.id}`}>{d.review_ticket.number}</Link></span>
                        <button type="button" onClick={() => setReview({ id: d.id, note: '' })} style={{ marginLeft: 8, border: 'none', background: 'none', color: '#6d28d9', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' }}>Request another review</button>
                      </>
                    : <button type="button" onClick={() => setReview({ id: d.id, note: '' })} style={{ marginLeft: 8, border: 'none', background: 'none', color: '#6d28d9', cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem' }}>Ask for a review</button>)}
              </p>
            ))}
            <p style={{ margin: '6px 0 0' }}>An invoice or sale can't be changed by you — if something looks wrong, ask for a review and we'll check it.</p>
          </div>
        )}

        {o.preorder_cancel && o.status !== 'cancelled' && (
          <div style={{ marginTop: 12, display: 'grid', gap: 8, maxWidth: 520 }}>
            {o.preorder_cancel.state === 'requested' && <p role="status" style={{ margin: 0, padding: 10, borderRadius: 8, background: 'rgba(245,158,11,0.1)', fontSize: '0.82rem' }}>You asked to cancel this order. We will confirm once we have looked at it; nothing is refunded until then.</p>}
            {o.preorder_cancel.state === 'declined' && o.preorder_cancel.note && <p role="status" style={{ margin: 0, padding: 10, borderRadius: 8, background: 'rgba(239,68,68,0.08)', fontSize: '0.82rem' }}><strong>We could not cancel it.</strong> {o.preorder_cancel.note}</p>}
            {o.preorder_cancel.reason === 'delivered' && <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>Part of this order has already been delivered, so please contact us if you want to cancel the rest.</p>}
            {o.preorder_cancel.can_request && ask === null && <div><button type="button" onClick={() => setAsk('')} className="ord-btn">Ask to cancel this preorder</button></div>}
            {ask !== null && o.preorder_cancel.can_request && (
              <form onSubmit={sendAsk} style={{ display: 'grid', gap: 8 }}>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>You have paid for this order and nothing has been delivered. Tell us why and we will look at it; if we cancel it we refund what you paid.</p>
                <textarea aria-label="Why do you want to cancel?" required minLength={3} maxLength={500} placeholder="Why do you want to cancel?" value={ask} onChange={(e) => setAsk(e.target.value)} style={{ padding: 9, borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface-input)', color: 'var(--text-primary)' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" disabled={busy || ask.trim().length < 3} className="ord-btn-danger">{busy ? 'Sending…' : 'Send request'}</button>
                  <button type="button" onClick={() => setAsk(null)} className="ord-btn ord-btn-sm">Never mind</button>
                </div>
              </form>
            )}
          </div>
        )}
        {o.preorder_cancel?.state === 'approved' && o.status === 'cancelled' && <p role="status" style={{ marginTop: 8, fontSize: '0.82rem', color: '#065f46' }}>We have cancelled this preorder at your request and will refund what you paid.</p>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {o.editable && !edit && <button type="button" onClick={startEdit} className="ord-btn">Change order</button>}
          {canCancel && <button type="button" onClick={cancel} className="ord-btn-danger">Cancel order</button>}
        </div>

        {edit && (
          <form onSubmit={saveEdit} style={{ display: 'grid', gap: 10, maxWidth: 420, marginTop: 16 }}>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#6b7280' }}>Change the quantities above (0 removes an item). The order is priced again at today's prices and discounts.</p>
            <textarea aria-label="Delivery address" placeholder="Delivery address" value={edit.address} onChange={(e) => setEdit((x) => ({ ...x, address: e.target.value }))} style={{ padding: 9, borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface-input)', color: 'var(--text-primary)' }} />
            <input aria-label="Promo code" placeholder="Promo code (leave blank to keep the current one)" onChange={(e) => setEdit((x) => ({ ...x, promo: e.target.value.trim() === '' ? undefined : e.target.value.trim() }))} style={{ padding: 9, borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface-input)', color: 'var(--text-primary)' }} />
            {(o.credits ?? []).map((c) => (
              <label key={c.voucher_id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.8rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={edit.credit.includes(c.voucher_id)} onChange={() => setEdit((x) => ({ ...x, credit: x.credit.includes(c.voucher_id) ? x.credit.filter((i) => i !== c.voucher_id) : [...x.credit, c.voucher_id] }))} />
                <span>{creditSentence(c)} — use it on this order?</span>
              </label>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setEdit(null)} className="ord-btn ord-btn-sm">Keep as it was</button>
              <button type="submit" disabled={busy} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#6d28d9', color: 'white', fontWeight: 700 }}>{busy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        )}

        {review && (
          <form onSubmit={sendReview} style={{ display: 'grid', gap: 10, maxWidth: 420, marginTop: 16 }}>
            <textarea required aria-label="What should we look at?" placeholder="What should we look at?" value={review.note} onChange={(e) => setReview((x) => ({ ...x, note: e.target.value }))} style={{ padding: 9, borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface-input)', color: 'var(--text-primary)' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setReview(null)} className="ord-btn ord-btn-sm">Cancel</button>
              <button type="submit" disabled={busy} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#6d28d9', color: 'white', fontWeight: 700 }}>{busy ? 'Sending…' : 'Send request'}</button>
            </div>
          </form>
        )}

        {canPay && (
          <form onSubmit={startPay} style={{ display: 'grid', gap: 10, maxWidth: 420, marginTop: 16 }}>
            <p style={{ margin: 0, fontWeight: 800 }}>Pay {m(payAmount)}{dep && !pay.full ? (dep.stage === 'deposit' ? ' (the deposit)' : ' (the balance)') : ''}</p>
            {dep && dep.stage === 'deposit' && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.8rem' }}>
                <input type="checkbox" checked={!!pay.full} onChange={(e) => setPay((p) => ({ ...p, full: e.target.checked }))} /> Pay everything now instead ({m(dep.outstanding)})
              </label>
            )}
            <div role="radiogroup" aria-label="Payment method" style={{ display: 'grid', gap: 6 }}>
              {opts.payment_methods.map((mm) => {
                const on = String(pay.methodId || opts.payment_methods[0].id) === String(mm.id);
                return (
                  <label key={mm.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${on ? '#6d28d9' : '#e5e7eb'}`, background: on ? 'rgba(109,40,217,0.05)' : 'white', fontSize: '0.85rem', fontWeight: 600 }}>
                    <input type="radio" name="pay-method" checked={on} onChange={() => setPay((p) => ({ ...p, methodId: mm.id }))} />
                    {mm.name}
                  </label>
                );
              })}
            </div>
            <input required placeholder="M-Pesa number" value={pay.phone} onChange={(e) => setPay((p) => ({ ...p, phone: e.target.value }))} style={{ padding: 9, borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface-input)', color: 'var(--text-primary)' }} />
            {opts.gift_vouchers_enabled && <input placeholder="Gift voucher code (optional)" value={pay.gift} onChange={(e) => setPay((p) => ({ ...p, gift: e.target.value }))} style={{ padding: 9, borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface-input)', color: 'var(--text-primary)' }} />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={busy} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', background: '#6d28d9', color: 'white', fontWeight: 700 }}>{busy ? 'Sending…' : 'Send payment prompt'}</button>
            </div>
          </form>
        )}
      </main>
      <Footer />
    </>
  );
}
