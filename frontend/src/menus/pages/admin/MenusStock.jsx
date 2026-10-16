import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, PackagePlus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormError, FormStack, ModalActions, NumberInput, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import MenusNav from '../../components/MenusNav';

/**
 * Menus → Stock: what is on the kitchen's shelf at a branch, per ingredient and per variant, in packs, the alternate unit and the base unit, and how it got there.
 * Ingredients are received here (a supplier bill in the books and batches on the shelf) or entered as opening stock. Nothing here is a product.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' };
const num = (n, dp = 2) => (n == null ? '—' : Number(n).toLocaleString('en-KE', { maximumFractionDigits: dp }));

/** One line of the receiving form. The unit choices are the ones that make sense for the variant: packs (when it has a pack size), the alternate unit, the base unit. */
function Line({ line, variants, opening, taxes, onChange, onRemove }) {
  const v = variants.find((x) => String(x.id) === String(line.item_id));
  const units = v ? [...(v.pack_size_base ? [['pack', 'packs']] : []), ...(v.alt_unit ? [['alt', v.alt_unit]] : []), ['base', v.base_unit]] : [['base', '']];
  const unitLabel = (units.find(([k]) => k === line.unit) ?? units[0])[1];
  const base = v ? (line.unit === 'pack' ? Number(line.quantity) * v.pack_size_base : line.unit === 'alt' ? Number(line.quantity) * v.alt_factor : Number(line.quantity)) : 0;
  const amount = (Number(line.quantity) || 0) * (Number(line.rate) || 0);

  return (
    <div style={{ ...card, padding: 10, display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.9fr 1fr auto', gap: 8, alignItems: 'end' }}>
        <Field label="Ingredient variant">
          <SelectInput aria-label="Ingredient variant" value={line.item_id} onChange={(e) => {
            const nv = variants.find((x) => String(x.id) === e.target.value);
            onChange({ item_id: e.target.value, unit: nv?.pack_size_base ? 'pack' : nv?.alt_unit ? 'alt' : 'base' });
          }}>
            <option value="">Choose…</option>{variants.map((x) => <option key={x.id} value={x.id}>{x.ingredient} — {x.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Quantity"><NumberInput aria-label="Quantity" min="0" step="any" value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} /></Field>
        <Field label="In">
          <SelectInput aria-label="Unit" value={line.unit} onChange={(e) => onChange({ unit: e.target.value })}>{units.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput>
        </Field>
        <Field label={`Price of one ${line.unit === 'pack' ? 'pack' : unitLabel || 'unit'}`}><NumberInput aria-label="Price" min="0" step="any" value={line.rate} onChange={(e) => onChange({ rate: e.target.value })} /></Field>
        <button type="button" aria-label="Remove line" onClick={onRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 6 }}><Trash2 size={15} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
        {!opening && <Field label="Tax"><SelectInput aria-label="Tax" value={line.tax_rate_id} onChange={(e) => onChange({ tax_rate_id: e.target.value })}><option value="">No tax</option>{taxes.map((t) => <option key={t.id} value={t.id}>{t.name}{t.percent != null ? ` (${t.percent}%)` : ''}</option>)}</SelectInput></Field>}
        <Field label="Batch no (optional)"><TextInput aria-label="Batch number" maxLength={60} value={line.batch_no} onChange={(e) => onChange({ batch_no: e.target.value })} /></Field>
        {v?.track_expiry && <Field label="Expiry date"><TextInput type="date" aria-label="Expiry date" required value={line.expiry_date} onChange={(e) => onChange({ expiry_date: e.target.value })} /></Field>}
        <div style={{ alignSelf: 'end', fontSize: '0.74rem', color: colors.textMuted, paddingBottom: 8 }}>
          {v && Number(line.quantity) > 0 ? <>= {num(base, 4)} {v.base_unit}{v.alt_unit ? ` (${num(base / v.alt_factor, 4)} ${v.alt_unit})` : ''} · {num(amount)} before tax</> : null}
        </div>
      </div>
    </div>
  );
}

function ReceiveModal({ data, locationId, opening, onClose, onDone }) {
  const variants = useMemo(() => data.ingredients.flatMap((i) => i.variants.filter((v) => v.is_active).map((v) => ({
    id: v.id, name: v.name, ingredient: i.name, pack_size_base: v.pack_size_base, track_expiry: v.track_expiry, base_unit: i.base_unit, alt_unit: i.alt_unit,
    alt_factor: i.alt_factor ?? 1,
  }))), [data]);
  const blank = () => ({ key: Math.random().toString(36).slice(2), item_id: '', quantity: '', unit: 'base', rate: '', tax_rate_id: '', batch_no: '', expiry_date: '' });
  const [lines, setLines] = useState([blank()]);
  const [loc, setLoc] = useState(locationId);
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [supplier, setSupplier] = useState('');
  const [invoice, setInvoice] = useState('');
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const patch = (key, p) => setLines((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const payload = {
        location_id: Number(loc), date, narration: note || null,
        lines: lines.map((l) => ({ item_id: Number(l.item_id), quantity: Number(l.quantity), unit: l.unit, rate: Number(l.rate), tax_rate_id: l.tax_rate_id ? Number(l.tax_rate_id) : null, batch_no: l.batch_no || null, expiry_date: l.expiry_date || null })),
      };
      const res = opening ? await menusAPI.openingStock(payload) : await menusAPI.receiveStock({ ...payload, supplier_ledger_id: Number(supplier), supplier_invoice_no: invoice || null, due_date: due || null });
      toast.success(res.message, { duration: 6000 }); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save')); } finally { setBusy(false); }
  };

  return (
    <Modal title={opening ? 'Opening stock' : 'Receive ingredients'} onClose={onClose} width={880}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          {opening && <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>The stock the kitchen starts with. It is booked against the opening balance account, with no supplier.</p>}
          <div style={{ display: 'grid', gridTemplateColumns: opening ? '1fr 1fr' : '1fr 1fr 1.4fr', gap: 10 }}>
            <Field label="Branch"><SelectInput aria-label="Branch" required value={loc} onChange={(e) => setLoc(e.target.value)}>{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>
            <Field label="Date"><TextInput type="date" aria-label="Date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            {!opening && (
              <Field label="Supplier" hint="Suppliers are the accounts under Sundry Creditors.">
                <SelectInput aria-label="Supplier" required value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">Choose…</option>{data.suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput>
              </Field>
            )}
          </div>
          {!opening && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Supplier's invoice number (optional)"><TextInput aria-label="Supplier invoice number" maxLength={60} value={invoice} onChange={(e) => setInvoice(e.target.value)} /></Field>
              <Field label="Due date (optional)"><TextInput type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} /></Field>
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {lines.map((l) => <Line key={l.key} line={l} variants={variants} opening={opening} taxes={data.tax_rates} onChange={(p) => patch(l.key, p)} onRemove={() => setLines((xs) => (xs.length > 1 ? xs.filter((y) => y.key !== l.key) : xs))} />)}
          </div>
          <div><button type="button" style={small} onClick={() => setLines((xs) => [...xs, blank()])}><Plus size={12} /> Add a line</button></div>
          <Field label="Note (optional)"><TextInput aria-label="Note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ModalActions onCancel={onClose} submitLabel={opening ? 'Record opening stock' : 'Receive'} busy={busy} disabled={lines.some((l) => !l.item_id || !(Number(l.quantity) > 0) || l.rate === '') || (!opening && !supplier)} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function MenusStock() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canManageMenus(user);
  const [data, setData] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loc, setLoc] = useState('');
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const first = useRef(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = loc ? { location_id: loc } : undefined;
    Promise.all([menusAPI.stock(params), menusAPI.stockReceipts(params)])
      .then(([s, r]) => { setData(s); setReceipts(r.receipts); if (first.current) { first.current = false; setLoc(String(s.location_id)); } })
      .catch((e) => toast.error(errMsg(e, 'Could not load the stock')))
      .finally(() => setLoading(false));
  }, [loc]);
  useEffect(() => { load(); }, [load]);
  const done = () => { setModal(null); load(); };
  const cancel = async (r) => {
    const reason = window.prompt(`Cancel the receipt ${r.voucher_number ?? `#${r.id}`}? Say why (the stock comes off the shelf and the bill is cancelled in the books):`);
    if (reason === null) return;
    try { const res = await menusAPI.cancelReceipt(r.id, reason); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not cancel'), { duration: 8000 }); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the kitchen stock" /></div></AdminLayout>;
  const noVariants = data && !data.ingredients.some((i) => i.variants.length);

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="menus-stock">
        <MenusNav />
        <HubHeader title="Stock" description="What is on the kitchen's shelf, counted in packs, kilograms and grams, and how it got there. Receive deliveries here: the supplier's bill goes into the books and the stock onto the shelf." />
        {data && !data.installed && <p role="status" style={{ ...card, padding: 14, fontSize: '0.82rem', marginBottom: 14 }}>Run database script 182_menus_ingredient_stock.sql first: until then stock can be read but not received.</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, margin: '0 0 14px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 200 }}>
            <SelectInput aria-label="Branch" value={loc} onChange={(e) => setLoc(e.target.value)}>{(data?.branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput>
          </div>
          {canWrite && data?.installed && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" style={btnGhost} disabled={noVariants} onClick={() => setModal('opening')}>Opening stock</button>
              <button type="button" style={btnPrimary} disabled={noVariants} onClick={() => setModal('receive')}><PackagePlus size={14} /> Receive ingredients</button>
            </div>
          )}
        </div>
        {noVariants && <p role="status" style={{ fontSize: '0.82rem', color: colors.textMuted }}>Add ingredients and their variants under Ingredients first, then receive them here.</p>}

        <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 20 }}>
          {loading && !data ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Ingredient / variant</th><th style={{ ...th, textAlign: 'right' }}>Packs</th><th style={{ ...th, textAlign: 'right' }}>In the bigger unit</th><th style={{ ...th, textAlign: 'right' }}>In the base unit</th><th style={{ ...th, textAlign: 'right' }}>Value</th><th style={th}>Expires first</th></tr></thead>
              <tbody>
                {(data?.ingredients ?? []).filter((i) => i.variants.length).map((i) => (
                  <Fragment key={`i${i.id}`}>
                    <tr style={{ background: colors.tint(0.03) }}>
                      <td style={{ ...td, fontWeight: 700 }}>{i.name}</td><td style={td} />
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{i.alt_unit ? `${num(i.qty_alt, 3)} ${i.alt_unit}` : ''}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{num(i.qty_base, 3)} {i.base_unit}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{num(i.value)}</td><td style={td} />
                    </tr>
                    {i.variants.map((v) => (
                      <tr key={`v${v.id}`} style={v.is_active ? undefined : { opacity: 0.5 }}>
                        <td style={{ ...td, paddingLeft: 24 }}>{v.name}{v.pack_size_base ? <span style={{ color: colors.textFaint }}> · pack of {num(i.alt_unit ? v.pack_size_base / i.alt_factor : v.pack_size_base, 3)} {i.alt_unit ?? i.base_unit}</span> : null}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{v.packs == null ? '—' : num(v.packs, 3)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{v.qty_alt == null ? '' : `${num(v.qty_alt, 3)} ${i.alt_unit}`}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{num(v.qty_base, 3)} {i.base_unit}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{num(v.value)}</td>
                        <td style={td}>{v.next_expiry ?? ''}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <h2 style={{ fontSize: '0.95rem', margin: '0 0 8px' }}>Receipts</h2>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {receipts.length === 0 ? <p style={{ padding: 16, margin: 0, color: colors.textMuted, fontSize: '0.82rem' }}>Nothing received yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Date</th><th style={th}>Bill</th><th style={th}>From</th><th style={{ ...th, textAlign: 'right' }}>Total</th><th style={th}>Status</th><th style={th} /></tr></thead>
              <tbody>{receipts.map((r) => (
                <tr key={r.id} style={r.status === 'cancelled' ? { opacity: 0.5 } : undefined}>
                  <td style={td}>{r.date}</td>
                  <td style={td}>{r.voucher_number ?? '—'}{r.supplier_invoice_no ? <span style={{ color: colors.textFaint }}> · {r.supplier_invoice_no}</span> : null}</td>
                  <td style={td}>{r.kind === 'opening' ? 'Opening stock' : r.supplier ?? 'Paid at once'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{num(r.total)}</td>
                  <td style={td}>{r.status === 'cancelled' ? 'Cancelled' : 'Received'}</td>
                  <td style={td}>{canWrite && r.status === 'posted' && <button type="button" style={small} onClick={() => cancel(r)}>Cancel</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {modal && data && <ReceiveModal data={data} locationId={loc || data.location_id} opening={modal === 'opening'} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}
