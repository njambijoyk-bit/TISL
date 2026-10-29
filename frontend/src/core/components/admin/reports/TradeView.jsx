import { Link } from 'react-router-dom';
import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount } from './engineFmt';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const link = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: colors.text, font: 'inherit', textAlign: 'left', textDecoration: 'underline', textDecorationColor: colors.tint(0.3) };
const qty = (n, unit) => (n === null || n === undefined || Number(n) === 0 ? '' : `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ''}`);

/**
 * Trade by party and item: a party's items, an item's parties, or one item's vouchers for a party. Rows narrow the report (`drill`); a voucher opens.
 * The party and item are chosen in the frame above.
 */
export default function TradeView({ result, drill }) {
  const d = result.data;
  const fmt = result.format;
  const val = (n) => (Number(n) === 0 ? '' : formatAmount(n, fmt));
  const rate = (n) => (n === null || n === undefined ? '' : formatAmount(n, fmt));
  if (d.ready === false) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{d.message}</p>;

  if (d.mode === 'vouchers') {
    return (
      <div>
        <button type="button" onClick={() => drill({ ledger_id: '', item: '' })} style={{ ...link, textDecoration: 'none', color: colors.textMuted, fontSize: '0.8rem', marginBottom: 10 }}>← Start again</button>
        <div style={{ marginBottom: 10, fontSize: '0.85rem' }}>
          <div>Item: <strong>{d.item.name}</strong></div>
          <div style={{ color: colors.textMuted }}>Under: <strong style={{ color: colors.text }}>{d.ledger?.name ?? 'All parties'}</strong></div>
        </div>
        {d.groups.length === 0 && <p style={{ color: colors.textMuted }}>No vouchers for this item in the period.</p>}
        {d.groups.map((g) => (
          <div key={g.kind} style={{ ...card, overflow: 'hidden', marginBottom: 14 }}>
            <div style={{ padding: '10px 12px', fontWeight: 800, fontStyle: 'italic', fontSize: '0.85rem' }}>{g.kind}</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: colors.tint(0.02) }}>
                  <th style={th}>Date</th><th style={th}>Particulars</th><th style={th}>Voucher</th><th style={{ ...th, ...num }}>Quantity</th><th style={{ ...th, ...num }}>Basic rate</th><th style={{ ...th, ...num }}>Value</th>
                </tr></thead>
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={`${r.voucher_id}-${i}`}>
                      <td style={td}>{r.date}</td>
                      <td style={td}><strong>{r.party ?? '—'}</strong>{r.variant && <span style={{ color: colors.textFaint }}> · {r.variant}</span>}</td>
                      <td style={td}><Link to={`/admin/books/vouchers/${r.voucher_id}`} style={{ fontFamily: 'monospace', fontStyle: 'italic', color: colors.text }}>{r.number}</Link><span style={{ color: colors.textFaint, fontSize: '0.7rem' }}> · {r.type}</span></td>
                      <td style={{ ...td, ...num }}>{qty(r.qty, d.item.unit)}</td><td style={{ ...td, ...num }}>{rate(r.rate)}</td><td style={{ ...td, ...num }}>{formatAmount(r.value, fmt)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
                    <td style={td} /><td style={td}>Total</td><td style={td} />
                    <td style={{ ...td, ...num }}>{qty(g.qty, d.item.unit)}</td><td style={{ ...td, ...num }}>{rate(g.rate)}</td><td style={{ ...td, ...num }}>{formatAmount(g.value, fmt)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const byLedger = d.mode === 'ledger';
  const open = (r) => (byLedger ? drill({ ledger_id: String(d.ledger.id), item: `${r.item_type}:${r.item_id}` }) : drill({ ledger_id: r.ledger_id ? String(r.ledger_id) : '', item: `${d.item.item_type}:${d.item.id}` }));
  return (
    <>
      <p style={{ margin: '0 0 8px', fontSize: '0.78rem', color: colors.textMuted }}>
        {byLedger ? <>Items traded with <strong>{d.ledger.name}</strong></> : <>Parties that traded <strong>{d.item.name}</strong></>} · amounts in the base currency · click {byLedger ? 'an item' : 'a party'} for its vouchers
      </p>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: colors.tint(0.02) }}>
                <th style={th} rowSpan={2}>{byLedger ? 'Item' : 'Party'}</th>
                <th style={{ ...th, textAlign: 'center', borderLeft: `1px solid ${colors.tint(0.08)}` }} colSpan={3}>Purchases</th>
                <th style={{ ...th, textAlign: 'center', borderLeft: `1px solid ${colors.tint(0.08)}` }} colSpan={3}>Sales</th>
              </tr>
              <tr style={{ background: colors.tint(0.02) }}>
                {['Quantity', 'Eff. rate', 'Value', 'Quantity', 'Eff. rate', 'Value'].map((h, i) => <th key={i} style={{ ...th, ...num, ...(i % 3 === 0 ? { borderLeft: `1px solid ${colors.tint(0.08)}` } : {}) }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {d.rows.length === 0 && <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: colors.textMuted, padding: 30 }}>Nothing moved in this period.</td></tr>}
              {d.rows.map((r) => {
                const unit = byLedger ? r.unit : d.item.unit;
                return (
                  <tr key={byLedger ? `${r.item_type}:${r.item_id}` : (r.ledger_id ?? r.name)}>
                    <td style={td}>
                      <button type="button" style={link} onClick={() => open(r)}>{r.name}</button>
                      {byLedger && r.item_type === 'ingredient' && <span style={{ marginLeft: 6, fontSize: '0.62rem', fontWeight: 800, color: colors.primary }}>KITCHEN</span>}
                    </td>
                    <td style={{ ...td, ...num, borderLeft: `1px solid ${colors.tint(0.08)}` }}>{qty(r.purchase_qty, unit)}</td><td style={{ ...td, ...num, fontStyle: 'italic' }}>{rate(r.purchase_rate)}</td><td style={{ ...td, ...num }}>{val(r.purchase_value)}</td>
                    <td style={{ ...td, ...num, borderLeft: `1px solid ${colors.tint(0.08)}` }}>{qty(r.sale_qty, unit)}</td><td style={{ ...td, ...num, fontStyle: 'italic' }}>{rate(r.sale_rate)}</td><td style={{ ...td, ...num }}>{val(r.sale_value)}</td>
                  </tr>
                );
              })}
              {d.rows.length > 0 && (
                <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
                  <td style={td}>Grand total</td><td style={td} /><td style={td} /><td style={{ ...td, ...num }}>{formatAmount(d.totals.purchase_value, fmt)}</td>
                  <td style={td} /><td style={td} /><td style={{ ...td, ...num }}>{formatAmount(d.totals.sale_value, fmt)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {!byLedger && d.rows.length > 0 && (
        <p style={{ margin: '10px 0 0' }}><button type="button" style={{ ...link, fontSize: '0.8rem' }} onClick={() => drill({ ledger_id: 'all' })}>See every voucher for {d.item.name}, all parties →</button></p>
      )}
    </>
  );
}
