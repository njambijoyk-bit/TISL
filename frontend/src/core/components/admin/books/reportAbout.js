/**
 * What each report is for, how it differs from the ones it is mistaken for, and a few things worth knowing. Shown under the report (Books -> Reports).
 * `differs` names the other report by its engine key so the screen can link to it. Keep these to what the report really does: they are read by people deciding
 * which report to trust.
 */
export const GUIDE = {
  'trial-balance': {
    purpose: 'Lists every ledger with what it opened with, what was debited and credited in the period, and where it stands. The debit and credit totals must agree: that is the quickest proof that everything posted balances. Use it to find which ledger is wrong, or as the starting point for the statements.',
    differs: [
      { key: 'adjusted-trial-balance', text: 'The adjusted trial balance leaves out income and expense ledgers and shows their net result as one retained-earnings line, at one date. Use this one to see where the profit came from; use that one for the position after profit has been moved into capital.' },
      { key: 'profit-loss', text: 'Profit & loss groups only income and expense ledgers into statement lines (revenue, cost of sales, expenses) and gives a profit. The trial balance lists all ledgers, balance sheet ones too, and gives no profit.' },
      { key: 'ledger-statement', text: 'A ledger statement is one ledger entry by entry. Click a ledger here to open it.' },
    ],
    tips: ['"By group" adds ledgers up under their groups; "By ledger" lists each one.', 'A "Difference in opening balances" line means the opening balances on the ledgers do not net to nothing (a debit with no matching credit). The books cannot balance until the opposite opening balance, usually on Capital, is entered.', 'Choosing a branch or cost centre leaves opening balances out, because they belong to the whole business, so the figures will not balance on their own.', 'Drafts and cancelled vouchers are never counted.'],
  },
  'adjusted-trial-balance': {
    purpose: 'The position at one date with profit and loss folded away: only assets, liabilities and capital are listed, and everything the income and expense ledgers hold is moved into one "Retained earnings" line. It is what the books look like once a year-end close has moved profit into capital.',
    differs: [
      { key: 'trial-balance', text: 'The trial balance lists every ledger for a period, income and expense included, with opening, debit, credit and closing. Its totals are larger because expenses and incomes are shown separately; the balance-sheet ledgers are the same in both.' },
      { key: 'balance-sheet', text: 'The balance sheet arranges the same figures into statement lines (current assets, liabilities, equity). This one stays a flat list of ledgers.' },
    ],
    tips: ['It always covers the whole business: no branch or cost-centre filter.', 'Retained earnings here is the profit or loss of all years to the date, income less expenses.', 'The opening-balance difference line is worked out from the ledgers\' own opening balances, as on the trial balance.'],
  },
  'profit-loss': {
    purpose: 'What the business earned and spent in the period, and the profit left: revenue less cost of sales gives gross profit, then other income and expenses give net profit. Every line is a statement line, and a line opens to the ledgers behind it.',
    differs: [
      { key: 'balance-sheet', text: 'The balance sheet is a position at a date (what you own and owe). Profit & loss is a result over a period (what you earned).' },
      { key: 'cash-flow', text: 'Profit is not cash. A sale on credit is profit now and cash later; the cash flow statement shows the money.' },
      { key: 'profit-loss-by-cost-centre', text: 'This one covers the whole business. The cost-centre report shows each cost centre\'s own income and expense, only for entries that carry a cost centre.' },
      { key: 'trial-balance', text: 'The trial balance lists all ledgers and gives no profit figure.' },
    ],
    tips: ['Compare with the previous period or the same period last year, or show it month by month, from the report\'s options.', 'Direct and indirect is decided by the statement line a ledger is on: Revenue and Cost of sales are the trading section.', 'Ledgers that are on no statement line are shown apart and still counted, so no amount is lost.', 'Drafts are never counted; foreign-currency vouchers are shown in today\'s base currency.'],
  },
  'profit-loss-by-cost-centre': {
    purpose: 'What each cost centre (a branch, department, utilities, payroll and so on) earned and spent on its own, and in total with everything beneath it. It shows where profit is made inside the business.',
    differs: [
      { key: 'profit-loss', text: 'The ordinary profit & loss covers every entry. This report counts only entry lines that carry a cost centre, so its whole-business line can be smaller than the real profit.' },
    ],
    tips: ['The first two columns are a cost centre\'s own figures; the last three add the cost centres beneath it, so a branch includes its departments.', 'Needs the cost-centre columns on the books (script 102).'],
  },
  'balance-sheet': {
    purpose: 'What the business owns, owes and is worth on one date. Assets equal liabilities plus equity. Equity includes the retained profit of earlier years and the profit for this year so far.',
    differs: [
      { key: 'profit-loss', text: 'Profit & loss is the result of a period. The balance sheet is a snapshot, and carries that result into equity.' },
      { key: 'adjusted-trial-balance', text: 'The adjusted trial balance has the same ledger balances as a flat list with no statement lines.' },
      { key: 'changes-in-equity', text: 'Changes in equity explains how the equity figure here moved over a period.' },
    ],
    tips: ['It can be compared with an earlier date.', 'A difference in opening balances is carried on its own line so the two sides still agree; it clears when the opposite opening balance is entered.', 'Ledgers on no statement line are shown apart and still counted.'],
  },
  'changes-in-equity': {
    purpose: 'How the owners\' stake moved over a period: for each equity ledger and for retained earnings, what it was at the start, the profit or loss of the period, other movements (capital put in, drawings) and what it is at the end.',
    differs: [
      { key: 'balance-sheet', text: 'The closing total here is the equity figure on the balance sheet at the end date. The balance sheet shows only where equity stands; this shows how it got there.' },
      { key: 'profit-loss', text: 'The profit column is the profit & loss of the same period.' },
    ],
    tips: ['Equity belongs to the whole business, so a branch or cost-centre filter is ignored.', 'Retained earnings is what the income and expense ledgers hold: everything before the period at the start, the period\'s profit in the profit column.'],
  },
  'cash-flow': {
    purpose: 'Where the cash came from and where it went in the period, grouped into operating, investing and financing, ending at the change in cash. Cash means the cash and bank groups chosen in the Reports settings.',
    differs: [
      { key: 'profit-loss', text: 'Profit & loss counts income and costs when they happen. Cash flow counts money when it moves, so credit sales, stock bought and loans change one and not the other.' },
      { key: 'money-flow', text: 'Money flow lists the same cash and bank movements by who the money came from or went to, with no operating, investing or financing split.' },
    ],
    tips: ['Indirect method (default) starts from profit, adds back non-cash items and the change in other balances. Direct method lists money received and paid.', 'Opening cash plus net cash flow equals closing cash, always.', 'Each balance-sheet statement line has a cash flow category, set in the statement lines editor (the Cash flow column). A ledger follows the category of its statement line.'],
  },
  'day-book': {
    purpose: 'Every voucher in date order: sales, purchases, receipts, payments and journals. It answers "what was posted, and when?" and gives a posted total for the period.',
    differs: [
      { key: 'ledger-statement', text: 'The day book is by voucher across all ledgers. A ledger statement is by entry for one ledger, with a running balance.' },
      { key: 'trial-balance', text: 'The trial balance gives balances, not the vouchers behind them.' },
    ],
    tips: ['"By cost centre" splits a voucher across its cost centres; otherwise each voucher is listed once.', 'Drafts and cancelled vouchers are listed and marked but never counted in the posted total. Memoranda are left out.', 'Click a voucher to open it.'],
  },
  'ledger-statement': {
    purpose: 'One ledger entry by entry: the opening balance, every debit and credit, the other side of each entry, and a running balance. This is what you send a customer or supplier as their statement.',
    differs: [
      { key: 'day-book', text: 'The day book lists vouchers across every ledger without balances.' },
      { key: 'trial-balance', text: 'The trial balance gives each ledger\'s closing figure; this shows the entries that make it up.' },
    ],
    tips: ['Pick the ledger first. Long statements are paged, 200 lines to a page, and the running balance carries across pages.', 'Foreign-currency entries show their own amount; the balance is in the base currency.', 'A branch or cost-centre filter narrows the lines, and the opening balance then belongs to the whole business.'],
  },
  'money-flow': {
    purpose: 'What came into and went out of the cash and bank accounts in the period, and who or what it was for: sales, customers, suppliers, expenses. Per account in, out and net, with a chart over time.',
    differs: [
      { key: 'cash-flow', text: 'The cash flow statement arranges cash movements into operating, investing and financing and reconciles opening to closing cash.' },
      { key: 'ledger-statement', text: 'A ledger statement is the entries of one account; this adds up all money accounts by counter-party.' },
    ],
    tips: ['Moves between your own cash and bank accounts are transfers: listed apart and left out of in and out unless "Show transfers" is ticked.', 'A sale paid part in cash and part on account is split correctly between sales and tax.'],
  },
  'receivables-ageing': {
    purpose: 'Who owes you money and how late it is: each customer\'s open invoices placed in age buckets (not yet due, 1–30 days and so on). It is the list to chase from.',
    differs: [
      { key: 'payables-ageing', text: 'Payables ageing is the same for what you owe your suppliers.' },
      { key: 'ledger-statement', text: 'A customer\'s ledger statement shows every entry; ageing shows only what is still unpaid, by age.' },
    ],
    tips: ['Buckets and whether days count from the due date or bill date are set in Reports settings → Ageing.', 'Credits you hold for a customer (advances, credit notes) are listed apart, never netted into a bill; the net line is compared with the ledger balance.', 'Bills in other currencies show their own amount and the base amount.'],
  },
  'payables-ageing': {
    purpose: 'What you owe suppliers and how overdue it is, in age buckets. It tells you what to pay first.',
    differs: [
      { key: 'receivables-ageing', text: 'Receivables ageing is the same for what customers owe you.' },
    ],
    tips: ['Debit notes and advances paid to a supplier are credits on your side, listed apart.', 'Buckets and the day-count basis come from Reports settings → Ageing.'],
  },
  'tax-return': {
    purpose: 'The tax you charged (output) against the tax you paid (input), by tax type and rate, with the sales and purchases each applies to. It gives what is owed to the authority for the period, and what was owed at the start and end.',
    differs: [
      { key: 'withholding', text: 'Withholding is a register of certificates for tax held back at payment. This return also shows those taxes, with the amounts owed.' },
      { key: 'profit-loss', text: 'Tax shown on a sale is not income, so it is not in profit & loss.' },
    ],
    tips: ['"Owed at the start" is what was owed the day before the period; "owed at the end" what was owed on its last day, with the payments to the authority between them.', 'The supplies split shows standard, zero-rated, exempt and out-of-scope sales and purchases.', 'Tax that cannot be claimed back (set on the tax type under Tax & Compliance) is part of the cost and has no input line.'],
  },
  withholding: {
    purpose: 'A register of withholding tax certificates: tax a customer held back when paying you (a credit you can claim), and tax you held back from suppliers (owed to the authority), with whether the certificate has arrived.',
    differs: [
      { key: 'tax-return', text: 'The tax return totals tax by type and rate for filing. This lists each certificate.' },
    ],
    tips: ['"Awaiting certificate" counts every certificate still outstanding, whenever it was raised.', 'Each row shows its currency and the amount in the base currency, so the base column adds up to the totals.'],
  },
  'stock-journal': {
    purpose: 'Every stock movement, one line each: purchases, sales, returns, transfers, adjustments and write-offs, with quantity, unit cost and value. Use it to trace why a stock figure changed.',
    differs: [
      { key: 'stock-summary', text: 'The stock summary gives opening, in, out and closing per item group, not each movement.' },
      { key: 'stock-query', text: 'The stock query is one item\'s card: cost, last purchase and sale, and where it sits.' },
    ],
    tips: ['Search by item, SKU, batch or voucher number; filter by kind of movement or kind of item. Fifty lines to a page.', 'Value is quantity times unit cost.', 'Needs the stock permission.'],
  },
  'stock-summary': {
    purpose: 'Stock by item group for the period: opening, inwards, outwards and closing, in quantity and value. It shows how stock changed and what it is worth.',
    differs: [
      { key: 'stock-location-summary', text: 'The location summary is the same for one branch you choose.' },
      { key: 'stock-journal', text: 'The journal lists each movement behind these totals.' },
    ],
    tips: ['Negative stock and items with no cost are flagged.', 'Transfers between branches are hidden for the whole company and shown when a branch is chosen.'],
  },
  'stock-location-summary': {
    purpose: 'The stock summary for one branch: what that location held at the start, received, sent out and holds now, with value.',
    differs: [
      { key: 'stock-summary', text: 'The stock summary covers the whole company and hides transfers between branches.' },
    ],
    tips: ['A branch must be chosen.', 'Transfers to and from other branches show as inwards and outwards here.'],
  },
  'stock-query': {
    purpose: 'One item\'s card: what is on hand, its cost price and costing method, the last purchase and sale, recent purchases and sales, where it is held, and the other items of its group.',
    differs: [
      { key: 'stock-summary', text: 'The summary compares many items by group. The query answers questions about one.' },
      { key: 'stock-journal', text: 'The journal lists every movement; the query shows only the recent ones.' },
    ],
    tips: ['Search for the item first; products and kitchen ingredients are both found.'],
  },
  'ratio-analysis': {
    purpose: 'Health checks drawn from the books: how easily you can pay what is due (working capital, current and quick ratio), how much is borrowed (debt to equity), how profitable you are (gross, net and operating cost percentages, return on investment) and how fast money moves (receivable days, inventory turnover).',
    differs: [
      { key: 'balance-sheet', text: 'The balance sheet gives the amounts. Ratio analysis divides them to show strength and speed.' },
    ],
    tips: ['Each figure adds up the ledger groups and statement lines chosen in Reports settings → Ratio analysis inputs. One that is not chosen says "Not set up", and any ratio needing it says which setting it waits for.', 'Equity is capital plus retained earnings, so return on investment does not drift.', 'Receivable days use the bills still open, not the whole debtors balance.'],
  },
  trade: {
    purpose: 'Goods bought and sold by party and item. Choose a customer or supplier to see what they bought from or sold to you, an item to see who it moved with, or both to see the vouchers.',
    differs: [
      { key: 'ledger-statement', text: 'A ledger statement is money entries. Trade is quantities and prices by item.' },
      { key: 'stock-journal', text: 'The stock journal is every stock movement. Trade groups by party and shows rates.' },
    ],
    tips: ['"All parties" for an item lists every voucher.', 'Walk-in names that differ only by case or spacing are one row.', 'Returns count against what was sold or bought.'],
  },
  'books-health': {
    purpose: 'A checklist for the books: does the trial balance agree, are opening balances balanced, are there drafts or entries made after a year was closed, is any account below zero, is anything left in suspense, is anything unreconciled, is the tax set-up sound. Each finding lists where it is.',
    differs: [
      { key: 'control-accounts', text: 'Control-account checks test each control ledger against the register that explains it (gift vouchers, points, stock, receivables, payables). Health looks at the books as a whole.' },
    ],
    tips: ['Check means look at it; Fail means something is wrong; Not set up means a setting is missing, not that something failed.', 'Click a finding to open the voucher or ledger.'],
  },
  'control-accounts': {
    purpose: 'Proves that special ledgers agree with the lists behind them: the trial balance, gift vouchers outstanding, loyalty points, withholding credits, stock against batches, and receivables and payables against open bills.',
    differs: [
      { key: 'books-health', text: 'Books health is wider: drafts, back-dated entries, overdrawn accounts, duplicates, reconciliation, tax set-up.' },
    ],
    tips: ['A difference is fine when it is explained (for example an opening balance); the Explained column shows how much.', 'Some checks have a button to put it right, such as refreshing stock numbers.', 'Receivables and payables need the Debtors and Creditors groups chosen in Reports settings.'],
  },
};
