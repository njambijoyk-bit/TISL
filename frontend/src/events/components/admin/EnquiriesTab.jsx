import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { eventsEnquiryAdminAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import Modal from '../../../core/components/admin/ui/Modal';
import SimpleTable from '../../../core/components/admin/ui/SimpleTable';
import { Field, FormGrid, FormStack, ModalActions, NumberInput, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import { btnGhost, btnPrimary, colors } from '../../../_shared/theme/tokens';

const STATUS = [['new', 'New'], ['consulting', 'Consulting'], ['quoted', 'Quoted'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['closed', 'Closed']];
const money = (n) => (n == null ? '—' : Number(n).toLocaleString());

/** Events → Enquiries (events.admin): customers who asked TISL to plan an event, taken through consultation, quotation, sales order, invoice and the event project. */
export default function EnquiriesTab() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => { setLoading(true); return eventsEnquiryAdminAPI.list(status).then(setRows).catch((e) => toast.error(errMsg(e, 'Could not load the enquiries'))).finally(() => setLoading(false)); }, [status]);
  useEffect(() => { load(); }, [load]);

  const columns = [
    { key: 'name', label: 'Customer', render: (r) => <button type="button" onClick={() => setOpen(r.id)} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', fontWeight: 700, color: colors.primary, cursor: 'pointer', textAlign: 'left' }}>{r.name}<span style={{ display: 'block', fontWeight: 400, fontSize: '0.72rem', color: colors.textFaint }}>{r.reference}</span></button> },
    { key: 'event_type', label: 'Event', render: (r) => `${r.event_type}${r.event_date ? ` · ${r.event_date}` : ''}${r.guests ? ` · ${r.guests} guests` : ''}` },
    { key: 'budget', label: 'Budget', render: (r) => (r.budget_min || r.budget_max ? `${money(r.budget_min)} – ${money(r.budget_max)}` : '—') },
    { key: 'status', label: 'Status', render: (r) => <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{r.status}</span> },
    { key: 'docs', label: 'In Books', render: (r) => [r.quotation && `Q ${r.quotation.voucher_number}`, r.order && `SO ${r.order.voucher_number}`, r.invoice && `INV ${r.invoice.voucher_number}`].filter(Boolean).join(' · ') || '—' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <SelectInput value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" style={{ width: 'auto' }}><option value="">Any status</option>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput>
      </div>
      <SimpleTable columns={columns} rows={rows} loading={loading} empty="No planning requests yet. Customers send them from “Plan my event”." />
      {open && <EnquiryModal id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  );
}

function EnquiryModal({ id, onClose, onChanged }) {
  const [r, setR] = useState(null);
  const [lines, setLines] = useState([{ description: '', quantity: 1, rate: '' }]);
  const [notes, setNotes] = useState('');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => eventsEnquiryAdminAPI.list().then((all) => { const x = all.find((e) => e.id === id); setR(x); setNotes(x?.admin_notes ?? ''); setWhen((x?.consultation_at ?? '').replace(' ', 'T').slice(0, 16)); }), [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, ok) => { setBusy(true); try { const res = await fn(); toast.success(res?.message ?? ok); await load(); onChanged(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 9000 }); } finally { setBusy(false); } };
  if (!r) return null;
  const total = lines.reduce((n, l) => n + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
  const setLine = (i, k, v) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const line = (label, v) => (v ? <p style={{ margin: '0 0 4px', fontSize: '0.84rem' }}><span style={{ color: colors.textFaint }}>{label}: </span>{v}</p> : null);

  return (
    <Modal title={`${r.event_type} for ${r.name}`} subtitle={r.reference} width={700} onClose={onClose}>
      <FormStack gap={16}>
        <div>
          {line('Email', r.email)}{line('Phone', r.phone)}{line('When', r.event_date)}{line('Guests', r.guests)}{line('Where', r.location)}
          {line('Budget', r.budget_min || r.budget_max ? `${money(r.budget_min)} – ${money(r.budget_max)}` : null)}{line('Asked for a talk at', r.consultation_at)}{line('Notes', r.notes)}
        </div>
        <FormGrid min={200}>
          <Field label="Status" htmlFor="eq-st"><SelectInput id="eq-st" value={r.status} onChange={(e) => act(() => eventsEnquiryAdminAPI.update(id, { status: e.target.value }), 'Saved')}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>
          <Field label="Consultation" htmlFor="eq-w" hint="When you talk it through."><div style={{ display: 'flex', gap: 6 }}><TextInput id="eq-w" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /><button type="button" style={btnGhost} onClick={() => act(() => eventsEnquiryAdminAPI.update(id, { consultation_at: when || null, status: r.status === 'new' ? 'consulting' : undefined }), 'Saved')}>Save</button></div></Field>
        </FormGrid>
        <Field label="Notes for the team" htmlFor="eq-n"><div style={{ display: 'grid', gap: 6 }}><TextArea id="eq-n" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /><div><button type="button" style={btnGhost} onClick={() => act(() => eventsEnquiryAdminAPI.update(id, { admin_notes: notes }), 'Saved')}>Save notes</button></div></div></Field>

        {!r.quotation && ['new', 'consulting', 'quoted'].includes(r.status) && (
          <div style={{ display: 'grid', gap: 8 }}>
            <strong style={{ fontSize: '0.86rem' }}>Make a quotation</strong>
            {!r.customer_id && <p role="status" style={{ margin: 0, fontSize: '0.8rem', color: colors.warningText }}>This person has no customer account yet, so a quotation cannot be made for them.</p>}
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 120px', gap: 6 }}>
                <TextInput value={l.description} onChange={(e) => setLine(i, 'description', e.target.value)} placeholder="Planning fee, decor, coordination…" aria-label="Description" />
                <NumberInput min="0" value={l.quantity} onChange={(e) => setLine(i, 'quantity', e.target.value)} aria-label="Quantity" />
                <NumberInput min="0" value={l.rate} onChange={(e) => setLine(i, 'rate', e.target.value)} placeholder="Price" aria-label="Price" />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" style={btnGhost} onClick={() => setLines((ls) => [...ls, { description: '', quantity: 1, rate: '' }])}>Add a line</button>
              <span style={{ marginLeft: 'auto', fontWeight: 800 }}>{money(total)}</span>
              <button type="button" style={btnPrimary} disabled={busy || !r.customer_id || total <= 0} onClick={() => act(() => eventsEnquiryAdminAPI.quote(id, lines.filter((l) => l.description.trim() && Number(l.rate) > 0)), 'Quotation sent')}>Make and send the quotation</button>
            </div>
          </div>
        )}
        {r.quotation && <p style={{ margin: 0, fontSize: '0.86rem' }}>Quotation <strong>{r.quotation.voucher_number}</strong> · {money(r.quotation.total_amount)} · {r.quotation.doc_status}. <Link to={`/admin/quotes/${r.quotation.id}`} style={{ color: colors.primary, fontWeight: 700 }}>Open in Books</Link></p>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {r.quotation && !r.order && <button type="button" style={btnPrimary} disabled={busy} onClick={() => act(() => eventsEnquiryAdminAPI.accept(id), 'Accepted')}>Customer accepted: make the sales order and open the project</button>}
          {r.order && !r.invoice && <button type="button" style={btnGhost} disabled={busy} onClick={() => act(() => eventsEnquiryAdminAPI.invoice(id), 'Invoiced')}>Invoice the order</button>}
          {r.event_id ? <Link to={`/admin/events/${r.event_id}/plan`} style={{ ...btnPrimary, textDecoration: 'none' }}>Open the event project</Link> : r.status === 'accepted' && <button type="button" style={btnGhost} disabled={busy} onClick={() => act(() => eventsEnquiryAdminAPI.project(id), 'Project opened')}>Open the event project</button>}
        </div>
        {r.order && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Sales order {r.order.voucher_number}{r.invoice ? ` · invoice ${r.invoice.voucher_number}` : ''}. Deposits and staged invoices are taken in Books as for any order.</p>}
      </FormStack>
    </Modal>
  );
}
