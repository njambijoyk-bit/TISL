import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import projectsAPI from '../../_shared/api/projects';
import { day, message } from '../lib/format';
import { Btn, Chip, DataTable, Field, Notice, Panel, PanelTitle, SelectInput, TextInput } from './ui';
import { td, th } from './uiTokens';

/**
 * Who can get into a piece of work (docs/PROJECTS_STAGE1_SPEC.md, build 1.5): each person, their project role, whether they have accepted,
 * and the dates their access runs. Inviting, changing and removing are offered only to someone whose own project role manages people.
 * `onTransferred(project)` hands the page the project after its lead changed.
 */
const STATUS = { active: ['On it', 'good'], invited: ['Invited', 'info'], declined: ['Declined', 'neutral'] };

export default function PeoplePanel({ projectId, word, onTransferred }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [mode, setMode] = useState(null);   // null | 'invite' | 'transfer' | { remove: member }
  const [form, setForm] = useState({ user_id: '', project_role_id: '', starts_at: '', ends_at: '', note: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await projectsAPI.members(projectId)); setFailed(''); } catch (e) { setFailed(message(e, 'The list could not be loaded. Try again.')); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const open = (m) => { setForm({ user_id: '', project_role_id: data?.roles?.[1]?.id || data?.roles?.[0]?.id || '', starts_at: '', ends_at: '', note: '' }); setMode(m); };
  const run = async (call, done) => {
    setBusy(true);
    try { setData(await call()); setMode(null); toast.success(done); } catch (e) { toast.error(message(e, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };
  const invite = (e) => {
    e.preventDefault();
    run(() => projectsAPI.invite(projectId, { user_id: Number(form.user_id), project_role_id: Number(form.project_role_id), starts_at: form.starts_at || null, ends_at: form.ends_at || null }), 'Invited');
  };
  const transfer = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const project = await projectsAPI.transfer(projectId, Number(form.user_id), form.note || null);
      toast.success(`Handed to ${project.lead.name}`);
      setMode(null);
      onTransferred(project);
      await load();
    } catch (err) { toast.error(message(err, 'That could not be done. Try again.')); } finally { setBusy(false); }
  };
  const can = data?.can?.members;
  const lead = word('lead', false, true);

  return (
    <Panel>
      <PanelTitle
        hint="Everyone who can get in, and as what. Someone invited is not on it until they accept."
        right={!mode && data && (
          <div style={{ display: 'flex', gap: 8 }}>
            {data.can.transfer && <Btn small onClick={() => open('transfer')}>Transfer</Btn>}
            {can && <Btn small variant="primary" onClick={() => open('invite')}>Invite</Btn>}
          </div>
        )}
      >
        People
      </PanelTitle>

      {failed && <Notice status="problem">{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>}

      {mode === 'invite' && (
        <form onSubmit={invite} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, alignItems: 'end', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
          <Field label="Person" htmlFor="member-person">
            <SelectInput id="member-person" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required>
              <option value="">Choose…</option>
              {data.candidates.map((u) => <option key={u.id} value={u.id}>{u.name}{u.skills?.length ? ` · ${u.skills.join(', ')}` : ''}</option>)}
            </SelectInput>
          </Field>
          <Field label="As" htmlFor="member-role">
            <SelectInput id="member-role" value={form.project_role_id} onChange={(e) => setForm({ ...form, project_role_id: e.target.value })} required>
              {data.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="From (optional)" htmlFor="member-from"><TextInput id="member-from" type="date" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
          <Field label="Until (optional)" htmlFor="member-until"><TextInput id="member-until" type="date" value={form.ends_at} min={form.starts_at || undefined} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} /></Field>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
            <Btn type="submit" variant="primary" small busy={busy}>Send invitation</Btn>
            <Btn small onClick={() => setMode(null)}>Cancel</Btn>
          </div>
          {data.candidates.length === 0 && <span style={{ gridColumn: '1 / -1', fontSize: 13, color: 'var(--text-secondary)' }}>Everyone who can open this module is already on it or invited.</span>}
        </form>
      )}

      {mode === 'transfer' && (
        <form onSubmit={transfer} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, alignItems: 'end', padding: 12, borderRadius: 10, background: 'var(--surface-input)', marginBottom: 12 }}>
          <Field label={`New ${lead}`} htmlFor="transfer-person">
            <SelectInput id="transfer-person" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} required>
              <option value="">Choose…</option>
              {[...data.members.filter((m) => m.status === 'active' && !m.is_lead).map((m) => ({ id: m.user_id, name: m.name })), ...data.candidates].map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Hand-over note" htmlFor="transfer-note" hint="Kept in the log."><TextInput id="transfer-note" value={form.note} maxLength={200} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn type="submit" variant="primary" small busy={busy}>Hand it over</Btn>
            <Btn small onClick={() => setMode(null)}>Cancel</Btn>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>They lead it at once. The present {lead} stays on it as a member.</span>
          </div>
        </form>
      )}

      {mode?.remove && (
        <Notice status="warning" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>{mode.remove.status === 'invited' ? <>Withdraw the invitation to <b>{mode.remove.name}</b>?</> : <>Take <b>{mode.remove.name}</b> off this? They will no longer be able to open it.</>}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <Btn small variant="danger" busy={busy} onClick={() => run(() => projectsAPI.removeMember(projectId, mode.remove.id), mode.remove.status === 'invited' ? 'Invitation withdrawn' : 'Taken off')}>Yes</Btn>
            <Btn small onClick={() => setMode(null)}>No</Btn>
          </span>
        </Notice>
      )}

      {data && (
        <DataTable minWidth={620}>
          <thead><tr><th style={th}>Person</th><th style={th}>As</th><th style={th}>State</th><th style={th}>Access</th>{can && <th style={th}><span style={{ position: 'absolute', left: -9999 }}>Actions</span></th>}</tr></thead>
          <tbody>
            {data.members.map((m) => {
              const [label, status] = STATUS[m.status] || [m.status, 'neutral'];
              const lapsed = m.status === 'active' && !m.on_it;
              return (
                <tr key={m.id} data-member={m.name}>
                  <td style={{ ...td, fontWeight: 600 }}>{m.name} {m.is_lead && <Chip status="brand" style={{ marginLeft: 6 }}>{word('lead')}</Chip>}</td>
                  <td style={td}>
                    {can && !m.is_lead ? (
                      <SelectInput aria-label={`Role of ${m.name}`} value={m.role.id} onChange={(e) => run(() => projectsAPI.changeMember(projectId, m.id, { project_role_id: Number(e.target.value) }), 'Role changed')} style={{ width: 'auto', minWidth: 130 }}>
                        {data.roles.some((r) => r.id === m.role.id) ? null : <option value={m.role.id}>{m.role.name}</option>}
                        {data.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </SelectInput>
                    ) : m.role.name}
                  </td>
                  <td style={td}><Chip status={lapsed ? 'warning' : status}>{lapsed ? 'Outside its dates' : label}</Chip>{m.status === 'invited' && m.invited_by && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>by {m.invited_by}</div>}</td>
                  <td style={{ ...td, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{m.starts_at || m.ends_at ? `${day(m.starts_at) || 'Now'} to ${day(m.ends_at) || 'no end'}` : 'No end date'}</td>
                  {can && <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{m.status === 'active' && <Link to={`/admin/projects/handover?from=${m.user_id}&project=${projectId}`} aria-label={`Hand over ${m.name}'s work`} style={{ fontSize: 12.5, color: 'var(--color-primary-500)', textDecoration: 'none', fontWeight: 600, marginRight: 8 }}>Hand over</Link>}{!m.is_lead && <Btn small variant="quiet" aria-label={`${m.status === 'invited' ? 'Withdraw the invitation to' : 'Remove'} ${m.name}`} onClick={() => setMode({ remove: m })}>{m.status === 'invited' ? 'Withdraw' : 'Remove'}</Btn>}</td>}
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </Panel>
  );
}
