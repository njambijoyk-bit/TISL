import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { Toolbar } from '../../../core/components/admin/ui/HubHeader';
import SimpleTable from '../../../core/components/admin/ui/SimpleTable';
import boardsAPI from '../../../_shared/api/boards';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import useAuthStore from '../../../_shared/store/authStore';
import { btnPrimary, btnGhost, colors } from '../../../_shared/theme/tokens';
import { filterStyle } from '../../../core/components/admin/books/booksFmt';
import BoardChip from '../../components/BoardChip';

const FILTERS = [['', 'All'], ['pending', 'Waiting for approval'], ['approved', 'Approved'], ['draft', 'Drafts'], ['rejected', 'Not approved']];

/** The brand's boards: collections of pins. Sales and finance boards wait here for a manager, admin or super admin to approve them. */
export default function BoardList() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approval, setApproval] = useState('');
  const [customers, setCustomers] = useState(false);
  const [q, setQ] = useState('');
  const isSuper = useAuthStore((st) => st.user?.role) === 'super_admin';
  const [bin, setBin] = useState(false);   // the recycle bin: boards that were deleted

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await boardsAPI.list({ trashed: bin ? 1 : undefined, official: customers ? 0 : undefined, approval: !customers && approval ? approval : undefined, q: q || undefined })).data); }
    catch (e) { toast.error(errMsg(e, 'Could not load the boards')); }
    finally { setLoading(false); }
  }, [approval, customers, q, bin]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, id) => { try { const r = await fn(id); toast.success(r.message); load(); } catch (e) { toast.error(errMsg(e, 'That did not work')); } };
  const purge = (b) => { if (window.confirm(`Delete "${b.title}" for good? Its followers, comments and likes go too (the pins stay). This cannot be undone.`)) act(boardsAPI.purge, b.id); };

  const columns = [
    { key: 'title', label: 'Board', render: (b) => <div><strong style={{ color: colors.primary }}>{b.title}</strong>{b.description && <div style={{ fontSize: '0.72rem', color: colors.textFaint }}>{b.description}</div>}</div> },
    { key: 'state', label: 'State', render: (b) => <BoardChip board={b} /> },
    { key: 'owner', label: 'Made by', render: (b) => b.owner_name ?? '—' },
    { key: 'pins', label: 'Pins', align: 'right', render: (b) => b.pins_count },
    ...(bin ? [{ key: 'bin', label: '', align: 'right', render: (b) => (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        <button type="button" style={{ ...btnGhost, padding: '4px 9px', fontSize: '0.72rem' }} onClick={() => act(boardsAPI.restore, b.id)}><RotateCcw size={12} /> Restore</button>
        {isSuper && <button type="button" style={{ ...btnGhost, padding: '4px 9px', fontSize: '0.72rem', color: colors.danger }} onClick={() => purge(b)}><Trash2 size={12} /> Delete for good</button>}
      </span>) }] : []),
  ];

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Boards" description="Collections of pins. Public boards show on the website; private ones are only for staff." />
        <Toolbar right={<div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={btnGhost} onClick={() => setBin(!bin)}>{bin ? '‹ Back to boards' : <><Trash2 size={14} /> Recycle bin</>}</button>
          {!bin && <button type="button" style={btnPrimary} onClick={() => nav('/admin/boards/new')}><Plus size={14} /> New board</button>}
        </div>}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', ...(bin ? { display: 'none' } : {}) }}>
            {FILTERS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setCustomers(false); setApproval(k); }} style={{ ...filterStyle, cursor: 'pointer', fontWeight: !customers && approval === k ? 700 : 500, background: !customers && approval === k ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card))' : 'var(--surface-card)' }}>{l}</button>
            ))}
            <button type="button" onClick={() => setCustomers(true)} style={{ ...filterStyle, cursor: 'pointer', fontWeight: customers ? 700 : 500, background: customers ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card))' : 'var(--surface-card)' }}>Customer boards</button>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…" style={{ ...filterStyle, minWidth: 220 }} />
        </Toolbar>
        <SimpleTable columns={columns} rows={rows} loading={loading} onRowClick={bin ? undefined : (b) => nav(`/admin/boards/${b.id}/edit`)} empty={bin ? 'The recycle bin is empty.' : 'No boards yet. Start one with New board.'} />
      </div>
    </AdminLayout>
  );
}
