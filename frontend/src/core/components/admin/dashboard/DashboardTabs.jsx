import { useEffect, useState } from 'react';
import useCalculatorContext from '../../../../_shared/hooks/useCalculatorContext';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, colors } from '../../../../_shared/theme/tokens';
import { money, filterStyle, yearStart, today } from '../books/booksFmt';

const LINES = ['#3b82f6', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6'];
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 14, alignItems: 'start' };

function Tile({ title, sub, children }) {
  return (
    <div style={{ ...card, padding: 16, minWidth: 0 }}>
      <div style={{ fontWeight: 800, fontSize: '1rem' }}>{title}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginBottom: 8 }}>{sub}</div>}
      {children}
    </div>
  );
}

function Rows({ head, rows, empty = 'Nothing to show for this period.' }) {
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, borderBottom: `1px solid ${colors.tint(0.08)}`, paddingBottom: 4 }}>
        <span>Particulars</span><span>{head}</span>
      </div>
      {rows.length ? rows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: '0.8rem', padding: '5px 0' }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r[0]}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{r[1]}</span>
        </div>
      )) : <div style={{ fontSize: '0.78rem', color: colors.textMuted, padding: '10px 0' }}>{empty}</div>}
    </div>
  );
}

function Trend({ series }) {
  // series: [{name, points:[{label,value}]}]
  const data = series[0].points.map((p, i) => ({ label: p.label, ...Object.fromEntries(series.map((s) => [s.name, s.points[i]?.value ?? 0])) }));
  return (
    <div style={{ height: 230, width: '100%', minWidth: 0 }}>
      <ResponsiveContainer width="100%" height={230} minWidth={0}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={colors.tint(0.06)} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : v)} />
          <Tooltip formatter={(v) => money(v)} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
          {series.map((s, i) => <Line key={s.name} type="monotone" dataKey={s.name} stroke={LINES[i % LINES.length]} strokeWidth={2} dot={{ r: 2.5 }} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RestatedNote({ n }) {
  return n > 0 ? <div style={{ ...card, padding: '8px 12px', marginBottom: 10, fontSize: '0.76rem', color: colors.warningText }}>{n} voucher{n === 1 ? ' was' : 's were'} made under a different base currency and {n === 1 ? 'is' : 'are'} shown at today's rate.</div> : null;
}

function Side({ d }) {
  const range = `${d.from} to ${d.to}`;
  const sales = d.side === 'sales';
  const what = sales ? 'Sales' : 'Purchase';
  return (
    <>
      <RestatedNote n={d.restated_vouchers} />
      <div style={grid}>
        <Tile title={`${what} trend`} sub={range}><Trend series={[{ name: 'Nett transactions', points: d.trend }]} /></Tile>
        {d.group_trend.length > 0 && <Tile title="Group trend" sub={`for ${sales ? 'sales' : 'purchase'} accounts`}><Trend series={d.group_trend.map((g) => ({ name: g.ledger, points: g.points }))} /></Tile>}
        <Tile title="Trading details" sub={range}><Rows head="Amount" rows={d.trading.map((t) => [t.label, money(t.value)])} /></Tile>
        <Tile title="Cash/bank accounts" sub={`to ${d.to}`}><Rows head="Closing balance" rows={d.cash_bank.map((t) => [t.label, `${money(t.value)} Dr`])} /></Tile>
        <Tile title={`Top ${sales ? 'sales' : 'purchase'} orders outstanding`} sub="items not yet invoiced"><Rows head="Pending quantity" rows={d.top_orders.map((t) => [t.item, t.quantity])} empty="No open orders." /></Tile>
        <Tile title="Top items" sub={`${range} · ${d.top_items_label}`}><Rows head="Value" rows={d.top_items.map((t) => [t.item, money(t.value)])} /></Tile>
        <Tile title={sales ? 'Receivables' : 'Payables'} sub={`to ${d.to}`}>
          <Rows head="Pending amount" rows={[[d.open.label, money(d.open.total)], [`Overdue ${d.open.label.toLowerCase()}`, money(d.open.overdue)]]} />
        </Tile>
        <Tile title="Accounting ratios" sub={range}><Rows head="" rows={d.ratios.map((r) => [r.label, r.value === null ? '—' : `${r.value} ${r.unit}`.trim()])} /></Tile>
      </div>
    </>
  );
}

function Pending({ d }) {
  const sect = (title, rows, fmt = (r) => money(r.amount)) => (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontWeight: 800, fontSize: '0.85rem', textDecoration: 'underline', textUnderlineOffset: 4 }}>{title}</div>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'flex', alignItems: 'center', padding: '8px 10px', fontSize: '0.85rem', borderBottom: `1px solid ${colors.tint(0.05)}` }}>
          <span style={{ flex: 1 }}>{r.label}</span>
          <span style={{ width: 90, textAlign: 'right', color: colors.textMuted }}>{r.count}</span>
          <span style={{ width: 150, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(r)}</span>
        </div>
      ))}
    </div>
  );
  return (
    <>
      <RestatedNote n={d.restated_vouchers} />
      <div style={{ ...card, padding: 16, maxWidth: 760 }}>
        <div style={{ display: 'flex', fontSize: '0.7rem', fontWeight: 700, color: colors.textFaint, padding: '0 10px' }}>
          <span style={{ flex: 1 }}>Particulars</span><span style={{ width: 90, textAlign: 'right' }}>Documents</span><span style={{ width: 150, textAlign: 'right' }}>Amount</span>
        </div>
        {sect('Pending orders', d.orders)}
        {sect('Pending bills', d.notes)}
        {sect('Outstandings', d.outstanding, (r) => `${money(r.amount)} ${r.side}`)}
        <div style={{ fontSize: '0.7rem', color: colors.textMuted, marginTop: 12 }}>Orders count what is still not invoiced; delivery and receipt notes count those with no invoice yet; outstandings are open bills.</div>
      </div>
    </>
  );
}

