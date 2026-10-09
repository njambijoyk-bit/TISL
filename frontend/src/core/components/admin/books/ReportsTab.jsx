import useCalculatorContext from '../../../../_shared/hooks/useCalculatorContext';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, colors } from '../../../../_shared/theme/tokens';
import { ExportMenu } from './booksUi';
import { money, filterStyle, yearStart, today } from './booksFmt';
import StockMovement from './StockMovement';
import costCentresAPI from '../../../../_shared/api/costCentres';
import locationsAPI from '../../../../_shared/api/locations';

const REPORTS = [
  { id: 'day-book', label: 'Day book', range: true },
  { id: 'ledger', label: 'Ledger statement', range: true },
  { id: 'trial-balance', label: 'Trial balance', range: true },
  { id: 'profit-loss', label: 'Profit & loss', range: true },
  { id: 'profit-loss-by-cost-centre', label: 'Profit & loss by cost centre', range: true, byCostCentre: true },
  { id: 'balance-sheet', label: 'Balance sheet', asOf: true },
  { id: 'receivables', label: 'Receivables ageing', asOf: true },
  { id: 'payables', label: 'Payables ageing', asOf: true },
  { id: 'tax-return', label: 'Tax return', range: true },
  { id: 'withholding', label: 'Withholding certificates', range: true },
  { id: 'ratio-analysis', label: 'Ratio analysis', range: true },
  { id: 'reconciliation', label: 'Reconciliation', asOf: true },
  { id: 'stock-movement', label: 'Stock movement', custom: true },   // draws itself: it starts from a ledger or an item
];

