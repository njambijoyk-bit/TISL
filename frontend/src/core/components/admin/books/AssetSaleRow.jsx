import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import booksAPI from '../../../../_shared/api/books';
import { loadTaxRates } from './taxRates';
import { money } from './booksFmt';
import { btnGhost, colors, input } from '../../../../_shared/theme/tokens';

const small = { ...input, padding: '7px 9px', fontSize: '0.82rem', width: '100%' };
const label = { display: 'block', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 3 };

/**
 * An asset sold on the invoice: choose it from the register, the price and the tax. What it was worth is shown so the gain or loss is clear; the books take the cost, the depreciation to date and
 * the gain or loss off by themselves, and the customer sees only "Sale of …".
 * line: { instance_id, price, tax_rate_id }. computed: the previewed line.
 */
export default function AssetSaleRow({ line, onChange, onRemove, computed, chosenElsewhere = [] }) {
  const [assets, setAssets] = useState(null);
  const [rates, setRates] = useState([]);
  useEffect(() => {
    let live = true;
    booksAPI.assetsForSale().then((r) => { if (live) setAssets(r); }).catch(() => { if (live) setAssets({ ready: false, assets: [] }); });
    loadTaxRates().then((r) => { if (live) setRates(r); });
    return () => { live = false; };
  }, []);
  const list = (assets?.assets ?? []).filter((a) => String(a.id) === String(line.instance_id) || !chosenElsewhere.includes(String(a.id)));
  const a = list.find((x) => String(x.id) === String(line.instance_id));
  const price = Number(line.price);
  const diff = a && line.price !== '' ? Math.round((price - a.book_value) * 100) / 100 : null;
  return (
    <div style={{ border: `1px dashed ${colors.tint(0.3)}`, borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8, alignItems: 'end' }}>
        <div style={{ gridColumn: 'span 2' }}>
          <label style={label}>Asset sold *</label>
          <select value={line.instance_id ?? ''} onChange={(e) => onChange({ instance_id: e.target.value })} style={small} aria-label="Asset sold">
            <option value="">{assets === null ? 'Loading…' : list.length ? 'Choose the asset…' : 'No asset on the register to sell'}</option>
            {list.map((x) => <option key={x.id} value={x.id}>{x.label} · worth {money(x.book_value)}</option>)}
          </select>
        </div>
        <div>
          <label style={label}>Selling price *</label>
          <input type="number" min="0" step="0.01" value={line.price ?? ''} onChange={(e) => onChange({ price: e.target.value })} placeholder="0.00" style={small} aria-label="Selling price" />
        </div>
        <div>
          <label style={label}>Tax on the price</label>
          <select value={line.tax_rate_id ?? ''} onChange={(e) => onChange({ tax_rate_id: e.target.value })} style={small} aria-label="Tax on the price">
            <option value="">No tax (or as the asset account says)</option>
            {rates.map((r) => <option key={r.id} value={r.id}>{r.name} ({Number(r.rate_value)}%)</option>)}
          </select>
        </div>
        <div style={{ textAlign: 'right' }}><button type="button" aria-label="Remove asset sale" onClick={onRemove} style={{ ...btnGhost, padding: '6px 8px', color: colors.danger }}><Trash2 size={14} /></button></div>
      </div>
      <div style={{ fontSize: '0.74rem', color: colors.textMuted }}>
        {a ? <>Cost {money(a.cost)}, worth {money(a.book_value)} now.{diff !== null && <> At this price: <strong style={{ color: diff >= 0 ? colors.successText : colors.dangerText }}>{diff >= 0 ? `a gain of about ${money(diff)}` : `a loss of about ${money(-diff)}`}</strong> (the exact figure is worked out when it posts, with this month’s depreciation).</>}</> : 'The asset leaves the register when the invoice is posted. Its cost and depreciation come off the books and the gain or loss is booked for you.'}
        {computed?.tax_amount ? <> Tax on this sale: {money(computed.tax_amount)}.</> : null}
      </div>
    </div>
  );
}
