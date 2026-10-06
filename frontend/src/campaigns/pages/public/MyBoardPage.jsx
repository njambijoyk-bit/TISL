import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Header from '../../../_shared/components/layout/Header';
import Footer from '../../../_shared/components/layout/Footer';
import myBoardsAPI from '../../../_shared/api/myBoards';
import { errMsg } from '../../../_shared/store/helpers/apiState';
import PinGrid from '../../components/PinGrid';
import PinDetail from '../../components/PinDetail';
import MyPinForm from '../../components/MyPinForm';

const field = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--surface-card)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem' };
const btn = (primary) => ({ padding: '9px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: 6, border: primary ? 0 : '1.5px solid var(--line)', color: primary ? '#fff' : 'var(--text-primary)', background: primary ? 'var(--color-primary-500)' : 'transparent' });

/** One of my boards: change its name and who can see it, add my own pins, and remove pins. The owner sees private boards here. */
export default function MyBoardPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [b, setB] = useState(null);
  const [f, setF] = useState({ title: '', description: '', visibility: 'private' });
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [rules, setRules] = useState(null);   // may I add my own pins, and how many are left this month
  useEffect(() => { myBoardsAPI.pinRules().then(setRules).catch(() => {}); }, [tick]);
  const [open, setOpen] = useState(null);

  const take = (d) => { setB(d); setF({ title: d.title, description: d.description ?? '', visibility: d.visibility }); };
  const load = useCallback(async () => {
    try { const d = await myBoardsAPI.get(id); take(d); return { data: d.pins, next: null }; }
    catch (e) { toast.error(errMsg(e, 'Could not open the board')); nav('/my/boards', { replace: true }); return { data: [], next: null }; }
  }, [id, nav]);
  useEffect(() => { setB(null); }, [id]);

  const save = async (e) => {
    e.preventDefault();
    try { const r = await myBoardsAPI.update(id, f); toast.success(r.message); setTick((t) => t + 1); } catch (er) { toast.error(errMsg(er, 'Could not save')); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete "${b.title}"?`)) return;
    try { await myBoardsAPI.remove(id); toast.success('Board deleted'); nav('/my/boards', { replace: true }); } catch (er) { toast.error(errMsg(er, 'Could not delete it')); }
  };
  const [asking, setAsking] = useState(null);   // my own pin: take it off this board only, or delete it everywhere
  const drop = async (p, everywhere = false) => {
    try {
      if (everywhere) await myBoardsAPI.deletePin(p.id);
      else await myBoardsAPI.removePin(id, p.id);
      setAsking(null); setOpen(null); setTick((t) => t + 1);
    } catch (er) { toast.error(errMsg(er, 'That did not work')); }
  };
  const shown = b?.pins?.find((p) => p.id === open);

  return (
    <div className="min-h-screen">
      <Helmet><title>{b ? `${b.title} | TISL` : 'My board | TISL'}</title></Helmet>
      <Header />
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 24px 64px' }}>
        <Link to="/my/boards" style={{ fontSize: '0.84rem', color: 'var(--color-primary-500)', fontWeight: 700 }}>‹ My boards</Link>
        <form onSubmit={save} style={{ display: 'grid', gap: 10, maxWidth: 560, margin: '14px 0 26px' }}>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Board name" maxLength={160} required style={{ ...field, fontSize: '1.3rem', fontWeight: 800 }} />
          <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} aria-label="About this board" placeholder="About this board (optional)" maxLength={500} style={field} />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })} aria-label="Who can see it" style={{ ...field, width: 'auto' }}><option value="private">Private: only me</option><option value="public">Public: everyone</option></select>
            <button type="submit" style={btn(true)}>Save</button>
            <button type="button" style={{ ...btn(false), color: 'var(--status-error, #b91c1c)', marginLeft: 'auto' }} onClick={remove}><Trash2 size={14} /> Delete board</button>
          </div>
          {b && <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>{b.visibility === 'public' ? `Public. The pins on it show in Discover. ${b.followers} ${b.followers === 1 ? 'follower' : 'followers'}. ` : 'Private. Only you, and our team if needed, can see it. '}{b.visibility === 'public' && <Link to={`/boards/${b.slug_path}`} style={{ color: 'var(--color-primary-500)', fontWeight: 700 }}>View as visitor</Link>}</p>}
        </form>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>Pins{b ? ` (${b.pins_count})` : ''}</h2>
          {rules && !rules.enabled
            ? <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Adding your own pins is switched off. You can still save pins from Discover.</span>
            : (
              <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                {rules?.limit > 0 && <span style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>{rules.remaining} of {rules.limit} left this month</span>}
                <button type="button" style={{ ...btn(true), opacity: rules && !rules.allowed ? 0.5 : 1 }} disabled={rules ? !rules.allowed : false} onClick={() => setAdding(true)}><Plus size={14} /> Add a pin</button>
              </span>
            )}
        </div>
        <PinGrid load={load} resetKey={`${id}|${tick}`} onOpen={(p) => setOpen(p.id)} empty="Nothing here yet. Add a pin, or save pins from Discover." />
      </main>
      <Footer />
      {adding && <MyPinForm boardId={Number(id)} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); setTick((t) => t + 1); }} />}
      {open && (
        <div onClick={() => setOpen(null)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.62)', overflowY: 'auto', padding: '4vh 16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: 820, margin: '0 auto', background: 'var(--surface-card)', borderRadius: 20, overflow: 'hidden' }}>
            <button type="button" onClick={() => setOpen(null)} aria-label="Close" style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, width: 34, height: 34, borderRadius: '50%', border: 0, cursor: 'pointer', background: 'rgba(0,0,0,0.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            <PinDetail key={open} id={open} pin={shown} own />
            {shown && <div style={{ padding: '0 22px 22px' }}><button type="button" style={{ ...btn(false), color: 'var(--status-error, #b91c1c)' }} onClick={() => (shown.mine ? setAsking(shown) : drop(shown))}><Trash2 size={14} /> {shown.mine ? 'Remove or delete' : 'Remove from this board'}</button></div>}
          </div>
        </div>
      )}
      {asking && (
        <div onClick={() => setAsking(null)} role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: '100%', background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 18, padding: 22, display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>This is your own pin</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>Take it off this board only, or delete it everywhere? Deleting removes it from every board it was saved to, including other people's.</p>
            <button type="button" style={btn(false)} onClick={() => drop(asking)}>Take off this board only</button>
            <button type="button" style={{ ...btn(false), color: 'var(--status-error, #b91c1c)' }} onClick={() => drop(asking, true)}>Delete the pin everywhere</button>
            <button type="button" style={{ ...btn(false), border: 0 }} onClick={() => setAsking(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
