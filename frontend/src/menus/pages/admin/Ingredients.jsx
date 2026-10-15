import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { CheckboxRow, Field, FormError, FormStack, ModalActions, NumberInput, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import VariantPicker from '../../../core/components/admin/pickers/VariantPicker';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import MenusNav from '../../components/MenusNav';
import { AllergenChips } from '../../components/FoodChips';

/**
 * Menus → Ingredients. An ingredient ("Wheat flour") is what a recipe asks for, in the unit recipes use (g, ml, each). The real stock items under it
 * ("Exe 2 kg", "Pembe 24 kg") are listed in order of preference: the kitchen takes the first, and the next when it runs out.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 3 };
const nm = (r) => `${r.product}${r.variant && r.variant !== 'Standard' ? ` — ${r.variant}` : ''}`;
const money = (n) => (n == null ? '—' : Number(n).toLocaleString('en-KE', { maximumFractionDigits: 4 }));

function Checks({ label, options, value, onChange }) {
  return (
    <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
      <legend style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>{label}</legend>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
        {Object.entries(options).map(([code, name]) => (
          <label key={code} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={value.includes(code)} onChange={(e) => onChange(e.target.checked ? [...value, code] : value.filter((c) => c !== code))} /> {name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function IngredientModal({ family, options, onClose, onDone }) {
  const [name, setName] = useState(family?.name ?? '');
  const [unitId, setUnitId] = useState(family?.unit_id ?? '');
  const [rule, setRule] = useState(family?.pick_rule ?? 'preferred');
  const [allergens, setAllergens] = useState(family?.allergens ?? []);
  const [tags, setTags] = useState(family?.tags ?? []);
  const [notes, setNotes] = useState(family?.notes ?? '');
  const [active, setActive] = useState(family?.is_active ?? true);
  const [items, setItems] = useState(family?.variants ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const unit = options.units.find((u) => String(u.id) === String(unitId));

  const suggest = async (variantId, forUnit) => {
    if (!forUnit) return;
    try {
      const r = await menusAPI.suggestUnits(variantId, forUnit);
      if (r.units_per_stock) setItems((xs) => xs.map((x) => (x.variant_id === variantId && !x.touched ? { ...x, units_per_stock: r.units_per_stock } : x)));
    } catch { /* the person types it */ }
  };
  const add = (r) => {
    if (items.some((x) => x.variant_id === r.variant_id)) return;
    setItems((xs) => [...xs, { variant_id: r.variant_id, name: nm(r), units_per_stock: '', is_allowed: true, sell_retail: false }]);
    suggest(r.variant_id, unitId);
  };
  const patch = (id, p) => setItems((xs) => xs.map((x) => (x.variant_id === id ? { ...x, ...p } : x)));
  const move = (i, d) => setItems((xs) => { const ys = [...xs]; const j = i + d; if (j < 0 || j >= ys.length) return ys; [ys[i], ys[j]] = [ys[j], ys[i]]; return ys; });
  const pickUnit = (v) => { setUnitId(v); items.forEach((x) => { if (!x.touched) suggest(x.variant_id, v); }); };

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await menusAPI.saveIngredient({
        name, unit_id: Number(unitId), pick_rule: rule, allergens, tags, notes: notes || null, is_active: active,
        variants: items.map((x) => ({ variant_id: x.variant_id, units_per_stock: Number(x.units_per_stock), is_allowed: x.is_allowed, sell_retail: x.sell_retail })),
      }, family?.id);
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the ingredient')); } finally { setBusy(false); }
  };

  return (
    <Modal title={family ? 'Edit ingredient' : 'New ingredient'} onClose={onClose} width={720}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.4fr', gap: 10 }}>
            <Field label="Name" htmlFor="ing-name"><TextInput id="ing-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Wheat flour" /></Field>
            <Field label="Recipes measure it in" htmlFor="ing-unit">
              <SelectInput id="ing-unit" required value={unitId} onChange={(e) => pickUnit(e.target.value)}>
                <option value="">Choose…</option>{options.units.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
              </SelectInput>
            </Field>
            <Field label="When there are several items" htmlFor="ing-rule">
              <SelectInput id="ing-rule" value={rule} onChange={(e) => setRule(e.target.value)}>{Object.entries(options.pick_rules).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>
            </Field>
          </div>

          <Field label={`Stock items it is taken from, in order of preference${unit ? ` (amounts in ${unit.code})` : ''}`}>
            <VariantPicker onPick={add} placeholder="Search a stock item to add (Exe flour 2 kg…)" />
          </Field>
          {items.map((x, i) => (
            <div key={x.variant_id} data-testid="ingredient-item" style={{ display: 'grid', gridTemplateColumns: '24px 1fr 140px auto', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textFaint }}>{i + 1}</span>
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600 }}>{x.name}</div>
                <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
                  <label style={{ fontSize: '0.7rem', color: colors.textMuted, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={x.is_allowed} onChange={(e) => patch(x.variant_id, { is_allowed: e.target.checked })} /> may be used</label>
                  <label style={{ fontSize: '0.7rem', color: colors.textMuted, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={x.sell_retail} onChange={(e) => patch(x.variant_id, { sell_retail: e.target.checked })} /> also sold in the shop</label>
                </div>
              </div>
              <NumberInput required min="0.000001" step="any" value={x.units_per_stock} aria-label={`${unit?.code ?? 'Units'} in one ${x.name}`} placeholder={`${unit?.code ?? 'units'} in one`}
                onChange={(e) => patch(x.variant_id, { units_per_stock: e.target.value, touched: true })} />
              <span style={{ whiteSpace: 'nowrap' }}>
                <button type="button" aria-label="Prefer it more" style={iconBtn} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                <button type="button" aria-label="Prefer it less" style={iconBtn} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                <button type="button" aria-label="Remove" style={iconBtn} onClick={() => setItems((xs) => xs.filter((y) => y.variant_id !== x.variant_id))}><Trash2 size={14} /></button>
              </span>
            </div>
          ))}
          {items.length > 0 && <p style={{ margin: 0, fontSize: '0.72rem', color: colors.textFaint }}>The number is how much of {unit?.code ?? 'the unit'} one stock unit holds: a 2 kg pack of an ingredient measured in g is 2000. It is filled in when the item says how much it holds.</p>}

          <Checks label="Allergens it contains" options={options.allergens} value={allergens} onChange={setAllergens} />
          <Checks label="What it is (for diet badges)" options={options.tags} value={tags} onChange={setTags} />
          <Field label="Note (optional)" htmlFor="ing-note"><TextInput id="ing-note" maxLength={255} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {family && <CheckboxRow checked={active} onChange={setActive} label="In use" description="Switch off an ingredient you no longer buy. Recipes that use it will say so until they are changed." />}
          <ModalActions onCancel={onClose} submitLabel="Save ingredient" busy={busy} disabled={!name.trim() || !unitId} />
        </FormStack>
      </form>
    </Modal>
  );
}

export default function Ingredients() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canManageMenus(user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [loc, setLoc] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    menusAPI.ingredients(loc ? { location_id: loc } : undefined).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the ingredients'))).finally(() => setLoading(false));
  }, [loc]);
  useEffect(() => { load(); }, [load]);
  const done = () => { setModal(null); load(); };
  const remove = async (f) => {
    if (!window.confirm(`Remove ${f.name}? The stock items under it are not touched.`)) return;
    try { const res = await menusAPI.removeIngredient(f.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not remove')); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="ingredients" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="ingredients">
        <MenusNav />
        <HubHeader title="Ingredients" description="What recipes ask for. Under each one are the stock items the kitchen takes it from: the preferred one first, the next when it runs out." />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, margin: '0 0 14px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 200 }}>
            <SelectInput aria-label="Branch" value={loc || data?.location_id || ''} onChange={(e) => setLoc(e.target.value)}>
              {(data?.branches ?? []).map((b) => <option key={b.id} value={b.id}>On hand at {b.name}</option>)}
            </SelectInput>
          </div>
          {canWrite && <button type="button" style={btnPrimary} onClick={() => setModal({ family: null })}><Plus size={14} /> New ingredient</button>}
        </div>

        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {loading && !data ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : !(data?.families?.length) ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No ingredients yet. Add the things recipes use, like flour, oil, tomatoes.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Ingredient</th><th style={th}>Taken from (in order)</th><th style={{ ...th, textAlign: 'right' }}>On hand</th><th style={{ ...th, textAlign: 'right' }}>Cost each</th><th style={th}>Allergens</th><th style={th} /></tr></thead>
              <tbody>{data.families.map((f) => (
                <tr key={f.id} style={f.is_active ? undefined : { opacity: 0.55 }}>
                  <td style={td}><strong>{f.name}</strong><div style={{ fontSize: '0.7rem', color: colors.textFaint }}>in {f.unit} · {data.pick_rules[f.pick_rule]?.toLowerCase()}{f.is_active ? '' : ' · not in use'}</div></td>
                  <td style={td}>{f.variants.map((v, i) => <div key={v.variant_id} style={v.is_allowed ? undefined : { textDecoration: 'line-through', color: colors.textFaint }}>{i + 1}. {v.name ?? `Item ${v.variant_id}`}{v.sell_retail ? ' (also sold)' : ''}</div>)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(f.on_hand)} {f.unit}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{f.unit_cost == null ? '—' : `${money(f.unit_cost)} / ${f.unit}`}</td>
                  <td style={td}><AllergenChips codes={f.allergens} names={data.allergens} empty={<span style={{ color: colors.textFaint }}>none</span>} /></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {canWrite && <button type="button" style={small} onClick={() => setModal({ family: f })}>Edit</button>}
                    {canWrite && <button type="button" style={small} onClick={() => remove(f)}>Remove</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {modal && data && <IngredientModal family={modal.family} options={data} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}
