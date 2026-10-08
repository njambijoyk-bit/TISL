import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Heart, Star, ThumbsUp } from 'lucide-react';
import Modal from '../../../core/components/admin/ui/Modal';
import { Field, TextArea, SelectInput } from '../../../core/components/admin/ui/Form';
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

/** Reviews and comments waiting for a decision, and the ones already showing, hidden or removed. Whoever holds the moderate permission decides; the others can read. */
function Posts() {
  const [status, setStatus] = useState('held');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('');
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [canDecide, setCanDecide] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await engagementAPI.queue({ status, type: type || undefined, q: q || undefined, sort: sort || undefined });
      setRows(r.data); setCounts(r.counts ?? {}); setCanDecide(r.can_decide);
    } catch (e) { toast.error(errMsg(e, 'Could not load the list')); } finally { setLoading(false); }
  }, [status, type, q, sort]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (fn, id, confirm) => {
    if (confirm && !window.confirm(confirm)) return;
    try { const r = await fn(id); toast.success(r.message); load(); } catch (e) { toast.error(errMsg(e, 'That did not work')); }
  };
  const chip = (on) => ({ ...filterStyle, cursor: 'pointer', fontWeight: on ? 700 : 500, background: on ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card))' : 'var(--surface-card)' });

  return (
    <>
        <Toolbar>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{TABS.map(([k, l]) => <button key={k} type="button" style={chip(status === k)} onClick={() => setStatus(k)}>{l}{counts[k] != null && k !== 'removed' ? ` · ${counts[k]}` : ''}</button>)}</div>
          <select value={type} onChange={(e) => setType(e.target.value)} style={filterStyle} aria-label="Kind of thing">{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={filterStyle} aria-label="Order"><option value="">Newest first</option><option value="helpful">Most helpful first</option><option value="liked">Most liked first</option></select>
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
                {(p.helpful > 0 || p.likes > 0) && <span style={{ display: 'inline-flex', gap: 10, color: colors.textMuted, fontWeight: 600 }}>{p.helpful > 0 && <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}><ThumbsUp size={12} /> {p.helpful} helpful</span>}{p.likes > 0 && <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}><Heart size={12} /> {p.likes}</span>}</span>}
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
    </>
  );
}

const RTABS = [['open', 'Open'], ['kept', 'Kept'], ['removed', 'Pulled down'], ['flagged', 'Flagged']];

