import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer, Sankey } from 'recharts';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, colors } from '../../../../_shared/theme/tokens';
import { money, filterStyle, monthStart, today } from './booksFmt';

const IN = '#10b981';
const OUT = '#ef4444';
const AXIS = { fill: 'var(--text-tertiary)', fontSize: 11 };
const short = (n) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(Math.round(n)));
const label = (name) => name.replace(/^(in|acc|out):/, '');
const tint = (name) => (name.startsWith('in:') ? IN : name.startsWith('out:') ? OUT : 'var(--color-primary-500)');

export function FlowNode({ x, y, width, height, payload, containerWidth }) {
  const left = x < containerWidth / 2;
  const mid = payload.name.startsWith('acc:');
  return (
    <g>
      <rect x={x} y={y} width={width} height={Math.max(height, 2)} rx={2} style={{ fill: tint(payload.name) }} />
      <text x={mid ? x + width / 2 : left ? x + width + 8 : x - 8} y={mid ? y - 6 : y + height / 2} textAnchor={mid ? 'middle' : left ? 'start' : 'end'} dominantBaseline={mid ? 'auto' : 'middle'}
        style={{ fill: 'var(--text-primary)', fontSize: 12 }}>
        {label(payload.name)} <tspan style={{ fill: 'var(--text-tertiary)' }}>{short(payload.value)}</tspan>
      </text>
    </g>
  );
}

