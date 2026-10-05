import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { X, Delete, Copy, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import insightAPI from '../../../_shared/api/insight';
import useDragPosition from '../../../_shared/hooks/useDragPosition';
import useCalculatorStore from '../../../_shared/store/calculatorStore';
import { colors, input, card } from '../../../_shared/theme/tokens';
import {
  evaluate, fmt, addTax, removeTax, priceFromMarkup, priceFromMargin, marginOf, markupOf,
  discountChain, percentChange, compound, convertCurrency, convertUnit,
} from './calcEngine';

const KEYS = [
  ['C', '(', ')', '÷'], ['7', '8', '9', '×'], ['4', '5', '6', '−'], ['1', '2', '3', '+'], ['0', '.', '%', '='],
];
const TAPE_KEY = 'calc_tape';
const readTape = () => { try { return JSON.parse(localStorage.getItem(TAPE_KEY)) || []; } catch { return []; } };

const tabBtn = (on) => ({ flex: 1, padding: '8px 4px', background: 'none', border: 'none', borderBottom: `2px solid ${on ? colors.primary : 'transparent'}`, color: on ? colors.primary : colors.textMuted, fontWeight: on ? 700 : 500, fontSize: '0.74rem', cursor: 'pointer' });
const lab = { fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textMuted, display: 'block', marginBottom: 3 };
const small = { ...input, padding: '6px 8px', fontSize: '0.8rem' };

function Out({ rows }) {
  return <div style={{ marginTop: 8 }}>{rows.filter(Boolean).map(([l, v]) => <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', padding: '3px 0', borderBottom: `1px solid ${colors.tint(0.08)}` }}><span style={{ color: colors.textMuted }}>{l}</span><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</strong></div>)}</div>;
}
const num = (v) => (v === '' || v === null ? NaN : Number(v));
const N = ({ v, set, ph }) => <input style={small} type="number" step="any" value={v} placeholder={ph} onChange={(e) => set(e.target.value)} />;

// ── the plain calculator ──────────────────────────────────────────────────────
function Keypad({ onAnswer }) {
  const [expr, setExpr] = useState('');
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [tape, setTape] = useState(readTape);
  const box = useRef(null);

  const live = useMemo(() => { try { return expr ? evaluate(expr) : null; } catch { return null; } }, [expr]);
  const press = useCallback((k) => {
    setErr('');
    if (k === 'C') { setExpr(''); setRes(null); return; }
    if (k === '⌫') { setExpr((e) => e.slice(0, -1)); return; }
    if (k === '=') {
      try {
        const v = evaluate(expr);
        const next = [{ e: expr, v }, ...readTape()].slice(0, 30);
        localStorage.setItem(TAPE_KEY, JSON.stringify(next)); setTape(next);
        setRes(v); setExpr(String(v)); onAnswer?.(v);
      } catch (e) { setErr(e.message); }
      return;
    }
    setExpr((e) => (res !== null && /[0-9.(]/.test(k) && e === String(res) ? k : e + k));
    setRes(null);
  }, [expr, res, onAnswer]);

  const onKey = (e) => {
    const map = { '*': '×', '/': '÷', '-': '−', Enter: '=' };
    if (e.key === 'Escape') return;
    if (/^[0-9.+()%]$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (map[e.key]) { e.preventDefault(); press(map[e.key]); }
    else if (e.key === 'Backspace') { e.preventDefault(); press('⌫'); }
    else if (e.key.toLowerCase() === 'c' && !e.altKey && !e.ctrlKey) { e.preventDefault(); press('C'); }
  };
  useEffect(() => { box.current?.focus(); }, []);

  return (
    <div ref={box} tabIndex={0} onKeyDown={onKey} style={{ outline: 'none' }}>
      <div style={{ ...card, padding: '10px 12px', marginBottom: 8, textAlign: 'right', minHeight: 62 }}>
        <div style={{ fontSize: '0.78rem', color: colors.textMuted, minHeight: 16, wordBreak: 'break-all' }}>{expr || ' '}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: err ? colors.dangerText : colors.text }}>{err || (res !== null ? fmt(res, 6) : live !== null ? fmt(live, 6) : '0')}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {KEYS.flat().map((k) => (
          <button key={k} type="button" onClick={() => press(k)} style={{ padding: '11px 0', borderRadius: 8, border: `1px solid ${colors.tint(0.15)}`, cursor: 'pointer', fontSize: '1rem', fontWeight: 600, background: k === '=' ? colors.primary : '÷×−+'.includes(k) ? colors.tint(0.12) : 'var(--surface-card, #fff)', color: k === '=' ? 'white' : colors.text }}>{k}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <button type="button" onClick={() => press('⌫')} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: `1px solid ${colors.tint(0.15)}`, background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', cursor: 'pointer' }}><Delete size={14} /></button>
        <button type="button" disabled={res === null && live === null} onClick={() => navigator.clipboard?.writeText(String(res ?? live))} style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: `1px solid ${colors.tint(0.15)}`, background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', cursor: 'pointer' }} title="Copy"><Copy size={14} /></button>
      </div>
      {tape.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...lab, display: 'flex', justifyContent: 'space-between' }}>Tape <button type="button" onClick={() => { localStorage.removeItem(TAPE_KEY); setTape([]); }} style={{ background: 'none', border: 'none', color: colors.textFaint, cursor: 'pointer', fontSize: '0.64rem' }}>clear</button></div>
          <div style={{ maxHeight: 120, overflowY: 'auto' }}>{tape.map((t, i) => <div key={i} onClick={() => { setExpr(String(t.v)); setRes(t.v); }} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', padding: '3px 0', cursor: 'pointer', color: colors.textMuted }}><span>{t.e}</span><strong style={{ color: colors.text }}>{fmt(t.v, 6)}</strong></div>)}</div>
        </div>
      )}
    </div>
  );
}

// ── finance helpers ───────────────────────────────────────────────────────────
function Finance() {
  const [kind, setKind] = useState('tax');
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [c, setC] = useState('');
  const reset = (k) => { setKind(k); setA(''); setB(''); setC(''); };
  const x = num(a), y = num(b), z = num(c);
  let rows = [];
  if (kind === 'tax') { const t = addTax(x, y), r = removeTax(x, y); rows = [['Add tax: tax', fmt(t.tax)], ['Add tax: total', fmt(t.gross)], ['Take tax out: net', fmt(r.net)], ['Take tax out: tax', fmt(r.tax)]]; }
  if (kind === 'markup') rows = [['Price at that markup', fmt(priceFromMarkup(x, y))], ['Price at that margin', fmt(priceFromMargin(x, y))]];
  if (kind === 'profit') rows = [['Profit', fmt(y - x)], ['Margin', fmt(marginOf(x, y)) + ' %'], ['Markup', fmt(markupOf(x, y)) + ' %']];
  if (kind === 'discount') rows = [['After the discounts', fmt(discountChain(x, [y, z].filter((n) => !Number.isNaN(n))))], ['Taken off', fmt(x - discountChain(x, [y, z].filter((n) => !Number.isNaN(n))))]];
  if (kind === 'change') rows = [['Change', fmt(y - x)], ['Percent change', fmt(percentChange(x, y)) + ' %']];
  if (kind === 'interest') rows = [['After the years (yearly)', fmt(compound(x, y, z))], ['After the years (monthly)', fmt(compound(x, y, z, 12))]];
  const fields = { tax: ['Amount', 'Tax rate %'], markup: ['Cost', 'Markup % / margin %'], profit: ['Cost', 'Selling price'], discount: ['Amount', 'Discount 1 %', 'Discount 2 % (optional)'], change: ['From', 'To'], interest: ['Amount', 'Rate % a year', 'Years'] }[kind];
  return (
    <div>
      <select style={{ ...small, marginBottom: 10 }} value={kind} onChange={(e) => reset(e.target.value)}>
        <option value="tax">Tax: add / take out</option><option value="markup">Price from markup or margin</option><option value="profit">Profit, margin and markup</option>
        <option value="discount">Discounts</option><option value="change">Percent change</option><option value="interest">Compound interest</option>
      </select>
      {[a, b, c].slice(0, fields.length).map((val, i) => <div key={fields[i]} style={{ marginBottom: 8 }}><label style={lab}>{fields[i]}</label><N v={val} set={[setA, setB, setC][i]} /></div>)}
      <Out rows={rows.filter(([, v]) => v && !v.startsWith('NaN'))} />
    </div>
  );
}

// ── currency and units, from your own tables ──────────────────────────────────
function Convert({ data }) {
  const [mode, setMode] = useState('currency');
  const [amt, setAmt] = useState('');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const list = mode === 'currency' ? data.currencies : data.units;
  const f = list.find((u) => String(u.id) === String(from)); const t = list.find((u) => String(u.id) === String(to));
  const val = f && t && amt !== '' ? (mode === 'currency' ? convertCurrency(num(amt), f, t) : f.dimension === t.dimension ? convertUnit(num(amt), f, t) : NaN) : NaN;
  const per = mode === 'unit' && f && t && f.dimension === t.dimension && amt !== '' ? convertUnit(1, t, f) * num(amt) : NaN;   // price per `from` → price per `to`
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[['currency', 'Currency'], ['unit', 'Units']].map(([k, l]) => <button key={k} type="button" onClick={() => { setMode(k); setFrom(''); setTo(''); }} style={{ ...tabBtn(mode === k), border: `1px solid ${colors.tint(0.2)}`, borderRadius: 8 }}>{l}</button>)}
      </div>
      <label style={lab}>{mode === 'unit' ? 'Quantity (or a price per the first unit)' : 'Amount'}</label><N v={amt} set={setAmt} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
        <div><label style={lab}>From</label><select style={small} value={from} onChange={(e) => setFrom(e.target.value)}><option value="">Choose…</option>{list.map((u) => <option key={u.id} value={u.id}>{u.code}{mode === 'unit' ? ` — ${u.name}` : ''}</option>)}</select></div>
        <div><label style={lab}>To</label><select style={small} value={to} onChange={(e) => setTo(e.target.value)}><option value="">Choose…</option>{list.filter((u) => !f || mode === 'currency' || u.dimension === f.dimension).map((u) => <option key={u.id} value={u.id}>{u.code}{mode === 'unit' ? ` — ${u.name}` : ''}</option>)}</select></div>
      </div>
      <Out rows={[Number.isFinite(val) && [`${fmt(num(amt), 4)} ${f?.code} is`, `${fmt(val, 4)} ${t?.code}`], Number.isFinite(per) && f && t && [`If it is a price: per ${t.code}`, fmt(per, 4)]]} />
      <div style={{ fontSize: '0.68rem', color: colors.textFaint, marginTop: 8 }}>{mode === 'currency' ? 'At the rates in your currencies table.' : 'From your units table.'}</div>
    </div>
  );
}

// ── insight: what the page you are on means ───────────────────────────────────
function Block({ b }) {
  if (b.type === 'facts') return <div style={{ marginBottom: 10 }}>{b.title && <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 4 }}>{b.title}</div>}{b.rows.map((r, i) => <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.78rem', padding: '3px 0', borderBottom: `1px solid ${colors.tint(0.07)}` }}><span style={{ color: colors.textMuted }}>{r[0]}</span><span style={{ textAlign: 'right' }}><strong>{r[1]}</strong>{r[2] && <span style={{ display: 'block', fontSize: '0.68rem', color: colors.textFaint }}>{r[2]}</span>}</span></div>)}</div>;
  if (b.type === 'table') return <div style={{ marginBottom: 10, overflowX: 'auto' }}>{b.title && <div style={{ fontWeight: 700, fontSize: '0.8rem', marginBottom: 4 }}>{b.title}</div>}<table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.76rem' }}><thead><tr>{b.columns.map((c) => <th key={c} style={{ textAlign: 'left', padding: '4px 6px', color: colors.textMuted, borderBottom: `1px solid ${colors.tint(0.15)}`, fontWeight: 600 }}>{c}</th>)}</tr></thead><tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} style={{ padding: '4px 6px', borderBottom: `1px solid ${colors.tint(0.06)}`, textAlign: j === 0 ? 'left' : 'right' }}>{v}</td>)}</tr>)}</tbody></table></div>;
  if (b.type === 'verdict') { const tone = { good: [colors.successBg, colors.successText], warn: [colors.warningBg, colors.warningText], bad: [colors.dangerBg, colors.dangerText] }[b.tone] ?? [colors.infoBg, colors.infoText]; return <div style={{ background: tone[0], color: tone[1], borderRadius: 8, padding: '8px 10px', fontSize: '0.8rem', fontWeight: 600, marginBottom: 10 }}>{b.text}</div>; }
  return <div style={{ fontSize: '0.76rem', color: colors.textMuted, marginBottom: 10 }}>{b.text}</div>;
}

function Insight({ data }) {
  const context = useCalculatorStore((s) => s.context);
  const [packs, setPacks] = useState(null);
  const [pick, setPick] = useState('');
  const [lookback, setLookback] = useState(data.default_lookback);
  const [ans, setAns] = useState(null);
  const [busy, setBusy] = useState(false);
  const [words, setWords] = useState('');
  const [err, setErr] = useState('');
  const ctxKey = JSON.stringify(context);

  useEffect(() => {
    setPacks(null); setAns(null); setWords(''); setErr('');
    if (!context) { setPacks([]); return undefined; }
    let live = true;
    insightAPI.contexts(context).then((r) => { if (live) { setPacks(r.data); setPick(r.data[0]?.key ?? ''); } }).catch(() => live && setPacks([]));
    return () => { live = false; };
  }, [ctxKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async (explain = false, example = 0) => {
    if (!pick || !context) return;
    setBusy(true); setErr('');
    try {
      const r = await (explain ? insightAPI.explain : insightAPI.answer)(pick, context, lookback, example);
      setAns(r.data); setWords(r.data.words ?? '');
    } catch (e) { const d = e?.response?.data; if (d?.data) { setAns(d.data); } setErr(d?.message ?? 'Could not work that out.'); }
    finally { setBusy(false); }
  }, [pick, context, lookback]);
  useEffect(() => { if (pick) run(false); }, [pick, lookback]); // eslint-disable-line react-hooks/exhaustive-deps
  // values being typed on the page (a draft rule, unsaved settings): refresh a moment after the last keystroke
  useEffect(() => { if (!pick) return undefined; const t = setTimeout(() => run(false), 600); return () => clearTimeout(t); }, [ctxKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (packs === null) return <div style={{ color: colors.textMuted, fontSize: '0.8rem' }}>Looking…</div>;
  if (!packs.length) return <div style={{ color: colors.textMuted, fontSize: '0.8rem', lineHeight: 1.5 }}>Nothing to explain on this page yet. Open a document, such as a voucher sold in dozens or a loyalty journal, and press Alt+C.</div>;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {packs.length > 1 && <select style={{ ...small, flex: 1 }} value={pick} onChange={(e) => setPick(e.target.value)}>{packs.map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}</select>}
        <select style={{ ...small, flex: 1 }} value={lookback} onChange={(e) => setLookback(e.target.value)} title="How far back it looks, where it looks at history">{data.lookbacks.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}</select>
      </div>
      {busy && !ans && <Loader2 size={16} className="animate-spin" />}
      {ans && (
        <>
          <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>{ans.title}</div>
          {ans.subtitle && <div style={{ fontSize: '0.76rem', color: colors.textMuted, marginBottom: 8 }}>{ans.subtitle}</div>}
          {ans.blocks.map((b, i) => <Block key={i} b={b} />)}
          {words && <div style={{ background: colors.tint(0.07), borderRadius: 8, padding: '9px 11px', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 8 }}><Sparkles size={12} style={{ verticalAlign: -1, marginRight: 4, color: colors.primary }} />{words}</div>}
          {err && <div role="alert" style={{ color: colors.dangerText, fontSize: '0.76rem', marginBottom: 8 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" disabled={busy} onClick={() => run(true)} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${colors.tint(0.25)}`, background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.76rem', fontWeight: 600 }}>{busy ? 'Working…' : 'Explain in words'}</button>
            {ans.has_another && <button type="button" disabled={busy} onClick={() => run(false, 1)} style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${colors.tint(0.25)}`, background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.76rem' }}><RefreshCw size={12} style={{ verticalAlign: -2 }} /> Another example</button>}
          </div>
          {ans.basis && <div style={{ fontSize: '0.66rem', color: colors.textFaint, marginTop: 10 }}>{ans.basis} Estimates only: nothing here changes your books.</div>}
        </>
      )}
    </div>
  );
}

/** The finance calculator: Alt+C from anywhere in the admin. A plain keypad, finance helpers, conversions from your own tables, and what the page you are on means. */
export default function Calculator() {
  const drag = useDragPosition('calc-pos');
  const open = useCalculatorStore((s) => s.open);
  const setOpen = useCalculatorStore((s) => s.setOpen);
  const context = useCalculatorStore((s) => s.context);
  const [tab, setTab] = useState('calc');
  const [refData, setRefData] = useState(null);

  useEffect(() => { if (open && !refData) insightAPI.reference().then(setRefData).catch(() => setRefData({ currencies: [], units: [], lookbacks: [], default_lookback: '90' })); }, [open, refData]);
  useEffect(() => { if (open && context) setTab('insight'); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, setOpen]);
  if (!open) return null;

  return (
    <div ref={drag.ref} role="dialog" aria-label="Calculator" style={{ position: 'fixed', right: 16, bottom: 16, ...drag.style, width: 'min(380px, calc(100vw - 32px))', maxHeight: 'min(640px, calc(100vh - 32px))', display: 'flex', flexDirection: 'column', background: 'var(--surface-card, #fff)', color: 'var(--text-primary)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,0.22)', zIndex: 1200 }}>
      <div {...drag.handleProps} title="Drag to move, double-click to put back" style={{ ...drag.handleProps.style, display: 'flex', alignItems: 'center', padding: '10px 14px 0' }}>
        <strong style={{ flex: 1, fontSize: '0.9rem' }}>Calculator <span style={{ fontWeight: 400, color: colors.textFaint, fontSize: '0.68rem' }}>Alt+C</span></strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted }}><X size={16} /></button>
      </div>
      <div style={{ display: 'flex', borderBottom: `1px solid ${colors.tint(0.12)}`, margin: '6px 8px 0' }}>
        {[['calc', 'Calculator'], ['finance', 'Finance'], ['convert', 'Convert'], ['insight', 'This page']].map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} style={tabBtn(tab === k)}>{l}{k === 'insight' && context ? ' •' : ''}</button>)}
      </div>
      <div style={{ padding: 14, overflowY: 'auto' }}>
        {tab === 'calc' && <Keypad />}
        {tab === 'finance' && <Finance />}
        {tab !== 'calc' && tab !== 'finance' && !refData && <div style={{ color: colors.textMuted, fontSize: '0.8rem' }}>Loading…</div>}
        {tab === 'convert' && refData && <Convert data={refData} />}
        {tab === 'insight' && refData && <Insight data={refData} />}
      </div>
    </div>
  );
}