function Reports() {
  const [status, setStatus] = useState('open');
  const [data, setData] = useState({ data: [], policies: [], can_decide: false, counts: {} });
  const [loading, setLoading] = useState(true);
  const [flagging, setFlagging] = useState(null);
  const [policy, setPolicy] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await engagementAPI.reportCases(status)); } catch (e) { toast.error(errMsg(e, 'Could not load the reports')); } finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const decide = async (c, decision, extra = {}) => {
    try { const r = await engagementAPI.decideReport({ target_type: c.target_type, target_id: c.target_id, decision, ...extra }); toast.success(r.message); setFlagging(null); setPolicy(''); setNote(''); load(); }
    catch (e) { toast.error(errMsg(e, 'That did not work'), { duration: 6000 }); }
  };
  const chip = (on) => ({ ...filterStyle, cursor: 'pointer', fontWeight: on ? 700 : 500, background: on ? 'color-mix(in srgb, var(--color-primary-500) 14%, var(--surface-card))' : 'var(--surface-card)' });

  return (
    <>
      <Toolbar><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{RTABS.map(([k, l]) => <button key={k} type="button" style={chip(status === k)} onClick={() => setStatus(k)}>{l}{data.counts[k] != null ? ` · ${data.counts[k]}` : ''}</button>)}</div></Toolbar>
      {loading && data.data.length === 0 && <p style={{ color: colors.textFaint }}>Loading…</p>}
      {!loading && data.data.length === 0 && <p style={{ ...card, padding: 18, color: colors.textMuted, fontSize: '0.86rem' }}>{status === 'open' ? 'Nothing has been reported.' : 'Nothing here.'}</p>}
      <div style={{ display: 'grid', gap: 12 }}>
        {data.data.map((c) => (
          <div key={`${c.target_type}:${c.target_id}`} style={{ ...card, padding: 16, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong style={{ color: colors.text }}>{c.target}</strong>
              <span style={{ fontSize: '0.74rem', color: colors.textFaint, textTransform: 'uppercase' }}>{c.target_type === 'post' ? 'review or comment' : c.target_type}</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', fontWeight: 700, color: c.reports > 1 ? 'var(--status-warning, #b45309)' : colors.textMuted }}>{c.reports} {c.reports === 1 ? 'report' : 'reports'}</span>
            </div>
            {c.excerpt && <p style={{ margin: 0, fontSize: '0.86rem', color: colors.textMuted, whiteSpace: 'pre-wrap' }}>{c.excerpt}</p>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{c.reasons.map((r) => <span key={r.reason} style={{ fontSize: '0.72rem', padding: '2px 9px', borderRadius: 999, background: 'var(--surface-hover, rgba(148,163,184,0.15))', color: colors.textMuted }}>{r.reason} · {r.count}</span>)}</div>
            {c.notes.map((n, i) => <div key={i} style={{ fontSize: '0.78rem', color: colors.textFaint, fontStyle: 'italic' }}>"{n}"</div>)}
            {c.hidden && <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#b91c1c' }}>Hidden from the public right now</div>}
            {status !== 'open' && <div style={{ fontSize: '0.78rem', color: colors.textMuted }}>{c.policy ? `Breach of ${c.policy}. ` : ''}{c.decision_note ?? ''}</div>}
            {status === 'open' && data.can_decide && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" style={btnPrimary} onClick={() => decide(c, 'keep')}>Keep it</button>
                {c.hideable && <button type="button" style={btnGhost} onClick={() => window.confirm('Pull this down? It stops showing to the public.') && decide(c, 'remove')}>Pull it down</button>}
                <button type="button" style={{ ...btnGhost, color: colors.danger }} onClick={() => setFlagging(c)}>Flag a policy breach…</button>
              </div>
            )}
          </div>
        ))}
      </div>
      {flagging && (
        <Modal title="Flag a policy breach" subtitle={flagging.target} onClose={() => setFlagging(null)} width={480}
          footer={<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" style={btnGhost} onClick={() => setFlagging(null)}>Cancel</button><button type="button" style={{ ...btnPrimary, opacity: policy && note.trim() ? 1 : 0.5 }} disabled={!policy || !note.trim()} onClick={() => decide(flagging, 'flag', { policy_key: policy, note })}>Flag and pull down</button></div>}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Which policy was breached?"><SelectInput value={policy} onChange={(e) => setPolicy(e.target.value)}><option value="">Choose a policy…</option>{data.policies.map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}</SelectInput></Field>
            <Field label="What breached it?" hint="This note is kept with the decision."><TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></Field>
          </div>
        </Modal>
      )}
    </>
  );
}

const KINDS = [['', 'Everything'], ['post', 'Reviews and comments'], ['pin', 'Pins'], ['board', 'Boards'], ['moodboard', 'Moodboards'], ['campaign', 'Campaigns'], ['product', 'Products'], ['service', 'Services'], ['hamper', 'Hampers']];

/** The things people like most, with counts only (never who liked them). */
function MostLiked() {
  const [type, setType] = useState('');
  const [rows, setRows] = useState(null);
  useEffect(() => { setRows(null); engagementAPI.top(type).then(setRows).catch((e) => { toast.error(errMsg(e, 'Could not load the list')); setRows([]); }); }, [type]);

  return (
    <>
      <Toolbar><select value={type} onChange={(e) => setType(e.target.value)} style={filterStyle} aria-label="Kind of thing">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Toolbar>
      {rows === null && <p style={{ color: colors.textFaint }}>Loading…</p>}
      {rows?.length === 0 && <p style={{ ...card, padding: 18, color: colors.textMuted, fontSize: '0.86rem' }}>Nothing has been liked yet.</p>}
      <div style={{ display: 'grid', gap: 8 }}>
        {rows?.map((r, i) => (
          <div key={`${r.type}:${r.id}`} style={{ ...card, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ width: 24, textAlign: 'right', fontWeight: 800, color: colors.textFaint }}>{i + 1}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
              <div style={{ fontSize: '0.7rem', color: colors.textFaint, textTransform: 'uppercase' }}>{r.type}</div>
            </div>
            {r.url && <Link to={r.url} style={{ fontSize: '0.78rem', fontWeight: 700, color: colors.primary, textDecoration: 'none' }}>Open ›</Link>}
            <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontWeight: 800, color: colors.text }}><Heart size={14} /> {r.likes}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Staff side of the Engagement Engine: reviews and comments to approve, reports to decide on, and what people like most. */
export default function EngagementQueue() {
  const [tab, setTab] = useState('posts');
  const big = (on) => ({ padding: '9px 18px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.86rem', color: on ? 'var(--color-primary-500)' : colors.textMuted, border: `1.5px solid ${on ? 'var(--color-primary-500)' : 'var(--line)'}`, background: 'transparent' });

  return (
    <AdminLayout>
      <div style={{ padding: '32px 24px', maxWidth: 1000, margin: '0 auto' }}>
        <HubHeader title="Reviews, comments and reports" description="Approve what customers write before it shows, and decide on what people report. Who can do what is set in Settings, Engagement." />
        <div style={{ display: 'flex', gap: 8, margin: '0 0 14px' }}><button type="button" style={big(tab === 'posts')} onClick={() => setTab('posts')}>Reviews and comments</button><button type="button" style={big(tab === 'reports')} onClick={() => setTab('reports')}>Reports</button><button type="button" style={big(tab === 'liked')} onClick={() => setTab('liked')}>Most liked</button></div>
        {tab === 'posts' ? <Posts /> : tab === 'reports' ? <Reports /> : <MostLiked />}
      </div>
    </AdminLayout>
  );
}
