import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCheck, Plus, Trash2 } from 'lucide-react';
import Modal from '../../core/components/admin/ui/Modal';
import { Field, FormStack, ModalActions, SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import coursesAPI from '../../_shared/api/courses';
import { errMsg } from '../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';
import Pill from './Pill';

const STATE = { none: ['neutral', ''], pending: ['neutral', 'No class held yet'], ok: ['ok', 'On track'], at_risk: ['warn', 'Behind'], failed: ['danger', 'Cannot reach it'] };
const MARKS = [['present', 'Present'], ['late', 'Late'], ['absent', 'Absent'], ['excused', 'Excused']];
const when = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const local = (iso) => (iso ? iso.slice(0, 16) : '');

function SessionForm({ offering, session, sessions, meta, onClose, onDone }) {
  const [f, setF] = useState({ title: session?.title ?? '', starts_at: local(session?.starts_at), ends_at: local(session?.ends_at), mode: session?.mode ?? (offering.delivery === 'online' ? 'online' : 'in_person'), makeup_for_id: session?.makeup_for_id ?? '',
    self_checkin: session?.self_checkin ?? false, notes: session?.notes ?? '', location_id: session?.location_id ?? offering.location_id ?? '' });
  const [busy, setBusy] = useState(false);
  const linked = Boolean(session?.live_id);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      const body = linked ? { title: f.title, self_checkin: f.self_checkin, notes: f.notes, makeup_for_id: f.makeup_for_id ? Number(f.makeup_for_id) : null }
        : { ...f, makeup_for_id: f.makeup_for_id ? Number(f.makeup_for_id) : null, location_id: f.location_id ? Number(f.location_id) : null };
      await coursesAPI.saveSession(offering.id, body, session?.id); toast.success('Class saved.'); onDone();
    } catch (e) { toast.error(errMsg(e, 'Could not save the class'), { duration: 8000 }); } finally { setBusy(false); }
  };

  return (
    <Modal title={session ? 'Edit class' : 'Add a class'} onClose={onClose} width={560} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save class" busy={busy} disabled={!f.title.trim() || (!linked && (!f.starts_at || !f.ends_at))} />}>
      <FormStack>
        {linked && <p style={{ margin: 0, fontSize: '0.84rem', color: colors.textMuted }}>This class follows a live lesson: change its time on the lesson.</p>}
        <Field label="Title" htmlFor="ss-title"><TextInput id="ss-title" maxLength={160} value={f.title} onChange={set('title')} /></Field>
        {!linked && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Starts" htmlFor="ss-s"><TextInput id="ss-s" type="datetime-local" value={f.starts_at} onChange={set('starts_at')} /></Field>
              <Field label="Ends" htmlFor="ss-e"><TextInput id="ss-e" type="datetime-local" value={f.ends_at} onChange={set('ends_at')} /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Held" htmlFor="ss-mode"><SelectInput id="ss-mode" value={f.mode} onChange={set('mode')}><option value="in_person">In person</option><option value="online">Online</option></SelectInput></Field>
              {f.mode === 'in_person' && <Field label="Branch" htmlFor="ss-loc"><SelectInput id="ss-loc" value={f.location_id} onChange={set('location_id')}><option value="">None</option>{meta.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectInput></Field>}
            </div>
          </>
        )}
        <Field label="Makes up for" htmlFor="ss-mk" hint="A make-up class is not counted itself: attending it counts as attending the class it replaces."><SelectInput id="ss-mk" value={f.makeup_for_id} onChange={set('makeup_for_id')}><option value="">Nothing: an ordinary class</option>{sessions.filter((x) => !x.makeup_for_id && x.id !== session?.id).map((x) => <option key={x.id} value={x.id}>{x.title} · {when(x.starts_at)}</option>)}</SelectInput></Field>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.86rem' }}><input type="checkbox" checked={f.self_checkin} onChange={set('self_checkin')} /> Students check themselves in with a code I show</label>
        <Field label="Notes" htmlFor="ss-n"><TextInput id="ss-n" maxLength={300} value={f.notes} onChange={set('notes')} /></Field>
      </FormStack>
    </Modal>
  );
}

