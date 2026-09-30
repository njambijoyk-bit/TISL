import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Coins, History, Landmark, Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import booksAPI from '../../../../_shared/api/books';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import SimpleTable from '../ui/SimpleTable';
import { Toolbar } from '../ui/HubHeader';
import { btnGhost, btnPrimary, colors } from '../../../../_shared/theme/tokens';
import { Chip, ExportMenu } from './booksUi';
import { money, filterStyle } from './booksFmt';

/** `newPath` swaps the "choose a type" button for a plain button to a dedicated screen (e.g. the Purchases page). */
export default function VouchersTab({ canWrite, baseType = '', newPath = null, newLabel = 'New voucher', viewPath = null }) {
  const nav = useNavigate();
  const [types, setTypes] = useState([]);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ voucher_type_id: '', status: '', search: '', from: '', to: '' });
  const [page, setPage] = useState(1);

  useEffect(() => { booksAPI.types().then(setTypes).catch((e) => toast.error(errMsg(e, 'Could not load voucher types'))); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await booksAPI.vouchers({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), ...(baseType ? { type: baseType } : {}), page });
      setRows(res.data ?? []);
      setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
    } catch (e) { toast.error(errMsg(e, 'Could not load vouchers')); }
    finally { setLoading(false); }
  }, [f, page, baseType]);

  useEffect(() => { const t = setTimeout(load, f.search ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => { setPage(1); setF((x) => ({ ...x, [k]: e.target.value })); };

  const columns = [
    { key: 'date', label: 'Date', render: (v) => v.date },
    { key: 'voucher_number', label: 'Number', render: (v) => <strong style={{ color: colors.text, fontFamily: 'monospace' }}>{v.voucher_number}</strong> },
    { key: 'type', label: 'Type', render: (v) => v.type?.name },
    { key: 'party', label: 'Party', render: (v) => v.party_ledger?.name ?? '—' },
    { key: 'branch', label: 'Branch', render: (v) => v.location?.code ?? v.location?.name ?? '—' },
    { key: 'status', label: 'Status', render: (v) => <><Chip status={v.status} /> {v.fulfilment_status && v.fulfilment_status !== 'closed' && <Chip status={v.fulfilment_status} />}</> },
    { key: 'total', label: 'Amount', align: 'right', render: (v) => <span style={{ fontVariantNumeric: 'tabular-nums', textDecoration: v.status === 'cancelled' ? 'line-through' : 'none' }}>{v.currency?.code} {money(v.total_amount)}</span> },
  ];

  return (
    <div>
      <Toolbar right={<>
        <Link to="/admin/books/cash" style={{ ...btnGhost, textDecoration: 'none' }}><Coins size={14} /> Cash</Link>
        <Link to="/admin/books/cheques" style={{ ...btnGhost, textDecoration: 'none' }}><Landmark size={14} /> Cheques</Link>
        <Link to="/admin/books/edit-log" style={{ ...btnGhost, textDecoration: 'none' }}><History size={14} /> Edit log</Link>
        <ExportMenu label="Export list" onExport={(format) => booksAPI.exportVouchers({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), format })} />
        {canWrite && newPath && (
          <button type="button" style={btnPrimary} onClick={() => nav(newPath)}><Plus size={14} /> {newLabel}</button>
        )}
        {canWrite && !newPath && (
          <label style={{ ...btnPrimary, position: 'relative' }}>
            <Plus size={14} /> New voucher
            <select value="" onChange={(e) => e.target.value && nav(`/admin/books/vouchers/new?type=${e.target.value}`)} aria-label="New voucher"
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}>
              <option value="">Choose a type…</option>
              {types.filter((t) => t.is_active && (!baseType || t.base_type === baseType)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        )}
      </>}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textFaint }} />
          <input value={f.search} onChange={set('search')} placeholder="Number, party, reference…" style={{ ...filterStyle, paddingLeft: 30, width: 220 }} />
        </div>
        {!baseType && <select value={f.voucher_type_id} onChange={set('voucher_type_id')} style={filterStyle} aria-label="Type">
          <option value="">All types</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>}
        <select value={f.status} onChange={set('status')} style={filterStyle} aria-label="Status">
          <option value="">Any status</option>
          <option value="posted">Posted</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input type="date" value={f.from} onChange={set('from')} style={filterStyle} aria-label="From" />
        <input type="date" value={f.to} onChange={set('to')} style={filterStyle} aria-label="To" />
      </Toolbar>
      <SimpleTable columns={columns} rows={rows} loading={loading} onRowClick={(v) => nav(viewPath ? viewPath(v) : `/admin/books/vouchers/${v.id}`)}
        empty="No vouchers match. Create the first one with “New voucher”." />
      {meta.last_page > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center', marginTop: 14, fontSize: '0.8rem', color: colors.textMuted }}>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ ...filterStyle, cursor: 'pointer' }}>Previous</button>
          Page {meta.current_page} of {meta.last_page} · {meta.total} vouchers
          <button type="button" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)} style={{ ...filterStyle, cursor: 'pointer' }}>Next</button>
        </div>
      )}
    </div>
  );
}
