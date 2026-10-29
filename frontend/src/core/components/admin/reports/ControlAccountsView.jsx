import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount } from './engineFmt';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const small = { cursor: 'pointer', marginLeft: 8, fontWeight: 600, fontSize: '0.72rem' };

/** Control-account checks: each control ledger against the register that explains it. A check that can be put right has its button; the report then runs again. */
export default function ControlAccountsView({ result, drill }) {
  const d = result.data;
  const fmt = result.format;
  const A = (v) => formatAmount(v, fmt);
  const fix = async (fn, fail) => { try { const r = await fn(); toast.success(r.message); drill?.({}); } catch (e) { toast.error(errMsg(e, fail)); } };

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: colors.tint(0.02) }}><th style={th}>Check</th><th style={{ ...th, ...num }}>Books</th><th style={{ ...th, ...num }}>Register</th><th style={{ ...th, ...num }}>Difference</th><th style={{ ...th, ...num }}>Explained</th><th style={th}>Agrees</th></tr></thead>
          <tbody>
            {d.checks.map((c) => (
              <tr key={c.key}>
                <td style={td}>{c.title}<div style={{ fontSize: '0.68rem', color: colors.textFaint }}>{c.note}</div>{c.details?.map((x, i) => <div key={i} style={{ fontSize: '0.68rem', color: colors.dangerText }}>{x}</div>)}</td>
                <td style={{ ...td, ...num }}>{A(c.book)}</td><td style={{ ...td, ...num }}>{A(c.register)}</td>
                <td style={{ ...td, ...num, color: c.ok ? undefined : colors.danger }}>{A(c.difference)}</td><td style={{ ...td, ...num }}>{c.explained ? A(c.explained) : ''}</td>
                <td style={{ ...td, fontWeight: 700, color: c.ok ? colors.successText : colors.dangerText }}>
                  {c.ok ? 'Yes' : 'No'}
                  {!c.ok && c.key === 'stock-units' && <button type="button" style={small} onClick={() => fix(() => booksAPI.refreshStockUnits(), 'Could not refresh the stock numbers')}>Refresh</button>}
                  {!c.ok && c.key === 'loyalty-points' && <button type="button" style={small} onClick={() => { if (confirm('Post one Journal that brings the Loyalty Points Liability in line with the points customers hold?')) fix(() => booksAPI.loyaltyTrueUp(), 'Could not post the correction'); }}>Post correction</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
