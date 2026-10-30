import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import booksAPI from '../../../_shared/api/books';
import { eventsAdAPI, eventsBookingAPI, eventsPlanAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import Modal from '../../../core/components/admin/ui/Modal';
import SimpleTable from '../../../core/components/admin/ui/SimpleTable';
import { CheckboxRow, Field, FormGrid, FormStack, ModalActions, NumberInput, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import { btnGhost, btnPrimary, colors } from '../../../_shared/theme/tokens';

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' };
const money = (n) => Number(n || 0).toLocaleString();

// ── planning templates ───────────────────────────────────────────────────

const lines = (s) => s.split('\n').map((x) => x.split('|').map((p) => p.trim())).filter((p) => p[0]);
const toText = (b) => ({
  tasks: (b.tasks ?? []).map((t) => [t.title, t.department ?? '', t.priority ?? 'normal', t.offset_days ?? ''].join(' | ')).join('\n'),
  milestones: (b.milestones ?? []).map((t) => [t.title, t.offset_days ?? ''].join(' | ')).join('\n'),
  budget: (b.budget ?? []).map((t) => [t.category, t.item].join(' | ')).join('\n'),
  programme: (b.programme ?? []).map((t) => [t.starts_at ?? '', t.title].join(' | ')).join('\n'),
  team: (b.team ?? []).map((t) => t.role).join('\n'),
});
const toBody = (t) => ({
  tasks: lines(t.tasks).map(([title, department, priority, off]) => ({ title, department: department || null, priority: priority || 'normal', offset_days: off === '' || off == null ? null : Number(off) })),
  milestones: lines(t.milestones).map(([title, off]) => ({ title, offset_days: off === '' || off == null ? null : Number(off) })),
  budget: lines(t.budget).map(([category, item]) => ({ category, item: item || category })),
  programme: lines(t.programme).map(([starts_at, title]) => ({ starts_at: title ? starts_at : null, title: title || starts_at })),
  team: lines(t.team).map(([role]) => ({ role })),
});

/** Event templates: the checklist, milestones, budget lines, running order and team roles a kind of event starts with. Days are counted from the event day (-30 is a month before). */
export function Templates() {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => eventsPlanAPI.adminTemplates().then(setRows).catch((e) => toast.error(errMsg(e, 'Could not load the templates'))), []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    try { await eventsPlanAPI.saveTemplate(edit.id, { name: edit.name, description: edit.description || null, body: toBody(edit), is_active: edit.is_active }); toast.success('Saved'); setEdit(null); load(); }
    catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const columns = [
    { key: 'name', label: 'Template', render: (t) => <span><strong>{t.name}</strong>{!t.is_active && <em style={{ color: colors.textFaint }}> · off</em>}</span> },
    { key: 'counts', label: 'Holds', render: (t) => `${t.counts.tasks} tasks · ${t.counts.milestones} milestones · ${t.counts.budget} budget lines · ${t.counts.programme} programme items` },
    { key: '_', label: '', align: 'right', render: (t) => (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <button type="button" style={small} aria-label="Edit" onClick={() => setEdit({ id: t.id, name: t.name, description: t.description ?? '', is_active: t.is_active, ...toText(t.body) })}><Pencil size={12} /></button>
        <button type="button" style={{ ...small, color: colors.danger }} aria-label="Delete" onClick={() => eventsPlanAPI.removeTemplate(t.id).then(load)}><Trash2 size={12} /></button>
      </span>) },
  ];
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button type="button" style={btnPrimary} onClick={() => setEdit({ id: null, name: '', description: '', is_active: true, tasks: '', milestones: '', budget: '', programme: '', team: '' })}><Plus size={14} /> New template</button>
        <button type="button" style={btnGhost} onClick={() => eventsPlanAPI.standardTemplates().then((r) => { toast.success(r.made ? `${r.made} added` : 'Already there'); setRows(r.data); })}><Sparkles size={14} /> Add wedding, conference and birthday</button>
      </div>
      <SimpleTable columns={columns} rows={rows} empty="No templates yet. Add the standard ones to start from." />
      {edit && (
        <Modal title={edit.id ? 'Edit template' : 'New template'} width={720} onClose={() => setEdit(null)} footer={<ModalActions onCancel={() => setEdit(null)} onSubmit={save} busy={busy} disabled={!edit.name.trim()} submitLabel="Save" busyLabel="Saving…" />}>
          <FormStack>
            <FormGrid min={240}>
              <Field label="Name" htmlFor="tp-n"><TextInput id="tp-n" maxLength={120} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
              <Field label="About" htmlFor="tp-d"><TextInput id="tp-d" maxLength={300} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            </FormGrid>
            {[['tasks', 'Tasks: title | department | priority | days from the event (-30)'], ['milestones', 'Milestones: title | days from the event'], ['budget', 'Budget lines: category | what for'], ['programme', 'Running order: time (10:00) | what happens'], ['team', 'Team roles: one a line']].map(([k, l]) => (
              <Field key={k} label={l} htmlFor={`tp-${k}`}><TextArea id={`tp-${k}`} rows={k === 'tasks' ? 7 : 4} value={edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></Field>
            ))}
            <CheckboxRow checked={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} label="In use" />
          </FormStack>
        </Modal>
      )}
    </div>
  );
}

// ── advertising ──────────────────────────────────────────────────────────

/** Promotion products the company sells, and the campaigns people asked for: approve them, invoice them in Books, see what they earned. */
export function Advertising() {
  const [products, setProducts] = useState([]);
  const [kinds, setKinds] = useState({});
  const [camps, setCamps] = useState([]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    eventsAdAPI.adminProducts().then((r) => { setProducts(r.data); setKinds(r.kinds); }).catch((e) => toast.error(errMsg(e, 'Could not load the products')));
    eventsAdAPI.campaigns().then(setCamps).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, ok) => { try { const r = await fn(); toast.success(r?.message ?? ok); load(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 9000 }); } };
  const save = async () => {
    setBusy(true);
    try { await eventsAdAPI.saveProduct(edit.id, { ...edit, price: Number(edit.price), duration_days: Number(edit.duration_days), max_slots: Number(edit.max_slots) }); toast.success('Saved'); setEdit(null); load(); }
    catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const pcols = [
    { key: 'name', label: 'Product', render: (p) => <span><strong>{p.name}</strong>{!p.is_active && <em style={{ color: colors.textFaint }}> · off</em>}</span> },
    { key: 'kind_name', label: 'Kind' }, { key: 'price', label: 'Price', align: 'right', render: (p) => money(p.price) }, { key: 'duration_days', label: 'Days', align: 'right' },
    { key: 'running', label: 'Places', align: 'right', render: (p) => `${p.running} of ${p.max_slots} taken` },
    { key: '_', label: '', align: 'right', render: (p) => (<span style={{ display: 'inline-flex', gap: 6 }}><button type="button" style={small} aria-label="Edit" onClick={() => setEdit({ ...p })}><Pencil size={12} /></button><button type="button" style={{ ...small, color: colors.danger }} aria-label="Remove" onClick={() => act(() => eventsAdAPI.removeProduct(p.id), 'Removed')}><Trash2 size={12} /></button></span>) },
  ];
  const ccols = [
    { key: 'event', label: 'Event', render: (c) => <span><strong>{c.event}</strong><span style={{ display: 'block', fontSize: '0.72rem', color: colors.textFaint }}>{c.product}</span></span> },
    { key: 'starts_on', label: 'Runs', render: (c) => `${c.starts_on} to ${c.ends_on}` },
    { key: 'status', label: 'Status', render: (c) => <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{c.live ? 'Running' : c.status}</span> },
    { key: 'amount', label: 'Price', align: 'right', render: (c) => money(c.amount) },
    { key: 'results', label: 'Seen / clicks / tickets', align: 'right', render: (c) => `${c.impressions} / ${c.clicks} / ${c.registrations}` },
    { key: '_', label: '', align: 'right', render: (c) => (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        {c.status === 'pending' && <><button type="button" style={small} onClick={() => act(() => eventsAdAPI.decide(c.id, true), 'Approved')}><Check size={12} /> Approve</button><button type="button" style={{ ...small, color: colors.danger }} onClick={() => act(() => eventsAdAPI.decide(c.id, false, window.prompt('Why?') || undefined), 'Declined')}>Decline</button></>}
        {c.status === 'approved' && !c.invoice_id && <button type="button" style={small} onClick={() => act(() => eventsAdAPI.invoice(c.id), 'Invoiced')}>Invoice</button>}
        {c.invoice_id && <span style={{ fontSize: '0.72rem', color: colors.textFaint }}>invoiced</span>}
      </span>) },
  ];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button type="button" style={btnPrimary} onClick={() => setEdit({ id: null, name: '', kind: 'featured', description: '', price: '', duration_days: 7, max_slots: 5, is_active: true })}><Plus size={14} /> New product</button>
          <button type="button" style={btnGhost} onClick={() => act(() => eventsAdAPI.standardProducts(), 'Added')}><Sparkles size={14} /> Add the standard set</button>
        </div>
        <SimpleTable columns={pcols} rows={products} empty="Nothing for sale yet. Add the standard set and set your own prices." />
      </div>
      <div>
        <h3 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>Campaigns</h3>
        <SimpleTable columns={ccols} rows={camps} empty="No one has asked for a promotion yet." />
      </div>
      {edit && (
        <Modal title={edit.id ? 'Edit product' : 'New product'} width={520} onClose={() => setEdit(null)} footer={<ModalActions onCancel={() => setEdit(null)} onSubmit={save} busy={busy} disabled={!edit.name.trim()} submitLabel="Save" busyLabel="Saving…" />}>
          <FormStack>
            <Field label="Name" htmlFor="ad-n"><TextInput id="ad-n" maxLength={120} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <FormGrid min={150}>
              <Field label="Kind" htmlFor="ad-k"><SelectInput id="ad-k" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
              <Field label="Price" htmlFor="ad-p"><NumberInput id="ad-p" min={0} value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} /></Field>
              <Field label="Days" htmlFor="ad-d"><NumberInput id="ad-d" min={1} value={edit.duration_days} onChange={(e) => setEdit({ ...edit, duration_days: e.target.value })} /></Field>
              <Field label="Places at once" htmlFor="ad-s"><NumberInput id="ad-s" min={1} value={edit.max_slots} onChange={(e) => setEdit({ ...edit, max_slots: e.target.value })} /></Field>
            </FormGrid>
            <Field label="Description" htmlFor="ad-x"><TextInput id="ad-x" maxLength={300} value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <CheckboxRow checked={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} label="On sale" />
          </FormStack>
        </Modal>
      )}
    </div>
  );
}

