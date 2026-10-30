import { useEffect, useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, Treemap, XAxis, YAxis, ZAxis,
} from 'recharts';
import { colors } from '../../../_shared/theme/tokens';
import { change } from './visualPeriods';
import { useCmp } from './visualCompare';
import { SERIES, compact, full } from './visualFmt';

const GOOD = '#0ca30c';
const BAD = '#d03b3b';
const GRID = '#e1e0d9';
const AXIS = '#898781';
const GHOST = '#8a9bb5';   // the comparison period: the same shape, drawn quietly

const axis = { tick: { fill: AXIS, fontSize: 11 }, axisLine: { stroke: GRID }, tickLine: false };
const tip = { formatter: (v, name) => [full(v), name], contentStyle: { borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 12 } };
const H = 260;
const legend = { iconType: 'square', wrapperStyle: { fontSize: 12 }, formatter: (v) => <span style={{ color: colors.textBody }}>{v}</span> };   // text in ink; the square carries the colour

/** Charts glide in unless the person has asked their system for less motion. */
const MOTION = typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const anim = { isAnimationActive: MOTION, animationDuration: 850, animationEasing: 'ease-out' };

const Frame = ({ children, h = H }) => <div style={{ width: '100%', height: h }}><ResponsiveContainer>{children}</ResponsiveContainer></div>;
const Empty = ({ text = 'Nothing to show for this period.' }) => <div style={{ padding: '36px 0', textAlign: 'center', fontSize: '0.8rem', color: colors.textFaint }}>{text}</div>;
const month = (m) => { const [y, mm] = String(m).split('-'); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mm) - 1] + (mm === '01' ? ` ${y.slice(2)}` : ''); };

const monthTick = (rows) => (m, i) => (rows[i]?.cmpMonth ? `${month(m)} vs ${month(rows[i].cmpMonth)}` : month(m));
const monthTip = (m, items) => { const o = items?.[0]?.payload?.cmpMonth; return o ? `${month(m)} against ${month(o)}` : month(m); };
const ghostDot = { r: 4, fill: 'var(--surface-card, #fff)', stroke: GHOST, strokeWidth: 2 };   // a lone month has no line to draw, so its point must show

/** Lay two series side by side by position (first with first), so a period can be set against another of a different length. */
const zip = (a, b, map) => Array.from({ length: Math.max(a.length, b?.length ?? 0) }, (_, i) => ({ ...(a[i] ?? {}), ...(b?.[i] ? map(b[i]) : {}), _i: i }));

/** How much more or less, as a small coloured chip ("up" is good unless `lowerIsBetter`). */
export function Delta({ now, before, lowerIsBetter = false }) {
  const c = change(now, before);
  if (c === null) return <span style={{ color: colors.textFaint, fontSize: '0.72rem' }}>nothing to compare with</span>;
  const up = c >= 0;
  const good = lowerIsBetter ? !up : up;
  return <span style={{ color: good ? colors.successText : colors.dangerText, fontSize: '0.72rem', fontWeight: 700 }}>{up ? '▲' : '▼'} {Math.abs(c).toFixed(1)}%</span>;
}

/** Running cash balance, with the comparison period's balance as a dashed line. */
export function CashLine({ d, c }) {
  const L = useCmp();
  if (!d.series.length) return <Empty />;
  const rows = zip(d.series, c?.series, (x) => ({ cmp: x.balance }));
  return (
    <Frame><ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="bucket" {...axis} minTickGap={32} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} />{c && <Legend {...legend} />}
      <Area {...anim} type="monotone" dataKey="balance" name="Cash and bank balance" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.12} dot={false} />
      {c && <Line {...anim} type="monotone" dataKey="cmp" name={L} stroke={GHOST} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
    </ComposedChart></Frame>
  );
}

/** Money in against money out, with the comparison period's as dashed lines. */
export function MoneyInOut({ d, c }) {
  const L = useCmp();
  if (!d.series.length) return <Empty />;
  const rows = zip(d.series, c?.series, (x) => ({ cmpIn: x.in, cmpOut: x.out }));
  return (
    <Frame><ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="bucket" {...axis} minTickGap={32} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} /><Legend {...legend} />
      <Bar {...anim} dataKey="in" name="Money in" fill={SERIES[2]} radius={[4, 4, 0, 0]} /><Bar {...anim} dataKey="out" name="Money out" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
      {c && <Line {...anim} type="monotone" dataKey="cmpIn" name={`${L}: in`} stroke={SERIES[2]} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
      {c && <Line {...anim} type="monotone" dataKey="cmpOut" name={`${L}: out`} stroke={SERIES[1]} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
    </ComposedChart></Frame>
  );
}

/** Each cash and bank account: in, out and where it ended. */
export function AccountBars({ d }) {
  if (!d.accounts.length) return <Empty />;
  return (
    <Frame h={Math.max(H, d.accounts.length * 46 + 60)}><BarChart data={d.accounts} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }} barGap={2}>
      <CartesianGrid stroke={GRID} horizontal={false} /><XAxis type="number" {...axis} tickFormatter={compact} /><YAxis type="category" dataKey="name" {...axis} width={110} />
      <Tooltip {...tip} /><Legend {...legend} />
      <Bar {...anim} dataKey="in" name="In" fill={SERIES[2]} radius={[0, 4, 4, 0]} /><Bar {...anim} dataKey="out" name="Out" fill={SERIES[1]} radius={[0, 4, 4, 0]} /><Bar {...anim} dataKey="closing" name="Balance at the end" fill={SERIES[0]} radius={[0, 4, 4, 0]} />
    </BarChart></Frame>
  );
}

const sizeOf = (n) => (n.children ? n.children.reduce((t, c) => t + sizeOf(c), 0) : n.size);

/** Walks a group tree down a trail of group names: the level now shown, and the trail that was followed (a name that is no longer there ends it). */
function useDrill(tree) {
  const [path, setPath] = useState([]);
  let level = tree;
  const trail = [];
  for (const step of path) {
    const next = level.find((n) => n.name === step && n.children);
    if (!next) break;
    trail.push(next.name);
    level = next.children;
  }
  return { level, trail, setPath, top: trail.length ? tree.findIndex((g) => g.name === trail[0]) : -1 };
}