const th = { padding: '8px 12px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textAlign: 'left', whiteSpace: 'nowrap' };
const td = { padding: '8px 12px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.05)}` };
const num = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

function Table({ head, children }) {
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: colors.tint(0.02) }}>{head.map(([h, right], i) => <th key={i} style={{ ...th, ...(right ? { textAlign: 'right' } : {}) }}>{h}</th>)}</tr></thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

const Empty = ({ cols }) => <tr><td colSpan={cols} style={{ ...td, textAlign: 'center', color: colors.textMuted, padding: 30 }}>Nothing posted for this period.</td></tr>;
const Total = ({ children }) => <tr style={{ background: colors.tint(0.03), fontWeight: 700 }}>{children}</tr>;

function View(props) {
  const n = Number(props.data?.restated_vouchers) || 0;
  return (
    <>
      {n > 0 && (
        <div style={{ ...card, padding: '8px 12px', marginBottom: 10, fontSize: '0.76rem', color: colors.warningText }}>
          {n} voucher{n === 1 ? ' was' : 's were'} made when the base currency was different and {n === 1 ? 'is' : 'are'} shown at today's rate, so every figure here is in the current base currency.
        </div>
      )}
      {props.data?.filtered && (
        <div style={{ ...card, padding: '8px 12px', marginBottom: 10, fontSize: '0.76rem', color: colors.warningText }}>
          Only entries of the chosen cost centre or branch are counted, so these figures will not balance on their own. Opening balances belong to the whole business and are left out.
        </div>
      )}
      {props.data?.branch_limited && (
        <div style={{ ...card, padding: '8px 12px', marginBottom: 10, fontSize: '0.76rem', color: colors.warningText }}>
          These figures cover only the branches you have access to. Opening balances belong to the whole business, so ask someone with access to every branch for company-wide totals.
        </div>
      )}
      <ViewBody {...props} />
    </>
  );
}

function ViewBody({ id, data, nav, onRefresh }) {
  if (id === 'day-book') return (
    <Table head={[['Date'], ['Number'], ['Type'], ['Party'], ['Status'], ['Total', true]]}>
      {data.rows.length ? data.rows.map((r) => (
        <tr key={r.id} onClick={() => nav(`/admin/books/vouchers/${r.id}`)} style={{ cursor: 'pointer', opacity: r.status === 'cancelled' ? 0.5 : 1 }}>
          <td style={td}>{r.date}</td><td style={{ ...td, fontFamily: 'monospace' }}>{r.voucher_number}</td><td style={td}>{r.type}</td><td style={td}>{r.party ?? '—'}</td><td style={td}>{r.status}</td><td style={{ ...td, ...num }}>{money(r.total)}</td>
        </tr>
      )) : <Empty cols={6} />}
      {data.rows.length > 0 && <Total><td style={td} colSpan={5}>Posted total</td><td style={{ ...td, ...num }}>{money(data.total)}</td></Total>}
    </Table>
  );
  if (id === 'ledger') return (
    <>
    {(data.has_foreign || data.restated) && (
      <div style={{ ...card, padding: 12, marginBottom: 12, fontSize: '0.8rem' }}>
        <strong>Moved in each currency</strong> <span style={{ color: colors.textMuted }}>(the columns below are in {data.base_currency}{data.restated ? "; vouchers made when the base currency was different are shown at today's rate and marked restated" : ', at the rate on each voucher'})</span>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 6 }}>
          {data.by_currency.map((c) => <span key={c.currency}><strong>{c.currency}</strong> Dr {money(c.debit)} · Cr {money(c.credit)} · net <strong>{money(Math.abs(c.net))} {c.net >= 0 ? 'Dr' : 'Cr'}</strong></span>)}
        </div>
      </div>
    )}
    <Table head={[['Date'], ['Number'], ['Type'], ...((data.has_foreign || data.restated) ? [['In its currency']] : []), [`Debit (${data.base_currency ?? ''})`, true], [`Credit (${data.base_currency ?? ''})`, true], ['Balance (Dr +)', true]]}>
      <tr style={{ background: colors.tint(0.02) }}><td style={td} colSpan={(data.has_foreign || data.restated) ? 6 : 5}>Opening balance</td><td style={{ ...td, ...num }}>{money(data.opening)}</td></tr>
      {data.rows.map((r, i) => (
        <tr key={i} onClick={() => nav(`/admin/books/vouchers/${r.voucher_id}`)} style={{ cursor: 'pointer' }}>
          <td style={td}>{r.date}</td><td style={{ ...td, fontFamily: 'monospace' }}>{r.voucher_number}</td><td style={td}>{r.type}</td>
          {(data.has_foreign || data.restated) && <td style={{ ...td, color: colors.textMuted, whiteSpace: 'nowrap' }}>{r.in_currency}{r.foreign ? <span style={{ color: colors.textFaint }}> @ {r.rate}</span> : ''}{r.restated ? <span title="Made when the base currency was different: shown at today's rate" style={{ color: colors.warningText, marginLeft: 6, fontSize: '0.68rem' }}>restated</span> : ''}</td>}
          <td style={{ ...td, ...num }}>{r.debit ? money(r.debit) : ''}</td><td style={{ ...td, ...num }}>{r.credit ? money(r.credit) : ''}</td><td style={{ ...td, ...num }}>{money(r.balance)}</td>
        </tr>
      ))}
      <Total><td style={td} colSpan={(data.has_foreign || data.restated) ? 4 : 3}>Totals</td><td style={{ ...td, ...num }}>{money(data.debit)}</td><td style={{ ...td, ...num }}>{money(data.credit)}</td><td style={{ ...td, ...num }}>{money(data.closing)}</td></Total>
    </Table>
    </>
  );
  if (id === 'trial-balance') return (
    <>
      <Table head={[['Group'], ['Ledger'], ['Opening', true], ['Debit', true], ['Credit', true], ['Closing (Dr +)', true]]}>
        {data.rows.length ? data.rows.map((r) => (
          <tr key={r.ledger_id ?? 'opening-difference'} style={r.placeholder ? { fontStyle: 'italic' } : undefined}><td style={td}>{r.group}</td><td style={td}>{r.ledger}</td><td style={{ ...td, ...num }}>{money(r.opening)}</td><td style={{ ...td, ...num }}>{money(r.debit)}</td><td style={{ ...td, ...num }}>{money(r.credit)}</td><td style={{ ...td, ...num }}>{money(r.closing)}</td></tr>
        )) : <Empty cols={6} />}
        <Total><td style={td} colSpan={4}>Closing totals</td><td style={{ ...td, ...num }}>Dr {money(data.total_debit)}</td><td style={{ ...td, ...num }}>Cr {money(data.total_credit)}</td></Total>
      </Table>
      {data.opening_difference ? (
        <div style={{ ...card, padding: 12, marginTop: 10, fontSize: '0.8rem', color: colors.text }}>
          <strong>Difference in opening balances: {money(Math.abs(data.opening_difference))} {data.opening_difference > 0 ? 'Cr' : 'Dr'}.</strong> It is a placeholder, not a ledger: the opening balances on the ledgers are {money(Math.abs(data.opening_difference))} {data.opening_difference > 0 ? 'heavy on the debit side' : 'heavy on the credit side'}, so it is held here to keep the books in step. It clears when the opposite opening balance (usually Capital) is entered. The ledgers carrying openings:
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{data.opening_balances.map((o) => <li key={o.ledger_id}>{o.ledger} <span style={{ color: colors.textMuted }}>({o.group})</span> — {money(o.amount)} {o.side}</li>)}</ul>
        </div>
      ) : null}
      {!data.balanced && !data.filtered && (
        <div role="alert" style={{ ...card, padding: 12, marginTop: 10, fontSize: '0.8rem', color: colors.dangerText }}>
          <strong>The trial balance does not balance: debits are {money(Math.abs(data.total_debit - data.total_credit))} {data.total_debit > data.total_credit ? 'more' : 'less'} than credits.</strong>
          <div style={{ marginTop: 4, color: colors.text }}>The difference is in the postings, not the opening balances — tell us and we will trace it.</div>
        </div>
      )}
    </>
  );
  if (id === 'profit-loss') {
    const sec = (title, rows) => rows.length > 0 && (
      <>
        <tr style={{ background: colors.tint(0.03) }}><td style={{ ...td, fontWeight: 700 }} colSpan={2}>{title}</td></tr>
        {rows.map((r) => <tr key={r.ledger_id}><td style={td}>{r.ledger}</td><td style={{ ...td, ...num }}>{money(r.amount)}</td></tr>)}
      </>
    );
    const t = data.totals;
    return (
      <>
      {data.paid_not_delivered && (
        <div style={{ ...card, padding: '8px 12px', marginBottom: 10, fontSize: '0.76rem', color: colors.warningText }}>
          Preorders worth {money(data.paid_not_delivered.value)} (before tax, {data.paid_not_delivered.lines} line{data.paid_not_delivered.lines === 1 ? '' : 's'}) are paid for and not yet delivered. Their income is in these figures; the cost of the goods is booked when they are delivered, so profit looks higher until then.
        </div>
      )}
      <Table head={[['Particulars'], ['Amount', true]]}>
        {sec('Direct income', data.sections.income_direct)}{sec('Direct expenses', data.sections.expense_direct)}
        <Total><td style={td}>Gross profit</td><td style={{ ...td, ...num }}>{money(t.gross_profit)}</td></Total>
        {sec('Indirect income', data.sections.income_indirect)}{sec('Indirect expenses', data.sections.expense_indirect)}
        <Total><td style={td}>Net profit</td><td style={{ ...td, ...num, color: t.net_profit < 0 ? colors.danger : colors.successText }}>{money(t.net_profit)}</td></Total>
      </Table>
      </>
    );
  }
  if (id === 'profit-loss-by-cost-centre') {
    if (data.ready === false) return <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Run database script 102_books_dimensions.sql to give the books their cost centres.</p>;
    return (
      <>
        <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: colors.textMuted }}>The first two columns are what a cost centre earned and spent itself; the last three add everything beneath it, so a branch's line covers its utilities, stock, payroll and departments.</p>
        <Table head={[['Cost centre'], ['Own income', true], ['Own expenses', true], ['Income', true], ['Expenses', true], ['Profit', true]]}>
          {data.rows.length ? data.rows.map((r) => (
            <tr key={r.cost_centre_id}>
              <td style={{ ...td, paddingLeft: 12 + r.depth * 18, fontWeight: r.depth === 0 ? 700 : 500 }}>{r.name}{r.purpose && <span style={{ marginLeft: 6, fontSize: '0.68rem', color: colors.textFaint }}>{r.purpose}</span>}</td>
              <td style={{ ...td, ...num }}>{r.own_income ? money(r.own_income) : ''}</td>
              <td style={{ ...td, ...num }}>{r.own_expense ? money(r.own_expense) : ''}</td>
              <td style={{ ...td, ...num }}>{money(r.income)}</td>
              <td style={{ ...td, ...num }}>{money(r.expense)}</td>
              <td style={{ ...td, ...num, color: r.profit < 0 ? colors.danger : colors.successText }}>{money(r.profit)}</td>
            </tr>
          )) : <Empty cols={6} />}
          {data.rows.length > 0 && <Total><td style={td}>Whole business</td><td style={td} /><td style={td} /><td style={{ ...td, ...num }}>{money(data.totals.income)}</td><td style={{ ...td, ...num }}>{money(data.totals.expense)}</td><td style={{ ...td, ...num }}>{money(data.totals.profit)}</td></Total>}
        </Table>
      </>
    );
  }
  if (id === 'balance-sheet') return (
    <>
      <Table head={[['Particulars'], ['Amount', true]]}>
        <tr style={{ background: colors.tint(0.03) }}><td style={{ ...td, fontWeight: 700 }} colSpan={2}>Assets</td></tr>
        {data.assets.map((r, i) => <tr key={i} style={r.placeholder ? { fontStyle: 'italic' } : undefined}><td style={td}>{r.ledger} {r.group && <span style={{ color: colors.textFaint }}>· {r.group}</span>}</td><td style={{ ...td, ...num }}>{money(r.amount)}</td></tr>)}
        <Total><td style={td}>Total assets</td><td style={{ ...td, ...num }}>{money(data.total_assets)}</td></Total>
        <tr style={{ background: colors.tint(0.03) }}><td style={{ ...td, fontWeight: 700 }} colSpan={2}>Liabilities & capital</td></tr>
        {data.liabilities.map((r, i) => <tr key={i} style={r.placeholder ? { fontStyle: 'italic' } : undefined}><td style={td}>{r.ledger} {r.group && <span style={{ color: colors.textFaint }}>· {r.group}</span>}</td><td style={{ ...td, ...num }}>{money(r.amount)}</td></tr>)}
        <Total><td style={td}>Total liabilities & capital</td><td style={{ ...td, ...num }}>{money(data.total_liabilities)}</td></Total>
      </Table>
      {!data.balanced && <p role="alert" style={{ color: colors.dangerText, fontSize: '0.8rem' }}>The two sides differ — the difference is in the postings.</p>}
    </>
  );
  if (id === 'tax-return') return (
    <>
      {data.types.length === 0 && <Table head={[['Tax']]}><Empty cols={1} /></Table>}
      {data.types.map((t) => (
        <div key={t.id} style={{ marginBottom: 14 }}>
          <p style={{ margin: '0 0 6px', fontWeight: 700, color: colors.text, fontSize: '0.85rem' }}>{t.name} <span style={{ color: colors.textFaint, fontWeight: 500 }}>· {t.mode === 'withheld' ? 'withheld' : 'charged on top'}</span></p>
          <Table head={[['Rate'], ['Sales value', true], ['Output tax', true], ['Purchases value', true], ['Input tax', true], ['Net', true]]}>
            {t.brought_forward !== 0 && <tr><td style={td} colSpan={5}>Brought forward</td><td style={{ ...td, ...num }}>{money(t.brought_forward)}</td></tr>}
            {t.rows.length ? t.rows.map((r, i) => (
              <tr key={i}><td style={td}>{r.label}</td>
                <td style={{ ...td, ...num }}>{r.sales_base == null ? '' : money(r.sales_base)}</td><td style={{ ...td, ...num }}>{r.output ? money(r.output) : ''}</td>
                <td style={{ ...td, ...num }}>{r.purchases_base == null ? '' : money(r.purchases_base)}</td><td style={{ ...td, ...num }}>{r.input ? money(r.input) : ''}</td>
                <td style={{ ...td, ...num }}>{money(r.net)}</td></tr>
            )) : <Empty cols={6} />}
            <Total><td style={td} colSpan={5}>Owed to the authority at the end</td><td style={{ ...td, ...num }}>{money(t.closing_owed)}</td></Total>
          </Table>
        </div>
      ))}
      <p style={{ fontSize: '0.78rem', color: colors.textMuted }}>Output {money(data.totals.output)} · Input {money(data.totals.input)} · Owed {money(data.totals.owed)}. Values are in the base currency.</p>
    </>
  );
  if (id === 'withholding') return (
    <>
      <Table head={[['Date'], ['Certificate'], ['Voucher'], ['Direction'], ['Party'], ['Tax'], ['Gross', true], ['Withheld', true], ['Certificate'], ['Credit']]}>
        {data.rows.length ? data.rows.map((r) => (
          <tr key={r.id} onClick={() => nav(`/admin/books/vouchers/${r.voucher_id}`)} style={{ cursor: 'pointer' }}>
            <td style={td}>{r.date}</td><td style={{ ...td, fontFamily: 'monospace' }}>{r.certificate_number}</td><td style={{ ...td, fontFamily: 'monospace' }}>{r.voucher_number}</td>
            <td style={td}>{r.direction === 'receivable' ? 'Held from us' : 'Held by us'}</td><td style={td}>{r.party ?? '—'}</td><td style={td}>{r.tax ?? '—'}</td>
            <td style={{ ...td, ...num }}>{money(r.gross_amount)}</td><td style={{ ...td, ...num }}>{money(r.withheld_amount)}</td><td style={td}>{r.status}</td><td style={td}>{r.credit_status?.replace('_', ' ') ?? '—'}</td>
          </tr>
        )) : <Empty cols={10} />}
      </Table>
      <p style={{ fontSize: '0.78rem', color: colors.textMuted }}>Held from us {money(data.totals.receivable)} · Held by us {money(data.totals.payable)} · {data.totals.awaiting_certificate} certificate(s) still awaited.</p>
    </>
  );
  if (id === 'ratio-analysis') {
    const rv = (r) => (r.value === null || r.value === undefined ? '—' : r.kind === 'ratio' ? `${r.value.toFixed(2)} : 1` : r.kind === 'pct' ? `${r.value.toFixed(2)} %` : `${r.value.toFixed(2)} days`);
    const row = (g) => (
      <div key={g.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: g.sub ? '0 0 6px 18px' : '6px 0 0', fontWeight: g.bold || !g.sub ? 700 : 400, color: g.sub ? colors.textMuted : undefined }}>
        <span>{g.label}{g.note && <span style={{ display: 'block', fontWeight: 400, fontStyle: 'italic', fontSize: '0.74rem', color: colors.textMuted }}>({g.note})</span>}</span>
        <span style={{ ...num, whiteSpace: 'nowrap' }}>{g.amount !== undefined ? (g.amount === null ? '' : `${money(g.amount)} ${g.side}`) : g.value === null ? '—' : g.value.toFixed(2)}</span>
      </div>
    );
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))', gap: 14 }}>
        <div style={{ ...card, padding: 16 }}>
          <p style={{ margin: '0 0 6px', fontWeight: 800, letterSpacing: '0.12em', fontSize: '0.74rem', color: colors.textFaint }}>PRINCIPAL GROUPS</p>
          <p style={{ margin: '0 0 8px', fontSize: '0.72rem', color: colors.textFaint }}>Balances as at {data.to}; sales, purchases and profit for {data.from} to {data.to}.</p>
          {data.groups.map(row)}
        </div>
        <div style={{ ...card, padding: 16 }}>
          <p style={{ margin: '0 0 6px', fontWeight: 800, letterSpacing: '0.12em', fontSize: '0.74rem', color: colors.textFaint }}>PRINCIPAL RATIOS</p>
          {data.ratios.map((r) => (
            <div key={r.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0 0' }}>
              <span style={{ fontWeight: 700 }}>{r.label}{r.note && <span style={{ display: 'block', fontWeight: 400, fontStyle: 'italic', fontSize: '0.74rem', color: colors.textMuted }}>({r.note})</span>}</span>
              <span style={{ ...num, fontWeight: 700, whiteSpace: 'nowrap' }}>{rv(r)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (id === 'reconciliation') return (
    <>
      <Table head={[['Check'], ['Books', true], ['Register', true], ['Difference', true], ['Explained', true], ['Agrees']]}>
        {data.checks.map((c) => (
          <tr key={c.key}>
            <td style={td}>{c.title}<div style={{ fontSize: '0.68rem', color: colors.textFaint }}>{c.note}</div>{c.details?.map((d, i) => <div key={i} style={{ fontSize: '0.68rem', color: colors.dangerText }}>{d}</div>)}</td>
            <td style={{ ...td, ...num }}>{money(c.book)}</td><td style={{ ...td, ...num }}>{money(c.register)}</td>
            <td style={{ ...td, ...num, color: c.ok ? undefined : colors.danger }}>{money(c.difference)}</td><td style={{ ...td, ...num }}>{c.explained ? money(c.explained) : ''}</td>
            <td style={{ ...td, fontWeight: 700, color: c.ok ? colors.successText : colors.dangerText }}>
              {c.ok ? 'Yes' : 'No'}
              {!c.ok && c.key === 'stock-units' && (
                <button type="button" style={{ ...filterStyle, cursor: 'pointer', marginLeft: 8, fontWeight: 600 }}
                  onClick={async () => {
                    try { const r = await booksAPI.refreshStockUnits(); toast.success(r.message); onRefresh(); }
                    catch (e) { toast.error(errMsg(e, 'Could not refresh the stock numbers')); }
                  }}>Refresh</button>
              )}
              {!c.ok && c.key === 'loyalty-points' && (
                <button type="button" style={{ ...filterStyle, cursor: 'pointer', marginLeft: 8, fontWeight: 600 }}
                  onClick={async () => {
                    if (!confirm('Post one Journal that brings the Loyalty Points Liability in line with the points customers hold?')) return;
                    try { const r = await booksAPI.loyaltyTrueUp(); toast.success(r.message); onRefresh(); }
                    catch (e) { toast.error(errMsg(e, 'Could not post the correction')); }
                  }}>Post correction</button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <p role={data.all_ok ? undefined : 'alert'} style={{ fontSize: '0.8rem', color: data.all_ok ? colors.successText : colors.dangerText }}>
        {data.all_ok ? 'Every register agrees with its control ledger.' : 'At least one register does not agree with the books — open the ledger and look for postings made outside the normal vouchers.'}
      </p>
    </>
  );
  // ageing
  return (
    <>
    {data.base_currency && <p style={{ margin: '0 0 8px', fontSize: '0.75rem', color: colors.textMuted }}>The columns are in {data.base_currency} (each bill at the rate on its voucher); bills in other currencies also show their own amount. Bills made when the base currency was different are shown at today's rate.</p>}
    <Table head={[['Party'], ['Current', true], ['1–30', true], ['31–60', true], ['61–90', true], ['90+', true], ['Total', true]]}>
      {data.rows.length ? data.rows.map((r) => (
        <tr key={r.ledger_id}><td style={td}>{r.party}{r.has_foreign && <div style={{ fontSize: '0.7rem', color: colors.textMuted }}>Open: {r.currencies}</div>}<div style={{ fontSize: '0.68rem', color: colors.textFaint }}>{r.bills.map((b) => `${b.voucher_number} (${b.foreign ? `${b.currency} ${money(b.open_fc)} = ${money(b.open)}` : money(b.open)}${b.days_late ? `, ${b.days_late}d late` : ''})`).join(' · ')}</div></td>
          {['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total'].map((k) => <td key={k} style={{ ...td, ...num }}>{r[k] ? money(r[k]) : ''}</td>)}</tr>
      )) : <Empty cols={7} />}
      {data.rows.length > 0 && <Total><td style={td}>Total</td>{['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total'].map((k) => <td key={k} style={{ ...td, ...num }}>{money(data.totals[k])}</td>)}</Total>}
    </Table>
    </>
  );
}

export default function ReportsTab() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const id = REPORTS.some((r) => r.id === params.get('report')) ? params.get('report') : 'day-book';
  const def = REPORTS.find((r) => r.id === id);
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  // Alt+C: what the profit and loss, balance sheet or trial balance says, on the dates shown
  useCalculatorContext(['profit-loss', 'balance-sheet', 'trial-balance'].includes(id) ? { type: 'report', report: id, from, to } : null);
  const [ledgerId, setLedgerId] = useState(params.get('ledger') ?? '');
  const [ledgers, setLedgers] = useState([]);
  const [ccId, setCcId] = useState('');
  const [locId, setLocId] = useState('');
  const [ccOpts, setCcOpts] = useState({ ready: false, data: [] });
  const [branches, setBranches] = useState([]);
  const dimmed = ['day-book', 'ledger', 'trial-balance', 'profit-loss'].includes(id);
  const [result, setResult] = useState(null);   // { id, data }: a report never draws another report's figures
  const seq = useRef(0);
  const data = result && result.id === id ? result.data : null;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    costCentresAPI.options().then(setCcOpts).catch(() => {});
    locationsAPI.getAdmin().then((l) => setBranches((l.locations ?? []).filter((x) => x.is_active !== false))).catch(() => {});
  }, []);
  useEffect(() => { booksAPI.ledgers({ all: 1 }).then((r) => setLedgers(Array.isArray(r) ? r : r.data ?? [])).catch(() => {}); }, []);

  const query = useCallback(() => ({ ...(def.asOf ? { to } : { from, to }), ...(id === 'ledger' ? { ledger_id: ledgerId } : {}), ...((dimmed || def.byCostCentre) && locId ? { location_id: locId } : {}), ...(dimmed && ccId ? { cost_centre_id: ccId } : {}) }), [def, from, to, id, ledgerId, dimmed, ccId, locId]);

  const run = useCallback(async () => {
    if (def.custom) return;
    const mine = ++seq.current;   // an older answer arriving late is dropped
    if (id === 'ledger' && !ledgerId) { setResult(null); return; }
    setLoading(true); setError(null);
    try { const d = await booksAPI.report(id, query()); if (mine === seq.current) setResult({ id, data: d }); }
    catch (e) { if (mine === seq.current) { setResult(null); setError(errMsg(e, 'Could not run the report')); toast.error(errMsg(e, 'Could not run the report')); } }
    finally { if (mine === seq.current) setLoading(false); }
  }, [id, ledgerId, query, def.custom]);

  useEffect(() => { run(); }, [run]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {REPORTS.map((r) => (
          <button key={r.id} type="button" onClick={() => { const p = new URLSearchParams(params); p.set('report', r.id); setParams(p, { replace: true }); }}
            style={{ ...filterStyle, cursor: 'pointer', fontWeight: r.id === id ? 700 : 500, background: r.id === id ? colors.tint(0.1) : 'var(--surface-card, #fff)', color: r.id === id ? colors.primaryDeep : colors.text }}>
            {r.label}
          </button>
        ))}
      </div>
      {def.custom && <StockMovement />}
      {!def.custom && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        {id === 'ledger' && (
          <select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} style={{ ...filterStyle, minWidth: 220 }} aria-label="Ledger">
            <option value="">Choose a ledger…</option>
            {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        {(dimmed || def.byCostCentre) && branches.length > 1 && (
          <select value={locId} onChange={(e) => setLocId(e.target.value)} style={filterStyle} aria-label="Branch">
            <option value="">All branches</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        {dimmed && ccOpts.ready && (
          <select value={ccId} onChange={(e) => setCcId(e.target.value)} style={{ ...filterStyle, minWidth: 180 }} aria-label="Cost centre">
            <option value="">All cost centres</option>
            {ccOpts.data.map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.name}</option>)}
          </select>
        )}
        {!def.asOf && <><label style={{ fontSize: '0.75rem', color: colors.textMuted }}>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={filterStyle} /></label></>}
        <label style={{ fontSize: '0.75rem', color: colors.textMuted }}>{def.asOf ? 'As of' : 'To'} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={filterStyle} /></label>
        <span style={{ flex: 1 }} />
        <ExportMenu onExport={(format) => booksAPI.exportReport(id, { ...query(), format })} />
      </div>}
      {!def.custom && error && <p role="alert" style={{ color: colors.dangerText, fontSize: '0.8rem' }}>{error}</p>}
      {def.custom ? null : loading && !data ? <p style={{ color: colors.textMuted }}>Running…</p>
        : data ? <View id={id} data={data} nav={nav} onRefresh={run} />
        : id === 'ledger' && <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Choose a ledger to see its statement.</p>}
    </div>
  );
}
