import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Plus, PackagePlus, Trash2, ClipboardList, Truck, ChefHat, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
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
import { BatchModal, TransferModal } from '../../components/StockActions';
import ReceiveIngredients from '../../components/ReceiveIngredients';
import IngredientVariantPicker from '../../components/IngredientVariantPicker';
import { useMenusBranch } from '../../lib/menusBranch';

/**
 * Menus → Stock: what is on the kitchen's shelf at a branch, per ingredient and per variant, in packs, the alternate unit and the base unit, and how it got there.
 * Ingredients are received here (a supplier bill in the books and batches on the shelf) or entered as opening stock on its own sheet (Opening stock). Nothing here is a product.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem' };
const num = (n, dp = 2) => (n == null ? '—' : Number(n).toLocaleString('en-KE', { maximumFractionDigits: dp }));

export default function MenusStock() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canManageMenus(user);
  const [data, setData] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [extra, setExtra] = useState({ expiring: [], counts: [], transfers: [], runs: [], dishes: [] });
  const [loc, setLoc] = useMenusBranch(data?.branches);
  const [modal, setModal] = useState(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const first = useRef(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = loc ? { location_id: loc } : undefined;
    Promise.all([menusAPI.stock(params), menusAPI.stockReceipts(params), menusAPI.stockExpiring({ ...params, days: 7 }).catch(() => ({ rows: [] })), menusAPI.stockCounts(params).catch(() => ({})), menusAPI.productions(params).catch(() => ({}))])
      .then(([s, r, x, c, p]) => { setData(s); setReceipts(r.receipts); setExtra({ expiring: x.rows ?? [], counts: c.counts ?? [], transfers: c.transfers ?? [], runs: p.runs ?? [], dishes: p.dishes ?? [] }); if (first.current) { first.current = false; setLoc(String(s.location_id)); } })
      .catch((e) => toast.error(errMsg(e, 'Could not load the stock')))
      .finally(() => setLoading(false));
  }, [loc, setLoc]);
  useEffect(() => { load(); }, [load]);
  const done = () => { setModal(null); load(); };
  const cancel = async (r) => {
    const reason = window.prompt(`Cancel the receipt ${r.voucher_number ?? `#${r.id}`}? Say why (the stock comes off the shelf and the bill is cancelled in the books):`);
    if (reason === null) return;
    try { const res = await menusAPI.cancelReceipt(r.id, reason, r.legacy); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not cancel'), { duration: 8000 }); }
  };

  const cancelBatch = async (r) => {
    if (!window.confirm(`Cancel batch ${r.number}? The ingredients go back on the shelf.`)) return;
    try { const res = await menusAPI.cancelBatch(r.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not cancel the batch'), { duration: 8000 }); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the kitchen stock" /></div></AdminLayout>;
  const noVariants = data && !data.ingredients.some((i) => i.variants.length);

  // one search over everything on the page: the shelf (an ingredient shows all its variants), what is expiring, batches, receipts, counts and transfers
  const needle = q.trim().toLowerCase();
  const has = (...texts) => !needle || texts.some((t) => String(t ?? '').toLowerCase().includes(needle));
  const shelf = (data?.ingredients ?? []).filter((i) => i.variants.length).map((i) => (has(i.name) ? i : { ...i, variants: i.variants.filter((v) => has(v.name)) })).filter((i) => i.variants.length);
  const expiring = extra.expiring.filter((x) => has(x.name, x.batch_no));
  const runs = extra.runs.filter((r) => has(r.dish, r.number));
  const counts = extra.counts.filter((c) => has(c.number, c.note));
  const transfers = extra.transfers.filter((t) => has(t.number, t.note));
  const shownReceipts = receipts.filter((r) => has(r.voucher_number, r.supplier, r.supplier_invoice_no, r.narration, r.kind === 'opening' ? 'opening stock' : r.kind === 'goods' ? 'goods received' : 'purchase'));

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="menus-stock">
        <MenusNav />
        <HubHeader title="Stock" description="What is on the kitchen's shelf, counted in packs, kilograms and grams, and how it got there. Receive deliveries here: the supplier's bill goes into the books and the stock onto the shelf." />
        {data && !data.installed && <p role="status" style={{ ...card, padding: 14, fontSize: '0.82rem', marginBottom: 14 }}>Run database script 182_menus_ingredient_stock.sql first: until then stock can be read but not received.</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, margin: '0 0 14px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', flex: '1 1 380px' }}>
            <div style={{ minWidth: 200 }}>
              <SelectInput aria-label="Branch" value={loc} onChange={(e) => setLoc(e.target.value)}>{(data?.branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput>
            </div>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
              <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textFaint, pointerEvents: 'none' }} />
              <TextInput aria-label="Search the stock" placeholder="Search ingredients, batches, receipts…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 30 }} />
            </div>
          </div>
          {canWrite && data?.installed && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/admin/menus/stock/count" style={{ ...btnGhost, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }} aria-disabled={noVariants || undefined}><ClipboardList size={14} /> Count stock</Link>
              <button type="button" style={btnGhost} disabled={noVariants} onClick={() => setModal('transfer')}><Truck size={14} /> Send to a branch</button>
              <button type="button" style={btnGhost} onClick={() => setModal('batch')}><ChefHat size={14} /> Make a batch</button>
              <Link to="/admin/menus/stock/opening" style={{ ...btnGhost, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }} aria-disabled={noVariants || undefined}>Opening stock</Link>
              <button type="button" style={btnPrimary} data-hotkey="F2" title="F2" disabled={noVariants} onClick={() => setModal('receive')}><PackagePlus size={14} /> Receive ingredients</button>
            </div>
          )}
        </div>
        {noVariants && <p role="status" style={{ fontSize: '0.82rem', color: colors.textMuted }}>Add ingredients and their variants under Ingredients first, then receive them here.</p>}

        <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 20 }}>
          {loading && !data ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Ingredient / variant</th><th style={{ ...th, textAlign: 'right' }}>Packs</th><th style={{ ...th, textAlign: 'right' }}>In the bigger unit</th><th style={{ ...th, textAlign: 'right' }}>In the base unit</th><th style={{ ...th, textAlign: 'right' }}>Value</th><th style={th}>Expires first</th></tr></thead>
              <tbody>
                {shelf.map((i) => (
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
                {shelf.length === 0 && needle && <tr><td colSpan={6} style={{ ...td, padding: 20, color: colors.textMuted }}>Nothing on the shelf matches “{q.trim()}”.</td></tr>}
              </tbody>
            </table>
          )}
        </div>

        {expiring.length > 0 && (
          <>
            <h2 style={{ fontSize: '0.95rem', margin: '0 0 8px' }}>Expired or expiring this week</h2>
            <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 20 }} data-testid="expiring">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Ingredient / variant</th><th style={th}>Expires</th><th style={{ ...th, textAlign: 'right' }}>Left</th><th style={{ ...th, textAlign: 'right' }}>Worth</th><th style={th} /></tr></thead>
                <tbody>{expiring.map((x) => (
                  <tr key={x.batch_id}>
                    <td style={td}>{x.name}{x.batch_no ? <span style={{ color: colors.textFaint }}> · {x.batch_no}</span> : null}{x.status !== 'ok' ? <span style={{ color: colors.textFaint }}> · {x.status}</span> : null}</td>
                    <td style={{ ...td, color: x.expired ? '#b91c1c' : undefined, fontWeight: x.expired ? 700 : 400 }}>{x.expiry_date} · {x.expired ? `expired ${-x.days_left} day${x.days_left === -1 ? '' : 's'} ago` : x.days_left === 0 ? 'today' : `in ${x.days_left} day${x.days_left === 1 ? '' : 's'}`}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{num(x.quantity, 3)} {x.unit}</td><td style={{ ...td, textAlign: 'right' }}>{num(x.value)}</td>
                    <td style={td}>{canWrite && <Link to="/admin/menus/operations" style={{ fontSize: '0.74rem' }}>Record as waste</Link>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}

        {runs.length > 0 && (
          <>
            <h2 style={{ fontSize: '0.95rem', margin: '0 0 8px' }}>Batches made</h2>
            <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 20 }} data-testid="batches">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Date</th><th style={th}>Batch</th><th style={th}>Dish</th><th style={{ ...th, textAlign: 'right' }}>Portions</th><th style={{ ...th, textAlign: 'right' }}>Left</th><th style={{ ...th, textAlign: 'right' }}>Cost</th><th style={th} /></tr></thead>
                <tbody>{runs.map((r) => (
                  <tr key={r.id} style={r.status === 'cancelled' ? { opacity: 0.5 } : undefined}>
                    <td style={td}>{r.date}</td><td style={td}>{r.number}</td><td style={td}>{r.dish}</td><td style={{ ...td, textAlign: 'right' }}>{num(r.portions)}</td><td style={{ ...td, textAlign: 'right' }}>{r.status === 'cancelled' ? 'Cancelled' : num(r.left)}</td><td style={{ ...td, textAlign: 'right' }}>{num(r.cost)}</td>
                    <td style={td}>{canWrite && r.status === 'posted' && <button type="button" style={small} onClick={() => cancelBatch(r)}>Cancel</button>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}

        {(counts.length > 0 || transfers.length > 0) && (
          <>
            <h2 style={{ fontSize: '0.95rem', margin: '0 0 8px' }}>Stock counts and transfers</h2>
            <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 20 }} data-testid="counts">
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Date</th><th style={th}>Number</th><th style={th}>What</th><th style={{ ...th, textAlign: 'right' }}>Difference worth</th></tr></thead>
                <tbody>
                  {counts.map((c) => <tr key={`c${c.id}`}><td style={td}>{c.date}</td><td style={td}>{c.number}</td><td style={td}>Stock count · {c.lines} line{c.lines === 1 ? '' : 's'}{c.note ? ` · ${c.note}` : ''}</td><td style={{ ...td, textAlign: 'right' }}>{num(c.value_change)}</td></tr>)}
                  {transfers.map((t) => <tr key={`t${t.id}`}><td style={td}>{t.date}</td><td style={td}>{t.number}</td><td style={td}>Sent {data?.branches.find((b) => b.id === t.from)?.name ?? ''} → {data?.branches.find((b) => b.id === t.to)?.name ?? ''} · {t.lines} line{t.lines === 1 ? '' : 's'}</td><td style={td} /></tr>)}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h2 style={{ fontSize: '0.95rem', margin: '0 0 8px' }}>Receipts</h2>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {shownReceipts.length === 0 ? <p style={{ padding: 16, margin: 0, color: colors.textMuted, fontSize: '0.82rem' }}>{receipts.length === 0 ? 'Nothing received yet.' : 'No receipts match.'}</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Date</th><th style={th}>Bill</th><th style={th}>From</th><th style={{ ...th, textAlign: 'right' }}>Total</th><th style={th}>Status</th><th style={th} /></tr></thead>
              <tbody>{shownReceipts.map((r) => (
                <tr key={r.id} style={r.status === 'cancelled' ? { opacity: 0.5 } : undefined}>
                  <td style={td}>{r.date}</td>
                  <td style={td}>{r.voucher_number ?? '—'}{r.supplier_invoice_no ? <span style={{ color: colors.textFaint }}> · {r.supplier_invoice_no}</span> : null}</td>
                  <td style={td}>{r.kind === 'opening' ? 'Opening stock' : r.kind === 'goods' ? `Goods received${r.supplier ? ` · ${r.supplier}` : ''}` : r.supplier ?? 'Paid at once'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{num(r.total)}</td>
                  <td style={td}>{r.status === 'cancelled' ? 'Cancelled' : 'Received'}</td>
                  <td style={td}>{canWrite && r.status === 'posted' && <button type="button" style={small} onClick={() => cancel(r)}>Cancel</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {modal === 'transfer' && data && <TransferModal data={data} locationId={loc || data.location_id} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'batch' && data && <BatchModal dishes={extra.dishes} locationId={loc || data.location_id} onClose={() => setModal(null)} onDone={done} />}
      {modal === 'receive' && data && <ReceiveIngredients data={data} locationId={loc || data.location_id} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}
