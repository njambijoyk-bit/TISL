import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { card, colors } from '../../../../_shared/theme/tokens';
import { formatAmount, UNIT_WORD } from './engineFmt';

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '7px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}`, verticalAlign: 'top' };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const link = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, font: 'inherit', color: colors.primaryDeep, textAlign: 'left' };
const NATURE = { advance: 'Advance', overpayment: 'Overpayment', prepayment: 'Paid in advance' };

/**
 * Receivables or payables ageing on the engine. First the outstanding bills by age (a party opens to its bills, a bill opens its voucher, a party name
 * opens its ledger statement); then, apart, the credits no bill has used yet; then the net, set against the ledger when the settings say which ledgers
 * are the debtors or creditors.
 */
export default function AgeingView({ result }) {
  const nav = useNavigate();
  const d = result.data;
  const fmt = result.format;
  const [open, setOpen] = useState(() => new Set());
  const receivables = d.kind === 'receivables';
  const unit = UNIT_WORD[fmt.units];
  const toggle = (id) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const billed = d.rows.filter((r) => r.bills.length);
  const credited = d.rows.filter((r) => r.credits.length);
  const statement = (id) => nav(`/admin/books?tab=reports&report=ledger&ledger=${id}`);
  const bucketCols = d.buckets.length;

  return (
    <>
      {unit && <p style={{ margin: '0 0 6px', fontSize: '0.72rem', color: colors.textFaint }}>Amounts {unit}.</p>}
      <h3 style={{ margin: '0 0 6px', fontSize: '0.85rem' }}>{receivables ? 'Customers owe us' : 'We owe suppliers'}</h3>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: colors.tint(0.02) }}>
              <th style={th}>Party</th>
              {d.buckets.map((b) => <th key={b.key} style={{ ...th, ...num }}>{b.label}</th>)}
              <th style={{ ...th, ...num }}>Total</th>
            </tr></thead>
            <tbody>
              {billed.length ? billed.map((r) => (
                <Fragment key={r.ledger_id}>
                  <tr>
                    <td style={td}>
                      <button type="button" style={{ ...link, marginRight: 6 }} aria-expanded={open.has(r.ledger_id)} aria-label={`Bills of ${r.party}`} onClick={() => toggle(r.ledger_id)}>{open.has(r.ledger_id) ? '▾' : '▸'}</button>
                      <button type="button" style={link} onClick={() => statement(r.ledger_id)}>{r.party}</button>
                      {r.has_foreign && <div style={{ fontSize: '0.7rem', color: colors.textMuted }}>Open: {r.currencies}</div>}
                    </td>
                    {d.buckets.map((b) => <td key={b.key} style={{ ...td, ...num }}>{formatAmount(r.buckets[b.key], fmt, { blankZero: true })}</td>)}
                    <td style={{ ...td, ...num, fontWeight: 600 }}>{formatAmount(r.total, fmt)}</td>
                  </tr>
                  {open.has(r.ledger_id) && r.bills.map((b) => (
                    <tr key={b.voucher_id} onClick={() => nav(`/admin/books/vouchers/${b.voucher_id}`)} style={{ cursor: 'pointer', background: colors.tint(0.02) }}>
                      <td style={{ ...td, paddingLeft: 36 }}>
                        <span style={{ fontFamily: 'monospace' }}>{b.voucher_number}</span>
                        <span style={{ color: colors.textFaint, fontSize: '0.7rem' }}> · {b.date}, due {b.due_date}{b.days_late > 0 ? ` (${b.days_late}d late)` : ''}</span>
                        {b.foreign && <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}> · {b.currency} {formatAmount(b.open_fc, fmt)}</span>}
                      </td>
                      {d.buckets.map((x) => <td key={x.key} style={{ ...td, ...num }}>{b.bucket === x.key ? formatAmount(b.open, fmt) : ''}</td>)}
                      <td style={{ ...td, ...num }}>{formatAmount(b.open, fmt)}</td>
                    </tr>
                  ))}
                </Fragment>
              )) : <tr><td colSpan={bucketCols + 2} style={{ ...td, textAlign: 'center', color: colors.textMuted, padding: 30 }}>Nothing outstanding.</td></tr>}
              {billed.length > 0 && (
                <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>
                  <td style={td}>Total outstanding</td>
                  {d.buckets.map((b) => <td key={b.key} style={{ ...td, ...num }}>{formatAmount(d.totals[b.key], fmt)}</td>)}
                  <td style={{ ...td, ...num }}>{formatAmount(d.totals.total, fmt)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <h3 style={{ margin: '18px 0 6px', fontSize: '0.85rem' }}>Unapplied credits <span style={{ fontWeight: 400, color: colors.textMuted, fontSize: '0.75rem' }}>— {receivables ? 'held for customers' : 'prepaid to suppliers, and debit notes'}, not used on a bill yet</span></h3>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: colors.tint(0.02) }}>
              <th style={th}>Party</th><th style={th}>Voucher</th><th style={th}>What it is</th><th style={th}>Date</th><th style={{ ...th, ...num }}>Amount</th>
            </tr></thead>
            <tbody>
              {credited.length ? credited.flatMap((r) => r.credits.map((c, i) => (
                <tr key={`${r.ledger_id}:${c.voucher_id}`} onClick={() => nav(`/admin/books/vouchers/${c.voucher_id}`)} style={{ cursor: 'pointer' }}>
                  <td style={td}>{i === 0 ? r.party : ''}</td>
                  <td style={{ ...td, fontFamily: 'monospace' }}>{c.voucher_number}</td>
                  <td style={td}>{c.type_name}{NATURE[c.nature] && <span style={{ color: colors.textFaint }}> · {NATURE[c.nature]}{c.for ? `: ${c.for}` : ''}</span>}</td>
                  <td style={td}>{c.date}</td>
                  <td style={{ ...td, ...num }}>{formatAmount(c.amount, fmt)}{c.foreign && <div style={{ fontSize: '0.7rem', color: colors.textMuted }}>{c.currency} {formatAmount(c.amount_fc, fmt)}</div>}</td>
                </tr>
              ))) : <tr><td colSpan={5} style={{ ...td, textAlign: 'center', color: colors.textMuted, padding: 20 }}>No unapplied credits.</td></tr>}
              {credited.length > 0 && (
                <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}><td style={td} colSpan={4}>Total unapplied credits</td><td style={{ ...td, ...num }}>{formatAmount(d.credit_total, fmt)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...card, padding: 12, marginTop: 14, fontSize: '0.8rem' }}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <span>Outstanding <strong>{formatAmount(d.totals.total, fmt)}</strong></span>
          <span>less unapplied credits <strong>{formatAmount(d.credit_total, fmt)}</strong></span>
          <span>{receivables ? 'Net owed to us' : 'Net we owe'} <strong>{formatAmount(d.net, fmt)}</strong></span>
        </div>
        {d.control && (
          <p style={{ margin: '8px 0 0', color: Math.abs(d.control.difference) < 0.005 ? colors.textMuted : colors.warningText }}>
            The {receivables ? 'debtors' : 'creditors'} in the ledger come to <strong>{formatAmount(d.control.ledger_balance, fmt)}</strong>.{' '}
            {Math.abs(d.control.difference) < 0.005
              ? 'It agrees with the net above.'
              : `${formatAmount(Math.abs(d.control.difference), fmt)} ${d.control.difference > 0 ? 'more' : 'less'} than the net: that is on the ledgers outside any bill or credit (opening balances, journals, entries made on account).`}
          </p>
        )}
        <p style={{ margin: '8px 0 0', color: colors.textFaint, fontSize: '0.72rem' }}>Days are counted from the {d.basis === 'due_date' ? 'due date' : 'bill date'}. A credit that has already been applied to a bill is not listed here: the bill is already smaller by that amount.</p>
      </div>
    </>
  );
}
