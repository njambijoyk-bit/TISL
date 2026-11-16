import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { message } from '../../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from '../../components/ui';
import { check, td, th } from '../../components/uiTokens';
import ProjectKeys from '../../components/ProjectKeys';

/**
 * Projects security (docs/PROJECTS_STAGE2_SPEC.md, build 2.5): the signals that fired (someone refused again and again, wrong lock passwords,
 * tries outside hours, an unusual number of projects opened), what was done about each, and the settings that decide both. A paused person
 * is released here, with a note. Nobody reviews or releases themselves.
 */
const when = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '');
const RESPONSE = { alert: ['Alert only', 'neutral'], slow: ['Cooled off', 'warning'], pause: ['Paused', 'problem'] };

export default function ProjectsSecurity() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [acting, setActing] = useState(null);   // { event, release }
  const [note, setNote] = useState('');
  const [settings, setSettings] = useState(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const take = (d) => { setData(d); setSettings(d.settings); setProblem(''); };
  const load = useCallback(async () => {
    try { take(await projectsAPI.security()); setFailed(''); } catch (e) { setFailed(message(e, 'Projects security could not be loaded. Try again.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { take(await projectsAPI.reviewSecurityEvent(acting.event.id, note, acting.release)); toast.success(acting.release ? `${acting.event.who} is released` : 'Reviewed'); setActing(null); }
    catch (err) { toast.error(message(err, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const sent = { ...settings, cool_off_minutes: Number(settings.cool_off_minutes) };
      data.signals.forEach((s) => { sent[s.key] = { ...settings[s.key], count: Number(settings[s.key].count), minutes: Number(settings[s.key].minutes) }; });
      take(await projectsAPI.saveSecuritySettings(sent)); toast.success('Saved');
    } catch (err) { setProblem(message(err, 'That could not be saved. Try again.')); } finally { setBusy(false); }
  };
  const set = (key, patch) => { setSettings({ ...settings, [key]: { ...settings[key], ...patch } }); setProblem(''); };

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title="Projects security" subtitle="People trying doors they may not open, and what was done about it" actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>} />
      {failed && <Notice status="problem">{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>}
      {data && !data.ready && <Notice status="warning">Signals need database script 258. Until it has run nothing is watched.</Notice>}
      {data && (
        <div style={{ display: 'grid', gap: 16 }}>
          <Panel>
            <PanelTitle
              hint="Each line is a pattern in the activity log, not a verdict. Review it and say what you found."
              right={<span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}><Chip status={data.summary.paused ? 'problem' : 'neutral'}>{data.summary.paused} paused</Chip><Chip status={data.summary.open ? 'warning' : 'neutral'}>{data.summary.open} to review</Chip></span>}
            >
              Signals
            </PanelTitle>
            {data.watchers < 2 && <Notice status="warning" style={{ marginBottom: 12 }}>{data.watchers === 1 ? 'You are the only person who sees this page.' : 'Nobody else sees this page.'} Nobody reviews or releases themselves, so give "See security alerts raised inside Projects" to a second person.</Notice>}

            {acting && (
              <form onSubmit={act} style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
                <Field label={acting.release ? `Why you are releasing ${acting.event.who}` : `What you found about ${acting.event.who}`} htmlFor="security-note" hint="Kept with the signal and in the log." style={{ flex: '1 1 280px' }}>
                  <TextInput id="security-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} required />
                </Field>
                <Btn type="submit" variant="primary" small busy={busy}>{acting.release ? 'Release them' : 'Mark as reviewed'}</Btn>
                <Btn small onClick={() => setActing(null)}>Cancel</Btn>
              </form>
            )}

            {data.events.length === 0 && <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13.5 }}>Nothing has fired. That is the normal state.</p>}
            {data.events.length > 0 && (
              <DataTable minWidth={820}>
                <thead><tr><th style={th}>When</th><th style={th}>Person</th><th style={th}>Signal</th><th style={th}>What happened</th><th style={th}>Response</th><th style={th}><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {data.events.map((e) => (
                    <tr key={e.id} data-event={e.id}>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{when(e.at)}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{e.who}</td>
                      <td style={td}>{e.signal_label}</td>
                      <td style={td}>{e.detail}{e.project ? ` · ${e.project}` : ''}{e.reviewed_by && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{e.reviewed_by}: {e.review_note}</span>}</td>
                      <td style={td}>
                        <Chip status={e.held ? RESPONSE[e.response][1] : 'neutral'}>
                          {e.response === 'alert' ? 'Alert only' : e.held ? (e.response === 'pause' ? 'Paused' : `Read only until ${e.hold_until.slice(11, 16)}`) : e.released_by ? `Released by ${e.released_by}` : 'Cool-off ended'}
                        </Chip>
                      </td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {!e.mine && e.held && <Btn small variant="primary" style={{ marginRight: 6 }} aria-label={`Release ${e.who}`} onClick={() => { setActing({ event: e, release: true }); setNote(''); }}>Release</Btn>}
                        {!e.mine && !e.reviewed_at && <Btn small aria-label={`Review the signal about ${e.who}`} onClick={() => { setActing({ event: e, release: false }); setNote(''); }}>Review</Btn>}
                        {e.reviewed_at && <Chip status="good">Reviewed</Chip>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Panel>

          {settings && (
            <Panel as="form" onSubmit={save}>
              <PanelTitle hint="How many of what, in how many minutes, and what happens then. Out of the box each only alerts.">Signal settings</PanelTitle>
              {!data.can.settings && <Notice style={{ marginBottom: 12 }}>You can see these settings but may not change them.</Notice>}
              <fieldset disabled={!data.can.settings} style={{ border: 'none', margin: 0, padding: 0 }}>
                <DataTable minWidth={760}>
                  <thead><tr><th style={th}>On</th><th style={th}>Signal</th><th style={th}>Fires at</th><th style={th}>Within (minutes)</th><th style={th}>Then</th></tr></thead>
                  <tbody>
                    {data.signals.map((s) => (
                      <tr key={s.key} data-signal={s.key}>
                        <td style={td}><input type="checkbox" style={check} aria-label={`Watch for ${s.label}`} checked={!!settings[s.key].on} onChange={(e) => set(s.key, { on: e.target.checked })} /></td>
                        <td style={td}><strong>{s.label}</strong><span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{s.counts}</span></td>
                        <td style={td}><TextInput type="number" min={2} max={1000} aria-label={`${s.label}: how many`} value={settings[s.key].count} onChange={(e) => set(s.key, { count: e.target.value })} required style={{ width: 90 }} /></td>
                        <td style={td}><TextInput type="number" min={1} max={1440} aria-label={`${s.label}: within how many minutes`} value={settings[s.key].minutes} onChange={(e) => set(s.key, { minutes: e.target.value })} required style={{ width: 90 }} /></td>
                        <td style={td}><SelectInput aria-label={`${s.label}: what happens`} value={settings[s.key].response} onChange={(e) => set(s.key, { response: e.target.value })}>{Object.entries(data.responses).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</SelectInput></td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
                <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginTop: 12 }}>
                  <Field label="Cooling off lasts this many minutes" htmlFor="security-cool"><TextInput id="security-cool" type="number" min={1} max={1440} value={settings.cool_off_minutes} onChange={(e) => { setSettings({ ...settings, cool_off_minutes: e.target.value }); setProblem(''); }} required style={{ width: 120 }} /></Field>
                  {data.can.settings && <Btn type="submit" variant="primary" busy={busy}>Save signal settings</Btn>}
                </div>
              </fieldset>
              {problem && <Notice status="problem" style={{ marginTop: 12 }}>{problem}</Notice>}
              <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>A pause covers Projects only; the rest of TISL keeps working for that person. The people who see this page are never paused or cooled off themselves, only reported, so the company cannot be locked out of its own Projects.</p>
            </Panel>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
