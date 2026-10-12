import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarRange, Users } from 'lucide-react';
import Modal from '../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import coursesAPI from '../../_shared/api/courses';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';
import Pill from './Pill';

const when = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const STANDING = { ok: ['ok', 'On track'], pending: ['neutral', 'No class held'], at_risk: ['warn', 'Behind'], failed: ['danger', 'Cannot reach it'] };

/** Every student of an offering and how they are getting on: progress, attendance, quizzes, payment, certificate. */
export function StudentsPanel({ offering }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { coursesAPI.students(offering.id).then((r) => setRows(r.students)).catch((e) => { toast.error(errMsg(e, 'Could not load students')); setRows([]); }); }, [offering.id]);
  if (!rows) return <p>Loading…</p>;
  const shown = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <section style={{ ...card, padding: 14, display: 'grid', gap: 6 }} data-testid="students-panel">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ flex: 1 }}><Users size={16} aria-hidden="true" /> Students ({rows.length})</strong>
        <input aria-label="Find a student" placeholder="Find a student" value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.5)', font: 'inherit' }} />
      </div>
      {shown.length === 0 && <p style={{ margin: 0, color: colors.textMuted }}>{rows.length ? 'Nobody matches.' : 'Nobody is enrolled yet.'}</p>}
      {shown.map((r) => (
        <div key={r.enrolment_id} data-student={r.name} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 6 }}>
          <span style={{ flex: 1, minWidth: 200 }}><strong>{r.name}</strong> <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{r.number}{r.intake ? ` · ${r.intake}` : ''}{r.last_active ? ` · last active ${when(r.last_active)}` : ' · not started'}</span></span>
          <Pill tone={r.status === 'completed' ? 'ok' : r.status === 'pending' ? 'warn' : 'neutral'}>{r.status_label}</Pill>
          {r.lessons_total > 0 && <span style={{ fontSize: '0.82rem' }}>{r.progress_pct}% ({r.lessons_done}/{r.lessons_total})</span>}
          {r.attendance_state && r.attendance_state !== 'none' && <Pill tone={STANDING[r.attendance_state]?.[0] ?? 'neutral'}>{r.attendance_rate !== null ? `${r.attendance_rate}% · ` : ''}{STANDING[r.attendance_state]?.[1]}</Pill>}
          {r.quiz_waiting > 0 && <Pill tone="warn">Quiz to mark</Pill>}
          {r.quiz_best !== null && <span style={{ fontSize: '0.82rem' }}>Quiz best {r.quiz_best}%</span>}
          {r.balance > 0.009 && <Pill tone="danger">Owes {Number(r.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Pill>}
          {r.certificate && <Pill tone="ok">{r.certificate}</Pill>}
        </div>
      ))}
    </section>
  );
}

