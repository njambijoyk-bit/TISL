import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import projectsAPI from '../../_shared/api/projects';
import { message, money } from '../lib/format';
import { Btn, Chip, DataTable, Notice, Panel, PanelTitle } from './ui';
import { td, th } from './uiTokens';
import LedgersPanel from './LedgersPanel';
import BillingPanel from './BillingPanel';

/**
 * The Money tab (docs/PROJECTS_STAGE4_SPEC.md, build 4.2). Every figure is read from posted Books entries on this piece of work's cost centre
 * and those under it, when the tab opens. Nothing is typed in here or stored by Projects. The budget is planned and approved in Books.
 */
const Row = ({ label, children, strong }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 13.5 }}>
    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: strong ? 700 : 500, textAlign: 'right' }}>{children}</span>
  </div>
);
const Meter = ({ part, of, warn }) => {
  const pct = of > 0 ? Math.min(100, Math.max(0, (part / of) * 100)) : 0;
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} style={{ height: 8, borderRadius: 999, background: 'var(--surface-input)', overflow: 'hidden', margin: '6px 0' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: warn ? 'var(--status-warning)' : 'var(--color-primary-500)' }} />
    </div>
  );
};

export default function MoneyPanel({ projectId }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState('');
  const load = useCallback(async () => {
    try { setData(await projectsAPI.money(projectId)); setFailed(''); } catch (e) { setFailed(message(e, 'The money could not be read from the books. Try again.')); }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  if (failed) return <Notice status="problem">{failed} <Btn small variant="quiet" onClick={load}>Try again</Btn></Notice>;
  if (!data) return <Panel><p style={{ margin: 0, color: 'var(--text-secondary)' }}>Reading the books…</p></Panel>;
  const m = data.money;
  if (!m.ready) return <Notice status="info">{m.why}</Notice>;
  const f = (n) => (n === null || n === undefined ? <span style={{ color: 'var(--text-secondary)' }}>·</span> : money(n, m.currency));
  const used = m.budget ? m.spent + (m.committed || 0) : 0;

  return (
    <div data-money>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 16 }}>
        <Panel>
          <PanelTitle hint={m.agreed ? `From the linked ${m.agreed.from}.` : 'Link a quotation or sales order under Links to show what was agreed.'}>Agreed and billed</PanelTitle>
          <Row label="Agreed">{m.agreed ? f(m.agreed.amount) : <span style={{ color: 'var(--text-secondary)' }}>Not linked</span>}</Row>
          <Row label="Billed">{f(m.billed)}</Row>
          {m.agreed && m.agreed.amount > 0 && <Meter part={m.billed} of={m.agreed.amount} />}
          <Row label="Paid">{f(m.paid)}</Row>
          <Row label="Owed">{f(m.owed)}{m.days_late > 0 && <Chip status="warning" style={{ marginLeft: 6 }}>{m.days_late} days late</Chip>}</Row>
        </Panel>
        <Panel>
          <PanelTitle hint={m.budget === null ? 'No budget in the books for this work.' : 'From the current version of each active budget in the books.'}
            right={data.can.budget && <Link to="/admin/books?tab=budgets" style={{ fontSize: 13, color: 'var(--color-primary-500)', fontWeight: 600 }}>Plan it in Books</Link>}>
            Budget and spend
          </PanelTitle>
          <Row label="Budget">{f(m.budget)}</Row>
          <Row label="Spent">{f(m.spent)}</Row>
          {m.budget > 0 && <Meter part={used} of={m.budget} warn={used / m.budget >= 0.9} />}
          <Row label="Committed (open orders)">{f(m.committed)}</Row>
          {m.budget !== null && <Row label="Left">{f(Math.round((m.budget - m.spent - (m.committed || 0)) * 100) / 100)}</Row>}
        </Panel>
        <Panel>
          <PanelTitle hint="Income less spend on its accounts, as the books have it now.">Profit so far</PanelTitle>
          <Row label="Income">{f(m.income)}</Row>
          <Row label="Spent">{f(m.spent)}</Row>
          <Row label="Profit" strong>{f(m.profit)}</Row>
        </Panel>
        {m.held && (
          <Panel data-held>
            <PanelTitle hint="Money held for clients on this work. Never the firm's own." right={<Link to="/admin/projects/client-money" style={{ fontSize: 13, color: 'var(--color-primary-500)', fontWeight: 600 }}>Client money</Link>}>Held for clients</PanelTitle>
            {m.held.balances.length === 0 && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-secondary)' }}>Nothing held.</p>}
            {m.held.balances.map((b) => <Row key={b.id} label={<>{b.label}{b.joint ? ' (joint)' : ''}<span style={{ display: 'block', fontSize: 12 }}>{b.account}</span></>}>{f(b.held)}</Row>)}
            {m.held.balances.length > 1 && <Row label="Total" strong>{f(m.held.total)}</Row>}
          </Panel>
        )}
      </div>
      {m.phases.length > 0 && (
        <Panel>
          <PanelTitle hint="Phases that have their own cost centre. Their figures are part of the totals above.">By phase</PanelTitle>
          <DataTable minWidth={520}>
            <thead><tr><th style={th}>Phase</th><th style={{ ...th, textAlign: 'right' }}>Budget</th><th style={{ ...th, textAlign: 'right' }}>Spent</th><th style={{ ...th, textAlign: 'right' }}>Billed</th></tr></thead>
            <tbody>
              {m.phases.map((p) => (
                <tr key={p.id} data-money-phase={p.name}>
                  <td style={{ ...td, fontWeight: 600 }}>{p.name}</td>
                  {[p.budget, p.spent, p.billed].map((n, i) => <td key={i} style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f(n)}</td>)}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      )}
      <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>Read from posted vouchers on this work's cost centres, in the base currency. Cancelled vouchers are not counted.</p>
      <BillingPanel projectId={projectId} currency={m.currency} onBilled={load} />
      <LedgersPanel projectId={projectId} />
    </div>
  );
}
