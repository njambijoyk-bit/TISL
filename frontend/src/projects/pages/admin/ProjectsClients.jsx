import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { day, message, money } from '../../lib/format';
import { Btn, Chip, DataTable, Notice, Panel, TextInput } from '../../components/ui';
import { td, th } from '../../components/uiTokens';
import ProjectKeys from '../../components/ProjectKeys';
import HealthDot from '../../components/HealthDot';

/**
 * Clients (docs/PROJECTS_STAGE3_SPEC.md, build 3.5): the customers Projects has to do with, each with its account manager, open work, last
 * contact, next action, flags, what it owes (from the books, for those who may see money) and health (for those who may see it).
 * A search finds any customer. The list can be exported as filtered.
 */
export default function ProjectsClients() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState({ scope: 'all', health: '', flagged: '', q: '', page: 1 });
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await projectsAPI.clients(filter)); setFailed(''); } catch (e) { setFailed(message(e, 'The clients could not be loaded. Try again.')); }
  }, [filter]);
  useEffect(() => { const id = setTimeout(load, filter.q ? 250 : 0); return () => clearTimeout(id); }, [load, filter.q]);
  const pick = (patch) => setFilter({ ...filter, ...patch, page: 1 });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;
  const exportIt = async () => {
    setBusy(true);
    try {
      const blob = await projectsAPI.exportClients({ scope: filter.scope, health: filter.health, flagged: filter.flagged, q: filter.q });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(message(e, 'The export could not be made. Try again.')); } finally { setBusy(false); }
  };

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title="Clients" subtitle="Who the work is for" actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn onClick={() => navigate('/admin/projects')}>Close</Btn>
          {data?.can.export && <Btn data-hotkey="F9" busy={busy} onClick={exportIt}>Export</Btn>}
        </div>
      )} />
      {failed && <Notice status="problem" style={{ marginBottom: 16 }}>{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>}
      <Panel>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <div role="group" aria-label="Whose clients" style={{ display: 'inline-flex', gap: 4 }}>
            {[['all', 'All'], ['mine', 'I manage']].map(([k, label]) => <Btn key={k} small variant={filter.scope === k ? 'primary' : 'plain'} aria-pressed={filter.scope === k} onClick={() => pick({ scope: k })}>{label}</Btn>)}
          </div>
          {data?.counts && (
            <div role="group" aria-label="Health" style={{ display: 'inline-flex', gap: 4 }}>
              {[['', 'Any health'], ['red', `At risk ${data.counts.red}`], ['amber', `Needs attention ${data.counts.amber}`], ['green', `Healthy ${data.counts.green}`]].map(([k, label]) => <Btn key={k || 'any'} small variant={filter.health === k ? 'primary' : 'plain'} aria-pressed={filter.health === k} onClick={() => pick({ health: k })}>{label}</Btn>)}
            </div>
          )}
          <Btn small variant={filter.flagged ? 'primary' : 'plain'} aria-pressed={!!filter.flagged} onClick={() => pick({ flagged: filter.flagged ? '' : '1' })}>Flagged</Btn>
          <TextInput type="search" aria-label="Search clients" placeholder="Search any customer" value={filter.q} onChange={(e) => pick({ q: e.target.value })} style={{ flex: '1 1 200px', maxWidth: 300 }} />
        </div>
        {data && data.data.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>{filter.q ? 'No customer matches that.' : 'No clients here yet. A lead that is won, or work started for a customer, puts them here.'}</p>}
        {data && data.data.length > 0 && (
          <DataTable minWidth={900}>
            <thead><tr><th style={th}>Client</th><th style={th}>Account manager</th><th style={th}>Open work</th><th style={th}>Last contact</th><th style={th}>Next action</th>{data.can.money && <th style={th}>Owes</th>}{data.can.health && <th style={th}>Health</th>}</tr></thead>
            <tbody>
              {data.data.map((c) => (
                <tr key={c.id} data-client={c.name}>
                  <td style={td}>
                    <Link to={`/admin/projects/clients/${c.id}`} style={{ color: 'var(--color-primary-500)', fontWeight: 600, textDecoration: 'none' }}>{c.name}</Link>
                    {c.flags.length > 0 && <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>{c.flags.map((f) => <Chip key={f.name} status={f.status}>{f.name}</Chip>)}</span>}
                  </td>
                  <td style={td}>{c.manager?.name || <span style={{ color: 'var(--text-secondary)' }}>None</span>}</td>
                  <td style={td}>{c.open_work}</td>
                  <td style={td}>{c.last_contact ? day(c.last_contact) : <span style={{ color: 'var(--text-secondary)' }}>Never</span>}</td>
                  <td style={td}>{c.next ? <>{c.next.what} · <Chip status={c.next.late ? 'problem' : c.next.today ? 'warning' : 'neutral'}>{c.next.late ? `${c.next.days_late} days late` : c.next.today ? 'today' : day(c.next.due_on)}</Chip></> : <span style={{ color: 'var(--text-secondary)' }}>Nothing planned</span>}</td>
                  {data.can.money && <td style={{ ...td, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{c.money ? <>{money(c.money.owed, c.money.currency)}{c.money.overdue > 0 && <span style={{ display: 'block', fontSize: 12, color: 'var(--status-error)' }}>{money(c.money.overdue, c.money.currency)} overdue</span>}</> : <span style={{ color: 'var(--text-secondary)' }}>·</span>}</td>}
                  {data.can.health && <td style={td}><HealthDot health={c.health} /></td>}
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        {data && pages > 1 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', marginTop: 12, fontSize: 13 }}>
            <Btn small disabled={filter.page <= 1} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}>Previous</Btn>
            <span>Page {filter.page} of {pages}</span>
            <Btn small disabled={filter.page >= pages} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Next</Btn>
          </div>
        )}
      </Panel>
    </AdminLayout>
  );
}
