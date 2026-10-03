import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import resourcesAPI from '../../../../_shared/api/resources';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, card, colors, input } from '../../../../_shared/theme/tokens';

/**
 * Staff, rooms, tables and equipment that can be booked. Each has weekly working hours, time off, how many bookings it can hold
 * at once, a gap before and after each booking, and the services it can do. A staff member must already have an employee record.
 */

const TYPES = { staff: 'Staff', room: 'Room', table: 'Table', equipment: 'Equipment' };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const small = { ...input, padding: '6px 8px', fontSize: '0.82rem' };
const note = { margin: '0 0 8px', fontSize: '0.74rem', color: colors.textFaint };
const ghost = { ...small, width: 'auto', cursor: 'pointer' };

function Hours({ r, onSaved }) {
  const [rows, setRows] = useState(r.hours);
  const [busy, setBusy] = useState(false);
  const dayRows = (wd) => rows.map((h, i) => ({ ...h, i })).filter((h) => h.weekday === wd);
  const patch = (i, p) => setRows((rs) => rs.map((h, k) => (k === i ? { ...h, ...p } : h)));
  const save = async () => {
    setBusy(true);
    try { onSaved(await resourcesAPI.saveHours(r.id, rows)); } catch (e) { toast.error(errMsg(e, 'Could not save the hours')); } finally { setBusy(false); }
  };
  return (
    <div>
      <p style={note}>When can this be booked? A day with no hours is a day off. Add two rows for a lunch break.</p>
      {DAYS.map((name, wd) => (
        <div key={wd} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0', flexWrap: 'wrap' }}>
          <span style={{ width: 90, fontSize: '0.8rem' }}>{name}</span>
          {dayRows(wd).map((h) => (
            <span key={h.i} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <input type="time" value={h.starts_at} onChange={(e) => patch(h.i, { starts_at: e.target.value })} style={{ ...small, width: 110 }} />–
              <input type="time" value={h.ends_at} onChange={(e) => patch(h.i, { ends_at: e.target.value })} style={{ ...small, width: 110 }} />
              <button type="button" style={ghost} onClick={() => setRows((rs) => rs.filter((_, k) => k !== h.i))} aria-label="Remove">×</button>
            </span>
          ))}
          <button type="button" style={ghost} onClick={() => setRows((rs) => [...rs, { weekday: wd, starts_at: '09:00', ends_at: '17:00' }])}>+ hours</button>
        </div>
      ))}
      <button type="button" style={{ ...btnPrimary, marginTop: 8 }} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save hours'}</button>
    </div>
  );
}

function TimeOff({ r, onSaved }) {
  const [f, setF] = useState({ starts_at: '', ends_at: '', reason: '' });
  const add = async () => {
    try { onSaved(await resourcesAPI.addTimeOff(r.id, f)); setF({ starts_at: '', ends_at: '', reason: '' }); } catch (e) { toast.error(errMsg(e, 'Could not add time off')); }
  };
  const del = async (id) => { try { onSaved(await resourcesAPI.removeTimeOff(r.id, id)); } catch (e) { toast.error(errMsg(e, 'Could not remove it')); } };
  return (
    <div>
      <p style={note}>Leave, holidays, maintenance — nothing can be booked in these times.</p>
      {r.time_off.map((t) => (
        <div key={t.id} style={{ fontSize: '0.8rem', margin: '3px 0' }}>
          {new Date(t.starts_at).toLocaleString()} → {new Date(t.ends_at).toLocaleString()} {t.reason && `· ${t.reason}`} <button type="button" style={ghost} onClick={() => del(t.id)}>Remove</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        <input type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} style={{ ...small, width: 200 }} />
        <input type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} style={{ ...small, width: 200 }} />
        <input placeholder="Reason (optional)" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} style={{ ...small, width: 200 }} />
        <button type="button" style={ghost} disabled={!f.starts_at || !f.ends_at} onClick={add}>Add time off</button>
      </div>
    </div>
  );
}

