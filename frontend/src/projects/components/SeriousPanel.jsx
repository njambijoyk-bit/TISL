import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, DataTable, Notice, Panel, PanelTitle, SelectInput } from './ui';
import { check, td, th } from './uiTokens';

/**
 * Which actions are serious, and what each needs before it happens (docs/PROJECTS_STAGE2_SPEC.md, build 2.4): nothing, the person confirming
 * who they are, a supervisor's approval, or both. Only someone who holds the permission can change the table; others can read it.
 */
export default function SeriousPanel() {
  const [data, setData] = useState(null);
  const [rules, setRules] = useState({});
  const [failed, setFailed] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const take = (d) => { setData(d); setRules(d.rules); setProblem(''); };
  useEffect(() => { projectsAPI.serious().then(take).catch((e) => setFailed(message(e, 'The table could not be loaded. Try again.'))); }, []);

  if (failed) return <Notice status="problem">{failed}</Notice>;
  if (!data) return <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p></Panel>;
  const canChange = data.can.change;
  const set = (key, patch) => { setRules({ ...rules, [key]: { ...rules[key], ...patch } }); setProblem(''); };
  const supervised = (r) => r.needs === 'supervisor' || r.needs === 'both';
  const usesIdentity = Object.values(rules).some((r) => r.needs === 'identity' || r.needs === 'both');
  const usesSupervisor = Object.values(rules).some(supervised);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { take(await projectsAPI.saveSerious(rules)); toast.success('Saved'); } catch (err) { setProblem(message(err, 'That could not be saved. Try again.')); } finally { setBusy(false); }
  };

  return (
    <Panel as="form" onSubmit={save}>
      <PanelTitle
        hint="An action marked here waits until what it needs has happened. Everything else works as before."
        right={canChange && <Btn small onClick={() => { setRules(data.suggested); setProblem(''); }}>Use the suggested set</Btn>}
      >
        Serious actions
      </PanelTitle>
      {!canChange && <Notice style={{ marginBottom: 12 }}>You can see this table but may not change it.</Notice>}
      {usesIdentity && !data.identity_ready && <Notice status="warning" style={{ marginBottom: 12 }}>Confirming identity is not set up on this system yet (Security settings). Until it is, an action that needs it is refused, not let through.</Notice>}
      {usesSupervisor && data.approvers < 2 && <Notice status="warning" style={{ marginBottom: 12 }}>{data.approvers === 0 ? 'Nobody holds' : 'Only one person holds'} the permission to approve serious actions. A supervisor is never the person who asked, so give it to at least two people.</Notice>}

      <DataTable minWidth={720}>
        <thead><tr><th style={th}>Action</th><th style={th}>Needs</th><th style={th}>Supervisor must be on it</th><th style={th}>Must say why</th></tr></thead>
        <tbody>
          {data.actions.map((a) => {
            const r = rules[a.key] || { needs: 'none', on_project: false, reason: false };
            return (
              <tr key={a.key} data-action={a.key}>
                <td style={{ ...td, fontWeight: 600 }}>{a.label}</td>
                <td style={td}>
                  <SelectInput aria-label={`What "${a.label}" needs`} value={r.needs} disabled={!canChange} style={{ minWidth: 210 }}
                    onChange={(e) => set(a.key, { needs: e.target.value, ...(e.target.value === 'none' ? { reason: false } : {}), ...(e.target.value === 'supervisor' || e.target.value === 'both' ? {} : { on_project: false }) })}>
                    {Object.entries(data.needs).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                  </SelectInput>
                </td>
                <td style={td}>{supervised(r) && a.can_be_on_project ? <input type="checkbox" style={check} aria-label={`The supervisor for "${a.label}" must be on the project`} checked={!!r.on_project} disabled={!canChange} onChange={(e) => set(a.key, { on_project: e.target.checked })} /> : <span style={{ color: 'var(--text-secondary)' }}>·</span>}</td>
                <td style={td}>{r.needs !== 'none' ? <input type="checkbox" style={check} aria-label={`"${a.label}" must say why`} checked={!!r.reason} disabled={!canChange} onChange={(e) => set(a.key, { reason: e.target.checked })} /> : <span style={{ color: 'var(--text-secondary)' }}>·</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      <p style={{ margin: '12px 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>A supervisor is someone else who holds "Approve serious actions in Projects" and could open the project themselves. Nobody is exempt, owners included. Every change to this table is logged, and each saved version is kept.</p>
      {problem && <Notice status="problem" style={{ marginBottom: 12 }}>{problem}</Notice>}
      {canChange && <Btn type="submit" variant="primary" busy={busy}>Save serious actions</Btn>}
    </Panel>
  );
}