// ── bookings of vendors and venues ───────────────────────────────────────

/** Booking money: payments the planners made to TISL, refunds, and paying vendors and venues out once their jobs are done. */
export function BookingMoney() {
  const [data, setData] = useState({ data: [], balances: [] });
  const [status, setStatus] = useState('');
  const [banks, setBanks] = useState([]);
  const [pay, setPay] = useState(null);   // {kind: 'payment'|'refund'|'payout', booking?|provider?}
  const [f, setF] = useState({ amount: '', ledger: '', ref: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => eventsBookingAPI.adminList(status).then(setData).catch((e) => { if (e?.response?.status !== 409) toast.error(errMsg(e, 'Could not load the bookings')); }), [status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { booksAPI.ledgers({ all: 1 }).then((r) => setBanks((Array.isArray(r) ? r : r.data ?? []).filter((l) => l.is_active && /cash|bank/i.test(l.group?.name ?? '')))).catch(() => {}); }, []);

  const go = async () => {
    setBusy(true);
    try {
      const a = Number(f.amount); const l = Number(f.ledger);
      if (pay.kind === 'payment') await eventsBookingAPI.payment(pay.booking.id, { amount: a, received_ledger_id: l, reference: f.ref || undefined });
      else if (pay.kind === 'refund') await eventsBookingAPI.refund(pay.booking.id, { amount: a, paid_from_ledger_id: l, reference: f.ref || undefined });
      else await eventsBookingAPI.payout(pay.provider.provider_type === 'vendor' ? 'vendors' : 'venues', pay.provider.provider_id, { amount: a, from_ledger_id: l, reference: f.ref || undefined });
      toast.success('Recorded'); setPay(null); load();
    } catch (e) { toast.error(errMsg(e, 'Could not record it'), { duration: 9000 }); } finally { setBusy(false); }
  };
  const start = (kind, extra, amount) => { setPay({ kind, ...extra }); setF({ amount: String(amount ?? ''), ledger: '', ref: '' }); };

  const bcols = [
    { key: 'reference', label: 'Booking', render: (b) => <span><strong>{b.provider}</strong><span style={{ display: 'block', fontSize: '0.72rem', color: colors.textFaint }}>{b.reference} · {b.event} · {b.starts_on}</span></span> },
    { key: 'status', label: 'Status', render: (b) => <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{b.status}</span> },
    { key: 'quoted_amount', label: 'Quote', align: 'right', render: (b) => (b.quoted_amount == null ? '—' : money(b.quoted_amount)) },
    { key: 'paid', label: 'Paid to TISL', align: 'right', render: (b) => money(b.paid) },
    { key: '_', label: '', align: 'right', render: (b) => (
      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {['accepted', 'confirmed', 'delivered'].includes(b.status) && b.balance_due > 0 && <button type="button" style={small} onClick={() => start('payment', { booking: b }, b.status === 'accepted' ? b.deposit_amount : b.balance_due)}>Record payment</button>}
        {['delivered', 'confirmed'].includes(b.status) && b.balance_due === 0 && <button type="button" style={small} onClick={() => eventsBookingAPI.adminComplete(b.id).then(() => { toast.success('Completed'); load(); }).catch((e) => toast.error(errMsg(e, 'Could not complete it')))}>Mark complete</button>}
        {b.paid > 0 && ['cancelled', 'declined'].includes(b.status) && <button type="button" style={small} onClick={() => start('refund', { booking: b }, b.paid)}>Refund</button>}
      </span>) },
  ];
  const pcols = [
    { key: 'provider', label: 'Vendor / venue', render: (p) => `${p.provider} (${p.provider_type})` },
    { key: 'held', label: 'Held for them', align: 'right', render: (p) => money(p.held) },
    { key: 'not_yet_due', label: 'Jobs not done', align: 'right', render: (p) => money(p.not_yet_due) },
    { key: 'payable', label: 'Payable now', align: 'right', render: (p) => <strong>{money(p.payable)}</strong> },
    { key: '_', label: '', align: 'right', render: (p) => <button type="button" style={small} disabled={p.payable <= 0} onClick={() => start('payout', { provider: p }, p.payable)}>Pay out</button> },
  ];

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h3 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>Owed to vendors and venues</h3>
        <SimpleTable columns={pcols} rows={data.balances} empty="Nothing is held for anyone yet." />
      </div>
      <div>
        <div style={{ marginBottom: 8 }}><SelectInput value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" style={{ width: 'auto' }}><option value="">All bookings</option>{['enquiry', 'quoted', 'accepted', 'confirmed', 'delivered', 'completed', 'declined', 'cancelled'].map((s) => <option key={s} value={s}>{s}</option>)}</SelectInput></div>
        <SimpleTable columns={bcols} rows={data.data} empty="No bookings yet." />
      </div>
      {pay && (
        <Modal title={pay.kind === 'payment' ? 'Record a payment' : pay.kind === 'refund' ? 'Refund to the planner' : `Pay out ${pay.provider.provider}`} width={440} onClose={() => setPay(null)}
          footer={<ModalActions onCancel={() => setPay(null)} onSubmit={go} busy={busy} disabled={!f.ledger || !(Number(f.amount) > 0)} submitLabel="Record" busyLabel="Recording…" />}>
          <FormStack>
            <Field label="Amount" htmlFor="bm-a"><NumberInput id="bm-a" min={0} step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label={pay.kind === 'payment' ? 'Received into' : 'Paid from'} htmlFor="bm-l" hint="The bank, till or M-Pesa account."><SelectInput id="bm-l" value={f.ledger} onChange={(e) => setF({ ...f, ledger: e.target.value })}><option value="">Choose…</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>
            <Field label="Reference" htmlFor="bm-r"><TextInput id="bm-r" maxLength={120} value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>
          </FormStack>
        </Modal>
      )}
    </div>
  );
}
