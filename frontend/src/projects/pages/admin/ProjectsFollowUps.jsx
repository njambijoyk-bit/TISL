import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { day, message } from '../../lib/format';
import { Btn, Chip, Notice, Panel } from '../../components/ui';
import ProjectKeys from '../../components/ProjectKeys';
import DoneForm from '../../components/DoneForm';

/**
 * My follow-ups (docs/PROJECTS_STAGE3_SPEC.md, build 3.4): every open next action on my leads, clients and opportunities, late first.
 * With the permission to see every lead, everyone's. Marking one done asks what happened and what is next.
 */
const KIND = { lead: 'Lead', customer: 'Client', opportunity: 'Opportunity' };

export default function ProjectsFollowUps() {
  const navigate = useNavigate();
  const [scope, setScope] = useState('mine');
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [doing, setDoing] = useState(null);

  const load = useCallback(async () => {
    try { setData(await projectsAPI.followUps({ scope })); setFailed(''); } catch (e) { setFailed(message(e, 'Your follow-ups could not be loaded. Try again.')); }
  }, [scope]);
  useEffect(() => { load(); }, [load]);

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title="Follow-ups" subtitle="What is next on leads, clients and opportunities" actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>} />
      {data && !data.ready && <Notice status="warning" style={{ marginBottom: 16 }}>Follow-ups need database script 259.</Notice>}
      {failed && <Notice status="problem" style={{ marginBottom: 16 }}>{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>}
      {data && (
        <Panel>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            {data.sees_all && (
              <div role="group" aria-label="Whose follow-ups" style={{ display: 'inline-flex', gap: 4 }}>
                {[['mine', 'Mine'], ['all', 'Everyone\'s']].map(([k, label]) => <Btn key={k} small variant={scope === k ? 'primary' : 'plain'} aria-pressed={scope === k} onClick={() => setScope(k)}>{label}</Btn>)}
              </div>
            )}
            <Chip status={data.counts.late ? 'problem' : 'neutral'}>{data.counts.late} late</Chip>
            <Chip status={data.counts.today ? 'warning' : 'neutral'}>{data.counts.today} today</Chip>
            <Chip>{data.counts.later} later</Chip>
          </div>
          {data.items.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing to follow up. Set a next action from a lead, a client or an opportunity.</p>}
          <div style={{ display: 'grid', gap: 6 }}>
            {data.items.map((f) => (
              doing === f.id
                ? <DoneForm key={f.id} followUp={f} kinds={data.kinds} owners={data.owners} prefix={`done-${f.id}`} onCancel={() => setDoing(null)}
                  onDone={async (d) => { setData(await projectsAPI.doneNext(f.id, { ...d, from_list: true })); setDoing(null); toast.success('Done'); }} />
                : (
                  <div key={f.id} data-follow-up={f.what} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 10, alignItems: 'center', padding: '8px 10px', borderRadius: 10, border: '1px solid var(--line)', fontSize: 13.5 }}>
                    <Chip status={f.late ? 'problem' : f.today ? 'warning' : 'neutral'}>{f.late ? `${f.days_late} ${f.days_late === 1 ? 'day' : 'days'} late` : f.today ? 'Today' : day(f.due_on)}</Chip>
                    <span style={{ minWidth: 0 }}>
                      <strong>{f.what}</strong>
                      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)' }}>{KIND[f.subject.type]}: <Link to={f.subject.url} style={{ color: 'var(--color-primary-500)' }}>{f.subject.name}</Link>{scope === 'all' ? ` · ${f.owner.name}` : ''}</span>
                    </span>
                    <Btn small variant="primary" aria-label={`Mark "${f.what}" done`} onClick={() => setDoing(f.id)}>Done</Btn>
                  </div>
                )
            ))}
          </div>
        </Panel>
      )}
    </AdminLayout>
  );
}
