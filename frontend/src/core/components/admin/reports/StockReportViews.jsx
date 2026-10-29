import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { money } from '../books/booksFmt';
import { card, colors } from '../../../../_shared/theme/tokens';
import { KITCHEN_TYPE, kitchenKindOf } from '../../../lib/stockKinds';

/**
 * The stock reports on the engine: the summary (group, item, the item's months, the vouchers of a month), the location summary, and the stock query card.
 * A negative balance (which should not exist) is shown in red; stock held at no cost is flagged. Both the Purchases page and the Reports page draw these.
 */

const th = { textAlign: 'right', padding: '6px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint, whiteSpace: 'nowrap' };
const td = { padding: '7px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, textAlign: 'right', whiteSpace: 'nowrap' };
const qty = (n, unit) => (n === null || n === undefined ? '' : `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ''}`);
const red = '#b91c1c';

const Badge = ({ kind }) => (kind === 'negative'
  ? <span title="Stock is below zero — this should not happen; look at the movements" style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 99, background: '#fee2e2', color: red, fontSize: '0.65rem', fontWeight: 800 }}>Negative</span>
  : <span title="Stock is held at no cost, so its value reads 0" style={{ marginLeft: 8, padding: '1px 7px', borderRadius: 99, background: '#fef3c7', color: '#92400e', fontSize: '0.65rem', fontWeight: 800 }}>No cost</span>);

function Cells({ row, unit, strong }) {
  const w = strong ? 800 : 500;
  const neg = (v) => (Number(v) < -0.004 ? red : undefined);
  return (
    <>
      <td style={{ ...td, fontWeight: w }}>{qty(row.opening.qty, unit)}</td><td style={{ ...td, fontWeight: w, color: neg(row.opening.value) }}>{money(row.opening.value)}</td>
      <td style={{ ...td, fontWeight: w }}>{qty(row.inward.qty, unit)}</td><td style={{ ...td, fontWeight: w }}>{money(row.inward.value)}</td>
      <td style={{ ...td, fontWeight: w }}>{qty(row.outward.qty, unit)}</td><td style={{ ...td, fontWeight: w }}>{money(row.outward.value)}</td>
      <td style={{ ...td, fontWeight: 800, color: Number(row.closing.qty) < -0.00005 ? red : undefined }}>{qty(row.closing.qty, unit)}</td>
      <td style={{ ...td, fontStyle: 'italic' }}>{row.rate !== null && row.rate !== undefined ? money(row.rate) : ''}</td>
      <td style={{ ...td, fontWeight: 800, color: neg(row.closing.value) }}>{money(row.closing.value)}</td>
    </>
  );
}