export function FlowLink({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload }) {
  const colour = tint(payload.source.name.startsWith('acc:') ? payload.target.name : payload.source.name);
  return (
    <path d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`} fill="none" strokeWidth={Math.max(linkWidth, 1)}
      style={{ stroke: colour, strokeOpacity: 0.28 }} />
  );
}

/** Money movement: what came into and went out of the cash and bank accounts, as bars over time and as a flow from who it came from, through the accounts, to where it went. */
export default function MoneyFlow({ accounts = [] }) {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [ledgerId, setLedgerId] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setBusy(true);
    booksAPI.moneyFlow({ from, to, ledger_id: ledgerId || undefined })
      .then((d) => { if (live) setData(d); }).catch((e) => toast.error(errMsg(e, 'Could not load the money movement')))
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [from, to, ledgerId]);

  const sankey = useMemo(() => {
    if (!data || data.flows.length === 0) return null;
    const idx = new Map();
    const nodes = [];
    const node = (name) => { if (!idx.has(name)) { idx.set(name, nodes.length); nodes.push({ name }); } return idx.get(name); };
    const links = data.flows.filter((f) => f.amount > 0).map((f) => (f.direction === 'in'
      ? { source: node(`in:${f.group}`), target: node(`acc:${f.account}`), value: f.amount }
      : { source: node(`acc:${f.account}`), target: node(`out:${f.group}`), value: f.amount }));
    return { nodes, links };
  }, [data]);

  const bucketWord = { day: 'day', week: 'week', month: 'month' }[data?.bucket] ?? 'day';
  const Side = ({ title, rows, colour }) => {
    const [open, setOpen] = useState(null);
    return (
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', fontWeight: 800, fontSize: '0.8rem', color: colour }}>{title}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {rows.length === 0 && <tr><td style={{ padding: 14, fontSize: '0.78rem', color: colors.textMuted }}>Nothing in this period.</td></tr>}
            {rows.slice(0, 8).map((r) => {
              const key = `${r.group}|${r.name}`;
              const on = open === key;
              const cell = { padding: '7px 12px', fontSize: '0.78rem', borderTop: `1px solid ${colors.tint(0.05)}` };
              return [
                <tr key={key} onClick={() => setOpen(on ? null : key)} style={{ cursor: 'pointer' }} title="Click for the vouchers behind this">
                  <td style={cell}>{r.name}<span style={{ color: colors.textFaint, fontSize: '0.68rem' }}> · {r.group}{r.voucher_count > 1 ? ` · ${r.voucher_count} vouchers` : ''}</span></td>
                  <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{money(r.amount)}</td>
                </tr>,
                on && (
                  <tr key={`${key}-v`}>
                    <td colSpan={2} style={{ padding: '2px 12px 10px 24px', background: colors.tint(0.03) }}>
                      {r.vouchers.map((v) => (
                        <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '3px 0', fontSize: '0.74rem' }}>
                          <span><Link to={`/admin/books/vouchers/${v.id}`} style={{ fontFamily: 'monospace', color: colors.text }}>{v.number}</Link> <span style={{ color: colors.textFaint }}>· {v.type} · {v.date}</span>
                            {v.narration && <span style={{ color: colors.textFaint }}> — {v.narration}</span>}</span>
                          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(v.amount)}</span>
                        </div>
                      ))}
                      {r.voucher_count > r.vouchers.length && <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>and {r.voucher_count - r.vouchers.length} more</div>}
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
        {rows.some((r) => r.group === 'Adjustments') && <p style={{ margin: 0, padding: '6px 12px 10px', fontSize: '0.68rem', color: colors.textFaint }}>Adjustments are journals with several lines (a bounced cheque with a fee, say). The money is shown under the voucher instead of being guessed onto one ledger.</p>}
      </div>
    );
  };

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, marginRight: 'auto' }}>Money movement</h2>
        <select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} style={{ ...filterStyle, minWidth: 200 }} aria-label="Account">
          <option value="">All cash &amp; bank accounts</option>
          {accounts.map((a) => <option key={a.ledger_id} value={a.ledger_id}>{a.name}</option>)}
        </select>
        <label style={{ fontSize: '0.75rem', color: colors.textMuted }}>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={filterStyle} /></label>
        <label style={{ fontSize: '0.75rem', color: colors.textMuted }}>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={filterStyle} /></label>
      </div>

      {busy && !data && <p style={{ color: colors.textMuted }}>Loading…</p>}
      {data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginBottom: 12 }}>
            <div style={{ ...card, padding: 14 }}><div style={{ fontSize: '0.68rem', color: colors.textFaint, fontWeight: 700 }}>MONEY IN</div><div style={{ fontSize: '1.2rem', fontWeight: 800, color: IN }}>{money(data.totals.in)}</div></div>
            <div style={{ ...card, padding: 14 }}><div style={{ fontSize: '0.68rem', color: colors.textFaint, fontWeight: 700 }}>MONEY OUT</div><div style={{ fontSize: '1.2rem', fontWeight: 800, color: OUT }}>{money(data.totals.out)}</div></div>
            <div style={{ ...card, padding: 14 }}><div style={{ fontSize: '0.68rem', color: colors.textFaint, fontWeight: 700 }}>NET</div><div style={{ fontSize: '1.2rem', fontWeight: 800, color: data.totals.in - data.totals.out >= 0 ? IN : OUT }}>{money(data.totals.in - data.totals.out)}</div></div>
          </div>

          {data.series.length === 0 ? <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>No money moved through these accounts in this period.</p> : (
            <>
              <div style={{ ...card, padding: '14px 8px 8px', marginBottom: 12 }}>
                <div style={{ padding: '0 10px 6px', fontWeight: 800, fontSize: '0.8rem' }}>In and out, by {bucketWord}</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={data.series} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="bucket" tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--line)' }} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} width={48} />
                    <Tooltip formatter={(v) => money(v)} cursor={{ fill: 'rgba(127,127,127,0.1)' }} contentStyle={{ background: 'var(--surface-card, #fff)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="in" name="Money in" fill={IN} radius={[3, 3, 0, 0]} />
                    <Bar dataKey="out" name="Money out" fill={OUT} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {sankey && (
                <div style={{ ...card, padding: '14px 8px 8px', marginBottom: 12 }}>
                  <div style={{ padding: '0 10px 6px', fontWeight: 800, fontSize: '0.8rem' }}>Where it came from, and where it went <span style={{ fontWeight: 400, color: colors.textFaint }}>· by ledger group</span></div>
                  <ResponsiveContainer width="100%" height={Math.max(280, sankey.nodes.length * 34)}>
                    <Sankey data={sankey} node={<FlowNode />} link={<FlowLink />} nodePadding={26} nodeWidth={10} margin={{ top: 20, right: 150, bottom: 10, left: 150 }}>
                      <Tooltip formatter={(v) => money(v)} contentStyle={{ background: 'var(--surface-card, #fff)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12 }} />
                    </Sankey>
                  </ResponsiveContainer>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
                <Side title="Came from" rows={data.in} colour={IN} />
                <Side title="Went to" rows={data.out} colour={OUT} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
