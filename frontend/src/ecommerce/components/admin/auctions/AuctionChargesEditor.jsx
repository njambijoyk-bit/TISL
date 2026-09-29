import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import auctionsAPI from '../../../../_shared/api/auctions';

const KIND = {
  buyer_premium: "Buyer's premium", entry_fee: 'Entry fee', deposit: 'Deposit', delivery: 'Delivery', handling: 'Handling',
  storage: 'Storage', removal: 'Removal', payment: 'Payment fee', customs: 'Customs', other: 'Charge',
};
const DUE = { entry: 'To take part', deposit: 'Held as deposit', on_win: 'Added on winning', after_win: 'After winning' };
const TAX = { taxable: 'VAT-able', zero_rated: 'Zero-rated', exempt: 'Exempt', out_of_scope: 'No tax' };

/**
 * Which charges an auction has, and what each comes to. The charges are ledgers (Books → Chart of accounts → Auction
 * charges) carrying how they are worked out and their tax; here an auction switches them on or off and can override the
 * amount. `value` is null for a new auction (the defaults apply) or [{ ledger_id, is_enabled, amount }].
 */
export default function AuctionChargesEditor({ currencyId, currencyCode, value, onChange, locked = false }) {
  const [options, setOptions] = useState(null);
  const [error, setError] = useState(null);
  const lastCurrency = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    let live = true;
    auctionsAPI.chargeOptions(currencyId).then((opts) => {
      if (!live) return;
      setOptions(opts);
      const changed = lastCurrency.current !== null && String(lastCurrency.current) !== String(currencyId);
      lastCurrency.current = currencyId;
      const cur = valueRef.current;
      onChange(opts.map((o) => {
        const v = cur?.find((r) => Number(r.ledger_id) === Number(o.ledger.id));
        return {
          ledger_id: o.ledger.id,
          is_enabled: v ? v.is_enabled : (cur ? false : o.default_on),
          amount: v && !changed ? v.amount : o.amount,
        };
      }));
    }).catch(() => { if (live) setError('Could not load the charge accounts.'); });
    return () => { live = false; };
  // re-read the master amounts when the auction currency changes
  }, [currencyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = value ?? [];
  const patch = (id, p) => onChange(rows.map((r) => (Number(r.ledger_id) === Number(id) ? { ...r, ...p } : r)));

  if (error) return <p style={{ color: '#dc2626', fontSize: '0.8rem' }}>{error}</p>;
  if (!options) return <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Loading charges…</p>;
  if (options.length === 0) {
    return (
      <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: 0 }}>
        No auction charges are set up yet. Add them under <Link to="/admin/books?tab=accounts">Books → Chart of accounts → Auction Charges</Link> (buyer's premium, deposit, handling…) and they will appear here.
      </p>
    );
  }

  const cell = { padding: '8px 10px', fontSize: '0.8rem', borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', fontSize: '0.68rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <th style={cell} />
            <th style={cell}>Charge</th>
            <th style={cell}>Charged</th>
            <th style={{ ...cell, textAlign: 'right' }}>Amount</th>
            <th style={cell}>Tax</th>
          </tr>
        </thead>
        <tbody>
          {options.map((o) => {
            const r = rows.find((x) => Number(x.ledger_id) === Number(o.ledger.id));
            if (!r) return null;
            const unit = o.basis === 'percent' ? '% of winning bid' : o.basis === 'per_day' ? `${currencyCode ?? ''}/day` : (currencyCode ?? '');
            return (
              <tr key={o.ledger.id} style={{ opacity: r.is_enabled ? 1 : 0.55 }}>
                <td style={cell}><input type="checkbox" disabled={locked} checked={Boolean(r.is_enabled)} onChange={(e) => patch(o.ledger.id, { is_enabled: e.target.checked })} aria-label={`Apply ${o.ledger.name}`} /></td>
                <td style={cell}>
                  <strong style={{ color: '#111827' }}>{o.ledger.name}</strong>
                  <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{KIND[o.charge_kind] ?? 'Charge'}{o.refundable ? ' · refundable' : ''}{o.basis === 'per_day' && o.free_days ? ` · first ${o.free_days} days free` : ''}</div>
                </td>
                <td style={cell}>{DUE[o.timing] ?? o.timing}</td>
                <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <input type="number" min="0" step="0.01" disabled={locked || !r.is_enabled} value={r.amount ?? ''}
                    onChange={(e) => patch(o.ledger.id, { amount: e.target.value })}
                    style={{ width: 90, padding: '5px 8px', border: '1px solid #e5e7eb', borderRadius: 6, textAlign: 'right', fontSize: '0.8rem' }} />
                  <span style={{ marginLeft: 6, color: '#6b7280', fontSize: '0.72rem' }}>{unit}</span>
                </td>
                <td style={cell}>{TAX[o.ledger.tax_nature] ?? '—'}{o.tax_rate?.rate_value != null && o.ledger.tax_nature === 'taxable' ? ` ${Number(o.tax_rate.rate_value)}%` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {locked && <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '8px 0 0' }}>Charges are fixed once bidding has started.</p>}
    </div>
  );
}
