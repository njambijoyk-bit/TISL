import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import PageHeader from '../../../_shared/components/layout/PageHeader';
import projectsAPI from '../../../_shared/api/projects';
import { day, message, money } from '../../lib/format';
import { Btn, Chip, DataTable, Notice, Panel, PanelTitle, TextInput } from '../../components/ui';
import { td, th } from '../../components/uiTokens';
import ProjectKeys from '../../components/ProjectKeys';

const STATE = { good: ['good', 'On time'], warn: ['warning', 'Slipping'], bad: ['problem', 'Late'], none: ['neutral', 'No pace yet'] };
const short = (v) => (v >= 1e6 ? `${(v / 1e6).toLocaleString('en-GB', { maximumFractionDigits: 1 })}M` : v >= 1e3 ? `${Math.round(v / 1e3)}k` : String(Math.round(v)));

/** Expected wins by month, drawn to one scale: quoted and estimated value stacked, the weighted forecast as a mark across each bar. */
function PipelineChart({ months, currency }) {
  const W = 640; const H = 220; const L = 52; const B = 28; const T = 12;
  const top = Math.max(1, ...months.map((m) => m.quoted + m.estimated));
  const step = 10 ** Math.floor(Math.log10(top)); const nice = Math.ceil(top / step) * step;
  const y = (v) => T + (H - T - B) * (1 - v / nice);
  const bw = (W - L - 16) / months.length;
  const ticks = [0, nice / 2, nice];
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 480, height: 'auto' }} role="img" aria-label={`Expected wins by month${currency ? ` in ${currency}` : ''}`} data-pipeline-chart>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - 8} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-secondary)">{short(t)}</text></g>)}
        {months.map((m, i) => {
          const x = L + i * bw + bw * 0.2; const w = bw * 0.6;
          return (
            <g key={m.month} data-pipeline-month={m.month}>
              <rect x={x} y={y(m.quoted)} width={w} height={y(0) - y(m.quoted)} fill="var(--color-primary-500)" rx="2" />
              <rect x={x} y={y(m.quoted + m.estimated)} width={w} height={y(m.quoted) - y(m.quoted + m.estimated)} fill="color-mix(in srgb, var(--color-primary-500) 30%, transparent)" rx="2" />
              {m.weighted > 0 && <line x1={x - 4} x2={x + w + 4} y1={y(m.weighted)} y2={y(m.weighted)} stroke="var(--text-primary)" strokeWidth="2.5" />}
              <text x={x + w / 2} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--text-secondary)">{m.label.slice(0, 3)}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-secondary)' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--color-primary-500)', borderRadius: 2 }} /> Quoted in Books</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'color-mix(in srgb, var(--color-primary-500) 30%, transparent)', borderRadius: 2 }} /> Estimate only</span>
        <span><span style={{ display: 'inline-block', width: 14, height: 2.5, background: 'var(--text-primary)', verticalAlign: 'middle' }} /> Expected at each stage's chance</span>
      </div>
    </div>
  );
}

/** Forecasts (docs/PROJECTS_STAGE12_SPEC.md, build 12.4): the pipeline by month, when each work will likely end, what will be billed. Nothing is kept: all worked out now. */
export default function ProjectsInsights() {
  const [d, setD] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => { projectsAPI.forecasts().then(setD).catch((e) => setProblem(message(e, 'The forecasts could not be loaded.'))); }, []);
  const header = <PageHeader title="Insights" subtitle="What is coming: the pipeline, when work will end, what will be billed" />;
  if (!d) return <AdminLayout><ProjectKeys />{header}{problem && <Notice status="problem">{problem}</Notice>}</AdminLayout>;
  const p = d.pipeline;
  const cur = (v) => money(v, p.currency ?? d.billing.currency);
  const odds = async (s) => {
    const v = window.prompt(`Chance of winning at "${s.name}", in % (leave empty to use the company's win rate)`, s.set ? String(s.chance) : '');
    if (v === null) return;
    try { const r = await projectsAPI.setOdds(s.id, v.trim() === '' ? null : Number(v)); setD({ ...d, pipeline: r.pipeline }); toast.success('Saved'); } catch (e) { toast.error(message(e, 'That could not be saved.')); }
  };

  return (
    <AdminLayout><ProjectKeys />
      {header}
      <div style={{ display: 'grid', gap: 16 }}>
        {p.ready && (
          <Panel data-forecast-pipeline>
            <PanelTitle hint={`Open opportunities by the month they are expected to close${p.late ? `; ${p.late === 1 ? 'one expected earlier is' : `${p.late} expected earlier are`} still open and counted this month` : ''}.`}>Pipeline</PanelTitle>
            <PipelineChart months={p.months} currency={p.currency} />
            <DataTable minWidth={560}>
              <thead><tr><th style={th}>Month</th><th style={{ ...th, textAlign: 'right' }}>Opportunities</th><th style={{ ...th, textAlign: 'right' }}>Quoted</th><th style={{ ...th, textAlign: 'right' }}>Estimates</th><th style={{ ...th, textAlign: 'right' }}>Expected</th></tr></thead>
              <tbody>{p.months.map((m) => <tr key={m.month} data-pipeline-row={m.month}><td style={td}>{m.label}</td><td style={{ ...td, textAlign: 'right' }}>{m.count}</td><td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{cur(m.quoted)}</td><td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{cur(m.estimated)}</td><td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{cur(m.weighted)}</td></tr>)}</tbody>
            </DataTable>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5, marginTop: 10 }} data-pipeline-odds>
              <span style={{ color: 'var(--text-secondary)' }}>Chance of winning at each stage{p.win_rate !== null ? ` (the company wins ${p.win_rate}%)` : ''}:</span>
              {p.stages.map((s) => p.can.odds ? <Btn key={s.id} small variant="quiet" onClick={() => odds(s)}>{s.name}: {s.chance}%{s.set ? '' : ' (win rate)'}</Btn> : <Chip key={s.id}>{s.name}: {s.chance}%</Chip>)}
            </div>
          </Panel>
        )}

        <Panel data-forecast-finish>
          <PanelTitle hint="At the pace of the last four weeks: tasks done against tasks left.">When the work will end</PanelTitle>
          {d.finish.length === 0 ? <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>No open work with an expected end.</p> : (
            <DataTable minWidth={600}>
              <thead><tr><th style={th}>Work</th><th style={th}>Expected end</th><th style={th}>Likely end</th><th style={th}>Pace</th><th style={th} /></tr></thead>
              <tbody>{d.finish.map((f) => (
                <tr key={f.id} data-finish={f.number}>
                  <td style={td}><Link to={`/admin/projects/${f.id}`} style={{ color: 'var(--color-primary-600)', fontWeight: 600 }}>{f.number}</Link> {f.title}</td>
                  <td style={td}>{day(f.due)}</td>
                  <td style={td}>{f.likely ? day(f.likely) : '—'}{f.days !== null && f.days !== 0 && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}> · {Math.abs(f.days)} days {f.days > 0 ? 'late' : 'early'}</span>}</td>
                  <td style={{ ...td, fontSize: 12.5, color: 'var(--text-secondary)' }}>{f.left !== null ? `${f.left} tasks left at ${f.per_week} a week` : 'no tasks done in four weeks'}</td>
                  <td style={td}><Chip status={STATE[f.state][0]}>{STATE[f.state][1]}</Chip></td>
                </tr>
              ))}</tbody>
            </DataTable>
          )}
        </Panel>

        {d.billing.ready && (
          <Panel data-forecast-billing>
            <PanelTitle hint="Staged bills due by their dates (a share of the agreed value in Books), and approved time not yet billed.">What will be billed</PanelTitle>
            <DataTable minWidth={420}>
              <thead><tr><th style={th}>Month</th><th style={{ ...th, textAlign: 'right' }}>Staged bills</th><th style={{ ...th, textAlign: 'right' }}>Bills</th></tr></thead>
              <tbody>{d.billing.months.map((m) => <tr key={m.month} data-billing-row={m.month}><td style={td}>{m.label}</td><td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{cur(m.staged)}</td><td style={{ ...td, textAlign: 'right' }}>{m.bills}</td></tr>)}</tbody>
            </DataTable>
            <p style={{ margin: '8px 0 0', fontSize: 13 }}>Approved billable time not yet on a bill: <strong>{d.billing.unbilled_hours} hours</strong>.</p>
          </Panel>
        )}
      </div>
    </AdminLayout>
  );
}
