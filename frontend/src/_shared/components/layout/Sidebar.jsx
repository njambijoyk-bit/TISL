import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LogOut, ChevronLeft, ChevronDown, Menu, X, HomeIcon, Volume2, VolumeX, Search, UserCircle,
  Sun, Moon, Monitor, Calculator,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../../theme';
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

/** Compact theme picker that lives in the sidebar header */
function SidebarThemePicker() {
  const { colourings, activeColouringId, mode, setColouring, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const ModeIcon = mode === 'light' ? Sun : mode === 'dark' ? Moon : Monitor;
  const activeColour = colourings.find(c => c.id === activeColouringId);
  const activeSwatch = activeColour?.light_tokens?.['--color-primary-500'] ?? 'var(--color-primary-500)';
  const activeColourings = colourings.filter(c => c.is_active !== false);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Theme"
        style={{
          width: 28, height: 28, borderRadius: 6,
          background: open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: activeSwatch, flexShrink: 0 }} />
        <ModeIcon size={10} style={{ color: 'rgba(255,255,255,0.6)' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          minWidth: 180,
          background: 'var(--bg-card, var(--bg-primary))',
          border: '1px solid var(--border-primary)',
          borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          zIndex: 9999, overflow: 'hidden',
        }}>
          {/* Mode row */}
          <div style={{ padding: '8px 10px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Mode
          </div>
          <div style={{ display: 'flex', padding: '4px 8px 8px', gap: 4 }}>
            {[{ v: 'system', Icon: Monitor }, { v: 'light', Icon: Sun }, { v: 'dark', Icon: Moon }].map(({ v, Icon }) => (
              <button key={v} type="button" onClick={() => setMode(v)}
                title={v.charAt(0).toUpperCase() + v.slice(1)}
                style={{
                  flex: 1, height: 28, borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: mode === v
                    ? 'color-mix(in srgb, var(--color-primary-500) 15%, var(--bg-secondary))'
                    : 'var(--bg-secondary)',
                  outline: mode === v ? '1.5px solid var(--color-primary-500)' : '1.5px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: mode === v ? 'var(--color-primary-500)' : 'var(--text-secondary)',
                  transition: 'all 120ms',
                }}>
                <Icon size={12} />
              </button>
            ))}
          </div>

          {/* Colour swatches */}
          {activeColourings.length > 0 && (
            <>
              <div style={{ padding: '4px 10px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted)', borderTop: '1px solid var(--border-primary)' }}>
                Colour
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 10px 10px' }}>
                {activeColourings.map(c => {
                  const swatch = c.light_tokens?.['--color-primary-500'] ?? '#a855f7';
                  const isActive = activeColouringId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setColouring(c.id); setOpen(false); }}
                      title={c.name}
                      style={{
                        width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer',
                        background: swatch,
                        outline: isActive ? `2.5px solid var(--color-primary-500)` : '2.5px solid transparent',
                        outlineOffset: 2,
                        boxShadow: isActive ? `0 0 0 1px white` : 'none',
                        transition: 'all 120ms',
                      }}
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* Link to appearance admin page */}
          <div style={{ borderTop: '1px solid var(--border-primary)' }}>
            <Link
              to="/admin/appearance"
              onClick={() => setOpen(false)}
              style={{
                display: 'block', padding: '8px 12px',
                fontSize: 11, color: 'var(--color-primary-500)', textDecoration: 'none',
                fontWeight: 500,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              Manage themes →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The admin sidebar. Everything it lists comes from navigation/adminNav.js,
 * filtered by the user's role and the active modules.
 *
 * Rendered once by AdminShell (`shell`). Older pages that still draw
 * <Sidebar /> themselves get nothing inside the shell, so there's never two.
 */
export default function Sidebar({ shell = false, onOpenSearch, onOpenCalc }) {
  const inShell = useAdminShell();
  if (inShell && !shell) return null;
  return <SidebarInner onOpenSearch={onOpenSearch} onOpenCalc={onOpenCalc} />;
}

function SidebarInner({ onOpenSearch, onOpenCalc }) {
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
  const active = useMemo(() => findActive(nav, location.pathname, location.search), [nav, location.pathname, location.search]);

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
    background: 'linear-gradient(135deg, var(--color-primary-600) 0%, var(--color-primary-500) 100%)',
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
            border: '1px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: 'var(--color-primary-500)',
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
              <SidebarThemePicker />
              <button type="button" onClick={audio.toggleMute} title={audio.muted ? 'Unmute sounds' : 'Mute sounds'}
                style={{ ...iconBtn, color: audio.muted ? 'var(--color-primary-500)' : iconBtn.color }}>
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
                background: 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
                color: TEXT_2, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem',
              }}
            >
              <Search size={14} style={{ color: 'var(--color-primary-500)', flexShrink: 0 }} />
              {!collapsed && (
                <>
                  <span style={{ flex: 1, textAlign: 'left' }}>Jump to…</span>
                  <kbd style={{ fontSize: '0.62rem', fontFamily: 'inherit', padding: '1px 5px', borderRadius: 4, border: '1px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)', color: 'var(--color-primary-500)' }}>Ctrl K</kbd>
                </>
              )}
            </button>
          </div>
        )}
        {onOpenCalc && (
          <div style={{ padding: collapsed ? '6px 8px 2px' : '6px 10px 2px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={onOpenCalc}
              onMouseEnter={audio.playHover}
              title="Calculator (Alt+C)"
              style={{
                width: '100%', height: 34,
                display: 'flex', alignItems: 'center', gap: 8,
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? 0 : '0 10px',
                borderRadius: 8,
                background: 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)',
                color: TEXT_2, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.78rem',
              }}
            >
              <Calculator size={14} style={{ color: 'var(--color-primary-500)', flexShrink: 0 }} />
              {!collapsed && (
                <>
                  <span style={{ flex: 1, textAlign: 'left' }}>Calculator</span>
                  <kbd style={{ fontSize: '0.62rem', fontFamily: 'inherit', padding: '1px 5px', borderRadius: 4, border: '1px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)', color: 'var(--color-primary-500)' }}>Alt C</kbd>
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
                  <div style={{ height: 1, background: 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)', margin: '10px 10px 6px' }} title={group.label} />
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
                      fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-primary-500)',
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
              background: location.pathname === '/admin/profile' ? 'color-mix(in srgb, var(--color-primary-500) 12%, transparent)' : 'transparent',
              color: TEXT_2,
            }}
          >
            <UserCircle size={16} style={{ flexShrink: 0, color: 'var(--color-primary-500)' }} />
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
