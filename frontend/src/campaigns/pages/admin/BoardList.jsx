import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { Toolbar } from '../../../core/components/admin/ui/HubHeader';
import SimpleTable from '../../../core/components/admin/ui/SimpleTable';
import boardsAPI from '../../../_shared/api/boards';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { btnPrimary, colors } from '../../../_shared/theme/tokens';
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

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await boardsAPI.list({ official: customers ? 0 : undefined, approval: !customers && approval ? approval : undefined, q: q || undefined })).data); }
    catch (e) { toast.error(errMsg(e, 'Could not load the boards')); }
    finally { setLoading(false); }
  }, [approval, customers, q]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = [
    { key: 'title', label: 'Board', render: (b) => <div><strong style={{ color: colors.primary }}>{b.title}</strong>{b.description && <div style={{ fontSize: '0.72rem', color: colors.textFaint }}>{b.description}</div>}</div> },
    { key: 'state', label: 'State', render: (b) => <BoardChip board={b} /> },
    { key: 'owner', label: 'Made by', render: (b) => b.owner_name ?? '—' },
    { key: 'pins', label: 'Pins', align: 'right', render: (b) => b.pins_count },
  ];

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Boards" description="Collections of pins. Public boards show on the website; private ones are only for staff." />
        <Toolbar right={<button type="button" style={btnPrimary} onClick={() => nav('/admin/boards/new')}><Plus size={14} /> New board</button>}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FILTERS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => { setCustomers(false); setApproval(k); }} style={{ ...filterStyle, cursor: 'pointer', fontWeight: !customers && approval === k ? 700 : 500, background: !customers && approval === k ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card))' : 'var(--surface-card)' }}>{l}</button>
            ))}
            <button type="button" onClick={() => setCustomers(true)} style={{ ...filterStyle, cursor: 'pointer', fontWeight: customers ? 700 : 500, background: customers ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card))' : 'var(--surface-card)' }}>Customer boards</button>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name…" style={{ ...filterStyle, minWidth: 220 }} />
        </Toolbar>
        <SimpleTable columns={columns} rows={rows} loading={loading} onRowClick={(b) => nav(`/admin/boards/${b.id}/edit`)} empty="No boards yet. Start one with New board." />
      </div>
    </AdminLayout>
  );
}
