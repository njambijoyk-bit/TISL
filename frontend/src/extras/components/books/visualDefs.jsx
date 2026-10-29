import {
  AccountBars, ActivityCalendar, AgeingBars, AgeingBubbles, AssetsVsClaims, CashLine, ExpenseDonut, GroupTreemap, MoneyInOut, ProfitTrend, ReconStatus, SalesPurchases, TopCustomers, Waterfall,
} from './visualCharts';

const col = (key, label, num = false) => ({ key, label, num });
const flatten = (tree, before, path = []) => tree.flatMap((n) => (n.children
  ? flatten(n.children, before, [...path, n.name])
  : [{ group: path.join(' › '), ledger: n.name, amount: n.size, before: before?.get([...path, n.name].join('›')) ?? '' }]));
const flatCmp = (tree, path = []) => (tree ?? []).flatMap((n) => (n.children ? flatCmp(n.children, [...path, n.name]) : [[[...path, n.name].join('›'), n.size]]));
const treeTable = (d, c) => {
  const before = c ? new Map(flatCmp(c.tree)) : null;
  return { columns: [col('group', 'Group'), col('ledger', 'Ledger'), col('amount', 'Amount', true), ...(c ? [col('before', 'Earlier period', true)] : [])], rows: flatten(d.tree, before) };
};
const zipRows = (a, b, f) => a.map((x, i) => ({ ...x, ...(b?.[i] ? f(b[i]) : {}) }));

/**
 * The charts the Visual reports page can draw: how each is drawn (`render`, given its figures, the comparison period's figures when there are any, and the page's
 * helpers) and as a table (`table`, the same figures in rows and columns, for reading exactly and for copying). Titles come first for the sample page; the live page
 * takes the order from the server's list.
 */
