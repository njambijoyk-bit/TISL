/** An amount in the item's OWN currency (nothing is converted): its symbol or code, two to four decimals. */
export const fmtAmount = (n, code, symbol) => {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '';
  const body = Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  return `${symbol || code || ''} ${body}`.trim();
};

export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export const fmtDateTime = (v) => (v ? new Date(v).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/** For a price list line: what the earlier price shows under the list's rule. strike = a discount, was = a markup (only when the rule says both). */
export const earlierOf = (x, rule) => {
  const price = Number(x.price); const orig = x.original_price === null || x.original_price === undefined ? null : Number(x.original_price);
  if (!orig || orig <= 0 || orig === price || rule === 'never') return null;
  if (orig > price) return { strike: orig };
  if (rule === 'both') return { was: orig, up: Math.round(((price - orig) / orig) * 1000) / 10 };

  return null;
};

export const EARLIER_LABEL = { discounts: 'Strike through discounts only', both: 'Strike through discounts, and note increases ("Was X, up N%")', never: 'Never show an earlier price' };
export const ACCESS_LABEL = { staff: 'Staff only', everyone: 'Everyone, including guests', customers: 'Signed-in customers', types: 'Selected customer types' };

export const slugify = (s) => String(s ?? '').normalize('NFKD').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'file';
