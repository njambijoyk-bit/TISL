/** Tokens, or an estimated cost in USD (small amounts with four decimals). */
export const amount = (n, unit) => (unit === 'cost' ? '$' + Number(n ?? 0).toFixed(Number(n) < 1 ? 4 : 2) : Number(n ?? 0).toLocaleString() + ' tokens');
