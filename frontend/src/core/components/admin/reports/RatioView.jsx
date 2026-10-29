import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount } from './engineFmt';

const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const heading = { margin: '0 0 6px', fontWeight: 800, letterSpacing: '0.12em', fontSize: '0.74rem', color: colors.textFaint };

/**
 * Ratio analysis on the engine: the principal figures and the principal ratios. A figure that has not been chosen in the Reports settings reads "Not set up",
 * and a ratio that cannot be worked out says which setting it is waiting for.
 */
export default function RatioView({ result }) {
  const d = result.data;
  const fmt = result.format;
  const ratioText = (r) => (r.value === null ? '—' : r.kind === 'ratio' ? `${r.value.toFixed(2)} : 1` : r.kind === 'pct' ? `${r.value.toFixed(2)} %` : `${r.value.toFixed(2)} days`);
  const figureText = (g) => {
    if (g.amount !== undefined) return g.amount === null ? 'Not set up' : `${formatAmount(g.amount, fmt)} ${g.side}`;
    return g.value === null ? '—' : g.value.toFixed(2);
  };
  const notSet = (g) => g.amount === null;

  return (
    <>
      {d.missing.length > 0 && (
        <div role="note" style={{ ...card, padding: '8px 12px', marginBottom: 12, fontSize: '0.78rem', color: colors.warningText }}>
          Not set up in the Reports settings (Ratio analysis inputs): {d.missing.join(', ')}. Figures and ratios that need them are left blank rather than guessed.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 14 }}>
        <div style={{ ...card, padding: 16 }}>
          <p style={heading}>PRINCIPAL FIGURES</p>
          <p style={{ margin: '0 0 8px', fontSize: '0.72rem', color: colors.textFaint }}>Balances as at {d.to}; sales, purchases and profit for {d.from} to {d.to}.</p>
          {d.groups.map((g) => (
            <div key={g.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: g.sub ? '0 0 6px 18px' : '6px 0 0', fontWeight: g.bold || !g.sub ? 700 : 400, color: g.sub || notSet(g) ? colors.textMuted : undefined }}>
              <span>{g.label}{g.note && <span style={{ display: 'block', fontWeight: 400, fontStyle: 'italic', fontSize: '0.74rem', color: colors.textMuted }}>({g.note})</span>}</span>
              <span style={{ ...num, whiteSpace: 'nowrap', fontWeight: notSet(g) ? 400 : undefined }}>{figureText(g)}</span>
            </div>
          ))}
        </div>
        <div style={{ ...card, padding: 16 }}>
          <p style={heading}>PRINCIPAL RATIOS</p>
          {d.ratios.map((r) => (
            <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0 0' }}>
              <span style={{ fontWeight: 700 }}>
                {r.label}
                {r.note && <span style={{ display: 'block', fontWeight: 400, fontStyle: 'italic', fontSize: '0.74rem', color: colors.textMuted }}>({r.note})</span>}
                {r.waiting_for.length > 0 && <span style={{ display: 'block', fontWeight: 400, fontSize: '0.72rem', color: colors.warningText }}>Waiting for: {r.waiting_for.join(', ')}</span>}
              </span>
              <span style={{ ...num, fontWeight: 700, whiteSpace: 'nowrap' }}>{ratioText(r)}</span>
            </div>
          ))}
          {d.equity.total !== null && (
            <p style={{ margin: '12px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>
              Equity used: capital {formatAmount(d.equity.capital, fmt)} plus retained earnings {formatAmount(d.equity.retained_earlier_years + d.equity.retained_this_year, fmt)} (earlier years {formatAmount(d.equity.retained_earlier_years, fmt)}, this year to date {formatAmount(d.equity.retained_this_year, fmt)}) = {formatAmount(d.equity.total, fmt)}.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
