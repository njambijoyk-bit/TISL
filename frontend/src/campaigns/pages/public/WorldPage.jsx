import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search, X } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import worldAPI from '../../../_shared/api/world';
import useAuthStore from '../../../_shared/store/authStore';
import PinGrid from '../../components/PinGrid';
import { storageUrl } from '../../../_shared/lib/storageUrl';
import PinDetail from '../../components/PinDetail';

const chip = (on) => ({ padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: on ? 800 : 600, fontSize: '0.84rem', color: on ? 'var(--color-primary-500)' : 'var(--text-secondary)', border: `1.5px solid ${on ? 'var(--color-primary-500)' : 'var(--line)'}`, background: on ? 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'transparent' });

/** The world: an endless wall of pins. Discover shows everything public; Following shows pins from boards you follow. A pin opens over the wall. */
export default function WorldPage() {
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const tab = ['following', 'boards'].includes(params.get('tab')) ? params.get('tab') : 'discover';
  const sort = params.get('sort') === 'followed' ? 'followed' : 'new';
  const tag = params.get('tag') ?? '';
  const q = params.get('q') ?? '';
  const open = params.get('pin');
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);

  const set = (patch) => setParams((cur) => { const n = new URLSearchParams(cur); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); return n; }, { replace: patch.pin === undefined ? false : !patch.pin });
  const load = useCallback((after) => worldAPI.pins({ tab, tag: tag || undefined, q: q || undefined, after: after || undefined }), [tab, tag, q]);
  const loadBoards = useCallback((after) => worldAPI.boards({ q: q || undefined, sort, after: after || undefined }), [q, sort]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') set({ pin: '' }); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen">
      <Helmet><title>Discover | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px 64px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 22 }}>
          <button type="button" style={chip(tab === 'discover')} onClick={() => set({ tab: '' })}>Discover</button>
          <button type="button" style={chip(tab === 'following')} onClick={() => set({ tab: 'following' })}>Following</button>
          <button type="button" style={chip(tab === 'boards')} onClick={() => set({ tab: 'boards' })}>Boards</button>
          <Link to="/moodboards" style={{ ...chip(false), textDecoration: 'none' }}>Moodboards</Link>
          {user && <Link to="/my/boards" style={{ ...chip(false), textDecoration: 'none' }}>My boards</Link>}
          <form onSubmit={(e) => { e.preventDefault(); set({ q: text.trim() }); }} style={{ marginLeft: 'auto', position: 'relative', flex: '1 1 240px', maxWidth: 380 }}>
            <Search size={15} style={{ position: 'absolute', left: 14, top: 12, color: 'var(--text-tertiary)' }} />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={tab === 'boards' ? 'Search boards' : 'Search pins'} aria-label={tab === 'boards' ? 'Search boards' : 'Search pins'} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 38px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.88rem' }} />
          </form>
        </div>
        {tag && <p style={{ margin: '0 0 16px', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>Showing <strong style={{ color: 'var(--color-primary-500)' }}>#{tag}</strong> <button type="button" onClick={() => set({ tag: '' })} aria-label="Clear tag" style={{ border: 0, background: 'transparent', cursor: 'pointer', verticalAlign: 'middle', color: 'var(--text-tertiary)' }}><X size={14} /></button></p>}
        {tab === 'boards' && (
          <>
            <div style={{ display: 'flex', gap: 8, margin: '0 0 16px' }}>
              <button type="button" style={chip(sort === 'new')} onClick={() => set({ sort: '' })}>Newest</button>
              <button type="button" style={chip(sort === 'followed')} onClick={() => set({ sort: 'followed' })}>Most followed</button>
            </div>
            <PinGrid load={loadBoards} resetKey={`boards|${q}|${sort}`} empty="No public boards match that yet."
              render={(b) => (
                <Link key={b.id} to={`/boards/${b.slug_path}`} style={{ display: 'block', marginBottom: 16, breakInside: 'avoid', textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ borderRadius: 16, overflow: 'hidden', background: 'var(--surface-card)', border: '1px solid var(--line)' }}>
                    <div style={{ aspectRatio: '4 / 3', background: 'var(--surface-input, rgba(148,163,184,0.15))' }}>{b.cover && <img src={storageUrl(b.cover)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}</div>
                    <div style={{ padding: '10px 14px 14px' }}>
                      <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{b.title}</div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>{b.by ? `By ${b.by} · ` : ''}{b.pins} {b.pins === 1 ? 'pin' : 'pins'}{b.followers > 0 ? ` · ${b.followers} ${b.followers === 1 ? 'follower' : 'followers'}` : ''}</div>
                    </div>
                  </div>
                </Link>
              )} />
          </>
        )}
        {tab === 'following' && !user
          ? <p style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}><Link to="/login" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Sign in</Link> to see pins from boards you follow.</p>
          : tab !== 'boards' && <PinGrid load={load} resetKey={`${tab}|${tag}|${q}`} onOpen={(p) => set({ pin: String(p.id) })} empty={tab === 'following' ? 'Follow a board and its newest pins show up here.' : 'No pins match that.'} />}
      </main>
      <Footer />
      {open && (
        <div onClick={() => set({ pin: '' })} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.62)', overflowY: 'auto', padding: '4vh 16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: 820, margin: '0 auto', background: 'var(--surface-card)', borderRadius: 20, overflow: 'hidden' }}>
            <button type="button" onClick={() => set({ pin: '' })} aria-label="Close" style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, width: 34, height: 34, borderRadius: '50%', border: 0, cursor: 'pointer', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            <PinDetail key={open} id={open} onTag={(t) => set({ tag: t, pin: '' })} />
          </div>
        </div>
      )}
    </div>
  );
}
