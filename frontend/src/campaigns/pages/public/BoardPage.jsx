import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { UserPlus, UserCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import worldAPI from '../../../_shared/api/world';
import myBoardsAPI from '../../../_shared/api/myBoards';
import useAuthStore from '../../../_shared/store/authStore';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import PinGrid from '../../components/PinGrid';
import PinDetail from '../../components/PinDetail';
import Discussion from '../../../extras/components/engagement/Discussion';
import { ReactionButton, ReportButton } from '../../../extras/components/engagement/Reactions';

/** A public board by its address (id-name): its name, who made it (not shown for the brand's own boards), and its pins in order. */
export default function BoardPage() {
  const { slug } = useParams();
  const id = parseInt(slug, 10);
  const [params, setParams] = useSearchParams();
  const open = params.get('pin');
  const [head, setHead] = useState(null);
  const [gone, setGone] = useState(false);
  const user = useAuthStore((s) => s.user);

  useEffect(() => { setHead(null); setGone(false); }, [id]);
  const load = useCallback(async (after) => {
    try {
      const b = await worldAPI.board(id, after);
      setHead((h) => h ?? { title: b.title, description: b.description, by: b.by, followers: b.followers, following: b.following, mine: b.mine });
      return { data: b.pins, next: b.next };
    } catch (e) { if (e?.response?.status === 404) setGone(true); throw e; }
  }, [id]);
  const toggle = async () => {
    try { const r = await (head.following ? myBoardsAPI.unfollow(id) : myBoardsAPI.follow(id)); setHead((h) => ({ ...h, following: r.following, followers: r.followers })); }
    catch (e) { toast.error(errMsg(e, 'That did not work')); }
  };
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
              {head && !head.mine && (user
                ? <button type="button" onClick={toggle} style={{ marginTop: 12, padding: '9px 20px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.86rem', display: 'inline-flex', alignItems: 'center', gap: 7, border: head.following ? '1.5px solid var(--line)' : 0, color: head.following ? 'var(--text-primary)' : '#fff', background: head.following ? 'transparent' : 'var(--color-primary-500)' }}>{head.following ? <><UserCheck size={14} /> Following</> : <><UserPlus size={14} /> Follow</>}</button>
                : <Link to="/login" style={{ display: 'inline-block', marginTop: 12, fontSize: '0.84rem', fontWeight: 700, color: 'var(--color-primary-500)' }}>Sign in to follow</Link>)}
            </div>
            {head && !head.mine && <div style={{ display: 'flex', gap: 18, justifyContent: 'center', margin: '-12px 0 22px' }}><ReactionButton type="board" id={id} /><ReportButton type="board" id={id} /></div>}
            <PinGrid load={load} resetKey={id} onOpen={(p) => setPin(String(p.id))} empty="No pins on this board yet." />
            {head && <div style={{ maxWidth: 720, margin: '40px auto 0' }}><Discussion type="board" id={id} kind="comment" /></div>}
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
