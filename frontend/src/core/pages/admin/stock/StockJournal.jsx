import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess } from '../../../components/admin/ui/HubHeader';
import { money } from '../../../components/admin/books/booksFmt';
import { stockJournalAPI } from '../../../../_shared/api/stockOps';
import useAuthStore from '../../../../_shared/store/authStore';
import { canReadFinance } from '../../../../_shared/lib/roles';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnGhost, card, colors, input } from '../../../../_shared/theme/tokens';

/** The stock journal: every movement of stock, in and out, with what caused it. Filter by item, kind, branch and date. */

const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
const td = { padding: '8px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}` };
const sel = { ...input, padding: '7px 10px', width: 'auto' };

export default function StockJournal() {
  const user = useAuthStore((s) => s.user);
  const [f, setF] = useState({ q: '', type: '', location_id: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setPage(1); };

  const load = useCallback(() => {
    setLoading(true);
    const params = Object.fromEntries(Object.entries({ ...f, page }).filter(([, v]) => v !== '' && v != null));
    stockJournalAPI.list(params).then(setData).catch((e) => toast.error(errMsg(e, 'Could not load the journal'))).finally(() => setLoading(false));
  }, [f, page]);
  useEffect(() => { const t = setTimeout(load, f.q ? 250 : 0); return () => clearTimeout(t); }, [load, f.q]);

  if (!canReadFinance(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="the stock journal" /></div></AdminLayout>;
  const pages = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Stock journal" description="Every movement of stock, newest first: sales, purchases, transfers, counts, production, write-offs." />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 14px' }}>
          <input value={f.q} onChange={(e) => set('q', e.target.value)} placeholder="Item, SKU or batch" aria-label="Search" style={{ ...sel, minWidth: 200 }} />
          <select value={f.type} onChange={(e) => set('type', e.target.value)} aria-label="Kind" style={sel}>
            <option value="">All kinds</option>{Object.entries(data?.types ?? {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={f.location_id} onChange={(e) => set('location_id', e.target.value)} aria-label="Branch" style={sel}>
            <option value="">All branches</option>{(data?.branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} aria-label="From" style={sel} />
          <input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} aria-label="To" style={sel} />
        </div>
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          {loading && !data ? <p style={{ padding: 20, color: colors.textMuted }}>Loading…</p> : !(data?.rows?.length) ? (
            <p style={{ padding: 20, margin: 0, color: colors.textMuted, fontSize: '0.85rem' }}>No movements match.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Date</th><th style={th}>Item</th><th style={th}>Kind</th><th style={th}>Branch</th><th style={th}>Batch</th><th style={{ ...th, textAlign: 'right' }}>Qty</th><th style={{ ...th, textAlign: 'right' }}>Value</th><th style={th}>Document</th></tr></thead>
              <tbody>{data.rows.map((r) => (
                <tr key={r.id}>
                  <td style={td}>{String(r.date).slice(0, 10)}</td>
                  <td style={td}>{r.product}{r.variant && r.variant !== 'Standard' ? ` — ${r.variant}` : ''}</td>
                  <td style={td}>{r.label}</td><td style={td}>{r.location}</td><td style={td}>{r.batch_no ?? '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: r.quantity < 0 ? '#b91c1c' : '#15803d' }}>{r.quantity > 0 ? '+' : ''}{r.quantity}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{money(r.value)}</td>
                  <td style={td}>{r.voucher_id ? <Link to={`/admin/books/vouchers/${r.voucher_id}`}>{r.voucher_number}</Link> : (r.ref_type ? `${r.ref_type} #${r.ref_id}` : '—')}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
        {data && data.total > 50 && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 14, fontSize: '0.8rem' }}>
            <button type="button" style={btnGhost} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button type="button" style={btnGhost} disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