export const DEFS = {
  cash: { title: 'Cash and bank balance', note: 'The running balance of all cash and bank accounts.', compare: 'overlay', render: (d, c) => <CashLine d={d} c={c} />,
    table: (d, c) => ({ columns: [col('bucket', 'Date'), col('balance', 'Balance', true), ...(c ? [col('cmp', 'Earlier period', true)] : [])], rows: zipRows(d.series, c?.series, (x) => ({ cmp: x.balance })) }) },
  inout: { title: 'Money in and out', note: 'What came into the cash and bank accounts and what went out.', compare: 'overlay', render: (d, c) => <MoneyInOut d={d} c={c} />,
    table: (d, c) => ({ columns: [col('bucket', 'Date'), col('in', 'In', true), col('out', 'Out', true), ...(c ? [col('cmpIn', 'Earlier: in', true), col('cmpOut', 'Earlier: out', true)] : [])], rows: zipRows(d.series, c?.series, (x) => ({ cmpIn: x.in, cmpOut: x.out })) }) },
  accounts: { title: 'Each account', note: 'In, out and the balance at the end, per cash and bank account.', compare: 'none', render: (d) => <AccountBars d={d} />,
    table: (d) => ({ columns: [col('name', 'Account'), col('in', 'In', true), col('out', 'Out', true), col('net', 'Net', true), col('closing', 'Balance at the end', true)], rows: d.accounts }) },
  'expense-donut': { title: 'Where the money went', note: 'The biggest groups of expenses in the period. Click a slice to open it.', compare: 'delta', render: (d, c, x) => <ExpenseDonut d={d} c={c} onLedger={x.openLedger} />, table: treeTable },
  'expense-tree': { title: 'Expenses by group', note: 'Every expense group and ledger; bigger is more. Click a group to open it.', wide: true, compare: 'none', render: (d, c, x) => <GroupTreemap tree={d.tree} onLedger={x.openLedger} />, table: treeTable },
  customers: { title: 'Top customers', note: 'The ten customers who bought the most in the period.', compare: 'overlay', render: (d, c) => <TopCustomers d={d} c={c} />,
    table: (d, c) => { const b = new Map((c?.rows ?? []).map((r) => [r.name, r.value])); return { columns: [col('name', 'Customer'), col('value', 'Sales', true), col('invoices', 'Invoices', true), ...(c ? [col('cmp', 'Earlier period', true)] : [])], rows: d.rows.map((r) => ({ ...r, cmp: b.get(r.name) ?? 0 })) }; } },
  'sales-purchases': { title: 'Sales against purchases', note: 'By month. A cash sale is cash; any other sale or purchase that left an open bill is credit, and one that did not is cash.', wide: true, compare: 'none', render: (d) => <SalesPurchases d={d} />,
    table: (d) => ({ columns: [col('month', 'Month'), col('sales_cash', 'Cash sales', true), col('sales_credit', 'Credit sales', true), col('purchases_cash', 'Cash purchases', true), col('purchases_credit', 'Credit purchases', true)], rows: d.months }) },
  composition: { title: 'What we own', note: 'Assets on the last day, by group. Click a group to open it.', wide: true, compare: 'none', render: (d, c, x) => <GroupTreemap tree={d.tree} onLedger={x.openLedger} />, table: treeTable },
  build: { title: 'Owed to us and by us', note: 'Receivables, payables and the net position they leave.', compare: 'none', render: (d) => <Waterfall steps={d.build} />, table: (d) => ({ columns: [col('name', 'Line'), col('value', 'Amount', true)], rows: d.build }) },
  ageing: { title: 'How old the debts are', note: 'Receivables and payables by age.', compare: 'none', render: (d) => <AgeingBars rows={d.ageing} />,
    table: (d) => ({ columns: [col('bucket', 'Age'), col('receivables', 'Customers owe us', true), col('payables', 'We owe suppliers', true)], rows: d.ageing }) },
  bubbles: { title: 'Who is late', note: 'Each customer: how long their bills have been open (across), how much they owe (up) and how many bills (size).', wide: true, compare: 'none', render: (d) => <AgeingBubbles rows={d.bubbles} />,
    table: (d) => ({ columns: [col('name', 'Customer'), col('days', 'Days open (average)', true), col('amount', 'Owed', true), col('bills', 'Bills', true)], rows: d.bubbles }) },
  calendar: { title: 'Activity', note: 'Vouchers posted each day over the last year.', wide: true, compare: 'none', render: (d) => <ActivityCalendar d={d} />,
    table: (d) => ({ columns: [col('date', 'Date'), col('count', 'Vouchers', true), col('amount', 'Value', true)], rows: d.days }) },
  waterfall: { title: 'From income to profit', note: 'How the income of the period turns into profit.', compare: 'delta', render: (d, c) => <Waterfall steps={d.steps} cmpSteps={c?.steps} />,
    table: (d, c) => { const b = new Map((c?.steps ?? []).map((s) => [s.name, s.value])); return { columns: [col('name', 'Step'), col('value', 'Amount', true), ...(c ? [col('before', 'Earlier period', true)] : [])], rows: d.steps.map((s) => ({ ...s, before: b.get(s.name) ?? '' })) }; } },
  balance: { title: 'Assets against liabilities and equity', note: 'What the business has against who it belongs to.', compare: 'delta', render: (d, c) => <AssetsVsClaims d={d} c={c} />,
    table: (d, c) => ({ columns: [col('name', 'Line'), col('value', 'Amount', true), ...(c ? [col('before', 'Earlier date', true)] : [])], rows: [['Assets', 'assets'], ['Liabilities', 'liabilities'], ['Equity', 'equity']].map(([name, k]) => ({ name, value: d[k], before: c?.[k] ?? '' })) }) },
  trend: { title: 'Profit month by month', note: 'Income and expenses as bars, profit as the line.', wide: true, compare: 'overlay', render: (d, c) => <ProfitTrend d={d} c={c} />,
    table: (d, c) => ({ columns: [col('month', 'Month'), col('income', 'Income', true), col('expenses', 'Expenses', true), col('profit', 'Profit', true), ...(c ? [col('cmp', 'Profit, earlier period', true)] : [])], rows: zipRows(d.months, c?.months, (x) => ({ cmp: x.profit })) }) },
  recon: { title: 'Reconciliation', note: 'How far each account has been reconciled with its statement.', compare: 'none', render: (d) => <ReconStatus d={d} />,
    table: (d) => ({ columns: [col('name', 'Account'), col('locked_to', 'Locked to'), col('days_behind', 'Days behind', true), col('unmatched', 'Unmatched lines', true)], rows: d.rows }) },
};

/** The figures a card draws, by the name the server gives them (several cards can draw the same figures). */
export const SOURCE = { cash: 'money', inout: 'money', accounts: 'money', 'expense-donut': 'expenses', 'expense-tree': 'expenses', customers: 'top_customers', 'sales-purchases': 'sales_purchases', composition: 'composition',
  build: 'outstanding', ageing: 'outstanding', bubbles: 'outstanding', calendar: 'heatmap', waterfall: 'waterfall', balance: 'balance', trend: 'profit_trend', recon: 'recon' };
