import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import booksAPI from '../../../../_shared/api/books';
import { useCompany } from '../../../../_shared/lib/useCompany';
import { card, colors } from '../../../../_shared/theme/tokens';
import { newVoucherPath } from './booksFmt';

const MASTERS = [
  ['Chart of accounts — groups & ledgers', '/admin/books?tab=accounts'],
  ['Voucher types & numbering', '/admin/books?tab=settings&sub=numbering'],
  ['Payment methods', '/admin/books?tab=settings&sub=methods'],
  ['Default ledgers', '/admin/books?tab=settings&sub=defaults'],
  ['Period control & financial years', '/admin/books?tab=settings&sub=period'],
  ['Company', '/admin/books?tab=settings&sub=company'],
  ['Taxes — types, rates, rules', '/admin/tax'],
  ['Withholding — classifications, certificates, credits', '/admin/withholding'],
  ['Shipping & delivery', '/admin/settings/shipping'],
  ['Loyalty points & redemption rules', '/admin/loyalty/settings'],
  ['Referral programme & promo codes', '/admin/referrals'],
];

const REPORTS = [
  ['Day book', 'day-book'], ['Ledger statement', 'ledger'], ['Trial balance', 'trial-balance'], ['Profit & loss', 'profit-loss'], ['Balance sheet', 'balance-sheet'],
  ['Stock movement', 'stock-movement'], ['Receivables ageing', 'receivables'], ['Payables ageing', 'payables'], ['Tax return', 'tax-return'], ['Withholding certificates', 'withholding'], ['Reconciliation', 'reconciliation'],
];

const GROUPS = [
  ['Sales', ['quotation', 'sales_order', 'delivery_note', 'sales', 'cash_sale', 'credit_note']],
  ['Purchases', ['purchase_order', 'receipt_note', 'purchase', 'debit_note']],
  ['Accounts', ['receipt', 'payment', 'journal', 'contra', 'memorandum']],
];

const Item = ({ children, onClick, hint }) => (
  <button type="button" onClick={onClick}
    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', fontSize: '0.84rem', color: colors.text, fontFamily: 'inherit' }}
    onMouseEnter={(e) => { e.currentTarget.style.background = colors.tint(0.08); }} onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
    {children}{hint && <span style={{ color: colors.textFaint, fontSize: '0.7rem' }}> · {hint}</span>}
  </button>
);

const Column = ({ title, children }) => (
  <div style={{ ...card, padding: '14px 8px 10px' }}>
    <p style={{ margin: '0 10px 8px', fontSize: '0.7rem', fontWeight: 800, color: colors.primaryDeep, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</p>
    {children}
  </div>
);

const Sub = ({ children }) => <p style={{ margin: '10px 10px 2px', fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, textTransform: 'uppercase' }}>{children}</p>;

/** The Gateway: everything in the books in three columns — Masters (what things are), Transactions (vouchers), Reports. */
export default function GatewayTab({ canWrite }) {
  const nav = useNavigate();
  const company = useCompany();
  const [types, setTypes] = useState([]);
  const [year, setYear] = useState(null);
  useEffect(() => {
    booksAPI.types().then((t) => setTypes(Array.isArray(t) ? t : t.data ?? [])).catch(() => {});
    booksAPI.settings().then((s) => {
      const t = new Date().toLocaleDateString('en-CA');
      setYear((s.years ?? []).find((y) => y.start_date <= t && y.end_date >= t) ?? null);
    }).catch(() => {});
  }, []);
  const byBase = Object.fromEntries(types.filter((t) => t.is_active).map((t) => [t.base_type, t]));
  // a register for every active voucher type, in the order of the groups above; types outside them follow
  const grouped = GROUPS.flatMap(([, bases]) => bases);
  const registerTypes = types.filter((t) => t.is_active).sort((a, b) => {
    const ia = grouped.indexOf(a.base_type); const ib = grouped.indexOf(b.base_type);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.id - b.id;
  });

  return (
    <div>
      <div style={{ ...card, padding: '12px 16px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <p style={{ margin: 0, fontWeight: 800, color: colors.text }}>{company.name || 'Your company'}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>Gateway of Books</p>
        </div>
        <p style={{ margin: 0, fontSize: '0.78rem', color: colors.textMuted, textAlign: 'right' }}>
          {year ? <>Financial year <strong>{year.name}</strong> · {year.start_date} → {year.end_date}{year.is_closed ? ' (closed)' : ''}</> : 'No financial year covers today'}
          <br />{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 14 }}>
          <Column title="Transactions">
            {GROUPS.map(([title, bases]) => (
              <div key={title}>
                <Sub>{title}</Sub>
                {bases.filter((b) => byBase[b]).map((b) => (
                  <Item key={b} onClick={() => (canWrite ? nav(newVoucherPath(byBase[b])) : nav('/admin/books?tab=vouchers'))}>{byBase[b].name}</Item>
                ))}
              </div>
            ))}
          </Column>
          <Column title="Masters">
            {MASTERS.map(([label, to]) => <Item key={label} onClick={() => nav(to)}>{label}</Item>)}
          </Column>
        </div>

        <Column title="Registers">
          <Item onClick={() => nav('/admin/books?tab=vouchers')}>All vouchers</Item>
          {registerTypes.map((t) => <Item key={t.id} onClick={() => nav(`/admin/books?tab=vouchers&voucher_type_id=${t.id}`)}>{t.name} Register</Item>)}
          <Item onClick={() => nav('/admin/orders')}>Orders register</Item>
          <Item onClick={() => nav('/admin/books?tab=gifts')}>Gift vouchers</Item>
          <Item onClick={() => nav('/admin/books/cheques')}>Cheque register</Item>
          <Item onClick={() => nav('/admin/books/cash')}>Cash count &amp; driver cash</Item>
          <Item onClick={() => nav('/admin/books/edit-log')}>Edit log</Item>
        </Column>

        <Column title="Reports">
          {REPORTS.map(([label, id]) => <Item key={id} onClick={() => nav(`/admin/books?tab=reports&report=${id}`)}>{label}</Item>)}
        </Column>
      </div>
    </div>
  );
}
