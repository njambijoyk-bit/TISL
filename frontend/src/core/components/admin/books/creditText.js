import { money } from './booksFmt';

/**
 * The plain-language line for money we hold for a party — the same wording on the invoice, the receipt form and the
 * customer's screens. `who` is the party's name for the admin, or null to speak to the customer ("You paid extra …").
 */
export const creditSentence = (c, who = null, supplierSide = false) => {
  const amt = money(c.amount);
  if (supplierSide) {
    return c.nature === 'advance'
      ? `You paid ${who ?? 'the supplier'} ${amt} in advance${c.for ? ` for ${c.for}` : ''} on ${c.voucher_number}`
      : `You paid ${who ?? 'the supplier'} an extra ${amt} on ${c.voucher_number}`;
  }
  if (c.nature === 'advance') return `${who ?? 'You'} paid ${amt} in advance${c.for ? ` for ${c.for}` : ''} on ${c.voucher_number}`;
  return `${who ?? 'You'} paid extra ${amt} on ${c.voucher_number}`;
};
