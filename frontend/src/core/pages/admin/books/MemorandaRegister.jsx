import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../../_shared/components/layout/AdminLayout';
import HubHeader, { NoAccess, Toolbar } from '../../../components/admin/ui/HubHeader';
import SimpleTable from '../../../components/admin/ui/SimpleTable';
import memorandaAPI from '../../../../_shared/api/memoranda';
import useAuthStore from '../../../../_shared/store/authStore';
import { errMsg } from '../../../../_shared/store/helpers/apiState';
import { btnPrimary, colors } from '../../../../_shared/theme/tokens';
import { money, filterStyle } from '../../../components/admin/books/booksFmt';
import { StateChip, PurposeChip, Direction } from '../../../components/admin/books/memoBits';
import { PURPOSES } from '../../../components/admin/books/memoPurposes';

import { isStaff } from '../../../../_shared/lib/roles';
/** The memorandum register: every note with debit and credit lines that posts nothing, open ones first to work through. */
export default function MemorandaRegister() {
  const nav = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ state: 'open', purpose: '', q: '' });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await memorandaAPI.list({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page });
      setRows(res.data ?? []);
      setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
    } catch (e) { toast.error(errMsg(e, 'Could not load the memoranda')); }
    finally { setLoading(false); }
  }, [f, page]);
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => { setPage(1); setF((x) => ({ ...x, [k]: e.target.value })); };

  const columns = [
    { key: 'number', label: 'Number', render: (m) => <Link to={`/admin/books/vouchers/${m.id}`} onClick={(e) => e.stopPropagation()} style={{ fontFamily: 'monospace', fontWeight: 700, color: colors.text }}>{m.number}</Link> },
    { key: 'date', label: 'Date', render: (m) => m.date },
    { key: 'purpose', label: 'For', render: (m) => <PurposeChip label={m.purpose_label} /> },
    { key: 'narration', label: 'What it says', render: (m) => <span style={{ display: 'block', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.narration}>{m.narration}</span> },
    { key: 'about', label: 'About', render: (m) => (m.about ? <Link to={`/admin/books/vouchers/${m.about.id}`} onClick={(e) => e.stopPropagation()} style={{ fontFamily: 'monospace', color: colors.text }}>{m.about.number}</Link> : <span style={{ color: colors.textFaint }}>—</span>) },
    { key: 'amount', label: 'Amount', align: 'right', render: (m) => <span style={{ fontVariantNumeric: 'tabular-nums' }}><Direction direction={m.direction} />{Number(m.amount) ? `${m.currency ?? ''} ${money(m.amount)}` : '—'}</span> },
    { key: 'lines', label: 'Lines', render: (m) => (m.lines.length ? <span style={{ fontSize: '0.74rem', color: m.balanced ? 'var(--status-success, #059669)' : 'var(--status-warning, #b45309)' }}>{m.lines.length} · {m.balanced ? 'balanced' : 'not balanced'}</span> : <span style={{ color: colors.textFaint, fontSize: '0.74rem' }}>none yet</span>) },
    { key: 'state', label: 'State', render: (m) => <StateChip state={m.state} /> },
    { key: 'by', label: 'By', render: (m) => m.created_by ?? '—' },
  ];

  if (!isStaff(user)) return <AdminLayout><div style={{ padding: 32 }}><NoAccess what="memoranda" /></div></AdminLayout>;
  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Memoranda" description="Notes with debit and credit lines that post nothing to the books. Finance turns the ones that are real into a journal." />
        <Toolbar right={<button type="button" style={btnPrimary} onClick={() => nav('/admin/books/memoranda/new')}><Plus size={14} /> New memorandum</button>}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['open', 'Open'], ['converted', 'Converted'], ['dismissed', 'Dismissed'], ['', 'All']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setPage(1); setF((x) => ({ ...x, state: k })); }} style={{ ...filterStyle, cursor: 'pointer', fontWeight: f.state === k ? 700 : 500, background: f.state === k ? colors.tint(0.1) : 'var(--surface-card, #fff)' }}>{l}</button>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textFaint }} />
            <input value={f.q} onChange={set('q')} placeholder="Number or words…" style={{ ...filterStyle, paddingLeft: 30, width: 220 }} />
          </div>
          <select value={f.purpose} onChange={set('purpose')} style={filterStyle} aria-label="Purpose"><option value="">Any purpose</option>{PURPOSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Toolbar>
        <SimpleTable columns={columns} rows={rows} loading={loading} onRowClick={(m) => nav(`/admin/books/vouchers/${m.id}`)} empty={f.state === 'open' ? 'Nothing is waiting. Write a memorandum with “New memorandum”, or from the Memo tab on any page.' : 'No memoranda match.'} />
        {meta.last_page > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, alignItems: 'center', marginTop: 14, fontSize: '0.8rem', color: colors.textMuted }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} style={{ ...filterStyle, cursor: 'pointer' }}>Previous</button>
            Page {meta.current_page} of {meta.last_page} · {meta.total} memoranda
            <button type="button" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)} style={{ ...filterStyle, cursor: 'pointer' }}>Next</button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
