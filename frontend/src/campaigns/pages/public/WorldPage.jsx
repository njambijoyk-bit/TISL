import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Search, X } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import worldAPI from '../../../_shared/api/world';
import useAuthStore from '../../../_shared/store/authStore';
import PinGrid from '../../components/PinGrid';
import PinDetail from '../../components/PinDetail';

const chip = (on) => ({ padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: on ? 800 : 600, fontSize: '0.84rem', color: on ? 'var(--color-primary-500)' : 'var(--text-secondary)', border: `1.5px solid ${on ? 'var(--color-primary-500)' : 'var(--line)'}`, background: on ? 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'transparent' });

/** The world: an endless wall of pins. Discover shows everything public; Following shows pins from boards you follow. A pin opens over the wall. */
export default function WorldPage() {
  const [params, setParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const tab = params.get('tab') === 'following' ? 'following' : 'discover';
  const tag = params.get('tag') ?? '';
  const q = params.get('q') ?? '';
  const open = params.get('pin');
  const [text, setText] = useState(q);
  useEffect(() => setText(q), [q]);

  const set = (patch) => setParams((cur) => { const n = new URLSearchParams(cur); Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k))); return n; }, { replace: patch.pin === undefined ? false : !patch.pin });
  const load = useCallback((after) => worldAPI.pins({ tab, tag: tag || undefined, q: q || undefined, after: after || undefined }), [tab, tag, q]);

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
          {user && <Link to="/my/boards" style={{ ...chip(false), textDecoration: 'none' }}>My boards</Link>}
          <form onSubmit={(e) => { e.preventDefault(); set({ q: text.trim() }); }} style={{ marginLeft: 'auto', position: 'relative', flex: '1 1 240px', maxWidth: 380 }}>
            <Search size={15} style={{ position: 'absolute', left: 14, top: 12, color: 'var(--text-tertiary)' }} />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search pins" aria-label="Search pins" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px 10px 38px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.88rem' }} />
          </form>
        </div>
        {tag && <p style={{ margin: '0 0 16px', fontSize: '0.86rem', color: 'var(--text-secondary)' }}>Showing <strong style={{ color: 'var(--color-primary-500)' }}>#{tag}</strong> <button type="button" onClick={() => set({ tag: '' })} aria-label="Clear tag" style={{ border: 0, background: 'transparent', cursor: 'pointer', verticalAlign: 'middle', color: 'var(--text-tertiary)' }}><X size={14} /></button></p>}
        {tab === 'following' && !user
          ? <p style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}><Link to="/login" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Sign in</Link> to see pins from boards you follow.</p>
          : <PinGrid load={load} resetKey={`${tab}|${tag}|${q}`} onOpen={(p) => set({ pin: String(p.id) })} empty={tab === 'following' ? 'Follow a board and its newest pins show up here.' : 'No pins match that.'} />}
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
