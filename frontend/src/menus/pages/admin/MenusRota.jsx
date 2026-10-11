import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowLeftRight, CalendarClock, ChevronLeft, ChevronRight, Copy, Plus, Repeat, Send } from 'lucide-react';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../core/components/admin/ui/HubHeader';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextInput } from '../../../core/components/admin/ui/Form';
import menusAPI from '../../../_shared/api/menus';
import useAuthStore from '../../../_shared/store/authStore';
import { canReadFinance } from '../../../_shared/lib/roles';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import { Pill } from '../../components/FoodChips';
import MenusNav from '../../components/MenusNav';

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
const mondayOf = (d) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x); };
const label = (s) => new Date(`${s}T12:00:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' });
const TONE = { requested: 'warn', approved: 'ok', declined: 'danger', cancelled: 'neutral' };
const SWAP_TONE = { asked: 'warn', agreed: 'warn', approved: 'ok', declined: 'danger', cancelled: 'neutral', expired: 'neutral' };
const ATT_TONE = { on_time: 'ok', late: 'warn', not_in: 'danger', no_show: 'danger', away: 'neutral', left_early: 'warn' };
const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];
const shiftText = (s) => `${label(s.date)} ${s.starts_at}–${s.ends_at}${s.station ? ` · ${s.station}` : ''}`;

function SwapModal({ data, shift, onClose, onDone }) {
  const [to, setTo] = useState('');
  const [back, setBack] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const now = new Date().toISOString().slice(0, 10);
  const theirs = data.shifts.filter((s) => String(s.chef_id) === String(to) && s.status === 'published' && s.date >= now);
  const send = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.askSwap({ shift_id: shift.id, to_chef_id: Number(to), return_shift_id: back ? Number(back) : undefined, note: note || undefined });
      toast.success(r.message); onDone();
    } catch (e) { toast.error(errMsg(e, 'Could not ask'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title="Swap this shift" subtitle={`${shift.chef}: ${shiftText(shift)}`} onClose={onClose} width={520} footer={<ModalActions onCancel={onClose} onSubmit={send} submitLabel="Ask" busy={busy} disabled={!to} />}>
      <FormStack>
        <Field label="Ask" htmlFor="sw-to"><SelectInput id="sw-to" value={to} onChange={(e) => { setTo(e.target.value); setBack(''); }}><option value="">Choose a colleague</option>{data.chefs.filter((c) => c.id !== shift.chef_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>
        {to && <Field label="In return, take one of theirs (optional)" htmlFor="sw-back" hint="Empty: they cover it and you owe nothing back. Only their published shifts in the week on screen are listed."><SelectInput id="sw-back" value={back} onChange={(e) => setBack(e.target.value)}><option value="">Just cover it</option>{theirs.map((s) => <option key={s.id} value={s.id}>{shiftText(s)}</option>)}</SelectInput></Field>}
        <Field label="Note (optional)" htmlFor="sw-note"><TextInput id="sw-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Family event" /></Field>
        <p style={{ margin: 0, fontSize: '0.8rem', color: colors.textMuted }}>Your colleague answers first{data.swaps_need_approval ? ', then a manager approves it' : ' and it goes through'}.</p>
      </FormStack>
    </Modal>
  );
}

function PatternModal({ data, locationId, onClose, onDone }) {
  const [f, setF] = useState({ chef_id: '', weekdays: [1, 2, 3, 4, 5], starts_at: '08:00', ends_at: '16:00', station_id: '', location_id: locationId ?? data.locations[0]?.id ?? '', valid_from: iso(new Date()), valid_to: '', note: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggle = (d) => setF((x) => ({ ...x, weekdays: x.weekdays.includes(d) ? x.weekdays.filter((i) => i !== d) : [...x.weekdays, d] }));
  const save = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.savePattern({ ...f, chef_id: Number(f.chef_id), location_id: Number(f.location_id), station_id: f.station_id ? Number(f.station_id) : null, valid_to: f.valid_to || null, note: f.note || null });
      toast.success(r.message); onDone();
    } catch (e) { toast.error(errMsg(e, 'Could not save the pattern'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title="A weekly pattern" onClose={onClose} width={560} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save pattern" busy={busy} disabled={!f.chef_id || f.weekdays.length === 0} />}>
      <FormStack>
        <Field label="Chef" htmlFor="pt-chef"><SelectInput id="pt-chef" value={f.chef_id} onChange={set('chef_id')}><option value="">Choose a chef</option>{data.chefs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.86rem' }}>
          <legend style={{ fontSize: '0.72rem', fontWeight: 800, color: colors.textMuted, marginBottom: 4 }}>Works on</legend>
          {DAYS.map(([d, t]) => <label key={d} style={{ display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={f.weekdays.includes(d)} onChange={() => toggle(d)} /> {t}</label>)}
        </fieldset>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="From" htmlFor="pt-from"><TextInput id="pt-from" type="time" value={f.starts_at} onChange={set('starts_at')} /></Field>
          <Field label="Until" htmlFor="pt-to"><TextInput id="pt-to" type="time" value={f.ends_at} onChange={set('ends_at')} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {data.locations.length > 1 && <Field label="Branch" htmlFor="pt-loc"><SelectInput id="pt-loc" value={f.location_id} onChange={set('location_id')}>{data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field>}
          {data.stations.length > 0 && <Field label="Station" htmlFor="pt-st"><SelectInput id="pt-st" value={f.station_id} onChange={set('station_id')}><option value="">Any</option>{data.stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput></Field>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Starting" htmlFor="pt-vf"><TextInput id="pt-vf" type="date" value={f.valid_from} onChange={set('valid_from')} /></Field>
          <Field label="Until (optional)" htmlFor="pt-vt" hint="Empty: until you stop it."><TextInput id="pt-vt" type="date" value={f.valid_to} onChange={set('valid_to')} /></Field>
        </div>
        <Field label="Note (optional)" htmlFor="pt-note"><TextInput id="pt-note" maxLength={200} value={f.note} onChange={set('note')} /></Field>
      </FormStack>
    </Modal>
  );
}

function ShiftModal({ data, shift, chefId, date, locationId, onClose, onDone }) {
  const [f, setF] = useState({ chef_id: shift?.chef_id ?? chefId ?? '', date: shift?.date ?? date ?? '', starts_at: shift?.starts_at ?? '08:00', ends_at: shift?.ends_at ?? '16:00', station_id: shift?.station_id ?? '',
    location_id: shift?.location_id ?? locationId ?? data.locations[0]?.id ?? '', note: shift?.note ?? '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.saveShift({ ...f, chef_id: Number(f.chef_id), location_id: Number(f.location_id), station_id: f.station_id ? Number(f.station_id) : null, note: f.note || null }, shift?.id);
      toast.success(r.message);
      (r.warnings ?? []).forEach((w) => toast(w, { icon: '⚠️', duration: 9000 }));
      onDone();
    } catch (e) { toast.error(errMsg(e, 'Could not save the shift'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('Take this shift off the rota?')) return;
    setBusy(true);
    try { await menusAPI.removeShift(shift.id); toast.success('Shift removed.'); onDone(); } catch (e) { toast.error(errMsg(e, 'Could not remove it'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={shift ? 'Change the shift' : 'Add a shift'} onClose={onClose} width={560}
      footer={<><ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save shift" busy={busy} disabled={!f.chef_id || !f.date} />{shift && <button type="button" onClick={remove} disabled={busy} style={{ ...btnGhost, color: '#b91c1c', marginTop: 8 }}>Remove this shift</button>}</>}>
      <FormStack>
        <Field label="Chef" htmlFor="sh-chef"><SelectInput id="sh-chef" value={f.chef_id} onChange={set('chef_id')}><option value="">Choose a chef</option>{data.chefs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 10 }}>
          <Field label="Day" htmlFor="sh-date"><TextInput id="sh-date" type="date" value={f.date} onChange={set('date')} /></Field>
          <Field label="From" htmlFor="sh-from"><TextInput id="sh-from" type="time" value={f.starts_at} onChange={set('starts_at')} /></Field>
          <Field label="Until" htmlFor="sh-to"><TextInput id="sh-to" type="time" value={f.ends_at} onChange={set('ends_at')} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {data.locations.length > 1 && <Field label="Branch" htmlFor="sh-loc"><SelectInput id="sh-loc" value={f.location_id} onChange={set('location_id')}>{data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field>}
          {data.stations.length > 0 && <Field label="Station" htmlFor="sh-st"><SelectInput id="sh-st" value={f.station_id} onChange={set('station_id')}><option value="">Any</option>{data.stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectInput></Field>}
        </div>
        <Field label="Note (optional)" htmlFor="sh-note"><TextInput id="sh-note" maxLength={200} value={f.note} onChange={set('note')} placeholder="Opens the kitchen" /></Field>
      </FormStack>
    </Modal>
  );
}

function OffModal({ data, onClose, onDone }) {
  const [f, setF] = useState({ chef_id: '', from: iso(new Date()), to: '', kind: 'off', reason: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const send = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.askDayOff({ chef_id: f.chef_id ? Number(f.chef_id) : undefined, from: f.from, to: f.to || f.from, kind: f.kind, reason: f.reason || undefined });
      toast.success(r.message); onDone();
    } catch (e) { toast.error(errMsg(e, 'Could not send it'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={data.can_manage ? 'Time off' : 'Ask for time off'} onClose={onClose} width={520} footer={<ModalActions onCancel={onClose} onSubmit={send} submitLabel={data.can_manage && f.chef_id ? 'Record it' : 'Send the request'} busy={busy} disabled={!f.from} />}>
      <FormStack>
        {data.can_manage && <Field label="For" htmlFor="off-chef" hint="Leave empty to ask for yourself. For someone else it is recorded as approved."><SelectInput id="off-chef" value={f.chef_id} onChange={set('chef_id')}><option value="">Me</option>{data.chefs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectInput></Field>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Field label="First day" htmlFor="off-from"><TextInput id="off-from" type="date" value={f.from} onChange={set('from')} /></Field>
          <Field label="Last day" htmlFor="off-to" hint="Empty: one day."><TextInput id="off-to" type="date" value={f.to} onChange={set('to')} /></Field>
          <Field label="Kind" htmlFor="off-kind"><SelectInput id="off-kind" value={f.kind} onChange={set('kind')}>{Object.entries(data.kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</SelectInput></Field>
        </div>
        {f.kind === 'leave' && data.leave && (() => {
          const who = data.chefs.find((c) => String(c.id) === String(f.chef_id || data.me));
          return who ? <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }} data-testid="leave-balance">{who.leave_balance === null ? `${who.name} has no leave balance kept.` : `${who.name} has ${who.leave_balance} leave day(s) left. Only the company's working days count.`}</p> : null;
        })()}
        <Field label="Reason (optional)" htmlFor="off-why"><TextInput id="off-why" maxLength={300} value={f.reason} onChange={set('reason')} /></Field>
      </FormStack>
    </Modal>
  );
}

