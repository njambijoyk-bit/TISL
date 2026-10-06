import { Link } from 'react-router-dom';
import useAuthStore from '../../_shared/store/authStore';

const chip = (on) => ({ padding: '8px 16px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: on ? 800 : 600, fontSize: '0.84rem', textDecoration: 'none', color: on ? 'var(--color-primary-500)' : 'var(--text-secondary)', border: `1.5px solid ${on ? 'var(--color-primary-500)' : 'var(--line)'}`, background: on ? 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'transparent' });

/** The same row of links the world page has, so the moodboards and my-boards pages can reach every part of it. `active` is moodboards or mine. */
export default function WorldTabs({ active }) {
  const user = useAuthStore((s) => s.user);

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 22 }}>
      <Link to="/world" style={chip(false)}>Discover</Link>
      <Link to="/world?tab=following" style={chip(false)}>Following</Link>
      <Link to="/world?tab=boards" style={chip(false)}>Boards</Link>
      <Link to="/moodboards" style={chip(active === 'moodboards')}>Moodboards</Link>
      {user && <Link to="/my/boards" style={chip(active === 'mine')}>My boards</Link>}
    </div>
  );
}
