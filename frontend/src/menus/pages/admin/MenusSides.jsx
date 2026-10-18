import { useCallback, useEffect, useState } from 'react';
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

/**
 * Menus → Sides: what is served (ugali, pilau, kale, a soda). A side is made from a recipe of its own, or is a ready-to-serve ingredient sold as it is. It says how much goes in a serving of
 * each size; a size with no amount of its own gets the side's amount (1 for a soda). Dishes are built from sides in a later step.
 */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top' };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const num = (n, dp = 3) => (n == null ? '—' : Number(n).toLocaleString('en-KE', { maximumFractionDigits: dp }));

function SideModal({ side, data, onClose, onDone }) {
  const [name, setName] = useState(side?.name ?? '');
  const [source, setSource] = useState(side ? (side.recipe_id ? `r:${side.recipe_id}` : `i:${side.ingredient_id}`) : '');
  const [unitId, setUnitId] = useState(side?.unit_id ?? '');
  const [base, setBase] = useState(side?.base_amount ?? 1);
  const [amounts, setAmounts] = useState(Object.fromEntries((side?.amounts ?? []).map((a) => [a.serving_id, a.amount])));
  const [station, setStation] = useState(side?.station_id ?? '');
  const [note, setNote] = useState(side?.note ?? '');
  const [active, setActive] = useState(side?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const chosen = source.startsWith('r:') ? data.recipes.find((r) => `r:${r.id}` === source) : data.ingredients.find((i) => `i:${i.id}` === source);
  const own = chosen?.unit ?? '';
  const units = chosen?.dimension ? data.units.filter((u) => u.dimension === chosen.dimension) : [];
  const shown = unitId ? data.units.find((u) => String(u.id) === String(unitId))?.code : own;

  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      const res = await menusAPI.saveSide({
        name, ...(source.startsWith('r:') ? { recipe_id: Number(source.slice(2)) } : { ingredient_id: Number(source.slice(2)) }), unit_id: unitId ? Number(unitId) : null, base_amount: Number(base) || 0,
        station_id: station ? Number(station) : null, note: note || null, is_active: active,
        amounts: data.servings.map((s) => ({ serving_id: s.id, amount: amounts[s.id] === undefined || amounts[s.id] === '' ? '' : Number(amounts[s.id]) })),
      }, side?.id);
      toast.success(res.message); onDone();
    } catch (x) { setErr(errMsg(x, 'Could not save the side')); } finally { setBusy(false); }
  };

  return (
    <Modal title={side ? `Side: ${side.name}` : 'Add a side'} onClose={onClose} width={680}>
      <form onSubmit={go}>
        <FormStack>
          <FormError message={err} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Name" htmlFor="sd-name" hint="As the guest and the kitchen know it: Ugali, Kale, Coke."><TextInput id="sd-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Made from" htmlFor="sd-src" hint="A recipe of its own, or a ready-to-serve ingredient sold as it is.">
              <SelectInput id="sd-src" required value={source} onChange={(e) => { setSource(e.target.value); setUnitId(''); }}>
                <option value="">Choose…</option>
                {data.recipes.length > 0 && <optgroup label="Recipes of their own">{data.recipes.map((r) => <option key={`r${r.id}`} value={`r:${r.id}`}>{r.name} (counted in {r.unit})</option>)}</optgroup>}
                {data.ingredients.length > 0 && <optgroup label="Ready to serve">{data.ingredients.map((i) => <option key={`i${i.id}`} value={`i:${i.id}`}>{i.name} (counted in {i.unit})</option>)}</optgroup>}
              </SelectInput>
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Amounts are written in" htmlFor="sd-unit" hint={chosen ? `Empty: ${own}. Grams for a recipe counted in kilograms is fine.` : 'Choose what it is made from first.'}>
              <SelectInput id="sd-unit" value={unitId} disabled={!units.length} onChange={(e) => setUnitId(e.target.value)}>
                <option value="">{own || '—'}</option>
                {units.filter((u) => u.code !== own).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
              </SelectInput>
            </Field>
            <Field label={`In a serving${shown ? ` (${shown})` : ''}`} htmlFor="sd-base" hint="Used for a serving size that has no amount of its own below. A soda is 1."><NumberInput id="sd-base" required min="0.0001" step="any" value={base} onChange={(e) => setBase(e.target.value)} /></Field>
          </div>
          {data.servings.length > 0 ? (
            <div data-testid="side-amounts">
              <div style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, marginBottom: 6 }}>How much goes in each serving size{shown ? ` (${shown})` : ''}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                {data.servings.map((s) => (
                  <Field key={s.id} label={s.name} htmlFor={`sd-a-${s.id}`}><NumberInput id={`sd-a-${s.id}`} min="0" step="any" placeholder="same as above" value={amounts[s.id] ?? ''} onChange={(e) => setAmounts((a) => ({ ...a, [s.id]: e.target.value }))} /></Field>
                ))}
              </div>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>{data.servings_ready ? 'No serving sizes yet: add Jumbo, Medium, Kids under Menus, Configuration to give each its own amount.' : 'Run database script 193_menus_config_foundation.sql to keep serving sizes.'}</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
            <Field label="Station" htmlFor="sd-station" hint="Where it is usually made."><SelectInput id="sd-station" value={station} onChange={(e) => setStation(e.target.value)}><option value="">Not set</option>{data.stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput></Field>
            <Field label="Note (optional)" htmlFor="sd-note"><TextInput id="sd-note" maxLength={255} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> On</label>
          <ModalActions onCancel={onClose} submitLabel="Save side" busy={busy} disabled={!name.trim() || !source} />
        </FormStack>
      </form>
    </Modal>
  );
}

function FromDishes({ onClose, onDone }) {
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { menusAPI.sidesFromDishes().then(setPlan).catch((e) => setErr(errMsg(e, 'Could not work out what to do'))); }, []);
  const go = async () => {
    setBusy(true); setErr(null);
    try { const res = await menusAPI.makeSidesFromDishes(); toast.success(res.message, { duration: 7000 }); onDone(); } catch (x) { setErr(errMsg(x, 'Could not make the sides')); } finally { setBusy(false); }
  };
  return (
    <Modal title="Make sides from the dishes' recipes" onClose={onClose} width={720}>
      <FormStack>
        <FormError message={err} />
        <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>
          For each dish below, its recipe is copied into a recipe of its own (the same amounts, method and times, counted in portions) and a side of that name is made from the copy, with one portion in a serving.
          The dish keeps its own recipe, so selling works exactly as it does now. Doing it again copies only what is not done yet.
        </p>
        {!plan ? <p style={{ color: colors.textMuted }}>Loading…</p> : !plan.pending.length ? <p style={{ margin: 0 }}>Nothing to do: every dish with a recipe has a side.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="from-dishes-plan">
            <thead><tr><th style={th}>Dish</th><th style={th}>Becomes the side</th><th style={th}>Recipe</th></tr></thead>
            <tbody>{plan.pending.map((p) => <tr key={p.dish_id}><td style={td}>{p.dish}</td><td style={td}><strong>{p.name}</strong></td><td style={td}>{p.lines} line{p.lines === 1 ? '' : 's'}, {p.made_to_order ? 'made to order' : 'made ahead'}</td></tr>)}</tbody>
          </table>
        )}
        <ModalActions onCancel={onClose} submitLabel="Make the sides" busy={busy} disabled={!plan?.pending?.length} onSubmit={go} />
      </FormStack>
    </Modal>
  );
}

