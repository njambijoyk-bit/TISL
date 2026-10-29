import { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, Treemap, XAxis, YAxis, ZAxis,
} from 'recharts';
import { colors } from '../../../_shared/theme/tokens';

/** Categorical colours in a fixed order (never cycled): a colour belongs to the thing it names, not to its rank. */
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const GOOD = '#0ca30c';
const BAD = '#d03b3b';
const GRID = '#e1e0d9';
const AXIS = '#898781';

const compact = (n) => {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  return `${Math.round(v)}`;
};
const full = (n) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const axis = { tick: { fill: AXIS, fontSize: 11 }, axisLine: { stroke: GRID }, tickLine: false };
const tip = { formatter: (v, name) => [full(v), name], contentStyle: { borderRadius: 8, border: `1px solid ${GRID}`, fontSize: 12 } };
const H = 260;
const legend = { iconType: 'square', wrapperStyle: { fontSize: 12 }, formatter: (v) => <span style={{ color: colors.textBody }}>{v}</span> };   // text in ink; the square carries the colour
const still = { isAnimationActive: false };

const Frame = ({ children, h = H }) => <div style={{ width: '100%', height: h }}><ResponsiveContainer>{children}</ResponsiveContainer></div>;
const Empty = ({ text = 'Nothing to show for this period.' }) => <div style={{ padding: '36px 0', textAlign: 'center', fontSize: '0.8rem', color: colors.textFaint }}>{text}</div>;
const month = (m) => { const [y, mm] = String(m).split('-'); return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mm) - 1] + (mm === '01' ? ` ${y.slice(2)}` : ''); };

/** Running cash balance. */
export function CashLine({ d }) {
  if (!d.series.length) return <Empty />;
  return (
    <Frame><AreaChart data={d.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="bucket" {...axis} minTickGap={32} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} /><Area {...still} type="monotone" dataKey="balance" name="Cash and bank balance" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.12} dot={false} />
    </AreaChart></Frame>
  );
}

/** Money in against money out, by day, week or month. */
export function MoneyInOut({ d }) {
  if (!d.series.length) return <Empty />;
  return (
    <Frame><BarChart data={d.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="bucket" {...axis} minTickGap={32} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} /><Legend {...legend} />
      <Bar {...still} dataKey="in" name="Money in" fill={SERIES[2]} radius={[4, 4, 0, 0]} /><Bar {...still} dataKey="out" name="Money out" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
    </BarChart></Frame>
  );
}

/** Each cash and bank account: in, out and where it ended. */
export function AccountBars({ d }) {
  if (!d.accounts.length) return <Empty />;
  return (
    <Frame h={Math.max(H, d.accounts.length * 46 + 60)}><BarChart data={d.accounts} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }} barGap={2}>
      <CartesianGrid stroke={GRID} horizontal={false} /><XAxis type="number" {...axis} tickFormatter={compact} /><YAxis type="category" dataKey="name" {...axis} width={110} />
      <Tooltip {...tip} /><Legend {...legend} />
      <Bar {...still} dataKey="in" name="In" fill={SERIES[2]} radius={[0, 4, 4, 0]} /><Bar {...still} dataKey="out" name="Out" fill={SERIES[1]} radius={[0, 4, 4, 0]} /><Bar {...still} dataKey="closing" name="Balance at the end" fill={SERIES[0]} radius={[0, 4, 4, 0]} />
    </BarChart></Frame>
  );
}

/** Where the expenses went: the biggest groups, the rest folded into one slice. */
export function ExpenseDonut({ d }) {
  if (!d.donut.length) return <Empty />;
  return (
    <Frame><PieChart>
      <Pie {...still} data={d.donut} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} stroke="var(--surface-card, #fff)" strokeWidth={2}>
        {d.donut.map((x, i) => <Cell key={x.name} fill={x.name === 'Everything else' ? '#b4b2a9' : SERIES[i % SERIES.length]} />)}
      </Pie>
      <Tooltip {...tip} /><Legend {...legend} />
    </PieChart></Frame>
  );
}

const sizeOf = (n) => (n.children ? n.children.reduce((t, c) => t + sizeOf(c), 0) : n.size);

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

/** A treemap of groups and their ledgers, one level at a time: click a group to go into it, click its name in the trail to come back. Each top group keeps its own colour. */
export function GroupTreemap({ tree }) {
  const [path, setPath] = useState([]);
  const names = useMemo(() => tree.map((g) => g.name), [tree]);
  if (!tree.length) return <Empty />;
  let level = tree;
  const trail = [];
  for (const step of path) {
    const next = level.find((n) => n.name === step && n.children);
    if (!next) break;
    trail.push(next.name);
    level = next.children;
  }
  const top = trail.length ? names.indexOf(trail[0]) : -1;
  const data = level.map((n, i) => ({ name: n.name, size: Math.max(sizeOf(n), 0.01), amount: sizeOf(n), opens: Boolean(n.children), color: SERIES[(top >= 0 ? top : i) % SERIES.length] }));
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: '0.78rem', marginBottom: 8 }}>
        <button type="button" onClick={() => setPath([])} style={{ background: 'none', border: 'none', padding: 0, cursor: trail.length ? 'pointer' : 'default', color: trail.length ? colors.primary : colors.text, fontWeight: 600 }}>All</button>
        {trail.map((t, i) => (
          <span key={t}>› <button type="button" onClick={() => setPath(trail.slice(0, i + 1))} style={{ background: 'none', border: 'none', padding: 0, cursor: i < trail.length - 1 ? 'pointer' : 'default', color: i < trail.length - 1 ? colors.primary : colors.text, fontWeight: 600 }}>{t}</button></span>
        ))}
        {data.some((d) => d.opens) && <span style={{ color: colors.textFaint }}>· click a group marked › to open it</span>}
      </div>
      <Frame h={300}>
        <Treemap data={data} dataKey="size" aspectRatio={4 / 3} isAnimationActive={false} onClick={(n) => { if (n?.opens) setPath([...trail, n.name]); }} content={<TreeCell />}>
          <Tooltip formatter={(v, n, p) => [full(p?.payload?.amount ?? v), p?.payload?.name ?? n]} contentStyle={tip.contentStyle} />
        </Treemap>
      </Frame>
    </div>
  );
}

