import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LogOut, ChevronLeft, ChevronDown, Menu, X, HomeIcon, Volume2, VolumeX, Search, UserCircle,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import ThemeSwitcher from '../common/ThemeSwitcher';
import useAuthStore from '../../store/authStore';
import { useLayoutAudio } from './useLayoutAudio';
import { useAdminShell } from './adminShellContext';
import { visibleNav, findActive } from '../../navigation/adminNav';

const W_OPEN = 240;
const W_COLLAPSED = 68;
const MOBILE_QUERY = '(max-width: 767px)';
const GROUPS_KEY = 'admin_nav_closed_groups';

const TEXT_2 = 'var(--color-text-secondary, var(--color-text-muted, var(--color-text)))';
const EASE = 'cubic-bezier(0.4,0,0.2,1)';

const readClosedGroups = () => {
  try { return new Set(JSON.parse(localStorage.getItem(GROUPS_KEY) ?? '[]')); } catch { return new Set(); }
};

function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = (e) => setMobile(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}

const roleLabel = (r) => (r ? r.replace(/_/g, ' ') : '');

/**
 * The admin sidebar. Everything it lists comes from navigation/adminNav.js,
 * filtered by the user's role and the active modules.
 *
 * Rendered once by AdminShell (`shell`). Older pages that still draw
 * <Sidebar /> themselves get nothing inside the shell, so there's never two.
 */
export default function Sidebar({ shell = false, onOpenSearch }) {
  const inShell = useAdminShell();
  if (inShell && !shell) return null;
  return <SidebarInner onOpenSearch={onOpenSearch} />;
}

