/**
 * The periods the Visual reports page draws: presets (this month, last quarter, a financial year, the last N months ...) and the second period it can be set
 * against (the one before, N periods back, the same dates last year, or any dates). Dates are 'YYYY-MM-DD' strings and all the arithmetic is in UTC so a
 * time zone can never move a day.
 */
const parse = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
export const today = () => new Date().toLocaleDateString('en-CA');

const daysIn = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export const endOfMonth = (s) => { const d = parse(s); return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), daysIn(d.getUTCFullYear(), d.getUTCMonth())))); };
export const startOfMonth = (s) => `${s.slice(0, 7)}-01`;
/** A date moved by whole months, the day kept where the month is long enough, else the last day of it. */
export function addMonths(s, n) {
  const d = parse(s);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  return fmt(new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, daysIn(target.getUTCFullYear(), target.getUTCMonth())))));
}
const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
const monthsBetween = (from, to) => (parse(to).getUTCFullYear() - parse(from).getUTCFullYear()) * 12 + parse(to).getUTCMonth() - parse(from).getUTCMonth() + 1;
const wholeMonths = (from, to) => from.slice(8) === '01' && to === endOfMonth(to);

/** A short name for a period: "Oct 2026", "Q3 2026", "1 Jan – 29 Oct 2026". */
export function label(from, to) {
  const f = parse(from); const t = parse(to);
  const mon = (d) => d.toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });
  if (wholeMonths(from, to)) {
    const n = monthsBetween(from, to);
    if (n === 1) return `${mon(f)} ${f.getUTCFullYear()}`;
    if (n === 3 && f.getUTCMonth() % 3 === 0) return `Q${f.getUTCMonth() / 3 + 1} ${f.getUTCFullYear()}`;
    if (n === 12 && f.getUTCMonth() === 0) return `${f.getUTCFullYear()}`;
  }
  const part = (d) => `${d.getUTCDate()} ${mon(d)}`;
  return f.getUTCFullYear() === t.getUTCFullYear() ? `${part(f)} – ${part(t)} ${t.getUTCFullYear()}` : `${part(f)} ${f.getUTCFullYear()} – ${part(t)} ${t.getUTCFullYear()}`;
}

/** The financial year a date falls in (from the books' own years), else the calendar year. */
export function yearOf(date, years) {
  const y = years.find((x) => x.from <= date && date <= x.to);
  return y ?? { name: date.slice(0, 4), from: `${date.slice(0, 4)}-01-01`, to: `${date.slice(0, 4)}-12-31` };
}

export const PRESETS = [
  ['this-month', 'This month'], ['last-month', 'Last month'], ['this-quarter', 'This quarter'], ['last-quarter', 'Last quarter'],
  ['this-year', 'This financial year'], ['last-year', 'Last financial year'], ['last-n', 'Last N months'], ['custom', 'Choose dates'],
];

/** The dates of a preset. `n` is for "last N months"; `custom` is the dates the person typed. */
export function periodFor(preset, { years = [], n = 3, custom = null, now = today() } = {}) {
  if (preset === 'custom' && custom?.from && custom?.to) return { from: custom.from, to: custom.to };
  if (preset === 'this-month') return { from: startOfMonth(now), to: now };
  if (preset === 'last-month') { const f = startOfMonth(addMonths(now, -1)); return { from: f, to: endOfMonth(f) }; }
  if (preset === 'this-quarter' || preset === 'last-quarter') {
    const d = parse(now);
    const q = Math.floor(d.getUTCMonth() / 3) + (preset === 'last-quarter' ? -1 : 0);
    const f = fmt(new Date(Date.UTC(d.getUTCFullYear(), q * 3, 1)));
    return { from: f, to: preset === 'this-quarter' ? now : endOfMonth(addMonths(f, 2)) };
  }
  if (preset === 'this-year') { const y = yearOf(now, years); return { from: y.from, to: now < y.to ? now : y.to }; }
  if (preset === 'last-year') { const y = yearOf(addDays(yearOf(now, years).from, -1), years); return { from: y.from, to: y.to }; }
  if (preset === 'last-n') { const k = Math.max(1, Math.min(60, Number(n) || 1)); const f = startOfMonth(addMonths(now, -(k - 1))); return { from: f, to: now }; }
  return periodFor('this-year', { years, now });
}

export const COMPARES = [['none', 'No comparison'], ['previous', 'The period before'], ['year', 'Same dates last year'], ['custom', 'Choose dates']];

/** The period to set the main one against. `n` periods back moves a run of whole months by that many of the same length, a financial year by that many years, else by that many lengths in days. */
export function compareFor(mode, { from, to }, { n = 1, custom = null, years = [] } = {}) {
  if (mode === 'custom') return custom?.from && custom?.to ? { from: custom.from, to: custom.to } : null;
  if (mode === 'year') return { from: addMonths(from, -12), to: wholeMonths(from, to) ? endOfMonth(addMonths(to, -12)) : addMonths(to, -12) };
  if (mode !== 'previous') return null;
  const k = Math.max(1, Math.min(60, Number(n) || 1));
  const fy = years.find((y) => y.from === from && y.to === to);
  if (fy) return { from: addMonths(from, -12 * k), to: endOfMonth(addMonths(to, -12 * k)) };
  if (wholeMonths(from, to)) { const m = monthsBetween(from, to); return { from: addMonths(from, -m * k), to: endOfMonth(addMonths(to, -m * k)) }; }
  const len = Math.round((parse(to) - parse(from)) / 86400000) + 1;
  return { from: addDays(from, -len * k), to: addDays(to, -len * k) };
}

/** Change from `before` to `now`, as a percentage; null when there is nothing to compare to. */
export const change = (now, before) => (Math.abs(Number(before)) > 0.005 ? ((Number(now) - Number(before)) / Math.abs(Number(before))) * 100 : null);
