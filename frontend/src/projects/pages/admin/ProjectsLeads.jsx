import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { day, LEAD_STATUS, message } from '../../lib/format';
import { Btn, Chip, DataTable, Notice, Panel, PanelTitle, TextInput } from '../../components/ui';
import { td, th } from '../../components/uiTokens';
import ProjectKeys from '../../components/ProjectKeys';
import LeadForm from '../../components/LeadForm';

/**
 * Leads (docs/PROJECTS_STAGE3_SPEC.md, build 3.1): people and companies that are not clients yet. Someone sees their own; with the permission,
 * everyone's. The list starts on what is still open; lost and won ones stay findable.
 */
const FILTERS = [['open', 'Open'], ['new', 'New'], ['working', 'Working'], ['won', 'Won'], ['lost', 'Lost']];

export default function ProjectsLeads() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState({ scope: 'mine', status: 'open', q: '', page: 1 });
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setData(await projectsAPI.leads(filter)); setFailed(''); } catch (e) { setFailed(message(e, 'The leads could not be loaded. Try again.')); }
  }, [filter]);
  useEffect(() => { const id = setTimeout(load, filter.q ? 250 : 0); return () => clearTimeout(id); }, [load, filter.q]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.per_page)) : 1;
  const pick = (patch) => setFilter({ ...filter, ...patch, page: 1 });

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title="Leads" subtitle="People and companies that are not clients yet" actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn onClick={() => navigate('/admin/projects')}>Close</Btn>
          {data?.can.change && data.ready && !adding && <Btn variant="primary" data-hotkey="F2" onClick={() => setAdding(true)}>New lead</Btn>}
        </div>
      )} />
      {data && !data.ready && <Notice status="warning" style={{ marginBottom: 16 }}>Leads need database script 259. Until it has run there is nothing here.</Notice>}
      {failed && <Notice status="problem" style={{ marginBottom: 16 }}>{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>}

      {adding && (
        <Panel style={{ marginBottom: 16 }}>
          <PanelTitle hint="A lead stays out of your customers and your books until it is won.">New lead</PanelTitle>
          <LeadForm onSaved={(lead) => navigate(`/admin/projects/leads/${lead.id}`)} onCancel={() => setAdding(false)} />
        </Panel>
      )}

      <Panel>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          {data?.sees_all && (
            <div role="group" aria-label="Whose leads" style={{ display: 'inline-flex', gap: 4 }}>
              {[['mine', 'Mine'], ['all', 'Everyone\'s']].map(([k, label]) => <Btn key={k} small variant={filter.scope === k ? 'primary' : 'plain'} aria-pressed={filter.scope === k} onClick={() => pick({ scope: k })}>{label}</Btn>)}
            </div>
          )}
          <div role="group" aria-label="Which leads" style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
            {FILTERS.map(([k, label]) => <Btn key={k} small variant={filter.status === k ? 'primary' : 'plain'} aria-pressed={filter.status === k} onClick={() => pick({ status: k })}>{label}{data && k !== 'open' ? ` ${data.counts[k]}` : ''}</Btn>)}
          </div>
          <TextInput type="search" aria-label="Search leads" placeholder="Search a name, email or phone" value={filter.q} onChange={(e) => pick({ q: e.target.value })} style={{ flex: '1 1 220px', maxWidth: 320 }} />
        </div>

        {data && data.data.length === 0 && <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13.5 }}>{filter.q ? 'No lead matches that.' : filter.status === 'open' ? 'No open leads. Add one with New lead.' : 'None.'}</p>}
        {data && data.data.length > 0 && (
          <DataTable minWidth={820}>
            <thead><tr><th style={th}>Lead</th><th style={th}>Contact</th><th style={th}>Came from</th><th style={th}>Owner</th><th style={th}>Status</th><th style={th}>Next action</th></tr></thead>
            <tbody>
              {data.data.map((l) => (
                <tr key={l.id} data-lead={l.name}>
                  <td style={td}><Link to={`/admin/projects/leads/${l.id}`} style={{ color: 'var(--color-primary-500)', fontWeight: 600, textDecoration: 'none' }}>{l.name}</Link></td>
                  <td style={td}>{l.contact_name || <span style={{ color: 'var(--text-secondary)' }}>·</span>}</td>
                  <td style={td}>{l.referred_by?.name ? `Referred by ${l.referred_by.name}` : l.source?.name || <span style={{ color: 'var(--text-secondary)' }}>Not known</span>}</td>
                  <td style={td}>{l.owner.name}</td>
                  <td style={td}><Chip status={LEAD_STATUS[l.status][1]}>{LEAD_STATUS[l.status][0]}</Chip></td>
                  <td style={td}>{l.status === 'lost' ? <span style={{ color: 'var(--text-secondary)' }}>{l.lost?.reason}</span> : l.next
                    ? <>{l.next.what} · <Chip status={l.next.late ? 'problem' : l.next.today ? 'warning' : 'neutral'}>{l.next.late ? `${l.next.days_late} ${l.next.days_late === 1 ? 'day' : 'days'} late` : l.next.today ? 'today' : day(l.next.due_on)}</Chip></>
                    : <span style={{ color: 'var(--text-secondary)' }}>Nothing planned</span>}</td>
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
