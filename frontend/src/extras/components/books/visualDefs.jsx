import {
  AccountBars, ActivityCalendar, AgeingBars, AgeingBubbles, AssetsVsClaims, CashLine, Collection, Concentration, DueChart, ExpenseDonut, ExpensesStacked, GroupTreemap, Margins, MoneyInOut, MonthLine, Overdue,
  ProfitTrend, ReconAreas, ReconStatus, SalesPurchases, Scorecard, SlowMovers, StockValue, TopCustomers, TopItems, Turnover, VatFlow, Waterfall,
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
  scorecard: { title: 'At a glance', note: 'Revenue, profit, cash and what is owed, each with its month by month line.', wide: true, compare: 'delta', render: (d, c) => <Scorecard d={d} c={c} />,
    table: (d, c) => { const b = new Map((c?.cards ?? []).map((k) => [k.key, k.value])); return { columns: [col('label', 'Figure'), col('value', 'Now', true), ...(c ? [col('before', 'Earlier period', true)] : [])], rows: d.cards.map((k) => ({ ...k, before: b.get(k.key) ?? '' })) }; } },
  'sales-year': { title: 'Sales over time', note: 'Revenue by month; set against another period it shows growth.', compare: 'overlay', render: (d, c) => <MonthLine d={d} c={c} field="revenue" name="Revenue" />,
    table: (d, c) => ({ columns: [col('month', 'Month'), col('revenue', 'Revenue', true), ...(c ? [col('cmp', 'Earlier period', true)] : [])], rows: zipRows(d.months, c?.months, (x) => ({ cmp: x.revenue })) }) },
  margins: { title: 'Margins', note: 'Gross and net profit as a share of revenue, by month.', compare: 'overlay', render: (d, c) => <Margins d={d} c={c} />,
    table: (d, c) => ({ columns: [col('month', 'Month'), col('revenue', 'Revenue', true), col('gross_pct', 'Gross %', true), col('net_pct', 'Net %', true), ...(c ? [col('cmpNet', 'Net %, earlier', true)] : [])], rows: zipRows(d.months, c?.months, (x) => ({ cmpNet: x.net_pct })) }) },
  'expenses-stacked': { title: 'Expenses month by month', note: 'The biggest expense groups, stacked, to see which cost is growing.', wide: true, compare: 'none', render: (d) => <ExpensesStacked d={d} />,
    table: (d) => ({ columns: [col('month', 'Month'), ...d.groups.map((g) => col(g, g, true))], rows: d.months }) },
  concentration: { title: 'How much sales depend on a few customers', note: 'The share of sales the biggest customers make up, building up to the top ten.', compare: 'none', render: (d) => <Concentration d={d} />,
    table: (d) => ({ columns: [col('rank', '#', true), col('name', 'Customer'), col('value', 'Sales', true), col('share', 'Share %', true), col('cumulative', 'Running total %', true)], rows: d.rows }) },
  'top-items': { title: 'Top items', note: 'The ten items that sold for the most, with the quantity sold.', compare: 'none', render: (d) => <TopItems d={d} />,
    table: (d) => ({ columns: [col('name', 'Item'), col('value', 'Sales', true), col('qty', 'Quantity', true)], rows: d.rows }) },
  'vat-flow': { title: 'Tax charged against tax paid', note: 'Tax on sales against tax on purchases by month, from the tax return. The gap is what is owed.', compare: 'none', render: (d) => <VatFlow d={d} />,
    table: (d) => ({ columns: [col('month', 'Month'), col('output', 'Charged on sales', true), col('input', 'Paid on purchases', true), col('net', 'Owed', true)], rows: d.months }) },
  due: { title: 'Receivables and payables due', note: 'What customers owe us against what we owe suppliers, by the week it falls due.', wide: true, compare: 'none', render: (d) => <DueChart d={d} />,
    table: (d) => ({ columns: [col('label', 'Falls due'), col('receivables', 'Customers owe us', true), col('payables', 'We owe suppliers', true)], rows: [...d.buckets, { label: 'Later', receivables: d.later.receivables, payables: d.later.payables }] }) },
  overdue: { title: 'Overdue receivables', note: 'What customers owe that is late, by how late, and who is furthest behind.', compare: 'none', render: (d) => <Overdue d={d} />,
    table: (d) => ({ columns: [col('bucket', 'Age'), col('amount', 'Owed', true), col('customers', 'Customers', true), col('share', 'Share %', true)], rows: d.buckets }) },
  collection: { title: 'How fast customers pay', note: 'Days of sales that customers owe at the end of each month. Lower is better.', compare: 'none', render: (d) => <Collection d={d} />,
    table: (d) => ({ columns: [col('month', 'Month'), col('owed', 'Owed at month end', true), col('revenue', 'Revenue', true), col('days', 'Days of sales owed', true)], rows: d.months }) },
  'stock-value': { title: 'Stock value', note: 'What the stock ledgers hold at the end of each month.', compare: 'none', render: (d) => <StockValue d={d} />, table: (d) => ({ columns: [col('month', 'Month'), col('value', 'Stock value', true)], rows: d.months }) },
  turnover: { title: 'Inventory turnover', note: 'How many times stock is sold and replaced, and how many days of stock you hold. Slow turnover means cash tied up on shelves.', compare: 'none', render: (d) => <Turnover d={d} />,
    table: (d) => ({ columns: [col('month', 'Month'), col('cogs', 'Cost of sales', true), col('stock', 'Stock at month end', true), col('turns', 'Turns a year', true), col('days_of_stock', 'Days of stock', true)], rows: d.months }) },
  'slow-movers': { title: 'Stock that is not moving', note: 'Items on hand with the longest time since any went out.', compare: 'none', render: (d) => <SlowMovers d={d} />,
    table: (d) => ({ columns: [col('name', 'Item'), col('qty', 'On hand', true), col('value', 'Value', true), col('days', 'Days since one went out', true)], rows: d.rows }) },
  'recon-areas': { title: 'Reconciliation by area', note: 'Matched, unmatched and unresolved amounts across bank, cash, debtors, creditors and tax.', compare: 'none', render: (d) => <ReconAreas d={d} />,
    table: (d) => ({ columns: [col('area', 'Area'), col('matched', 'Matched', true), col('unmatched', 'Unmatched', true), col('unresolved', 'Unresolved', true), col('reconciled', 'Reconciled', true), col('accounts', 'Accounts', true)], rows: d.areas }) },
};

/** The figures a card draws, by the name the server gives them (several cards can draw the same figures). */
export const SOURCE = { cash: 'money', inout: 'money', accounts: 'money', 'expense-donut': 'expenses', 'expense-tree': 'expenses', customers: 'top_customers', 'sales-purchases': 'sales_purchases', composition: 'composition',
  build: 'outstanding', ageing: 'outstanding', bubbles: 'outstanding', calendar: 'heatmap', waterfall: 'waterfall', balance: 'balance', trend: 'profit_trend', recon: 'recon', scorecard: 'scorecard', 'sales-year': 'sales_year', margins: 'margins', 'expenses-stacked': 'expenses_stacked', concentration: 'concentration', 'top-items': 'top_items',
  'vat-flow': 'vat_flow', due: 'due', overdue: 'overdue', collection: 'collection', 'stock-value': 'stock_value', turnover: 'turnover', 'slow-movers': 'slow_movers', 'recon-areas': 'recon_areas' };
