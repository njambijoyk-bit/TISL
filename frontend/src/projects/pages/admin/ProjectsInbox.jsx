import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { message } from '../../lib/format';
import { Btn, Chip, Notice, Panel, SelectInput } from '../../components/ui';
import ProjectKeys from '../../components/ProjectKeys';

const TONE = { team: 'neutral', client: 'info', others: 'warning' };
const VIEWS = [['', 'Everything'], ['unread', 'Unread'], ['mentions', 'Mentions'], ['mine', 'Mine to answer']];
const when = (at) => (at ? new Date(at.replace(' ', 'T')).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

/**
 * The inbox (docs/PROJECTS_STAGE6_SPEC.md, build 6.3): every conversation the person is in, across all their work, newest first, with unread
 * counts. Filters: unread, mentions, mine to answer, tag, piece of work, audience, open or closed. G then I opens it. The filters live in the
 * address, so a filtered inbox can be bookmarked.
 */
export default function ProjectsInbox() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState('');
  const view = VIEWS.find(([k]) => k && params.get(k))?.[0] ?? '';
  const f = { state: params.get('state') ?? 'open', tag: params.get('tag') ?? '', project_id: params.get('project_id') ?? '', audience: params.get('audience') ?? '' };
  const query = params.toString();
  const load = useCallback(async () => {
    try { setData(await projectsAPI.inbox(Object.fromEntries(new URLSearchParams(query)))); setProblem(''); } catch (e) { setProblem(message(e, 'The inbox could not be loaded. Try again.')); }
  }, [query]);
  useEffect(() => { load(); }, [load]);
  const set = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };
  const pickView = (k) => set({ unread: k === 'unread' ? '1' : '', mentions: k === 'mentions' ? '1' : '', mine: k === 'mine' ? '1' : '' });

  const header = <PageHeader title="Inbox" subtitle={data?.all ? 'Every conversation on the work you can see' : 'Every conversation on your work'} actions={<Btn onClick={() => navigate('/admin/projects')}>Close</Btn>} />;
  if (problem) return <AdminLayout><ProjectKeys />{header}<Notice status="problem">{problem}</Notice></AdminLayout>;
  if (!data) return <AdminLayout><ProjectKeys />{header}</AdminLayout>;
  if (!data.ready) return <AdminLayout><ProjectKeys />{header}<Notice status="warning">The inbox needs database script 263.</Notice></AdminLayout>;
  const total = { unread: data.totals.unread, mentions: data.totals.mentions, mine: data.totals.mine };

  return (
    <AdminLayout><ProjectKeys />
      {header}
      <div role="tablist" aria-label="Which conversations" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {VIEWS.map(([k, label]) => (
          <Btn key={k || 'all'} small role="tab" aria-selected={view === k} variant={view === k ? 'primary' : 'plain'} onClick={() => pickView(k)}>
            {label}{k && total[k] > 0 ? ` · ${total[k]}` : ''}
          </Btn>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <SelectInput aria-label="Open or closed" value={f.state} onChange={(e) => set({ state: e.target.value === 'open' ? '' : e.target.value })} style={{ width: 'auto' }}>
          <option value="open">Open</option><option value="closed">Closed</option><option value="all">Open and closed</option>
        </SelectInput>
        <SelectInput aria-label="Piece of work" value={f.project_id} onChange={(e) => set({ project_id: e.target.value })} style={{ width: 'auto', maxWidth: 280 }}>
          <option value="">All my work</option>{data.projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </SelectInput>
        <SelectInput aria-label="With" value={f.audience} onChange={(e) => set({ audience: e.target.value })} style={{ width: 'auto' }}>
          <option value="">Team, client and others</option>{Object.entries(data.audiences).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </SelectInput>
        <SelectInput aria-label="Tag" value={f.tag} onChange={(e) => set({ tag: e.target.value })} style={{ width: 'auto' }}>
          <option value="">Any tag</option>{data.tags.map((g) => <option key={g.id} value={g.key}>#{g.key} · {g.name}</option>)}
        </SelectInput>
      </div>

      <Panel data-inbox style={{ padding: 0 }}>
        {data.threads.length === 0 && <p style={{ margin: 0, padding: 16, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing here{view ? ' with this filter' : ''}.</p>}
        {data.threads.map((t, i) => (
          <Link key={t.id} to={`/admin/projects/${t.project.id}?tab=messages&thread=${t.id}`} data-inbox-thread={t.subject}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 10, padding: '11px 14px', borderTop: i ? '1px solid var(--line)' : 0, textDecoration: 'none', color: 'inherit', background: t.unread ? 'var(--surface-hover)' : 'transparent' }}>
            <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <strong style={{ fontSize: 14, fontWeight: t.unread ? 700 : 600 }}>{t.subject}</strong>
                <Chip status={TONE[t.audience]}>{data.audiences[t.audience] ?? t.audience}</Chip>
                {t.mentioned && <Chip status="info">Mentions you</Chip>}
                {t.mine && <Chip>Yours to answer</Chip>}
                {t.state === 'closed' && <Chip>Closed</Chip>}
                {t.tags.map((g) => <Chip key={g.id} status={g.status ?? 'neutral'}>#{g.key}</Chip>)}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{t.project.number} {t.project.title}{t.contacts.length ? ` · with ${t.contacts.map((c) => c.name).join(', ')}` : ''}</span>
              {t.last && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.last.from}: {t.last.text ?? 'removed'}</span>}
            </span>
            <span style={{ display: 'grid', justifyItems: 'end', alignContent: 'start', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
              {when(t.last_message_at)}
              {t.unread > 0 && <Chip status="info">{t.unread} new</Chip>}
            </span>
          </Link>
        ))}
      </Panel>
    </AdminLayout>
  );
}