function SidebarInner({ onOpenSearch }) {
  const audio = useLayoutAudio();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const isMobile = useIsMobile();

  const [collapsedPref, setCollapsedPref] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [closedGroups, setClosedGroups] = useState(readClosedGroups);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const collapsed = !isMobile && collapsedPref;
  const nav = useMemo(() => visibleNav(user), [user]);
  const active = useMemo(() => findActive(nav, location.pathname), [nav, location.pathname]);

  // Close the mobile drawer after navigating
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const toggleCollapse = (val) => {
    setCollapsedPref(val);
    localStorage.setItem('sidebar_collapsed', val);
    val ? audio.playCollapse() : audio.playExpand();
  };

  const toggleGroup = (id) => {
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); audio.playExpand(); } else { next.add(id); audio.playCollapse(); }
      try { localStorage.setItem(GROUPS_KEY, JSON.stringify([...next])); } catch { /* private mode */ }
      return next;
    });
  };

  const handleLogoutClick = () => { setShowLogoutModal(true); audio.playLogoutOpen(); };
  const handleLogoutConfirm = () => { setShowLogoutModal(false); audio.playLogoutConfirm(); logout(); navigate('/login'); };
  const handleLogoutCancel = () => { setShowLogoutModal(false); audio.playLogoutCancel(); };

  // ─── styles ────────────────────────────────────────────────────────────────
  const sidebarW = collapsed ? W_COLLAPSED : W_OPEN;

  const sidebarStyle = {
    position: 'fixed',
    top: 0, left: 0,
    height: '100vh',
    width: sidebarW,
    background: 'var(--color-sidebar-bg, var(--bg-secondary, #f9fafb))',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    transition: `width 220ms ${EASE}, transform 220ms ${EASE}`,
    transform: isMobile && !mobileOpen ? 'translateX(-100%)' : 'none',
    boxShadow: isMobile && mobileOpen ? '0 0 40px rgba(0,0,0,0.35)' : 'none',
    zIndex: 45,
    overflow: 'hidden',
  };

  const logoMarkStyle = {
    width: 32, height: 32, borderRadius: 8,
    background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'white', flexShrink: 0,
  };

  const iconBtn = {
    width: 28, height: 28, borderRadius: 6,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    color: 'var(--color-text-muted, var(--color-text-secondary, var(--color-text)))',
    transition: 'background 150ms',
    flexShrink: 0,
  };

  const linkBase = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: collapsed ? '9px 0' : '8px 12px',
    borderRadius: 8,
    textDecoration: 'none',
    fontSize: '0.82rem',
    fontWeight: 500,
    transition: 'background 150ms, color 150ms',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    justifyContent: collapsed ? 'center' : 'flex-start',
    margin: '1px 0',
  };

  const renderItem = (item) => {
    const isActive = active.item?.id === item.id;
    const Icon = item.icon;
    return (
      <Link
        key={item.id}
        to={item.path}
        aria-current={isActive ? 'page' : undefined}
        style={isActive
          ? { ...linkBase, background: item.color, color: '#fff' }
          : { ...linkBase, background: 'transparent', color: TEXT_2 }}
        title={collapsed ? item.title : ''}
        onClick={() => audio.playNav?.()}
        onMouseEnter={(e) => {
          audio.playHover();
          if (!isActive) {
            e.currentTarget.style.background = `${item.color}22`;
            e.currentTarget.style.color = item.color;
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = TEXT_2;
          }
        }}
      >
        <Icon size={16} style={{ flexShrink: 0, color: isActive ? '#fff' : item.color }} />
        {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>}
      </Link>
    );
  };

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mobile: hamburger + backdrop */}
      {isMobile && !mobileOpen && (
        <button
          type="button"
          onClick={() => { setMobileOpen(true); audio.playMenuToggle?.(); }}
          aria-label="Open menu"
          style={{
            position: 'fixed', top: 12, left: 12, zIndex: 44,
            width: 38, height: 38, borderRadius: 9,
            background: 'var(--bg-primary, #fff)',
            border: '1px solid rgba(168,85,247,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#a855f7',
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
          }}
        >
          <Menu size={18} />
        </button>
      )}
      {isMobile && mobileOpen && (
        <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 44, background: 'rgba(0,0,0,0.4)' }} />
      )}

      <aside style={sidebarStyle} aria-label="Admin navigation">

        {/* ── Logo ──────────────────────────────────────────────────────── */}
        <div style={{
          height: 60,
          display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? 0 : '0 14px 0 18px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <Link to="/" title="View the store" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={logoMarkStyle}><HomeIcon size={15} /></div>
            {!collapsed && (
              <div>
                <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--color-text, currentColor)' }}>
                  TISL
                </p>
                <p style={{ margin: 0, fontSize: '0.62rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-disabled, var(--color-text-muted, var(--color-text-secondary)))' }}>
                  Admin
                </p>
              </div>
            )}
          </Link>
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ThemeSwitcher />
              <button type="button" onClick={audio.toggleMute} title={audio.muted ? 'Unmute sounds' : 'Mute sounds'}
                style={{ ...iconBtn, color: audio.muted ? '#a855f7' : iconBtn.color }}>
                {audio.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              {isMobile ? (
                <button type="button" onClick={() => setMobileOpen(false)} style={iconBtn} title="Close menu" aria-label="Close menu">
                  <X size={14} />
                </button>
              ) : (
                <button type="button" onClick={() => toggleCollapse(true)} style={iconBtn} title="Collapse sidebar">
                  <ChevronLeft size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Quick jump ───────────────────────────────────────────────── */}
        {onOpenSearch && (
          <div style={{ padding: collapsed ? '10px 8px 2px' : '10px 10px 2px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={onOpenSearch}
              onMouseEnter={audio.playHover}
              title="Quick jump (Ctrl+K)"
              style={{
                width: '100%', height: 34,
                display: 'flex', alignItems: 'center', gap: 8,
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? 0 : '0 10px',
                borderRadius: 8,
                background: 'rgba(168,85,247,0.06)',
                border: '1px solid rgba(168,85,247,0.18)',
                color: TEXT_2, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem',
              }}
            >
              <Search size={14} style={{ color: '#a855f7', flexShrink: 0 }} />
              {!collapsed && (
                <>
                  <span style={{ flex: 1, textAlign: 'left' }}>Jump to…</span>
                  <kbd style={{ fontSize: '0.62rem', fontFamily: 'inherit', padding: '1px 5px', borderRadius: 4, border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7' }}>Ctrl K</kbd>
                </>
              )}
            </button>
          </div>
        )}

        {/* ── Nav ──────────────────────────────────────────────────────── */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '6px 8px 12px' : '6px 10px 12px' }}>
          {nav.map((group) => {
            if (!group.label) return <div key={group.id}>{group.items.map(renderItem)}</div>;

            const holdsActive = group.items.some((i) => i.id === active.item?.id);
            const open = collapsed || holdsActive || !closedGroups.has(group.id);

            return (
              <div key={group.id}>
                {collapsed ? (
                  <div style={{ height: 1, background: 'rgba(168,85,247,0.18)', margin: '10px 10px 6px' }} title={group.label} />
                ) : (
                  <button
                    type="button"
                    onClick={() => !holdsActive && toggleGroup(group.id)}
                    aria-expanded={open}
                    title={holdsActive ? undefined : open ? `Hide ${group.label}` : `Show ${group.label}`}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 8px 5px', background: 'none', border: 'none', fontFamily: 'inherit',
                      cursor: holdsActive ? 'default' : 'pointer', userSelect: 'none',
                      fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a855f7',
                    }}
                  >
                    {group.label}
                    {!holdsActive && (
                      <ChevronDown size={12} style={{ transition: `transform 180ms ${EASE}`, transform: open ? 'none' : 'rotate(-90deg)', opacity: 0.7 }} />
                    )}
                  </button>
                )}
                {open && group.items.map(renderItem)}
              </div>
            );
          })}
        </nav>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div style={{
          padding: collapsed ? '10px 8px' : '10px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {collapsed && (
            <button type="button" onClick={() => toggleCollapse(false)} title="Expand sidebar"
              style={{ ...iconBtn, width: '100%', height: 34, borderRadius: 8, marginBottom: 4 }}>
              <ChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}

          <Link
            to="/admin/profile"
            title={collapsed ? 'My profile' : ''}
            onMouseEnter={audio.playHover}
            style={{
              ...linkBase,
              background: location.pathname === '/admin/profile' ? 'rgba(168,85,247,0.12)' : 'transparent',
              color: TEXT_2,
            }}
          >
            <UserCircle size={16} style={{ flexShrink: 0, color: '#a855f7' }} />
            {!collapsed && (
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{user?.name ?? 'My profile'}</span>
                <span style={{ fontSize: '0.66rem', textTransform: 'capitalize', opacity: 0.7 }}>{roleLabel(user?.role)}</span>
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={handleLogoutClick}
            title={collapsed ? 'Sign out' : ''}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: collapsed ? '9px 0' : '8px 12px',
              borderRadius: 8,
              justifyContent: collapsed ? 'center' : 'flex-start',
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 500,
              color: 'rgba(239,68,68,0.7)',
              width: '100%',
              transition: 'background 150ms, color 150ms',
            }}
            onMouseEnter={(e) => {
              audio.playHover();
              e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
              e.currentTarget.style.color = '#f87171';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'rgba(239,68,68,0.7)';
            }}
          >
            <LogOut size={16} style={{ flexShrink: 0 }} />
            {!collapsed && 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Spacer so page content doesn't hide under the fixed sidebar */}
      <div style={{ width: isMobile ? 0 : sidebarW, flexShrink: 0, transition: `width 220ms ${EASE}` }} />

      {/* ── Logout confirmation ──────────────────────────────────────── */}
      {showLogoutModal && (
        <div
          onClick={handleLogoutCancel}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            style={{
              background: 'white', color: '#111827',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12, padding: '28px 28px 22px', width: 300,
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
              <LogOut size={18} color="#ef4444" />
            </div>
            <p id="logout-title" style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#ef4444' }}>Sign out?</p>
            <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: '#6b7280' }}>
              You'll need to sign back in to access the admin panel.
            </p>
            <button
              type="button"
              onClick={handleLogoutConfirm}
              style={{ padding: '9px 0', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', width: '100%', transition: 'background 150ms' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#dc2626'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#ef4444'; }}
            >
              Yes, sign out
            </button>
            <button
              type="button"
              onClick={handleLogoutCancel}
              autoFocus
              style={{ padding: '9px 0', borderRadius: 8, border: '1px solid #e5e7eb', background: 'transparent', color: '#4b5563', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 500, cursor: 'pointer', width: '100%', transition: 'background 150ms' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f9fafb'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              Stay logged in
            </button>
          </div>
        </div>
      )}
    </>
  );
}