function Trail({ trail, setPath, hint }) {
  const btn = (on) => ({ background: 'none', border: 'none', padding: 0, cursor: on ? 'pointer' : 'default', color: on ? colors.primary : colors.text, fontWeight: 600, fontFamily: 'inherit', fontSize: 'inherit' });
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.78rem', marginBottom: 8 }}>
      <button type="button" onClick={() => setPath([])} style={btn(trail.length > 0)}>All</button>
      {trail.map((t, i) => <span key={t}>› <button type="button" onClick={() => setPath(trail.slice(0, i + 1))} style={btn(i < trail.length - 1)}>{t}</button></span>)}
      {hint && <span style={{ color: colors.textFaint }}>· {hint}</span>}
    </div>
  );
}

/** The same level of the comparison period's tree, by name, so each slice can say how it changed. */
function sameLevel(cmpTree, trail) {
  let level = cmpTree ?? [];
  for (const step of trail) { level = level.find((n) => n.name === step)?.children ?? []; }
  return new Map(level.map((n) => [n.name, sizeOf(n)]));
}

/**
 * Where the money went, one level at a time. Click a slice to open the group; at a ledger a click opens its statement. The middle shows what you are inside and
 * its total; with a comparison period each slice says how it changed.
 */
export function ExpenseDonut({ d, c, onLedger }) {
  const { level, trail, setPath, top } = useDrill(d.tree);
  const before = useMemo(() => sameLevel(c?.tree, trail), [c, trail]);
  if (!d.tree.length) return <Empty />;
  const all = level.map((n) => ({ name: n.name, value: Math.max(sizeOf(n), 0.01), opens: Boolean(n.children), ledger_id: n.ledger_id, before: before.get(n.name) ?? null })).sort((a, b) => b.value - a.value);
  const head = all.slice(0, 8);
  const rest = all.slice(8);
  const slices = rest.length ? [...head, { name: 'Everything else', value: rest.reduce((t, r) => t + r.value, 0), opens: false, rest: rest.length, before: null }] : head;
  const total = all.reduce((t, r) => t + r.value, 0);
  const totalBefore = c ? all.reduce((t, r) => t + (r.before ?? 0), 0) : null;
  const colour = (i, s) => (s.name === 'Everything else' ? '#b4b2a9' : SERIES[(top >= 0 ? top : i) % SERIES.length]);
  const shade = (i) => (top >= 0 ? Math.max(0.3, 1 - i * 0.14) : 1);   // inside a group its parts share the group's colour, in steps of tint
  const pick = (s) => { if (s?.opens) setPath([...trail, s.name]); else if (s?.ledger_id && onLedger) onLedger(s.ledger_id); };
  return (
    <div>
      <Trail trail={trail} setPath={setPath} hint={slices.some((s) => s.opens) ? 'click a slice to open it' : 'click a ledger to see its statement'} />
      <div style={{ position: 'relative' }}>
        <Frame h={280}>
          <PieChart>
            <Pie {...anim} data={slices} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="86%" paddingAngle={2} stroke="var(--surface-card, #fff)" strokeWidth={2} onClick={(_, i) => pick(slices[i])} style={{ cursor: 'pointer' }}>
              {slices.map((s, i) => <Cell key={s.name} fill={colour(i, s)} fillOpacity={shade(i)} style={{ cursor: s.opens || s.ledger_id ? 'pointer' : 'default' }} />)}
            </Pie>
            <Tooltip contentStyle={tip.contentStyle} formatter={(v, n, p) => [`${full(v)}${p?.payload?.before != null ? `  (before: ${full(p.payload.before)})` : ''}`, n]} />
          </PieChart>
        </Frame>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: '0.68rem', color: colors.textFaint }}>{trail.length ? trail[trail.length - 1] : 'All expenses'}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: colors.text, fontVariantNumeric: 'tabular-nums' }}>{compact(total)}</div>
            {c && <Delta now={total} before={totalBefore} lowerIsBetter />}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', justifyContent: 'center', fontSize: '0.74rem', color: colors.textBody }}>
        {slices.map((s, i) => (
          <button key={s.name} type="button" onClick={() => pick(s)} style={{ background: 'none', border: 'none', cursor: s.opens || s.ledger_id ? 'pointer' : 'default', color: 'inherit', fontFamily: 'inherit', fontSize: 'inherit', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 9, height: 9, background: colour(i, s), opacity: shade(i), borderRadius: 2 }} aria-hidden />{s.name}{s.rest ? ` (${s.rest})` : ''}{s.opens ? ' ›' : ''}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One rectangle: its name and amount, in the colour of the top group it belongs to; a group that opens says so. */
function TreeCell({ x, y, width, height, name, amount, color, opens, depth }) {
  if (depth !== 1) return null;   // the treemap also draws its own root: that one has nothing to say
  return (
    <g style={{ cursor: opens ? 'pointer' : 'default' }}>
      <rect x={x} y={y} width={width} height={height} rx={4} fill={color} fillOpacity={0.22} stroke="var(--surface-card, #fff)" strokeWidth={3} />
      {width > 60 && height > 24 && <text x={x + 8} y={y + 18} fontSize={12} fontWeight={600} fill={colors.text} style={{ pointerEvents: 'none' }}>{String(name).slice(0, Math.floor(width / 7)) + (opens ? ' ›' : '')}</text>}
      {width > 60 && height > 42 && <text x={x + 8} y={y + 34} fontSize={11} fill={colors.textMuted} style={{ pointerEvents: 'none' }}>{compact(amount)}</text>}
    </g>
  );
}

/** A treemap of groups and their ledgers, one level at a time: click a group to go into it, a ledger to open its statement, the trail to come back. */
export function GroupTreemap({ tree, onLedger }) {
  const { level, trail, setPath, top } = useDrill(tree);
  if (!tree.length) return <Empty />;
  const data = level.map((n, i) => ({ name: n.name, size: Math.max(sizeOf(n), 0.01), amount: sizeOf(n), opens: Boolean(n.children), ledger_id: n.ledger_id, color: SERIES[(top >= 0 ? top : i) % SERIES.length] }));
  return (
    <div>
      <Trail trail={trail} setPath={setPath} hint={data.some((x) => x.opens) ? 'click a group marked › to open it' : 'click a ledger to see its statement'} />
      <Frame h={300}>
        <Treemap {...anim} data={data} dataKey="size" aspectRatio={4 / 3} onClick={(n) => { if (n?.opens) setPath([...trail, n.name]); else if (n?.ledger_id && onLedger) onLedger(n.ledger_id); }} content={<TreeCell />}>
          <Tooltip formatter={(v, n, p) => [full(p?.payload?.amount ?? v), p?.payload?.name ?? n]} contentStyle={tip.contentStyle} />
        </Treemap>
      </Frame>
    </div>
  );
}

/** Top customers by value, with the same customer's figure in the comparison period beside it. */
export function TopCustomers({ d, c }) {
  const L = useCmp();
  if (!d.rows.length) return <Empty />;
  const before = new Map((c?.rows ?? []).map((r) => [r.name, r.value]));
  const rows = d.rows.map((r) => ({ ...r, cmp: before.get(r.name) ?? 0 }));
  return (
    <Frame h={Math.max(H, rows.length * (c ? 50 : 34) + 40)}><BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
      <CartesianGrid stroke={GRID} horizontal={false} /><XAxis type="number" {...axis} tickFormatter={compact} /><YAxis type="category" dataKey="name" {...axis} width={120} />
      <Tooltip {...tip} />{c && <Legend {...legend} />}
      <Bar {...anim} dataKey="value" name="Sales" fill={SERIES[0]} radius={[0, 4, 4, 0]} />
      {c && <Bar {...anim} dataKey="cmp" name={L} fill={GHOST} fillOpacity={0.55} radius={[0, 4, 4, 0]} />}
    </BarChart></Frame>
  );
}

/** Sales and purchases month by month, each split into cash and credit. */
export function SalesPurchases({ d }) {
  return (
    <Frame><BarChart data={d.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={month} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} labelFormatter={month} /><Legend {...legend} />
      <Bar {...anim} dataKey="sales_cash" stackId="s" name="Cash sales" fill={SERIES[0]} stroke="var(--surface-card, #fff)" strokeWidth={1} />
      <Bar {...anim} dataKey="sales_credit" stackId="s" name="Credit sales" fill="#86b6ef" stroke="var(--surface-card, #fff)" strokeWidth={1} radius={[4, 4, 0, 0]} />
      <Bar {...anim} dataKey="purchases_cash" stackId="p" name="Cash purchases" fill={SERIES[1]} stroke="var(--surface-card, #fff)" strokeWidth={1} />
      <Bar {...anim} dataKey="purchases_credit" stackId="p" name="Credit purchases" fill="#f3b093" stroke="var(--surface-card, #fff)" strokeWidth={1} radius={[4, 4, 0, 0]} />
    </BarChart></Frame>
  );
}

/** Steps from one figure to another (profit waterfall, the outstanding build-up): rises green, falls red, totals in the main colour; with a comparison, each step says how it changed. */
export function Waterfall({ steps, cmpSteps }) {
  const rows = useMemo(() => {
    let run = 0;
    return steps.map((s) => {
      const from = s.total ? 0 : run;
      const to = s.total ? s.value : run + s.value;
      run = s.total ? s.value : to;
      return { name: s.name, value: s.value, range: [Math.min(from, to), Math.max(from, to)], kind: s.total ? 'total' : s.value >= 0 ? 'up' : 'down' };
    });
  }, [steps]);
  const before = new Map((cmpSteps ?? []).map((s) => [s.name, s.value]));
  return (
    <div>
      <Frame><BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...axis} interval={0} /><YAxis {...axis} tickFormatter={compact} width={48} />
        <Tooltip contentStyle={tip.contentStyle} formatter={(v, n, p) => [`${full(p.payload.value)}${before.has(p.payload.name) ? `  (before: ${full(before.get(p.payload.name))})` : ''}`, p.payload.name]} />
        <Bar {...anim} dataKey="range" radius={[4, 4, 4, 4]}>{rows.map((r) => <Cell key={r.name} fill={r.kind === 'total' ? SERIES[0] : r.kind === 'up' ? GOOD : BAD} />)}</Bar>
      </BarChart></Frame>
      {cmpSteps && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: '0.74rem', color: colors.textBody, marginTop: 6 }}>
          {steps.map((s) => <span key={s.name}>{s.name}: <Delta now={s.value} before={before.get(s.name)} lowerIsBetter={s.value < 0} /></span>)}
        </div>
      )}
    </div>
  );
}

