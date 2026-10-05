import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, colors } from '../../../../_shared/theme/tokens';
import { money, filterStyle, yearStart, today } from './booksFmt';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const qty = (n, unit) => (n === null || n === undefined || Number(n) === 0 ? '' : `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ''}`);
const rate = (n) => (n === null || n === undefined ? '' : money(n));
const val = (n) => (Number(n) === 0 ? '' : money(n));
const link = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: colors.text, font: 'inherit', textAlign: 'left', textDecoration: 'underline', textDecorationColor: colors.tint(0.3) };

/** Stock movement: what a ledger has bought from us or sold to us, item by item; click an item for every voucher behind it. Or start from an item and see the ledgers. */
export default function StockMovement() {
  const [mode, setMode] = useState('ledger');   // ledger | item
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [ledgers, setLedgers] = useState([]);
  const [ledgerId, setLedgerId] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState([]);
  const [product, setProduct] = useState(null);   // { id, name }
  const [data, setData] = useState(null);
  const [drill, setDrill] = useState(null);       // { productId, ledgerId|null }
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);

  // only customers and suppliers: the ledgers under Sundry Debtors and Sundry Creditors (subgroups included)
  useEffect(() => {
    const find = (tree, name) => { for (const g of tree) { if (g.name === name) return g; const hit = find(g.children ?? [], name); if (hit) return hit; } return null; };
    (async () => {
      try {
        const tree = await booksAPI.groups();
        const ids = ['Sundry Debtors', 'Sundry Creditors'].map((n) => find(tree, n)?.id).filter(Boolean);
        const lists = await Promise.all(ids.map((id) => booksAPI.ledgers({ all: 1, group_id: id })));
        const all = lists.flatMap((r) => (Array.isArray(r) ? r : r.data ?? []));
        setLedgers([...new Map(all.map((l) => [l.id, l])).values()].sort((a, b) => a.name.localeCompare(b.name)));
      } catch { /* the dropdown stays empty; the error shows when a report is run */ }
    })();
  }, []);
  useEffect(() => {
    if (mode !== 'item' || product) return undefined;
    const t = setTimeout(() => booksAPI.movementProducts(q).then(setFound).catch(() => {}), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [mode, q, product]);

  // the list: a ledger's items, or an item's ledgers
  useEffect(() => { setDrill(null); }, [mode, ledgerId, product]);
  useEffect(() => {
    setData(null);
    const ask = mode === 'ledger' ? (ledgerId ? booksAPI.movementLedgerItems({ ledger_id: ledgerId, from, to }) : null)
      : (product ? booksAPI.movementItemLedgers({ product_id: product.id, from, to }) : null);
    if (!ask) return undefined;
    let live = true;
    setBusy(true);
    ask.then((d) => { if (live) setData(d); }).catch((e) => toast.error(errMsg(e, 'Could not run the report'))).finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [mode, ledgerId, product, from, to]);

  // the item voucher analysis
  useEffect(() => {
    if (!drill) { setDetail(null); return undefined; }
    let live = true;
    setDetail(null);
    booksAPI.movementItemVouchers({ product_id: drill.productId, ledger_id: drill.ledgerId || undefined, from, to })
      .then((d) => { if (live) setDetail(d); }).catch((e) => toast.error(errMsg(e, 'Could not load the vouchers')));
    return () => { live = false; };
  }, [drill, from, to]);

  const controls = (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {[['ledger', 'Start from a ledger'], ['item', 'Start from an item']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)} style={{ ...filterStyle, cursor: 'pointer', fontWeight: mode === k ? 700 : 500, background: mode === k ? colors.tint(0.1) : 'var(--surface-card, #fff)' }}>{l}</button>
        ))}
      </div>
      {mode === 'ledger' && (
        <select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} style={{ ...filterStyle, minWidth: 240 }} aria-label="Ledger">
          <option value="">Choose a ledger…</option>
          {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}
      {mode === 'item' && (product
        ? <span style={{ ...filterStyle, display: 'inline-flex', gap: 8, alignItems: 'center' }}><strong>{product.name}</strong><button type="button" onClick={() => { setProduct(null); setQ(''); }} style={{ ...link, textDecoration: 'none', color: 'var(--status-error, #ef4444)', fontWeight: 700 }}>change</button></span>
        : (
          <div style={{ position: 'relative' }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item…" style={{ ...filterStyle, width: 260 }} aria-label="Item" />
            {found.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: 4, ...card, maxHeight: 260, overflowY: 'auto' }}>
                {found.map((p) => (
                  <button key={p.id} type="button" onClick={() => { setProduct({ id: p.id, name: p.name }); setFound([]); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: '0.8rem' }}>
                    {p.name}{p.sku && <span style={{ color: colors.textFaint }}> · {p.sku}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      <label style={{ fontSize: '0.75rem', color: colors.textMuted }}>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={filterStyle} /></label>
      <label style={{ fontSize: '0.75rem', color: colors.textMuted }}>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={filterStyle} /></label>
    </div>
  );

  if (drill) {
    return (
      <div>
        {controls}
        <ItemAnalysis detail={detail} onBack={() => setDrill(null)} />
      </div>
    );
  }

  const unitOf = (r) => (mode === 'ledger' ? r.unit : data?.item?.unit);
  const empty = mode === 'ledger' ? !ledgerId : !product;
  return (
    <div>
      {controls}
      {empty && <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{mode === 'ledger' ? 'Choose a ledger to see every item it has bought from us or sold to us.' : 'Find an item to see which ledgers bought it or sold it to us.'}</p>}
      {!empty && busy && !data && <p style={{ color: colors.textMuted }}>Running…</p>}
      {data && (mode === 'ledger' ? data.ledger : data.item && !data.ledger) && (
        <>
          <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: colors.textMuted }}>
            {mode === 'ledger' ? <>Stock movement for <strong>{data.ledger.name}</strong></> : <>Ledgers that moved <strong>{data.item.name}</strong></>} · {data.from} to {data.to} · amounts in the base currency · click {mode === 'ledger' ? 'an item' : 'a ledger'} for its vouchers
          </p>
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: colors.tint(0.02) }}>
                    <th style={th} rowSpan={2}>{mode === 'ledger' ? 'Particulars' : 'Ledger'}</th>
                    <th style={{ ...th, textAlign: 'center', borderLeft: `1px solid ${colors.tint(0.08)}` }} colSpan={3}>Purchases</th>
                    <th style={{ ...th, textAlign: 'center', borderLeft: `1px solid ${colors.tint(0.08)}` }} colSpan={3}>Sales</th>
                  </tr>
                  <tr style={{ background: colors.tint(0.02) }}>
                    {['Quantity', 'Eff. rate', 'Value', 'Quantity', 'Eff. rate', 'Value'].map((h, i) => <th key={i} style={{ ...th, textAlign: 'right', ...(i % 3 === 0 ? { borderLeft: `1px solid ${colors.tint(0.08)}` } : {}) }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: colors.textMuted, padding: 30 }}>Nothing moved in this period.</td></tr>}
                  {data.rows.map((r) => (
                    <tr key={mode === 'ledger' ? r.product_id : (r.ledger_id ?? r.name)}>
                      <td style={td}>
                        <button type="button" style={link} onClick={() => setDrill(mode === 'ledger' ? { productId: r.product_id, ledgerId } : { productId: product.id, ledgerId: r.ledger_id })}>{r.name}</button>
                      </td>
                      <td style={{ ...td, ...num, borderLeft: `1px solid ${colors.tint(0.08)}` }}>{qty(r.purchase_qty, unitOf(r))}</td><td style={{ ...td, ...num, fontStyle: 'italic' }}>{rate(r.purchase_rate)}</td><td style={{ ...td, ...num }}>{val(r.purchase_value)}</td>
                      <td style={{ ...td, ...num, borderLeft: `1px solid ${colors.tint(0.08)}` }}>{qty(r.sale_qty, unitOf(r))}</td><td style={{ ...td, ...num, fontStyle: 'italic' }}>{rate(r.sale_rate)}</td><td style={{ ...td, ...num }}>{val(r.sale_value)}</td>
                    </tr>
                  ))}
                  {data.rows.length > 0 && (
                    <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
                      <td style={td}>Grand total</td><td style={td} /><td style={td} /><td style={{ ...td, ...num }}>{money(data.rows.reduce((t, r) => t + r.purchase_value, 0))}</td>
                      <td style={td} /><td style={td} /><td style={{ ...td, ...num }}>{money(data.rows.reduce((t, r) => t + r.sale_value, 0))}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {mode === 'item' && data.rows.length > 0 && (
            <p style={{ margin: '10px 0 0' }}><button type="button" style={{ ...link, fontSize: '0.8rem' }} onClick={() => setDrill({ productId: product.id, ledgerId: null })}>See every voucher for {data.item.name}, all ledgers →</button></p>
          )}
        </>
      )}
    </div>
  );
}

/** Item voucher analysis: each voucher line of one item, with the voucher to open. */
function ItemAnalysis({ detail, onBack }) {
  return (
    <div>
      <button type="button" onClick={onBack} style={{ ...link, display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 10, fontSize: '0.8rem', textDecoration: 'none', color: colors.textMuted }}><ArrowLeft size={14} /> Back</button>
      {!detail ? <p style={{ color: colors.textMuted }}>Loading…</p> : (
        <>
          <div style={{ marginBottom: 10, fontSize: '0.85rem' }}>
            <div>Stock item: <strong>{detail.item.name}</strong></div>
            <div style={{ color: colors.textMuted }}>Under ledger: <strong style={{ color: colors.text }}>{detail.ledger?.name ?? 'All ledgers'}</strong> · {detail.from} to {detail.to}</div>
          </div>
          {detail.groups.length === 0 && <p style={{ color: colors.textMuted }}>No vouchers for this item in the period.</p>}
          {detail.groups.map((g) => (
            <div key={g.kind} style={{ ...card, overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ padding: '10px 12px', fontWeight: 800, fontStyle: 'italic', fontSize: '0.85rem' }}>{g.kind}</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: colors.tint(0.02) }}>
                      <th style={th}>Date</th><th style={th}>Particulars</th><th style={th}>Voucher</th>
                      <th style={{ ...th, textAlign: 'right' }}>Quantity</th><th style={{ ...th, textAlign: 'right' }}>Basic rate</th><th style={{ ...th, textAlign: 'right' }}>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r, i) => (
                      <tr key={`${r.voucher_id}-${i}`}>
                        <td style={td}>{r.date}</td>
                        <td style={td}><strong>{r.party ?? '—'}</strong>{r.variant && <span style={{ color: colors.textFaint }}> · {r.variant}</span>}</td>
                        <td style={td}><Link to={`/admin/books/vouchers/${r.voucher_id}`} style={{ fontFamily: 'monospace', fontStyle: 'italic', color: colors.text }}>{r.number}</Link><span style={{ color: colors.textFaint, fontSize: '0.7rem' }}> · {r.type}</span></td>
                        <td style={{ ...td, ...num }}>{qty(r.qty, detail.item.unit)}</td><td style={{ ...td, ...num }}>{rate(r.rate)}{r.rate !== null && detail.item.unit ? `/${detail.item.unit}` : ''}</td><td style={{ ...td, ...num }}>{money(r.value)}</td>
                      </tr>
                    ))}
                    <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
                      <td style={td} /><td style={td}>Total</td><td style={td} />
                      <td style={{ ...td, ...num }}>{qty(g.qty, detail.item.unit)}</td><td style={{ ...td, ...num }}>{rate(g.rate)}</td><td style={{ ...td, ...num }}>{money(g.value)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
