import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Lock, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../_shared/api/books';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import useAuthStore from '../../../_shared/store/authStore';
import { hasPermission } from '../../../_shared/lib/roles';
import { btnGhost, btnPrimary, card, colors } from '../../../_shared/theme/tokens';
import { Field, TextInput } from '../../../core/components/admin/ui/Form';
import {
  AccountBars, ActivityCalendar, AgeingBars, AgeingBubbles, AssetsVsClaims, CashLine, ExpenseDonut, GroupTreemap, MoneyInOut, ProfitTrend, ReconStatus, SalesPurchases, TopCustomers, Waterfall,
} from './visualCharts';
import { SAMPLE } from './visualSample';

/** Each chart: its key in the data, what it is called, what it shows, how wide it is, and how it is drawn. */
const CHARTS = [
  { id: 'cash', data: 'money', title: 'Cash and bank balance', note: 'The running balance of all cash and bank accounts.', render: (d) => <CashLine d={d} /> },
  { id: 'inout', data: 'money', title: 'Money in and out', note: 'What came into the cash and bank accounts and what went out.', render: (d) => <MoneyInOut d={d} /> },
  { id: 'accounts', data: 'money', title: 'Each account', note: 'In, out and the balance at the end, per cash and bank account.', render: (d) => <AccountBars d={d} /> },
  { id: 'expense-donut', data: 'expenses', title: 'Where the money went', note: 'The biggest groups of expenses in the period.', render: (d) => <ExpenseDonut d={d} /> },
  { id: 'expense-tree', data: 'expenses', title: 'Expenses by group', note: 'Every expense group and ledger; bigger is more.', wide: true, render: (d) => <GroupTreemap tree={d.tree} /> },
  { id: 'customers', data: 'top_customers', title: 'Top customers', note: 'The ten customers who bought the most in the period.', render: (d) => <TopCustomers d={d} /> },
  { id: 'sales-purchases', data: 'sales_purchases', title: 'Sales against purchases', note: 'By month. A cash sale is cash; any other sale or purchase that left an open bill is credit, and one that did not is cash.', wide: true, render: (d) => <SalesPurchases d={d} /> },
  { id: 'composition', data: 'composition', title: 'What we own', note: 'Assets on the last day, by group.', wide: true, render: (d) => <GroupTreemap tree={d.tree} /> },
  { id: 'build', data: 'outstanding', title: 'Owed to us and by us', note: 'Receivables, payables and the net position they leave.', render: (d) => <Waterfall steps={d.build} /> },
  { id: 'ageing', data: 'outstanding', title: 'How old the debts are', note: 'Receivables and payables by age.', render: (d) => <AgeingBars rows={d.ageing} /> },
  { id: 'bubbles', data: 'outstanding', title: 'Who is late', note: 'Each customer: how long their bills have been open (across), how much they owe (up) and how many bills (size).', wide: true, render: (d) => <AgeingBubbles rows={d.bubbles} /> },
  { id: 'calendar', data: 'heatmap', title: 'Activity', note: 'Vouchers posted each day over the last year.', wide: true, render: (d) => <ActivityCalendar d={d} /> },
  { id: 'waterfall', data: 'waterfall', title: 'From income to profit', note: 'How the income of the period turns into profit.', render: (d) => <Waterfall steps={d.steps} /> },
  { id: 'balance', data: 'balance', title: 'Assets against liabilities and equity', note: 'What the business has against who it belongs to.', render: (d) => <AssetsVsClaims d={d} /> },
  { id: 'trend', data: 'profit_trend', title: 'Profit month by month', note: 'Income and expenses as bars, profit as the line.', wide: true, render: (d) => <ProfitTrend d={d} /> },
  { id: 'recon', data: 'recon', title: 'Reconciliation', note: 'How far each account has been reconciled with its statement.', render: (d) => <ReconStatus d={d} /> },
];

