/**
 * The calculator's arithmetic. No eval: a small parser for + − × ÷, brackets and %.
 * Percent works the way a desk calculator does: "200 + 10%" is 220 (10% of 200 added), "200 × 10%" is 20.
 */
const OPS = { '+': 1, '-': 1, '*': 2, '/': 2 };

export function tokenize(src) {
  const s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '').replace(/\s+/g, '');
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      const num = s.slice(i, j);
      if ((num.match(/\./g) || []).length > 1 || num === '.') throw new Error('Bad number');
      out.push({ t: 'n', v: parseFloat(num) });
      i = j;
    } else if ('+-*/'.includes(c)) { out.push({ t: 'o', v: c }); i++; }
    else if (c === '(' || c === ')') { out.push({ t: c }); i++; }
    else if (c === '%') { out.push({ t: '%' }); i++; }
    else throw new Error('Unexpected ' + c);
  }
  return out;
}

export function evaluate(src) {
  const tk = tokenize(src);
  if (!tk.length) return 0;
  let p = 0;
  const peek = () => tk[p];

  // factor: [-] number [%] | ( expr )
  function factor() {
    const t = peek();
    if (!t) throw new Error('Incomplete');
    if (t.t === 'o' && (t.v === '-' || t.v === '+')) { p++; const f = factor(); return { v: t.v === '-' ? -f.v : f.v, pct: f.pct }; }
    if (t.t === 'n') { p++; if (peek()?.t === '%') { p++; return { v: t.v, pct: true }; } return { v: t.v, pct: false }; }
    if (t.t === '(') { p++; const e = expr(); if (peek()?.t !== ')') throw new Error('Missing )'); p++; if (peek()?.t === '%') { p++; return { v: e, pct: true }; } return { v: e, pct: false }; }
    throw new Error('Unexpected input');
  }
  function term() {
    let l = factor();
    while (peek()?.t === 'o' && OPS[peek().v] === 2) {
      const op = tk[p++].v; const r = factor();
      const rv = r.pct ? r.v / 100 : r.v;
      if (op === '/' && rv === 0) throw new Error('Divide by zero');
      l = { v: op === '*' ? (l.pct ? l.v / 100 : l.v) * rv : (l.pct ? l.v / 100 : l.v) / rv, pct: false };
    }
    return l;
  }
  function expr() {
    let l = term();
    let acc = l.pct ? l.v / 100 : l.v;
    while (peek()?.t === 'o' && OPS[peek().v] === 1) {
      const op = tk[p++].v; const r = term();
      const rv = r.pct ? acc * r.v / 100 : r.v;   // "200 + 10%" = 200 + 10% of 200
      acc = op === '+' ? acc + rv : acc - rv;
    }
    return acc;
  }
  const v = expr();
  if (p < tk.length) throw new Error('Unexpected input');
  if (!Number.isFinite(v)) throw new Error('Not a number');
  return Math.round(v * 1e10) / 1e10;
}

export const fmt = (n, dp = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  const abs = Math.abs(n);
  const d = abs !== 0 && abs < 0.01 ? 6 : dp;
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: Math.max(d, abs >= 1 ? dp : d) });
};

// ── finance helpers (pure) ──
export const addTax = (net, rate) => ({ tax: net * rate / 100, gross: net * (1 + rate / 100) });
export const removeTax = (gross, rate) => ({ net: gross / (1 + rate / 100), tax: gross - gross / (1 + rate / 100) });
export const priceFromMarkup = (cost, markupPct) => cost * (1 + markupPct / 100);
export const priceFromMargin = (cost, marginPct) => (marginPct >= 100 ? NaN : cost / (1 - marginPct / 100));
export const marginOf = (cost, price) => (price ? ((price - cost) / price) * 100 : NaN);
export const markupOf = (cost, price) => (cost ? ((price - cost) / cost) * 100 : NaN);
export const discountChain = (amount, pcts) => pcts.reduce((a, p) => a * (1 - p / 100), amount);
export const percentChange = (from, to) => (from ? ((to - from) / Math.abs(from)) * 100 : NaN);
export const compound = (principal, ratePct, years, perYear = 1) => principal * (1 + ratePct / 100 / perYear) ** (years * perYear);
export const convertCurrency = (amount, from, to) => (to?.conversion_rate ? amount * Number(from.conversion_rate) / Number(to.conversion_rate) : NaN);
export const convertUnit = (amount, from, to) => (to?.to_base_factor ? amount * Number(from.to_base_factor) / Number(to.to_base_factor) : NaN);
