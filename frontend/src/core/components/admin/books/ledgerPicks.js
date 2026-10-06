/**
 * Which ledgers a purchase's service or other charge can post to: an expense account. Never a customer or supplier account, cash or bank (those move with
 * receipts, payments, journals and notes), a sales or purchase account, the money held for an auction deposit, or a payroll ledger.
 */
const MONEY_AND_PARTIES = ['Sundry Debtors', 'Sundry Creditors', 'Cash-in-hand', 'Bank Accounts'];
const NOT_FOR_PURCHASE_LINES = ['Sales Accounts', 'Purchase Accounts', 'Service Income', 'Statutory Payroll Liabilities', 'Employee Benefits / Payroll Expenses'];

export const notForPurchaseLines = (l) => NOT_FOR_PURCHASE_LINES.includes(l.group?.name) || ['sales', 'purchase'].includes(l.group?.behaviour)
  || l.settings?.charge_kind === 'deposit' || /auction.*deposit/i.test(l.name ?? '');

/** @param {object[]} ledgers every ledger, with its group */
export const purchaseChargeLedgers = (ledgers) => ledgers.filter((l) => !MONEY_AND_PARTIES.includes(l.group?.name) && !notForPurchaseLines(l));
