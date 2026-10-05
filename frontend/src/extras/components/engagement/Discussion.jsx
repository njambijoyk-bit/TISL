import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Pencil, Star, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import engagementAPI from '../../../_shared/api/engagement';
import useAuthStore from '../../../_shared/store/authStore';
import { ReactionButton, ReportButton } from './Reactions';
import useEngagement from '../../../_shared/lib/engagementConfig';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { storageUrl } from '../../../_shared/lib/storageUrl';

const muted = { color: 'var(--text-tertiary)', fontSize: '0.8rem' };
const field = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem' };
const btn = (primary) => ({ padding: '9px 18px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.84rem', border: primary ? 0 : '1.5px solid var(--line)', color: primary ? '#fff' : 'var(--text-primary)', background: primary ? 'var(--color-primary-500)' : 'transparent' });
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function Stars({ value, size = 15, onPick }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }} role={onPick ? 'radiogroup' : 'img'} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= Math.round(value);
        const star = <Star size={size} style={{ color: on ? '#f59e0b' : 'var(--line)', fill: on ? '#f59e0b' : 'transparent' }} />;

        return onPick
          ? <button key={n} type="button" onClick={() => onPick(n)} aria-label={`${n} stars`} style={{ border: 0, background: 'transparent', padding: 2, cursor: 'pointer' }}>{star}</button>
          : <span key={n}>{star}</span>;
      })}
    </span>
  );
}

/** The write box for a review, a comment or a reply. Asks for a name when the visitor is a guest, and for photos when the rule allows them. */
function Composer({ kind, can, onSend, onCancel, initial, label = 'Post' }) {
  const [f, setF] = useState({ rating: initial?.rating ?? 0, title: initial?.title ?? '', body: initial?.body ?? '', guest_name: '' });
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const review = kind === 'review';
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await onSend(f, photos); setF({ rating: 0, title: '', body: '', guest_name: '' }); setPhotos([]); } catch (er) { setErr(errMsg(er, 'That did not work')); } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
      {review && <div><div style={{ ...muted, marginBottom: 4 }}>Your rating</div><Stars value={f.rating} size={26} onPick={(n) => setF({ ...f, rating: n })} /></div>}
      {review && <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title (optional)" maxLength={120} style={field} aria-label="Title" />}
      <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder={review ? 'What did you think?' : 'Write here…'} rows={review ? 4 : 3} maxLength={2000} required style={{ ...field, resize: 'vertical' }} aria-label="Your words" />
      {can?.guest && <input value={f.guest_name} onChange={(e) => setF({ ...f, guest_name: e.target.value })} placeholder="Your name" maxLength={60} required style={field} aria-label="Your name" />}
      {review && can?.photos && (
        <label style={{ ...muted, cursor: 'pointer' }}>
          Add photos (up to 5, 2 MB each): <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, 5))} />
          {photos.length > 0 && <span> · {photos.length} chosen</span>}
        </label>
      )}
      {can?.held && !initial && <p style={{ ...muted, margin: 0 }}>It will show once our team has looked at it.</p>}
      {can?.min_words > 0 && <p style={{ ...muted, margin: 0 }}>At least {can.min_words} {can.min_words === 1 ? 'word' : 'words'}.</p>}
      {err && <p role="alert" style={{ margin: 0, color: 'var(--status-error, #b91c1c)', fontSize: '0.84rem' }}>{err}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={busy} style={btn(true)}>{busy ? 'Posting…' : label}</button>
        {onCancel && <button type="button" onClick={onCancel} style={btn(false)}>Cancel</button>}
      </div>
    </form>
  );
}

