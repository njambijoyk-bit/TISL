import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { hasPermission } from '../../../_shared/lib/roles';
import { useAuthStore } from '../../../_shared/store/index';
import { useProjectNames } from '../../lib/names';
import { day, message, where } from '../../lib/format';
import { Btn, Chip, DataTable, Notice, Panel, SelectInput, TextInput } from '../../components/ui';
import { td, th } from '../../components/uiTokens';
import ProjectKeys from '../../components/ProjectKeys';

/**
 * The list of work (docs/PROJECTS_STAGE1_SPEC.md, build 1.3). A person sees the work they are on; with "see every project" they can switch to
 * everything that is not confidential. The buttons carry the standard names so the TISL keys find them (F2 new, F12 configuration,
 * Shift+arrows for the pages, / for the search box).
 */
const STATES = [['active', 'Open and on hold'], ['open', 'Open'], ['on_hold', 'On hold'], ['closed', 'Closed'], ['cancelled', 'Cancelled'], ['', 'All']];

/** Stage 12: health from the latest scorecard (the worst KPI). */
const HEALTH = { good: ['good', 'On track'], warn: ['warning', 'Needs watching'], bad: ['problem', 'Off track'] };
const HEALTH_FILTER = { '': 'Any health', bad: 'Off track', warn: 'Needs watching', good: 'On track', none: 'Not measured' };

