/**
 * How the Visual reports are found: the groups of the chart list, the key that goes to each chart (press G, then the letter or number; the same for everyone and none
 * repeats), and the questions on the landing page, each with the charts that answer it. Titles and drawing live in visualDefs.jsx.
 */
export const GROUPS = ['Overview', 'Money', 'Sales', 'Profit & costs', 'Owed & owing', 'Tax', 'Stock', 'Position & checks'];

export const CHARTS = [
  { key: 'scorecard', group: 'Overview', go: 'V' },
  { key: 'cash-forecast', group: 'Overview', go: 'F' },
  { key: 'cash', group: 'Money', go: 'C' },
  { key: 'inout', group: 'Money', go: 'I' },
  { key: 'accounts', group: 'Money', go: 'A' },
  { key: 'sales-year', group: 'Sales', go: 'S' },
  { key: 'customers', group: 'Sales', go: 'T' },
  { key: 'concentration', group: 'Sales', go: 'D' },
  { key: 'top-items', group: 'Sales', go: 'Y' },
  { key: 'sales-purchases', group: 'Sales', go: 'P' },
  { key: 'trend', group: 'Profit & costs', go: 'R' },
  { key: 'margins', group: 'Profit & costs', go: 'M' },
  { key: 'waterfall', group: 'Profit & costs', go: 'W' },
  { key: 'expense-donut', group: 'Profit & costs', go: 'E' },
  { key: 'expense-tree', group: 'Profit & costs', go: 'G' },
  { key: 'expenses-stacked', group: 'Profit & costs', go: 'K' },
  { key: 'budget', group: 'Profit & costs', go: 'B' },
  { key: 'due', group: 'Owed & owing', go: 'Q' },
  { key: 'overdue', group: 'Owed & owing', go: 'L' },
  { key: 'bubbles', group: 'Owed & owing', go: 'H' },
  { key: 'collection', group: 'Owed & owing', go: 'N' },
  { key: 'ageing', group: 'Owed & owing', go: '1' },
  { key: 'build', group: 'Owed & owing', go: '2' },
  { key: 'vat-flow', group: 'Tax', go: 'X' },
  { key: 'stock-value', group: 'Stock', go: '3' },
  { key: 'turnover', group: 'Stock', go: 'J' },
  { key: 'slow-movers', group: 'Stock', go: '4' },
  { key: 'composition', group: 'Position & checks', go: '5' },
  { key: 'balance', group: 'Position & checks', go: '6' },
  { key: 'recon-areas', group: 'Position & checks', go: '7' },
  { key: 'recon', group: 'Position & checks', go: '8' },
  { key: 'calendar', group: 'Position & checks', go: '9' },
];

/** G then 0 goes back to the questions. */
export const HOME_KEY = '0';

export const QUESTIONS = [
  { id: 'cash', title: 'Will we have enough cash?', blurb: 'Forecast, balances, what is due', charts: ['cash-forecast', 'cash', 'inout', 'due', 'accounts'] },
  { id: 'profit', title: 'Are we making money?', blurb: 'Profit, margins, budget', charts: ['scorecard', 'trend', 'margins', 'waterfall', 'budget'] },
  { id: 'owed', title: 'Who owes us, and how late?', blurb: 'Overdue, collection speed, ageing', charts: ['overdue', 'bubbles', 'collection', 'ageing', 'due', 'build'] },
  { id: 'spending', title: 'Where is the money going?', blurb: 'Expenses by group and by month, budget', charts: ['expense-donut', 'expense-tree', 'expenses-stacked', 'budget'] },
  { id: 'sales', title: 'What sells, and to whom?', blurb: 'Items, customers, the trend', charts: ['sales-year', 'customers', 'concentration', 'top-items', 'sales-purchases'] },
  { id: 'stock', title: 'Is stock tying up cash?', blurb: 'Stock value, turnover, slow movers', charts: ['stock-value', 'turnover', 'slow-movers'] },
  { id: 'tax', title: 'Where do we stand on tax?', blurb: 'Tax charged against tax paid', charts: ['vat-flow'] },
  { id: 'order', title: 'Are the books in order?', blurb: 'Reconciliation, balance, activity', charts: ['recon-areas', 'recon', 'balance', 'composition', 'calendar'] },
];

export const MAX_FAVOURITES = 9;
