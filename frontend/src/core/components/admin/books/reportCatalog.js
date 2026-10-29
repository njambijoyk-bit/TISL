/**
 * Every report on the Books Reports screen: which group it is in, the engine key that runs it, and the letter that goes to it (press G, then the letter).
 * The letters are the same for everyone and each is used once, so a person learns them once. The order here is the order of the list and of the [ and ] keys.
 */
export const GROUPS = ['Statements', 'Day to day', 'Receivables & payables', 'Tax', 'Stock', 'Analysis', 'Checks'];

export const REPORTS = [
  { id: 'engine-trial-balance', engine: 'trial-balance', label: 'Trial balance', group: 'Statements', letter: 'T' },
  { id: 'engine-adjusted-tb', engine: 'adjusted-trial-balance', label: 'Adjusted trial balance', group: 'Statements', letter: 'A' },
  { id: 'engine-profit-loss', engine: 'profit-loss', label: 'Profit & loss', group: 'Statements', letter: 'P' },
  { id: 'engine-pl-cost-centre', engine: 'profit-loss-by-cost-centre', label: 'Profit & loss by cost centre', group: 'Statements', letter: 'O' },
  { id: 'engine-balance-sheet', engine: 'balance-sheet', label: 'Balance sheet', group: 'Statements', letter: 'B' },
  { id: 'engine-changes-in-equity', engine: 'changes-in-equity', label: 'Changes in equity', group: 'Statements', letter: 'Q' },
  { id: 'engine-cash-flow', engine: 'cash-flow', label: 'Cash flow statement', group: 'Statements', letter: 'C' },
  { id: 'engine-day-book', engine: 'day-book', label: 'Day book', group: 'Day to day', letter: 'D' },
  { id: 'engine-ledger', engine: 'ledger-statement', label: 'Ledger statement', group: 'Day to day', letter: 'L' },
  { id: 'engine-money-flow', engine: 'money-flow', label: 'Money flow', group: 'Day to day', letter: 'M' },
  { id: 'engine-receivables', engine: 'receivables-ageing', label: 'Receivables ageing', group: 'Receivables & payables', letter: 'R' },
  { id: 'engine-payables', engine: 'payables-ageing', label: 'Payables ageing', group: 'Receivables & payables', letter: 'Y' },
  { id: 'engine-tax-return', engine: 'tax-return', label: 'Tax return', group: 'Tax', letter: 'X' },
  { id: 'engine-withholding', engine: 'withholding', label: 'Withholding certificates', group: 'Tax', letter: 'W' },
  { id: 'engine-stock-journal', engine: 'stock-journal', label: 'Stock journal', group: 'Stock', letter: 'J', permission: 'stock.view' },
  { id: 'engine-stock-summary', engine: 'stock-summary', label: 'Stock summary', group: 'Stock', letter: 'S', permission: 'stock.view' },
  { id: 'engine-stock-location', engine: 'stock-location-summary', label: 'Location summary', group: 'Stock', letter: 'N', permission: 'stock.view' },
  { id: 'engine-stock-query', engine: 'stock-query', label: 'Stock query', group: 'Stock', letter: 'K', permission: 'stock.view' },
  { id: 'engine-ratio-analysis', engine: 'ratio-analysis', label: 'Ratio analysis', group: 'Analysis', letter: 'I' },
  { id: 'engine-trade', engine: 'trade', label: 'Trade by party and item', group: 'Analysis', letter: 'V' },
  { id: 'engine-books-health', engine: 'books-health', label: 'Books health', group: 'Checks', letter: 'H' },
  { id: 'engine-control-accounts', engine: 'control-accounts', label: 'Control-account checks', group: 'Checks', letter: 'U' },
];

/** Older links and bookmarks name a report by its short name or an old id. */
export const ALIASES = {
  'day-book': 'engine-day-book', ledger: 'engine-ledger', receivables: 'engine-receivables', payables: 'engine-payables', 'tax-return': 'engine-tax-return', withholding: 'engine-withholding',
  'ratio-analysis': 'engine-ratio-analysis', 'trial-balance': 'engine-trial-balance', 'profit-loss': 'engine-profit-loss', 'balance-sheet': 'engine-balance-sheet', trade: 'engine-trade',
  'money-flow': 'engine-money-flow', 'cash-flow': 'engine-cash-flow', 'control-accounts': 'engine-control-accounts', 'books-health': 'engine-books-health', 'profit-loss-by-cost-centre': 'engine-pl-cost-centre',
  'stock-journal': 'engine-stock-journal', 'changes-in-equity': 'engine-changes-in-equity', 'adjusted-trial-balance': 'engine-adjusted-tb', 'stock-summary': 'engine-stock-summary',
  'stock-location-summary': 'engine-stock-location', 'stock-query': 'engine-stock-query',
};

export const MAX_FAVOURITES = 9;
