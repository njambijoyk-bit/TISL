import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, NumberInput, SelectInput, TextInput, FormStack, ModalActions, FormError } from '../../../core/components/admin/ui/Form';
import VariantPicker from '../../components/admin/VariantPicker';
import { recipesAPI } from '../../../_shared/api/stockOps';
import useAuthStore from '../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';

/**
 * Recipes and production. A recipe says what an item is made of, per yield. "Made ahead": a production run uses the
 * ingredients and makes a batch of the finished item, costed at what the ingredients cost. "Made to order": selling
 * the item uses the ingredients (a menu dish) and the item itself holds no stock.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const nm = (r) => `${r.product}${r.variant && r.variant !== 'Standard' ? ` — ${r.variant}` : ''}`;

function RecipeModal({ recipe, onClose, onDone }) {
  const [out, setOut] = useState(recipe ? { variant_id: recipe.variant_id, name: recipe.item } : null);
  const [yieldQty, setYieldQty] = useState(recipe?.yield_qty ?? 1);
  const [onSale, setOnSale] = useState(recipe?.deduct_on_sale ?? false);
  const [note, setNote] = useState(recipe?.note ?? '');
  const [items, setItems] = useState(recipe ? recipe.items.map((i) => ({ variant_id: i.variant_id, name: i.name, quantity: i.quantity })) : []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const addItem = (r) => setItems((xs) => (xs.some((x) => x.variant_id === r.variant_id) ? xs : [...xs, { variant_id: r.variant_id, name: nm(r), quantity: 1 }]));
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await recipesAPI.save({ variant_id: out.variant_id, yield_qty: Number(yieldQty), deduct_on_sale: onSale, note: note || undefined, items: items.map((i) => ({ variant_id: i.variant_id, quantity: Number(i.quantity) })) });
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the recipe')); } finally { setBusy(false); }
  };
  return (
    <Modal title={recipe ? 'Edit recipe' : 'New recipe'} onClose={onClose} width={640}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          {out ? <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>Makes: {out.name}{!recipe && <button type="button" style={{ ...small, marginLeft: 10 }} onClick={() => setOut(null)}>Change</button>}</div>
            : <Field label="What it makes"><VariantPicker onPick={(r) => setOut({ variant_id: r.variant_id, name: nm(r) })} placeholder="Search the finished item…" /></Field>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="One batch makes (units)"><NumberInput required min="0.0001" step="any" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} /></Field>
            <Field label="How it is made"><SelectInput value={onSale ? 'order' : 'ahead'} onChange={(e) => setOnSale(e.target.value === 'order')}><option value="ahead">Made ahead (production run)</option><option value="order">Made to order (used when sold)</option></SelectInput></Field>
          </div>
          <Field label="Ingredients (amount used per batch)"><VariantPicker onPick={addItem} placeholder="Search an ingredient to add…" /></Field>
          {items.map((i) => (
            <div key={i.variant_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1, fontSize: '0.82rem' }}>{i.name}</span>
              <div style={{ width: 110 }}><NumberInput min="0.0001" step="any" required value={i.quantity} aria-label={`Amount of ${i.name}`} onChange={(e) => setItems((xs) => xs.map((x) => (x.variant_id === i.variant_id ? { ...x, quantity: e.target.value } : x)))} /></div>
              <button type="button" aria-label="Remove" onClick={() => setItems((xs) => xs.filter((x) => x.variant_id !== i.variant_id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint }}><Trash2 size={15} /></button>
            </div>
          ))}
          <Field label="Note (optional)"><TextInput value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <ModalActions onCancel={onClose} submitLabel="Save recipe" busy={busy} disabled={!out || !items.length} />
        </FormStack>
      </form>
    </Modal>
  );
}

function RunModal({ recipe, branches, onClose, onDone }) {
  const [qty, setQty] = useState(recipe.yield_qty);
  const [loc, setLoc] = useState('');
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try { const res = await recipesAPI.produce(recipe.id, { quantity: Number(qty), location_id: Number(loc), batch_no: batch || undefined, expiry_date: expiry || undefined }); toast.success(res.message); onDone(); }
    catch (x) { setErr(errMsg(x, 'Could not run production')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Make a batch" subtitle={recipe.item} onClose={onClose}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Branch"><SelectInput required value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Choose…</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput></Field>
          <Field label="How many made"><NumberInput required min="0.0001" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Batch number (optional)"><TextInput value={batch} onChange={(e) => setBatch(e.target.value)} /></Field>
            <Field label="Expiry date (if it expires)"><TextInput type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>Uses {recipe.items.map((i) => `${Math.round(i.quantity * (Number(qty) || 0) / recipe.yield_qty * 10000) / 10000} × ${i.name}`).join(', ')}. The batch is costed at what these cost.</p>
          <ModalActions onCancel={onClose} submitLabel="Make" busy={busy} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function Production() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canWriteFinance(user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    recipesAPI.list().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load recipes'))).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  const done = () => { setModal(null); load(); };

  const remove = async (r) => {
    if (!window.confirm(`Remove the recipe for ${r.item}?`)) return;
    try { const res = await recipesAPI.remove(r.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not remove')); }
  };
  const cancelRun = async (p) => {
    if (!window.confirm(`Cancel ${p.number}? The ingredients go back into stock.`)) return;
    try { const res = await recipesAPI.cancelRun(p.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not cancel')); }
  };

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="recipes and production" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <HubHeader title="Recipes & production" description="What things are made of. Make a batch ahead, or let a sale use the ingredients." />
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 0 14px' }}>
          {canWrite && <button type="button" style={btnPrimary} onClick={() => setModal({ kind: 'recipe' })}><Plus size={14} /> New recipe</button>}
        </div>

        <div style={{ ...card, padding: 0, overflowX: 'auto', marginBottom: 22 }}>
          {loading ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : !(data?.recipes?.length) ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No recipes yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Item</th><th style={th}>Made from (per batch)</th><th style={th}>Made</th><th style={th} /></tr></thead>
              <tbody>{data.recipes.map((r) => (
                <tr key={r.id}>
                  <td style={td}><strong>{r.item}</strong><div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{r.yield_qty} per batch</div></td>
                  <td style={td}>{r.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</td>
                  <td style={td}>{r.deduct_on_sale ? 'To order' : 'Ahead'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {canWrite && !r.deduct_on_sale && <button type="button" style={small} onClick={() => setModal({ kind: 'run', recipe: r })}>Make a batch</button>}
                    {canWrite && <button type="button" style={small} onClick={() => setModal({ kind: 'recipe', recipe: r })}>Edit</button>}
                    {canWrite && <button type="button" style={small} onClick={() => remove(r)}>Remove</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        <h2 style={{ fontSize: '0.95rem', margin: '0 0 8px' }}>Recent production</h2>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {!(data?.runs?.length) ? <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>Nothing made yet.</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Run</th><th style={th}>Item</th><th style={th}>Branch</th><th style={{ ...th, textAlign: 'right' }}>Made</th><th style={{ ...th, textAlign: 'right' }}>Cost each</th><th style={th}>Status</th><th style={th} /></tr></thead>
              <tbody>{data.runs.map((p) => (
                <tr key={p.id}>
                  <td style={td}><strong>{p.number}</strong><div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{String(p.created_at).slice(0, 10)}</div></td>
                  <td style={td}>{p.item}</td><td style={td}>{p.location}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{p.quantity}</td><td style={{ ...td, textAlign: 'right' }}>{p.unit_cost.toFixed(4)}</td>
                  <td style={td}>{p.status}</td>
                  <td style={td}>{canWrite && p.status === 'posted' && <button type="button" style={small} onClick={() => cancelRun(p)}>Cancel</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {modal?.kind === 'recipe' && <RecipeModal recipe={modal.recipe} onClose={() => setModal(null)} onDone={done} />}
      {modal?.kind === 'run' && <RunModal recipe={modal.recipe} branches={data?.branches ?? []} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}
