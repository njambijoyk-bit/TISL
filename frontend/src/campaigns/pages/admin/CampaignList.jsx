import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { Toolbar } from '../../../core/components/admin/ui/HubHeader';
import SimpleTable from '../../../core/components/admin/ui/SimpleTable';
import campaignsAPI from '../../../_shared/api/campaigns';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import useAuthStore from '../../../_shared/store/authStore';
import { btnPrimary, btnGhost, btnBin, colors } from '../../../_shared/theme/tokens';
import { filterStyle } from '../../../core/components/admin/books/booksFmt';
import StatusChip from '../../components/StatusChip';

const STATUSES = [['', 'All'], ['waiting', 'Waiting for approval'], ['live', 'Live'], ['scheduled', 'Scheduled'], ['teaser', 'Teaser'], ['draft', 'Drafts'], ['paused', 'Paused'], ['ended', 'Ended'], ['archived', 'Archived']];
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/** The campaigns: what is live, what is coming, and what has ended. Click one to change it. */
export default function CampaignList() {
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [bin, setBin] = useState(false);   // the recycle bin: campaigns that were deleted
  const isSuper = useAuthStore((st) => st.user?.role) === 'super_admin';
  const canRestore = ['admin', 'super_admin', 'manager'].includes(useAuthStore((st) => st.user?.role));
  const [q, setQ] = useState('');

  useEffect(() => { campaignsAPI.types().then((r) => setTypes(Object.fromEntries(r.types.map((t) => [t.key, t])))).catch(() => {}); }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await campaignsAPI.list({ trashed: bin ? 1 : undefined, status: status && status !== 'waiting' ? status : undefined, approval: status === 'waiting' ? 'pending' : undefined, q: q || undefined })).data); }
    catch (e) { toast.error(errMsg(e, 'Could not load the campaigns')); }
    finally { setLoading(false); }
  }, [status, q, bin]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, id) => { try { const r = await fn(id); toast.success(r.message); load(); } catch (e) { toast.error(errMsg(e, 'That did not work')); } };
  const purge = (c) => { if (window.confirm(`Delete "${c.title}" for good? Only the campaign page itself goes (its sections, featured-item list and view counts). Pins, boards, moodboards, products, hampers and sales are not touched. This cannot be undone.`)) act(campaignsAPI.purge, c.id); };

  const columns = [
    { key: 'title', label: 'Campaign', render: (c) => <div><strong style={{ color: colors.primary }}>{c.title}</strong><div style={{ fontSize: '0.7rem', color: colors.textFaint, fontFamily: 'monospace' }}>/campaigns/{c.slug}</div></div> },
    { key: 'type', label: 'Type', render: (c) => types[c.type]?.label ?? c.type },
    { key: 'status', label: 'Status', render: (c) => <StatusChip status={c.status} approval={c.approval_status} /> },
    { key: 'start', label: 'Starts', render: (c) => day(c.starts_at) },
    { key: 'end', label: 'Ends', render: (c) => (c.ends_at ? day(c.ends_at) : 'No end') },
    { key: 'goal', label: 'Goal', render: (c) => (c.goal === 'sales' ? 'Sales' : 'Reach') },
    { key: 'sections', label: 'Sections', align: 'right', render: (c) => c.sections_count },
    ...(bin ? [{ key: 'bin', label: '', align: 'right', render: (c) => (
      <span style={{ display: 'inline-flex', gap: 6 }}>
        {canRestore && <button type="button" style={{ ...btnGhost, padding: '4px 9px', fontSize: '0.72rem' }} onClick={() => act(campaignsAPI.restore, c.id)}><RotateCcw size={12} /> Restore</button>}
        {isSuper && <button type="button" style={{ ...btnGhost, padding: '4px 9px', fontSize: '0.72rem', color: colors.danger }} onClick={() => purge(c)}><Trash2 size={12} /> Delete for good</button>}
      </span>) }] : []),
  ];

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1200, margin: '0 auto' }}>
        <HubHeader title="Campaigns" description="Launches, drops and brand stories: each one is a page made of sections, with its own dates." />
        <Toolbar right={<div style={{ display: 'flex', gap: 8 }}>
          {canRestore && <button type="button" style={bin ? btnGhost : btnBin} onClick={() => setBin(!bin)}>{bin ? '‹ Back to campaigns' : <><Trash2 size={14} /> Recycle bin</>}</button>}
          {!bin && <button type="button" style={btnPrimary} onClick={() => nav('/admin/campaigns/new')}><Plus size={14} /> New campaign</button>}
        </div>}>
          <div style={{ display: bin ? 'none' : 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUSES.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setStatus(k)} style={{ ...filterStyle, cursor: 'pointer', fontWeight: status === k ? 700 : 500, background: status === k ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card))' : 'var(--surface-card)' }}>{l}</button>
            ))}
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or address…" style={{ ...filterStyle, minWidth: 220 }} />
        </Toolbar>
        <SimpleTable columns={columns} rows={rows} loading={loading} onRowClick={bin ? undefined : (c) => nav(`/admin/campaigns/${c.id}/edit`)} empty={bin ? 'The recycle bin is empty.' : 'No campaigns yet. Start one with New campaign.'} />
      </div>
    </AdminLayout>
  );
}