function ChartCard({ chart, data }) {
  const d = data?.[chart.data];
  return (
    <section style={{ ...card, padding: 16, gridColumn: chart.wide ? '1 / -1' : undefined, minWidth: 0 }} aria-label={chart.title}>
      <h3 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700 }}>{chart.title}</h3>
      <p style={{ margin: '2px 0 10px', fontSize: '0.72rem', color: colors.textFaint }}>{chart.note}</p>
      {!d ? <p style={{ fontSize: '0.8rem', color: colors.textFaint }}>Loading…</p>
        : d.ready === false ? <p style={{ fontSize: '0.8rem', color: colors.warningText }}>{d.message}</p>
        : chart.render(d)}
    </section>
  );
}

function Notice({ icon, title, children }) {
  return (
    <div style={{ ...card, padding: '28px 24px', textAlign: 'center', maxWidth: 640, margin: '0 auto' }}>
      {icon}
      <h2 style={{ margin: '10px 0 6px', fontSize: '1.05rem' }}>{title}</h2>
      <div style={{ fontSize: '0.84rem', color: colors.textMuted, lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

/** Books → Visual reports (the Extras module). Three states: not licensed (an invitation and a peek at made-up figures), licensed but switched off, and active (the real charts). */
export default function VisualReports() {
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [state, setState] = useState(null);   // not_licensed | off | active
  const [data, setData] = useState(null);
  const [range, setRange] = useState({ from: '', to: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => { booksAPI.visualsStatus().then((r) => setState(r.state)).catch((e) => { toast.error(errMsg(e, 'Could not check Extras')); setState('error'); }); }, []);

  const load = useCallback(async (r) => {
    setBusy(true);
    try {
      const res = await booksAPI.visuals(Object.fromEntries(Object.entries(r).filter(([, v]) => v)));
      setData(res.charts);
      setRange({ from: res.from, to: res.to });
    } catch (e) { toast.error(errMsg(e, 'Could not load the charts')); } finally { setBusy(false); }
  }, []);
  useEffect(() => { if (state === 'active') load({}); }, [state, load]);

  if (state === null) return <p style={{ fontSize: '0.85rem', color: colors.textFaint }}>Loading…</p>;
  if (state === 'error') return null;

  if (state === 'off') {
    const canSwitch = hasPermission(user, 'system.modules');
    return (
      <Notice icon={<Power size={30} style={{ color: colors.primary }} aria-hidden />} title="Extras is licensed, but switched off">
        <p style={{ margin: '0 0 14px' }}>The charts are all here, waiting. Nobody has flipped the switch yet, so they are sulking in the dark.</p>
        {canSwitch ? <button type="button" style={btnPrimary} onClick={() => nav('/admin/settings/modules')}>Open Module Center</button> : <span>Ask an administrator to switch Extras on in Module Center.</span>}
      </Notice>
    );
  }

  const sample = state === 'not_licensed';
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {sample ? (
        <>
          <Notice icon={<Lock size={30} style={{ color: colors.primary }} aria-hidden />} title="Visual reports come with Extras">
            Your books drawn as charts: cash flow, where the money goes, who owes you, how old the debts are, profit step by step and more, all from the same figures as your reports. Below is a peek with <b>made-up sample figures</b>; license Extras to see your own.
          </Notice>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', top: 8, right: 12, zIndex: 2, fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: colors.warningBg, color: colors.warningText }}>SAMPLE DATA</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, opacity: 0.92, pointerEvents: 'none' }} aria-hidden>
              {CHARTS.slice(0, 6).map((c) => <ChartCard key={c.id} chart={c} data={SAMPLE} />)}
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ ...card, padding: 14, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <BarChart3 size={18} style={{ color: colors.primary, marginBottom: 8 }} aria-hidden />
            <Field label="From" htmlFor="vis-from"><TextInput id="vis-from" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></Field>
            <Field label="To" htmlFor="vis-to"><TextInput id="vis-to" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></Field>
            <button type="button" style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={() => load(range)}>{busy ? 'Loading…' : 'Show'}</button>
            <button type="button" style={btnGhost} disabled={busy} onClick={() => load({})}>This financial year</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
            {CHARTS.map((c) => <ChartCard key={c.id} chart={c} data={data} />)}
          </div>
        </>
      )}
    </div>
  );
}