/** Top customers by value. */
export function TopCustomers({ d }) {
  if (!d.rows.length) return <Empty />;
  return (
    <Frame h={Math.max(H, d.rows.length * 34 + 40)}><BarChart data={d.rows} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
      <CartesianGrid stroke={GRID} horizontal={false} /><XAxis type="number" {...axis} tickFormatter={compact} /><YAxis type="category" dataKey="name" {...axis} width={120} />
      <Tooltip {...tip} /><Bar {...still} dataKey="value" name="Sales" fill={SERIES[0]} radius={[0, 4, 4, 0]} />
    </BarChart></Frame>
  );
}

/** Sales and purchases month by month, each split into cash and credit. */
export function SalesPurchases({ d }) {
  return (
    <Frame><BarChart data={d.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={month} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} labelFormatter={month} /><Legend {...legend} />
      <Bar {...still} dataKey="sales_cash" stackId="s" name="Cash sales" fill={SERIES[0]} stroke="var(--surface-card, #fff)" strokeWidth={1} />
      <Bar {...still} dataKey="sales_credit" stackId="s" name="Credit sales" fill="#86b6ef" stroke="var(--surface-card, #fff)" strokeWidth={1} radius={[4, 4, 0, 0]} />
      <Bar {...still} dataKey="purchases_cash" stackId="p" name="Cash purchases" fill={SERIES[1]} stroke="var(--surface-card, #fff)" strokeWidth={1} />
      <Bar {...still} dataKey="purchases_credit" stackId="p" name="Credit purchases" fill="#f3b093" stroke="var(--surface-card, #fff)" strokeWidth={1} radius={[4, 4, 0, 0]} />
    </BarChart></Frame>
  );
}

/** Steps from one figure to another (profit waterfall, the outstanding build-up): rises green, falls red, totals in the main colour. */
export function Waterfall({ steps }) {
  const rows = useMemo(() => {
    let run = 0;
    return steps.map((s) => {
      const from = s.total ? 0 : run;
      const to = s.total ? s.value : run + s.value;
      run = s.total ? s.value : to;
      return { name: s.name, value: s.value, range: [Math.min(from, to), Math.max(from, to)], kind: s.total ? 'total' : s.value >= 0 ? 'up' : 'down' };
    });
  }, [steps]);
  return (
    <Frame><BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...axis} interval={0} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip contentStyle={tip.contentStyle} formatter={(v, n, p) => [full(p.payload.value), p.payload.name]} />
      <Bar {...still} dataKey="range" radius={[4, 4, 4, 4]}>{rows.map((r) => <Cell key={r.name} fill={r.kind === 'total' ? SERIES[0] : r.kind === 'up' ? GOOD : BAD} />)}</Bar>
    </BarChart></Frame>
  );
}

/** What is owed to us and by us, by age. */
export function AgeingBars({ rows }) {
  return (
    <Frame><BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="bucket" {...axis} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} /><Legend {...legend} />
      <Bar {...still} dataKey="receivables" name="Customers owe us" fill={SERIES[0]} radius={[4, 4, 0, 0]} /><Bar {...still} dataKey="payables" name="We owe suppliers" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
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
      <Scatter {...still} data={rows} fill={SERIES[0]} fillOpacity={0.55} stroke="var(--surface-card, #fff)" strokeWidth={2} />
    </ScatterChart></Frame>
  );
}

/** Assets stood against liabilities and equity. */
export function AssetsVsClaims({ d }) {
  const rows = [{ name: 'What we have', assets: d.assets }, { name: 'Who it belongs to', liabilities: d.liabilities, equity: d.equity }];
  return (
    <Frame><BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} /><Legend {...legend} />
      <Bar {...still} dataKey="assets" stackId="a" name="Assets" fill={SERIES[0]} radius={[4, 4, 0, 0]} />
      <Bar {...still} dataKey="liabilities" stackId="a" name="Liabilities" fill={SERIES[1]} stroke="var(--surface-card, #fff)" strokeWidth={2} />
      <Bar {...still} dataKey="equity" stackId="a" name="Equity" fill={SERIES[2]} stroke="var(--surface-card, #fff)" strokeWidth={2} radius={[4, 4, 0, 0]} />
    </BarChart></Frame>
  );
}

/** Income and expenses as bars, profit as a line. */
export function ProfitTrend({ d }) {
  return (
    <Frame><ComposedChart data={d.months} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
      <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="month" {...axis} tickFormatter={month} /><YAxis {...axis} tickFormatter={compact} width={48} />
      <Tooltip {...tip} labelFormatter={month} /><Legend {...legend} />
      <Bar {...still} dataKey="income" name="Income" fill={SERIES[0]} radius={[4, 4, 0, 0]} /><Bar {...still} dataKey="expenses" name="Expenses" fill={SERIES[1]} radius={[4, 4, 0, 0]} />
      <Line {...still} type="monotone" dataKey="profit" name="Profit" stroke={SERIES[2]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-card, #fff)' }} />
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
              onMouseEnter={() => setHover(c.key)} onMouseLeave={() => setHover(null)}><title>{`${c.key}: ${c.count} voucher(s), ${full(c.amount)}`}</title></rect>
          ))}
        </svg>
      </div>
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