function Services({ r, services, onSaved }) {
  const [sel, setSel] = useState(() => r.services.map((s) => `${s.service_id}:${s.service_variant_id ?? ''}`));
  const toggle = (k) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const save = async () => {
    try {
      onSaved(await resourcesAPI.saveServices(r.id, sel.map((k) => { const [a, b] = k.split(':'); return { service_id: Number(a), service_variant_id: b ? Number(b) : null }; })));
      toast.success('Saved');
    } catch (e) { toast.error(errMsg(e, 'Could not save')); }
  };
  return (
    <div>
      <p style={note}>Tick what {r.name} can do. Tick the whole service, or only some of its packages.</p>
      {!services.length && <p style={note}>No services yet.</p>}
      <div style={{ maxHeight: 240, overflow: 'auto' }}>
        {services.map((s) => (
          <div key={s.id} style={{ margin: '3px 0', fontSize: '0.8rem' }}>
            <label><input type="checkbox" checked={sel.includes(`${s.id}:`)} onChange={() => toggle(`${s.id}:`)} /> {s.name}</label>
            {s.packages.map((p) => <label key={p.id} style={{ marginLeft: 16, color: colors.textMuted }}><input type="checkbox" checked={sel.includes(`${s.id}:${p.id}`)} onChange={() => toggle(`${s.id}:${p.id}`)} /> {p.name}</label>)}
          </div>
        ))}
      </div>
      <button type="button" style={{ ...btnPrimary, marginTop: 8 }} onClick={save}>Save services</button>
    </div>
  );
}

function Slots({ r }) {
  const [date, setDate] = useState('');
  const [duration, setDuration] = useState(60);
  const [slots, setSlots] = useState(null);
  const go = async () => { try { setSlots((await resourcesAPI.slots(r.id, { date, duration })).slots); } catch (e) { toast.error(errMsg(e, 'Could not check')); } };
  return (
    <div>
      <p style={note}>Check what a customer would be offered on a day.</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...small, width: 160 }} />
        <label style={{ fontSize: '0.78rem', color: colors.textMuted }}>Length <input type="number" min="5" value={duration} onChange={(e) => setDuration(e.target.value)} style={{ ...small, width: 80 }} /> min</label>
        <button type="button" style={ghost} disabled={!date} onClick={go}>Show free times</button>
      </div>
      {slots && <p style={{ fontSize: '0.8rem', marginTop: 8 }}>{slots.length ? slots.map((s) => (typeof s === 'string' ? s : s.starts_at ?? JSON.stringify(s))).map((s) => (/T/.test(s) ? new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : s)).join(' · ') : 'Nothing free that day.'}</p>}
    </div>
  );
}

function Editor({ r, data, onSaved }) {
  const [tab, setTab] = useState('hours');
  const [f, setF] = useState({ name: r.name, location_id: r.location_id ?? '', capacity: r.capacity, buffer_before_min: r.buffer_before_min, buffer_after_min: r.buffer_after_min, notes: r.notes ?? '' });
  const save = async () => {
    try {
      onSaved(await resourcesAPI.update(r.id, { ...f, location_id: f.location_id || null, capacity: Number(f.capacity) || 1, buffer_before_min: Number(f.buffer_before_min) || 0, buffer_after_min: Number(f.buffer_after_min) || 0 }));
      toast.success('Saved');
    } catch (e) { toast.error(errMsg(e, 'Could not save')); }
  };
  const toggleActive = async () => {
    try { onSaved(r.is_active ? await resourcesAPI.remove(r.id) : await resourcesAPI.update(r.id, { ...f, is_active: true, location_id: f.location_id || null })); } catch (e) { toast.error(errMsg(e, 'Could not change')); }
  };
  return (
    <div style={{ padding: '4px 0 8px' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ fontSize: '0.74rem', color: colors.textMuted }}>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ ...small, display: 'block', width: 180 }} /></label>
        <label style={{ fontSize: '0.74rem', color: colors.textMuted }}>Branch
          <select value={f.location_id} onChange={(e) => setF({ ...f, location_id: e.target.value })} style={{ ...small, display: 'block', width: 150 }}><option value="">Any</option>{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        </label>
        <label style={{ fontSize: '0.74rem', color: colors.textMuted }}>At the same time<input type="number" min="1" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} style={{ ...small, display: 'block', width: 90 }} /></label>
        <label style={{ fontSize: '0.74rem', color: colors.textMuted }}>Gap before (min)<input type="number" min="0" value={f.buffer_before_min} onChange={(e) => setF({ ...f, buffer_before_min: e.target.value })} style={{ ...small, display: 'block', width: 90 }} /></label>
        <label style={{ fontSize: '0.74rem', color: colors.textMuted }}>Gap after (min)<input type="number" min="0" value={f.buffer_after_min} onChange={(e) => setF({ ...f, buffer_after_min: e.target.value })} style={{ ...small, display: 'block', width: 90 }} /></label>
        <button type="button" style={btnPrimary} onClick={save}>Save</button>
        <button type="button" style={ghost} onClick={toggleActive}>{r.is_active ? 'Switch off' : 'Switch on'}</button>
      </div>
      <div style={{ display: 'flex', gap: 4, margin: '14px 0 8px' }}>
        {[['hours', 'Working hours'], ['off', 'Time off'], ['services', 'Services'], ['slots', 'Free times']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} style={{ ...ghost, fontWeight: tab === k ? 700 : 500, background: tab === k ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card, #fff))' : undefined }}>{l}</button>
        ))}
      </div>
      {tab === 'hours' && <Hours key={JSON.stringify(r.hours)} r={r} onSaved={(x) => { onSaved(x); toast.success('Hours saved'); }} />}
      {tab === 'off' && <TimeOff r={r} onSaved={onSaved} />}
      {tab === 'services' && <Services r={r} services={data.services} onSaved={onSaved} />}
      {tab === 'slots' && <Slots r={r} />}
    </div>
  );
}

