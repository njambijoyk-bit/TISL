import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import menusAPI from '../../_shared/api/menus';
import { Field, FormStack, NumberInput, TextInput } from '../../core/components/admin/ui/Form';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors } from '../../_shared/theme/tokens';

const toggle = (xs, v) => (xs.includes(v) ? xs.filter((x) => x !== v) : [...xs, v]);

/** One way to order: on or off, how long the kitchen needs, the gap between times, how it may be paid, which menus it shows. */
function Channel({ c, data, canEdit, onSaved }) {
  const [f, setF] = useState({ ...c, payment_modes: c.payment_modes ?? ['online', 'later'], menu_ids: c.menu_ids ?? [], shipping_option_ids: c.shipping_option_ids ?? [], note: c.note ?? '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const num = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value === '' ? '' : Number(e.target.value) }));
  const delivery = c.order_type === 'delivery';
  const simple = ['counter', 'kiosk'].includes(c.order_type);   // the till and the kiosk are on or off and show chosen menus: no times, no payment choice

  const save = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.saveChannel(c.id, {
        is_active: f.is_active, prep_minutes: Number(f.prep_minutes), slot_minutes: Number(f.slot_minutes), max_days_ahead: Number(f.max_days_ahead), allow_asap: f.allow_asap, payment_modes: f.payment_modes,
        menu_ids: f.menu_ids.length ? f.menu_ids : null, shipping_option_ids: delivery && f.shipping_option_ids.length ? f.shipping_option_ids : null, min_order: Number(f.min_order) || 0, note: f.note || null,
      });
      toast.success(r.message); onSaved();
    } catch (e) { toast.error(errMsg(e, 'Could not save'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <section aria-label={c.name} data-channel={c.code} style={{ ...card, padding: 16, display: 'grid', gap: 12 }}>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 800 }}>
        <input type="checkbox" checked={Boolean(f.is_active)} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, is_active: e.target.checked }))} /> {c.name} is {f.is_active ? 'on' : 'off'}
      </label>
      <FormStack gap={12}>
        {!simple && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          <Field label="Kitchen needs (minutes)" htmlFor={`${c.code}-prep`}><NumberInput id={`${c.code}-prep`} min={0} max={240} value={f.prep_minutes} disabled={!canEdit} onChange={num('prep_minutes')} /></Field>
          <Field label="Times are (minutes apart)" htmlFor={`${c.code}-slot`}><NumberInput id={`${c.code}-slot`} min={5} max={120} value={f.slot_minutes} disabled={!canEdit} onChange={num('slot_minutes')} /></Field>
          <Field label="Order up to (days ahead)" htmlFor={`${c.code}-days`}><NumberInput id={`${c.code}-days`} min={0} max={14} value={f.max_days_ahead} disabled={!canEdit} onChange={num('max_days_ahead')} /></Field>
          <Field label="Smallest order (before tax)" htmlFor={`${c.code}-min`}><NumberInput id={`${c.code}-min`} min={0} step="0.01" value={f.min_order} disabled={!canEdit} onChange={num('min_order')} /></Field>
        </div>}
        {!simple && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={Boolean(f.allow_asap)} disabled={!canEdit} onChange={(e) => setF((x) => ({ ...x, allow_asap: e.target.checked }))} /> Offer “as soon as possible”</label>}
        {!simple && <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.86rem' }}>
          <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>How customers may pay</legend>
          {Object.entries(data.payment_modes).map(([k, name]) => <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.payment_modes.includes(k)} disabled={!canEdit} onChange={() => setF((x) => ({ ...x, payment_modes: toggle(x.payment_modes, k) }))} /> {name}</label>)}
        </fieldset>}
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.86rem' }}>
          <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Menus it shows (none ticked = all)</legend>
          {data.menus.map((m) => <label key={m.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.menu_ids.includes(m.id)} disabled={!canEdit} onChange={() => setF((x) => ({ ...x, menu_ids: toggle(x.menu_ids, m.id) }))} /> {m.name}</label>)}
        </fieldset>
        {delivery && (
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.86rem' }}>
            <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Delivery methods (none ticked = all active ones; set the prices under Shipping)</legend>
            {data.shipping_options.length === 0 && <span style={{ color: colors.textFaint }}>No delivery method is set up yet: add one under Shipping first.</span>}
            {data.shipping_options.map((o) => <label key={o.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={f.shipping_option_ids.includes(o.id)} disabled={!canEdit} onChange={() => setF((x) => ({ ...x, shipping_option_ids: toggle(x.shipping_option_ids, o.id) }))} /> {o.name}</label>)}
          </fieldset>
        )}
        {!simple && <Field label="A line shown at checkout" htmlFor={`${c.code}-note`} hint="For example: Delivery within 5 km of the restaurant."><TextInput id={`${c.code}-note`} maxLength={300} value={f.note} disabled={!canEdit} onChange={set('note')} /></Field>}
        {canEdit && <div><button type="button" style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : `Save ${c.name}`}</button></div>}
      </FormStack>
    </section>
  );
}

/** Menus → Settings → Ways to order. */
export default function ChannelsCard({ canEdit }) {
  const [data, setData] = useState(null);
  const load = () => menusAPI.channels().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the ways to order')));
  useEffect(() => { load(); }, []);
  if (!data) return null;
  const online = data.channels.filter((c) => ['pickup', 'delivery', 'counter', 'kiosk'].includes(c.order_type));

  return (
    <div style={{ marginTop: 22, display: 'grid', gap: 12 }} data-testid="channels">
      <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Ways to order online</h2>
      <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Switch on the ways customers can order from the public menu. Nothing is taken until you switch one on.</p>
      {online.map((c) => <Channel key={`${c.id}-${c.updated_at}`} c={c} data={data} canEdit={canEdit} onSaved={load} />)}
    </div>
  );
}
