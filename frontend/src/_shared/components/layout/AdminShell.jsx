import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import SectionTabs from './SectionTabs';
import CommandPalette from './CommandPalette';
import { AdminShellContext } from './adminShellContext';
import useAuthStore from '../../store/authStore';
import { visibleNav, findActive } from '../../navigation/adminNav';

/**
 * The frame around every /admin and /driver page (a layout route in App.jsx):
 * one sidebar, the section tabs for the current page, and Ctrl+K quick jump.
 */
export default function AdminShell() {
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const [searchOpen, setSearchOpen] = useState(false);

  const nav = useMemo(() => visibleNav(user), [user]);
  const active = useMemo(() => findActive(nav, pathname), [nav, pathname]);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

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

  const ctx = useMemo(() => ({ openSearch }), [openSearch]);

  return (
    <AdminShellContext.Provider value={ctx}>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-secondary, #f9fafb)' }}>
        <Sidebar shell onOpenSearch={openSearch} />
        <main className="admin-shell-main" style={{ flex: 1, minWidth: 0, overflowX: 'hidden' }}>
          <SectionTabs item={active.item} activeTab={active.tab} />
          <Outlet />
        </main>
      </div>
      {searchOpen && <CommandPalette onClose={closeSearch} nav={nav} />}
      <style>{'@media (max-width:767px){.admin-shell-main{padding-top:56px}}'}</style>
    </AdminShellContext.Provider>
  );
}