function Funnels({ d }) {
  return (
    <>
      <RestatedNote n={d.restated_vouchers} />
      <div style={grid}>
        {d.funnels.map((f) => (
          <Tile key={f.key} title={f.title} sub={`${d.from} to ${d.to} · documents that started in the period`}>
            {f.stages.map((s, i) => (
              <div key={s.label} style={{ margin: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                  <span style={{ fontWeight: 600 }}>{s.label}</span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{s.count} · {money(s.value)}</span>
                </div>
                <div style={{ height: 10, background: colors.tint(0.06), borderRadius: 6, marginTop: 3 }}>
                  <div style={{ width: `${Math.max(s.percent, s.count ? 2 : 0)}%`, height: '100%', background: LINES[0], borderRadius: 6, opacity: 1 - i * 0.12 }} />
                </div>
                <div style={{ fontSize: '0.66rem', color: colors.textMuted, marginTop: 2 }}>{s.percent}% of the first stage{i > 0 && s.dropped > 0 ? ` · ${s.dropped} dropped off here` : ''}</div>
              </div>
            ))}
          </Tile>
        ))}
      </div>
    </>
  );
}

function Stock({ d }) {
  const range = `${d.from} to ${d.to}`;
  const n = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 4 });
  const stat = (label, value, color) => (
    <div style={{ ...card, padding: '12px 16px', minWidth: 150 }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '1.15rem', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        {stat('Stock value', money(d.totals.closing), d.totals.closing < 0 ? '#b91c1c' : undefined)}
        {stat('Opening', money(d.totals.opening))}
        {stat('Stock in', money(d.totals.inward))}
        {stat('Stock out', money(d.totals.outward))}
        {stat('Items in stock', `${d.counts.in_stock} of ${d.counts.items}`)}
        {d.counts.negative > 0 && stat('Below zero', d.counts.negative, '#b91c1c')}
        {d.counts.no_cost > 0 && stat('No cost', d.counts.no_cost, '#92400e')}
        <Link to="/admin/stock/reports" style={{ alignSelf: 'center', marginLeft: 'auto', fontWeight: 700, fontSize: '0.82rem' }}>Open the stock reports →</Link>
      </div>
      <div style={grid}>
        <Tile title="Stock movement" sub={`${range} · in and out, and what the stock was worth`}><Trend series={d.trend} /></Tile>
        <Tile title="Value by group" sub={`to ${d.to}`}><Rows head="Closing value" rows={d.groups.map((g) => [`${g.name} (${g.items})`, money(g.value)])} empty="No stock." /></Tile>
        <Tile title="Top items by value" sub={`to ${d.to}`}><Rows head="Quantity · value" rows={d.top_items.map((t) => [t.item, `${n(t.quantity)}${t.unit ? ` ${t.unit}` : ''} · ${money(t.value)}`])} empty="No stock." /></Tile>
        <Tile title="What moved the stock" sub={range}><Rows head="Quantity · value" rows={d.kinds.map((k) => [`${k.label} (${k.movements})`, `${n(k.quantity)} · ${money(k.value)}`])} /></Tile>
        <Tile title="Needs a look" sub="below zero or held at no cost"><Rows head="Quantity" rows={d.attention.map((a) => [`${a.item} — ${a.issue}`, `${n(a.quantity)}${a.unit ? ` ${a.unit}` : ''}`])} empty="Nothing — every item has stock and a cost." /></Tile>
      </div>
    </>
  );
}

const TABS = [['sales', 'Sales'], ['purchases', 'Purchases'], ['stock', 'Stock'], ['pending', 'Pending documents'], ['funnels', 'Funnels']];

export default function DashboardTabs() {
  useCalculatorContext({ type: 'branches' });   // Alt+C: how the branches compare
  const [tab, setTab] = useState('sales');
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [loaded, setLoaded] = useState(null);   // { tab, data }: a tab never renders another tab's figures
  const [error, setError] = useState('');

  const data = loaded && loaded.tab === tab ? loaded.data : null;

  useEffect(() => {
    let live = true;
    setLoaded(null); setError('');
    booksAPI.dashboard(tab, { from, to }).then((r) => { if (live) setLoaded({ tab, data: r }); }).catch((e) => { if (live) setError(errMsg(e)); });
    return () => { live = false; };
  }, [tab, from, to]);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '16px 0 12px' }}>
        {TABS.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ padding: '7px 14px', borderRadius: 999, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${tab === k ? colors.primary : colors.tint(0.15)}`, background: tab === k ? colors.tint(0.08) : 'transparent', color: tab === k ? colors.primaryDeep : colors.textMuted }}>{label}</button>
        ))}
        {tab !== 'pending' && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.75rem', color: colors.textMuted }}>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={filterStyle} />to
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={filterStyle} />
          </span>
        )}
      </div>
      {error && <div style={{ color: colors.danger ?? '#b91c1c', fontSize: '0.85rem' }}>{error}</div>}
      {!data && !error && <div style={{ color: colors.textMuted, padding: 30, textAlign: 'center' }}>Loading…</div>}
      {data && (tab === 'pending' ? <Pending d={data} /> : tab === 'funnels' ? <Funnels d={data} /> : tab === 'stock' ? <Stock d={data} /> : <Side d={data} />)}
    </div>
  );
}
