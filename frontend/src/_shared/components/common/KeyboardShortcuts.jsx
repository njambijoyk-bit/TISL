import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, UserCircle, LayoutDashboard, Home, X } from 'lucide-react';
import useAuthStore from '../../store/authStore';
import { hasPermission, isStaff, roleName } from '../../lib/roles';
import booksAPI from '../../api/books';
import { newVoucherPath } from '../../../core/components/admin/books/booksFmt';
import { toggleAccountMenu } from '../../lib/accountShortcut';
import useAiPanelStore from '../../store/useAiPanelStore';
import useNavStore from '../../store/navStore';
import useThemeStore from '../../store/themeStore';
import { useTheme } from '../../theme';
import { MENUS_TABS, openTabs } from '../../navigation/adminNav';
import { closeTarget, dialogOpen, pageHotkeyTarget, saveTarget, searchBox, topDialog } from '../../lib/pageHotkeys';

/** Where a key press must be left alone: typing in a box, or a screen that is full of scanner input. */
const typing = (e) => {
  const t = e.target;

  return !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
};
const quiet = (path) => /^\/(admin\/pos|pos\/|kiosk\/)/.test(path);

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
const ACCENTS = ['#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

/**
 * Shift+A shows the shortcuts and Shift+U (or Alt+A) opens the account dropdown, the page's own when it has one, else a small one here.
 * On the storefront every navigation link whose admin gave it a letter (Settings > Navigation) opens with Shift + that letter.
 * Shift is used rather than Alt, Ctrl or Cmd, which a Mac keeps for itself. Nothing fires while typing in a field or with a dialog open.
 * Nothing on the screens says so: they are nice to know. The admin menu's own shortcuts (Ctrl+K, Alt+C, Ctrl+B) are fixed in the app.
 */
export default function KeyboardShortcuts() {
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [account, setAccount] = useState(false);
  const [list, setList] = useState(false);
  const [q, setQ] = useState('');   // what is typed in the list's search box
  const [picker, setPicker] = useState(false);   // Shift+V in Books: pick a voucher type by its letter
  const [types, setTypes] = useState([]);
  const staff = isAuthenticated && isStaff(user);
  const inAdmin = pathname.startsWith('/admin');
  const aiHere = !!useAiPanelStore((st) => st.context);   // the AI panel is only on pages it has context for
  const inBooks = pathname.startsWith('/admin/books');
  const inMenus = pathname.startsWith('/admin/menus');
  const goPending = useRef(0);   // when G was pressed in Menus: the next letter picks a page
  const voucherPage = /^\/admin\/books\/vouchers\/\d+\/?$/.test(pathname);
  const canPost = isAuthenticated && hasPermission(user, 'books.post');
  const { links, loaded, fetch: fetchNav } = useNavStore();
  // letter -> link, for the storefront only: the admin has its own fixed shortcuts
  const byLetter = {};
  if (!inAdmin) links.forEach((l) => { if (l.shortcut) byLetter[l.shortcut.toUpperCase()] = l; });
  const letters = JSON.stringify(Object.keys(byLetter).sort().map((k) => [k, byLetter[k].path]));

  useEffect(() => { if (!loaded) fetchNav(); }, [loaded, fetchNav]);

  const { mode, setMode } = useTheme();
  const { setTheme } = useThemeStore();
  const popupOpen = useRef(false);
  popupOpen.current = account || list || picker;
  const pick = useRef({ open: false, types: [] });
  pick.current = { open: picker, types };
  const signOut = () => { logout(); setAccount(false); navigate(inAdmin ? '/login' : '/'); };
  const toggleDark = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = dark ? 'light' : 'dark';
    setMode(next); setTheme(next);
  };

  useEffect(() => { setAccount(false); setList(false); setPicker(false); }, [pathname]);
  useEffect(() => {   // the voucher types and their letters, once, when Books is opened
    if (inBooks && canPost && !types.length) booksAPI.types().then((r) => setTypes((r ?? []).filter((t) => t.is_active))).catch(() => {});
  }, [inBooks, canPost, types.length]);
  useEffect(() => {
    const press = (el) => { if (el) { el.click(); return true; } return false; };
    const onKey = (e) => {
      // Esc closes our own popups first, else the open dialog (its Close button or X); Shift+Esc signs out
      if (e.key === 'Escape') {
        if (quiet(pathname)) return;
        if (e.shiftKey) {
          if (isAuthenticated) { e.preventDefault(); signOut(); }
          return;
        }
        if (popupOpen.current) { setAccount(false); setList(false); setPicker(false); return; }
        if (!e.defaultPrevented) press(closeTarget());
        return;
      }
      if (quiet(pathname)) return;
      // Menus pages: G, then a letter, goes to that Menus page (only the ones this person may open)
      if (inMenus && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !typing(e) && !dialogOpen() && /^Key[A-Z]$/.test(e.code)) {
        const letter = e.code.slice(3);
        if (goPending.current && Date.now() - goPending.current < 1500) {
          goPending.current = 0;
          const tab = openTabs(MENUS_TABS, user).find((t) => t.key === letter);
          if (tab) { e.preventDefault(); navigate(tab.path); return; }
        } else if (letter === 'G') {
          goPending.current = Date.now();
          return;
        }
      }
      if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) goPending.current = 0;
      // the voucher picker: a letter opens a new voucher of that type
      if (pick.current.open && !e.ctrlKey && !e.metaKey && !e.altKey && /^Key[A-Z]$/.test(e.code)) {
        e.preventDefault();
        const type = pick.current.types.find((t) => t.shortcut === e.code.slice(3));
        if (type) { setPicker(false); navigate(newVoucherPath(type)); }
        return;
      }
      // Ctrl+S / Cmd+S presses the one Save button of the dialog or page. The browser's own Save page is never wanted in the app.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.code === 'KeyS') {
        e.preventDefault();
        const save = saveTarget();
        if (save) { document.activeElement?.blur?.(); setTimeout(() => save.click(), 0); }   // a field that saves on leaving does so first
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      const free = !typing(e) && !dialogOpen();
      if (!e.shiftKey && !e.altKey) {
        if (e.key === '/' && free) {
          const box = searchBox();
          if (box) { e.preventDefault(); box.focus(); box.select?.(); }
        } else if (e.key === 'F4' && inBooks && !dialogOpen()) {   // the edit log: this voucher's when the page has that button, else the whole log
          e.preventDefault();
          const log = pageHotkeyTarget('EditLog', undefined, 'nav.admin-section-tabs');
          if (log) log.click(); else navigate('/admin/books/edit-log');
        } else if (['F2', 'F3', 'F8', 'F9'].includes(e.key) && !dialogOpen() && (e.key !== 'F2' || inAdmin)) {
          const target = pageHotkeyTarget(e.key);
          if (target) { e.preventDefault(); target.click(); }
        }
        return;
      }
      if (e.shiftKey && !e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key) && free) {
        const target = pageHotkeyTarget(e.key === 'ArrowLeft' ? 'Previous' : 'Next');
        if (target) { e.preventDefault(); target.click(); }
        return;
      }
      const letter = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : '';   // the key's place, not its character: Alt+A types a different letter on a Mac
      if (!letter) return;
      if (e.altKey && !e.shiftKey && letter === 'A') {
        e.preventDefault();
        if (!isAuthenticated) { navigate('/login'); return; }
        if (!toggleAccountMenu()) setAccount((v) => !v);   // the page's own dropdown, or ours
      } else if (e.shiftKey && !e.altKey && !typing(e) && (!dialogOpen() || ['A', 'N'].includes(letter))) {
        const openAccount = () => {
          if (!isAuthenticated) { navigate('/login'); return; }
          if (!toggleAccountMenu()) setAccount((v) => !v);
        };
        const fixed = {
          A: () => setList((v) => { if (!v) setQ(''); return !v; }),
          U: openAccount,
          M: () => press(document.querySelector('button[aria-label="Chat with Mimi"]')),   // Mimi's bubble, open or closed
          ...(staff ? { N: () => press(document.querySelector('button[aria-label="Open the memo panel"]') ?? topDialog()?.querySelector('button[aria-label="Close"]')) } : {}),
          R: () => press(pageHotkeyTarget('Refresh')),
          T: toggleDark,
          ...(inBooks && canPost ? { V: () => setPicker(true) } : {}),
          ...(voucherPage ? {
            E: () => press(pageHotkeyTarget('Edit')), X: () => press(pageHotkeyTarget('Cancel')), D: () => press(pageHotkeyTarget('CustomerCopy')),
            S: () => press(pageHotkeyTarget('Send')), C: () => press(pageHotkeyTarget('Convert')), P: () => press(pageHotkeyTarget('Receive')),
          } : {}),
        };
        if (fixed[letter]) { e.preventDefault(); fixed[letter](); return; }
        const to = Object.fromEntries(JSON.parse(letters))[letter];
        if (to) { e.preventDefault(); navigate(to); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isAuthenticated, navigate, inAdmin, inBooks, inMenus, user, voucherPage, canPost, letters, mode]);

  const mod = MAC ? '⌘' : 'Ctrl';
  const rows = [
    ['Shift', 'A', 'Show this list'],
    ['Shift', 'U', 'Open your account menu'],
    ['Alt', 'A', 'Open your account menu (the other way)'],
    ...Object.keys(byLetter).sort().map((k) => ['Shift', k, `Go to ${byLetter[k].label}`]),
    ['Shift', 'M', 'Chat with Mimi'],
    ...(staff ? [['Shift', 'N', 'Open or close the memo']] : []),   // the memo is for staff only
    ['Shift', 'T', 'Switch between light and dark'],
    ['', '/', 'Search this page'],
    ['Shift', 'R', 'Refresh the list'],
    ['Shift', '←', 'Previous page of the list'],
    ['Shift', '→', 'Next page of the list'],
    ['', 'F3', 'Switch the layout (table or cards)'],
    ['', 'F8', 'Show or hide the filters'],
    ['', 'F9', 'Export or download'],
    [mod, 'S', 'Save'],
    ['', 'Esc', 'Close the open dialog'],
    ['Shift', 'Esc', 'Sign out'],
    ...(inAdmin ? [['', 'F2', 'New: add what this page lists'], ['', 'F12', 'Open the Configuration of this page or section'], ['', 'F7', 'Open the Recycle bin or Trash of this page'],
      ['Ctrl', 'K', 'Jump to any page'], ['Alt', 'C', 'Open the calculator'], ...(aiHere ? [['Alt', 'I', 'Open the AI panel (Esc closes it)']] : []), ['Ctrl', 'B', 'Show or hide the menu']] : []),
    ...(inMenus ? openTabs(MENUS_TABS, user).filter((t) => t.key).map((t) => ['G', t.key, `Go to Menus, ${t.title} (press G, then ${t.key})`]) : []),
    ...(inBooks && new URLSearchParams(search).get('tab') === 'reports' ? [['G', 'letter', 'Go to a report: every report has its own letter, shown in the list (G P is Profit & loss, G O the cost-centre version)'], ['', '1 – 9', 'Open your favourite reports, in the order you starred them'],
      ['', '[  ]', 'Previous or next report in the list'], ['', 'R', 'Run the report (Ctrl+Enter also works from a date box)'], ['', 'E', 'Open the export menu'], ['', 'F', 'Star or unstar this report']] : []),
    ...(inBooks && new URLSearchParams(search).get('tab') === 'visuals' ? [['G', 'key', 'Go to a chart: every chart has its own key, shown in the chart list (G then 0 goes back to the questions)'], ['', '1 – 9', 'Open your favourite charts, in the order you starred them'],
      ['', '[  ]', 'Previous or next chart'], ['', 'F', 'Star or unstar the open chart'], ['', 'R', 'Reload the open chart'], ['', 'T', 'Switch the open chart between chart and table'], ['', 'I', 'Save the open chart as an image']] : []),
    ...(inBooks && canPost ? [['Shift', 'V', 'New voucher: then press the type\'s letter'], ['', 'F4', 'Open the edit log']] : []),
    ...(voucherPage ? [['Shift', 'E', 'Edit this voucher'], ['Shift', 'X', 'Cancel this voucher (asks why first)'], ['Shift', 'D', 'Download the customer copy'], ['Shift', 'S', 'Send this voucher'], ['Shift', 'C', 'Convert this voucher'], ['Shift', 'P', 'Receive payment']] : []),
  ];
  const squash = (t) => t.toLowerCase().replace(/[\s+]/g, '');
  const shown = rows.filter(([a, b, what]) => squash(`${a} ${a === 'Alt' ? 'option' : ''} ${a === 'Ctrl' ? 'cmd command' : ''} ${b} ${what}`).includes(squash(q)));
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
      {picker && (
        <div role="dialog" data-shortcut-list aria-label="New voucher" onClick={() => setPicker(false)} style={{ position: 'fixed', inset: 0, zIndex: 9992, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px, 100%)', maxHeight: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column', borderRadius: 18, background: 'var(--bg-card, #fff)', color: 'var(--text-primary)', boxShadow: '0 30px 80px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ height: 6, flexShrink: 0, background: `linear-gradient(90deg, ${ACCENTS.join(', ')})` }} />
            <div style={{ padding: '0 20px 20px', display: 'grid', gap: 6, alignContent: 'start', overflowY: 'auto', minHeight: 0, flex: 1 }}>
              <div style={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0 8px', background: 'var(--bg-card, #fff)' }}>
                <strong style={{ fontSize: '1.05rem' }}>New voucher: press a letter</strong>
                <button type="button" aria-label="Close" onClick={() => setPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'grid', padding: 4 }}><X size={18} /></button>
              </div>
              {types.length === 0 && <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>Loading the voucher types…</span>}
              {types.map((t, i) => {
                const c = ACCENTS[i % ACCENTS.length];
                return (
                  <button key={t.id} type="button" onClick={() => { setPicker(false); navigate(newVoucherPath(t)); }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 10, border: 'none', borderLeft: `4px solid ${c}`, background: 'var(--bg-secondary, #f9fafb)', color: 'inherit', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                    <kbd style={{ minWidth: 30, padding: '3px 9px', borderRadius: 7, textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, fontFamily: 'inherit', color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, border: `1.5px solid color-mix(in srgb, ${c} 45%, transparent)`, boxShadow: `0 2px 0 color-mix(in srgb, ${c} 35%, transparent)` }}>{t.shortcut || '–'}</kbd>
                    <span style={{ fontSize: '0.88rem' }}>{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {list && (
        <div role="dialog" data-shortcut-list aria-label="Keyboard shortcuts" onClick={() => setList(false)} style={{ position: 'fixed', inset: 0, zIndex: 9992, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(400px, 100%)', maxHeight: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column', borderRadius: 18, background: 'var(--bg-card, #fff)', color: 'var(--text-primary)', boxShadow: '0 30px 80px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ height: 6, flexShrink: 0, background: `linear-gradient(90deg, ${ACCENTS.join(', ')})` }} />
            <div style={{ padding: '0 20px 20px', display: 'grid', gap: 8, alignContent: 'start', overflowY: 'auto', minHeight: 0, flex: 1 }}>
              <div style={{ position: 'sticky', top: 0, zIndex: 1, padding: '16px 0 8px', background: 'var(--bg-card, #fff)', display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '1.05rem' }}>Shortcuts</strong>
                  <button type="button" aria-label="Close" onClick={() => setList(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'grid', padding: 4 }}><X size={18} /></button>
                </div>
              <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shortcuts and actions" aria-label="Search shortcuts and actions"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1.5px solid var(--border-primary, #e5e7eb)', background: 'var(--bg-secondary, #f9fafb)', color: 'inherit', fontFamily: 'inherit', fontSize: '0.85rem', outline: 'none' }} />
              </div>
              {shown.length === 0 && <span style={{ fontSize: '0.85rem', opacity: 0.7, padding: '6px 2px' }}>Nothing matches “{q}”.</span>}
              {shown.map(([a, b, what], i) => {
                const c = ACCENTS[i % ACCENTS.length];
                const cap = { minWidth: 30, padding: '3px 9px', borderRadius: 7, textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, fontFamily: 'inherit', color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, border: `1.5px solid color-mix(in srgb, ${c} 45%, transparent)`, boxShadow: `0 2px 0 color-mix(in srgb, ${c} 35%, transparent)` };

                return (
                  <div key={`${a}${b}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 10, borderLeft: `4px solid ${c}`, background: 'var(--bg-secondary, #f9fafb)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 104 }}>
                      {a && <><kbd style={cap}>{a === 'Alt' && MAC ? '⌥ Option' : a}</kbd><span style={{ opacity: 0.5 }}>{a === 'G' ? 'then' : '+'}</span></>}<kbd style={cap}>{b}</kbd>
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
