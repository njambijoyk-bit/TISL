import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { useAuthStore } from '../../_shared/store/index';
import { message } from '../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';

const TONE = { team: 'neutral', client: 'info', others: 'warning' };
const ANSWER = { yes: ['Yes', 'good'], no: ['No', 'problem'], maybe: ['Maybe', 'warning'], pending: ['Not answered', 'neutral'] };
const LENGTHS = [15, 30, 45, 60, 90, 120, 180];
const area = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--line-strong)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontSize: 13.5, fontFamily: 'var(--font-body)', resize: 'vertical' };
const d = (s) => new Date(String(s).replace(' ', 'T'));
const when = (s, e) => `${d(s).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} to ${d(e).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
const blank = (me) => ({ title: '', audience: 'team', date: '', time: '', minutes: 60, location: '', online_link: '', agenda: '', people: me ? [me] : [], contacts: [], thread_id: null });

/**
 * The Meetings tab (docs/PROJECTS_STAGE6_SPEC.md, build 6.6): meetings on a piece of work. Plan one with the free-time search (times in the next two
 * weeks when every staff attendee is free, inside company hours), invite the team and, for a client or others meeting, contacts. Staff answer
 * here; contacts answer on their own link. Moving or cancelling tells everyone. `prefill` comes from /meet in a conversation.
 */
export default function MeetingsPanel({ projectId, prefill = null, onPrefillUsed }) {
  const me = useAuthStore((s) => s.user?.id);
  const [list, setList] = useState(null);
  const [openId, setOpenId] = useState(() => Number(new URLSearchParams(window.location.search).get('meeting')) || null);
  const [meeting, setMeeting] = useState(null);
  const [form, setForm] = useState(null);   // a new meeting, or { id, ... } when moving one
  const [free, setFree] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => { try { setList(await projectsAPI.meetings(projectId)); } catch (e) { setProblem(message(e, 'The meetings could not be loaded.')); } }, [projectId]);
  const loadOne = useCallback(async (id) => { try { setMeeting((await projectsAPI.meeting(projectId, id)).meeting); } catch (e) { setProblem(message(e, 'This meeting could not be opened.')); } }, [projectId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (openId) loadOne(openId); else setMeeting(null); }, [openId, loadOne]);
  useEffect(() => {
    if (prefill && list?.can.plan) { setForm({ ...blank(me), ...prefill, people: [...new Set([me, ...(prefill.people ?? [])].filter(Boolean))] }); setOpenId(null); setFree(null); onPrefillUsed?.(); }
  }, [prefill, list, me, onPrefillUsed]);
  if (!list) return problem ? <Notice status="problem">{problem}</Notice> : null;
  if (!list.ready) return <Notice status="warning">Meetings need database script 263.</Notice>;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k, id) => setForm((f) => ({ ...f, [k]: f[k].includes(id) ? f[k].filter((x) => x !== id) : [...f[k], id] }));
  const contacts = form && form.audience !== 'team' ? list.contacts[form.audience] ?? [] : [];
  const findFree = async () => {
    setBusy('free');
    try { setFree(await projectsAPI.meetingFreeTime(projectId, form.people, Number(form.minutes), form.id)); setProblem(''); } catch (e) { setProblem(message(e, 'Free times could not be found.')); } finally { setBusy(''); }
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy('save');
    try {
      const body = { ...form, minutes: Number(form.minutes) };
      const r = form.id ? await projectsAPI.changeMeeting(projectId, form.id, { date: body.date, time: body.time, minutes: body.minutes, title: body.title, location: body.location, online_link: body.online_link, agenda: body.agenda, people: body.people })
        : await projectsAPI.planMeeting(projectId, body);
      toast.success(form.id ? 'Changed. Everyone is told.' : 'Planned. Invitations are on their way.');
      setForm(null); setFree(null); setOpenId(r.meeting.id); setMeeting(r.meeting); setProblem(''); load();
    } catch (err) { setProblem(message(err, 'The meeting could not be saved.')); } finally { setBusy(''); }
  };
  const act = async (call, done) => { try { setMeeting((await call()).meeting); toast.success(done); setProblem(''); load(); } catch (e) { setProblem(message(e, 'That could not be done.')); } };
  const upcoming = list.meetings.filter((m) => m.state === 'planned' && !m.past);
  const earlier = list.meetings.filter((m) => !(m.state === 'planned' && !m.past));

  const row = (m) => (
    <button key={m.id} type="button" data-meeting={m.title} onClick={() => { setForm(null); setOpenId(m.id); }}
      style={{ textAlign: 'left', border: `1px solid ${openId === m.id ? 'var(--color-primary-500)' : 'var(--line)'}`, background: openId === m.id ? 'var(--surface-hover)' : 'var(--surface-card)', borderRadius: 10, padding: 9, cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'grid', gap: 4 }}>
      <strong style={{ fontSize: 13.5 }}>{m.title}</strong>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{when(m.starts_at, m.ends_at)}</span>
      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Chip status={TONE[m.audience]}>{list.audiences[m.audience] ?? m.audience}</Chip>
        {m.state === 'cancelled' && <Chip status="problem">Cancelled</Chip>}
        {m.state === 'held' && <Chip status="good">Held</Chip>}
        {m.my_answer && m.state === 'planned' && <Chip status={ANSWER[m.my_answer][1]}>You: {ANSWER[m.my_answer][0].toLowerCase()}</Chip>}
      </span>
    </button>
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 14, alignItems: 'start' }} data-meetings>
      <div style={{ display: 'grid', gap: 8 }}>
        {list.can.plan && !form && <Btn variant="primary" small onClick={() => { setForm(blank(me)); setFree(null); setOpenId(null); setProblem(''); }}>Plan a meeting</Btn>}
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Coming up</div>
        {upcoming.length === 0 && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Nothing planned.</p>}
        {upcoming.map(row)}
        {earlier.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 6 }}>Earlier and cancelled</div>}
        {earlier.map(row)}
      </div>

      <div style={{ minWidth: 0, display: 'grid', gap: 12 }}>
        {problem && <Notice status="problem">{problem}</Notice>}
        {form && (
          <Panel as="form" onSubmit={save} data-meeting-form>
            <PanelTitle hint={form.id ? 'A new time or place asks everyone to answer again.' : 'Everyone invited gets the details; contacts also get a calendar file and a link to answer.'}>{form.id ? 'Move or change the meeting' : 'Plan a meeting'}</PanelTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              <Field label="Title" htmlFor="mt-title" style={{ gridColumn: '1 / -1' }}><TextInput id="mt-title" value={form.title} maxLength={200} onChange={(e) => set('title', e.target.value)} required /></Field>
              {!form.id && <Field label="With" htmlFor="mt-aud"><SelectInput id="mt-aud" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value, contacts: [] })}>{Object.entries(list.audiences).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</SelectInput></Field>}
              <Field label="Day" htmlFor="mt-date"><TextInput id="mt-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required /></Field>
              <Field label="Time" htmlFor="mt-time"><TextInput id="mt-time" type="time" value={form.time} onChange={(e) => set('time', e.target.value)} required /></Field>
              <Field label="How long" htmlFor="mt-len"><SelectInput id="mt-len" value={form.minutes} onChange={(e) => { set('minutes', e.target.value); setFree(null); }}>{LENGTHS.map((n) => <option key={n} value={n}>{n < 60 ? `${n} minutes` : `${n / 60} hour${n > 60 ? 's' : ''}`}</option>)}</SelectInput></Field>
              <Field label="Where" htmlFor="mt-where"><TextInput id="mt-where" value={form.location ?? ''} maxLength={200} onChange={(e) => set('location', e.target.value)} /></Field>
              <Field label="Online link" htmlFor="mt-link"><TextInput id="mt-link" value={form.online_link ?? ''} placeholder="https://" onChange={(e) => set('online_link', e.target.value)} /></Field>
              <Field label="Agenda" htmlFor="mt-agenda" style={{ gridColumn: '1 / -1' }}><textarea id="mt-agenda" rows={3} value={form.agenda ?? ''} maxLength={5000} onChange={(e) => set('agenda', e.target.value)} style={area} /></Field>
            </div>
            <div role="group" aria-label="From the team" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 13 }}>
              <strong style={{ width: '100%', fontSize: 12.5 }}>From the team</strong>
              {list.team.map((u) => <label key={u.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.people.includes(u.id)} disabled={u.id === me} onChange={() => { toggle('people', u.id); setFree(null); }} /> {u.name}{u.id === me ? ' (you)' : ''}</label>)}
            </div>
            {!form.id && form.audience !== 'team' && (
              <div role="group" aria-label="Contacts invited" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10, fontSize: 13 }}>
                <strong style={{ width: '100%', fontSize: 12.5 }}>{form.audience === 'client' ? 'At the client' : 'At the other parties'}</strong>
                {contacts.length === 0 && <span style={{ color: 'var(--text-secondary)' }}>No contacts to invite yet.</span>}
                {contacts.map((c) => <label key={c.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', opacity: c.reachable ? 1 : 0.5 }}><input type="checkbox" checked={form.contacts.includes(c.id)} disabled={!c.reachable} onChange={() => toggle('contacts', c.id)} /> {c.name}{c.party ? ` (${c.party})` : ''}{c.reachable ? '' : ' · no email or phone'}</label>)}
              </div>
            )}
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }} data-free-time>
              <span><Btn small busy={busy === 'free'} onClick={findFree}>Find a time everyone is free</Btn></span>
              {free && (
                <>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>The next two weeks, {free.hours.start} to {free.hours.end} on working days.{free.away.map((a) => ` ${a.name} is ${a.why}.`).join('')}</span>
                  {free.slots.length === 0 ? <span style={{ fontSize: 13 }}>No time when everyone is free. Type a time instead.</span> : (
                    <span role="listbox" aria-label="Free times" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {free.slots.map((s) => { const on = form.date === s.starts_at.slice(0, 10) && form.time === s.starts_at.slice(11, 16); return <Btn key={s.starts_at} small role="option" aria-selected={on} variant={on ? 'primary' : 'plain'} onClick={() => setForm({ ...form, date: s.starts_at.slice(0, 10), time: s.starts_at.slice(11, 16) })}>{d(s.starts_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Btn>; })}
                    </span>
                  )}
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Btn type="submit" variant="primary" small busy={busy === 'save'}>{form.id ? 'Save and tell everyone' : 'Plan it and send the invitations'}</Btn>
              <Btn small onClick={() => { setForm(null); setFree(null); }}>Cancel</Btn>
            </div>
          </Panel>
        )}

        {!form && meeting && (
          <Panel data-meeting-open={meeting.title}>
            <PanelTitle hint={`${when(meeting.starts_at, meeting.ends_at)} · organised by ${meeting.organiser.name}`} right={<Chip status={TONE[meeting.audience]}>{list.audiences[meeting.audience] ?? meeting.audience}</Chip>}>{meeting.title}</PanelTitle>
            {meeting.state === 'cancelled' && <Notice status="problem" style={{ marginBottom: 10 }}>This meeting was cancelled.</Notice>}
            <div style={{ display: 'grid', gap: 6, fontSize: 13.5 }}>
              {meeting.location && <div><strong>Where:</strong> {meeting.location}</div>}
              {meeting.online_link && <div><strong>Online:</strong> <a href={meeting.online_link} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary-500)' }}>{meeting.online_link}</a></div>}
              {meeting.agenda && <div style={{ whiteSpace: 'pre-wrap' }}><strong>Agenda</strong><br />{meeting.agenda}</div>}
            </div>
            {meeting.can.answer && (
              <div role="group" aria-label="Your answer" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13 }}>Are you coming?</span>
                {['yes', 'maybe', 'no'].map((a) => <Btn key={a} small aria-pressed={meeting.my_answer === a} variant={meeting.my_answer === a ? 'primary' : 'plain'} onClick={() => act(() => projectsAPI.answerMeeting(projectId, meeting.id, a), 'Answered')}>{ANSWER[a][0]}</Btn>)}
              </div>
            )}
            <div style={{ marginTop: 12 }} data-meeting-people>
              <strong style={{ fontSize: 12.5 }}>Who is invited</strong>
              <div style={{ display: 'grid', gap: 4, marginTop: 6 }}>
                {meeting.people.map((p) => (
                  <div key={`${p.type}${p.id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5 }} data-person={p.name}>
                    <span>{p.name}{p.organiser ? ' (organiser)' : ''}{p.type === 'contact' ? ' · contact' : ''}</span>
                    <Chip status={ANSWER[p.answer][1]}>{ANSWER[p.answer][0]}</Chip>
                  </div>
                ))}
              </div>
            </div>
            {meeting.can.manage && meeting.state === 'planned' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <Btn small onClick={() => { setForm({ id: meeting.id, title: meeting.title, audience: meeting.audience, date: meeting.starts_at.slice(0, 10), time: meeting.starts_at.slice(11, 16), minutes: meeting.minutes_long, location: meeting.location ?? '', online_link: meeting.online_link ?? '', agenda: meeting.agenda ?? '', people: meeting.people.filter((p) => p.type === 'person').map((p) => p.id), contacts: [] }); setFree(null); }}>Move or change it</Btn>
                <Btn small variant="danger" onClick={() => { const why = window.prompt('Cancel the meeting? Everyone is told. Say why (optional):'); if (why !== null) act(() => projectsAPI.cancelMeeting(projectId, meeting.id, why), 'Cancelled. Everyone is told.'); }}>Cancel the meeting</Btn>
              </div>
            )}
          </Panel>
        )}
        {!form && !meeting && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Choose a meeting, or plan one.</p>}
      </div>
    </div>
  );
}