/** What is owed to us and by us, by age. */
export function AgeingBars({ rows }) {
  return (
    <Frame><BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="bucket" {...axis} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} /><Legend {...legend} />
      <Bar {...anim} dataKey="receivables" name="Customers owe us" fill={SERIES[0]} radius={[4, 4, 0, 0]} /><Bar {...anim} dataKey="payables" name="We owe suppliers" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
    </BarChart></Frame>
  );
}

/** Each customer: how late (across), how much (up), how many bills (size). */
export function AgeingBubbles({ rows }) {
  if (!rows.length) return <Empty text="No customer owes anything." />;
  return (
    <Frame><ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
      <CartesianGrid stroke={GRID} /><XAxis type="number" dataKey="days" name="Days outstanding" {...axis} unit=" d" /><YAxis type="number" dataKey="amount" name="Owed" {...axis} tickFormatter={compact} width={48} />
      <ZAxis type="number" dataKey="bills" range={[60, 360]} name="Bills" />
      <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tip.contentStyle} content={({ payload }) => (payload?.length ? (
        <div style={{ ...tip.contentStyle, background: 'var(--surface-card, #fff)', padding: '6px 10px' }}><b>{payload[0].payload.name}</b><br />{full(payload[0].payload.amount)} owed · {payload[0].payload.days} days on average · {payload[0].payload.bills} bill(s)</div>
      ) : null)} />
      <Scatter {...anim} data={rows} fill={SERIES[0]} fillOpacity={0.55} stroke="var(--surface-card, #fff)" strokeWidth={2} />
    </ScatterChart></Frame>
  );
}

