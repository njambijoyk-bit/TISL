import useCalculatorContext from '../../../../_shared/hooks/useCalculatorContext';
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader from '../../../components/admin/ui/HubHeader';
import Modal from '../../../components/admin/ui/Modal';
import { Field, SelectInput, TextInput, FormStack, ModalActions } from '../../../components/admin/ui/Form';
import attendanceAPI from '../../../../_shared/api/attendance';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, btnPrimary, card, colors } from '../../../../_shared/theme/tokens';

/**
 * Attendance: a record of who was in, never an accounting voucher. You sign in and out for yourself; your manager (or someone assigned) marks and verifies the rest —
 * a day at a time or a month at a time — and payroll counts only verified days. Everyone sees the calendar. A colleague can dispute a day: the disputes are listed
 * for everyone, but who reported them, and when, only the super admin sees.
 */

const ST = { present: ['P', '#15803d', '#dcfce7', 'Present'], late: ['L', '#b45309', '#fef3c7', 'Late'], half_day: ['H', '#0369a1', '#e0f2fe', 'Half day'], left_early: ['E', '#b45309', '#ffedd5', 'Left early'],
  absent: ['A', '#b91c1c', '#fee2e2', 'Absent'], leave: ['V', '#6d28d9', '#ede9fe', 'Leave'], off: ['–', '#6b7280', '#f3f4f6', 'Off'], holiday: ['★', '#6b7280', '#f3f4f6', 'Holiday'] };
const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', marginRight: 6 };
const pad = (n) => String(n).padStart(2, '0');
const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function DayModal({ uid, date, kinds, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState({ status: 'present', sign_in: '', sign_out: '', note: '' });
  const [disp, setDisp] = useState({ kind: 'did_not_attend', note: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => attendanceAPI.day(uid, date).then((r) => { setD(r); if (r.record) setF({ status: r.record.status, sign_in: r.record.in ?? '', sign_out: r.record.out ?? '', note: r.record.note ?? '' }); }).catch(() => onClose()), [uid, date, onClose]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn, thenClose) => { setBusy(true); try { const r = await fn(); toast.success(r.message); onChanged(); if (thenClose) onClose(); else load(); } catch (e) { toast.error(errMsg(e, 'Could not do that')); } finally { setBusy(false); } };
  if (!d) return null;
  const rec = d.record;
  return (
    <Modal title={`${d.name} — ${new Date(date).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}`} onClose={onClose}>
      <div style={{ fontSize: '0.84rem', display: 'grid', gap: 8 }}>
        {rec ? (
          <div>
            <strong>{ST[rec.status]?.[3] ?? rec.status}</strong>{rec.in && ` · in ${rec.in}`}{rec.out && ` · out ${rec.out}`}{rec.overtime > 0 && ` · ${rec.overtime} min overtime`}
            <div style={{ color: colors.textFaint, fontSize: '0.75rem' }}>{rec.verified ? `Verified${rec.verified_by ? ` by ${rec.verified_by}` : ''}` : 'Not verified yet'}{rec.marked_by ? ` · marked by ${rec.marked_by}` : rec.source === 'self' ? ' · signed by them' : ''}{rec.note ? ` · ${rec.note}` : ''}</div>
          </div>
        ) : <div style={{ color: colors.textMuted }}>Nothing marked for this day.</div>}
        {d.inferred && <div style={{ background: 'var(--surface-input)', borderRadius: 8, padding: 8, fontSize: '0.78rem' }}>Active in the app from <strong>{d.inferred.first}</strong>{d.inferred.last ? <> to <strong>{d.inferred.last}</strong></> : ''} <span style={{ color: colors.textFaint }}>(inferred — not a record)</span>
          {d.can_mark && !rec?.in && <> <button type="button" style={small} disabled={busy} onClick={() => run(() => attendanceAPI.acceptInferred({ user_id: uid, date }))}>Use these times</button></>}</div>}
        {d.is_me && !d.can_mark && <p style={{ margin: 0, color: colors.textFaint, fontSize: '0.76rem' }}>You sign in and out for yourself; your manager marks and verifies the rest of your attendance.</p>}

        {d.can_mark && (
          <FormStack>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 140 }}><Field label="Status"><SelectInput value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v[3]}</option>)}</SelectInput></Field></div>
              <div style={{ width: 110 }}><Field label="In"><TextInput type="time" value={f.sign_in} onChange={(e) => setF({ ...f, sign_in: e.target.value })} /></Field></div>
              <div style={{ width: 110 }}><Field label="Out"><TextInput type="time" value={f.sign_out} onChange={(e) => setF({ ...f, sign_out: e.target.value })} /></Field></div>
            </div>
            <Field label="Note"><TextInput value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
            <div>
              <button type="button" style={btnPrimary} disabled={busy} onClick={() => run(() => attendanceAPI.mark({ user_id: uid, date, status: f.status, sign_in: f.sign_in || null, sign_out: f.sign_out || null, note: f.note || null }))}>Save</button>{' '}
              {rec && !rec.verified && <button type="button" style={small} disabled={busy} onClick={() => run(() => attendanceAPI.verify({ user_id: uid, date }), true)}>{d.is_me ? 'Confirm my day' : 'Verify this day'}</button>}
            </div>
          </FormStack>
        )}

        {d.can_dispute && (
          <div style={{ borderTop: '1px solid var(--line, #e5e7eb)', paddingTop: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Something wrong with this day?</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <select value={disp.kind} onChange={(e) => setDisp({ ...disp, kind: e.target.value })} style={{ padding: 6, borderRadius: 6 }}>{Object.entries(kinds).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <input placeholder="What happened (optional)" value={disp.note} onChange={(e) => setDisp({ ...disp, note: e.target.value })} style={{ flex: 1, minWidth: 160, padding: 6, borderRadius: 6, border: '1px solid #d1d5db' }} />
              <button type="button" style={small} disabled={busy} onClick={() => run(() => attendanceAPI.dispute({ user_id: uid, date, kind: disp.kind, note: disp.note || null }), true)}>Report it</button>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: colors.textFaint }}>It goes to the super admin. Your name and the time you reported are shown to nobody else — not even to you.</p>
          </div>
        )}
        <ModalActions onCancel={onClose} submitLabel="Close" onSubmit={onClose} />
      </div>
    </Modal>
  );
}

