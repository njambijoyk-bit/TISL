import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart, FileText, Users,
  Star, Settings, LogOut, ChevronLeft, Menu, Tag, Award, BarChart2,
  Wrench, FolderTree, MessageSquare, ClipboardList, UserCog, LifeBuoy,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import ThemeSwitcher from '../common/ThemeSwitcher';
import useAuthStore from '../../store/authStore';

const MENU_GROUPS = [
  {
    label: 'Catalogue',
    items: [
      { title: 'Products',           icon: Package,       path: '/admin/products' },
      { title: 'Categories',         icon: Tag,           path: '/admin/categories' },
      { title: 'Brands',             icon: Award,         path: '/admin/brands' },
      { title: 'Services',           icon: Wrench,        path: '/admin/services' },
      { title: 'Service Categories', icon: FolderTree,    path: '/admin/service-categories' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { title: 'Orders',         icon: ShoppingCart,  path: '/admin/orders' },
      { title: 'Quotes',         icon: FileText,      path: '/admin/quotes' },
      { title: 'Quote Requests', icon: MessageSquare, path: '/admin/quote-requests' },
      { title: 'Projects',       icon: ClipboardList, path: '/admin/projects' },
    ],
  },
  {
    label: 'People',
    items: [
      { title: 'Customers',  icon: Users,   path: '/admin/customers' },
      { title: 'Users',      icon: UserCog, path: '/admin/users' },
      { title: 'Employees',  icon: Star,    path: '/admin/employees' },
    ],
  },
  {
    label: 'Support',
    items: [
      { title: 'Tickets', icon: LifeBuoy, path: '/admin/tickets' },
    ],
  },
  {
    label: 'System',
    items: [
      { title: 'Settings', icon: Settings,  path: '/admin/settings' },
      { title: 'Reports',  icon: BarChart2, path: '/admin/reports' },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const isActive = (path) =>
    path === '/admin' ? location.pathname === path : location.pathname.startsWith(path);

  const handleLogout = () => { logout(); navigate('/login'); };

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
        className="admin-mobile-toggle"
        style={{
          display: 'none',
          position: 'fixed', top: 18, left: 16, zIndex: 50,
          width: 42, height: 42, borderRadius: 10,
          background: 'var(--color-sidebar-bg, var(--color-bg-elevated, var(--color-bg)))',
          border: '1px solid rgba(255,255,255,0.1)',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          color: 'var(--color-text, currentColor)',
        }}
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="admin-sidebar-overlay"
          style={{
            position: 'fixed', inset: 0, zIndex: 39,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      <aside style={sidebarStyle} className={`admin-nav-aside${mobileOpen ? ' admin-sidebar-open' : ''}`}>

        {/* ── Logo ──────────────────────────────────────────────────────── */}
        <div style={logoAreaStyle}>
          {!collapsed && (
            <Link to="/admin" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
              <div style={logoMarkStyle}>BA</div>
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
            <Link to="/admin" style={{ textDecoration: 'none' }}>
              <div style={logoMarkStyle}>BA</div>
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

          {MENU_GROUPS.map(group => (
            <div key={group.label}>
              <p style={groupLabelStyle}>
                {collapsed ? '·' : group.label}
              </p>
              {group.items.map(item => {
                const active = isActive(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    style={active ? linkActive : linkInactive}
                    title={collapsed ? item.title : ''}
                    onMouseEnter={e => {
                      if (!active) {
                        e.currentTarget.style.background = '#e9d5ff';
                        e.currentTarget.style.color = '#a855f7';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--color-text-secondary, var(--color-text-muted, var(--color-text)))';
                      }
                    }}
                  >
                    <item.icon size={16} style={{ flexShrink: 0 }} />
                    {!collapsed && item.title}
                  </Link>
                );
              })}
            </div>
          ))}
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
            onClick={handleLogout}
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
      <div className="admin-sidebar-spacer" style={{ width: sidebarW, flexShrink: 0, transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)' }} />

      <style>{`
        @media (max-width: 768px) {
          .admin-mobile-toggle {
            display: flex !important;
          }
          .admin-nav-aside {
            transform: translateX(-100%);
            transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1), width 220ms cubic-bezier(0.4,0,0.2,1) !important;
            width: 260px !important;
          }
          .admin-nav-aside.admin-sidebar-open {
            transform: translateX(0) !important;
          }
          .admin-sidebar-spacer {
            width: 0 !important;
          }
          .admin-nav-aside nav a, .admin-nav-aside button {
            font-size: 0.9rem;
            min-height: 42px;
          }
        }
        @media (min-width: 769px) {
          .admin-sidebar-overlay {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}