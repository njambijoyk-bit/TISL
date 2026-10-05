import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { X } from 'lucide-react';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import worldAPI from '../../../_shared/api/world';
import PinGrid from '../../components/PinGrid';
import PinDetail from '../../components/PinDetail';

/** A public board by its address (id-name): its name, who made it (not shown for the brand's own boards), and its pins in order. */
export default function BoardPage() {
  const { slug } = useParams();
  const id = parseInt(slug, 10);
  const [params, setParams] = useSearchParams();
  const open = params.get('pin');
  const [head, setHead] = useState(null);
  const [gone, setGone] = useState(false);

  useEffect(() => { setHead(null); setGone(false); }, [id]);
  const load = useCallback(async (after) => {
    try {
      const b = await worldAPI.board(id, after);
      setHead((h) => h ?? { title: b.title, description: b.description, by: b.by, followers: b.followers });
      return { data: b.pins, next: b.next };
    } catch (e) { if (e?.response?.status === 404) setGone(true); throw e; }
  }, [id]);
  const setPin = (v) => setParams(v ? { pin: v } : {}, { replace: !v });

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setPin(''); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen">
      <Helmet><title>{head ? `${head.title} | TISL` : 'Board | TISL'}</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px 64px' }}>
        <Link to="/world" style={{ fontSize: '0.84rem', color: 'var(--color-primary-500)', fontWeight: 700 }}>‹ Discover</Link>
        {gone ? <p style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>This board is not available.</p> : (
          <>
            <div style={{ textAlign: 'center', margin: '10px 0 28px' }}>
              <h1 style={{ margin: 0, fontSize: 'clamp(1.6rem, 4vw, 2.3rem)', fontWeight: 900, color: 'var(--text-primary)' }}>{head?.title ?? ' '}</h1>
              {head?.description && <p style={{ margin: '8px auto 0', maxWidth: 560, color: 'var(--text-secondary)' }}>{head.description}</p>}
              {head && <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>{head.by ? `By ${head.by} · ` : ''}{head.followers} {head.followers === 1 ? 'follower' : 'followers'}</p>}
            </div>
            <PinGrid load={load} resetKey={id} onOpen={(p) => setPin(String(p.id))} empty="No pins on this board yet." />
          </>
        )}
      </main>
      <Footer />
      {open && (
        <div onClick={() => setPin('')} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.62)', overflowY: 'auto', padding: '4vh 16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: 820, margin: '0 auto', background: 'var(--surface-card)', borderRadius: 20, overflow: 'hidden' }}>
            <button type="button" onClick={() => setPin('')} aria-label="Close" style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, width: 34, height: 34, borderRadius: '50%', border: 0, cursor: 'pointer', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            <PinDetail key={open} id={open} />
          </div>
        </div>
      )}
    </div>
  );
}
