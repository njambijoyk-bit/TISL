import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { loadTaxRates } from './taxRates';
import { btnGhost, colors, input } from '../../../../_shared/theme/tokens';

const small = { ...input, padding: '7px 9px', fontSize: '0.82rem', width: '100%' };
const label = { display: 'block', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase', marginBottom: 3 };

/**
 * A tax entered as a line of its own: choose the tax, then either type the tax amount, or give the taxable amount and let the tax rate work it out. A typed tax amount wins.
 * line: { tax_rate_id, base, amount }. partyTax: the customer's or supplier's own treatment (exempt, zero_rated, out_of_scope), which cancels the ledgers' tax but not a tax added here. linesTotal: the ledger lines' total, offered as the taxable amount. computed: what the preview worked out for this line.
 */
const TREATMENT = { exempt: 'exempt', zero_rated: 'zero-rated', out_of_scope: 'out of scope' };

export default function TaxLineRow({ line, onChange, onRemove, linesTotal = 0, computed, partyTax, partyName }) {
  const [rates, setRates] = useState([]);
  useEffect(() => { let live = true; loadTaxRates().then((r) => { if (live) setRates(r); }); return () => { live = false; }; }, []);
  const rate = rates.find((r) => String(r.id) === String(line.tax_rate_id));
  const groups = rates.reduce((m, r) => { const k = r.tax_type?.name || r.tax_type?.code || 'Tax rates'; (m[k] = m[k] || []).push(r); return m; }, {});
  const worked = computed?.tax_amount != null ? Number(computed.tax_amount) : null;
  return (
    <div style={{ border: `1px dashed ${colors.tint(0.3)}`, borderRadius: 10, padding: 10, display: 'grid', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, alignItems: 'end' }}>
        <div>
          <label style={label}>Tax *</label>
          <select value={line.tax_rate_id ?? ''} onChange={(e) => onChange({ tax_rate_id: e.target.value })} style={small} aria-label="Tax">
            <option value="">Choose the tax…</option>
            {Object.entries(groups).map(([tt, rs]) => <optgroup key={tt} label={tt}>{rs.map((r) => <option key={r.id} value={r.id}>{r.name} ({Number(r.rate_value)}%)</option>)}</optgroup>)}
          </select>
        </div>
        <div>
          <label style={label}>Taxable amount</label>
          <input type="number" min="0" step="0.01" value={line.base ?? ''} onChange={(e) => onChange({ base: e.target.value })} placeholder="to work the tax out" style={small} aria-label="Taxable amount" />
        </div>
        <div>
          <label style={label}>Tax amount</label>
          <input type="number" min="0" step="0.01" value={line.amount ?? ''} onChange={(e) => onChange({ amount: e.target.value })}
            placeholder={worked != null && line.amount === '' ? worked.toFixed(2) : '0.00'} style={small} aria-label="Tax amount" />
        </div>
        <div style={{ textAlign: 'right' }}>
          <button type="button" aria-label="Remove tax line" onClick={onRemove} style={{ ...btnGhost, padding: '6px 8px', color: colors.danger }}><Trash2 size={14} /></button>
        </div>
      </div>
      {partyTax && TREATMENT[partyTax] && (
        <div role="status" style={{ padding: '6px 10px', borderRadius: 8, background: colors.warningBg, color: colors.warningText, fontSize: '0.74rem' }}>
          ⚠ {partyName ? `${partyName} is` : 'This customer or supplier is'} {TREATMENT[partyTax]}, so the tax on the other lines is cancelled. This tax was added by hand and is charged as entered.
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.72rem', color: colors.textMuted }}>
        {linesTotal > 0 && <button type="button" style={{ ...btnGhost, padding: '2px 8px', fontSize: '0.7rem' }} onClick={() => onChange({ base: String(Math.round(linesTotal * 100) / 100), amount: '' })}>Use the lines’ total ({linesTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })})</button>}
        <span>{rate ? `Enter the tax amount, or the taxable amount to work it out at ${Number(rate.rate_value)}%. A typed tax amount wins.` : 'Enter the tax amount, or the taxable amount to work it out at the tax’s rate.'}</span>
      </div>
    </div>
  );
}
