import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import Finder from './Finder';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const CONDITIONS = ['new', 'excellent', 'good', 'fair', 'poor', 'damaged'];
const equipmentName = (i) => `${i.name}${i.detail ? ` · ${i.detail}` : ''}`;
const vendorName = (v) => `${v.name}${v.number ? ` · ${v.number}` : ''}`;
const lookPlant = async (q) => (await projectsAPI.findPlant(q)).items;
const lookVendors = async (q) => (await projectsAPI.findVendors(q)).vendors;
const row = { display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 12 };
const quiet = { fontSize: 12, color: 'var(--text-secondary)' };

/**
 * Plant on a piece of work (docs/PROJECTS_STAGE10_SPEC.md, build 10.2): equipment from the asset register issued to the work and returned,
 * bookings ahead (an overlap with another work is warned about), and plant hired in on a vendor order.
 */
export default function PlantPanel({ projectId }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);   // { mode: 'issue' | 'book' | 'hire', ... }
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => { try { setData(await projectsAPI.plant(projectId)); } catch (e) { setProblem(message(e, 'The plant could not be loaded.')); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return problem ? <Notice status="problem">{problem}</Notice> : null;
  if (!data.ready) return <Notice>The site is not set up yet. Run script 267.</Notice>;
  const run = async (fn, done) => {
    try { const r = await fn(); setData(r); setProblem(''); if (r.clashes?.length) toast(`Booked, but it overlaps: ${r.clashes.join('; ')}`, { icon: '⚠️' }); else if (done) toast.success(done); return true; } catch (e) { setProblem(message(e, 'That could not be done.')); return false; }
  };
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const send = async (e) => {
    e.preventDefault();
    const f = form;
    let ok = false;
    if (f.mode === 'hire') ok = await run(() => projectsAPI.hirePlant(projectId, { what: f.what, vendor_id: f.vendor?.id ?? null, vendor_order_id: f.order ? Number(f.order) : null, starts_on: f.starts_on, ends_on: f.ends_on || null, note: f.note || null }), 'On hire');
    else if (!f.item) { setProblem('Choose the equipment from the list.'); return; }
    else if (f.mode === 'book') ok = await run(() => projectsAPI.bookPlant(projectId, { item_id: f.item.id, instance_id: f.piece ? Number(f.piece) : null, quantity: f.item.serialized ? 1 : Number(f.quantity || 1), starts_on: f.starts_on, ends_on: f.ends_on, note: f.note || null }), 'Booked');
    else ok = await run(() => projectsAPI.issuePlant(projectId, f.item.serialized ? { instance_id: Number(f.piece), back_by: f.back_by || null, condition: f.condition } : { item_id: f.item.id, quantity: Number(f.quantity), back_by: f.back_by || null, condition: f.condition }), 'Issued to the work');
    if (ok) setForm(null);
  };
  const today = new Date().toISOString().slice(0, 10);
  const giveBack = (h) => { const c = window.prompt(`What condition is ${h.name} in? (${CONDITIONS.join(', ')})`, h.condition || 'good'); if (c) run(() => projectsAPI.returnPlant(projectId, h.id, { condition: c.trim().toLowerCase() }), 'Returned'); };
  const offHire = (h) => { const on = window.prompt(`The day ${h.what} went off hire (YYYY-MM-DD)`, today); if (on) run(() => projectsAPI.offHirePlant(projectId, h.id, { on }), 'Off hire'); };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {problem && <Notice status="problem">{problem}</Notice>}
      {form && (
        <Panel data-plant-form>
          <PanelTitle>{{ issue: 'Issue to the work', book: 'Book ahead', hire: 'Hire in' }[form.mode]}</PanelTitle>
          <form onSubmit={send} style={grid}>
            {form.mode !== 'hire' && <>
              <Field label="Equipment" htmlFor="pl-item"><Finder id="pl-item" value={form.item} onChange={(item) => set({ item, piece: '' })} look={lookPlant} label={equipmentName} placeholder="Name, make or model" /></Field>
              {form.item?.serialized && <Field label={form.mode === 'book' ? 'Which one (optional)' : 'Which one'} htmlFor="pl-piece"><SelectInput id="pl-piece" value={form.piece} onChange={(e) => set({ piece: e.target.value })} required={form.mode === 'issue'}>
                <option value="">{form.mode === 'book' ? 'Any of them' : 'Choose'}</option>{form.item.pieces.map((p) => <option key={p.id} value={p.id} disabled={form.mode === 'issue' && !p.free}>{p.tag}{p.free ? '' : ' (out)'}</option>)}</SelectInput></Field>}
              {form.item && !form.item.serialized && <Field label={`How many (${form.item.available} free)`} htmlFor="pl-qty"><TextInput id="pl-qty" type="number" min="1" step="any" value={form.quantity ?? ''} onChange={(e) => set({ quantity: e.target.value })} required /></Field>}
            </>}
            {form.mode === 'hire' && <>
              <Field label="What" htmlFor="pl-what"><TextInput id="pl-what" value={form.what} maxLength={200} onChange={(e) => set({ what: e.target.value })} required /></Field>
              <Field label="Vendor (optional)" htmlFor="pl-vendor"><Finder id="pl-vendor" value={form.vendor} onChange={(vendor) => set({ vendor, order: '' })} look={lookVendors} label={vendorName} placeholder="Name or number" /></Field>
              {form.vendor && <Field label="Vendor order (optional)" htmlFor="pl-order"><SelectInput id="pl-order" value={form.order} onChange={(e) => set({ order: e.target.value })}><option value="">None yet</option>{form.vendor.orders.map((o) => <option key={o.id} value={o.id}>{o.number} ({o.status})</option>)}</SelectInput></Field>}
            </>}
            {form.mode === 'issue' ? <>
              <Field label="Back by (optional)" htmlFor="pl-back"><TextInput id="pl-back" type="date" value={form.back_by} onChange={(e) => set({ back_by: e.target.value })} /></Field>
              <Field label="Condition" htmlFor="pl-cond"><SelectInput id="pl-cond" value={form.condition} onChange={(e) => set({ condition: e.target.value })}>{CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}</SelectInput></Field>
            </> : <>
              <Field label={form.mode === 'hire' ? 'On hire from' : 'From'} htmlFor="pl-from"><TextInput id="pl-from" type="date" value={form.starts_on} onChange={(e) => set({ starts_on: e.target.value })} required /></Field>
              <Field label={form.mode === 'hire' ? 'Off hire (optional)' : 'To'} htmlFor="pl-to"><TextInput id="pl-to" type="date" value={form.ends_on} onChange={(e) => set({ ends_on: e.target.value })} required={form.mode === 'book'} /></Field>
            </>}
            <span style={{ display: 'flex', gap: 6, alignItems: 'end' }}><Btn type="submit" small variant="primary">{{ issue: 'Issue it', book: 'Book it', hire: 'Put it on hire' }[form.mode]}</Btn><Btn small onClick={() => setForm(null)}>Cancel</Btn></span>
          </form>
        </Panel>
      )}

      <Panel data-plant-held>
        <PanelTitle hint="Equipment from the asset register that this work holds now" right={data.can.issue && data.inventory && !form ? <Btn small onClick={() => setForm({ mode: 'issue', item: null, piece: '', quantity: '', back_by: '', condition: 'good' })}>Issue to the work</Btn> : null}>On the work</PanelTitle>
        {!data.inventory && <Notice>The asset register is not set up, so owned plant cannot be issued. Hired plant still can.</Notice>}
        {data.inventory && data.holding.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing from the asset register is on this work.</p>}
        {data.holding.map((h) => (
          <div key={h.id} data-plant-holding={h.name} style={row}>
            <span><strong>{h.name}</strong>{h.tag ? ` ${h.tag}` : ''}{h.quantity !== 1 ? ` × ${h.quantity}` : ''} <span style={quiet}>· since {day(h.since)}{h.back_by ? ` · back by ${day(h.back_by)}` : ''}</span></span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{h.late && <Chip status="problem">Due back</Chip>}{data.can.issue && <Btn small variant="quiet" onClick={() => giveBack(h)}>Return</Btn>}</span>
          </div>
        ))}
      </Panel>

      <Panel data-plant-bookings>
        <PanelTitle hint="Booked ahead; an overlap with another work is warned about" right={data.can.book && data.inventory && !form ? <Btn small onClick={() => setForm({ mode: 'book', item: null, piece: '', quantity: '1', starts_on: today, ends_on: '', note: '' })}>Book ahead</Btn> : null}>Bookings</PanelTitle>
        {data.bookings.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing booked.</p>}
        {data.bookings.map((b) => (
          <div key={b.id} data-plant-booking={b.id} style={row}>
            <span style={{ display: 'grid', gap: 2 }}>
              <span><strong>{b.name}</strong>{b.tag ? ` ${b.tag}` : ''}{b.quantity !== 1 ? ` × ${b.quantity}` : ''} <span style={quiet}>· {day(b.starts_on)} to {day(b.ends_on)}</span></span>
              {b.clashes.map((c) => <span key={c} style={{ fontSize: 12 }}><Chip status="warning">Overlaps</Chip> {c}</span>)}
            </span>
            {data.can.book && <Btn small variant="quiet" onClick={() => run(() => projectsAPI.cancelPlantBooking(projectId, b.id), 'Booking cancelled')}>Cancel</Btn>}
          </div>
        ))}
      </Panel>

      <Panel data-plant-hires>
        <PanelTitle hint="Plant hired in; its cost is its vendor order" right={data.can.book && !form ? <Btn small onClick={() => setForm({ mode: 'hire', what: '', vendor: null, order: '', starts_on: today, ends_on: '', note: '' })}>Hire in</Btn> : null}>Hired</PanelTitle>
        {data.hires.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing hired.</p>}
        {data.hires.map((h) => (
          <div key={h.id} data-plant-hire={h.what} style={row}>
            <span><strong>{h.what}</strong> <span style={quiet}>· {h.vendor ?? 'no vendor named'}{h.order ? ` · ${h.order.number}` : ''} · from {day(h.starts_on)}{h.ends_on ? ` to ${day(h.ends_on)}` : ''}</span></span>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <Chip status={h.state === 'on_hire' ? 'info' : 'neutral'}>{h.state === 'on_hire' ? 'On hire' : 'Off hire'}</Chip>
              {h.state === 'on_hire' && data.can.book && <><Btn small variant="quiet" onClick={() => offHire(h)}>Off hire</Btn><Btn small variant="quiet" onClick={() => run(() => projectsAPI.offHirePlant(projectId, h.id, { cancel: true }), 'Cancelled')}>Cancel</Btn></>}
            </span>
          </div>
        ))}
      </Panel>
    </div>
  );
}
