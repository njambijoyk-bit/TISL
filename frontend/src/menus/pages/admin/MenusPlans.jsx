import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Printer, Soup } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, NumberInput, SelectInput, TextArea, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canReadFinance, canWriteFinance } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import { Pill } from '../../components/FoodChips';
import MenusNav from '../../components/MenusNav';

const money = (n) => Number(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const label = (s) => new Date(`${s}T12:00:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
const TONE = { pending: 'warn', active: 'ok', paused: 'neutral', cancelled: 'danger' };

function PlanForm({ plan, data, onClose, onDone }) {
  const [f, setF] = useState({ name: plan?.name ?? '', description: plan?.description ?? '', location_id: plan?.location_id ?? data.locations[0]?.id ?? '', cycle_weeks: plan?.cycle_weeks ?? 1, day_price: plan?.day_price ?? '',
    delivery_weekdays: plan?.delivery_weekdays ?? [1, 2, 3, 4, 5], min_days: plan?.min_days ?? 1, cutoff_hours: plan?.cutoff_hours ?? 24, slot_from: plan?.slot_from ?? '12:00', slot_to: plan?.slot_to ?? '14:00', is_active: plan?.is_active ?? true });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggle = (d) => setF((x) => ({ ...x, delivery_weekdays: x.delivery_weekdays.includes(d) ? x.delivery_weekdays.filter((i) => i !== d) : [...x.delivery_weekdays, d] }));
  const save = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.savePlan({ ...f, location_id: Number(f.location_id), cycle_weeks: Number(f.cycle_weeks), day_price: Number(f.day_price), min_days: Number(f.min_days), cutoff_hours: Number(f.cutoff_hours) }, plan?.id);
      toast.success(r.message); onDone();
    } catch (e) { toast.error(errMsg(e, 'Could not save the plan'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={plan ? `Edit ${plan.name}` : 'New meal plan'} onClose={onClose} width={620} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save plan" busy={busy} disabled={!f.name.trim() || !f.day_price} />}>
      <FormStack>
        <Field label="Name" htmlFor="pl-name"><TextInput id="pl-name" maxLength={120} value={f.name} onChange={set('name')} placeholder="Office lunch" /></Field>
        <Field label="What it is" htmlFor="pl-desc"><TextArea id="pl-desc" rows={3} maxLength={3000} value={f.description} onChange={set('description')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Field label="Price for each delivery day" htmlFor="pl-price" hint="Before tax, all of that day's dishes together."><NumberInput id="pl-price" min="0" step="any" value={f.day_price} onChange={set('day_price')} /></Field>
          <Field label="Menu repeats after (weeks)" htmlFor="pl-cycle"><NumberInput id="pl-cycle" min="1" max="4" value={f.cycle_weeks} onChange={set('cycle_weeks')} /></Field>
          <Field label="Kitchen" htmlFor="pl-loc"><SelectInput id="pl-loc" value={f.location_id} onChange={set('location_id')}>{data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field>
        </div>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.86rem' }}>
          <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Delivers on</legend>
          {DAYS.map(([d, t]) => <label key={d} style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={f.delivery_weekdays.includes(d)} onChange={() => toggle(d)} /> {t}</label>)}
        </fieldset>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <Field label="Fewest days a week" htmlFor="pl-min"><NumberInput id="pl-min" min="1" max="7" value={f.min_days} onChange={set('min_days')} /></Field>
          <Field label="Skip up to (hours before)" htmlFor="pl-cut"><NumberInput id="pl-cut" min="6" max="168" value={f.cutoff_hours} onChange={set('cutoff_hours')} /></Field>
          <Field label="Delivery from" htmlFor="pl-from"><TextInput id="pl-from" type="time" value={f.slot_from} onChange={set('slot_from')} /></Field>
          <Field label="Delivery until" htmlFor="pl-to"><TextInput id="pl-to" type="time" value={f.slot_to} onChange={set('slot_to')} /></Field>
        </div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Taking new subscribers</label>
      </FormStack>
    </Modal>
  );
}

function MenuGrid({ plan, data, onClose, onDone }) {
  const cell = (w, d) => plan.menu.find((m) => m.week_no === w && m.weekday === d)?.dishes.map((x) => x.id) ?? [];
  const [grid, setGrid] = useState(() => { const g = {}; for (let w = 1; w <= plan.cycle_weeks; w += 1) plan.delivery_weekdays.forEach((d) => { g[`${w}-${d}`] = cell(w, d); }); return g; });
  const [busy, setBusy] = useState(false);
  const setCell = (key, i, id) => setGrid((g) => { const list = [...(g[key] ?? [])]; if (id === '') list.splice(i, 1); else list[i] = Number(id); return { ...g, [key]: list.filter((x, k, a) => a.indexOf(x) === k) }; });
  const save = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.savePlanMenu(plan.id, Object.entries(grid).map(([k, ids]) => { const [w, d] = k.split('-').map(Number); return { week_no: w, weekday: d, dish_ids: ids }; }));
      toast.success(r.message); onDone();
    } catch (e) { toast.error(errMsg(e, 'Could not save the menu'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Menu · ${plan.name}`} subtitle="The dishes that go out each delivery day. A day with no dish is not delivered that week." onClose={onClose} width={900} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save menu" busy={busy} />}>
      <div style={{ display: 'grid', gap: 16 }} data-testid="menu-grid">
        {Array.from({ length: plan.cycle_weeks }, (_, i) => i + 1).map((w) => (
          <section key={w} aria-label={`Week ${w}`}>
            {plan.cycle_weeks > 1 && <h3 style={{ margin: '0 0 6px', fontSize: '0.88rem', fontWeight: 800 }}>Week {w}</h3>}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${plan.delivery_weekdays.length}, minmax(120px, 1fr))`, gap: 8 }}>
              {plan.delivery_weekdays.map((d) => {
                const key = `${w}-${d}`;
                const list = grid[key] ?? [];

                return (
                  <div key={key} style={{ ...card, padding: 8, display: 'grid', gap: 4, alignContent: 'start' }}>
                    <strong style={{ fontSize: '0.78rem' }}>{DAYS.find((x) => x[0] === d)[1]}</strong>
                    {[...list, ''].map((id, i) => (
                      <SelectInput key={i} aria-label={`Week ${w} ${DAYS.find((x) => x[0] === d)[1]} dish ${i + 1}`} value={id} onChange={(e) => setCell(key, i, e.target.value)} style={{ fontSize: '0.78rem' }}>
                        <option value="">{i < list.length ? 'Remove' : 'Add a dish…'}</option>
                        {data.dishes.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </SelectInput>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}

function DayTab() {
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return iso(d); });
  const [d, setD] = useState(null);
  useEffect(() => { menusAPI.planDay(date).then(setD).catch((e) => toast.error(errMsg(e, 'Could not load the day'))); }, [date]);

  return (
    <div style={{ display: 'grid', gap: 12 }} data-testid="plans-day">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextInput aria-label="Day" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
        <button type="button" style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => window.print()}><Printer size={13} aria-hidden="true" /> Print</button>
      </div>
      {!d ? <p style={{ fontSize: '0.82rem', color: colors.textMuted }}>Loading…</p> : d.stops.length === 0 ? <p style={{ margin: 0, fontSize: '0.84rem', color: colors.textFaint }}>No paid meal plan deliveries on {label(date)}.</p> : (
        <>
          <section style={{ ...card, padding: 14 }} aria-label="To cook">
            <h3 style={{ margin: '0 0 6px', fontSize: '0.9rem', fontWeight: 800 }}>To cook for {label(date)} · {d.stops.length} deliveries</h3>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 2, fontSize: '0.9rem' }}>{d.dishes.map((x) => <li key={x.name}><strong>{x.count} ×</strong> {x.name}</li>)}</ul>
          </section>
          <section aria-label="Deliveries" style={{ display: 'grid', gap: 8 }}>
            {d.stops.map((s) => (
              <div key={s.subscription} data-stop={s.subscription} style={{ ...card, padding: 12, display: 'grid', gap: 3, fontSize: '0.86rem' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}><strong>{s.name}</strong><a href={`tel:${s.phone}`}>{s.phone}</a><span style={{ color: colors.textMuted }}>{s.window} · {s.plan}</span>{s.status === 'ordered' && <Pill tone="ok">In the kitchen</Pill>}</div>
                <div>{s.address}</div>
                <div style={{ color: colors.textMuted }}>{s.dishes.join(', ')}</div>
                {s.stock_note && <div style={{ color: '#b45309', fontSize: '0.78rem' }}>{s.stock_note}</div>}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}

/** Menus → Meal plans: the plans and their rotating menus, who has subscribed, and what to cook and where to deliver on a day. */
export default function MenusPlans() {
  const user = useAuthStore((s) => s.user);
  const canAct = canWriteFinance(user);
  const [tab, setTab] = useState('plans');
  const [data, setData] = useState(null);
  const [subs, setSubs] = useState(null);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(null);
  const [menu, setMenu] = useState(null);

  const load = useCallback(() => menusAPI.plans().then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the plans'))), []);
  const loadSubs = useCallback(() => menusAPI.planSubscribers(status ? { status } : undefined).then(setSubs).catch((e) => toast.error(errMsg(e, 'Could not load the subscribers'))), [status]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'subscribers') loadSubs(); }, [tab, loadSubs]);

  const run = async (fn, after) => { try { const r = await fn(); toast.success(r.message); await after(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } };
  const remove = (p) => { if (!window.confirm(`Remove ${p.name}?`)) return undefined; return run(() => menusAPI.removePlan(p.id), load); };
  const act = (s, action) => {
    let payload;
    if (action === 'cancel') { const reason = window.prompt('Cancel this plan? Say why (the customer is told):', ''); if (reason === null) return undefined; payload = { reason }; }

    return run(() => menusAPI.planAct(s.id, action, payload), loadSubs);
  };

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="meal plans" /></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1180, margin: '0 auto' }} data-testid="menus-plans">
        <MenusNav />
        <HubHeader title="Meal plans" description="A rotating weekly menu delivered on the days a customer chooses, paid a week ahead. Switch it on under Menus → Settings." />
        {data && data.ready === false && <p role="status" style={{ ...card, padding: 14, fontSize: '0.85rem' }}>Run database script 150_menus_plans.sql first.</p>}
        <div role="tablist" aria-label="Meal plans" style={{ display: 'flex', gap: 8, margin: '0 0 16px', flexWrap: 'wrap' }}>
          {[['plans', 'Plans'], ['subscribers', 'Subscribers'], ['day', 'A day: cook and deliver']].map(([k, t]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{ ...(tab === k ? btnPrimary : btnGhost), padding: '7px 16px', fontSize: '0.82rem' }}>{t}</button>
          ))}
          <span style={{ flex: 1 }} />
          {canAct && <button type="button" style={{ ...btnGhost, padding: '7px 14px', fontSize: '0.8rem' }} onClick={() => run(menusAPI.runPlans, async () => { await load(); if (tab === 'subscribers') await loadSubs(); })}>Run now</button>}
        </div>

        {tab === 'plans' && data?.ready && (
          <div style={{ display: 'grid', gap: 12 }}>
            {canAct && <div><button type="button" style={{ ...btnPrimary, padding: '7px 16px', fontSize: '0.82rem' }} onClick={() => setForm({})}><Plus size={14} aria-hidden="true" /> New plan</button></div>}
            {data.plans.length === 0 && <p style={{ margin: 0, fontSize: '0.84rem', color: colors.textFaint }}>No plans yet.</p>}
            {data.plans.map((p) => (
              <article key={p.id} data-plan={p.name} style={{ ...card, padding: 14, display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '1rem', display: 'inline-flex', gap: 6, alignItems: 'center' }}><Soup size={16} aria-hidden="true" /> {p.name}</strong>
                  <span style={{ fontSize: '0.86rem' }}>{money(p.day_price)} a delivery day</span>
                  {!p.is_active && <Pill tone="neutral">Not taking new subscribers</Pill>}
                  <Pill tone="ok">{p.subscribers} subscriber{p.subscribers === 1 ? '' : 's'}</Pill>
                </div>
                <div style={{ fontSize: '0.82rem', color: colors.textMuted }}>{p.delivery_weekdays.map((d) => DAYS.find((x) => x[0] === d)[1]).join(', ')} · {p.slot_from}–{p.slot_to} · menu repeats every {p.cycle_weeks} week{p.cycle_weeks === 1 ? '' : 's'} · skip up to {p.cutoff_hours} h before</div>
                <div style={{ fontSize: '0.82rem' }}>{p.menu.length === 0 ? <em style={{ color: '#b45309' }}>No menu yet: choose the dishes for each day.</em> : `${p.menu.reduce((n, m) => n + m.dishes.length, 0)} dishes placed over ${p.menu.length} day${p.menu.length === 1 ? '' : 's'}.`}</div>
                {canAct && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" style={{ ...btnPrimary, padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => setMenu(p)}>Edit the menu</button>
                    <button type="button" style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.78rem' }} onClick={() => setForm(p)}>Change</button>
                    <button type="button" style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.78rem', color: '#b91c1c' }} onClick={() => remove(p)}>Remove</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {tab === 'subscribers' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: '0.82rem' }}>Show
              <SelectInput aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 'auto' }}><option value="">Everyone</option>{subs && Object.entries(subs.statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput>
            </label>
            {!subs ? <p style={{ fontSize: '0.82rem', color: colors.textMuted }}>Loading…</p> : subs.subscribers.length === 0 ? <p style={{ margin: 0, fontSize: '0.84rem', color: colors.textFaint }}>Nobody yet.</p> : subs.subscribers.map((s) => (
              <article key={s.id} data-subscriber={s.number} style={{ ...card, padding: 12, display: 'grid', gap: 4, fontSize: '0.86rem' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <strong>{s.name}</strong><span>{s.number}</span><Pill tone={TONE[s.status]}>{s.status_label}</Pill><span style={{ color: colors.textMuted }}>{s.plan}</span>
                  {s.unpaid > 0 && <Pill tone="warn">Unpaid {money(s.unpaid)}</Pill>}{s.credit_days > 0 && <Pill tone="neutral">{s.credit_days} day(s) owed</Pill>}{s.refund_due > 0 && <Pill tone="danger">Give back {money(s.refund_due)}</Pill>}
                </div>
                <div style={{ color: colors.textMuted }}>{s.phone} · {s.address}</div>
                <div style={{ color: colors.textMuted }}>{s.weekdays.map((d) => DAYS.find((x) => x[0] === d)[1]).join(', ')} · from {label(s.start_date)}{s.next_delivery ? ` · next ${label(s.next_delivery)}` : ''}{s.paused_from ? ` · paused from ${label(s.paused_from)}${s.paused_until ? ` to ${label(s.paused_until)}` : ''}` : ''}</div>
                {canAct && s.status !== 'cancelled' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {s.status === 'paused' ? <button type="button" style={{ ...btnPrimary, padding: '4px 12px', fontSize: '0.76rem' }} onClick={() => act(s, 'resume')}>Resume</button> : s.status === 'active' && <button type="button" style={{ ...btnGhost, padding: '4px 12px', fontSize: '0.76rem' }} onClick={() => act(s, 'pause')}>Pause</button>}
                    <button type="button" style={{ ...btnGhost, padding: '4px 12px', fontSize: '0.76rem', color: '#b91c1c' }} onClick={() => act(s, 'cancel')}>Cancel</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {tab === 'day' && <DayTab />}
      </div>
      {form && data && <PlanForm plan={form.id ? form : null} data={data} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
      {menu && data && <MenuGrid plan={menu} data={data} onClose={() => setMenu(null)} onDone={() => { setMenu(null); load(); }} />}
    </AdminLayout>
  );
}
