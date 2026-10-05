import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { Toolbar } from '../../../core/components/admin/ui/HubHeader';
import engagementAPI from '../../../_shared/api/engagement';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { storageUrl } from '../../../_shared/lib/storageUrl';
import { btnPrimary, btnGhost, card, colors } from '../../../_shared/theme/tokens';
import { filterStyle } from '../../../core/components/admin/books/booksFmt';

const TABS = [['held', 'Waiting for approval'], ['published', 'Showing'], ['hidden', 'Hidden'], ['removed', 'Removed']];
const WHY = { rule: 'Every one is held', first: "Person's first post", guest: 'From a guest', blocked_word: 'Contains a blocked word' };
const TYPES = [['', 'Everything'], ['product', 'Products'], ['service', 'Services'], ['hamper', 'Hampers'], ['pin', 'Pins'], ['board', 'Boards'], ['moodboard', 'Moodboards'], ['campaign', 'Campaigns'], ['post', 'Replies']];
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

/** Reviews and comments waiting for a decision, and the ones already showing, hidden or removed. Admin, super admin and manager decide; sales rep and finance can read. */
export default function EngagementQueue() {
  const [status, setStatus] = useState('held');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [canDecide, setCanDecide] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await engagementAPI.queue({ status, type: type || undefined, q: q || undefined });
      setRows(r.data); setCounts(r.counts ?? {}); setCanDecide(r.can_decide);
    } catch (e) { toast.error(errMsg(e, 'Could not load the list')); } finally { setLoading(false); }
  }, [status, type, q]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, id, confirm) => {
    if (confirm && !window.confirm(confirm)) return;
    try { const r = await fn(id); toast.success(r.message); load(); } catch (e) { toast.error(errMsg(e, 'That did not work')); }
  };
  const chip = (on) => ({ ...filterStyle, cursor: 'pointer', fontWeight: on ? 700 : 500, background: on ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card))' : 'var(--surface-card)' });

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }}>
        <HubHeader title="Reviews and comments" description="Approve what customers write before it shows, and hide or remove what should not stay. Who can write what is set in Settings, Engagement." />
        <Toolbar>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{TABS.map(([k, l]) => <button key={k} type="button" style={chip(status === k)} onClick={() => setStatus(k)}>{l}{counts[k] != null && k !== 'removed' ? ` · ${counts[k]}` : ''}</button>)}</div>
          <select value={type} onChange={(e) => setType(e.target.value)} style={filterStyle} aria-label="Kind of thing">{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the words…" style={{ ...filterStyle, minWidth: 200 }} />
        </Toolbar>
        {loading && rows.length === 0 && <p style={{ color: colors.textFaint }}>Loading…</p>}
        {!loading && rows.length === 0 && <p style={{ ...card, padding: 18, color: colors.textMuted, fontSize: '0.86rem' }}>{status === 'held' ? 'Nothing is waiting for approval.' : 'Nothing here.'}</p>}
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((p) => (
            <div key={p.id} style={{ ...card, padding: 16, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                <strong style={{ color: colors.text }}>{p.author}</strong>
                {p.role && <span style={{ color: colors.textFaint }}>{p.role.replace('_', ' ')}</span>}
                {p.kind === 'review' && <span style={{ display: 'inline-flex', gap: 1 }}>{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} style={{ color: '#f59e0b', fill: n <= p.rating ? '#f59e0b' : 'transparent' }} />)}</span>}
                {p.verified && <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', color: '#15803d', fontWeight: 700 }}><BadgeCheck size={13} /> Verified purchase</span>}
                <span style={{ color: colors.textFaint }}>on {p.target_type === 'post' ? 'a ' : ''}{p.target}</span>
                <span style={{ marginLeft: 'auto', color: colors.textFaint }}>{when(p.created_at)}</span>
              </div>
              {p.title && <div style={{ fontWeight: 700, color: colors.text }}>{p.title}</div>}
              <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.88rem', color: colors.textMuted, lineHeight: 1.55 }}>{p.body}</p>
              {p.images.length > 0 && <div style={{ display: 'flex', gap: 6 }}>{p.images.map((u) => <a key={u} href={storageUrl(u)} target="_blank" rel="noreferrer"><img src={storageUrl(u)} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, display: 'block' }} /></a>)}</div>}
              {p.status === 'held' && p.held_reason && <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--status-warning, #b45309)' }}>Held: {WHY[p.held_reason] ?? p.held_reason}</div>}
              {canDecide && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {p.status !== 'published' && <button type="button" style={btnPrimary} onClick={() => act(engagementAPI.approve, p.id)}>{p.status === 'held' ? 'Approve' : 'Show again'}</button>}
                  {p.status !== 'hidden' && p.status !== 'removed' && <button type="button" style={btnGhost} onClick={() => act(engagementAPI.hide, p.id)}>Hide</button>}
                  {p.status !== 'removed' && <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={() => act(engagementAPI.remove, p.id, 'Remove this for good? The person will no longer see it either.')}>Remove</button>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