function Post({ p, canReply, onReply, onChanged, rule, canEdit }) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [big, setBig] = useState(null);
  const user = useAuthStore((st) => st.user);

  const remove = async () => { if (!window.confirm('Delete this?')) return; try { await engagementAPI.deletePost(p.id); toast.success('Deleted'); onChanged(); } catch (e) { toast.error(errMsg(e, 'Could not delete it')); } };

  return (
    <div style={{ padding: '16px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {p.kind === 'review' && <Stars value={p.rating} />}
        <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{p.author}</strong>
        {p.by_staff && <span style={{ fontSize: '0.64rem', fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: 'color-mix(in srgb, var(--color-primary-500) 14%, transparent)', color: 'var(--color-primary-500)' }}>TEAM</span>}
        {p.verified && <span title="This person bought it" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', fontWeight: 700, color: '#15803d' }}><BadgeCheck size={14} /> Verified purchase</span>}
        <span style={{ ...muted, marginLeft: 'auto' }}>{day(p.created_at)}{p.edited ? ' · edited' : ''}</span>
      </div>
      {p.status === 'held' && <div style={{ margin: '6px 0 0', fontSize: '0.76rem', fontWeight: 700, color: 'var(--status-warning, #b45309)' }}>Waiting for approval. Only you can see this for now.</div>}
      {editing
        ? <div style={{ marginTop: 10 }}><Composer kind={p.kind} can={{ guest: false }} initial={p} label="Save" onCancel={() => setEditing(false)}
          onSend={async (f) => { const r = await engagementAPI.editPost(p.id, { rating: p.kind === 'review' ? f.rating : undefined, title: f.title, body: f.body }); toast.success(r.message); setEditing(false); onChanged(); }} /></div>
        : (
          <>
            {p.title && <div style={{ fontWeight: 700, margin: '8px 0 2px', color: 'var(--text-primary)' }}>{p.title}</div>}
            <p style={{ margin: '6px 0 0', lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontSize: '0.92rem' }}>{p.body}</p>
            {p.images.length > 0 && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>{p.images.map((u) => <button key={u} type="button" onClick={() => setBig(u)} style={{ padding: 0, border: 0, background: 'transparent', cursor: 'zoom-in' }}><img src={storageUrl(u)} alt="" loading="lazy" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 10, display: 'block' }} /></button>)}</div>}
          </>
        )}
      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        {canReply && p.status === 'published' && !p.mine && <button type="button" onClick={() => setReplying((r) => !r)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.78rem', color: 'var(--color-primary-500)', padding: 0 }}>Reply</button>}
        {p.mine && canEdit && !editing && <button type="button" onClick={() => setEditing(true)} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', color: 'var(--text-secondary)', padding: 0, display: 'inline-flex', gap: 4, alignItems: 'center' }}><Pencil size={12} /> Edit</button>}
        {p.status === 'published' && <ReactionButton type="post" id={p.id} kind="helpful" initial={{ count: p.helpful, mine: p.marked }} />}
        {p.status === 'published' && <ReactionButton type="post" id={p.id} kind="like" initial={{ count: p.likes, mine: p.liked }} />}
        {p.status === 'published' && !p.mine && <ReportButton type="post" id={p.id} />}
        {p.mine && !editing && <button type="button" onClick={remove} style={{ border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem', color: 'var(--status-error, #b91c1c)', padding: 0, display: 'inline-flex', gap: 4, alignItems: 'center' }}><Trash2 size={12} /> Delete</button>}
      </div>
      {replying && <div style={{ marginTop: 10, paddingLeft: 16 }}><Composer kind="comment" can={{ guest: !user }} label="Reply" onCancel={() => setReplying(false)} onSend={async (f) => { const r = await engagementAPI.reply(p.id, { body: f.body, guest_name: f.guest_name }); toast.success(r.message); setReplying(false); onReply(); }} /></div>}
      {p.replies.length > 0 && <div style={{ marginTop: 6, paddingLeft: 16, borderLeft: '2px solid var(--line)' }}>{p.replies.map((r) => <Post key={r.id} p={r} canReply={false} onChanged={onChanged} onReply={onReply} rule={rule} canEdit={false} />)}</div>}
      {big && <div onClick={() => setBig(null)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}><img src={storageUrl(big)} alt="" style={{ maxWidth: '92vw', maxHeight: '90vh', borderRadius: 14, objectFit: 'contain' }} /></div>}
    </div>
  );
}

/**
 * Reviews and comments for one thing (a product, a service, a pin...). Shows nothing at all when the Engagement Engine is off, or that action is off for
 * this kind of thing. A visitor who may not post sees the reason (for example "Only people who have bought this can review it").
 * `kind` is "review" (stars, with a summary) or "comment".
 */
export default function Discussion({ type, id, kind = 'review', title }) {
  const eng = useEngagement();
  const action = kind === 'review' ? 'review' : 'comment';
  const [data, setData] = useState({ data: [], next: null, summary: null });
  const [can, setCan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const on = eng.on(type, action);
  const canReply = eng.on('post', 'reply');

  const load = useCallback(async (after) => {
    try {
      const r = await engagementAPI.posts(type, id, kind, after);
      setData((d) => (after ? { ...r, data: [...d.data, ...r.data] } : r));
    } catch { /* an empty list is fine */ } finally { setLoading(false); }
  }, [type, id, kind]);
  const check = useCallback(() => engagementAPI.can(type, id, kind).then(setCan).catch(() => setCan({ allowed: false, reason: null })), [type, id, kind]);
  useEffect(() => { if (on) { setLoading(true); setOpen(false); load(); check(); } }, [on, load, check]);

  if (!eng.loaded || !on) return null;
  const s = data.summary;

  return (
    <section aria-label={title ?? (kind === 'review' ? 'Reviews' : 'Comments')}>
      {kind === 'review' && s && s.count > 0 && (
        <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap', padding: '18px 22px', marginBottom: 18, borderRadius: 14, border: '1px solid var(--line)', background: 'var(--surface-card)' }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1, color: 'var(--text-primary)' }}>{Number(s.average).toFixed(1)}</div><Stars value={s.average} /><div style={muted}>{s.count} {s.count === 1 ? 'review' : 'reviews'}</div></div>
          <div style={{ flex: 1, minWidth: 180, display: 'grid', gap: 4 }}>
            {[5, 4, 3, 2, 1].map((n) => <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.74rem', color: 'var(--text-secondary)' }}><span style={{ width: 10 }}>{n}</span><div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--line)' }}><div style={{ width: `${(s.breakdown[n] / s.count) * 100}%`, height: '100%', borderRadius: 3, background: '#f59e0b' }} /></div><span style={{ width: 24, textAlign: 'right' }}>{s.breakdown[n]}</span></div>)}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        {can?.allowed
          ? (open
            ? <Composer kind={kind} can={can} label={kind === 'review' ? 'Post review' : 'Post'} onCancel={() => setOpen(false)}
              onSend={async (f, photos) => { const r = await engagementAPI.post(type, id, { kind, rating: kind === 'review' ? f.rating : undefined, title: f.title, body: f.body, guest_name: f.guest_name }, photos); toast.success(r.message); setOpen(false); load(); check(); }} />
            : <button type="button" style={btn(true)} onClick={() => setOpen(true)}>{kind === 'review' ? 'Write a review' : 'Add a comment'}</button>)
          : can?.reason && <p style={{ ...muted, margin: 0 }}>{can.reason.startsWith('Sign in') ? <><Link to="/login" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Sign in</Link>{can.reason.slice('Sign in'.length)}</> : can.reason}</p>}
      </div>

      {loading && <p style={muted}>Loading…</p>}
      {!loading && data.data.length === 0 && <p style={{ ...muted, padding: '18px 0' }}>{kind === 'review' ? 'No reviews yet.' : 'No comments yet.'}</p>}
      {data.data.map((p) => <Post key={p.id} p={p} canReply={canReply} onReply={() => load()} onChanged={() => { load(); check(); }} canEdit />)}
      {data.next && <div style={{ textAlign: 'center', paddingTop: 10 }}><button type="button" style={btn(false)} onClick={() => load(data.next)}>Show more</button></div>}
    </section>
  );
}