export default function ProjectsList() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { t, ready, loaded } = useProjectNames();
  const canAll = hasPermission(user, 'projects.view_all');
  const [filters, setFilters] = useState({ scope: 'mine', state: 'active', q: '', page: 1 });
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState(null);
  const [failed, setFailed] = useState('');
  const [invitations, setInvitations] = useState([]);

  const load = useCallback(async () => {
    try {
      setResult(await projectsAPI.list({ ...filters, per_page: 25 }));
      setFailed('');
    } catch (e) {
      setFailed(message(e, 'The list could not be loaded. Check your connection and try again.'));
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { projectsAPI.invitations().then(setInvitations).catch(() => setInvitations([])); }, []);
  useEffect(() => {
    const id = setTimeout(() => setFilters((f) => (f.q === typed ? f : { ...f, q: typed, page: 1 })), 300);
    return () => clearTimeout(id);
  }, [typed]);

  const set = (patch) => setFilters((f) => ({ ...f, page: 1, ...patch }));
  const answer = async (inv, accept) => {
    try {
      setInvitations(await projectsAPI.answerInvitation(inv.project_id, accept));
      if (accept) navigate(`/admin/projects/${inv.project_id}`); else load();
    } catch (e) {
      setFailed(message(e, 'That could not be done. Try again.'));
    }
  };
  const pages = result ? Math.max(1, Math.ceil(result.total / result.per_page)) : 1;
  const countOf = (key) => {
    if (!result) return null;
    const c = result.counts;
    if (key === 'active') return c.open + c.on_hold;
    if (key === '') return c.open + c.on_hold + c.closed + c.cancelled;
    return c[key];
  };
  const one = t('project', false, true);
  const many = t('project', true, true);

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader
        title={t('project', true)}
        subtitle={filters.scope === 'mine' ? `The ${many} you are on` : `Every ${one} you may see`}
        actions={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {hasPermission(user, 'projects.log.view') && ready && <Btn onClick={() => navigate('/admin/projects/log')}>Activity log</Btn>}
            {hasPermission(user, 'projects.delete') && ready && <Btn onClick={() => navigate('/admin/projects/trash')}>Trash</Btn>}
            {hasPermission(user, 'projects.config.view') && <Btn onClick={() => navigate('/admin/projects/configuration')}>Configuration</Btn>}
            {hasPermission(user, 'projects.create') && ready && <Btn variant="primary" data-hotkey="F2" onClick={() => navigate('/admin/projects/new')}>New {one}</Btn>}
          </div>
        )}
      />

      {loaded && !ready && (
        <Notice status="warning" style={{ marginBottom: 16 }}>The database for the new module is not in place yet. Run scripts 256 and 257, then load the permissions.</Notice>
      )}
      {failed && <Notice status="problem" style={{ marginBottom: 16 }}>{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>}
      {invitations.map((inv) => (
        <Notice key={inv.project_id} status="info" style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span>{inv.invited_by || 'Someone'} invited you to <b>{inv.number}{inv.title ? ` · ${inv.title}` : ''}</b>{inv.confidential ? ' (confidential: you see what it is once you accept)' : ''} as {inv.role}.</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <Btn small variant="primary" aria-label={`Accept the invitation to ${inv.number}`} onClick={() => answer(inv, true)}>Accept</Btn>
            <Btn small aria-label={`Decline the invitation to ${inv.number}`} onClick={() => answer(inv, false)}>Decline</Btn>
          </span>
        </Notice>
      ))}

      <Panel>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          {canAll && (
            <div role="group" aria-label="Whose work" style={{ display: 'inline-flex', gap: 4 }}>
              <Btn small variant={filters.scope === 'mine' ? 'primary' : 'plain'} aria-pressed={filters.scope === 'mine'} onClick={() => set({ scope: 'mine' })}>Mine</Btn>
              <Btn small variant={filters.scope === 'all' ? 'primary' : 'plain'} aria-pressed={filters.scope === 'all'} onClick={() => set({ scope: 'all' })}>All I may see</Btn>
            </div>
          )}
          <label htmlFor="projects-state" style={{ position: 'absolute', left: -9999 }}>Show</label>
          <SelectInput id="projects-state" value={filters.state} onChange={(e) => set({ state: e.target.value })} style={{ width: 'auto', minWidth: 190 }}>
            {STATES.map(([key, label]) => <option key={key || 'all'} value={key}>{label}{countOf(key) === null ? '' : ` (${countOf(key)})`}</option>)}
          </SelectInput>
          <label htmlFor="projects-health" style={{ position: 'absolute', left: -9999 }}>Health</label>
          <SelectInput id="projects-health" value={filters.health ?? ''} onChange={(e) => set({ health: e.target.value || undefined })} style={{ width: 'auto' }}>
            {Object.entries(HEALTH_FILTER).map(([k, l]) => <option key={k || 'any'} value={k}>{l}</option>)}
          </SelectInput>
          <label htmlFor="projects-search" style={{ position: 'absolute', left: -9999 }}>Search</label>
          <TextInput id="projects-search" type="search" placeholder="Search by number, title or reference" value={typed} onChange={(e) => setTyped(e.target.value)} style={{ flex: '1 1 240px', maxWidth: 360 }} />
        </div>

        {!result && !failed && <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p>}
        {result && result.data.length === 0 && (
          <div style={{ padding: '28px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <p style={{ margin: '0 0 6px', fontWeight: 600, color: 'var(--text-primary)' }}>{filters.q || filters.state !== 'active' ? `No ${many} match` : `No ${many} yet`}</p>
            <p style={{ margin: 0, fontSize: 13.5 }}>
              {filters.q || filters.state !== 'active' ? 'Try another search or show a different state.' : filters.scope === 'mine' ? `You are not on any ${one} that is open. ${canAll ? 'Switch to "All I may see" to look wider.' : ''}` : `Start the first one with New ${one}.`}
            </p>
          </div>
        )}
        {result && result.data.length > 0 && (
          <DataTable minWidth={760}>
            <thead>
              <tr>
                <th style={th}>No.</th><th style={th}>Title</th><th style={th}>{t('client')}</th><th style={th}>Kind</th><th style={th}>Stage</th><th style={th}>{t('lead')}</th><th style={th}>Expected end</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((p) => {
                const at = where(p);
                return (
                  <tr key={p.id}>
                    <td style={{ ...td, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{p.number}</td>
                    <td style={td}>
                      <Link to={`/admin/projects/${p.id}`} style={{ color: 'var(--color-primary-500)', fontWeight: 600, textDecoration: 'none' }}>{p.title}</Link>
                      {HEALTH[p.health] && <Chip status={HEALTH[p.health][0]} style={{ marginLeft: 8 }}>{HEALTH[p.health][1]}</Chip>}
                      {p.confidential && <Chip status="problem" style={{ marginLeft: 8 }}>Confidential</Chip>}
                      {p.frozen && <Chip style={{ marginLeft: 8 }}>Frozen</Chip>}
                    </td>
                    <td style={td}>{p.customer?.name || '—'}</td>
                    <td style={td}>{p.type.name}</td>
                    <td style={td}><Chip status={at.status}>{at.label}</Chip></td>
                    <td style={td}>{p.lead.name}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{day(p.due_date) || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
        {result && pages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Page {result.page} of {pages} · {result.total} in all</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn small disabled={result.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>Previous</Btn>
              <Btn small disabled={result.page >= pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next</Btn>
            </div>
          </div>
        )}
      </Panel>
    </AdminLayout>
  );
}