/** Assets stood against liabilities and equity, with how each changed when a second period is set beside it. */
export function AssetsVsClaims({ d, c }) {
  const rows = [{ name: 'What we have', assets: d.assets }, { name: 'Who it belongs to', liabilities: d.liabilities, equity: d.equity }];
  return (
    <div>
      <Frame><BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={compact} width={48} />
        <Tooltip {...tip} /><Legend {...legend} />
        <Bar {...anim} dataKey="assets" stackId="a" name="Assets" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
        <Bar {...anim} dataKey="liabilities" stackId="a" name="Liabilities" fill={SERIES[1]} stroke="var(--surface-card, #fff)" strokeWidth={2} />
        <Bar {...anim} dataKey="equity" stackId="a" name="Equity" fill={SERIES[2]} stroke="var(--surface-card, #fff)" strokeWidth={2} radius={[4, 4, 0, 0]} />
      </BarChart></Frame>
      {c && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: '0.74rem', color: colors.textBody, marginTop: 6 }}>
        <span>Assets: <Delta now={d.assets} before={c.assets} /></span><span>Liabilities: <Delta now={d.liabilities} before={c.liabilities} lowerIsBetter /></span><span>Equity: <Delta now={d.equity} before={c.equity} /></span>
      </div>}
    </div>
  );
}

/** Income and expenses as bars, profit as a line; the comparison period's profit is a dashed line over the same months by position. */
export function ProfitTrend({ d, c }) {
  const L = useCmp();
  const rows = zip(d.months, c?.months, (x) => ({ cmp: x.profit, cmpIncome: x.income, cmpExpenses: x.expenses, cmpMonth: x.month }));
  const few = Boolean(c) && rows.length <= 3;   // one or two months: a line cannot show, so the other period gets bars of its own
  return (
    <Frame><ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={monthTick(rows)} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} labelFormatter={monthTip} /><Legend {...legend} />
      <Bar {...anim} dataKey="income" name="Income" fill={SERIES[0]} radius={[4, 4, 0, 0]} /><Bar {...anim} dataKey="expenses" name="Expenses" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
      {few && <Bar {...anim} dataKey="cmpIncome" name={`Income, ${L}`} fill={SERIES[0]} fillOpacity={0.35} stroke={SERIES[0]} strokeDasharray="4 3" radius={[4, 4, 0, 0]} />}
      {few && <Bar {...anim} dataKey="cmpExpenses" name={`Expenses, ${L}`} fill={SERIES[1]} fillOpacity={0.35} stroke={SERIES[1]} strokeDasharray="4 3" radius={[4, 4, 0, 0]} />}
      <Line {...anim} type="monotone" dataKey="profit" name="Profit" stroke={SERIES[2]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-card, #fff)' }} />
      {c && <Line {...anim} type="monotone" dataKey="cmp" name={`Profit, ${L}`} stroke={GHOST} strokeWidth={2} strokeDasharray="5 4" dot={ghostDot} />}
    </ComposedChart></Frame>
  );
}

const SHADES = ['#cde2fb', '#9ec5f4', '#5598e7', '#256abf', '#104281'];

/** A calendar of the year: one square a day, darker the busier the day. */
export function ActivityCalendar({ d }) {
  const [hover, setHover] = useState(null);
  const cells = useMemo(() => {
    const by = Object.fromEntries(d.days.map((x) => [x.date, x]));
    const max = Math.max(1, ...d.days.map((x) => x.count));
    const start = new Date(`${d.from}T00:00:00`);
    const end = new Date(`${d.to}T00:00:00`);
    const out = [];
    const lead = (start.getDay() + 6) % 7;   // Monday first
    for (let t = new Date(start), i = 0; t <= end; t.setDate(t.getDate() + 1), i++) {
      const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      const x = by[key];
      out.push({ key, week: Math.floor((i + lead) / 7), day: (i + lead) % 7, count: x?.count ?? 0, amount: x?.amount ?? 0, level: x ? Math.min(4, 1 + Math.floor((x.count / max) * 3.99)) : 0 });
    }
    return out;
  }, [d]);
  const weeks = Math.max(...cells.map((c) => c.week)) + 1;
  const S = 13;
  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={weeks * (S + 3) + 4} height={7 * (S + 3) + 4} role="img" aria-label="Postings per day">
          {cells.map((c) => (
            <rect key={c.key} x={2 + c.week * (S + 3)} y={2 + c.day * (S + 3)} width={S} height={S} rx={3} fill={c.level ? SHADES[c.level] : '#eceae3'} stroke={hover === c.key ? colors.text : 'none'}
              style={MOTION ? { animation: `vis-pop 500ms ${Math.min(c.week * 12, 700)}ms backwards ease-out` } : undefined}
              onMouseEnter={() => setHover(c.key)} onMouseLeave={() => setHover(null)}><title>{`${c.key}: ${c.count} voucher(s), ${full(c.amount)}`}</title></rect>
          ))}
        </svg>
      </div>
      <style>{'@keyframes vis-pop { from { opacity: 0; } to { opacity: 1; } }'}</style>
      <div style={{ fontSize: '0.72rem', color: colors.textFaint, marginTop: 6 }}>{hover ? (() => { const c = cells.find((x) => x.key === hover); return `${c.key}: ${c.count} voucher(s), ${full(c.amount)}`; })() : 'Each square is a day; darker means more vouchers posted.'}</div>
    </div>
  );
}

