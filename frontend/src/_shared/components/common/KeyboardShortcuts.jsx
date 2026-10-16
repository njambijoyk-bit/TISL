import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, UserCircle, LayoutDashboard, Home, X } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { isStaff, roleName } from '../../lib/roles';
import { toggleAccountMenu } from '../../lib/accountShortcut';
import useNavStore from '../../store/navStore';

/** Where a key press must be left alone: typing in a box, or a screen that is full of scanner input. */
const typing = (e) => {
  const t = e.target;

  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
};
/** A dialog (other than our own list) is open: the page behind it is not the one being used. */
const dialogOpen = () => !!document.querySelector('[role="dialog"]:not([data-shortcut-list]), dialog[open], [aria-modal="true"]');
const quiet = (path) => /^\/(admin\/pos|pos\/|kiosk\/)/.test(path);

const ACCENTS = ['#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

/**
 * Shift+A shows the shortcuts and Shift+U (or Alt+A) opens the account dropdown, the page's own when it has one, else a small one here.
 * On the storefront every navigation link whose admin gave it a letter (Settings > Navigation) opens with Shift + that letter.
 * Shift is used rather than Alt, Ctrl or Cmd, which a Mac keeps for itself. Nothing fires while typing in a field or with a dialog open.
 * Nothing on the screens says so: they are nice to know. The admin menu's own shortcuts (Ctrl+K, Alt+C, Ctrl+B) are fixed in the app.
 */
export default function KeyboardShortcuts() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [account, setAccount] = useState(false);
  const [list, setList] = useState(false);
  const staff = isAuthenticated && isStaff(user);
  const inAdmin = pathname.startsWith('/admin');
  const { links, loaded, fetch: fetchNav } = useNavStore();
  // letter -> link, for the storefront only: the admin has its own fixed shortcuts
  const byLetter = {};
  if (!inAdmin) links.forEach((l) => { if (l.shortcut) byLetter[l.shortcut.toUpperCase()] = l; });
  const letters = JSON.stringify(Object.keys(byLetter).sort().map((k) => [k, byLetter[k].path]));

  useEffect(() => { if (!loaded) fetchNav(); }, [loaded, fetchNav]);

  useEffect(() => { setAccount(false); setList(false); }, [pathname]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setAccount(false); setList(false); return; }
      if (quiet(pathname) || e.ctrlKey || e.metaKey) return;
      const letter = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : '';   // the key's place, not its character: Alt+A types a different letter on a Mac
      if (!letter) return;
      if (e.altKey && !e.shiftKey && letter === 'A') {
        e.preventDefault();
        if (!isAuthenticated) { navigate('/login'); return; }
        if (!toggleAccountMenu()) setAccount((v) => !v);   // the page's own dropdown, or ours
      } else if (e.shiftKey && !e.altKey && !typing(e) && (!dialogOpen() || letter === 'A')) {
        if (letter === 'A') {
          e.preventDefault();
          setList((v) => !v);
        } else if (letter === 'U') {
          e.preventDefault();
          if (!isAuthenticated) { navigate('/login'); return; }
          if (!toggleAccountMenu()) setAccount((v) => !v);
        } else {
          const to = Object.fromEntries(JSON.parse(letters))[letter];
          if (to) { e.preventDefault(); navigate(to); }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pathname, isAuthenticated, navigate, inAdmin, letters]);

  const rows = [
    ['Shift', 'U', 'Open your account menu'],
    ['Alt', 'A', 'Open your account menu'],
    ['Shift', 'A', 'Show this list'],
    ...Object.keys(byLetter).sort().map((k) => ['Shift', k, `Go to ${byLetter[k].label}`]),
    ...(inAdmin ? [['Ctrl', 'K', 'Jump to any page'], ['Alt', 'C', 'Open the calculator'], ['Ctrl', 'B', 'Show or hide the menu']] : []),
    ['Esc', '', 'Close whatever is open'],
  ];
  const signOut = () => { logout(); setAccount(false); navigate(inAdmin ? '/login' : '/'); };
  const link = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' };

  return (
    <>
      {account && isAuthenticated && (
        <>
          <div onClick={() => setAccount(false)} style={{ position: 'fixed', inset: 0, zIndex: 9990 }} />
          <div role="menu" aria-label="Account" style={{ position: 'fixed', top: 16, right: 16, zIndex: 9991, width: 250, padding: 8, borderRadius: 14, background: 'var(--bg-card, #fff)', color: 'var(--text-primary)', border: '1px solid var(--border-primary, #e5e7eb)', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px 12px', borderBottom: '1px solid var(--border-primary, #e5e7eb)', marginBottom: 6 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{(user?.name || user?.email || 'U')[0].toUpperCase()}</span>
              <span style={{ minWidth: 0, lineHeight: 1.25 }}>
                <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name || user?.email}</span>
                <span style={{ display: 'block', fontSize: '0.72rem', opacity: 0.65, textTransform: 'capitalize' }}>{roleName(user)}</span>
              </span>
            </div>
            <Link role="menuitem" to={staff ? '/admin/profile' : '/profile'} style={link}><UserCircle size={16} style={{ color: ACCENTS[0] }} /> My profile</Link>
            {staff && <Link role="menuitem" to="/admin" style={link}><LayoutDashboard size={16} style={{ color: ACCENTS[1] }} /> Dashboard</Link>}
            <Link role="menuitem" to="/" style={link}><Home size={16} style={{ color: ACCENTS[2] }} /> {staff ? 'The shop' : 'Home'}</Link>
            <button type="button" role="menuitem" onClick={signOut} style={{ ...link, width: '100%', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: '#ef4444' }}><LogOut size={16} /> Sign out</button>
          </div>
        </>
      )}
      {list && (
        <div role="dialog" data-shortcut-list aria-label="Keyboard shortcuts" onClick={() => setList(false)} style={{ position: 'fixed', inset: 0, zIndex: 9992, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(400px, 100%)', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', borderRadius: 18, background: 'var(--bg-card, #fff)', color: 'var(--text-primary)', boxShadow: '0 30px 80px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ height: 6, background: `linear-gradient(90deg, ${ACCENTS.join(', ')})` }} />
            <div style={{ padding: '16px 20px 20px', display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '1.05rem' }}>Shortcuts</strong>
                <button type="button" aria-label="Close" onClick={() => setList(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'grid', padding: 4 }}><X size={18} /></button>
              </div>
              {rows.map(([a, b, what], i) => {
                const c = ACCENTS[i % ACCENTS.length];
                const cap = { minWidth: 30, padding: '3px 9px', borderRadius: 7, textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, fontFamily: 'inherit', color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, border: `1.5px solid color-mix(in srgb, ${c} 45%, transparent)`, boxShadow: `0 2px 0 color-mix(in srgb, ${c} 35%, transparent)` };

                return (
                  <div key={what} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 10, borderLeft: `4px solid ${c}`, background: 'var(--bg-secondary, #f9fafb)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 104 }}>
                      <kbd style={cap}>{a}</kbd>{b && <><span style={{ opacity: 0.5 }}>+</span><kbd style={cap}>{b}</kbd></>}
                    </span>
                    <span style={{ fontSize: '0.85rem' }}>{what}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
