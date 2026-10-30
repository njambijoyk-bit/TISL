/**
 * The ways a budget row's months can be filled. Each takes what the person typed (params) and returns the amounts by month; the person can still change any month afterwards,
 * and the method with its params is kept on the row so it can be seen and run again. Amounts are rounded to cents; a yearly figure that does not divide evenly puts the
 * odd cents on the last month so the months always add up to it.
 */
export const METHODS = [
  ['manual', 'Type each month'],
  ['fixed', 'Same amount every month'],
  ['annual', 'Split a yearly figure evenly'],
  ['seasonal', 'Yearly figure by seasonal share'],
  ['percent', 'Percent of another row'],
  ['quantity', 'Quantity × rate'],
  ['history', "Last year's actuals plus growth"],
  ['copy', 'Copy another row'],
];

/** Shares of a year, in percent per calendar month, to start a seasonal split from. */
export const SEASONS = {
  even: ['Even', Array(12).fill(100 / 12)],
  retail: ['Retail (December heavy)', [6, 6, 7, 7, 7, 7, 7, 7, 8, 9, 11, 18]],
  school: ['School (terms)', [4, 10, 12, 4, 10, 12, 4, 12, 12, 6, 8, 6]],
};

const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? 0 : Number(v));

/** Split a total over weights so the pieces add up to the total exactly. */
export function spread(total, weights) {
  const sum = weights.reduce((a, b) => a + num(b), 0);
  if (!weights.length || sum <= 0) return weights.map(() => 0);
  const out = weights.map((w) => cents((num(total) * num(w)) / sum));
  const diff = cents(num(total) - out.reduce((a, b) => a + b, 0));
  out[out.length - 1] = cents(out[out.length - 1] + diff);
  return out;
}

/**
 * @param {string} method one of METHODS
 * @param {object} params what the method needs (amount, total, shares, percent, of, quantity, rate, growth)
 * @param {{ months: string[], valuesOf: (rowKey: string) => Record<string, number>, history?: Record<string, number> }} ctx the months being planned, the months of another row, last year's actuals
 * @returns {Record<string, number>|null} amounts by 'YYYY-MM', or null when the method cannot run yet (a row or the history is missing)
 */
export function fillMonths(method, params, ctx) {
  const { months } = ctx;
  const p = params ?? {};
  if (method === 'fixed') return Object.fromEntries(months.map((ym) => [ym, cents(p.amount)]));
  if (method === 'annual') return Object.fromEntries(spread(p.total, months.map(() => 1)).map((v, i) => [months[i], v]));
  if (method === 'seasonal') {
    const shares = months.map((ym) => num(p.shares?.[ym.slice(5)] ?? p.shares?.[Number(ym.slice(5)) - 1] ?? 100 / 12));
    return Object.fromEntries(spread(p.total, shares).map((v, i) => [months[i], v]));
  }
  if (method === 'percent') {
    if (!p.of) return null;
    const other = ctx.valuesOf(p.of);
    return Object.fromEntries(months.map((ym) => [ym, cents((num(other[ym]) * num(p.percent)) / 100)]));
  }
  if (method === 'quantity') return Object.fromEntries(months.map((ym) => [ym, cents(num(p.quantity) * num(p.rate))]));
  if (method === 'history') {
    if (!ctx.history) return null;
    return Object.fromEntries(months.map((ym) => [ym, cents(num(ctx.history[ym]) * (1 + num(p.growth) / 100))]));
  }
  if (method === 'copy') {
    if (!p.of) return null;
    const other = ctx.valuesOf(p.of);
    return Object.fromEntries(months.map((ym) => [ym, cents(num(other[ym]))]));
  }
  return null;
}
