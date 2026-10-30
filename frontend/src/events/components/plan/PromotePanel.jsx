import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { eventsAdAPI } from '../../../_shared/api/events';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { Field, FormGrid, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import SimpleTable from '../../../core/components/admin/ui/SimpleTable';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';

const tomorrow = () => new Date(Date.now() + 864e5).toISOString().slice(0, 10);

/** Promote this event: pick a product, a start date, and ask TISL for it. Free listing stays; this buys exposure. Shows what each promotion has earned. */
export default function PromotePanel({ eventId, canEdit, published }) {
  const [products, setProducts] = useState([]);
  const [camps, setCamps] = useState([]);
  const [f, setF] = useState({ product_id: '', starts_on: tomorrow() });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    eventsAdAPI.products().then((r) => setProducts(r.data)).catch(() => {});
    eventsAdAPI.campaigns().then((r) => setCamps(r.filter((c) => c.event_id === Number(eventId)))).catch(() => {});
  }, [eventId]);
  useEffect(() => { load(); }, [load]);

  const ask = async () => {
    setBusy(true);
    try { const r = await eventsAdAPI.request(eventId, { product_id: Number(f.product_id), starts_on: f.starts_on }); toast.success(r.message); load(); } catch (e) { toast.error(errMsg(e, 'Could not ask for it'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const columns = [
    { key: 'product', label: 'Promotion' },
    { key: 'starts_on', label: 'Runs', render: (c) => `${c.starts_on} to ${c.ends_on}` },
    { key: 'status', label: 'Status', render: (c) => <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{c.live ? 'Running now' : c.status}</span> },
    { key: 'amount', label: 'Price', align: 'right', render: (c) => Number(c.amount).toLocaleString() },
    { key: 'impressions', label: 'Seen', align: 'right' },
    { key: 'clicks', label: 'Clicks', align: 'right', render: (c) => `${c.clicks}${c.impressions ? ` (${c.ctr}%)` : ''}` },
    { key: 'registrations', label: 'Tickets since', align: 'right' },
    { key: '_', label: '', align: 'right', render: (c) => (canEdit && ['pending', 'approved'].includes(c.status) && !c.invoice_id ? <button type="button" style={{ ...btnGhost, padding: '4px 10px', fontSize: '0.74rem' }} onClick={() => eventsAdAPI.cancel(c.id).then(load)}>Cancel</button> : null) },
  ];

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {!published && <p role="status" style={{ ...card, padding: 12, margin: 0, fontSize: '0.84rem' }}>Only an event that is on sale can be promoted. Publish it first.</p>}
      {canEdit && published && (
        <div style={{ ...card, padding: 16, display: 'grid', gap: 12 }}>
          <strong>Get more people to see it</strong>
          <FormGrid min={220}>
            <Field label="Promotion" htmlFor="pr-p"><SelectInput id="pr-p" value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}>
              <option value="">Choose…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} — {Number(p.price).toLocaleString()} for {p.duration_days} days</option>)}</SelectInput></Field>
            <Field label="Starts" htmlFor="pr-s"><TextInput id="pr-s" type="date" min={tomorrow()} value={f.starts_on} onChange={(e) => setF({ ...f, starts_on: e.target.value })} /></Field>
          </FormGrid>
          <div><button type="button" style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy || !f.product_id} onClick={ask}>Ask for this promotion</button></div>
          <span style={{ fontSize: '0.76rem', color: colors.textMuted }}>TISL approves it and invoices it. Places are limited for each promotion.</span>
        </div>
      )}
      <SimpleTable columns={columns} rows={camps} empty="No promotions for this event yet." />
    </div>
  );
}
