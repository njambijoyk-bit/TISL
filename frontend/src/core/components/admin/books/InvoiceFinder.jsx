import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import booksAPI from '../../../../_shared/api/books';
import { card, colors } from '../../../../_shared/theme/tokens';
import { money } from './booksFmt';

/**
 * Start a credit note / debit note from the invoice it reverses: search the live sales invoices (or purchases),
 * pick one, and the return screen fills in its lines, prices and taxes.
 */
export default function InvoiceFinder({ base }) {
  const nav = useNavigate();
  const sale = base === 'credit_note';
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => {
      booksAPI.vouchers({ type: sale ? 'sales' : 'purchase', status: 'posted', search: q || undefined, per_page: 8 })
        .then((d) => setRows(d.data ?? [])).catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, sale]);

  return (
    <div style={{ ...card, padding: 16 }}>
      <p style={{ margin: '0 0 4px', fontWeight: 700, color: colors.text }}>Against {sale ? 'a sales invoice' : 'a purchase'} (recommended)</p>
      <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: colors.textMuted }}>Pick the {sale ? 'invoice' : 'purchase'} and its items, prices and taxes come in; you tick what to reverse. Or carry on below for a {sale ? 'credit' : 'debit'} that is not against one.</p>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search by number, ${sale ? 'customer' : 'supplier'} or reference…`}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.tint(0.2)}`, background: 'transparent', color: 'inherit', fontSize: '0.85rem' }} aria-label="Find an invoice" />
      <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
        {rows.map((v) => (
          <button key={v.id} type="button" onClick={() => nav(`/admin/books/vouchers/${v.id}/return`)}
            style={{ display: 'flex', gap: 10, alignItems: 'center', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: `1px solid ${colors.tint(0.08)}`, background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: '0.8rem' }}>
            <strong style={{ fontFamily: 'monospace' }}>{v.voucher_number}</strong>
            <span style={{ flex: 1, color: colors.textMuted }}>{v.party_ledger?.name ?? '—'} · {v.date}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(v.total_amount)}</span>
          </button>
        ))}
        {rows.length === 0 && <span style={{ fontSize: '0.78rem', color: colors.textFaint }}>No live {sale ? 'sales invoices' : 'purchases'} found.</span>}
      </div>
    </div>
  );
}
