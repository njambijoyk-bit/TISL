import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, TextInput } from './ui';
import { check, td, th } from './uiTokens';
import HoursEditor from './HoursEditor';
import LocksSection from './LocksSection';
import UnlockPanel from './UnlockPanel';

/**
 * Who can get into a piece of work, and why (docs/PROJECTS_STAGE2_SPEC.md, build 2.1): one row per person with a place on it, in the words the
 * access check itself uses, and whether they can get in this minute; then the people who are not on it but read it anyway, or, for a
 * confidential one, the people it is hidden from. Someone who may set access can move an end date.
 */
export default function AccessPanel({ projectId, word, onLocksChanged }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [moving, setMoving] = useState(null);   // the person whose end date is being moved
  const [until, setUntil] = useState('');
  const [showOthers, setShowOthers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hoursOf, setHoursOf] = useState(null);   // null | 'project' | the person whose hours are being set
  const [readOutside, setReadOutside] = useState(false);

  const load = useCallback(async () => {
    try { setData(await projectsAPI.access(projectId)); setFailed(''); } catch (e) { setFailed(message(e, 'The list could not be loaded. Try again.')); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const save = async (e, value) => {
    e?.preventDefault();
    setBusy(true);
    try { setData(await projectsAPI.extendAccess(projectId, moving.member_id, value)); setMoving(null); toast.success(value ? `${moving.name} is on it until ${day(value)}` : `${moving.name} has no end date now`); }
    catch (err) { toast.error(message(err, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };

  const run = async (call, done) => {
    setBusy(true);
    try { setData(await call()); setHoursOf(null); toast.success(done); } catch (err) { toast.error(message(err, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };

  if (failed) return <Notice status="problem">{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>;
  if (!data) return <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading who can get in…</p></Panel>;
  const { people, others, summary, can } = data;
  const thing = word('project', false, true);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Panel>
      <PanelTitle
        hint={`Everyone with a place on this ${thing}, why they have it, and whether they can get in right now.`}
        right={can.access && data.hours.ready && !hoursOf && <Btn small onClick={() => { setReadOutside(data.hours.read_outside_hours); setMoving(null); setHoursOf('project'); }}>Set hours</Btn>}
      >
        Who can get in
      </PanelTitle>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Chip status={data.project_hours ? 'info' : 'neutral'}>{data.project_hours ? `Hours: ${data.project_hours}` : 'Open at any time'}</Chip>
        {summary.ending_soon > 0 && <Chip status="warning">{summary.ending_soon === 1 ? '1 person ends' : `${summary.ending_soon} people end`} within {summary.warn_days} days</Chip>}
      </div>

      {data.passes.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {data.passes.map((s) => (
            <Notice key={s.id} status={s.status === 'asked' ? 'warning' : 'info'}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }} data-pass={s.name}>
                <span>{s.status === 'asked' ? <><strong>{s.name}</strong> asks to get in outside the hours.{s.reason ? ` "${s.reason}"` : ''}</> : <><strong>{s.name}</strong> has a pass until {s.ends_at.slice(11, 16)}.</>}</span>
                {s.status === 'asked' && can.access && (
                  <span style={{ display: 'flex', gap: 8 }}>
                    <Btn small variant="primary" busy={busy} onClick={() => run(() => projectsAPI.answerPass(projectId, s.id, true), `${s.name} is let in`)}>Let them in</Btn>
                    <Btn small busy={busy} onClick={() => run(() => projectsAPI.answerPass(projectId, s.id, false), 'Declined')}>Decline</Btn>
                  </span>
                )}
              </div>
            </Notice>
          ))}
        </div>
      )}

      {hoursOf && (
        <div style={{ padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
          <p style={{ margin: '0 0 10px', fontWeight: 600, fontSize: 13.5 }}>{hoursOf === 'project' ? `When this ${thing} can be opened` : `When ${hoursOf.name} can open it`}</p>
          <HoursEditor
            key={hoursOf === 'project' ? 'project' : hoursOf.member_id} prefix="access-hours" busy={busy} onCancel={() => setHoursOf(null)}
            value={hoursOf === 'project' ? data.hours.project : hoursOf.hour_days}
            onSave={(days) => run(() => projectsAPI.setHours(projectId, hoursOf === 'project' ? { days, read_outside_hours: readOutside } : { days, member_id: hoursOf.member_id }), 'The hours are saved')}
          >
            {hoursOf === 'project' ? (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}><input type="checkbox" style={check} checked={readOutside} onChange={(e) => setReadOutside(e.target.checked)} />Outside these hours people can still read it, but not change it</label>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>The hours never hold the people who can set them{data.hours.key_holders.length ? ` (${data.hours.key_holders.join(', ')})` : ''}, so a mistake here cannot close it to everyone.</p>
              </>
            ) : <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-secondary)' }}>These narrow the hours above for this person only. They get in when both say yes.</p>}
          </HoursEditor>
        </div>
      )}

      {moving && (
        <form onSubmit={(e) => save(e, until)} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
          <Field label={`${moving.name} is on it until`} htmlFor="access-until"><TextInput id="access-until" type="date" min={today} value={until} onChange={(e) => setUntil(e.target.value)} required /></Field>
          <Btn type="submit" variant="primary" small busy={busy}>Save the date</Btn>
          {moving.ends_at && <Btn small busy={busy} onClick={() => save(null, null)}>No end date</Btn>}
          <Btn small onClick={() => setMoving(null)}>Cancel</Btn>
        </form>
      )}

      {data.people_locked && <UnlockPanel compact projectId={projectId} area="people" label="People and access" onOpened={load} />}
      {!data.people_locked && (<>
      <DataTable minWidth={760}>
        <thead><tr><th style={th}>Person</th><th style={th}>Gets in because</th><th style={th}>Can</th><th style={th}>Hours</th><th style={th}>Until</th><th style={th}>Now</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {people.map((m) => (
            <tr key={m.member_id} data-person={m.name}>
              <td style={{ ...td, fontWeight: 600 }}>{m.name}</td>
              <td style={td}>{m.reason}</td>
              <td style={{ ...td, fontSize: 12.5, color: 'var(--text-secondary)' }}>{m.can.length ? m.can.join(' · ') : 'Nothing'}</td>
              <td style={td}>{m.hours || <span style={{ color: 'var(--text-secondary)' }}>{data.project_hours ? 'The hours above' : 'Any time'}</span>}</td>
              <td style={td}>
                {m.ends_at ? day(m.ends_at) : <span style={{ color: 'var(--text-secondary)' }}>No end</span>}
                {m.ending_soon && <Chip status="warning" style={{ marginLeft: 6 }}>{m.ends_in_days < 1 ? 'today' : m.ends_in_days === 1 ? '1 day' : `${m.ends_in_days} days`}</Chip>}
              </td>
              <td style={td}><Chip status={m.status}>{m.state_words}</Chip></td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {can.access && data.hours.ready && <Btn small style={{ marginRight: 6 }} aria-label={`Set hours for ${m.name}`} onClick={() => { setMoving(null); setHoursOf(m); }}>Hours</Btn>}
                {can.access && m.state !== 'invited' && <Btn small aria-label={`${m.ends_at ? 'Extend' : 'Set an end date for'} ${m.name}`} onClick={() => { setHoursOf(null); setMoving(m); setUntil(m.ends_at && m.ends_at.slice(0, 10) >= today ? m.ends_at.slice(0, 10) : ''); }}>{m.ends_at ? 'Extend' : 'Set an end'}</Btn>}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>

      <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'var(--surface-input)' }} data-others={others.kind}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5 }}>
            {others.kind === 'kept_out'
              ? (others.people.length ? `Hidden from ${others.people.length} ${others.people.length === 1 ? 'person' : 'people'} who would otherwise see it, because it is confidential.` : 'Confidential: only the people above can find it.')
              : (others.people.length ? `${others.people.length} more ${others.people.length === 1 ? 'person reads' : 'people read'} it without being on it, because they see every ${thing} that is not confidential.` : 'Nobody else gets in.')}
          </span>
          {others.people.length > 0 && <Btn small aria-expanded={showOthers} onClick={() => setShowOthers(!showOthers)}>{showOthers ? 'Hide them' : 'Show them'}</Btn>}
        </div>
        {showOthers && <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>{others.people.map((u) => u.name).join(', ')}</p>}
      </div>
      </>)}

      {data.hours.ready && <LocksSection projectId={projectId} locks={data.locks || []} canSet={can.access} onChanged={(locks) => { setData({ ...data, locks }); onLocksChanged?.(); }} />}
    </Panel>
  );
}
