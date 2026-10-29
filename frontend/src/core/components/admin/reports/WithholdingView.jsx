import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount, UNIT_WORD } from './engineFmt';
import { useNavigate } from 'react-router-dom';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '7px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

/**
 * The withholding certificate register on the engine. Each row shows its amounts in the currency of the voucher (with the code) and the withheld
 * amount in the base currency, so the base column adds up to the totals. The totals line says how many certificates are still awaited, all of them
 * and those of the period apart.
 */
export default function WithholdingView({ result }) {
  const nav = useNavigate();
  const d = result.data;
  const fmt = result.format;
  const unit = UNIT_WORD[fmt.units];
  const t = d.totals;
  const A = (v) => formatAmount(v, fmt);

  return (
    <>
      {unit && <p style={{ margin: '0 0 6px', fontSize: '0.72rem', color: colors.textFaint }}>Amounts {unit}.</p>}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: colors.tint(0.02) }}>
              <th style={th}>Date</th><th style={th}>Certificate</th><th style={th}>Voucher</th><th style={th}>Direction</th><th style={th}>Party</th><th style={th}>Tax</th>
              <th style={{ ...th, ...num }}>Gross</th><th style={{ ...th, ...num }}>Withheld</th><th style={{ ...th, ...num }}>Withheld ({d.base_currency})</th><th style={th}>Certificate</th><th style={th}>Credit</th>
            </tr></thead>
            <tbody>
              {d.rows.length ? d.rows.map((r) => (
                <tr key={r.id} onClick={() => nav(`/admin/books/vouchers/${r.voucher_id}`)} style={{ cursor: 'pointer' }}>
                  <td style={td}>{r.date}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{r.certificate_number || '—'}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{r.voucher_number}{r.identifiers.length > 0 && <div style={{ fontFamily: 'inherit', fontSize: '0.68rem', color: colors.textFaint }}>{r.identifiers.join(' · ')}</div>}</td>
                  <td style={td}>{r.direction === 'receivable' ? 'Held from us' : 'Held by us'}</td><td style={td}>{r.party ?? '—'}</td><td style={td}>{r.tax ?? '—'}</td>
                  <td style={{ ...td, ...num }}>{r.currency} {A(r.gross_amount)}</td><td style={{ ...td, ...num }}>{r.currency} {A(r.withheld_amount)}</td>
                  <td style={{ ...td, ...num }}>{A(r.withheld_base)}</td>
                  <td style={td}>{r.status}</td><td style={td}>{r.credit_status?.replace('_', ' ') ?? '—'}</td>
                </tr>
              )) : <tr><td colSpan={11} style={{ ...td, textAlign: 'center', color: colors.textMuted, padding: 30 }}>No certificates in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ ...card, padding: 12, marginTop: 12, fontSize: '0.8rem' }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <span>Held from us <strong>{A(t.receivable)}</strong></span>
          <span>Held by us <strong>{A(t.payable)}</strong></span>
          <span>Certificates still awaited <strong>{t.awaiting_certificate}</strong> ({A(t.awaiting_amount)}), {t.awaiting_in_period} of them from this period</span>
        </div>
        <p style={{ margin: '6px 0 0', color: colors.textFaint, fontSize: '0.72rem' }}>Totals are in {d.base_currency}. The awaited count covers every outstanding certificate, whenever it was raised.</p>
      </div>
    </>
  );
}