function IntakeForm({ offeringId, intake, onClose, onDone }) {
  const [f, setF] = useState({ name: intake?.name ?? '', starts_on: intake?.starts_on ?? '', ends_on: intake?.ends_on ?? '', enrol_until: intake?.enrol_until ?? '', capacity: intake?.capacity ?? '', status: intake?.status ?? 'open' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try { await coursesAPI.saveIntake(offeringId, { ...f, capacity: f.capacity === '' ? null : Number(f.capacity) }, intake?.id); toast.success('Intake saved.'); onDone(); } catch (e) { toast.error(errMsg(e, 'Could not save the intake'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={intake ? 'Edit intake' : 'Add an intake'} onClose={onClose} width={520} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save intake" busy={busy} disabled={!f.name.trim()} />}>
      <FormStack>
        <Field label="Name" htmlFor="in-name" hint='For example "January 2027".'><TextInput id="in-name" maxLength={120} value={f.name} onChange={set('name')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Starts" htmlFor="in-s"><TextInput id="in-s" type="date" value={f.starts_on} onChange={set('starts_on')} /></Field>
          <Field label="Ends" htmlFor="in-e"><TextInput id="in-e" type="date" value={f.ends_on} onChange={set('ends_on')} /></Field>
          <Field label="Last day to enrol" htmlFor="in-u" hint="Empty: until you close it."><TextInput id="in-u" type="date" value={f.enrol_until} onChange={set('enrol_until')} /></Field>
          <Field label="Places" htmlFor="in-c" hint="Empty: only the offering's limit."><TextInput id="in-c" inputMode="numeric" value={f.capacity} onChange={set('capacity')} /></Field>
        </div>
        <Field label="Status" htmlFor="in-st"><SelectInput id="in-st" value={f.status} onChange={set('status')}><option value="open">Open</option><option value="closed">Closed</option></SelectInput></Field>
      </FormStack>
    </Modal>
  );
}

/** The dated runs of an offering and the waiting list. */
export function IntakesPanel({ offering }) {
  const [d, setD] = useState(null);
  const [editing, setEditing] = useState(null);   // null | 'new' | intake
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => coursesAPI.intakes(offering.id).then(setD).catch((e) => { toast.error(errMsg(e, 'Could not load intakes')); setD({ ready: true, intakes: [], waitlist: [] }); }), [offering.id]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn) => { setBusy(true); try { const r = await fn(); toast.success(r.message); setD((x) => ({ ...x, intakes: r.intakes, waitlist: r.waitlist })); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } finally { setBusy(false); } };

  if (!d) return <p>Loading…</p>;
  if (!d.ready) return <p role="status" style={{ color: colors.textMuted }}>Run database script 160_courses_teaching.sql to switch on intakes and the waiting list.</p>;
  return (
    <div style={{ display: 'grid', gap: 12 }} data-testid="intakes-panel">
      <section style={{ ...card, padding: 14, display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <strong style={{ flex: 1 }}><CalendarRange size={16} aria-hidden="true" /> Intakes</strong>
          <button type="button" style={btnPrimary} onClick={() => setEditing('new')}>Add an intake</button>
        </div>
        <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.82rem' }}>With intakes, students choose one when they enrol. Without any, the offering is open all the time.</p>
        {d.intakes.length === 0 && <p style={{ margin: 0, color: colors.textMuted }}>No intakes.</p>}
        {d.intakes.map((i) => (
          <div key={i.id} data-intake={i.name} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 6 }}>
            <span style={{ flex: 1, minWidth: 200 }}><strong>{i.name}</strong> <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{i.starts_on ? `${when(i.starts_on)}` : ''}{i.ends_on ? ` – ${when(i.ends_on)}` : ''}{i.enrol_until ? ` · enrol by ${when(i.enrol_until)}` : ''}</span></span>
            <span style={{ fontSize: '0.82rem' }}>{i.enrolled}{i.capacity ? ` of ${i.capacity}` : ''} enrolled{i.waiting ? ` · ${i.waiting} waiting` : ''}</span>
            <Pill tone={i.open ? 'ok' : 'neutral'}>{i.open ? 'Open' : 'Closed'}</Pill>
            <button type="button" style={btnGhost} onClick={() => setEditing(i)}>Edit</button>
            <button type="button" style={btnGhost} disabled={busy} onClick={() => { if (window.confirm(`Remove ${i.name}?`)) run(() => coursesAPI.deleteIntake(offering.id, i.id)); }}>Remove</button>
          </div>
        ))}
      </section>
      <section style={{ ...card, padding: 14, display: 'grid', gap: 6 }}>
        <strong>Waiting list</strong>
        {d.waitlist.length === 0 && <p style={{ margin: 0, color: colors.textMuted }}>Nobody is waiting.</p>}
        {d.waitlist.map((w) => (
          <div key={w.id} data-waiting={w.student} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 6 }}>
            <span style={{ flex: 1, minWidth: 200 }}><strong>{w.position}. {w.student}</strong> <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{w.intake ?? 'any time'} · since {when(w.since)}</span></span>
            {w.status === 'offered' ? <Pill tone="warn">Place held until {new Date(w.offer_expires_at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Pill>
              : <button type="button" style={btnGhost} disabled={busy} onClick={() => run(() => coursesAPI.offerPlace(offering.id, w.id))}>Offer a place now</button>}
            <button type="button" style={btnGhost} disabled={busy} onClick={() => run(() => coursesAPI.removeFromWaitlist(offering.id, w.id))}>Remove</button>
          </div>
        ))}
      </section>
      {editing && <IntakeForm offeringId={offering.id} intake={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />}
    </div>
  );
}