function RollCall({ offering, sessionId, onClose, onSaved }) {
  const [d, setD] = useState(null);
  const [marks, setMarks] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { coursesAPI.roll(offering.id, sessionId).then((r) => { setD(r); setMarks(Object.fromEntries(r.students.map((s) => [s.user_id, { status: s.status ?? '', note: s.note ?? '' }]))); }).catch((e) => toast.error(errMsg(e, 'Could not load the roll'))); }, [offering.id, sessionId]);
  const save = async () => {
    setBusy(true);
    try { const r = await coursesAPI.mark(offering.id, sessionId, Object.entries(marks).map(([uid, m]) => ({ user_id: Number(uid), status: m.status || null, note: m.note || undefined }))); toast.success(r.message); onSaved(); } catch (e) { toast.error(errMsg(e, 'Could not save the register'), { duration: 8000 }); } finally { setBusy(false); }
  };
  const all = (status) => setMarks((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.status === 'excused' ? v : { ...v, status }])));

  return (
    <Modal title={d ? d.session.title : 'The register'} subtitle={d ? when(d.session.starts_at) : ''} onClose={onClose} width={680} footer={<ModalActions onCancel={onClose} onSubmit={save} submitLabel="Save the register" busy={busy} disabled={!d || d.students.length === 0} />}>
      {!d && <p>Loading…</p>}
      {d && d.students.length === 0 && <p style={{ color: colors.textMuted }}>Nobody is on the roll: students need access to this offering.</p>}
      {d && d.students.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div><button type="button" style={btnGhost} onClick={() => all('present')}><CheckCheck size={14} aria-hidden="true" /> Everyone present</button></div>
          {d.students.map((s) => (
            <div key={s.user_id} data-student={s.name} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 6 }}>
              <span style={{ flex: 1, minWidth: 150 }}><strong>{s.name}</strong>{s.method === 'self' && s.status ? <span style={{ color: colors.textMuted, fontSize: '0.74rem' }}> · checked in</span> : ''}</span>
              {s.status === 'asked' && <Pill tone="warn">Excuse asked</Pill>}
              <div role="group" aria-label={`Mark ${s.name}`} style={{ display: 'flex', gap: 4 }}>
                {MARKS.map(([k, l]) => <button key={k} type="button" aria-pressed={marks[s.user_id]?.status === k} onClick={() => setMarks((m) => ({ ...m, [s.user_id]: { ...m[s.user_id], status: m[s.user_id]?.status === k ? '' : k } }))} style={{ ...btnGhost, fontWeight: marks[s.user_id]?.status === k ? 800 : 500, borderColor: marks[s.user_id]?.status === k ? colors.primary : undefined }}>{l}</button>)}
              </div>
              <input aria-label={`Note for ${s.name}`} placeholder="Note" maxLength={300} value={marks[s.user_id]?.note ?? ''} onChange={(e) => setMarks((m) => ({ ...m, [s.user_id]: { ...m[s.user_id], note: e.target.value } }))} style={{ flex: '1 1 140px', minWidth: 120, padding: '6px 8px', borderRadius: 8, border: '1px solid var(--line, #d1d5db)', font: 'inherit' }} />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** Classes and the register of an offering: add classes, take the register, answer excuses, see who is on track. */
export default function AttendancePanel({ offering, meta }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [roll, setRoll] = useState(null);
  const load = useCallback(() => coursesAPI.attendance(offering.id).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the register'))), [offering.id]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <p>Loading…</p>;
  if (!data.ready) return <p role="status" style={{ color: colors.textMuted }}>Run database script 157_courses_attendance.sql to switch the register on.</p>;
  const run = async (fn, ok) => { try { await fn(); if (ok) toast.success(ok); await load(); } catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 8000 }); } };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section style={{ ...card, padding: 14, display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <strong>Classes {data.min_attendance_pct ? <span style={{ color: colors.textMuted, fontWeight: 600, fontSize: '0.82rem' }}>· {data.min_attendance_pct}% attendance needed</span> : <span style={{ color: colors.textMuted, fontWeight: 600, fontSize: '0.82rem' }}>· no attendance asked (set it under Edit details)</span>}</strong>
          <button type="button" style={btnPrimary} onClick={() => setForm({})}><Plus size={14} aria-hidden="true" /> Add a class</button>
        </div>
        {data.sessions.length === 0 && <p style={{ margin: 0, color: colors.textMuted, fontSize: '0.86rem' }}>No classes yet. A live lesson adds its own class here.</p>}
        {data.sessions.map((s) => (
          <div key={s.id} data-session={s.title} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 6, opacity: s.status === 'cancelled' ? 0.55 : 1 }}>
            <span style={{ flex: 1, minWidth: 200 }}><strong>{s.title}</strong> <span style={{ color: colors.textMuted, fontSize: '0.78rem' }}>{when(s.starts_at)} · {s.mode_label}{s.makeup_for ? ` · makes up for ${s.makeup_for}` : ''}</span></span>
            {s.status === 'cancelled' && <Pill tone="danger">Cancelled</Pill>}
            {s.self_checkin && s.checkin_code && <Pill>Code {s.checkin_code}</Pill>}
            {s.marked > 0 && <Pill tone="ok">{s.present} here · {s.absent} absent{s.excused ? ` · ${s.excused} excused` : ''}</Pill>}
            {s.asked > 0 && <Pill tone="warn">{s.asked} excuse{s.asked === 1 ? '' : 's'} asked</Pill>}
            {s.status !== 'cancelled' && <button type="button" style={btnPrimary} onClick={() => setRoll(s.id)}>Register</button>}
            <button type="button" style={btnGhost} onClick={() => setForm(s)}>Edit</button>
            {s.status !== 'cancelled' && !s.live_id && <button type="button" style={btnGhost} onClick={() => window.confirm('Cancel this class? It leaves the count; the marks are kept.') && run(() => coursesAPI.cancelSession(offering.id, s.id), 'Class cancelled.')}>Cancel</button>}
            {!s.live_id && <button type="button" aria-label={`Remove ${s.title}`} style={{ ...btnGhost, color: colors.danger }} onClick={() => window.confirm('Remove this class?') && run(() => coursesAPI.removeSession(offering.id, s.id), 'Class removed.')}><Trash2 size={13} aria-hidden="true" /></button>}
          </div>
        ))}
      </section>

      {data.excuses.length > 0 && (
        <section style={{ ...card, padding: 14, display: 'grid', gap: 8 }}>
          <strong>Excuses waiting</strong>
          {data.excuses.map((x) => (
            <div key={x.entry_id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ flex: 1, minWidth: 200 }}><strong>{x.name}</strong> · {x.session}<div style={{ fontSize: '0.8rem', color: colors.textMuted }}>{x.reason}</div></span>
              <button type="button" style={btnPrimary} onClick={() => run(() => coursesAPI.decideExcuse(offering.id, x.entry_id, true), 'Excused.')}>Excuse</button>
              <button type="button" style={btnGhost} onClick={() => run(() => coursesAPI.decideExcuse(offering.id, x.entry_id, false), 'Marked absent.')}>Not excused</button>
            </div>
          ))}
        </section>
      )}

      {data.report.length > 0 && (
        <section style={{ ...card, padding: 14, display: 'grid', gap: 6 }}>
          <strong>Students</strong>
          {data.report.map((r) => {
            const [tone, label] = STATE[r.state] ?? STATE.none;

            return (
              <div key={r.user_id} data-report={r.name} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 6 }}>
                <span style={{ flex: 1, minWidth: 180 }}>{r.name}</span>
                <span style={{ fontSize: '0.84rem' }}>{r.rate !== null ? `${r.rate}%` : '—'} · {r.attended} of {r.held - r.excused > 0 ? r.held - r.excused : r.held} held{r.remaining > 0 ? ` · ${r.remaining} to come` : ''}</span>
                {label && <Pill tone={tone}>{label}</Pill>}
              </div>
            );
          })}
        </section>
      )}
      {form && <SessionForm offering={offering} session={form.id ? form : null} sessions={data.sessions} meta={meta} onClose={() => setForm(null)} onDone={() => { setForm(null); load(); }} />}
      {roll && <RollCall offering={offering} sessionId={roll} onClose={() => setRoll(null)} onSaved={() => { setRoll(null); load(); }} />}
    </div>
  );
}
