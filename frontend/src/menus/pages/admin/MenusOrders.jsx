import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Bike, ShoppingBag } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import { Pill } from '../../components/FoodChips';
import MenusNav from '../../components/MenusNav';

const money = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hhmm = (iso) => new Date(iso).toLocaleString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const VERB = { accepted: 'Accept', preparing: 'Start preparing', ready: 'Ready', out: 'Out for delivery', completed: 'Done', cancelled: 'Cancel' };
const COLUMNS = [
  { title: 'New', keys: ['placed', 'accepted'], color: '#ef4444' },
  { title: 'Preparing', keys: ['preparing'], color: '#f59e0b' },
  { title: 'Ready / on the way', keys: ['ready', 'out'], color: '#22c55e' },
];
const payTone = { open: ['warn', 'Tab open'], paid: ['ok', 'Paid'], later: ['warn', 'Pays on arrival'], pending: ['warn', 'Waiting for payment'], failed: ['danger', 'Payment failed'] };

/** Menus → Orders: the board for online orders. New ones come in on the left; the kitchen moves each along; an order paid at the door is settled with its payment. */
export default function MenusOrders() {
  const user = useAuthStore((s) => s.user);
  const canAct = canManageMenus(user);
  const [data, setData] = useState(null);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(null);
  const [paying, setPaying] = useState(null);
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');

  const load = useCallback(() => menusAPI.orders(all ? { all: 1 } : undefined).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the orders'))), [all]);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const move = async (o, to) => {
    let reason;
    if (to === 'cancelled') {
      reason = window.prompt(`Cancel ${o.number}? Say why (the customer is told):`, '');
      if (reason === null) return;
    }
    setBusy(`${o.id}:${to}`);
    try { await menusAPI.setOrderStatus(o.id, to, reason || undefined); await load(); } catch (e) { toast.error(errMsg(e, 'Could not change the order'), { duration: 8000 }); } finally { setBusy(null); }
  };
  const take = async () => {
    setBusy(`${paying.id}:pay`);
    try {
      await menusAPI.payOrder(paying.id, [{ payment_method_id: Number(method), amount: paying.total, reference: reference || undefined }]);
      toast.success('Payment taken. The order is complete.'); setPaying(null); setReference(''); await load();
    } catch (e) { toast.error(errMsg(e, 'Could not take the payment'), { duration: 8000 }); } finally { setBusy(null); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the food orders" /></div></AdminLayout>;

  const orders = data?.orders ?? [];
  const finished = orders.filter((o) => ['completed', 'cancelled'].includes(o.status));

  const Card = ({ o }) => {
    const [tone, text] = payTone[o.payment] ?? ['neutral', o.payment];
    const Icon = o.order_type === 'delivery' ? Bike : ShoppingBag;

    return (
      <article data-order={o.number} style={{ ...card, padding: 14, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
          <strong style={{ fontSize: '0.95rem' }}>{o.number}</strong>
          <span style={{ fontSize: '0.78rem', color: colors.textMuted, display: 'inline-flex', gap: 4, alignItems: 'center' }}><Icon size={13} aria-hidden="true" /> {o.asap ? 'ASAP · ' : ''}{hhmm(o.fulfil_at)}</span>
        </div>
        <div style={{ fontSize: '0.84rem' }}>{o.name} · <a href={`tel:${o.phone}`}>{o.phone}</a></div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '0.88rem', display: 'grid', gap: 2 }}>
          {o.lines.map((l, i) => <li key={i}><strong>{l.quantity} ×</strong> {l.name}{l.options.length > 0 && <em style={{ color: colors.textMuted }}> — {l.options.join(', ')}</em>}{l.note && <em style={{ color: '#b45309' }}> — “{l.note}”</em>}</li>)}
        </ul>
        {o.notes && <p style={{ margin: 0, fontSize: '0.8rem', color: '#b45309' }}>Note: {o.notes}</p>}
        {o.delivery_address && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>To: {o.delivery_address}</p>}
        <div><Pill tone={tone}>{text}</Pill> <span style={{ fontWeight: 800, fontSize: '0.88rem' }}>{money(o.total)}</span> {o.refund_due && <Pill tone="danger">Refund due</Pill>}</div>
        {canAct && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {o.needs_payment && <button type="button" style={{ ...btnPrimary, padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => { setPaying(o); setMethod(String(data.payment_methods.find((m) => m.kind === 'cash')?.id ?? data.payment_methods[0]?.id ?? '')); }}>Take payment</button>}
            {o.next.map((to) => <button key={to} type="button" disabled={busy === `${o.id}:${to}`} onClick={() => move(o, to)} style={{ ...(to === 'cancelled' ? btnGhost : btnPrimary), padding: '6px 12px', fontSize: '0.78rem', ...(to === 'cancelled' ? { color: '#b91c1c' } : {}) }}>{VERB[to]}</button>)}
          </div>
        )}
      </article>
    );
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1180, margin: '0 auto' }} data-testid="menus-orders">
        <MenusNav />
        <HubHeader title="Orders" description="Online pickup and delivery orders. This page refreshes by itself." />
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', margin: '0 0 14px', fontSize: '0.82rem', color: colors.textMuted }}>
          {data && data.waiting_for_payment > 0 && <Pill tone="warn">{data.waiting_for_payment} waiting for payment</Pill>}
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show finished orders (last 3 days)</label>
        </div>
        {!data ? <p style={{ color: colors.textMuted, fontSize: '0.82rem' }}>Loading…</p> : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14, alignItems: 'start' }}>
              {COLUMNS.map((c) => {
                const mine = orders.filter((o) => c.keys.includes(o.status));

                return (
                  <section key={c.title} aria-label={c.title} style={{ display: 'grid', gap: 10 }}>
                    <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: c.color }}>{c.title} · {mine.length}</h2>
                    {mine.length === 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textFaint }}>Nothing here.</p>}
                    {mine.map((o) => <Card key={o.id} o={o} />)}
                  </section>
                );
              })}
            </div>
            {all && finished.length > 0 && (
              <section aria-label="Finished" style={{ marginTop: 26, display: 'grid', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Finished · {finished.length}</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>{finished.map((o) => <Card key={o.id} o={o} />)}</div>
              </section>
            )}
          </>
        )}
      </div>
      {paying && (
        <Modal title={`Take payment · ${paying.number}`} subtitle={`${money(paying.total)} to collect`} onClose={() => setPaying(null)}
          footer={<ModalActions onCancel={() => setPaying(null)} onSubmit={take} submitLabel="Take payment" busyLabel="Taking…" busy={Boolean(busy)} disabled={!method} />}>
          <FormStack>
            <Field label="Paid by" htmlFor="mo-method"><SelectInput id="mo-method" value={method} onChange={(e) => setMethod(e.target.value)}>{data.payment_methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</SelectInput></Field>
            <Field label="Reference (optional)" htmlFor="mo-ref"><TextInput id="mo-ref" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} /></Field>
          </FormStack>
        </Modal>
      )}
    </AdminLayout>
  );
}
