import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, TextInput } from './ui';
import { check, td, th } from './uiTokens';

/**
 * Project roles (docs/PROJECTS_STAGE1_SPEC.md, build 1.5): what a person may do ON a piece of work. A grid of roles against abilities; a tick is
 * saved the moment it is changed. `canEdit` comes from the server (projects.config.roles).
 */
export default function ProjectRolesPanel({ canEdit }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setData(await projectsAPI.projectRoles()); setFailed(''); } catch (e) { setFailed(message(e, 'The roles could not be loaded. Try again.')); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const run = async (call, done) => {
    try { setData(await call()); if (done) toast.success(done); return true; } catch (e) { toast.error(message(e, 'That could not be saved. Try again.')); return false; }
  };
  const toggle = (role, ability) => {
    const abilities = role.abilities.includes(ability) ? role.abilities.filter((a) => a !== ability) : [...role.abilities, ability];
    run(() => projectsAPI.changeProjectRole(role.id, { abilities }), null);
  };
  const add = async (e) => {
    e.preventDefault();
    if (await run(() => projectsAPI.addProjectRole({ name, abilities: ['open'] }), 'Role added. Tick what it allows.')) { setName(''); setAdding(false); }
  };

  if (failed) return <Notice status="problem">{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>;
  if (!data) return <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading the roles…</p></Panel>;
  const abilities = Object.entries(data.abilities);

  return (
    <Panel>
      <PanelTitle
        hint="What a person may do on a piece of work they are on. Their role in TISL must also hold the permission: both must say yes."
        right={canEdit && !adding ? <Btn small variant="primary" onClick={() => setAdding(true)}>New role</Btn> : null}
      >
        Project roles
      </PanelTitle>
      {adding && (
        <form onSubmit={add} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
          <Field label="Name of the role" htmlFor="role-name"><TextInput id="role-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required autoFocus /></Field>
          <Btn type="submit" variant="primary" small>Add role</Btn>
          <Btn small onClick={() => setAdding(false)}>Cancel</Btn>
        </form>
      )}
      <DataTable minWidth={760}>
        <thead>
          <tr>
            <th style={th}>On a piece of work they can</th>
            {data.roles.map((r) => (
              <th key={r.id} style={{ ...th, textAlign: 'center', textTransform: 'none', letterSpacing: 0, fontSize: 12.5, color: r.is_active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {r.name}{!r.is_active && <div><Chip>Off</Chip></div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {abilities.map(([key, label]) => (
            <tr key={key}>
              <td style={td}>{label}</td>
              {data.roles.map((r) => {
                const locked = r.key === 'lead' && ['open', 'edit', 'members'].includes(key);
                return (
                  <td key={r.id} style={{ ...td, textAlign: 'center' }}>
                    <input type="checkbox" style={check} aria-label={`${r.name}: ${label}`} checked={r.abilities.includes(key)} disabled={!canEdit || locked} title={locked ? 'The Lead role always keeps this' : undefined} onChange={() => toggle(r, key)} />
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td style={{ ...td, color: 'var(--text-secondary)' }}>People holding it</td>
            {data.roles.map((r) => <td key={r.id} style={{ ...td, textAlign: 'center', color: 'var(--text-secondary)' }}>{r.people}</td>)}
          </tr>
          {canEdit && (
            <tr>
              <td style={{ ...td, color: 'var(--text-secondary)' }}>Use this role</td>
              {data.roles.map((r) => (
                <td key={r.id} style={{ ...td, textAlign: 'center' }}>
                  {r.key !== 'lead' && <Btn small variant="quiet" aria-label={`${r.is_active ? 'Switch off' : 'Switch on'} ${r.name}`} onClick={() => run(() => projectsAPI.changeProjectRole(r.id, { is_active: !r.is_active }), r.is_active ? 'Switched off' : 'Switched on')}>{r.is_active ? 'Switch off' : 'Switch on'}</Btn>}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </DataTable>
    </Panel>
  );
}
