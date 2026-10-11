import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, Plus, Send } from 'lucide-react';
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
                        <div style={{ color: colors.textMuted, fontSize: '0.74rem' }}>{c.hours} h{c.title ? ` · ${c.title}` : ''}</div>
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
                                <strong>{s.starts_at}–{s.ends_at}</strong>{s.station ? ` · ${s.station}` : ''}{s.status === 'draft' && <small style={{ color: colors.textMuted }}> draft</small>}
                              </button>
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
          </>
        )}
      </div>
      {shift && data && <ShiftModal data={data} shift={shift.shift} chefId={shift.chefId} date={shift.date} locationId={loc ? Number(loc) : undefined} onClose={() => setShift(null)} onDone={() => { setShift(null); load(); }} />}
      {off && data && <OffModal data={data} onClose={() => setOff(false)} onDone={() => { setOff(false); load(); }} />}
    </AdminLayout>
  );
}
