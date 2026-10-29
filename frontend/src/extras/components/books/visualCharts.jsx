import { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, Treemap, XAxis, YAxis, ZAxis,
} from 'recharts';
import { colors } from '../../../_shared/theme/tokens';
import { change } from './visualPeriods';
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

/** Lay two series side by side by position (first with first), so a period can be set against another of a different length. */
const zip = (a, b, map) => Array.from({ length: Math.max(a.length, b?.length ?? 0) }, (_, i) => ({ ...(a[i] ?? {}), ...(b?.[i] ? map(b[i]) : {}), _i: i }));

/** How much more or less, as a small coloured chip ("up" is good unless `lowerIsBetter`). */
export function Delta({ now, before, lowerIsBetter = false }) {
  const c = change(now, before);
  if (c === null) return <span style={{ color: colors.textFaint, fontSize: '0.72rem' }}>no earlier figure</span>;
  const up = c >= 0;
  const good = lowerIsBetter ? !up : up;
  return <span style={{ color: good ? colors.successText : colors.dangerText, fontSize: '0.72rem', fontWeight: 700 }}>{up ? '▲' : '▼'} {Math.abs(c).toFixed(1)}%</span>;
}

/** Running cash balance, with the comparison period's balance as a dashed line. */
export function CashLine({ d, c }) {
  if (!d.series.length) return <Empty />;
  const rows = zip(d.series, c?.series, (x) => ({ cmp: x.balance }));
  return (
    <Frame><ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="bucket" {...axis} minTickGap={32} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} />{c && <Legend {...legend} />}
      <Area {...anim} type="monotone" dataKey="balance" name="Cash and bank balance" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.12} dot={false} />
      {c && <Line {...anim} type="monotone" dataKey="cmp" name="Earlier period" stroke={GHOST} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
    </ComposedChart></Frame>
  );
}

/** Money in against money out, with the comparison period's as dashed lines. */
export function MoneyInOut({ d, c }) {
  if (!d.series.length) return <Empty />;
  const rows = zip(d.series, c?.series, (x) => ({ cmpIn: x.in, cmpOut: x.out }));
  return (
    <Frame><ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="bucket" {...axis} minTickGap={32} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} /><Legend {...legend} />
      <Bar {...anim} dataKey="in" name="Money in" fill={SERIES[2]} radius={[4, 4, 0, 0]} /><Bar {...anim} dataKey="out" name="Money out" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
      {c && <Line {...anim} type="monotone" dataKey="cmpIn" name="Earlier: in" stroke={SERIES[2]} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
      {c && <Line {...anim} type="monotone" dataKey="cmpOut" name="Earlier: out" stroke={SERIES[1]} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
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
  if (!d.rows.length) return <Empty />;
  const before = new Map((c?.rows ?? []).map((r) => [r.name, r.value]));
  const rows = d.rows.map((r) => ({ ...r, cmp: before.get(r.name) ?? 0 }));
  return (
    <Frame h={Math.max(H, rows.length * (c ? 50 : 34) + 40)}><BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
      <CartesianGrid stroke={GRID} horizontal={false} /><XAxis type="number" {...axis} tickFormatter={compact} /><YAxis type="category" dataKey="name" {...axis} width={120} />
      <Tooltip {...tip} />{c && <Legend {...legend} />}
      <Bar {...anim} dataKey="value" name="Sales" fill={SERIES[0]} radius={[0, 4, 4, 0]} />
      {c && <Bar {...anim} dataKey="cmp" name="Earlier period" fill={GHOST} fillOpacity={0.55} radius={[0, 4, 4, 0]} />}
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
  const rows = zip(d.months, c?.months, (x) => ({ cmp: x.profit }));
  return (
    <Frame><ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={month} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} labelFormatter={month} /><Legend {...legend} />
      <Bar {...anim} dataKey="income" name="Income" fill={SERIES[0]} radius={[4, 4, 0, 0]} /><Bar {...anim} dataKey="expenses" name="Expenses" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
      <Line {...anim} type="monotone" dataKey="profit" name="Profit" stroke={SERIES[2]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-card, #fff)' }} />
      {c && <Line {...anim} type="monotone" dataKey="cmp" name="Profit, earlier period" stroke={GHOST} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
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