function SummaryTable({ data, onItem, onQuery }) {
  const [open, setOpen] = useState({});
  const toggle = (n) => setOpen((o) => ({ ...o, [n]: !o[n] }));
  const allOpen = data.groups.length > 0 && data.groups.every((g) => open[g.name]);
  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }} rowSpan={2}>
              <button type="button" onClick={() => setOpen(allOpen ? {} : Object.fromEntries(data.groups.map((g) => [g.name, true])))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.textFaint, fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {allOpen ? 'Collapse all' : 'Expand all'}
              </button>
            </th>
            <th style={{ ...th, textAlign: 'center' }} colSpan={2}>Opening</th><th style={{ ...th, textAlign: 'center' }} colSpan={2}>Inwards</th>
            <th style={{ ...th, textAlign: 'center' }} colSpan={2}>Outwards</th><th style={{ ...th, textAlign: 'center' }} colSpan={3}>Closing</th>
          </tr>
          <tr><th style={th}>Qty</th><th style={th}>Value</th><th style={th}>Qty</th><th style={th}>Value</th><th style={th}>Qty</th><th style={th}>Value</th><th style={th}>Qty</th><th style={th}>Rate</th><th style={th}>Value</th></tr>
        </thead>
        <tbody>
          {data.groups.length === 0 && <tr><td colSpan={10} style={{ ...td, textAlign: 'left', color: colors.textMuted }}>No stock movements in this period.</td></tr>}
          {data.groups.map((g) => (
            <Fragment key={g.name}>
              <tr onClick={() => toggle(g.name)} style={{ cursor: 'pointer', background: colors.tint(0.04) }}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 800 }}>
                  {open[g.name] ? <ChevronDown size={13} style={{ verticalAlign: -2 }} /> : <ChevronRight size={13} style={{ verticalAlign: -2 }} />} {g.name}
                  <span style={{ color: colors.textFaint, fontWeight: 500, marginLeft: 6 }}>({g.item_count})</span>
                  {g.negative && <Badge kind="negative" />}{g.no_cost && <Badge kind="no_cost" />}
                </td>
                <Cells row={g} unit={g.unit} strong />
              </tr>
              {open[g.name] && g.items.map((it) => (
                <tr key={`${it.item_type}:${it.item_id}`} onClick={() => onItem(it)} style={{ cursor: 'pointer' }}>
                  <td style={{ ...td, textAlign: 'left', paddingLeft: 30 }}>
                    {it.name}{it.sku ? <span style={{ color: colors.textFaint }}> · {it.sku}</span> : null}
                    {it.negative && <Badge kind="negative" />}{it.no_cost && <Badge kind="no_cost" />}
                    <button type="button" onClick={(e) => { e.stopPropagation(); onQuery(it); }} style={{ marginLeft: 10, border: 'none', background: 'none', color: colors.primary ?? '#2563eb', cursor: 'pointer', fontSize: '0.72rem' }}>Query</button>
                  </td>
                  <Cells row={it} unit={it.unit} />
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...td, textAlign: 'left', fontWeight: 800, letterSpacing: '0.15em' }}>GRAND TOTAL</td>
            <td style={td} /><td style={{ ...td, fontWeight: 800 }}>{money(data.total.opening.value)}</td><td style={td} /><td style={{ ...td, fontWeight: 800 }}>{money(data.total.inward.value)}</td>
            <td style={td} /><td style={{ ...td, fontWeight: 800 }}>{money(data.total.outward.value)}</td><td style={td} /><td style={td} />
            <td style={{ ...td, fontWeight: 800, color: data.total.closing.value < -0.004 ? red : undefined }}>{money(data.total.closing.value)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ItemMonthly({ item, f, onBack, onMonth }) {
  const [d, setD] = useState(null);
  useEffect(() => { booksAPI.engineReport('stock-item-monthly', { item: `${item.item_type}:${item.item_id}`, from: f.from, to: f.to, ...(f.location_id ? { location_id: f.location_id } : {}) }).then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e, 'Could not load the item'))); }, [item, f]);
  const unit = item.unit;
  return (
    <div>
      <button type="button" onClick={onBack} style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.textMuted, marginBottom: 8 }}><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Back to the summary</button>
      <h3 style={{ margin: '0 0 10px' }}>{item.name} <span style={{ fontWeight: 500, color: colors.textFaint, fontSize: '0.85rem' }}>month by month</span></h3>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ ...th, textAlign: 'left' }}>Month</th><th style={th}>Opening</th><th style={th}>Inwards</th><th style={th}>Outwards</th><th style={th}>Closing qty</th><th style={th}>Closing value</th></tr></thead>
          <tbody>
            {!d && <tr><td colSpan={6} style={{ ...td, textAlign: 'left' }}>Loading…</td></tr>}
            {d && d.months.length === 0 && <tr><td colSpan={6} style={{ ...td, textAlign: 'left', color: colors.textMuted }}>No movement in this period. Opening {qty(d.opening.qty, unit)}.</td></tr>}
            {d?.months.map((m) => (
              <tr key={m.month} onClick={() => onMonth(m.month)} style={{ cursor: 'pointer' }}>
                <td style={{ ...td, textAlign: 'left' }}>{new Date(`${m.month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</td>
                <td style={td}>{qty(m.opening.qty, unit)}</td><td style={td}>{qty(m.inward.qty, unit)} · {money(m.inward.value)}</td><td style={td}>{qty(m.outward.qty, unit)} · {money(m.outward.value)}</td>
                <td style={{ ...td, fontWeight: 800, color: m.closing.qty < -0.00005 ? red : undefined }}>{qty(m.closing.qty, unit)}</td><td style={{ ...td, fontWeight: 800 }}>{money(m.closing.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ItemMovements({ item, month, f, onBack }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    booksAPI.engineReport('stock-item-movements', { item: `${item.item_type}:${item.item_id}`, from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}`, ...(f.location_id ? { location_id: f.location_id } : {}) }).then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e, 'Could not load the vouchers')));
  }, [item, month, f.location_id]);
  return (
    <div>
      <button type="button" onClick={onBack} style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.textMuted, marginBottom: 8 }}><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Back to {item.name}</button>
      <h3 style={{ margin: '0 0 10px' }}>{item.name} <span style={{ fontWeight: 500, color: colors.textFaint, fontSize: '0.85rem' }}>{new Date(`${month}-01`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span></h3>
      <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ ...th, textAlign: 'left' }}>Date</th><th style={{ ...th, textAlign: 'left' }}>Kind</th><th style={{ ...th, textAlign: 'left' }}>Party</th><th style={{ ...th, textAlign: 'left' }}>Branch</th><th style={{ ...th, textAlign: 'left' }}>Batch</th><th style={th}>Qty</th><th style={th}>Rate</th><th style={th}>Value</th><th style={{ ...th, textAlign: 'left' }}>Document</th></tr></thead>
          <tbody>
            {!d && <tr><td colSpan={9} style={{ ...td, textAlign: 'left' }}>Loading…</td></tr>}
            {d?.rows.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td, textAlign: 'left' }}>{r.date}</td><td style={{ ...td, textAlign: 'left' }}>{r.label}</td><td style={{ ...td, textAlign: 'left' }}>{r.party ?? '—'}</td>
                <td style={{ ...td, textAlign: 'left' }}>{r.location}</td><td style={{ ...td, textAlign: 'left' }}>{r.batch_no ?? '—'}</td>
                <td style={{ ...td, fontWeight: 700, color: r.quantity < 0 ? red : '#15803d' }}>{r.quantity > 0 ? '+' : ''}{qty(r.quantity, item.unit)}</td>
                <td style={td}>{r.rate !== null ? money(r.rate) : ''}</td><td style={td}>{money(r.value)}</td>
                <td style={{ ...td, textAlign: 'left' }}>{r.voucher_id ? <Link to={`/admin/books/vouchers/${r.voucher_id}`}>{r.voucher_number}</Link> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Field = ({ label, children }) => (
  <div style={{ display: 'flex', gap: 10, padding: '3px 0', fontSize: '0.85rem' }}><span style={{ width: 150, color: colors.textMuted }}>{label}</span><span style={{ fontWeight: 700 }}>{children}</span></div>
);

function MiniTable({ title, head, rows, empty }) {
  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      <div style={{ padding: '10px 14px', fontWeight: 800, fontSize: '0.85rem', borderBottom: `1px solid ${colors.tint(0.08)}` }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{head.map(([h, left]) => <th key={h} style={{ ...th, textAlign: left ? 'left' : 'right' }}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} style={{ ...td, textAlign: 'left', color: colors.textMuted }}>{empty}</td></tr>}
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ ...td, textAlign: head[j][1] ? 'left' : 'right' }}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

/** The summary or the location summary. The item and the month open the drill-downs; "Query" opens the stock query for the item. */
export function StockSummaryView({ result, opts = {} }) {
  const nav = useNavigate();
  const d = result.data;
  const f = { from: result.scope.from, to: result.scope.to, location_id: result.scope.location_id ?? '' };
  const [drill, setDrill] = useState(null);
  const [month, setMonth] = useState(null);
  const [kind, setKind] = useState('');   // kitchen stock is grouped by kind ("Ready to serve: Cola"): a list narrows the report to one kind
  const itemType = opts.item_type ?? '';
  const kindNames = useMemo(() => (itemType === KITCHEN_TYPE ? [...new Set((d.groups ?? []).map((g) => kitchenKindOf(g.name)).filter(Boolean))] : []), [itemType, d]);
  const kindNow = kindNames.includes(kind) ? kind : '';
  const view = useMemo(() => {
    if (!kindNow) return d;
    const groups = d.groups.filter((g) => kitchenKindOf(g.name) === kindNow);
    const total = Object.fromEntries(['opening', 'inward', 'outward', 'closing'].map((k) => [k, { qty: null, value: Math.round(groups.reduce((t, g) => t + g[k].value, 0) * 100) / 100 }]));
    const items = groups.flatMap((g) => g.items);

    return { ...d, groups, total, negative_items: items.filter((i) => i.negative).length, no_cost_items: items.filter((i) => i.no_cost).length };
  }, [d, kindNow]);

  if (d.ready === false) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{d.message}</p>;
  if (drill && !month) return <ItemMonthly item={drill} f={f} onBack={() => setDrill(null)} onMonth={setMonth} />;
  if (drill && month) return <ItemMovements item={drill} month={month} f={f} onBack={() => setMonth(null)} />;

  return (
    <>
      {kindNames.length > 1 && (
        <select value={kindNow} onChange={(e) => setKind(e.target.value)} aria-label="Kind" style={{ padding: '7px 10px', marginBottom: 10 }}>
          <option value="">All kinds</option>{kindNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      )}
      {(view.negative_items > 0 || view.no_cost_items > 0) && (
        <p style={{ margin: '0 0 10px', fontSize: '0.8rem' }}>
          {view.negative_items > 0 && <span style={{ color: red, fontWeight: 700, marginRight: 14 }}>{view.negative_items} item(s) below zero — stock went out that was never received; check their movements.</span>}
          {view.no_cost_items > 0 && <span style={{ color: '#92400e', fontWeight: 700 }}>{view.no_cost_items} item(s) held at no cost — their value reads 0 until a cost is set.</span>}
        </p>
      )}
      <SummaryTable data={view} onItem={(it) => { setDrill(it); setMonth(null); }} onQuery={(it) => nav(`/admin/stock/reports?tab=query&item=${it.item_type}:${it.item_id}`)} />
    </>
  );
}

/** The stock query card for one item; "items of the same group" re-asks for another item (`drill`). */
export function StockQueryView({ result, drill }) {
  const d = result.data;
  if (d.ready === false) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{d.message}</p>;
  const it = d.item;
  const onItem = (r) => drill({ item: `${r.item_type}:${r.item_id}` });
  const link = (r) => (r.voucher_id ? <Link to={`/admin/books/vouchers/${r.voucher_id}`}>{r.date}</Link> : r.date);
  return (
    <div>
      {(
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ ...card, padding: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 4 }}>
            <div>
              <Field label="Name">{it.name}{d.negative && <Badge kind="negative" />}{d.no_cost && <Badge kind="no_cost" />}</Field>
              <Field label="Group">{it.group ?? '—'}</Field>
              <Field label="Closing balance"><span style={{ color: d.negative ? red : undefined }}>{qty(d.closing.qty, it.unit)}</span></Field>
              <Field label="Closing value">{money(d.closing.value)}</Field>
            </div>
            <div>
              <Field label="Cost price">{d.cost_price !== null ? `${money(d.cost_price)}${it.unit ? ` / ${it.unit}` : ''}` : '—'}</Field>
              <Field label="Costing method">{d.costing_method}</Field>
              <Field label="Standard selling price">{d.sale_price !== null ? `${money(d.sale_price)}${it.currency ? ` ${it.currency}` : ''}${it.unit ? ` / ${it.unit}` : ''}` : '—'}</Field>
              <Field label="SKU">{it.sku ?? '—'}</Field>
              {it.url && <Field label=""><Link to={it.url}>Open the item</Link></Field>}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 14 }}>
            <MiniTable title={`Purchases${d.last_purchase ? ` — last on ${d.last_purchase.date}` : ''}`} empty="Never purchased." head={[['Date', true], ['Party', true], ['Qty'], ['Rate'], ['Amount']]}
              rows={d.purchases.map((r) => [link(r), r.party ?? '—', qty(r.quantity, it.unit), money(r.rate), money(r.amount)])} />
            <MiniTable title={`Sales${d.last_sale ? ` — last on ${d.last_sale.date}` : ''}`} empty="Never sold." head={[['Date', true], ['Party', true], ['Qty'], ['Rate'], ['Amount']]}
              rows={d.sales.map((r) => [link(r), r.party ?? '—', qty(r.quantity, it.unit), r.rate !== null ? money(r.rate) : '—', r.amount !== null ? money(r.amount) : '—'])} />
            <MiniTable title="Location / batch" empty="Nothing in stock." head={[['Location', true], ['Batch', true], ['Expiry', true], ['Qty']]}
              rows={d.places.map((r) => [r.location, r.batch_no ?? '—', r.expiry_date ?? '—', qty(r.quantity, it.unit)])} />
            <MiniTable title="Items of the same group" empty="No other items in this group." head={[['Item', true], ['Qty'], ['Cost'], ['Sale price']]}
              rows={d.same_group.map((r) => [<button type="button" key={r.item_id} onClick={() => onItem(r)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#2563eb', padding: 0 }}>{r.name}</button>, qty(r.quantity, r.unit), r.cost !== null ? money(r.cost) : '—', r.sale_price !== null ? money(r.sale_price) : '—'])} />
          </div>
        </div>
      )}
    </div>
  );
}