function SettingsModal({ settings, onClose, onSaved }) {
  const [s, setS] = useState(settings);
  const [cfg, setCfg] = useState(null);
  useEffect(() => { attendanceAPI.config().then(setCfg).catch(() => {}); }, []);
  const save = async () => { try { await attendanceAPI.saveSettings(s); toast.success('Saved'); onSaved(); } catch (e) { toast.error(errMsg(e, 'Could not save')); } };
  const saveMarkers = async (id, ids) => { try { await attendanceAPI.saveMarkers(id, ids); setCfg((c) => ({ ...c, staff: c.staff.map((p) => (p.id === id ? { ...p, marker_ids: ids } : p)) })); } catch (e) { toast.error(errMsg(e, 'Could not save')); } };
  return (
    <Modal title="Attendance settings" onClose={onClose}>
      <FormStack>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ width: 110 }}><Field label="Work starts"><TextInput type="time" value={s.work_start} onChange={(e) => setS({ ...s, work_start: e.target.value })} /></Field></div>
          <div style={{ width: 110 }}><Field label="Work ends"><TextInput type="time" value={s.work_end} onChange={(e) => setS({ ...s, work_end: e.target.value })} /></Field></div>
          <div style={{ width: 130 }}><Field label="Late after (min)"><TextInput type="number" min="0" value={s.grace_minutes} onChange={(e) => setS({ ...s, grace_minutes: Number(e.target.value) })} /></Field></div>
        </div>
        <div style={{ fontSize: '0.8rem' }}>Working days: {WD.map((n, i) => <label key={n} style={{ marginRight: 8 }}><input type="checkbox" checked={s.workdays.includes(i)} onChange={() => setS({ ...s, workdays: s.workdays.includes(i) ? s.workdays.filter((x) => x !== i) : [...s.workdays, i] })} /> {n}</label>)}</div>
        <div><button type="button" style={btnPrimary} onClick={save}>Save hours</button></div>
        <div style={{ borderTop: '1px solid var(--line, #e5e7eb)', paddingTop: 8 }}>
          <div style={{ fontWeight: 700, fontSize: '0.84rem' }}>Who marks whom</div>
          <p style={{ margin: '2px 0 8px', fontSize: '0.74rem', color: colors.textFaint }}>A person's manager (from their employee record) and admins can always mark and verify. Add anyone else here. Nobody marks themselves.</p>
          <div style={{ maxHeight: 220, overflow: 'auto' }}>
            {cfg?.staff.map((p) => (
              <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '4px 0', fontSize: '0.8rem' }}>
                <span style={{ width: 150 }}>{p.name}</span>
                <select multiple value={p.marker_ids.map(String)} onChange={(e) => saveMarkers(p.id, [...e.target.selectedOptions].map((o) => Number(o.value)))} style={{ minWidth: 180, minHeight: 40, fontSize: '0.78rem' }}>
                  {cfg.candidates.filter((c) => c.id !== p.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
        <ModalActions onCancel={onClose} submitLabel="Close" onSubmit={onClose} />
      </FormStack>
    </Modal>
  );
}

export default function Attendance() {
  useCalculatorContext({ type: 'attendance' });   // Alt+C: is attendance dropping
  const [month, setMonth] = useState(() => { const n = new Date(); return `${n.getFullYear()}-${pad(n.getMonth() + 1)}`; });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [day, setDay] = useState(null);
  const [settings, setSettings] = useState(false);
  const load = useCallback(() => attendanceAPI.get(month).then(setData).catch((e) => setError(errMsg(e, 'Could not load attendance'))), [month]);
  useEffect(() => { load(); }, [load]);
  const shift = (n) => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); };
  const act = async (fn) => { try { const r = await fn(); toast.success(r.message); load(); } catch (e) { toast.error(errMsg(e, 'Could not do that')); } };
  const [y, m] = month.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  const dates = Array.from({ length: n }, (_, i) => ({ d: i + 1, key: `${month}-${pad(i + 1)}`, wd: new Date(y, m - 1, i + 1).getDay() }));
  const me = data?.me;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1300, margin: '0 auto' }}>
        <HubHeader title="Attendance" description="Sign in and out. Your manager marks and verifies the rest; payroll counts only verified days." action={data?.can_configure ? <button type="button" style={btnGhost} onClick={() => setSettings(true)}>Settings</button> : null} />
        {error && <p role="alert" style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: '0.82rem' }}>{error}</p>}
        {data && !data.table_ready && <p style={{ padding: '8px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: '0.8rem' }}>Run script 63_attendance.sql to use attendance.</p>}
        {data && (
          <div style={{ display: 'grid', gap: 16 }}>
            <section style={{ ...card, padding: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong>Today</strong>
              <span style={{ fontSize: '0.84rem', color: colors.textMuted }}>{me.in ? `In ${me.in}` : 'Not signed in'}{me.out ? ` · out ${me.out}` : ''}</span>
              {!me.in && <button type="button" style={btnPrimary} onClick={() => act(attendanceAPI.signIn)}>Sign in</button>}
              {me.in && !me.out && <button type="button" style={btnPrimary} onClick={() => act(attendanceAPI.signOut)}>Sign out</button>}
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: colors.textFaint }}>Work {data.settings.work_start}–{data.settings.work_end}, late after {data.settings.grace_minutes} min</span>
            </section>

            <section style={{ ...card, padding: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                <button type="button" style={small} onClick={() => shift(-1)}>‹</button>
                <strong style={{ minWidth: 130, textAlign: 'center' }}>{new Date(y, m - 1, 1).toLocaleString([], { month: 'long', year: 'numeric' })}</strong>
                <button type="button" style={small} onClick={() => shift(1)}>›</button>
                <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: colors.textFaint }}>{Object.values(ST).map((v) => `${v[0]} ${v[3]}`).join(' · ')} · ✓ verified · ⚑ disputed</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: '0.72rem', width: '100%' }}>
                  <thead>
                    <tr><th style={{ textAlign: 'left', padding: 4, position: 'sticky', left: 0, background: 'var(--surface-card, #fff)', color: 'var(--text-primary)' }}>Person</th>{dates.map((x) => <th key={x.key} style={{ padding: 2, color: data.calendar.workdays.includes(x.wd) ? colors.textMuted : 'var(--text-tertiary, #d1d5db)', fontWeight: 600, minWidth: 26 }}>{x.d}<br /><span style={{ fontWeight: 400 }}>{WD[x.wd]}</span></th>)}<th style={{ padding: 4 }}>Verified</th><th /></tr>
                  </thead>
                  <tbody>
                    {data.calendar.people.map((p) => (
                      <tr key={p.user_id} style={{ background: p.is_me ? 'var(--surface-hover)' : undefined }}>
                        <td style={{ padding: 4, whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', boxShadow: p.is_me ? 'inset 0 0 0 99px var(--surface-hover)' : undefined, fontWeight: p.is_me ? 700 : 500 }}>{p.name}</td>
                        {dates.map((x) => {
                          const c = p.days[x.key]; const st = c?.status ? ST[c.status] : null;
                          return (
                            <td key={x.key} style={{ padding: 1, textAlign: 'center', background: data.calendar.workdays.includes(x.wd) ? undefined : 'color-mix(in srgb, var(--text-primary) 7%, transparent)' }}>
                              <button type="button" onClick={() => setDay({ uid: p.user_id, date: x.key })} title={c ? `${st?.[3] ?? ''} ${c.in ?? ''}${c.out ? `–${c.out}` : ''}${c.verified ? ' · verified' : ''}` : 'Open'}
                                style={{ width: 24, height: 22, border: c?.disputed ? '1.5px solid #dc2626' : '1px solid transparent', borderRadius: 4, cursor: 'pointer', fontSize: '0.68rem', fontWeight: 700, color: st?.[1] ?? 'var(--text-tertiary, #d1d5db)', background: st?.[2] ?? 'transparent', padding: 0 }}>
                                {st ? `${st[0]}${c.verified ? '✓' : ''}` : c?.disputed ? '⚑' : '·'}
                              </button>
                            </td>
                          );
                        })}
                        <td style={{ padding: 4, textAlign: 'center', color: colors.textMuted }}>{p.verified}/{p.marked}</td>
                        <td style={{ padding: 4 }}>{p.can_mark && p.marked > p.verified && <button type="button" style={small} onClick={() => act(() => attendanceAPI.verifyMonth({ user_id: p.user_id, month }))}>Verify month</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={{ ...card, padding: 16 }}>
              <div style={{ fontWeight: 700, color: colors.primaryDeep }}>Disputed attendance</div>
              <p style={{ margin: '2px 0 10px', fontSize: '0.74rem', color: colors.textFaint }}>Days a colleague says were wrong. They affect payroll until the super admin settles them. {data.is_super ? 'You can see who reported each one.' : 'Who reported a dispute is known only to the super admin.'}</p>
              {!data.disputes.length && <p style={{ margin: 0, fontSize: '0.82rem', color: colors.textMuted }}>No disputes this month.</p>}
              {data.disputes.map((x) => (
                <div key={x.id} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'baseline', padding: '8px 0', borderTop: '1px solid var(--line, #e5e7eb)', fontSize: '0.82rem', opacity: x.status === 'open' ? 1 : 0.6 }}>
                  <strong>{x.subject}</strong><span>{new Date(x.date).toLocaleDateString([], { day: 'numeric', month: 'short' })}</span><span style={{ color: '#b45309' }}>{x.kind_label}</span>
                  {x.note && <span style={{ color: colors.textMuted }}>“{x.note}”</span>}
                  <span style={{ color: colors.textFaint }}>{x.status === 'open' ? 'open' : x.status}{x.resolution_note ? ` — ${x.resolution_note}` : ''}</span>
                  {x.reporter && <span style={{ color: colors.textFaint, fontSize: '0.74rem' }}>reported by {x.reporter}, {new Date(x.reported_at).toLocaleString()}</span>}
                  {data.is_super && x.status === 'open' && (
                    <span style={{ marginLeft: 'auto' }}>
                      <button type="button" style={small} onClick={() => act(() => attendanceAPI.resolve(x.id, { outcome: 'upheld', note: window.prompt('Note (optional)') || undefined }))}>Uphold</button>
                      <button type="button" style={small} onClick={() => act(() => attendanceAPI.resolve(x.id, { outcome: 'dismissed', note: window.prompt('Note (optional)') || undefined }))}>Dismiss</button>
                    </span>
                  )}
                </div>
              ))}
            </section>
          </div>
        )}
        {day && data && <DayModal uid={day.uid} date={day.date} kinds={data.kinds} onClose={() => setDay(null)} onChanged={load} />}
        {settings && data && <SettingsModal settings={data.settings} onClose={() => setSettings(false)} onSaved={() => { setSettings(false); load(); }} />}
      </div>
    </AdminLayout>
  );
}
