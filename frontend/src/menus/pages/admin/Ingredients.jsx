import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { CheckboxRow, Field, FormError, FormStack, ModalActions, NumberInput, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import MenusNav from '../../components/MenusNav';
import { AllergenChips } from '../../components/FoodChips';

/**
 * Menus → Ingredients. An ingredient ("Wheat flour") is the smallest thing Menus stocks: a base unit (g) and, if wanted, a bigger alternate unit of the same kind (kg),
 * both from the units table. Its variants (Exe, Pembe, Soko) are what is bought and counted, listed in order of preference: the kitchen takes the first, then the next.
 * A variant may have a pack size (Exe 2 kg) so stock can be counted in packs. No product is behind any of it.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 3 };

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

function IngredientModal({ ingredient, options, onClose, onDone }) {
  const [name, setName] = useState(ingredient?.name ?? '');
  const [baseId, setBaseId] = useState(ingredient?.base_unit_id ?? '');
  const [altId, setAltId] = useState(ingredient?.alt_unit_id ?? '');
  const [rule, setRule] = useState(ingredient?.pick_rule ?? 'preferred');
  const [allergens, setAllergens] = useState(ingredient?.allergens ?? []);
  const [tags, setTags] = useState(ingredient?.tags ?? []);
  const [notes, setNotes] = useState(ingredient?.notes ?? '');
  const [active, setActive] = useState(ingredient?.is_active ?? true);
  const keyN = useRef(0);
  const [items, setItems] = useState((ingredient?.variants ?? []).map((v) => ({ ...v, key: `v${v.id}`, pack_size: v.pack_size ?? '', pack_unit_id: v.pack_unit_id, level_base: v.reorder_level ?? null })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const base = options.units.find((u) => String(u.id) === String(baseId));
  const alt = options.units.find((u) => String(u.id) === String(altId));
  const sameKind = options.units.filter((u) => base && u.dimension === base.dimension && u.id !== base.id);
  const packUnits = [base, alt].filter(Boolean);
  const levelFactor = base && alt ? Number(alt.to_base_factor) / Number(base.to_base_factor) : 1;   // base units in one alternate unit (1 kg = 1000 g)
  const levelUnit = (alt ?? base)?.code;

  const pickBase = (v) => {
    setBaseId(v);
    const b = options.units.find((u) => String(u.id) === String(v));
    if (alt && (!b || alt.dimension !== b.dimension || alt.id === b.id)) setAltId('');   // an alternate unit of another kind no longer fits
    setItems((xs) => xs.map((x) => ({ ...x, pack_unit_id: b?.id ?? '' })));
  };
  const pickAlt = (v) => {
    setAltId(v);
    setItems((xs) => xs.map((x) => ({ ...x, pack_unit_id: v || baseId })));   // pack sizes are typed in the bigger unit when there is one
  };
  const add = () => setItems((xs) => [...xs, { key: `n${++keyN.current}`, id: null, name: '', code: '', pack_size: '', pack_unit_id: altId || baseId, track_expiry: false, is_allowed: true, is_active: true, level_base: null }]);
  const patch = (key, p) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const move = (i, d) => setItems((xs) => { const ys = [...xs]; const j = i + d; if (j < 0 || j >= ys.length) return ys; [ys[i], ys[j]] = [ys[j], ys[i]]; return ys; });

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await menusAPI.saveStockIngredient({
        name, base_unit_id: Number(baseId), alt_unit_id: altId ? Number(altId) : null, pick_rule: rule, allergens, tags, notes: notes || null, is_active: active,
        variants: items.map((x) => ({
          id: x.id ?? undefined, name: x.name, code: x.code || null, pack_size: x.pack_size === '' ? null : Number(x.pack_size), pack_unit_id: x.pack_unit_id ? Number(x.pack_unit_id) : null,
          track_expiry: !!x.track_expiry, is_allowed: x.is_allowed, is_active: x.is_active, reorder_level: x.level_base == null || x.level_base === '' ? null : Number(x.level_base),
        })),
      }, ingredient?.id);
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the ingredient')); } finally { setBusy(false); }
  };

  return (
    <Modal title={ingredient ? 'Edit ingredient' : 'New ingredient'} onClose={onClose} width={760}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <Field label="Name" htmlFor="ing-name"><TextInput id="ing-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Wheat flour" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 10 }}>
            <Field label="Base unit" htmlFor="ing-base" hint="The smallest unit. Stock is kept in it.">
              <SelectInput id="ing-base" required value={baseId} onChange={(e) => pickBase(e.target.value)}>
                <option value="">Choose…</option>{options.units.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
              </SelectInput>
            </Field>
            <Field label="Alternate unit (optional)" htmlFor="ing-alt" hint="A bigger unit of the same kind, for buying and counting.">
              <SelectInput id="ing-alt" value={altId} disabled={!base} onChange={(e) => pickAlt(e.target.value)}>
                <option value="">None</option>{sameKind.map((u) => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
              </SelectInput>
            </Field>
            <Field label="When there are several variants" htmlFor="ing-rule">
              <SelectInput id="ing-rule" value={rule} onChange={(e) => setRule(e.target.value)}>{Object.entries(options.pick_rules).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>
            </Field>
          </div>

          <div>
            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>Variants, in order of preference (the kitchen takes the first, then the next)</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {items.map((x, i) => (
                <div key={x.key} data-testid="ingredient-item" style={{ ...card, padding: 10, display: 'grid', gridTemplateColumns: '22px 1.4fr 0.8fr 1fr auto', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textFaint }}>{i + 1}</span>
                  <TextInput aria-label="Variant name" maxLength={120} value={x.name} onChange={(e) => patch(x.key, { name: e.target.value })} placeholder="Exe 2 kg" />
                  <TextInput aria-label="Code" maxLength={40} value={x.code ?? ''} onChange={(e) => patch(x.key, { code: e.target.value })} placeholder="Code" />
                  <div style={{ display: 'flex', gap: 4 }}>
                    <NumberInput aria-label="Pack size" min="0" step="any" value={x.pack_size} onChange={(e) => patch(x.key, { pack_size: e.target.value })} placeholder="Pack size" />
                    {packUnits.length > 1
                      ? <SelectInput aria-label="Pack size unit" value={x.pack_unit_id ?? ''} onChange={(e) => patch(x.key, { pack_unit_id: e.target.value })} style={{ width: 70 }}>{packUnits.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}</SelectInput>
                      : <span style={{ alignSelf: 'center', fontSize: '0.78rem', color: colors.textMuted }}>{packUnits[0]?.code}</span>}
                  </div>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" aria-label="Prefer it more" style={iconBtn} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>
                    <button type="button" aria-label="Prefer it less" style={iconBtn} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>
                    <button type="button" aria-label="Remove" style={iconBtn} onClick={() => setItems((xs) => xs.filter((y) => y.key !== x.key))}><Trash2 size={14} /></button>
                  </span>
                  <span />
                  <div style={{ gridColumn: '2 / -1', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.72rem', color: colors.textMuted, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={x.is_allowed} onChange={(e) => patch(x.key, { is_allowed: e.target.checked })} /> may be used</label>
                    <label style={{ fontSize: '0.72rem', color: colors.textMuted, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={x.track_expiry} onChange={(e) => patch(x.key, { track_expiry: e.target.checked })} /> expires</label>
                    <label style={{ fontSize: '0.72rem', color: colors.textMuted, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={x.is_active} onChange={(e) => patch(x.key, { is_active: e.target.checked })} /> in use</label>
                    <label style={{ fontSize: '0.72rem', color: colors.textMuted, display: 'flex', gap: 6, alignItems: 'center' }} title="When a branch has less than this, What to buy suggests ordering it.">
                      keep at least
                      <NumberInput aria-label="Level to keep" min="0" step="any" style={{ width: 90 }} value={x.level_base == null || x.level_base === '' ? '' : Math.round((Number(x.level_base) / levelFactor) * 10000) / 10000}
                        onChange={(e) => patch(x.key, { level_base: e.target.value === '' ? null : Number(e.target.value) * levelFactor })} /> {levelUnit}
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" style={{ ...small, marginTop: 8 }} onClick={add}><Plus size={12} /> Add a variant</button>
            <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>
              The pack size is how much one pack holds{alt ? ` (in ${alt.code}, or ${base?.code})` : base ? ` (in ${base.code})` : ''}: an Exe 2 kg pack of a {base?.code ?? 'gram'} ingredient is 2{alt ? ` ${alt.code}` : ''}. With it, stock can be counted in packs: 10 packs of 2 kg is 20 kg.
            </p>
          </div>

          <Checks label="Allergens it contains" options={options.allergens} value={allergens} onChange={setAllergens} />
          <Checks label="What it is (for diet badges)" options={options.tags} value={tags} onChange={setTags} />
          <Field label="Note (optional)" htmlFor="ing-note"><TextInput id="ing-note" maxLength={255} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {ingredient && <CheckboxRow checked={active} onChange={setActive} label="In use" description="Switch off an ingredient you no longer buy. Recipes that use it will say so until they are changed." />}
          <ModalActions onCancel={onClose} submitLabel="Save ingredient" busy={busy} disabled={!name.trim() || !baseId} />
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

  const load = useCallback(() => {
    setLoading(true);
    menusAPI.stockIngredients().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the ingredients'))).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  const done = () => { setModal(null); load(); };
  const remove = async (i) => {
    if (!window.confirm(`Remove ${i.name} and its variants?`)) return;
    try { const res = await menusAPI.removeStockIngredient(i.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not remove')); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="ingredients" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="ingredients">
        <MenusNav />
        <HubHeader title="Ingredients" description="The smallest things the kitchen stocks. Each has a base unit and, if you like, a bigger one, and variants (Exe, Pembe, Soko) that are bought and counted." />
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 0 14px' }}>
          {canWrite && <button type="button" style={btnPrimary} onClick={() => setModal({ ingredient: null })}><Plus size={14} /> New ingredient</button>}
        </div>

        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {loading && !data ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : !(data?.ingredients?.length) ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No ingredients yet. Add the things recipes use, like flour, oil, tomatoes, then their variants.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Ingredient</th><th style={th}>Variants (in order)</th><th style={th}>Allergens</th><th style={th} /></tr></thead>
              <tbody>{data.ingredients.map((f) => (
                <tr key={f.id} style={f.is_active ? undefined : { opacity: 0.55 }}>
                  <td style={td}><strong>{f.name}</strong><div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{f.base_unit}{f.alt_unit ? ` and ${f.alt_unit}` : ''} · {data.pick_rules[f.pick_rule]?.toLowerCase()}{f.is_active ? '' : ' · not in use'}</div></td>
                  <td style={td}>{f.variants.length === 0 ? <span style={{ color: colors.textFaint }}>none yet</span> : f.variants.map((v, i) => (
                    <div key={v.id} style={v.is_allowed && v.is_active ? undefined : { textDecoration: 'line-through', color: colors.textFaint }}>
                      {i + 1}. {v.name}{v.pack_size != null ? ` · pack of ${v.pack_size} ${v.pack_unit}` : ''}{v.track_expiry ? ' · expires' : ''}
                    </div>
                  ))}</td>
                  <td style={td}><AllergenChips codes={f.allergens} names={data.allergens} empty={<span style={{ color: colors.textFaint }}>none</span>} /></td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {canWrite && <button type="button" style={small} onClick={() => setModal({ ingredient: f })}>Edit</button>}
                    {canWrite && <button type="button" style={small} onClick={() => remove(f)}>Remove</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {modal && data && <IngredientModal ingredient={modal.ingredient} options={data} onClose={() => setModal(null)} onDone={done} />}
    </AdminLayout>
  );
}
