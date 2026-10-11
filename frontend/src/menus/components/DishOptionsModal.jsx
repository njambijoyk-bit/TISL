import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../core/components/admin/ui/Modal';
import { Field, FormError, FormStack, ModalActions, NumberInput, SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import menusAPI from '../../_shared/api/menus';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, colors } from '../../_shared/theme/tokens';

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 3 };
const swap = (xs, i, d) => { const ys = [...xs]; const j = i + d; if (j < 0 || j >= ys.length) return ys; [ys[i], ys[j]] = [ys[j], ys[i]]; return ys; };
const blankOption = () => ({ name: '', price_delta: 0, is_default: false, is_active: true, charge_removal: false, linked_dish_id: null, uses: [] });
const blankGroup = () => ({ name: '', kind: 'single', min_choices: 0, max_choices: null, options: [blankOption()] });
const removesOnly = (o) => o.uses.length > 0 && o.uses.every((u) => u.mode === 'remove') && !o.linked_dish_id;

/** The choices on one dish: size, sides, extras, things to leave out. A choice has a price change and may use more of an ingredient or leave a recipe line out; leaving something out is free unless you charge for it. */
export default function DishOptionsModal({ dish, onClose, onDone }) {
  const [data, setData] = useState(null);
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => { menusAPI.dishOptions(dish.id).then((r) => { setData(r); setGroups(r.groups); }).catch((e) => setErr(errMsg(e, 'Could not load the choices'))); }, [dish.id]);

  const patchGroup = (gi, p) => setGroups((xs) => xs.map((g, n) => (n === gi ? { ...g, ...p } : g)));
  const patchOption = (gi, oi, p) => setGroups((xs) => xs.map((g, n) => (n === gi ? { ...g, options: g.options.map((o, m) => (m === oi ? { ...o, ...p } : o)) } : g)));
  const patchUse = (gi, oi, ui, p) => patchOption(gi, oi, { uses: groups[gi].options[oi].uses.map((u, k) => (k === ui ? { ...u, ...p } : u)) });

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await menusAPI.saveDishOptions(dish.id, groups.map((g) => ({
        ...(g.id ? { id: g.id } : {}), name: g.name, kind: g.kind, min_choices: Number(g.min_choices) || 0, max_choices: g.kind === 'multiple' && g.max_choices ? Number(g.max_choices) : null,
        options: g.options.map((o) => ({
          ...(o.id ? { id: o.id } : {}), name: o.name, price_delta: Number(o.price_delta) || 0, is_default: o.is_default, is_active: o.is_active, charge_removal: o.charge_removal, linked_dish_id: o.linked_dish_id || null,
          uses: o.uses.filter((u) => u.family_id || u.variant_id).map((u) => ({ mode: u.mode, family_id: u.family_id || null, variant_id: u.variant_id || null, quantity: u.mode === 'add' ? Number(u.quantity) || 0 : null, unit_id: u.mode === 'add' && u.unit_id ? Number(u.unit_id) : null })),
        })),
      })));
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the choices')); } finally { setBusy(false); }
  };

  const target = (u) => (u.family_id ? `f${u.family_id}` : u.variant_id ? `v${u.variant_id}` : '');
  const pickTarget = (gi, oi, ui, v) => patchUse(gi, oi, ui, v.startsWith('f') ? { family_id: Number(v.slice(1)), variant_id: null } : v.startsWith('v') ? { variant_id: Number(v.slice(1)), family_id: null } : { family_id: null, variant_id: null });

  return (
    <Modal title="Choices" subtitle={dish.name} onClose={onClose} width={820}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          {!data && !err && <p style={{ color: colors.textMuted, fontSize: '0.82rem' }}>Loading…</p>}
          {data && groups.map((g, gi) => (
            <div key={g.id ?? `new${gi}`} data-testid="option-group" style={{ border: `1px solid ${colors.tint(0.16)}`, borderRadius: 12, padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 70px 70px auto', gap: 8, alignItems: 'end' }}>
                <Field label="Group" htmlFor={`g${gi}-name`}><TextInput id={`g${gi}-name`} maxLength={120} value={g.name} placeholder="Size, Side, Extras…" onChange={(e) => patchGroup(gi, { name: e.target.value })} /></Field>
                <Field label="People" htmlFor={`g${gi}-kind`}><SelectInput id={`g${gi}-kind`} value={g.kind} onChange={(e) => patchGroup(gi, { kind: e.target.value })}><option value="single">Pick one</option><option value="multiple">Pick several</option></SelectInput></Field>
                <Field label="At least" htmlFor={`g${gi}-min`}><NumberInput id={`g${gi}-min`} min="0" max="50" value={g.min_choices} onChange={(e) => patchGroup(gi, { min_choices: e.target.value })} /></Field>
                <Field label="At most" htmlFor={`g${gi}-max`}><NumberInput id={`g${gi}-max`} min="1" max="50" disabled={g.kind === 'single'} value={g.kind === 'single' ? 1 : g.max_choices ?? ''} onChange={(e) => patchGroup(gi, { max_choices: e.target.value })} /></Field>
                <span style={{ whiteSpace: 'nowrap', paddingBottom: 6 }}>
                  <button type="button" aria-label="Move group up" style={iconBtn} onClick={() => setGroups((xs) => swap(xs, gi, -1))}><ArrowUp size={14} /></button>
                  <button type="button" aria-label="Move group down" style={iconBtn} onClick={() => setGroups((xs) => swap(xs, gi, 1))}><ArrowDown size={14} /></button>
                  <button type="button" aria-label="Remove group" style={iconBtn} onClick={() => setGroups((xs) => xs.filter((_, n) => n !== gi))}><Trash2 size={14} /></button>
                </span>
              </div>
              <p style={{ margin: '4px 0 8px', fontSize: '0.7rem', color: colors.textFaint }}>{g.min_choices > 0 ? 'People must choose.' : 'People may skip this group.'} Tick “usual” on the choice that applies when nobody picks.</p>

              {g.options.map((o, oi) => (
                <div key={o.id ?? `n${oi}`} data-testid="option" style={{ borderTop: `1px solid ${colors.tint(0.08)}`, padding: '8px 0' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 100px 1.4fr auto', gap: 8, alignItems: 'center' }}>
                    <TextInput aria-label={`Choice ${oi + 1} of ${g.name || 'the group'}`} maxLength={120} value={o.name} placeholder="Large, No onion, Extra cheese…" onChange={(e) => patchOption(gi, oi, { name: e.target.value })} />
                    <NumberInput step="any" aria-label={`Price change of ${o.name || 'the choice'}`} value={removesOnly(o) && !o.charge_removal ? 0 : o.price_delta} disabled={removesOnly(o) && !o.charge_removal}
                      title={removesOnly(o) && !o.charge_removal ? 'Leaving something out is free' : 'Added to the price (before tax)'} onChange={(e) => patchOption(gi, oi, { price_delta: e.target.value })} />
                    <SelectInput aria-label={`Another dish as ${o.name || 'the choice'}`} value={o.linked_dish_id ?? ''} onChange={(e) => patchOption(gi, oi, { linked_dish_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Not a dish</option>{data.dishes.map((d) => <option key={d.id} value={d.id}>Dish: {d.name}</option>)}
                    </SelectInput>
                    <span style={{ whiteSpace: 'nowrap' }}>
                      <button type="button" aria-label="Move choice up" style={iconBtn} onClick={() => patchGroup(gi, { options: swap(g.options, oi, -1) })}><ArrowUp size={13} /></button>
                      <button type="button" aria-label="Move choice down" style={iconBtn} onClick={() => patchGroup(gi, { options: swap(g.options, oi, 1) })}><ArrowDown size={13} /></button>
                      <button type="button" aria-label="Remove choice" style={iconBtn} onClick={() => patchGroup(gi, { options: g.options.filter((_, m) => m !== oi) })}><Trash2 size={13} /></button>
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '4px 0', fontSize: '0.72rem', color: colors.textMuted }}>
                    <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={o.is_default} onChange={(e) => patchOption(gi, oi, { is_default: e.target.checked })} /> usual</label>
                    <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={o.is_active} onChange={(e) => patchOption(gi, oi, { is_active: e.target.checked })} /> offered</label>
                    {removesOnly(o) && <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={o.charge_removal} onChange={(e) => patchOption(gi, oi, { charge_removal: e.target.checked })} /> charge for leaving it out</label>}
                  </div>
                  {o.uses.map((u, ui) => (
                    <div key={ui} data-testid="option-use" style={{ display: 'grid', gridTemplateColumns: '130px 1.6fr 90px 90px 24px', gap: 6, alignItems: 'center', marginTop: 4 }}>
                      <SelectInput aria-label="What it does" value={u.mode} onChange={(e) => patchUse(gi, oi, ui, { mode: e.target.value, family_id: null, variant_id: null })}><option value="add">Uses more of</option><option value="remove">Leaves out</option></SelectInput>
                      <SelectInput aria-label="Which ingredient" value={target(u)} onChange={(e) => pickTarget(gi, oi, ui, e.target.value)}>
                        <option value="">Choose…</option>
                        {u.mode === 'add'
                          ? data.families.map((f) => <option key={f.id} value={`f${f.id}`}>{f.name} ({f.unit})</option>)
                          : data.recipe_lines.map((l) => <option key={l.family_id ? `f${l.family_id}` : `v${l.variant_id}`} value={l.family_id ? `f${l.family_id}` : `v${l.variant_id}`}>{l.name}</option>)}
                      </SelectInput>
                      <NumberInput aria-label="How much" step="any" min="0" disabled={u.mode === 'remove'} value={u.mode === 'remove' ? '' : u.quantity ?? ''} placeholder="amount" onChange={(e) => patchUse(gi, oi, ui, { quantity: e.target.value })} />
                      <SelectInput aria-label="Unit" disabled={u.mode === 'remove'} value={u.unit_id ?? ''} onChange={(e) => patchUse(gi, oi, ui, { unit_id: e.target.value })}><option value="">its unit</option>{data.units.map((x) => <option key={x.id} value={x.id}>{x.code}</option>)}</SelectInput>
                      <button type="button" aria-label="Remove this change" style={iconBtn} onClick={() => patchOption(gi, oi, { uses: o.uses.filter((_, k) => k !== ui) })}><Trash2 size={13} /></button>
                    </div>
                  ))}
                  <button type="button" style={{ ...small, marginTop: 6 }} onClick={() => patchOption(gi, oi, { uses: [...o.uses, { mode: 'add', family_id: null, variant_id: null, quantity: '', unit_id: '' }] })}>The kitchen uses…</button>
                </div>
              ))}
              <button type="button" style={small} onClick={() => patchGroup(gi, { options: [...g.options, blankOption()] })}>Add a choice</button>
            </div>
          ))}
          {data && <div><button type="button" style={small} onClick={() => setGroups((xs) => [...xs, blankGroup()])}>Add a group of choices</button></div>}
          <ModalActions onCancel={onClose} submitLabel="Save choices" busy={busy} disabled={!data} />
        </FormStack>
      </form>
    </Modal>
  );
}
