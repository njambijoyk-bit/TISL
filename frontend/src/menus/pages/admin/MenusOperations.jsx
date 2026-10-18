import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Printer } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import { Field, NumberInput, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canViewMenus, canManageMenus } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import { Pill } from '../../components/FoodChips';
import { useMenusBranch } from '../../lib/menusBranch';
import StockScanBar from '../../components/StockScanBar';

const money = (n) => Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n) => Number(n).toLocaleString('en-KE', { maximumFractionDigits: 2 });
const tab = (on) => ({ padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.85rem', border: `1.5px solid ${on ? '#0f172a' : 'var(--line, #cbd5e1)'}`, background: on ? '#0f172a' : 'transparent', color: on ? '#fff' : 'inherit' });
const th = { textAlign: 'left', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: colors.textMuted, padding: '6px 8px' };
const td = { padding: '7px 8px', borderTop: '1px solid var(--line, #e5e7eb)', fontSize: '0.88rem' };
const tomorrow = () => { const d = new Date(Date.now() + 86400000); return d.toISOString().slice(0, 10); };

function Prep({ branch }) {
  const [date, setDate] = useState(tomorrow());
  const [buffer, setBuffer] = useState(10);
  const [data, setData] = useState(null);
  useEffect(() => { menusAPI.prep({ date, buffer, ...(branch ? { location_id: branch } : {}) }).then(setData).catch((e) => toast.error(errMsg(e, 'Could not work out the prep list'))); }, [date, buffer, branch]);

  return (
    <div data-testid="prep" style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }} className="no-print">
        <Field label="For the day" htmlFor="prep-date"><TextInput id="prep-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="A little extra (%)" htmlFor="prep-buffer"><NumberInput id="prep-buffer" min={0} max={100} value={buffer} onChange={(e) => setBuffer(Number(e.target.value) || 0)} /></Field>
        <button type="button" style={btnGhost} onClick={() => window.print()}><Printer size={14} aria-hidden="true" /> Print</button>
      </div>
      {!data ? <p style={{ color: colors.textMuted }}>Working it out…</p> : (
        <>
          <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>{data.weekday} {data.date}: what each dish sold on {data.weekday}s over the last {data.weeks} weeks, plus {data.buffer}% (or what is already ordered for the day, if that is more).</p>
          <section style={{ ...card, padding: 14 }} aria-label="Dishes">
            <h2 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800 }}>Dishes</h2>
            {data.dishes.length === 0 ? <p style={{ margin: 0, color: colors.textMuted }}>Nothing sold on this weekday yet, so there is nothing to forecast.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Dish</th><th style={th}>Usually</th><th style={th}>Ordered</th><th style={th}>Expect</th><th style={th}>On the shelf</th><th style={th}>Make</th></tr></thead>
                <tbody>
                  {data.dishes.map((d) => (
                    <tr key={d.dish_id} data-dish={d.name}>
                      <td style={td}><strong>{d.name}</strong> {d.mode === 'no_recipe' && <Pill>No recipe</Pill>}{d.mode === 'to_order' && <Pill>Made to order</Pill>}</td>
                      <td style={td}>{num(d.average)}</td><td style={td}>{num(d.booked)}</td><td style={td}><strong>{d.expect}</strong></td>
                      <td style={td}>{d.on_shelf == null ? '—' : num(d.on_shelf)}</td>
                      <td style={td}>{d.mode === 'ahead' ? (d.to_make > 0 ? <strong>{num(d.to_make)}{d.batches ? ` (${d.batches} batch${d.batches === 1 ? '' : 'es'})` : ''}</strong> : 'Enough') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section style={{ ...card, padding: 14 }} aria-label="Ingredients">
            <h2 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800 }}>Ingredients</h2>
            {data.ingredients.length === 0 ? <p style={{ margin: 0, color: colors.textMuted }}>No ingredients needed.</p> : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Ingredient</th><th style={th}>Needed</th><th style={th}>On the shelf</th><th style={th}>Short</th></tr></thead>
                <tbody>
                  {data.ingredients.map((i) => (
                    <tr key={i.key} data-ingredient={i.name}>
                      <td style={td}>{i.name}</td><td style={td}>{num(i.need)} {i.unit}</td><td style={td}>{num(i.on_hand)} {i.unit}</td>
                      <td style={td}>{i.short > 0 ? <Pill tone="danger">Short {num(i.short)} {i.unit}</Pill> : <Pill tone="ok">Enough</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Waste({ branch, canAct }) {
  const [data, setData] = useState(null);
  const [choices, setChoices] = useState({ items: [], dishes: [] });
  const [pick, setPick] = useState('');
  const [f, setF] = useState({ quantity: '', unit: 'base', kind: 'spoilage', note: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => menusAPI.waste(branch ? { location_id: branch } : undefined).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the waste log'))), [branch]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    Promise.all([menusAPI.stock(branch ? { location_id: branch } : undefined), menusAPI.dishes()]).then(([s, d]) => setChoices({
      items: s.ingredients.flatMap((i) => i.variants.filter((v) => v.is_active).map((v) => ({ id: v.id, label: `${i.name} — ${v.name}`, pack: v.pack_size_base, alt: i.alt_unit, base: i.base_unit }))),
      dishes: (d.dishes ?? []).map((x) => ({ id: x.id, label: x.name })),
    })).catch(() => {});
  }, [branch]);
  const chosen = pick.startsWith('i') ? choices.items.find((x) => `i${x.id}` === pick) : null;
  const units = chosen ? [...(chosen.pack ? [['pack', 'packs']] : []), ...(chosen.alt ? [['alt', chosen.alt]] : []), ['base', chosen.base]] : [];
  const choose = (v) => { setPick(v); const c = choices.items.find((x) => `i${x.id}` === v); setF((p) => ({ ...p, unit: c ? (c.pack ? 'pack' : c.alt ? 'alt' : 'base') : 'base' })); };
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try {
      const target = pick.startsWith('i') ? { item_id: Number(pick.slice(1)), unit: f.unit } : { dish_id: Number(pick.slice(1)) };
      const r = await menusAPI.recordWaste({ ...target, quantity: Number(f.quantity), kind: f.kind, note: f.note || undefined }, branch || undefined);
      toast.success(`Recorded: worth ${money(r.cost)}.`); setPick(''); setF({ quantity: '', unit: 'base', kind: f.kind, note: '' }); await load();
    } catch (err) { toast.error(errMsg(err, 'Could not record it'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const back = async (w) => { try { await menusAPI.voidWaste(w.id); toast.success('Taken back: the stock is returned.'); await load(); } catch (e) { toast.error(errMsg(e, 'Could not take it back'), { duration: 8000 }); } };

  if (!data) return <p style={{ color: colors.textMuted }}>Loading…</p>;
  if (!data.ready) return <p role="status" style={{ color: colors.textMuted }}>Run database script 185_menus_operations_own.sql to switch the waste log on.</p>;
  const r = data.report;

  return (
    <div data-testid="waste" style={{ display: 'grid', gap: 14 }}>
      {canAct && (
        <form onSubmit={save} aria-label="Record waste" style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>Record waste</h2>
          <Field label="What was wasted" htmlFor="w-what">
            <SelectInput id="w-what" value={pick} onChange={(e) => choose(e.target.value)}>
              <option value="">Choose an ingredient or a dish…</option>
              <optgroup label="Ingredients">{choices.items.map((x) => <option key={`i${x.id}`} value={`i${x.id}`}>{x.label}</option>)}</optgroup>
              <optgroup label="Dishes">{choices.dishes.map((x) => <option key={`d${x.id}`} value={`d${x.id}`}>{x.label}</option>)}</optgroup>
            </SelectInput>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Field label="How much" htmlFor="w-qty" hint={chosen ? undefined : 'For a dish, portions.'}><NumberInput id="w-qty" min="0" step="any" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></Field>
            {chosen && <Field label="In" htmlFor="w-unit"><SelectInput id="w-unit" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>{units.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</SelectInput></Field>}
            <Field label="Why" htmlFor="w-kind"><SelectInput id="w-kind" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(data.kinds).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</SelectInput></Field>
            <Field label="Note" htmlFor="w-note"><TextInput id="w-note" maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          </div>
          <div><button type="submit" style={{ ...btnPrimary, opacity: busy || !pick || !Number(f.quantity) ? 0.55 : 1 }} disabled={busy || !pick || !Number(f.quantity)}>{busy ? 'Recording…' : 'Record it'}</button></div>
        </form>
      )}
      {r && (
        <section style={{ ...card, padding: 14 }} aria-label="Last 30 days" data-testid="waste-report">
          <h2 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 800 }}>Last 30 days</h2>
          <p style={{ margin: '0 0 8px', fontSize: '1.3rem', fontWeight: 900 }}>{money(r.total)} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: colors.textMuted }}>{r.percent_of_sales != null ? `· ${r.percent_of_sales}% of food sales` : ''}</span></p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{r.by_kind.filter((k) => k.cost > 0).map((k) => <Pill key={k.kind}>{k.label}: {money(k.cost)}</Pill>)}</div>
          {r.by_item.length > 0 && <p style={{ margin: '10px 0 0', fontSize: '0.84rem' }}><strong>Most:</strong> {r.by_item.slice(0, 5).map((i) => `${i.name} (${money(i.cost)})`).join(', ')}</p>}
        </section>
      )}
      <section style={{ ...card, padding: 14 }} aria-label="Entries">
        <h2 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800 }}>Latest entries</h2>
        {data.recent.length === 0 ? <p style={{ margin: 0, color: colors.textMuted }}>Nothing recorded yet.</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Day</th><th style={th}>Item</th><th style={th}>How much</th><th style={th}>Why</th><th style={th}>Worth</th><th style={th} /></tr></thead>
            <tbody>
              {data.recent.map((w) => (
                <tr key={w.id} data-waste={w.item} style={{ opacity: w.voided ? 0.5 : 1 }}>
                  <td style={td}>{w.date}</td><td style={td}>{w.item}</td><td style={td}>{num(w.quantity)} {w.unit}</td><td style={td}>{w.kind_label}{w.note ? ` · ${w.note}` : ''}</td><td style={td}>{money(w.cost)}</td>
                  <td style={td}>{w.voided ? <Pill>Taken back</Pill> : canAct && <button type="button" style={btnGhost} onClick={() => back(w)}>Take back</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Buy({ branch, canAct }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState({});
  const [made, setMade] = useState(null);
  const [extra, setExtra] = useState([]);   // items added by scanning that the shelf did not ask for: { item_id, name, quantity, unit }
  const [busy, setBusy] = useState(false);
  useEffect(() => { setMade(null); menusAPI.reorder({ days, ...(branch ? { location_id: branch } : {}) }).then((r) => { setData(r); setPicked(Object.fromEntries(r.rows.filter((x) => x.supplier_id).map((x) => [x.item_id, true]))); }).catch((e) => toast.error(errMsg(e, 'Could not work out what to buy'))); }, [days, branch]);
  const chosen = useMemo(() => (data?.rows ?? []).filter((x) => picked[x.item_id]), [data, picked]);
  const total = chosen.length + extra.filter((x) => Number(x.quantity) > 0).length;
  const scanned = (v, m) => {
    const asked = (data?.rows ?? []).find((x) => x.item_id === v.id);
    if (asked) { if (asked.supplier_id) setPicked((p) => ({ ...p, [v.id]: true })); else toast.error(`${asked.name} has no supplier yet.`); return; }   // the shelf already asks for it: tick it
    setExtra((xs) => (xs.some((x) => x.item_id === v.id) ? xs.map((x) => (x.item_id === v.id ? { ...x, quantity: Number(x.quantity) + 1 } : x)) : [...xs, { item_id: v.id, name: m.label, quantity: 1, unit: m.unit_kind }]));
  };
  const make = async () => {
    setBusy(true);
    try { setMade(await menusAPI.makeOrders([...chosen.map((x) => ({ item_id: x.item_id, quantity: x.quantity, unit: x.unit_kind })), ...extra.filter((x) => Number(x.quantity) > 0).map((x) => ({ item_id: x.item_id, quantity: Number(x.quantity), unit: x.unit }))], branch || undefined)); } catch (e) { toast.error(errMsg(e, 'Could not make the orders'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <div data-testid="buy" style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}><Field label="Cover the next (days)" htmlFor="buy-days"><NumberInput id="buy-days" min={1} max={21} value={days} onChange={(e) => setDays(Math.max(1, Math.min(21, Number(e.target.value) || 7)))} /></Field></div>
      {!data ? <p style={{ color: colors.textMuted }}>Working it out…</p> : data.rows.length === 0 ? <p style={{ color: colors.textMuted }}>Nothing needs buying: the shelf covers the next {days} days.</p> : (
        <section style={{ ...card, padding: 14 }} aria-label="To buy">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th} /><th style={th}>Item</th><th style={th}>Buy</th><th style={th}>Needed</th><th style={th}>On the shelf</th><th style={th}>Keep</th><th style={th}>From</th></tr></thead>
            <tbody>
              {data.rows.map((x) => (
                <tr key={x.item_id} data-buy={x.name}>
                  <td style={td}><input type="checkbox" aria-label={`Order ${x.name}`} disabled={!x.supplier_id || !canAct} checked={Boolean(picked[x.item_id])} onChange={(e) => setPicked((p) => ({ ...p, [x.item_id]: e.target.checked }))} /></td>
                  <td style={td}><strong>{x.name}</strong>{x.reason === 'below_par' && <Pill tone="warn">Under its level</Pill>}</td>
                  <td style={td}><strong>{num(x.quantity)} {x.unit}</strong></td><td style={td}>{num(x.need)} {x.base_unit}</td><td style={td}>{num(x.on_hand)} {x.base_unit}</td><td style={td}>{x.par ? `${num(x.par)} ${x.base_unit}` : '—'}</td>
                  <td style={td}>{x.supplier ?? <Pill tone="warn">No supplier yet</Pill>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {canAct && <div style={{ marginTop: 12 }}><button type="button" style={{ ...btnPrimary, opacity: busy || total === 0 ? 0.55 : 1 }} disabled={busy || total === 0} onClick={make}>{busy ? 'Making…' : `Make orders for ${total} item${total === 1 ? '' : 's'}`}</button></div>}
          {made && (
            <div role="status" data-testid="made" style={{ marginTop: 12, fontSize: '0.88rem' }}>
              {made.created.map((o) => <p key={o.voucher_id} style={{ margin: '2px 0' }}>Purchase order {o.number} to {o.supplier}: {o.lines} item{o.lines === 1 ? '' : 's'}. Check and send it from Books.</p>)}
              {made.skipped.length > 0 && <p style={{ margin: '6px 0 0', color: colors.textMuted }}>Not ordered, no supplier known yet: {made.skipped.join(', ')}.</p>}
            </div>
          )}
        </section>
      )}
      {canAct && data && (
        <section aria-label="Add by scanning" data-testid="buy-scan" style={{ ...card, padding: 14, display: 'grid', gap: 10 }}>
          <StockScanBar variants={null} onItem={scanned} label="Add something by scanning" />
          {extra.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Added by scanning</th><th style={th}>How many</th><th style={th} /></tr></thead>
              <tbody>{extra.map((x) => (
                <tr key={x.item_id} data-extra={x.name}>
                  <td style={td}><strong>{x.name}</strong></td>
                  <td style={td}><input type="number" min="0" step="any" aria-label={`How many ${x.name}`} value={x.quantity} onChange={(e) => setExtra((xs) => xs.map((y) => (y.item_id === x.item_id ? { ...y, quantity: e.target.value } : y)))} style={{ width: 80, padding: '5px 8px', borderRadius: 6, border: '1.5px solid var(--line, #d1d5db)' }} /> {x.unit === 'pack' ? 'packs' : x.unit === 'alt' ? 'bigger units' : 'units'}</td>
                  <td style={td}><button type="button" style={{ ...btnGhost, padding: '3px 9px', fontSize: '0.74rem' }} onClick={() => setExtra((xs) => xs.filter((y) => y.item_id !== x.item_id))}>Remove</button></td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {data.rows.length === 0 && extra.length > 0 && <div><button type="button" style={{ ...btnPrimary, opacity: busy || total === 0 ? 0.55 : 1 }} disabled={busy || total === 0} onClick={make}>{busy ? 'Making…' : `Make orders for ${total} item${total === 1 ? '' : 's'}`}</button></div>}
        </section>
      )}
    </div>
  );
}

const isoDay = (d) => d.toISOString().slice(0, 10);

/** Why packaging was left off: what the rules asked for against what orders ended with, by item and by the reason the cashier gave. */
function PackagingReport({ branch }) {
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return isoDay(d); });
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [data, setData] = useState(null);
  useEffect(() => { setData(null); menusAPI.packagingReport({ from, to, ...(branch ? { location_id: branch } : {}) }).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the packaging report'))); }, [from, to, branch]);

  const t = data?.totals;

  return (
    <section data-testid="packaging-report" style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end' }}>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.74rem', fontWeight: 700 }}>From<input type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.tint(0.2)}` }} /></label>
        <label style={{ display: 'grid', gap: 4, fontSize: '0.74rem', fontWeight: 700 }}>To<input type="date" aria-label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)} style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.tint(0.2)}` }} /></label>
      </div>
      {!data && <p style={{ color: colors.textMuted }}>Loading…</p>}
      {data && !data.ready && <p role="status" style={{ color: colors.textMuted }}>Run database scripts 207 to 209 first: until then packaging is not kept with orders.</p>}
      {data?.ready && t.orders === 0 && <p style={{ color: colors.textMuted }}>No order with packaging in this period.</p>}
      {data?.ready && t.orders > 0 && (
        <>
          <dl data-testid="packaging-totals" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {[['Orders', t.orders], ['Asked for', t.asked], ['Given', t.given], ['Left off', t.left_off], ['Lines changed', t.lines_changed], ['Swapped', t.swapped], ['Waived', num(t.waived)]].map(([k, v]) => (
              <div key={k} style={{ ...card, padding: 12 }}><dt style={{ fontSize: '0.7rem', color: colors.textFaint, textTransform: 'uppercase' }}>{k}</dt><dd style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>{v}</dd></div>
            ))}
          </dl>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={{ textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', color: colors.textFaint }}>Item</th><th style={{ textAlign: 'right', padding: '8px 10px', fontSize: '0.68rem', color: colors.textFaint }}>Asked</th><th style={{ textAlign: 'right', padding: '8px 10px', fontSize: '0.68rem', color: colors.textFaint }}>Given</th><th style={{ textAlign: 'right', padding: '8px 10px', fontSize: '0.68rem', color: colors.textFaint }}>Left off</th><th style={{ textAlign: 'right', padding: '8px 10px', fontSize: '0.68rem', color: colors.textFaint }}>Orders changed</th></tr></thead>
              <tbody>{data.by_item.map((i) => (
                <tr key={i.name} data-testid="packaging-item"><td style={{ padding: '8px 10px', fontSize: '0.82rem', borderTop: `1px solid ${colors.tint(0.06)}` }}><strong>{i.name}</strong></td>{[i.asked, i.given, i.left_off, i.times_changed].map((v, k) => <td key={k} style={{ padding: '8px 10px', fontSize: '0.82rem', textAlign: 'right', borderTop: `1px solid ${colors.tint(0.06)}` }}>{v}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
          {data.by_reason.length > 0 && (
            <div style={{ ...card, padding: 14 }} data-testid="packaging-reasons">
              <h3 style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 800 }}>Why it was left off</h3>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4, fontSize: '0.84rem' }}>
                {data.by_reason.map((r) => <li key={r.reason ?? 'none'}><strong>{r.reason ? r.reason : 'No reason given'}</strong>: {r.times} time{r.times === 1 ? '' : 's'}, {r.units} left off</li>)}
              </ul>
            </div>
          )}
          {data.latest.length > 0 && (
            <div style={{ ...card, padding: 14 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 800 }}>Latest changes</h3>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4, fontSize: '0.8rem' }}>
                {data.latest.map((l, i) => <li key={i}>{l.order} · {l.item}: asked {l.asked}, given {l.given}{l.source === 'swapped' ? ' (swapped)' : ''}{l.source === 'added' ? ' (added)' : ''}{l.reason ? ` · "${l.reason}"` : ''}{l.waived > 0 ? ` · waived ${num(l.waived)}${l.by ? ` by ${l.by}` : ''}` : ''}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Menus → Operations: tomorrow's prep list, the waste log, what to buy and why packaging was left off. */
export default function MenusOperations() {
  const user = useAuthStore((s) => s.user);
  const canAct = canManageMenus(user);
  const [which, setWhich] = useState('prep');
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useMenusBranch(branches);
  useEffect(() => { menusAPI.prep({ date: tomorrow() }).then((r) => { setBranches(r.branches ?? []); setBranch((b) => b || String(r.location_id ?? '')); }).catch(() => {}); }, [setBranch]);

  if (!canViewMenus(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="kitchen operations" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} data-testid="menus-operations">
        <HubHeader title="Operations" description="What to make tomorrow, what was wasted, and what to buy." />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }} className="no-print">
          <div role="tablist" aria-label="Operations" style={{ display: 'flex', gap: 8 }}>
            {[['prep', 'Prep list'], ['waste', 'Waste'], ['buy', 'What to buy'], ['packaging', 'Packaging']].map(([k, n]) => <button key={k} type="button" role="tab" aria-selected={which === k} onClick={() => setWhich(k)} style={tab(which === k)}>{n}</button>)}
          </div>
          {branches.length > 1 && <SelectInput aria-label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} style={{ width: 'auto' }}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</SelectInput>}
        </div>
        {which === 'prep' && <Prep branch={branch} />}
        {which === 'waste' && <Waste branch={branch} canAct={canAct} />}
        {which === 'buy' && <Buy branch={branch} canAct={canAct} />}
        {which === 'packaging' && <PackagingReport branch={branch} />}
      </div>
    </AdminLayout>
  );
}
