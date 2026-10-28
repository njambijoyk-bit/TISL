import { useNavigate } from 'react-router-dom';
import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount, formatBalance, UNIT_WORD } from './engineFmt';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

/** The ledger statement on the engine: opening, each posting with who the other side was, and a running balance read as Dr or Cr. A row opens its voucher. */
export default function LedgerStatementView({ result }) {
  const nav = useNavigate();
  const d = result.data;
  const fmt = result.format;
  if (d.ready === false) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>{d.message}</p>;
  const showCurrency = d.has_foreign || d.restated;
  const unit = UNIT_WORD[fmt.units];
  const later = d.paging.page > 1;
  const span = showCurrency ? 7 : 6;

  return (
    <>
      <p style={{ margin: '0 0 8px', fontSize: '0.85rem' }}><strong>{d.ledger.name}</strong> <span style={{ color: colors.textMuted }}>· {d.ledger.group}</span>{unit && <span style={{ color: colors.textFaint, fontSize: '0.72rem' }}> · amounts {unit}</span>}</p>
      {d.opening_note === 'branch_limited' && <div role="note" style={{ ...card, padding: '8px 12px', marginBottom: 10, fontSize: '0.76rem', color: colors.textMuted }}>The balance starts from the whole business&apos;s opening balance and adds only the movement of your branches.</div>}
      {d.opening_note === 'filtered' && <div role="note" style={{ ...card, padding: '8px 12px', marginBottom: 10, fontSize: '0.76rem', color: colors.textMuted }}>Filtered by cost centre or branch, so the statement starts from nothing and shows only that movement.</div>}
      {showCurrency && d.by_currency?.length > 0 && (
        <div style={{ ...card, padding: 12, marginBottom: 12, fontSize: '0.8rem' }}>
          <strong>Moved in each currency</strong> <span style={{ color: colors.textMuted }}>(the columns below are in {d.base_currency}{d.restated ? ', and vouchers made when the base currency was different are shown at today\'s rate, marked restated' : ', at the rate on each voucher'})</span>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 6 }}>
            {d.by_currency.map((c) => <span key={c.currency}><strong>{c.currency}</strong> Dr {formatAmount(c.debit, fmt)} · Cr {formatAmount(c.credit, fmt)} · net <strong>{formatAmount(Math.abs(c.net), fmt)} {c.net >= 0 ? 'Dr' : 'Cr'}</strong></span>)}
          </div>
        </div>
      )}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: colors.tint(0.02) }}>
              <th style={th}>Date</th><th style={th}>Number</th><th style={th}>Particulars</th>
              {showCurrency && <th style={th}>In its currency</th>}
              <th style={th}>Details</th><th style={{ ...th, ...num }}>Debit</th><th style={{ ...th, ...num }}>Credit</th><th style={{ ...th, ...num }}>Balance</th>
            </tr></thead>
            <tbody>
              <tr style={{ background: colors.tint(0.02) }}>
                <td style={td} colSpan={span + 1}>{later ? 'Brought forward' : 'Opening balance'}</td>
                <td style={{ ...td, ...num }}>{formatBalance(later ? d.page_opening : d.opening, fmt)}</td>
              </tr>
              {d.rows.map((r, i) => (
                <tr key={i} onClick={() => nav(`/admin/books/vouchers/${r.voucher_id}`)} style={{ cursor: 'pointer' }}>
                  <td style={td}>{r.date}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{r.voucher_number}<div style={{ fontFamily: 'inherit', fontSize: '0.68rem', color: colors.textFaint }}>{r.type}</div></td>
                  <td style={td}>{r.particulars}</td>
                  {showCurrency && <td style={{ ...td, color: colors.textMuted, whiteSpace: 'nowrap' }}>{r.in_currency}{r.foreign ? <span style={{ color: colors.textFaint }}> @ {r.rate}</span> : ''}{r.restated ? <span title="Made when the base currency was different: shown at today's rate" style={{ color: colors.warningText, marginLeft: 6, fontSize: '0.68rem' }}>restated</span> : ''}</td>}
                  <td style={{ ...td, color: colors.textMuted }}>
                    {r.narration}
                    {r.identifiers.length > 0 && <div style={{ fontSize: '0.72rem', color: colors.textFaint }}>{r.identifiers.join(' · ')}</div>}
                  </td>
                  <td style={{ ...td, ...num }}>{formatAmount(r.debit, fmt, { blankZero: true })}</td>
                  <td style={{ ...td, ...num }}>{formatAmount(r.credit, fmt, { blankZero: true })}</td>
                  <td style={{ ...td, ...num }}>{formatBalance(r.balance, fmt)}</td>
                </tr>
              ))}
              {!d.rows.length && <tr><td colSpan={span + 2} style={{ ...td, textAlign: 'center', color: colors.textMuted, padding: 30 }}>Nothing posted to this ledger in the period.</td></tr>}
              <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
                <td style={td} colSpan={span}>Totals{d.paging.pages > 1 ? ' (all pages)' : ''}</td>
                <td style={{ ...td, ...num }}>{formatAmount(d.debit, fmt)}</td><td style={{ ...td, ...num }}>{formatAmount(d.credit, fmt)}</td><td style={{ ...td, ...num }}>{formatBalance(d.closing, fmt)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