/** How far each reconcilable account has been reconciled. */
export function ReconStatus({ d }) {
  if (!d.rows.length) return <Empty text="No account is set up for reconciliation yet." />;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {d.rows.map((r) => {
        const state = r.locked_to == null ? 'never' : r.days_behind > 45 ? 'late' : r.unmatched > 0 ? 'open' : 'ok';
        const color = { never: BAD, late: '#fab219', open: '#fab219', ok: GOOD }[state];
        const word = { never: 'Never reconciled', late: `Locked to ${r.locked_to} (${r.days_behind} days behind)`, open: `Locked to ${r.locked_to}`, ok: `Locked to ${r.locked_to}` }[state];
        return (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} aria-hidden />
            <span style={{ flex: 1, minWidth: 0 }}><b>{r.name}</b> <span style={{ color: colors.textMuted }}>{word}</span></span>
            <span style={{ color: r.unmatched ? colors.warningText : colors.textFaint }}>{r.unmatched ? `${r.unmatched} unmatched line(s)` : 'nothing waiting'}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── more charts ────────────────────────────────────────────────────────────

/** A number that counts up to its value (once, when it appears) unless motion is off. */
function CountUp({ value, format = compact }) {
  const [shown, setShown] = useState(MOTION ? 0 : value);
  useEffect(() => {
    if (!MOTION || value === null || value === undefined) { setShown(value); return undefined; }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 800);
      setShown(value * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown === null || shown === undefined ? '—' : format(shown)}</>;
}

/** Revenue, profit, cash and what is owed: a tile each, with a month by month line, and the change against the other period when there is one. */
export function Scorecard({ d, c }) {
  const before = new Map((c?.cards ?? []).map((x) => [x.key, x.value]));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
      {d.cards.map((k, i) => (
        <div key={k.key} style={{ border: `1px solid ${colors.tint(0.1)}`, borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
          <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{k.label}</div>
          <div style={{ fontSize: '1.35rem', fontWeight: 700, color: colors.text, fontVariantNumeric: 'tabular-nums' }}><CountUp value={k.value} /></div>
          {c && k.value !== null ? <Delta now={k.value} before={before.get(k.key)} lowerIsBetter={k.good === 'down'} /> : <span style={{ fontSize: '0.7rem', color: colors.textFaint }}>{k.note ?? ' '}</span>}
          {k.series.length > 1 && (
            <div style={{ height: 38, marginTop: 4 }}>
              <ResponsiveContainer><AreaChart data={k.series.map((v, n) => ({ n, v }))} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <Area {...anim} type="monotone" dataKey="v" stroke={SERIES[i % SERIES.length]} strokeWidth={2} fill={SERIES[i % SERIES.length]} fillOpacity={0.12} dot={false} />
              </AreaChart></ResponsiveContainer>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** One figure by month, with the other period's drawn dashed over it by position. */
export function MonthLine({ d, c, field, name, money = true }) {
  const L = useCmp();
  const rows = zip(d.months, c?.months, (x) => ({ cmp: x[field], cmpMonth: x.month }));
  return (
    <Frame><ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={monthTick(rows)} /><YAxis {...axis} tickFormatter={money ? compact : (v) => `${v}`} width={48} />
      <Tooltip {...tip} labelFormatter={monthTip} formatter={(v, n) => [money ? full(v) : v, n]} />{c && <Legend {...legend} />}
      <Area {...anim} type="monotone" dataKey={field} name={name} stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.12} dot={{ r: 3 }} />
      {c && <Line {...anim} type="monotone" dataKey="cmp" name={L} stroke={GHOST} strokeWidth={2} strokeDasharray="5 4" dot={ghostDot} />}
    </ComposedChart></Frame>
  );
}

/** Gross and net margin by month. */
export function Margins({ d, c }) {
  const L = useCmp();
  const rows = zip(d.months, c?.months, (x) => ({ cmpNet: x.net_pct, cmpGross: x.gross_pct, cmpMonth: x.month }));
  return (
    <div>
      <Frame><ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={monthTick(rows)} /><YAxis {...axis} tickFormatter={(v) => `${v}%`} width={44} />
        <Tooltip contentStyle={tip.contentStyle} labelFormatter={monthTip} formatter={(v, n) => [v === null ? '—' : `${v}%`, n]} /><Legend {...legend} />
        <Line {...anim} type="monotone" dataKey="gross_pct" name="Gross margin" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        <Line {...anim} type="monotone" dataKey="net_pct" name="Net margin" stroke={SERIES[2]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
        {c && <Line {...anim} type="monotone" dataKey="cmpGross" name={`Gross margin, ${L}`} stroke={SERIES[0]} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="5 4" dot={{ ...ghostDot, stroke: SERIES[0] }} connectNulls />}
        {c && <Line {...anim} type="monotone" dataKey="cmpNet" name={`Net margin, ${L}`} stroke={GHOST} strokeWidth={2} strokeDasharray="5 4" dot={ghostDot} connectNulls />}
      </ComposedChart></Frame>
      <div style={{ fontSize: '0.74rem', color: colors.textBody }}>Over the period: gross {d.gross_pct ?? '—'}%, net {d.net_pct ?? '—'}%.</div>
    </div>
  );
}

/** The biggest expense groups, stacked by month. */
export function ExpensesStacked({ d }) {
  if (!d.groups.length) return <Empty />;
  return (
    <Frame h={300}><BarChart data={d.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={month} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} labelFormatter={month} /><Legend {...legend} />
      {d.groups.map((g, i) => <Bar {...anim} key={g} dataKey={g} stackId="e" name={g} fill={g === 'Everything else' ? '#b4b2a9' : SERIES[i % SERIES.length]} stroke="var(--surface-card, #fff)" strokeWidth={1} />)}
    </BarChart></Frame>
  );
}

/** Each of the top customers' share of sales as a bar, and the running total as a line up to 100%. */
export function Concentration({ d }) {
  if (!d.rows.length) return <Empty />;
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.78rem', marginBottom: 6 }}>
        {[['Biggest customer', d.top1], ['Top 5', d.top5], ['Top 10', d.top10]].map(([l, v]) => <span key={l}><b style={{ fontSize: '1.05rem' }}><CountUp value={v} format={(x) => `${x.toFixed(1)}%`} /></b> <span style={{ color: colors.textFaint }}>{l}</span></span>)}
      </div>
      <Frame h={220}><ComposedChart data={d.rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="rank" {...axis} /><YAxis {...axis} tickFormatter={(v) => `${v}%`} width={44} domain={[0, 100]} />
        <Tooltip contentStyle={tip.contentStyle} formatter={(v, n) => [`${v}%`, n]} labelFormatter={(r) => d.rows[r - 1]?.name ?? r} /><Legend {...legend} />
        <Bar {...anim} dataKey="share" name="Share of sales" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
        <Line {...anim} type="monotone" dataKey="cumulative" name="Running total" stroke={SERIES[1]} strokeWidth={2} dot={{ r: 3 }} />
      </ComposedChart></Frame>
    </div>
  );
}

/** The items that sold for the most. */
export function TopItems({ d }) {
  if (!d.rows.length) return <Empty />;
  return (
    <Frame h={Math.max(H, d.rows.length * 34 + 40)}><BarChart data={d.rows} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
      <CartesianGrid stroke={GRID} horizontal={false} /><XAxis type="number" {...axis} tickFormatter={compact} /><YAxis type="category" dataKey="name" {...axis} width={130} />
      <Tooltip contentStyle={tip.contentStyle} formatter={(v, n, p) => [`${full(v)} · ${p.payload.qty} sold`, p.payload.name]} />
      <Bar {...anim} dataKey="value" name="Sales" fill={SERIES[2]} radius={[0, 4, 4, 0]} />
    </BarChart></Frame>
  );
}

/** Tax charged on sales against tax paid on purchases, by month, with the gap as a line. */
export function VatFlow({ d }) {
  return (
    <Frame><ComposedChart data={d.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={month} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} labelFormatter={month} /><Legend {...legend} />
      <Bar {...anim} dataKey="output" name="Charged on sales" fill={SERIES[0]} radius={[4, 4, 0, 0]} /><Bar {...anim} dataKey="input" name="Paid on purchases" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
      <Line {...anim} type="monotone" dataKey="net" name="Owed (the gap)" stroke={SERIES[2]} strokeWidth={2} dot={{ r: 3 }} />
    </ComposedChart></Frame>
  );
}

/** What is owed to us against what we owe, by the week it falls due; overdue first. */
export function DueChart({ d }) {
  const rows = [...d.buckets, ...((d.later.receivables || d.later.payables) ? [{ label: 'Later', receivables: d.later.receivables, payables: d.later.payables }] : [])];
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.78rem', marginBottom: 6 }}>
        <span><b style={{ fontSize: '1.05rem' }}><CountUp value={d.receivables} /></b> <span style={{ color: colors.textFaint }}>customers owe us</span></span>
        <span><b style={{ fontSize: '1.05rem' }}><CountUp value={d.payables} /></b> <span style={{ color: colors.textFaint }}>we owe suppliers</span></span>
        <span><b style={{ fontSize: '1.05rem', color: d.receivables - d.payables >= 0 ? colors.successText : colors.dangerText }}><CountUp value={d.receivables - d.payables} /></b> <span style={{ color: colors.textFaint }}>net</span></span>
      </div>
      <Frame><BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="label" {...axis} interval={0} tick={{ fill: AXIS, fontSize: 10 }} /><YAxis {...axis} tickFormatter={compact} width={48} />
        <Tooltip {...tip} /><Legend {...legend} />
        <Bar {...anim} dataKey="receivables" name="Customers owe us" fill={SERIES[0]} radius={[4, 4, 0, 0]} /><Bar {...anim} dataKey="payables" name="We owe suppliers" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
      </BarChart></Frame>
    </div>
  );
}

const SEVERITY = ['#0ca30c', '#eda100', '#eb6834', '#d03b3b', '#9b1c1c'];

/** What is late, by how late, coloured from green to red, with the customers furthest behind. */
export function Overdue({ d }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.78rem', marginBottom: 6 }}>
        <span><b style={{ fontSize: '1.05rem', color: colors.dangerText }}><CountUp value={d.late} /></b> <span style={{ color: colors.textFaint }}>late, {d.late_share}% of what is owed</span></span>
      </div>
      <Frame h={220}><BarChart data={d.buckets} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="bucket" {...axis} /><YAxis {...axis} tickFormatter={compact} width={48} />
        <Tooltip contentStyle={tip.contentStyle} formatter={(v, n, p) => [`${full(v)} · ${p.payload.customers} customer(s) · ${p.payload.share}%`, p.payload.bucket]} />
        <Bar {...anim} dataKey="amount" name="Owed" radius={[4, 4, 0, 0]}>{d.buckets.map((b, i) => <Cell key={b.bucket} fill={SEVERITY[Math.min(i, SEVERITY.length - 1)]} />)}</Bar>
      </BarChart></Frame>
      {d.worst.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', marginTop: 6 }}><tbody>
          {d.worst.map((w) => <tr key={w.name}><td style={{ padding: '3px 0' }}>{w.name}</td><td style={{ textAlign: 'right', color: colors.textFaint }}>{w.days} days late</td><td style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{full(w.overdue)}</td></tr>)}
        </tbody></table>
      )}
    </div>
  );
}

/** Days of sales customers owe, by month; lower is better. */
export function Collection({ d }) {
  return (
    <div>
      <div style={{ fontSize: '0.78rem', marginBottom: 6 }}><b style={{ fontSize: '1.05rem' }}><CountUp value={d.average} format={(x) => `${x.toFixed(0)} days`} /></b> <span style={{ color: colors.textFaint }}>on average</span></div>
      <Frame h={220}><ComposedChart data={d.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={month} /><YAxis {...axis} width={40} unit=" d" />
        <Tooltip contentStyle={tip.contentStyle} labelFormatter={month} formatter={(v) => [v === null ? '—' : `${v} days`, 'Owed']} />
        <Line {...anim} type="monotone" dataKey="days" name="Days of sales owed" stroke={SERIES[1]} strokeWidth={2} dot={{ r: 4 }} connectNulls />
      </ComposedChart></Frame>
    </div>
  );
}

/** What the stock ledgers hold at the end of each month. */
export function StockValue({ d }) {
  return <Frame><AreaChart data={d.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
    <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={month} /><YAxis {...axis} tickFormatter={compact} width={48} /><Tooltip {...tip} labelFormatter={month} />
    <Area {...anim} type="monotone" dataKey="value" name="Stock value" stroke={SERIES[6]} strokeWidth={2} fill={SERIES[6]} fillOpacity={0.14} dot={{ r: 3 }} />
  </AreaChart></Frame>;
}

/** Turns over the period and days of stock held, with the month by month line of days. */
export function Turnover({ d }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.78rem', marginBottom: 6 }}>
        <span><b style={{ fontSize: '1.05rem' }}><CountUp value={d.turns} format={(x) => `${x.toFixed(1)}×`} /></b> <span style={{ color: colors.textFaint }}>turns a year</span></span>
        <span><b style={{ fontSize: '1.05rem' }}><CountUp value={d.days_of_stock} format={(x) => `${x.toFixed(0)} days`} /></b> <span style={{ color: colors.textFaint }}>of stock held</span></span>
      </div>
      <Frame h={220}><ComposedChart data={d.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={month} /><YAxis {...axis} width={40} unit=" d" />
        <Tooltip contentStyle={tip.contentStyle} labelFormatter={month} formatter={(v, n) => [v === null ? '—' : `${v}`, n]} />
        <Line {...anim} type="monotone" dataKey="days_of_stock" name="Days of stock held" stroke={SERIES[6]} strokeWidth={2} dot={{ r: 4 }} connectNulls />
      </ComposedChart></Frame>
    </div>
  );
}

/** Stock on hand that has not gone out for the longest. */
export function SlowMovers({ d }) {
  if (!d.rows.length) return <Empty text="Every item with stock has moved." />;
  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.78rem', marginBottom: 6 }}>
        <span><b style={{ fontSize: '1.05rem', color: colors.warningText }}><CountUp value={d.tied_up} /></b> <span style={{ color: colors.textFaint }}>tied up in items unsold for 90+ days</span></span>
        {d.never_sold > 0 && <span><b>{d.never_sold}</b> <span style={{ color: colors.textFaint }}>never sold</span></span>}
      </div>
      <Frame h={Math.max(H, d.rows.length * 30 + 40)}><BarChart data={d.rows.map((r) => ({ ...r, days: r.days ?? 0 }))} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} /><XAxis type="number" {...axis} unit=" d" /><YAxis type="category" dataKey="name" {...axis} width={130} />
        <Tooltip contentStyle={tip.contentStyle} formatter={(v, n, p) => [`${p.payload.days === 0 && p.payload.days !== v ? '' : ''}${v} days since one went out · ${p.payload.qty} on hand · ${full(p.payload.value)}`, p.payload.name]} />
        <Bar {...anim} dataKey="days" name="Days since last out" fill={SERIES[3]} radius={[0, 4, 4, 0]} />
      </BarChart></Frame>
    </div>
  );
}

/** Matched, unmatched and unresolved amounts for each area. */
export function ReconAreas({ d }) {
  return (
    <div>
      <Frame h={260}><BarChart data={d.areas} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} /><XAxis type="number" {...axis} tickFormatter={compact} /><YAxis type="category" dataKey="area" {...axis} width={130} />
        <Tooltip {...tip} /><Legend {...legend} />
        <Bar {...anim} dataKey="matched" stackId="r" name="Matched" fill={GOOD} /><Bar {...anim} dataKey="unmatched" stackId="r" name="Unmatched" fill="#eda100" stroke="var(--surface-card, #fff)" strokeWidth={1} />
        <Bar {...anim} dataKey="unresolved" stackId="r" name="Unresolved" fill={BAD} stroke="var(--surface-card, #fff)" strokeWidth={1} radius={[0, 4, 4, 0]} />
      </BarChart></Frame>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: '0.74rem', color: colors.textBody }}>
        {d.areas.map((a) => <span key={a.area}>{a.area}: {a.reconciled} of {a.accounts} reconciled</span>)}
      </div>
    </div>
  );
}

/** Each budgeted expense against what was spent: the budget as a quiet bar, the spending beside it, red when it went over. Click an expense for its months. */
export function BudgetChart({ d }) {
  const [sel, setSel] = useState(null);
  const row = sel ? d.rows.find((r) => `${r.type}:${r.id}` === sel) : null;
  const t = d.totals;
  return (
    <div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.78rem', marginBottom: 8 }}>
        <span><b style={{ fontSize: '1.05rem' }}><CountUp value={t.budget} /></b> <span style={{ color: colors.textFaint }}>budgeted</span></span>
        <span><b style={{ fontSize: '1.05rem' }}><CountUp value={t.actual} /></b> <span style={{ color: colors.textFaint }}>spent{t.used_pct !== null ? `, ${t.used_pct}% of budget` : ''}</span></span>
        <span><b style={{ fontSize: '1.05rem', color: t.over_count ? colors.dangerText : colors.successText }}>{t.over_count}</b> <span style={{ color: colors.textFaint }}>over budget</span></span>
      </div>
      {row ? (
        <div>
          <button type="button" onClick={() => setSel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.primary, fontWeight: 600, fontFamily: 'inherit', fontSize: '0.78rem', padding: 0, marginBottom: 6 }}>‹ All expenses</button>
          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{row.name}</div>
          <Frame h={240}><BarChart data={row.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
            <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={month} /><YAxis {...axis} tickFormatter={compact} width={48} />
            <Tooltip {...tip} labelFormatter={month} /><Legend {...legend} />
            <Bar {...anim} dataKey="budget" name="Budget" fill={GHOST} fillOpacity={0.55} radius={[4, 4, 0, 0]} />
            <Bar {...anim} dataKey="actual" name="Spent" fill={SERIES[0]} radius={[4, 4, 0, 0]}>{row.months.map((m) => <Cell key={m.month} fill={m.budget > 0 && m.actual > m.budget ? BAD : SERIES[0]} />)}</Bar>
          </BarChart></Frame>
        </div>
      ) : (
        <Frame h={Math.max(H, d.rows.length * 52 + 50)}><BarChart data={d.rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barGap={2}
          onClick={(e) => { const n = e?.activePayload?.[0]?.payload; if (n) setSel(`${n.type}:${n.id}`); }}>
          <CartesianGrid stroke={GRID} horizontal={false} /><XAxis type="number" {...axis} tickFormatter={compact} /><YAxis type="category" dataKey="name" {...axis} width={130} />
          <Tooltip contentStyle={tip.contentStyle} formatter={(v, n, p) => [`${full(v)}${n === 'Spent' && p.payload.used_pct !== null ? `  (${p.payload.used_pct}% of budget)` : ''}`, n]} /><Legend {...legend} />
          <Bar {...anim} dataKey="budget" name="Budget" fill={GHOST} fillOpacity={0.55} radius={[0, 4, 4, 0]} style={{ cursor: 'pointer' }} />
          <Bar {...anim} dataKey="actual" name="Spent" fill={SERIES[0]} radius={[0, 4, 4, 0]} style={{ cursor: 'pointer' }}>{d.rows.map((r) => <Cell key={`${r.type}${r.id}`} fill={r.over ? BAD : SERIES[0]} />)}</Bar>
        </BarChart></Frame>
      )}
      {!row && <div style={{ fontSize: '0.72rem', color: colors.textFaint }}>Click an expense to see it month by month.</div>}
    </div>
  );
}

const GREEN_SOFT = '#7fd6a8';
const ORANGE_SOFT = '#f3b093';

/**
 * The next 90 days of cash by week. Money in and out are bars, solid where confirmed and lighter where it is an estimate; the lines are the cash balance with every
 * flow and with only the confirmed ones. A switch drops the estimates. The assumptions it runs on are listed beside it.
 */
export function CashForecast({ d, onPlanning }) {
  const [estimates, setEstimates] = useState(true);
  const weeks = useMemo(() => d.weeks.map((w) => ({ ...w, label: w.start.slice(5), out_confirmed_n: -w.out_confirmed, out_estimate_n: -w.out_estimate, line: estimates ? w.balance : w.confirmed_only })), [d.weeks, estimates]);
  const s = d.summary;
  const low = estimates ? s.lowest : s.lowest_confirmed_only;
  const runsOut = estimates ? s.shortfall_from : (d.days.find((x) => x.confirmed_only < 0)?.date ?? null);
  const tile = (label, value, tone) => <span key={label}><b style={{ fontSize: '1.05rem', color: tone }}>{value}</b> <span style={{ color: colors.textFaint }}>{label}</span></span>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(220px, 1fr)', gap: 18 }} className="vis-forecast">
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.78rem', marginBottom: 8, alignItems: 'baseline' }}>
          {tile('now', <CountUp value={d.opening} />)}
          {tile(`lowest, on ${low.date}`, <CountUp value={low.balance} />, low.balance < 0 ? colors.dangerText : undefined)}
          {tile(estimates ? 'in 90 days' : 'in 90 days, confirmed only', <CountUp value={estimates ? s.closing : s.closing_confirmed_only} />)}
          {runsOut ? <b style={{ color: colors.dangerText }}>Cash runs out on {runsOut}</b> : <b style={{ color: colors.successText }}>Stays above zero</b>}
        </div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', marginBottom: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={estimates} onChange={(e) => setEstimates(e.target.checked)} /> Include estimates
        </label>
        <Frame h={300}><ComposedChart data={weeks} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} stackOffset="sign">
          <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="label" {...axis} interval={1} /><YAxis {...axis} tickFormatter={compact} width={52} />
          <Tooltip contentStyle={tip.contentStyle} labelFormatter={(l, p) => (p?.[0] ? `Week of ${p[0].payload.start}` : l)} formatter={(v, n) => [full(Math.abs(v)), n]} /><Legend {...legend} />
          <ReferenceLine y={0} stroke={BAD} strokeDasharray="4 4" />
          <Bar {...anim} dataKey="in_confirmed" stackId="f" name="In, confirmed" fill={GOOD} />
          {estimates && <Bar {...anim} dataKey="in_estimate" stackId="f" name="In, estimate" fill={GREEN_SOFT} />}
          <Bar {...anim} dataKey="out_confirmed_n" stackId="f" name="Out, confirmed" fill={SERIES[1]} />
          {estimates && <Bar {...anim} dataKey="out_estimate_n" stackId="f" name="Out, estimate" fill={ORANGE_SOFT} />}
          <Line {...anim} type="monotone" dataKey="line" name={estimates ? 'Cash balance' : 'Cash balance, confirmed only'} stroke={SERIES[0]} strokeWidth={3} dot={{ r: 3 }} />
          {estimates && <Line {...anim} type="monotone" dataKey="confirmed_only" name="Cash balance, confirmed only" stroke={GHOST} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
        </ComposedChart></Frame>
      </div>
      <aside aria-label="Forecast assumptions" style={{ minWidth: 0, borderLeft: `1px solid ${colors.tint(0.08)}`, paddingLeft: 16 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textFaint, marginBottom: 6 }}>What this assumes</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {d.assumptions.map((a) => (
            <div key={a.key} style={{ fontSize: '0.76rem', lineHeight: 1.45 }}>
              <div><b>{a.label}</b> <span style={{ color: colors.textMuted }}>{a.value}</span></div>
              <div style={{ color: colors.textFaint }}>{a.detail}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: '0.72rem', color: colors.textBody }}>
          <div>Confirmed out: <b>{full(s.out_confirmed)}</b> · estimated out: <b>{full(s.out_estimate)}</b></div>
          <div>Confirmed in: <b>{full(s.in_confirmed)}</b> · estimated in: <b>{full(s.in_estimate)}</b></div>
        </div>
        {onPlanning && <button type="button" onClick={onPlanning} style={{ marginTop: 10, background: 'none', border: 'none', color: colors.primary, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.76rem', fontWeight: 600, padding: 0 }}>Change the assumptions and regular items →</button>}
      </aside>
      <style>{'@media (max-width: 800px) { .vis-forecast { grid-template-columns: minmax(0, 1fr) !important; } .vis-forecast aside { border-left: 0 !important; padding-left: 0 !important; } }'}</style>
    </div>
  );
}