export default function StaffResources() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);
  const [add, setAdd] = useState({ type: 'staff', user_id: '', name: '' });

  const load = useCallback(() => resourcesAPI.list().then(setData).catch((e) => setError(errMsg(e, 'Could not load'))), []);
  useEffect(() => { load(); }, [load]);

  const replace = (row) => { if (row?.id) setData((d) => ({ ...d, rows: d.rows.map((x) => (x.id === row.id ? row : x)) })); };
  const create = async () => {
    try {
      const staff = add.type === 'staff';
      const cand = staff ? data.staff_candidates.find((u) => String(u.id) === String(add.user_id)) : null;
      const res = await resourcesAPI.create({ type: add.type, user_id: staff ? Number(add.user_id) : null, name: staff ? cand?.name : add.name });
      toast.success(res.message); setAdd({ ...add, user_id: '', name: '' }); await load(); setOpen(res.id);
    } catch (e) { toast.error(errMsg(e, 'Could not add')); }
  };

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }}>
        <HubHeader title="Staff & resources" description="Who and what can be booked, when they work, and what they can do." />
        {error && <p role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem' }}>{error}</p>}
        {!data && !error && <p style={{ color: colors.textMuted }}>Loading…</p>}
        {data && (
          <div style={{ display: 'grid', gap: 16 }}>
            <section style={{ ...card, padding: 16 }}>
              <p style={{ margin: '0 0 8px', fontWeight: 700, color: colors.primaryDeep }}>Add someone or something bookable</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select value={add.type} onChange={(e) => setAdd({ type: e.target.value, user_id: '', name: '' })} style={{ ...small, width: 140 }}>{Object.entries(TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                {add.type === 'staff' ? (
                  <select value={add.user_id} onChange={(e) => setAdd({ ...add, user_id: e.target.value })} style={{ ...small, width: 260 }}>
                    <option value="">Choose a staff member…</option>{data.staff_candidates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                ) : <input placeholder={`${TYPES[add.type]} name`} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} style={{ ...small, width: 260 }} />}
                <button type="button" style={btnPrimary} disabled={add.type === 'staff' ? !add.user_id : !add.name.trim()} onClick={create}>Add</button>
              </div>
              {add.type === 'staff' && !data.staff_candidates.length && <p style={{ ...note, marginTop: 8 }}>Everyone with an employee record is already here. Add the person under Team → Employees first.</p>}
            </section>

            <section style={{ ...card, padding: 8 }}>
              {!data.rows.length && <p style={{ padding: 12, color: colors.textMuted, fontSize: '0.84rem' }}>Nothing bookable yet.</p>}
              {data.rows.map((r) => (
                <div key={r.id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 10px', opacity: r.is_active ? 1 : 0.55 }}>
                  <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', width: '100%' }}>
                    <strong style={{ fontSize: '0.88rem' }}>{r.name}</strong>
                    <span style={{ fontSize: '0.72rem', color: colors.textFaint }}>{TYPES[r.type]}{r.location ? ` · ${r.location}` : ''}{r.capacity > 1 ? ` · ${r.capacity} at once` : ''}</span>
                    {!r.has_hours && <span style={{ fontSize: '0.72rem', color: '#92400e' }}>no working hours yet</span>}
                    {!r.is_active && <span style={{ fontSize: '0.72rem', color: '#991b1b' }}>switched off</span>}
                    <span style={{ marginLeft: 'auto', color: colors.textFaint }}>{open === r.id ? '▾' : '▸'}</span>
                  </button>
                  {open === r.id && <Editor key={r.id} r={r} data={data} onSaved={replace} />}
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
