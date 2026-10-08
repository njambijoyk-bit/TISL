import { useCallback, useEffect, useState } from 'react';
import { EyeOff, Link2, Pencil, Play, Plus, StickyNote, Trash2, ShoppingBag, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import HubHeader, { Toolbar } from '../../../core/components/admin/ui/HubHeader';
import pinsAPI from '../../../_shared/api/pins';
import useAuthStore from '../../../_shared/store/authStore';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { storageUrl } from '../../../_shared/lib/storageUrl';
import { btnPrimary, btnGhost, btnBin, card, colors } from '../../../_shared/theme/tokens';
import { filterStyle } from '../../../core/components/admin/books/booksFmt';
import { CAMPAIGN_ROLES, hasAnyRole } from '../../../_shared/lib/roles';
import PinForm from '../../components/PinForm';
import CustomerFilter from '../../components/CustomerFilter';
import CustomerPinSettings from '../../components/CustomerPinSettings';

const KINDS = [['', 'All'], ['image', 'Images'], ['video', 'Videos'], ['item', 'Products and services'], ['link', 'Links'], ['note', 'Notes']];
const PUBLISHERS = ['admin', 'super_admin', 'manager'];

function Thumb({ p }) {
  const src = p.thumb_path || p.media_path || p.video?.poster_remote || p.item?.image;
  const ratio = p.media_width && p.media_height ? `${p.media_width} / ${p.media_height}` : '4 / 3';
  if (src) {
    return (
      <div style={{ position: 'relative', aspectRatio: ratio, background: 'var(--surface-input, rgba(148,163,184,0.15))' }}>
        <img src={storageUrl(src)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {p.kind === 'video' && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={18} fill="#fff" /></span></span>}
      </div>
    );
  }
  const Icon = { video: Play, item: ShoppingBag, link: Link2, note: StickyNote }[p.kind] ?? StickyNote;

  return <div style={{ aspectRatio: '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: colors.textFaint, background: 'var(--surface-input, rgba(148,163,184,0.15))' }}><Icon size={30} /></div>;
}

/** The pin library: every pin, with its picture, kind and owner. Make, change, hide (admin, super admin, manager) and delete. */
export default function PinLibrary() {
  const user = useAuthStore((s) => s.user);
  const canHide = hasAnyRole(user, PUBLISHERS);
  const isSuper = hasAnyRole(user, ['super_admin']);
  const [bin, setBin] = useState(false);
  const [customer, setCustomer] = useState(null);   // show only this customer's pins   // the recycle bin: pins that were deleted
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ current_page: 1, last_page: 1, total: 0 });
  const [info, setInfo] = useState({ ecommerce: false, max_video_mb: 100, max_image_mb: 10 });
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ kind: '', status: '', q: '' });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);   // 'new' or the pin being changed

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await pinsAPI.list({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page, ...(customer ? { owner_user_id: customer.id } : {}), ...(bin ? { trashed: 1 } : {}) });
      setRows(r.data); setMeta({ current_page: r.current_page, last_page: r.last_page, total: r.total });
      setInfo({ ecommerce: r.ecommerce, max_video_mb: r.max_video_mb, max_image_mb: r.max_image_mb });
    } catch (e) { toast.error(errMsg(e, 'Could not load the pins')); } finally { setLoading(false); }
  }, [f, page, bin, customer]);
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  const setFilter = (k, v) => { setPage(1); setF((x) => ({ ...x, [k]: v })); };

  const act = async (fn, ...args) => { try { const r = await fn(...args); toast.success(r.message); load(); } catch (e) { toast.error(errMsg(e, 'That did not work')); } };
  const hide = (p) => { const reason = window.prompt('Why is it being hidden? (optional)', ''); if (reason !== null) act(pinsAPI.hide, p.id, reason); };
  const name = (p) => (p.title ? `"${p.title}"` : 'this pin');
  const remove = (p) => { if (window.confirm(`Move ${name(p)} to the recycle bin? It can be restored from there.`)) act(pinsAPI.remove, p.id); };
  const purge = (p) => { if (window.confirm(`Delete ${name(p)} for good? Its picture, comments and likes go too. This cannot be undone.`)) act(pinsAPI.purge, p.id); };
  const switchBin = (on) => { setBin(on); setPage(1); };
  const mayChange = (p) => canHide || p.owner_user_id === user?.id;

  if (!hasAnyRole(user, CAMPAIGN_ROLES)) return null;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1300, margin: '0 auto' }}>
        <HubHeader title="Pins" description="Pictures, videos, products, links and notes that boards and campaigns are made from." />
        {canHide && <CustomerPinSettings canChange={hasAnyRole(user, ['admin', 'super_admin'])} />}
        <Toolbar right={<div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={bin ? btnGhost : btnBin} onClick={() => switchBin(!bin)}>{bin ? '‹ Back to pins' : <><Trash2 size={14} /> Recycle bin</>}</button>
          {!bin && <button type="button" style={btnPrimary} onClick={() => setForm('new')}><Plus size={14} /> New pin</button>}
        </div>}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {KINDS.map(([k, l]) => <button key={k} type="button" onClick={() => setFilter('kind', k)} style={{ ...filterStyle, cursor: 'pointer', fontWeight: f.kind === k ? 700 : 500, background: f.kind === k ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card))' : 'var(--surface-card)' }}>{l}</button>)}
          </div>
          <select value={f.status} onChange={(e) => setFilter('status', e.target.value)} style={filterStyle} aria-label="Status"><option value="">Any status</option><option value="visible">Visible</option><option value="hidden">Hidden</option></select>
          {canHide && <CustomerFilter value={customer} onChange={(c) => { setPage(1); setCustomer(c); }} />}
          <input value={f.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Search title, caption or credit…" style={{ ...filterStyle, minWidth: 220 }} />
        </Toolbar>

        {loading && rows.length === 0 && <p style={{ color: colors.textFaint }}>Loading…</p>}
        {!loading && rows.length === 0 && <p style={{ ...card, padding: 18, color: colors.textMuted, fontSize: '0.86rem' }}>{bin ? 'The recycle bin is empty.' : 'No pins yet. Start with New pin.'}</p>}
        <div style={{ columnWidth: 230, columnGap: 14 }}>
          {rows.map((p) => (
            <div key={p.id} style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 14, breakInside: 'avoid', opacity: p.status === 'hidden' ? 0.6 : 1 }}>
              <Thumb p={p} />
              <div style={{ padding: '10px 12px 12px' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.primary }}>{p.kind === 'item' ? p.item_type : p.kind}</span>
                  {p.source === 'customer' && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#0369a1' }}>customer</span>}
                  {p.status === 'hidden' && <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#b91c1c', display: 'inline-flex', alignItems: 'center', gap: 3 }}><EyeOff size={11} /> hidden</span>}
                  {!p.allow_download && ['image', 'video'].includes(p.kind) && p.video?.source !== 'embed' && <span style={{ fontSize: '0.62rem', color: colors.textFaint }}>no download</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.86rem', color: colors.text }}>{p.title || p.item?.name || (p.kind === 'note' ? p.caption?.slice(0, 60) : '') || 'Untitled'}</div>
                {p.kind !== 'note' && p.caption && <div style={{ fontSize: '0.74rem', color: colors.textMuted, marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.caption}</div>}
                {p.tags?.length > 0 && <div style={{ fontSize: '0.68rem', color: colors.textFaint, marginTop: 4 }}>{p.tags.map((t) => `#${t}`).join(' ')}</div>}
                <div style={{ fontSize: '0.68rem', color: colors.textFaint, marginTop: 4 }}>by {p.owner_name ?? 'unknown'}{p.hidden_reason ? ` · ${p.hidden_reason}` : ''}</div>
                {bin ? (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {mayChange(p) && <button type="button" style={{ ...btnGhost, padding: '4px 9px', fontSize: '0.72rem' }} onClick={() => act(pinsAPI.restore, p.id)}><RotateCcw size={12} /> Restore</button>}
                    {isSuper && <button type="button" style={{ ...btnGhost, padding: '4px 9px', fontSize: '0.72rem', color: colors.danger }} onClick={() => purge(p)}><Trash2 size={12} /> Delete for good</button>}
                  </div>
                ) : (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {mayChange(p) && <button type="button" style={{ ...btnGhost, padding: '4px 9px', fontSize: '0.72rem' }} onClick={() => setForm(p)}><Pencil size={12} /> Change</button>}
                  {canHide && (p.status === 'hidden'
                    ? <button type="button" style={{ ...btnGhost, padding: '4px 9px', fontSize: '0.72rem' }} onClick={() => act(pinsAPI.unhide, p.id)}>Show again</button>
                    : <button type="button" style={{ ...btnGhost, padding: '4px 9px', fontSize: '0.72rem' }} onClick={() => hide(p)}>Hide</button>)}
                  {mayChange(p) && <button type="button" aria-label="Delete" style={{ ...btnGhost, padding: '4px 8px', color: colors.danger }} onClick={() => remove(p)}><Trash2 size={12} /></button>}
                </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {meta.last_page > 1 && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
            <button type="button" style={btnGhost} disabled={page <= 1} onClick={() => setPage((x) => x - 1)}>‹ Previous</button>
            <span style={{ fontSize: '0.78rem', color: colors.textMuted }}>Page {meta.current_page} of {meta.last_page} · {meta.total} pins</span>
            <button type="button" style={btnGhost} disabled={page >= meta.last_page} onClick={() => setPage((x) => x + 1)}>Next ›</button>
          </div>
        )}
      </div>
      {form && <PinForm pin={form === 'new' ? null : form} limits={{ image: info.max_image_mb, video: info.max_video_mb }} ecommerce={info.ecommerce} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
    </AdminLayout>
  );
}
