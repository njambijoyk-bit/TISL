import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { useProjectNames } from '../../lib/names';
import { day, message, money } from '../../lib/format';
import { Btn, Chip, Notice, Panel, PanelTitle } from '../../components/ui';
import ProjectKeys from '../../components/ProjectKeys';
import OpportunityForm from '../../components/OpportunityForm';
import OpportunityPanel from '../../components/OpportunityPanel';

/**
 * The pipeline (docs/PROJECTS_STAGE3_SPEC.md, build 3.2): every stage as a column, each card a piece of work a lead or a client might give.
 * A column's total is read from the books for cards with a quotation; a total that includes a guess says so. Won and Lost show the last 30 days.
 */
export default function ProjectsPipeline() {
  const navigate = useNavigate();
  const { t } = useProjectNames();
  const [scope, setScope] = useState('mine');
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState(() => Number(new URLSearchParams(window.location.search).get('open')) || null);   // a follow-up links straight to its card

  const load = useCallback(async () => {
    try { setData(await projectsAPI.pipeline({ scope })); setFailed(''); } catch (e) { setFailed(message(e, 'The pipeline could not be loaded. Try again.')); }
  }, [scope]);
  useEffect(() => { load(); }, [load]);
  const opened = openId && data ? data.stages.flatMap((s) => s.items).find((o) => o.id === openId) : null;

  return (
    <AdminLayout><ProjectKeys />
      <PageHeader title="Pipeline" subtitle="Work that leads and clients might give you" actions={(
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn onClick={() => navigate('/admin/projects')}>Close</Btn>
          {data?.can.change && data.ready && !adding && <Btn variant="primary" data-hotkey="F2" onClick={() => { setAdding(true); setOpenId(null); }}>New opportunity</Btn>}
        </div>
      )} />
      {data && !data.ready && <Notice status="warning" style={{ marginBottom: 16 }}>The pipeline needs database script 259. Until it has run there is nothing here.</Notice>}
      {failed && <Notice status="problem" style={{ marginBottom: 16 }}>{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>}

      {adding && (
        <Panel style={{ marginBottom: 16 }}>
          <PanelTitle>New opportunity</PanelTitle>
          <OpportunityForm onSaved={(o) => { setAdding(false); setOpenId(o.id); load(); }} onCancel={() => setAdding(false)} />
        </Panel>
      )}
      {opened && <OpportunityPanel opportunity={opened} can={data.can} word={t} onChanged={load} onClose={() => setOpenId(null)} />}

      {data && data.ready && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            {data.sees_all && (
              <div role="group" aria-label="Whose opportunities" style={{ display: 'inline-flex', gap: 4 }}>
                {[['mine', 'Mine'], ['all', 'Everyone\'s']].map(([k, label]) => <Btn key={k} small variant={scope === k ? 'primary' : 'plain'} aria-pressed={scope === k} onClick={() => setScope(k)}>{label}</Btn>)}
              </div>
            )}
            <Chip>{data.open} open</Chip>
          </div>
          <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.stages.length}, minmax(200px, 1fr))`, gap: 10, minWidth: data.stages.length * 210 }}>
              {data.stages.map((s) => (
                <section key={s.id} aria-label={s.name} data-stage={s.key} style={{ background: 'var(--surface-input)', borderRadius: 12, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)' }}><span>{s.name}</span><span>{s.items.length}</span></header>
                  {s.totals.map((tot) => <span key={tot.currency || 'none'} style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{money(tot.amount, tot.currency)}{tot.estimated ? ' (includes estimates)' : ''}</span>)}
                  {s.items.map((o) => (
                    <button key={o.id} type="button" onClick={() => { setOpenId(o.id); setAdding(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-pressed={openId === o.id} data-card={o.title}
                      style={{ textAlign: 'left', cursor: 'pointer', padding: 10, borderRadius: 10, border: `1px solid ${openId === o.id ? 'var(--color-primary-500)' : 'var(--line)'}`, background: 'var(--surface-card)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <strong style={{ fontSize: 13.5 }}>{o.title}</strong>
                      <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{o.for.name} · {o.for.type}</span>
                      <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {o.project && <Chip status="good">{o.project.number}</Chip>}
                        {o.value && o.value.amount !== null && <Chip status={o.value.from === 'quotation' ? 'good' : 'neutral'}>{o.value.from === 'estimate' ? '~ ' : ''}{money(o.value.amount, o.value.currency)}</Chip>}
                        {o.lost_reason && <Chip>{o.lost_reason}</Chip>}
                        {s.kind === 'open' && o.next && <Chip status={o.next.late ? 'problem' : o.next.today ? 'warning' : 'neutral'}>{o.next.late ? 'Next action late' : o.next.today ? 'Next action today' : `Next ${day(o.next.due_on)}`}</Chip>}
                        {s.kind === 'open' && !o.next && o.expected_on && <Chip>By {day(o.expected_on)}</Chip>}
                      </span>
                    </button>
                  ))}
                  {s.items.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{s.kind === 'open' ? 'Nothing here' : 'None in the last 30 days'}</span>}
                </section>
              ))}
            </div>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
