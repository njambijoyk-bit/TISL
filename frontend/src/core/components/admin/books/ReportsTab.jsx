import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { card, colors } from '../../../../_shared/theme/tokens';
import { ExportMenu } from './booksUi';
import { money, filterStyle, yearStart, today } from './booksFmt';

const REPORTS = [
  { id: 'day-book', label: 'Day book', range: true },
  { id: 'ledger', label: 'Ledger statement', range: true },
  { id: 'trial-balance', label: 'Trial balance', range: true },
  { id: 'profit-loss', label: 'Profit & loss', range: true },
  { id: 'balance-sheet', label: 'Balance sheet', asOf: true },
  { id: 'receivables', label: 'Receivables ageing', asOf: true },
  { id: 'payables', label: 'Payables ageing', asOf: true },
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

function View({ id, data, nav }) {
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
    <Table head={[['Date'], ['Number'], ['Type'], ['Debit', true], ['Credit', true], ['Balance (Dr +)', true]]}>
      <tr style={{ background: colors.tint(0.02) }}><td style={td} colSpan={5}>Opening balance</td><td style={{ ...td, ...num }}>{money(data.opening)}</td></tr>
      {data.rows.map((r, i) => (
        <tr key={i} onClick={() => nav(`/admin/books/vouchers/${r.voucher_id}`)} style={{ cursor: 'pointer' }}>
          <td style={td}>{r.date}</td><td style={{ ...td, fontFamily: 'monospace' }}>{r.voucher_number}</td><td style={td}>{r.type}</td>
          <td style={{ ...td, ...num }}>{r.debit ? money(r.debit) : ''}</td><td style={{ ...td, ...num }}>{r.credit ? money(r.credit) : ''}</td><td style={{ ...td, ...num }}>{money(r.balance)}</td>
        </tr>
      ))}
      <Total><td style={td} colSpan={3}>Totals</td><td style={{ ...td, ...num }}>{money(data.debit)}</td><td style={{ ...td, ...num }}>{money(data.credit)}</td><td style={{ ...td, ...num }}>{money(data.closing)}</td></Total>
    </Table>
  );
  if (id === 'trial-balance') return (
    <>
      <Table head={[['Group'], ['Ledger'], ['Opening', true], ['Debit', true], ['Credit', true], ['Closing (Dr +)', true]]}>
        {data.rows.length ? data.rows.map((r) => (
          <tr key={r.ledger_id}><td style={td}>{r.group}</td><td style={td}>{r.ledger}</td><td style={{ ...td, ...num }}>{money(r.opening)}</td><td style={{ ...td, ...num }}>{money(r.debit)}</td><td style={{ ...td, ...num }}>{money(r.credit)}</td><td style={{ ...td, ...num }}>{money(r.closing)}</td></tr>
        )) : <Empty cols={6} />}
        <Total><td style={td} colSpan={4}>Closing totals</td><td style={{ ...td, ...num }}>Dr {money(data.total_debit)}</td><td style={{ ...td, ...num }}>Cr {money(data.total_credit)}</td></Total>
      </Table>
      {!data.balanced && <p role="alert" style={{ color: colors.dangerText, fontSize: '0.8rem' }}>The trial balance does not balance — check the opening balances.</p>}
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
      <Table head={[['Particulars'], ['Amount', true]]}>
        {sec('Direct income', data.sections.income_direct)}{sec('Direct expenses', data.sections.expense_direct)}
        <Total><td style={td}>Gross profit</td><td style={{ ...td, ...num }}>{money(t.gross_profit)}</td></Total>
        {sec('Indirect income', data.sections.income_indirect)}{sec('Indirect expenses', data.sections.expense_indirect)}
        <Total><td style={td}>Net profit</td><td style={{ ...td, ...num, color: t.net_profit < 0 ? colors.danger : colors.successText }}>{money(t.net_profit)}</td></Total>
      </Table>
    );
  }
  if (id === 'balance-sheet') return (
    <>
      <Table head={[['Particulars'], ['Amount', true]]}>
        <tr style={{ background: colors.tint(0.03) }}><td style={{ ...td, fontWeight: 700 }} colSpan={2}>Assets</td></tr>
        {data.assets.map((r, i) => <tr key={i}><td style={td}>{r.ledger} <span style={{ color: colors.textFaint }}>· {r.group}</span></td><td style={{ ...td, ...num }}>{money(r.amount)}</td></tr>)}
        <Total><td style={td}>Total assets</td><td style={{ ...td, ...num }}>{money(data.total_assets)}</td></Total>
        <tr style={{ background: colors.tint(0.03) }}><td style={{ ...td, fontWeight: 700 }} colSpan={2}>Liabilities & capital</td></tr>
        {data.liabilities.map((r, i) => <tr key={i}><td style={td}>{r.ledger} <span style={{ color: colors.textFaint }}>· {r.group}</span></td><td style={{ ...td, ...num }}>{money(r.amount)}</td></tr>)}
        <Total><td style={td}>Total liabilities & capital</td><td style={{ ...td, ...num }}>{money(data.total_liabilities)}</td></Total>
      </Table>
      {!data.balanced && <p role="alert" style={{ color: colors.dangerText, fontSize: '0.8rem' }}>The two sides differ — usually an unbalanced opening balance.</p>}
    </>
  );
  // ageing
  return (
    <Table head={[['Party'], ['Current', true], ['1–30', true], ['31–60', true], ['61–90', true], ['90+', true], ['Total', true]]}>
      {data.rows.length ? data.rows.map((r) => (
        <tr key={r.ledger_id}><td style={td}>{r.party}<div style={{ fontSize: '0.68rem', color: colors.textFaint }}>{r.bills.map((b) => `${b.voucher_number} (${money(b.open)}${b.days_late ? `, ${b.days_late}d late` : ''})`).join(' · ')}</div></td>
          {['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total'].map((k) => <td key={k} style={{ ...td, ...num }}>{r[k] ? money(r[k]) : ''}</td>)}</tr>
      )) : <Empty cols={7} />}
      {data.rows.length > 0 && <Total><td style={td}>Total</td>{['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'total'].map((k) => <td key={k} style={{ ...td, ...num }}>{money(data.totals[k])}</td>)}</Total>}
    </Table>
  );
}

export default function ReportsTab() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const id = REPORTS.some((r) => r.id === params.get('report')) ? params.get('report') : 'day-book';
  const def = REPORTS.find((r) => r.id === id);
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(today());
  const [ledgerId, setLedgerId] = useState(params.get('ledger') ?? '');
  const [ledgers, setLedgers] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { booksAPI.ledgers({ all: 1 }).then((r) => setLedgers(Array.isArray(r) ? r : r.data ?? [])).catch(() => {}); }, []);

  const query = useCallback(() => ({ ...(def.asOf ? { to } : { from, to }), ...(id === 'ledger' ? { ledger_id: ledgerId } : {}) }), [def, from, to, id, ledgerId]);

  const run = useCallback(async () => {
    if (id === 'ledger' && !ledgerId) { setData(null); return; }
    setLoading(true); setError(null);
    try { setData(await booksAPI.report(id, query())); }
    catch (e) { setData(null); setError(errMsg(e, 'Could not run the report')); toast.error(errMsg(e, 'Could not run the report')); }
    finally { setLoading(false); }
  }, [id, ledgerId, query]);

  useEffect(() => { run(); }, [run]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {REPORTS.map((r) => (
          <button key={r.id} type="button" onClick={() => { const p = new URLSearchParams(params); p.set('report', r.id); setParams(p, { replace: true }); }}
            style={{ ...filterStyle, cursor: 'pointer', fontWeight: r.id === id ? 700 : 500, background: r.id === id ? colors.tint(0.1) : 'white', color: r.id === id ? colors.primaryDeep : colors.textMuted }}>
            {r.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        {id === 'ledger' && (
          <select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} style={{ ...filterStyle, minWidth: 220 }} aria-label="Ledger">
            <option value="">Choose a ledger…</option>
            {ledgers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        {!def.asOf && <><label style={{ fontSize: '0.75rem', color: colors.textMuted }}>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={filterStyle} /></label></>}
        <label style={{ fontSize: '0.75rem', color: colors.textMuted }}>{def.asOf ? 'As of' : 'To'} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={filterStyle} /></label>
        <span style={{ flex: 1 }} />
        <ExportMenu onExport={(format) => booksAPI.exportReport(id, { ...query(), format })} />
      </div>
      {error && <p role="alert" style={{ color: colors.dangerText, fontSize: '0.8rem' }}>{error}</p>}
      {loading && !data ? <p style={{ color: colors.textMuted }}>Running…</p>
        : data ? <View id={id} data={data} nav={nav} />
        : id === 'ledger' && <p style={{ color: colors.textMuted, fontSize: '0.85rem' }}>Choose a ledger to see its statement.</p>}
    </div>
  );
}
