import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { useAuthStore } from '../../../_shared/store/index';
import { hasPermission } from '../../../_shared/lib/roles';
import { message } from '../../lib/format';
import { hm } from '../../lib/tasks';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, Tabs, TextInput } from '../../components/ui';
import { td, th } from '../../components/uiTokens';
import ProjectKeys from '../../components/ProjectKeys';

const WEEK = { empty: ['Nothing logged', 'neutral'], open: ['Not submitted', 'neutral'], partly: ['Partly submitted', 'warning'], submitted: ['Submitted', 'info'], approved: ['Approved', 'good'], returned: ['Some sent back', 'warning'] };
const shift = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const dayName = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Timesheets (docs/PROJECTS_STAGE5_SPEC.md, build 5.7). My week: work and task by day, what Attendance says under each day (a day with more
 * logged than worked is flagged), and Submit. To approve: time submitted to this person, by person; approve it, or send it back with a note.
 */
export default function ProjectsTimesheet() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const params = new URLSearchParams(window.location.search);
  const mayApprove = hasPermission(user, 'projects.time.approve');
  const [view, setView] = useState(params.get('view') === 'approve' && mayApprove ? 'approve' : 'week');
  const [week, setWeek] = useState(params.get('week') || null);
  const [data, setData] = useState(null);
  const [queue, setQueue] = useState(null);
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      if (view === 'week') setData(await projectsAPI.timesheet(week ? { week } : {}));
      else { setQueue(await projectsAPI.timeApprovals()); setPicked([]); }
      setProblem('');
    } catch (e) { setProblem(message(e, 'The timesheet could not be loaded.')); }
  }, [view, week]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    setBusy(true);
    try { const r = await projectsAPI.submitWeek(data.from); setData(r); toast.success(`${r.submitted} ${r.submitted === 1 ? 'entry' : 'entries'} submitted`); } catch (e) { setProblem(message(e, 'The week could not be submitted.')); } finally { setBusy(false); }
  };
  const decide = async (step) => {
    setBusy(true);
    try { const r = await projectsAPI.decideTime(picked, step, note ?? undefined); setQueue(r); setPicked([]); setNote(null); toast.success(step === 'return' ? 'Sent back' : `${r.done} approved`); }
    catch (e) { setProblem(message(e, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };
  const returned = data ? data.lines.flatMap((l) => l.entries.filter((e) => e.state === 'returned').map((e) => ({ ...e, where: l.task ?? l.project }))) : [];

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title="Timesheet" subtitle="Your time by week, and time waiting for you to approve" actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>} />
      {mayApprove && <Tabs tabs={[{ key: 'week', label: 'My week' }, { key: 'approve', label: `To approve${queue?.count ? ` (${queue.count})` : ''}` }]} value={view} onChange={setView} label="Timesheet views" />}
      {problem && <Notice status="problem" style={{ marginBottom: 12 }}>{problem}</Notice>}

      {view === 'week' && data && (
        <Panel data-week>
          <PanelTitle hint={`${dayName(data.from)} to ${dayName(data.to)}`} right={(
            <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip status={WEEK[data.state][1]}>{WEEK[data.state][0]}</Chip>
              <Btn small aria-label="The week before" onClick={() => setWeek(shift(data.from, -7))}>‹</Btn>
              <Btn small onClick={() => setWeek(null)}>This week</Btn>
              <Btn small aria-label="The week after" onClick={() => setWeek(shift(data.from, 7))}>›</Btn>
              {data.can.submit && <Btn small variant="primary" busy={busy} onClick={submit}>Submit the week</Btn>}
            </span>
          )}>{data.person.name}</PanelTitle>
          {returned.length > 0 && <Notice status="warning" style={{ marginBottom: 12 }}>{returned.map((e) => `${dayName(e.work_date)}, ${e.where}: ${e.return_note}`).join(' · ')}. Change them on the work's Time part, then submit again.</Notice>}
          {data.lines.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No time logged this week.</p>}
          {data.lines.length > 0 && (
            <DataTable minWidth={720}>
              <thead><tr><th style={th}>Work · task</th>{data.days.map((d) => <th key={d} style={{ ...th, textAlign: 'right' }}>{dayName(d).split(' ')[0]}</th>)}<th style={{ ...th, textAlign: 'right' }}>Total</th></tr></thead>
              <tbody>
                {data.lines.map((l) => (
                  <tr key={`${l.project_id}-${l.task}`} data-line={l.task ?? l.project}>
                    <td style={td}><strong style={{ fontWeight: 600 }}>{l.project}</strong>{l.task && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{l.task}</span>}</td>
                    {l.days.map((m, i) => <td key={i} style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m ? hm(m) : ''}</td>)}
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{hm(l.total)}</td>
                  </tr>
                ))}
                <tr data-totals>
                  <td style={{ ...td, fontWeight: 700 }}>Logged</td>
                  {data.totals.map((m, i) => { const a = data.attendance[i]; const over = a && a.minutes > 0 && m > a.minutes; return <td key={i} title={over ? 'More than Attendance says was worked' : ''} style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', ...(over ? { background: 'color-mix(in srgb, var(--status-warning) 16%, var(--surface-card))', color: 'var(--status-warning)' } : {}) }} data-over={over ? 'yes' : undefined}>{m ? hm(m) : ''}</td>; })}
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{hm(data.totals.reduce((a, b) => a + b, 0))}</td>
                </tr>
                <tr data-attendance>
                  <td style={{ ...td, color: 'var(--text-secondary)', fontStyle: 'italic' }}>Attendance says</td>
                  {data.attendance.map((a, i) => <td key={i} style={{ ...td, textAlign: 'right', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{a ? (['absent', 'leave', 'off', 'holiday'].includes(a.status) ? a.status : hm(a.minutes)) : ''}</td>)}
                  <td style={td} />
                </tr>
              </tbody>
            </DataTable>
          )}
        </Panel>
      )}

      {view === 'approve' && queue && (
        <Panel data-approvals>
          <PanelTitle hint={queue.approve_by === 'manager' ? 'Time of the people you manage.' : 'Time on the work you lead.'} right={picked.length > 0 && note === null && (
            <span style={{ display: 'inline-flex', gap: 8 }}><Btn small variant="primary" busy={busy} onClick={() => decide('approve')}>Approve {picked.length}</Btn><Btn small onClick={() => setNote('')}>Send back {picked.length}</Btn></span>
          )}>To approve</PanelTitle>
          {note !== null && (
            <form style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); decide('return'); }}>
              <Field label="What needs changing" htmlFor="ts-note"><TextInput id="ts-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} required style={{ width: 320 }} /></Field>
              <Btn type="submit" small variant="danger" busy={busy}>Send it back</Btn><Btn small onClick={() => setNote(null)}>Cancel</Btn>
            </form>
          )}
          {queue.people.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing waits for you.</p>}
          {queue.people.map((p) => (
            <div key={p.user_id} data-person={p.person} style={{ marginBottom: 14 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 700, marginBottom: 6 }}>
                <input type="checkbox" checked={p.entries.every((e) => picked.includes(e.id))} onChange={(ev) => setPicked(ev.target.checked ? [...new Set([...picked, ...p.entries.map((e) => e.id)])] : picked.filter((id) => !p.entries.some((e) => e.id === id)))} aria-label={`All of ${p.person}'s time`} />
                {p.person} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>· {hm(p.minutes)}</span>
              </label>
              <DataTable minWidth={640}>
                <tbody>
                  {p.entries.map((e) => (
                    <tr key={e.id}>
                      <td style={{ ...td, width: 30 }}><input type="checkbox" aria-label={`${p.person}, ${dayName(e.work_date)}, ${hm(e.minutes)}`} checked={picked.includes(e.id)} onChange={(ev) => setPicked(ev.target.checked ? [...picked, e.id] : picked.filter((x) => x !== e.id))} /></td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{dayName(e.work_date)}</td>
                      <td style={td}>{e.task ?? e.project}{e.note && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{e.note}</span>}</td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{hm(e.minutes)}{!e.billable && <Chip style={{ marginLeft: 6 }}>Not billable</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          ))}
        </Panel>
      )}
    </AdminLayout>
  );
}
