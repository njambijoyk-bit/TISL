import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart, FileText, Users,
  Star, Settings, LogOut, ChevronLeft, Menu, Tag, Award, BarChart2,
  Wrench, FolderTree, MessageSquare, ClipboardList, UserCog, LifeBuoy,
  HomeIcon, Gavel, DollarSign,
} from 'lucide-react';
import { useState } from 'react';
import ThemeSwitcher from '../common/ThemeSwitcher';
import useAuthStore from '../../store/authStore';

const MENU_GROUPS = [
  {
    label: 'Catalogue',
    items: [
      { title: 'Products',           icon: Package,       path: '/admin/products',           color: '#a855f7' }, // purple
      {title:  'Hampers',            icon: Award,         path: '/admin/hampers',            color: '#fc7bf5'},
      { title: 'Auctions',           icon: Gavel,         path: '/admin/auctions',           color: '#ef4444' },
      { title: 'Categories',         icon: Tag,           path: '/admin/categories',         color: '#3b82f6' }, // blue
      { title: 'Brands',             icon: Award,         path: '/admin/brands',             color: '#f59e0b' }, // amber
      { title: 'Services',           icon: Wrench,        path: '/admin/services',           color: '#10b981' }, // emerald
      { title: 'Service Categories', icon: FolderTree,    path: '/admin/service-categories', color: '#06b6d4' }, // cyan
    ],
  },
  {
    label: 'Sales',
    items: [
      { title: 'Orders',         icon: ShoppingCart,  path: '/admin/orders',         color: '#f97316' }, // orange
      { title: 'Payments',       icon: DollarSign,    path: '/admin/finance/payments', color: '#10b981' }, // ← ADD THIS (emerald green)
      { title: 'Quotes',         icon: FileText,      path: '/admin/quotes',         color: '#8b5cf6' }, // violet
      { title: 'Quote Requests', icon: MessageSquare, path: '/admin/quote-requests', color: '#ec4899' }, // pink
      { title: 'Projects',       icon: ClipboardList, path: '/admin/projects',       color: '#14b8a6' }, // teal
    ],
  },
  {
    label: 'People',
    items: [
      { title: 'Customers',  icon: Users,   path: '/admin/customers',  color: '#6366f1' }, // indigo
      {title: 'Loyalties',   icon: Award,   path: '/admin/loyalty',      color: '#fc7bf5'},
      { title: 'Users',      icon: UserCog, path: '/admin/users',      color: '#0ea5e9' }, // sky
      { title: 'Employees',  icon: Star,    path: '/admin/employees',  color: '#eab308' }, // yellow
    ],
  },
  {
    label: 'Support',
    items: [
      { title: 'Reviews', icon: Star, path: '/admin/reviews', color: '#f59e0b' }, 
      { title: 'Tickets', icon: LifeBuoy, path: '/admin/tickets', color: '#ef4444' }, // red
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Settings', icon: Settings,  path: '/admin/settings', color: '#64748b' }, // slate
      { title: 'Reports',  icon: BarChart2, path: '/admin/reports',  color: '#22c55e' }, // green
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  // ─── Role filter for menu items ─────────────────────────────────────
  const { user } = useAuthStore();
  const canSeePayments = ['admin', 'super_admin', 'finance'].includes(user?.role);

  const filterMenuItems = (items) => {
    return items.filter(item => {
      // Payments is the only role-restricted item for now
      if (item.path === '/admin/finance/payments') {
        return canSeePayments;
      }
      return true; // all other items visible to all admin roles
    });
  };

  const isActive = (path) =>
    path === '/admin' ? location.pathname === path : location.pathname.startsWith(path);

  //const handleLogout = () => { logout(); navigate('/login'); };
  
  // 1. Add this state near your other useState calls
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // 2. Replace handleLogout with these two handlers
  const handleLogoutClick = () => setShowLogoutModal(true);
  const handleLogoutConfirm = () => { setShowLogoutModal(false); logout(); navigate('/login'); };
  const handleLogoutCancel = () => setShowLogoutModal(false);

  // ─── styles ────────────────────────────────────────────────────────────────
  const sidebarW = collapsed ? 68 : 240;

  const sidebarStyle = {
    position: 'fixed',
    top: 0, left: 0,
    height: '100vh',
    width: sidebarW,
    background: 'var(--color-sidebar-bg, var(--color-bg-elevated, var(--color-bg)))',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
    zIndex: 40,
    overflow: 'hidden',
  };

  const logoAreaStyle = {
    height: 60,
    display: 'flex',
    alignItems: 'center',
    justifyContent: collapsed ? 'center' : 'space-between',
    padding: collapsed ? '0' : '0 14px 0 18px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  };

  const logoMarkStyle = {
    width: 32, height: 32, borderRadius: 8,
    background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.7rem', fontWeight: 900,
    color: 'white', // always white — must contrast against the purple gradient
    letterSpacing: '0.04em', flexShrink: 0,
  };

  const collapseBtn = {
    width: 28, height: 28, borderRadius: 6,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    color: 'var(--color-text-muted, var(--color-text-secondary, var(--color-text)))',
    transition: 'background 150ms',
    flexShrink: 0,
  };

  const groupLabelStyle = {
    fontSize: '0.6rem', fontWeight: 700,
    color: '#a855f7',
    letterSpacing: '0.1em', textTransform: 'uppercase',
    padding: collapsed ? '16px 0 6px' : '16px 18px 6px',
    textAlign: collapsed ? 'center' : 'left',
    userSelect: 'none',
  };

  const linkBase = {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: collapsed ? '9px 0' : '9px 12px',
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

  const linkActive = {
    ...linkBase,
    background: '#a855f7',
    color: '#faf5ff', // ← purple accent, kept
  };

  const linkInactive = {
    ...linkBase,
    background: 'transparent',
    color: 'var(--color-text-secondary, var(--color-text-muted, var(--color-text)))',
  };

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(v => !v)}
        style={{
          display: 'none',
          position: 'fixed', top: 18, left: 16, zIndex: 50,
          width: 36, height: 36, borderRadius: 8,
          background: 'var(--color-sidebar-bg, var(--color-bg-elevated, var(--color-bg)))',
          border: '1px solid rgba(255,255,255,0.1)',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--color-text, currentColor)',
        }}
      >
        <Menu size={18} />
      </button>

      <aside style={sidebarStyle}>

        {/* ── Logo ──────────────────────────────────────────────────────── */}
        <div style={logoAreaStyle}>
          {!collapsed && (
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <div style={logoMarkStyle}><HomeIcon size={15} /></div>
              <div>
                <p style={{
                  margin: 0, fontSize: '0.875rem', fontWeight: 800, letterSpacing: '-0.01em',
                  color: 'var(--color-text, currentColor)',
                }}>
                  BLUEARC
                </p>
                <p style={{
                  margin: 0, fontSize: '0.62rem', letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--color-text-disabled, var(--color-text-muted, var(--color-text-secondary)))',
                }}>
                  Admin
                </p>
              </div>
            </Link>
          )}
          {collapsed && (
            <Link to="/" style={{ textDecoration: 'none' }}>
              <div style={logoMarkStyle}><HomeIcon size={15} /></div>
            </Link>
          )}
          {!collapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ThemeSwitcher />
              <button onClick={() => setCollapsed(true)} style={collapseBtn} title="Collapse sidebar">
                <ChevronLeft size={14} />
              </button>
            </div>
          )}
        </div>

        {/* ── Nav ──────────────────────────────────────────────────────── */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '8px 8px' : '8px 10px' }}>

          <Link
            to="/admin"
            style={isActive('/admin') ? linkActive : linkInactive}
            title={collapsed ? 'Dashboard' : ''}
          >
            <LayoutDashboard size={16} style={{ flexShrink: 0 }} />
            {!collapsed && 'Dashboard'}
          </Link>

          {MENU_GROUPS.map(group => {
            const filteredItems = filterMenuItems(group.items); // ← APPLY FILTER
            if (filteredItems.length === 0) return null; // skip empty groups

            return (
              <div key={group.label}>
                <p style={groupLabelStyle}>
                  {collapsed ? '·' : group.label}
                </p>
                {filteredItems.map(item => {  // ← USE FILTERED ITEMS
                  const active = isActive(item.path);
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      style={active ? { ...linkBase, background: item.color, color: '#fff' } : linkInactive}
                      title={collapsed ? item.title : ''}
                      onMouseEnter={e => {
                        if (!active) {
                          e.currentTarget.style.background = `${item.color}22`;
                          e.currentTarget.style.color = item.color;
                        }
                      }}
                      onMouseLeave={e => {
                        if (!active) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--color-text-secondary, var(--color-text-muted, var(--color-text)))';
                        }
                      }}
                    >
                      <item.icon size={16} style={{ flexShrink: 0, color: active ? '#fff' : item.color }} />
                      {!collapsed && item.title}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div style={{
          padding: collapsed ? '12px 8px' : '12px 10px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
              style={{ ...collapseBtn, width: '100%', height: 34, borderRadius: 8, marginBottom: 4 }}
            >
              <ChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} />
            </button>
          )}

          <button
            onClick={handleLogoutClick}
            title={collapsed ? 'Logout' : ''}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: collapsed ? '9px 0' : '9px 12px',
              borderRadius: 8,
              justifyContent: collapsed ? 'center' : 'flex-start',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '0.82rem', fontWeight: 500,
              color: 'rgba(239,68,68,0.7)', // ← red accent, kept
              width: '100%',
              transition: 'background 150ms, color 150ms',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(239,68,68,0.1)';
              e.currentTarget.style.color = '#f87171'; // ← red accent hover, kept
            }}
            onMouseLeave={e => {
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
      <div style={{ width: sidebarW, flexShrink: 0, transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)' }} />

      {/* ── Logout Confirmation Modal ─────────────────────────────────── */}
      {showLogoutModal && (
        <div
          onClick={handleLogoutCancel}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              color: '#111827',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12,
              padding: '28px 28px 22px',
              width: 300,
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            {/* Icon */}
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: 'rgba(239,68,68,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 4,
            }}>
              <LogOut size={18} color="#ef4444" />
            </div>

            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#ef4444' }}>
              Sign out?
            </p>
            <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: 'var(--color-text-secondary, var(--color-text-muted))' }}>
              You'll need to sign back in to access the admin panel.
            </p>

            <button
              onClick={handleLogoutConfirm}
              style={{
                padding: '9px 0', borderRadius: 8, border: 'none',
                background: '#ef4444', color: '#fff',
                fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
                cursor: 'pointer', width: '100%',
                transition: 'background 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#dc2626'}
              onMouseLeave={e => e.currentTarget.style.background = '#ef4444'}
            >
              Yes, sign out
            </button>

            <button
              onClick={handleLogoutCancel}
              style={{
                padding: '9px 0', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'transparent',
                color: 'var(--color-text-secondary, var(--color-text-muted))',
                fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 500,
                cursor: 'pointer', width: '100%',
                transition: 'background 150ms',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              Stay logged in
            </button>
          </div>
        </div>
      )}
    </>
  );
}