import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { day, message } from '../../lib/format';
import { Btn, Chip, Field, Notice, Panel, PanelTitle, SelectInput } from '../../components/ui';
import ProjectKeys from '../../components/ProjectKeys';

const key = (i) => `${i.kind}:${i.id}`;

/**
 * Hand over work (docs/PROJECTS_STAGE6_SPEC.md, build 6.8): one person's open tasks, key dates they are responsible for, conversations they answer,
 * meetings they organise and follow-ups on the client move to someone else, on one piece of work or on all their work. All or some. Handing over
 * someone else's work is a serious action (the shared dialog asks for approval when the company set one). The People tab links here with the
 * person and the work filled in.
 */
export default function ProjectsHandover() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [people, setPeople] = useState(null);
  const [f, setF] = useState({ from: params.get('from') ?? '', to: '', project_id: params.get('project') ?? '' });
  const [plan, setPlan] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { projectsAPI.handoverPeople().then((r) => setPeople(r.people)).catch((e) => setProblem(message(e, 'The people could not be loaded.'))); }, []);
  const look = useCallback(async () => {
    if (!f.from || !f.to) { setPlan(null); return; }
    setBusy('look');
    try {
      const r = await projectsAPI.handoverPreview({ from: f.from, to: f.to, ...(f.project_id ? { project_id: f.project_id } : {}) });
      setPlan(r); setPicked(new Set(r.projects.filter((p) => !p.blocked).flatMap((p) => p.items.map(key)))); setProblem('');
    } catch (e) { setPlan(null); setProblem(message(e, 'What would move could not be worked out.')); } finally { setBusy(''); }
  }, [f]);
  useEffect(() => { look(); }, [look]);

  const flip = (k) => setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const go = async () => {
    setBusy('go');
    try {
      const items = plan.projects.flatMap((p) => p.items).filter((i) => picked.has(key(i))).map((i) => ({ kind: i.kind, id: i.id }));
      const r = await projectsAPI.handOver({ from: Number(f.from), to: Number(f.to), ...(f.project_id ? { project_id: Number(f.project_id) } : {}), items });
      toast.success(r.message); setProblem(''); look();
    } catch (e) { setProblem(message(e, 'The work could not be handed over.')); } finally { setBusy(''); }
  };
  const count = picked.size;
  const header = <PageHeader title="Hand over work" subtitle="Move someone's tasks, dates, conversations, meetings and follow-ups to someone else" actions={<Btn onClick={() => navigate(-1)}>Close</Btn>} />;

  return (
    <AdminLayout><ProjectKeys />
      {header}
      <Panel style={{ marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <Field label="Whose work" htmlFor="ho-from"><SelectInput id="ho-from" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })}><option value="">Choose</option>{(people ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectInput></Field>
          <Field label="Goes to" htmlFor="ho-to"><SelectInput id="ho-to" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}><option value="">Choose</option>{(people ?? []).filter((u) => String(u.id) !== f.from).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectInput></Field>
          <Field label="On" htmlFor="ho-scope"><SelectInput id="ho-scope" value={f.project_id ? 'one' : 'all'} onChange={(e) => setF({ ...f, project_id: e.target.value === 'all' ? '' : params.get('project') ?? '' })}>
            {params.get('project') && <option value="one">This piece of work only</option>}<option value="all">All their work</option>
          </SelectInput></Field>
        </div>
      </Panel>
      {problem && <Notice status="problem" style={{ marginBottom: 12 }}>{problem}</Notice>}
      {plan && (
        <div style={{ display: 'grid', gap: 12 }} data-handover>
          {plan.serious && <Notice status="info">Handing over someone else's work is a serious action: if the company asks for a supervisor, you will be asked why and it waits for their approval.</Notice>}
          {plan.projects.length === 0 && <Notice status="info">{plan.from.name} has no open work to hand over{f.project_id ? ' on this piece of work' : ''}.</Notice>}
          {plan.projects.map((p) => (
            <Panel key={p.project.id} data-handover-project={p.project.number}>
              <PanelTitle hint={p.blocked ?? `${p.items.length} ${p.items.length === 1 ? 'item' : 'items'}`} right={p.blocked ? <Chip status="warning">Stays</Chip> : null}>{p.project.number} {p.project.title}</PanelTitle>
              {Object.entries(plan.kinds).map(([k, label]) => {
                const items = p.items.filter((i) => i.kind === k);
                if (!items.length) return null;
                return (
                  <div key={k} role="group" aria-label={`${label} on ${p.project.number}`} style={{ display: 'grid', gap: 4, marginBottom: 8 }}>
                    <strong style={{ fontSize: 12.5 }}>{label}</strong>
                    {items.map((i) => (
                      <label key={key(i)} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, opacity: p.blocked ? 0.55 : 1 }}>
                        <input type="checkbox" checked={picked.has(key(i))} disabled={!!p.blocked} onChange={() => flip(key(i))} /> {i.label}{i.when ? <span style={{ color: 'var(--text-secondary)' }}> · {day(i.when.slice(0, 10))}{i.when.length > 10 ? ` ${i.when.slice(11, 16)}` : ''}</span> : null}
                      </label>
                    ))}
                  </div>
                );
              })}
            </Panel>
          ))}
          {plan.projects.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Btn variant="primary" busy={busy === 'go'} disabled={count === 0} onClick={go}>Hand {count} {count === 1 ? 'item' : 'items'} to {plan.to.name}</Btn>
              <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Both {plan.from.name} and {plan.to.name} are told; every move is logged. Leading a piece of work is handed over on its People tab.</span>
            </div>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
