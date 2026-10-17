import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import SectionTabs from './SectionTabs';
import CommandPalette from './CommandPalette';
import Calculator from '../../../core/components/calculator/Calculator';
import useCalculatorStore from '../../store/calculatorStore';
import { AdminShellContext } from './adminShellContext';
import useAuthStore from '../../store/authStore';
import { visibleNav, findActive, stripFor, configurationTab } from '../../navigation/adminNav';
import { dialogOpen, pageHotkeyTarget } from '../../lib/pageHotkeys';

/**
 * The frame around every /admin and /driver page (a layout route in App.jsx):
 * one sidebar, the section tabs for the current page, and Ctrl+K quick jump.
 */
export default function AdminShell() {
  const { pathname, search } = useLocation();
  const user = useAuthStore((s) => s.user);
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();

  const nav = useMemo(() => visibleNav(user), [user]);
  const active = useMemo(() => findActive(nav, pathname, search), [nav, pathname, search]);
  const strip = useMemo(() => stripFor(nav, active, pathname, user), [nav, active, pathname, user]);   // (a Menus page shows the Menus strip, whichever sidebar item it is)

  // The till has no menu around it. Ctrl+B (Cmd+B) brings the sidebar in and takes it away again.
  const onPos = /^\/admin\/pos\/?$/.test(pathname);
  const [posMenu, setPosMenu] = useState(false);
  useEffect(() => { if (!onPos) setPosMenu(false); }, [onPos]);
  useEffect(() => {
    if (!onPos) return undefined;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'b') return;
      e.preventDefault();
      e.stopImmediatePropagation();   // the sidebar's own Ctrl+B (collapse) must not also run
      setPosMenu((v) => !v);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onPos]);
  const showSidebar = !onPos || posMenu;

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  // Alt+C anywhere in the admin: the finance calculator
  const toggleCalc = useCalculatorStore((s) => s.toggle);
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyC') {
        e.preventDefault();
        toggleCalc();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleCalc]);

  // Ctrl+K / ⌘K anywhere in the admin
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // F12 and F7 anywhere in the admin press the page's own Configuration / Recycle bin control (see pageHotkeys); F12 falls back to the section's Configuration tab
  const configPath = useMemo(() => configurationTab(nav, active.item)?.path, [nav, active.item]);
  useEffect(() => {
    const onKey = (e) => {
      if (!['F12', 'F7'].includes(e.key) || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || dialogOpen()) return;
      const target = pageHotkeyTarget(e.key);
      if (target) { e.preventDefault(); target.click(); return; }
      if (e.key === 'F12' && configPath) { e.preventDefault(); navigate(configPath); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [configPath, navigate]);

  const ctx = useMemo(() => ({ openSearch }), [openSearch]);

  return (
    <AdminShellContext.Provider value={ctx}>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-secondary, #f9fafb)' }}>
        {showSidebar && <Sidebar shell onOpenSearch={openSearch} onOpenCalc={toggleCalc} />}
        <main className="admin-shell-main" style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
          {!onPos && <SectionTabs item={strip.item} activeTab={strip.tab} />}   {/* the till is a screen of its own: no tab strip above it */}
          <Outlet />
        </main>
      </div>
      {searchOpen && <CommandPalette onClose={closeSearch} nav={nav} />}
      <Calculator />
      <style>{showSidebar ? '@media (max-width:767px){.admin-shell-main{padding-top:56px}}' : ''}</style>
    </AdminShellContext.Provider>
  );
}