/** Menus → Rota: the week of shifts for every chef, publishing it, and time off. Drafts are the manager's plan; publishing tells each chef their own shifts. */
export default function MenusRota() {
  const user = useAuthStore((s) => s.user);
  const [week, setWeek] = useState(() => mondayOf(new Date()));
  const [loc, setLoc] = useState('');
  const [data, setData] = useState(null);
  const [shift, setShift] = useState(null);   // { shift?, chefId?, date? }
  const [off, setOff] = useState(false);
  const [swapFor, setSwapFor] = useState(null);
  const [pat, setPat] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => menusAPI.rota({ week, ...(loc ? { location_id: loc } : {}) }).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the rota'))), [week, loc]);
  useEffect(() => { load(); }, [load]);

  const byCell = useMemo(() => {
    const m = {};
    (data?.shifts ?? []).forEach((s) => { (m[`${s.chef_id}:${s.date}`] ??= []).push(s); });

    return m;
  }, [data]);
  const offOn = (chefId, day) => (data?.days_off ?? []).find((d) => d.chef_id === chefId && d.from <= day && d.to >= day && d.status !== 'declined' && d.status !== 'cancelled');

  const publish = async () => {
    setBusy(true);
    try { const r = await menusAPI.publishRota({ week, location_id: loc ? Number(loc) : undefined }); toast.success(r.message); await load(); } catch (e) { toast.error(errMsg(e, 'Could not publish'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const copyLast = async () => {
    if (!window.confirm('Copy last week\'s shifts into this week as drafts?')) return;
    setBusy(true);
    try {
      const r = await menusAPI.copyRota({ from: addDays(week, -7), to: week, location_id: loc ? Number(loc) : undefined });
      toast.success(r.message);
      if (r.skipped.length) toast(r.skipped.join('\n'), { icon: '⚠️', duration: 12000 });
      await load();
    } catch (e) { toast.error(errMsg(e, 'Could not copy'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const decide = async (d, decision) => {
    let note;
    if (decision === 'declined') { note = window.prompt('Say why (the chef is told):', ''); if (note === null) return; }
    try {
      const r = await menusAPI.decideDayOff(d.id, decision, note || undefined);
      toast.success(r.message);
      if (r.jobs?.length) toast(`Private chef jobs still held in that time: ${r.jobs.join(', ')}. They need another chef.`, { icon: '⚠️', duration: 12000 });
      await load();
    } catch (e) { toast.error(errMsg(e, 'Could not decide'), { duration: 8000 }); }
  };
  const planWeek = async () => {
    setBusy(true);
    try {
      const r = await menusAPI.applyPatterns({ week, location_id: loc ? Number(loc) : undefined });
      toast.success(r.message);
      if (r.skipped.length) toast(r.skipped.join('\n'), { icon: 'ℹ️', duration: 12000 });
      await load();
    } catch (e) { toast.error(errMsg(e, 'Could not plan'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const swapDo = async (fn, fallback) => { try { const r = await fn(); toast.success(r.message); await load(); } catch (e) { toast.error(errMsg(e, fallback), { duration: 9000 }); } };
  const answerSwap = (w, accept) => swapDo(() => menusAPI.respondSwap(w.id, accept), 'Could not answer');
  const decideSwap = (w, decision) => {
    let note;
    if (decision === 'declined') { note = window.prompt('Say why (both chefs are told):', ''); if (note === null) return undefined; }

    return swapDo(() => menusAPI.decideSwap(w.id, decision, note || undefined), 'Could not decide');
  };
  const cancelSwap = (w) => swapDo(() => menusAPI.cancelSwap(w.id), 'Could not cancel');
  const patternOn = (p, active) => swapDo(() => menusAPI.patternActive(p.id, active), 'Could not change it');
  const patternDelete = (p) => {
    if (!window.confirm('Stop this pattern? Draft shifts it planned are removed; published shifts stay.')) return undefined;

    return swapDo(() => menusAPI.removePattern(p.id), 'Could not remove it');
  };
  const cancel = async (d) => {
    if (!window.confirm('Cancel this time off?')) return;
    try { await menusAPI.cancelDayOff(d.id); await load(); } catch (e) { toast.error(errMsg(e, 'Could not cancel'), { duration: 8000 }); }
  };

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the chef rota" /></div></AdminLayout>;

  const days = data?.days ?? [];
  const today = iso(new Date());
  const pending = (data?.days_off ?? []).filter((d) => d.status === 'requested');

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1240, margin: '0 auto' }} data-testid="menus-rota">
        <MenusNav />
        <HubHeader title="Chef rota" description="Plan the week, publish it and each chef is told their own shifts. Changing a published shift tells the chef again." />
        {data && data.ready === false && <p role="status" style={{ ...card, padding: 14, fontSize: '0.85rem' }}>Run database script 145_menus_rota.sql first.</p>}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 14px' }}>
          <button type="button" style={{ ...btnGhost, padding: '6px 10px' }} aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}><ChevronLeft size={15} /></button>
          <strong data-testid="week-title" style={{ fontSize: '0.95rem' }}>{label(week)} – {label(addDays(week, 6))}</strong>
          <button type="button" style={{ ...btnGhost, padding: '6px 10px' }} aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}><ChevronRight size={15} /></button>
          <button type="button" style={{ ...btnGhost, padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => setWeek(mondayOf(new Date()))}>This week</button>
          {data?.ready && data.locations.length > 1 && <SelectInput aria-label="Branch" value={loc} onChange={(e) => setLoc(e.target.value)} style={{ width: 'auto' }}><option value="">All branches</option>{data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput>}
          <span style={{ flex: 1 }} />
          <button type="button" style={{ ...btnGhost, padding: '7px 14px', fontSize: '0.8rem' }} onClick={() => setOff(true)} disabled={!data?.ready}>Time off</button>
          {data?.can_manage && (
            <>
              {data.more && <button type="button" style={{ ...btnGhost, padding: '7px 14px', fontSize: '0.8rem' }} disabled={busy} onClick={planWeek}><Repeat size={13} aria-hidden="true" /> Plan from patterns</button>}
              <button type="button" style={{ ...btnGhost, padding: '7px 14px', fontSize: '0.8rem' }} disabled={busy} onClick={copyLast}><Copy size={13} aria-hidden="true" /> Copy last week</button>
              <button type="button" style={{ ...btnPrimary, padding: '7px 14px', fontSize: '0.8rem', opacity: data.drafts ? 1 : 0.55 }} disabled={busy || !data.drafts} onClick={publish}><Send size={13} aria-hidden="true" /> Publish{data.drafts ? ` (${data.drafts})` : ''}</button>
            </>
          )}
        </div>

        {!data ? <p style={{ color: colors.textMuted, fontSize: '0.82rem' }}>Loading…</p> : data.ready && (
          <>
            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900, fontSize: '0.82rem' }} data-testid="rota-grid">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 10, width: 170 }}>Chef</th>
                    {days.map((d) => <th key={d} style={{ padding: 10, textAlign: 'left', color: d === today ? 'var(--color-primary-500, #6366f1)' : undefined }}>{label(d)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.chefs.length === 0 && <tr><td colSpan={8} style={{ padding: 16, color: colors.textFaint }}>No chefs yet: add them under Menus → Chefs.</td></tr>}
                  {data.chefs.map((c) => (
                    <tr key={c.id} data-chef={c.name} style={{ borderTop: `1px solid ${colors.border ?? '#e5e7eb'}`, verticalAlign: 'top' }}>
                      <td style={{ padding: 10 }}>
                        <strong>{c.name}</strong>{data.me === c.id && <> <Pill tone="ok">You</Pill></>}
                        <div style={{ color: colors.textMuted, fontSize: '0.74rem' }}>{c.hours} h planned{c.attended_hours ? ` · ${c.attended_hours} h signed in` : ''}{c.title ? ` · ${c.title}` : ''}</div>
                        {c.leave_balance !== null && c.leave_balance !== undefined && <div style={{ color: colors.textMuted, fontSize: '0.74rem' }} data-testid="chef-leave">{c.leave_balance} leave day(s)</div>}
                        {c.warnings.map((w) => <div key={w} style={{ color: '#b45309', fontSize: '0.72rem', display: 'flex', gap: 4, alignItems: 'flex-start' }}><AlertTriangle size={11} aria-hidden="true" style={{ marginTop: 2, flexShrink: 0 }} /> {w}</div>)}
                      </td>
                      {days.map((d) => {
                        const o = offOn(c.id, d);
                        const cell = byCell[`${c.id}:${d}`] ?? [];

                        return (
                          <td key={d} data-cell={`${c.name}:${d}`} style={{ padding: 6, minWidth: 112, background: o ? (o.status === 'approved' ? 'color-mix(in srgb, #94a3b8 18%, transparent)' : 'color-mix(in srgb, #f59e0b 14%, transparent)') : undefined }}>
                            {o && <div style={{ fontSize: '0.72rem', fontWeight: 700, color: colors.textMuted }}>{o.kind_label}{o.status === 'requested' ? ' (asked)' : ''}</div>}
                            {cell.map((s) => (
                              <button key={s.id} type="button" disabled={!data.can_manage} onClick={() => setShift({ shift: s })} data-shift={s.id}
                                style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 4, padding: '4px 6px', borderRadius: 8, font: 'inherit', fontSize: '0.76rem', cursor: data.can_manage ? 'pointer' : 'default', color: 'inherit',
                                  border: s.status === 'draft' ? '1.5px dashed #94a3b8' : '1.5px solid #6366f1', background: s.status === 'draft' ? 'transparent' : 'color-mix(in srgb, #6366f1 12%, transparent)' }}>
                                <strong>{s.starts_at}–{s.ends_at}</strong>{s.station ? ` · ${s.station}` : ''}{s.status === 'draft' && <small style={{ color: colors.textMuted }}> draft</small>}{s.from_pattern && s.status === 'draft' && <small style={{ color: colors.textMuted }}> · pattern</small>}
                                {s.attendance && <div data-attendance={s.attendance.state}><Pill tone={ATT_TONE[s.attendance.state]}>{s.attendance.label}{s.attendance.late_minutes ? ` ${s.attendance.late_minutes} min` : ''}{s.attendance.in ? ` · in ${s.attendance.in}` : ''}</Pill></div>}
                              </button>
                            ))}
                            {data.more && cell.filter((s) => s.status === 'published' && s.date >= today && (data.can_manage || data.me === s.chef_id)).map((s) => (
                              <button key={`sw-${s.id}`} type="button" aria-label={`Swap ${c.name}'s ${s.starts_at} shift on ${label(d)}`} onClick={() => setSwapFor(s)} style={{ ...btnGhost, padding: '1px 6px', fontSize: '0.68rem', marginBottom: 3 }}><ArrowLeftRight size={10} aria-hidden="true" /> Swap</button>
                            ))}
                            {data.can_manage && !o && d >= today && <button type="button" aria-label={`Add a shift for ${c.name} on ${label(d)}`} onClick={() => setShift({ chefId: c.id, date: d })} style={{ ...btnGhost, padding: '2px 6px', fontSize: '0.7rem' }}><Plus size={11} aria-hidden="true" /></button>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: '0.76rem', color: colors.textMuted, margin: '8px 2px 0' }}>Dashed: a draft the chef has not been told about. Warnings appear above {data.limits.max_week_hours} hours in a week or under {data.limits.min_rest_hours} hours of rest between days (set in Menus → Settings).</p>

            <section aria-label="Time off" style={{ marginTop: 26, display: 'grid', gap: 10 }} data-testid="days-off">
              <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800 }}>Time off this week{pending.length > 0 ? ` · ${pending.length} waiting` : ''}</h2>
              {data.days_off.length === 0 && <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textFaint }}>Nobody is off this week.</p>}
              {data.days_off.map((d) => (
                <div key={d.id} data-dayoff={d.id} style={{ ...card, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '0.88rem' }}>{d.chef}</strong>
                  <span style={{ fontSize: '0.84rem' }}>{d.from === d.to ? label(d.from) : `${label(d.from)} – ${label(d.to)}`} · {d.days} day{d.days === 1 ? '' : 's'} · {d.kind_label}</span>
                  <Pill tone={TONE[d.status]}>{d.status_label}</Pill>
                  {d.reason && <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>{d.reason}</span>}
                  <span style={{ flex: 1 }} />
                  {data.can_manage && d.status === 'requested' && (
                    <>
                      <button type="button" style={{ ...btnPrimary, padding: '5px 12px', fontSize: '0.78rem' }} onClick={() => decide(d, 'approved')}>Approve</button>
                      <button type="button" style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.78rem', color: '#b91c1c' }} onClick={() => decide(d, 'declined')}>Decline</button>
                    </>
                  )}
                  {d.can_cancel && (data.can_manage || data.me === d.chef_id) && <button type="button" style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.78rem' }} onClick={() => cancel(d)}>Cancel</button>}
                </div>
              ))}
            </section>

            {data.more && (
              <section aria-label="Swaps" style={{ marginTop: 26, display: 'grid', gap: 10 }} data-testid="swaps">
                <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, display: 'flex', gap: 6, alignItems: 'center' }}><ArrowLeftRight size={15} aria-hidden="true" /> Shift swaps</h2>
                {data.swaps.length === 0 && <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textFaint }}>No swaps. Use Swap on a published shift to ask a colleague to take it.</p>}
                {data.swaps.map((w) => (
                  <div key={w.id} data-swap={w.id} style={{ ...card, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.86rem' }}><strong>{w.from}</strong> → <strong>{w.to}</strong>: {shiftText(w.shift)}{w.return_shift && <> in return for {shiftText(w.return_shift)}</>}</span>
                    <Pill tone={SWAP_TONE[w.status]}>{w.status_label}</Pill>
                    {w.note && <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>{w.note}</span>}
                    <span style={{ flex: 1 }} />
                    {w.can_respond && <><button type="button" style={{ ...btnPrimary, padding: '5px 12px', fontSize: '0.78rem' }} onClick={() => answerSwap(w, true)}>Yes, I will</button><button type="button" style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.78rem' }} onClick={() => answerSwap(w, false)}>No</button></>}
                    {w.can_decide && <><button type="button" style={{ ...btnPrimary, padding: '5px 12px', fontSize: '0.78rem' }} onClick={() => decideSwap(w, 'approved')}>Approve</button><button type="button" style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.78rem', color: '#b91c1c' }} onClick={() => decideSwap(w, 'declined')}>Decline</button></>}
                    {w.can_cancel && <button type="button" style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.78rem' }} onClick={() => cancelSwap(w)}>Cancel</button>}
                  </div>
                ))}
              </section>
            )}

            {data.more && data.can_manage && (
              <section aria-label="Weekly patterns" style={{ marginTop: 26, display: 'grid', gap: 10 }} data-testid="patterns">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, display: 'flex', gap: 6, alignItems: 'center' }}><CalendarClock size={15} aria-hidden="true" /> Weekly patterns</h2>
                  <span style={{ flex: 1 }} />
                  <button type="button" style={{ ...btnPrimary, padding: '6px 14px', fontSize: '0.8rem' }} onClick={() => setPat(true)}><Plus size={13} aria-hidden="true" /> Add a pattern</button>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted }}>A pattern plans draft shifts each week (days off and private chef jobs are left out). Nothing reaches a chef until you publish. To drop one day, record time off or change the pattern.</p>
                {data.patterns.length === 0 && <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textFaint }}>No patterns yet.</p>}
                {data.patterns.map((p) => (
                  <div key={p.id} data-pattern={p.id} style={{ ...card, padding: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', opacity: p.is_active ? 1 : 0.6 }}>
                    <strong style={{ fontSize: '0.88rem' }}>{p.chef}</strong>
                    <span style={{ fontSize: '0.84rem' }}>{p.weekday_label} {p.starts_at}–{p.ends_at}{p.station ? ` · ${p.station}` : ''}</span>
                    <span style={{ fontSize: '0.8rem', color: colors.textMuted }}>from {label(p.valid_from)}{p.valid_to ? ` to ${label(p.valid_to)}` : ''}</span>
                    {!p.is_active && <Pill tone="neutral">Paused</Pill>}
                    <span style={{ flex: 1 }} />
                    <button type="button" style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.78rem' }} onClick={() => patternOn(p, !p.is_active)}>{p.is_active ? 'Pause' : 'Resume'}</button>
                    <button type="button" style={{ ...btnGhost, padding: '5px 12px', fontSize: '0.78rem', color: '#b91c1c' }} onClick={() => patternDelete(p)}>Stop</button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
      {swapFor && data && <SwapModal data={data} shift={swapFor} onClose={() => setSwapFor(null)} onDone={() => { setSwapFor(null); load(); }} />}
      {pat && data && <PatternModal data={data} locationId={loc ? Number(loc) : undefined} onClose={() => setPat(false)} onDone={() => { setPat(false); load(); }} />}
      {shift && data && <ShiftModal data={data} shift={shift.shift} chefId={shift.chefId} date={shift.date} locationId={loc ? Number(loc) : undefined} onClose={() => setShift(null)} onDone={() => { setShift(null); load(); }} />}
      {off && data && <OffModal data={data} onClose={() => setOff(false)} onDone={() => { setOff(false); load(); }} />}
    </AdminLayout>
  );
}
