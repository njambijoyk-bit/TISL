import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount, UNIT_WORD } from './engineFmt';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '7px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

/**
 * The tax return on the engine. For each tax: what was owed at the start of the period, the tax charged and reclaimed by rate, what was paid to the
 * authority or otherwise adjusted, and what is owed at the end, each on its own date. Then the sales and purchases split by tax nature.
 */
export default function TaxReturnView({ result }) {
  const d = result.data;
  const fmt = result.format;
  const unit = UNIT_WORD[fmt.units];
  const A = (v) => formatAmount(v, fmt);

  return (
    <>
      {unit && <p style={{ margin: '0 0 6px', fontSize: '0.72rem', color: colors.textFaint }}>Amounts {unit}.</p>}
      {d.types.length === 0 && <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>No tax types are set up.</p>}
      {d.types.map((t) => (
        <div key={t.id} style={{ ...card, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '10px 12px', fontWeight: 700, fontSize: '0.85rem' }}>{t.name} <span style={{ fontWeight: 400, color: colors.textFaint, fontSize: '0.72rem' }}>{t.mode === 'withheld' ? 'withheld at source' : t.mode === 'reverse_charge' ? 'reverse charge: owed and claimed back' : 'added to the price'}</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: colors.tint(0.02) }}>
                <th style={th}>Rate</th><th style={{ ...th, ...num }}>Sales value</th><th style={{ ...th, ...num }}>Charged (output)</th><th style={{ ...th, ...num }}>Purchases value</th><th style={{ ...th, ...num }}>Reclaimable (input)</th><th style={{ ...th, ...num }}>Net</th>
              </tr></thead>
              <tbody>
                <tr style={{ background: colors.tint(0.02) }}>
                  <td style={td} colSpan={5}>Owed to the authority at the start{d.brought_forward_on ? ` (${d.brought_forward_on})` : ''}</td><td style={{ ...td, ...num }}>{A(t.brought_forward)}</td>
                </tr>
                {t.rows.length ? t.rows.map((r) => (
                  <tr key={r.label}>
                    <td style={td}>{r.label}</td>
                    <td style={{ ...td, ...num }}>{r.sales_base === null ? '' : A(r.sales_base)}</td><td style={{ ...td, ...num }}>{A(r.output)}</td>
                    <td style={{ ...td, ...num }}>{r.purchases_base === null ? '' : A(r.purchases_base)}</td><td style={{ ...td, ...num }}>{A(r.input)}</td><td style={{ ...td, ...num }}>{A(r.net)}</td>
                  </tr>
                )) : <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: colors.textMuted }}>No tax in this period.</td></tr>}
                {Math.abs(t.settled) >= 0.005 && (
                  <tr><td style={td} colSpan={5}>Paid to the authority and other entries</td><td style={{ ...td, ...num }}>{A(-t.settled)}</td></tr>
                )}
                <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
                  <td style={td} colSpan={5}>Owed to the authority at the end ({d.to}){t.closing_owed < 0 ? ' — the authority owes us' : ''}</td><td style={{ ...td, ...num }}>{A(t.closing_owed)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {d.supplies.length > 0 && (
        <>
          <h3 style={{ margin: '18px 0 6px', fontSize: '0.85rem' }}>Sales and purchases by tax nature</h3>
          <div style={{ ...card, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ background: colors.tint(0.02) }}><th style={th}>Tax nature</th><th style={{ ...th, ...num }}>Sales</th><th style={{ ...th, ...num }}>Purchases</th></tr></thead>
              <tbody>
                {d.supplies.map((s) => <tr key={s.key}><td style={td}>{s.label}</td><td style={{ ...td, ...num }}>{A(s.sales)}</td><td style={{ ...td, ...num }}>{A(s.purchases)}</td></tr>)}
              </tbody>
            </table>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>Credit and debit notes reduce these. Lines on an account with no tax nature set are shown as not classified.</p>
        </>
      )}
    </>
  );
}
