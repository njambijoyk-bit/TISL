import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Check, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import myBoardsAPI from '../../_shared/api/myBoards';
import useAuthStore from '../../_shared/store/authStore';
import { errMsg } from '../../_shared/store/helpers/apiState';

const pill = { padding: '9px 18px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none' };
const input = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--line)', background: 'var(--surface-input, var(--surface-card))', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.84rem' };

/** Save a pin to one of my boards, or make a new board for it. Signed-out visitors are sent to sign in. */
export default function SaveMenu({ pinId }) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [boards, setBoards] = useState(null);
  const [name, setName] = useState('');
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    myBoardsAPI.list(pinId).then((r) => setBoards(r.data)).catch((e) => toast.error(errMsg(e, 'Could not load your boards')));
    const off = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', off);
    return () => document.removeEventListener('mousedown', off);
  }, [open, pinId]);

  if (!user) return <Link to="/login" style={{ ...pill, background: 'var(--color-primary-500)', color: '#fff' }}><Bookmark size={14} /> Sign in to save</Link>;

  const save = async (b) => {
    if (b.has_pin) return;
    try { const r = await myBoardsAPI.save(b.id, [pinId]); toast.success(r.message); setBoards((x) => x.map((o) => (o.id === b.id ? { ...o, has_pin: true } : o))); }
    catch (e) { toast.error(errMsg(e, 'Could not save it')); }
  };
  const make = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const made = await myBoardsAPI.create({ title: name.trim() });
      const r = await myBoardsAPI.save(made.data.id, [pinId]);
      toast.success(r.message); setName(''); setBoards((x) => [{ ...made.data, has_pin: true, pins_count: 1 }, ...(x ?? [])]);
    } catch (er) { toast.error(errMsg(er, 'Could not make the board')); }
  };

  return (
    <span ref={box} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ ...pill, background: 'var(--color-primary-500)', color: '#fff', border: 0 }}><Bookmark size={14} /> Save</button>
      {open && (
        <div style={{ position: 'absolute', zIndex: 5, top: 'calc(100% + 8px)', left: 0, width: 280, maxHeight: 340, overflowY: 'auto', padding: 12, borderRadius: 14, background: 'var(--surface-card)', border: '1px solid var(--line)', boxShadow: '0 12px 32px rgba(0,0,0,0.25)' }}>
          <form onSubmit={make} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New board name" maxLength={160} style={input} aria-label="New board name" />
            <button type="submit" aria-label="Make board" disabled={!name.trim()} style={{ ...pill, padding: '6px 10px', background: 'var(--color-primary-500)', color: '#fff', border: 0, opacity: name.trim() ? 1 : 0.5 }}><Plus size={14} /></button>
          </form>
          {boards === null && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Loading…</p>}
          {boards?.length === 0 && <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>No boards yet. Name one above. New boards are private.</p>}
          {boards?.map((b) => (
            <button key={b.id} type="button" onClick={() => save(b)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '8px 6px', border: 0, background: 'transparent', cursor: b.has_pin ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit', fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</span>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>{b.visibility === 'private' ? 'Private' : 'Public'}</span>
              {b.has_pin && <Check size={15} color="var(--color-primary-500)" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
