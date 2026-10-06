import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Lock, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import myBoardsAPI from '../../../_shared/api/myBoards';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import { storageUrl } from '../../../_shared/lib/storageUrl';
import WorldTabs from '../../components/WorldTabs';

const tile = { display: 'block', textDecoration: 'none', borderRadius: 16, overflow: 'hidden', background: 'var(--surface-card)', border: '1px solid var(--line)', color: 'inherit' };
const cover = (src) => <div style={{ aspectRatio: '4 / 3', background: 'var(--surface-input, rgba(148,163,184,0.15))' }}>{src && <img src={storageUrl(src)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}</div>;

/** My boards: the boards I made (private unless I choose public) and the public boards I follow. */
export default function MyBoardsPage() {
  const nav = useNavigate();
  const [boards, setBoards] = useState(null);
  const [following, setFollowing] = useState([]);
  const [name, setName] = useState('');
  useEffect(() => {
    myBoardsAPI.list().then((r) => setBoards(r.data)).catch((e) => { toast.error(errMsg(e, 'Could not load your boards')); setBoards([]); });
    myBoardsAPI.following().then(setFollowing).catch(() => {});
  }, []);
  const make = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try { const r = await myBoardsAPI.create({ title: name.trim() }); nav(`/my/boards/${r.data.id}`); } catch (er) { toast.error(errMsg(er, 'Could not make the board')); }
  };

  return (
    <div className="min-h-screen">
      <Helmet><title>My boards | TISL</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '36px 24px 64px' }}>
        <WorldTabs active="mine" />
        <h1 style={{ margin: '0 0 6px', fontSize: 'clamp(1.7rem, 4vw, 2.3rem)', fontWeight: 900, color: 'var(--color-primary-500)' }}>My boards</h1>
        <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)' }}>Collect pins you love. New boards are private; make one public when you want others to see it. <Link to="/world" style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>Discover more ›</Link></p>
        <form onSubmit={make} style={{ display: 'flex', gap: 8, marginBottom: 24, maxWidth: 460 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name a new board" maxLength={160} aria-label="New board name" style={{ flex: 1, padding: '10px 14px', borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
          <button type="submit" disabled={!name.trim()} style={{ padding: '10px 18px', borderRadius: 999, border: 0, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, color: '#fff', background: 'var(--color-primary-500)', opacity: name.trim() ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Make</button>
        </form>
        {boards?.length === 0 && <p style={{ color: 'var(--text-tertiary)' }}>You have no boards yet. Name one above, or save a pin from Discover.</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
          {boards?.map((b) => (
            <Link key={b.id} to={`/my/boards/${b.id}`} style={tile}>
              {cover(b.cover)}
              <div style={{ padding: '10px 14px 14px' }}>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)', display: 'flex', gap: 6, alignItems: 'center' }}>{b.visibility === 'private' && <Lock size={13} color="var(--text-tertiary)" />}{b.title}</div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>{b.pins_count} {b.pins_count === 1 ? 'pin' : 'pins'}{b.visibility === 'public' ? ` · ${b.followers} ${b.followers === 1 ? 'follower' : 'followers'}` : ''}</div>
              </div>
            </Link>
          ))}
        </div>
        {following.length > 0 && (
          <>
            <h2 style={{ margin: '40px 0 14px', fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>Boards I follow</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
              {following.map((b) => (
                <Link key={b.id} to={`/boards/${b.slug_path}`} style={tile}>
                  {cover(b.cover)}
                  <div style={{ padding: '10px 14px 14px' }}><div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{b.title}</div><div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>{b.by ? `By ${b.by} · ` : ''}{b.pins_count} {b.pins_count === 1 ? 'pin' : 'pins'}</div></div>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