export default function MenusSides() {
  const user = useAuthStore((s) => s.user);
  const canWrite = canManageMenus(user);
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    menusAPI.sides().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the sides'))).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (s) => {
    if (!window.confirm(`Remove the side ${s.name}?`)) return;
    try { const res = await menusAPI.removeSide(s.id); toast.success(res.message); load(); } catch (x) { toast.error(errMsg(x, 'Could not remove the side'), { duration: 8000 }); }
  };

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="sides" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="sides">
        <HubHeader title="Sides" description="What is served: ugali, pilau, kale, a soda. A side is made from a recipe of its own, or is a ready-to-serve ingredient. Each says how much goes in a serving of each size. Dishes are built from sides." />
        {data && !data.ready && <p role="status" style={{ ...card, padding: 14, fontSize: '0.82rem', marginBottom: 14 }}>Run database script 200_menus_sides.sql first (and 194 before it): until then sides can not be saved.</p>}
        {data?.ready && data.from_dishes && !data.from_dishes.ready && <p role="status" style={{ ...card, padding: 14, fontSize: '0.82rem', marginBottom: 14 }}>Run database script 201_menus_sides_from_dishes.sql to make sides from the dishes you already have.</p>}
        {canWrite && data?.ready && data.from_dishes?.ready && data.from_dishes.pending > 0 && (
          <div style={{ ...card, padding: 14, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }} data-testid="from-dishes-banner">
            <span style={{ fontSize: '0.84rem' }}><strong>{data.from_dishes.pending}</strong> dish{data.from_dishes.pending === 1 ? ' has' : 'es have'} a recipe but no side yet. Sides can be made from them in one go; nothing about the dishes changes.</span>
            <button type="button" style={btnPrimary} onClick={() => setModal({ from: true })}>Make sides from the dishes&apos; recipes</button>
          </div>
        )}
        {canWrite && data?.ready && <div style={{ marginBottom: 14 }}><button type="button" style={btnPrimary} onClick={() => setModal({ side: null })}>Add a side</button></div>}
        <div style={{ ...card, padding: 0, overflowX: 'auto' }} data-testid="sides-list">
          {loading && !data ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : !data?.sides?.length ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No sides yet. Add one for each thing you serve, made from a recipe of its own (Menus, Recipes) or from a ready-to-serve ingredient.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Side</th><th style={th}>Made from</th><th style={th}>Amount in a serving</th><th style={th}>Station</th><th style={th} /></tr></thead>
              <tbody>{data.sides.map((s) => (
                <tr key={s.id} style={s.is_active ? undefined : { opacity: 0.55 }}>
                  <td style={td}><strong>{s.name}</strong>{s.note && <div style={{ color: colors.textMuted }}>{s.note}</div>}</td>
                  <td style={td}>{s.made_from}<div style={{ color: colors.textMuted }}>{s.kind === 'recipe' ? 'recipe' : 'ready to serve'}</div></td>
                  <td style={td}>
                    {s.amounts.map((a) => <div key={a.serving_id}>{a.serving}: {num(a.amount)} {s.unit}</div>)}
                    <div style={{ color: s.amounts.length ? colors.textMuted : undefined }}>{s.amounts.length ? 'Other sizes' : 'Every size'}: {num(s.base_amount)} {s.unit}</div>
                  </td>
                  <td style={td}>{s.station ?? '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {canWrite && <button type="button" style={small} onClick={() => setModal({ side: s })}>Edit</button>}
                    {canWrite && <button type="button" style={small} onClick={() => remove(s)}>Remove</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
      {modal && !modal.from && data && <SideModal side={modal.side} data={data} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.from && <FromDishes onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </AdminLayout>
  );
}
