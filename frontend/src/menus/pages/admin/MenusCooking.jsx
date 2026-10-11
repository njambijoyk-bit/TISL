import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CakeSlice, Plus, Trash2, UtensilsCrossed } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, NumberInput, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import { Pill } from '../../components/FoodChips';
import MenusNav from '../../components/MenusNav';

const money = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso) => new Date(iso).toLocaleString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
const TONE = { requested: 'warn', quoted: 'neutral', accepted: 'warn', confirmed: 'ok', preparing: 'ok', ready: 'ok', completed: 'neutral', declined: 'danger', expired: 'danger', cancelled: 'danger' };
const VERB = { preparing: 'Start preparing', ready: 'Ready', completed: 'Done' };
const HOW = { pickup: 'Collected', delivery: 'Delivered to', serve: 'Served at' };

function QuoteModal({ req, onClose, onDone }) {
  const [lines, setLines] = useState(req.lines.length ? req.lines.map((l) => ({ dish_id: l.dish_id, name: l.name, quantity: l.quantity, per_head: l.per_head, unit_price: l.unit_price, note: l.note ?? '' }))
    : [{ dish_id: null, name: '', quantity: 1, per_head: false, unit_price: '', note: '' }]);
  const [headcount, setHeadcount] = useState(req.headcount ?? '');
  const [deposit, setDeposit] = useState(req.deposit_pct || '');
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (i, patch) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const qty = (l) => (l.per_head ? Number(headcount) || 0 : Number(l.quantity) || 0);
  const sub = lines.reduce((t, l) => t + qty(l) * (Number(l.unit_price) || 0), 0);

  const send = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.quoteCooking(req.id, { lines: lines.map((l) => ({ dish_id: l.dish_id || undefined, name: l.name, quantity: l.per_head ? undefined : Number(l.quantity), per_head: l.per_head, unit_price: Number(l.unit_price), note: l.note || undefined })),
        headcount: headcount === '' ? undefined : Number(headcount), deposit_pct: deposit === '' ? undefined : Number(deposit), valid_days: days === '' ? undefined : Number(days) });
      toast.success(r.message); onDone();
    } catch (e) { toast.error(errMsg(e, 'Could not send the quote'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Quote · ${req.number}`} subtitle={`${req.kind_label} for ${req.name}, ${when(req.event_at)}`} onClose={onClose} width={720}
      footer={<ModalActions onCancel={onClose} onSubmit={send} submitLabel="Send the quote" busyLabel="Sending…" busy={busy} disabled={lines.some((l) => !l.name.trim() || l.unit_price === '')} />}>
      <FormStack>
        <div style={{ display: 'grid', gap: 8 }} data-testid="quote-lines">
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 70px auto 110px auto', gap: 8, alignItems: 'end' }}>
              <Field label={i === 0 ? 'What' : undefined} htmlFor={`ql-n-${i}`}><TextInput id={`ql-n-${i}`} maxLength={200} value={l.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Buffet lunch" aria-label="Line name" /></Field>
              <Field label={i === 0 ? 'How many' : undefined} htmlFor={`ql-q-${i}`}><NumberInput id={`ql-q-${i}`} min="0" step="any" value={l.per_head ? headcount : l.quantity} disabled={l.per_head} onChange={(e) => set(i, { quantity: e.target.value })} aria-label="Quantity" /></Field>
              <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '0.78rem', paddingBottom: 8 }}><input type="checkbox" checked={l.per_head} onChange={(e) => set(i, { per_head: e.target.checked })} /> per head</label>
              <Field label={i === 0 ? 'Price each' : undefined} htmlFor={`ql-p-${i}`}><NumberInput id={`ql-p-${i}`} min="0" step="any" value={l.unit_price} onChange={(e) => set(i, { unit_price: e.target.value })} aria-label="Price each" /></Field>
              <button type="button" style={{ ...btnGhost, padding: 8, marginBottom: 4 }} aria-label="Remove this line" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} disabled={lines.length === 1}><Trash2 size={14} /></button>
            </div>
          ))}
          <div><button type="button" style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setLines((ls) => [...ls, { dish_id: null, name: '', quantity: 1, per_head: false, unit_price: '', note: '' }])}><Plus size={13} aria-hidden="true" /> Add a line</button></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <Field label="People" htmlFor="q-hc" hint="Per-head lines follow this."><NumberInput id="q-hc" min="1" max="5000" value={headcount} onChange={(e) => setHeadcount(e.target.value)} /></Field>
          <Field label="Deposit (%)" htmlFor="q-dep" hint="Empty: the setting."><NumberInput id="q-dep" min="0" max="100" step="any" value={deposit} onChange={(e) => setDeposit(e.target.value)} /></Field>
          <Field label="Open for (days)" htmlFor="q-days" hint="Empty: the setting."><NumberInput id="q-days" min="1" max="90" value={days} onChange={(e) => setDays(e.target.value)} /></Field>
        </div>
        <p style={{ margin: 0, fontSize: '0.86rem' }} data-testid="quote-subtotal">Before tax: <strong>{money(sub)}</strong> (tax is added by the books from the sales account)</p>
      </FormStack>
    </Modal>
  );
}

/** Menus → Cakes & catering: what customers asked for, the quotes, the deposits and the jobs. */
export default function MenusCooking() {
  const user = useAuthStore((s) => s.user);
  const canAct = canWriteFinance(user);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('');
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(null);
  const [quoting, setQuoting] = useState(null);
  const [paying, setPaying] = useState(null);
  const [method, setMethod] = useState('');
  const [amount, setAmount] = useState('');

  const load = useCallback(() => menusAPI.cooking({ ...(status ? { status } : {}), ...(all ? { all: 1 } : {}) }).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the requests'))), [status, all]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const move = async (r, to) => {
    let reason;
    if (['cancelled', 'declined'].includes(to)) {
      reason = window.prompt(`${to === 'declined' ? 'Turn down' : 'Cancel'} ${r.number}? Say why (the customer is told):`, '');
      if (reason === null) return;
    }
    setBusy(`${r.id}:${to}`);
    try { await menusAPI.setCookingStatus(r.id, to, reason || undefined); await load(); } catch (e) { toast.error(errMsg(e, 'Could not change it'), { duration: 8000 }); } finally { setBusy(null); }
  };
  const take = async () => {
    setBusy(`${paying.id}:pay`);
    try {
      await menusAPI.payCooking(paying.id, [{ payment_method_id: Number(method), amount: Number(amount) }]);
      toast.success('Payment recorded.'); setPaying(null); await load();
    } catch (e) { toast.error(errMsg(e, 'Could not record the payment'), { duration: 8000 }); } finally { setBusy(null); }
  };

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="cakes and catering" /></div></AdminLayout>;

  const rows = data?.requests ?? [];

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1180, margin: '0 auto' }} data-testid="menus-cooking">
        <MenusNav />
        <HubHeader title="Cakes & catering" description="Requests for made-to-order cakes and catering: price them, take the deposit, make them. This page refreshes by itself." />
        {data && data.ready === false && <p role="status" style={{ ...card, padding: 14, fontSize: '0.85rem' }}>Run database script 143_menus_cooking.sql first.</p>}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 14px', fontSize: '0.82rem', color: colors.textMuted }}>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>Show
            <SelectInput aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}>
              <option value="">Jobs still going</option>
              {data && Object.entries(data.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </SelectInput>
          </label>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Include the finished (last 60 days)</label>
        </div>
        {!data ? <p style={{ color: colors.textMuted, fontSize: '0.82rem' }}>Loading…</p> : rows.length === 0 ? <p style={{ color: colors.textFaint, fontSize: '0.85rem' }}>Nothing here.</p> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14, alignItems: 'start' }}>
            {rows.map((r) => {
              const Icon = r.kind === 'cake' ? CakeSlice : UtensilsCrossed;

              return (
                <article key={r.id} data-request={r.number} style={{ ...card, padding: 14, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: '0.95rem', display: 'inline-flex', gap: 6, alignItems: 'center' }}><Icon size={15} aria-hidden="true" /> {r.number}</strong>
                    <Pill tone={TONE[r.status] ?? 'neutral'}>{r.status_label}</Pill>
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{when(r.event_at)}{r.headcount ? ` · ${r.headcount} people` : ''}</div>
                  <div style={{ fontSize: '0.84rem' }}>{r.name} · <a href={`tel:${r.phone}`}>{r.phone}</a></div>
                  <div style={{ fontSize: '0.8rem', color: colors.textMuted }}>{HOW[r.fulfil]}{r.address ? `: ${r.address}` : ''}</div>
                  {r.message && <p style={{ margin: 0, fontSize: '0.85rem' }}>On the cake: “{r.message}”</p>}
                  {r.wishes && <p style={{ margin: 0, fontSize: '0.85rem' }}>{r.wishes}</p>}
                  {r.notes && <p style={{ margin: 0, fontSize: '0.8rem', color: '#b45309' }}>Note: {r.notes}</p>}
                  {r.lines.length > 0 && (
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '0.86rem', display: 'grid', gap: 2 }}>
                      {r.lines.map((l) => <li key={l.id}><strong>{l.quantity} ×</strong> {l.name}{l.options.length > 0 && <em style={{ color: colors.textMuted }}> — {l.options.join(', ')}</em>} <span style={{ color: colors.textMuted }}>@ {money(l.unit_price)}</span></li>)}
                    </ul>
                  )}
                  {r.total > 0 && (
                    <div style={{ fontSize: '0.84rem' }}>
                      Total <strong>{money(r.total)}</strong> · deposit {money(r.deposit_amount)} · paid {money(r.paid_total)}{r.balance > 0 && <> · <strong>to pay {money(r.balance)}</strong></>}
                    </div>
                  )}
                  {r.cancel_reason && <p style={{ margin: 0, fontSize: '0.8rem', color: '#b91c1c' }}>{r.cancel_reason}</p>}
                  {r.refund_due && <div><Pill tone="danger">Deposit to give back</Pill></div>}
                  {r.stock && r.stock !== 'taken' && <p role="status" style={{ margin: 0, fontSize: '0.8rem', color: '#b45309' }}>{r.stock}</p>}
                  {canAct && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {r.can_quote && <button type="button" style={{ ...btnPrimary, padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => setQuoting(r)}>{r.status === 'quoted' ? 'Change the quote' : 'Make the quote'}</button>}
                      {r.can_take_payment && <button type="button" style={{ ...btnPrimary, padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => { setPaying(r); setAmount(String(r.status === 'accepted' ? Math.max(0, r.deposit_amount - r.paid_total) : r.balance)); setMethod(String(data.payment_methods.find((m) => m.kind === 'cash')?.id ?? data.payment_methods[0]?.id ?? '')); }}>Take payment</button>}
                      {r.next.map((to) => <button key={to} type="button" disabled={busy === `${r.id}:${to}`} onClick={() => move(r, to)} style={{ ...btnPrimary, padding: '6px 12px', fontSize: '0.78rem' }}>{VERB[to] ?? to}</button>)}
                      {['requested', 'quoted'].includes(r.status) && <button type="button" onClick={() => move(r, 'declined')} style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.78rem', color: '#b91c1c' }}>Turn down</button>}
                      {['accepted', 'confirmed', 'preparing'].includes(r.status) && <button type="button" onClick={() => move(r, 'cancelled')} style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.78rem', color: '#b91c1c' }}>Cancel</button>}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
      {quoting && <QuoteModal req={quoting} onClose={() => setQuoting(null)} onDone={() => { setQuoting(null); load(); }} />}
      {paying && (
        <Modal title={`Take payment · ${paying.number}`} subtitle={`${money(paying.balance)} still to pay`} onClose={() => setPaying(null)}
          footer={<ModalActions onCancel={() => setPaying(null)} onSubmit={take} submitLabel="Record payment" busyLabel="Recording…" busy={Boolean(busy)} disabled={!method || !(Number(amount) > 0)} />}>
          <FormStack>
            <Field label="Paid by" htmlFor="mc-method"><SelectInput id="mc-method" value={method} onChange={(e) => setMethod(e.target.value)}>{data.payment_methods.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</SelectInput></Field>
            <Field label="Amount received" htmlFor="mc-amount"><NumberInput id="mc-amount" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          </FormStack>
        </Modal>
      )}
    </AdminLayout>
  );
}
