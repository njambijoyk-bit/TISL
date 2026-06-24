import {
  ShoppingCart, Heart, User, Package, Wrench, FileText, ClipboardList,
  FolderOpen, LogOut, Settings, Zap, Star, LifeBuoy, Bug, ChevronLeft,
  LayoutGrid, Volume2, VolumeX, BookOpen, Truck, BarChart3, Newspaper,
  HelpCircle, Gavel, CreditCard, Calendar, Gift, Receipt, FileQuestion,
  Shield, Cookie, Globe, Lock, Monitor, BookMarked, MessageSquare,
  MapPin, Clock, PackageCheck, ShoppingBag, Tag, Award, FileSpreadsheet,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import ThemeSwitcher from '../common/ThemeSwitcher';
import useAuthStore from '../../store/authStore';
import { useLayoutAudio } from './useLayoutAudio';

const PANEL_W   = 224;
const PANEL_W_C = 52;

/* ── Customer navigation groups ─────────────────────────────────────────── */
const CUSTOMER_GROUPS = [
  {
    label: 'Shop',
    items: [
      { name: 'Home',           icon: LayoutGrid,      bg: 'linear-gradient(135deg,#7c3aed,#a855f7)', path: '/',              active: true },
      { name: 'Products',       icon: Package,         bg: 'linear-gradient(135deg,#7c3aed,#a855f7)', path: '/products',      active: true },
      { name: 'Services',       icon: Wrench,          bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)', path: '/services',      active: true },
      { name: 'Specials',       icon: Zap,             bg: 'linear-gradient(135deg,#ef4444,#f87171)', path: '/specials',      active: true },
      { name: 'Auctions',       icon: Gavel,           bg: 'linear-gradient(135deg,#f59e0b,#fbbf24)', path: '/auctions',      active: true },
      { name: 'Brochures',      icon: Newspaper,       bg: 'linear-gradient(135deg,#06b6d4,#22d3ee)', path: '/brochures',     active: true },
      { name: 'Hampers',        icon: Gift,            bg: 'linear-gradient(135deg,#ec4899,#f472b6)', path: '/hampers',       active: true },
    ],
  },
  {
    label: 'My Account',
    items: [
      { name: 'My Profile',      icon: User,          bg: 'linear-gradient(135deg,#7c3aed,#a855f7)', path: '/profile',           active: true },
      { name: 'My Orders',       icon: ShoppingBag,   bg: 'linear-gradient(135deg,#10b981,#34d399)', path: '/orders',            active: true },
      { name: 'Cart',            icon: ShoppingCart,  bg: 'linear-gradient(135deg,#f59e0b,#fbbf24)', path: '/cart',              active: true },
      { name: 'Wishlist',        icon: Heart,         bg: 'linear-gradient(135deg,#ef4444,#f87171)', path: '/wishlist',          active: true },
      { name: 'Quote List',      icon: ClipboardList, bg: 'linear-gradient(135deg,#8b5cf6,#a78bfa)', path: '/quote-list',        active: true },
      { name: 'My Quotes',       icon: FileText,      bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)', path: '/my-quotes',         active: true },
      { name: 'Quote Requests',  icon: FileQuestion,  bg: 'linear-gradient(135deg,#f59e0b,#fbbf24)', path: '/my-quote-requests', active: true },
      { name: 'My Projects',     icon: FolderOpen,    bg: 'linear-gradient(135deg,#06b6d4,#22d3ee)', path: '/my-projects',       active: true },
      { name: 'My Bookings',     icon: Calendar,      bg: 'linear-gradient(135deg,#ec4899,#f472b6)', path: '/bookings',          active: true },
      { name: 'My Tickets',      icon: LifeBuoy,      bg: 'linear-gradient(135deg,#8b5cf6,#a78bfa)', path: '/my-tickets',        active: true },
      { name: 'My Hampers',      icon: Gift,          bg: 'linear-gradient(135deg,#ec4899,#f472b6)', path: '/hampers/my-orders', active: true },
      { name: 'Delivery History',icon: Truck,         bg: 'linear-gradient(135deg,#10b981,#34d399)', path: '/delivery-history',  active: true },
      { name: 'Bug Reports',     icon: Bug,           bg: 'linear-gradient(135deg,#c2410c,#ea580c)', path: '/account/bug-reports', active: true },
    ],
  },
  {
    label: 'Actions',
    items: [
      { name: 'Request Quote',   icon: FileSpreadsheet, bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)', path: '/request-quote',     active: true },
      { name: 'Checkout',        icon: CreditCard,      bg: 'linear-gradient(135deg,#10b981,#34d399)', path: '/checkout',          active: true },
      { name: 'Report a Bug',    icon: Bug,             bg: 'linear-gradient(135deg,#c2410c,#ea580c)', path: '/report-bug',        active: true },
      { name: 'Track Bug',       icon: MapPin,          bg: 'linear-gradient(135deg,#f59e0b,#fbbf24)', path: '/track-bug',         active: true },
      { name: 'Dev Portal',      icon: Monitor,         bg: 'linear-gradient(135deg,#7c3aed,#a855f7)', path: '/dev/portal',        active: true },
    ],
  },
  {
    label: 'Info',
    items: [
      { name: 'About',           icon: Star,            bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)', path: '/about',          active: true },
      { name: 'Contact',         icon: MessageSquare,   bg: 'linear-gradient(135deg,#10b981,#34d399)', path: '/contact',        active: true },
      { name: 'Manual',          icon: BookOpen,        bg: 'linear-gradient(135deg,#f59e0b,#fbbf24)', path: '/manual',         active: true },
    ],
  },
  {
    label: 'Legal',
    items: [
      { name: 'Privacy Policy',     icon: Shield,     bg: 'linear-gradient(135deg,#7c3aed,#a855f7)', path: '/privacy',        active: true },
      { name: 'Terms of Service',   icon: FileText,   bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)', path: '/terms',          active: true },
      { name: 'Cookie Policy',      icon: Cookie,     bg: 'linear-gradient(135deg,#f59e0b,#fbbf24)', path: '/cookies',        active: true },
      { name: 'Website Policy',     icon: Globe,      bg: 'linear-gradient(135deg,#10b981,#34d399)', path: '/website-policy', active: true },
      { name: 'Hamper Policy',      icon: Gift,         bg: 'linear-gradient(135deg,#ec4899,#f472b6)', path: '/hamper-policy',  active: true },
      { name: 'Order Policy',       icon: Receipt,      bg: 'linear-gradient(135deg,#06b6d4,#22d3ee)', path: '/order-policy',   active: true },
      { name: 'Booking Policy',     icon: Calendar,     bg: 'linear-gradient(135deg,#8b5cf6,#a78bfa)', path: '/booking-policy', active: true },
      { name: 'AI Policy',          icon: Zap,          bg: 'linear-gradient(135deg,#c2410c,#ea580c)', path: '/ai-policy',      active: true },
    ],
  },
];

export default function CustomerLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const audio        = useLayoutAudio();
  const navigate     = useNavigate();
  const { pathname } = useLocation();

  const { user, logout, isAuthenticated } = useAuthStore();

  const doCollapse = (val) => {
    setCollapsed(val);
    val ? audio.playCollapse() : audio.playExpand();
  };

  const handleLogout = () => {
    logout();
    navigate('/');
    audio.playNav();
  };

  /* ── shared style tokens ──────────────────────────────────────────────── */
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
    letterSpacing: '0.1em', textTransform: 'uppercase',
    color: '#a855f7',
    padding: collapsed ? '14px 0 4px' : '14px 8px 4px',
    textAlign: collapsed ? 'center' : 'left',
    userSelect: 'none',
    margin: 0,
  };

  const btnBase = {
    width: '100%',
    display: 'flex', alignItems: 'center',
    gap: 10,
    padding: collapsed ? '7px 0' : '7px 8px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius: 8, border: 'none',
    background: 'transparent', textAlign: 'left',
    cursor: 'pointer', fontFamily: 'inherit',
    fontSize: '0.82rem', fontWeight: 500,
    transition: 'background 150ms, color 150ms',
    marginBottom: 1, overflow: 'hidden', whiteSpace: 'nowrap',
  };

  const iconSquare = (bg) => ({
    width: 24, height: 24, borderRadius: 6,
    background: bg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
  });

  /* ── render ───────────────────────────────────────────────────────────── */
  return (
    <div style={{
      minHeight: '100vh',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ──────────────────────────────────────────────────── */}
        <aside style={{
          width: collapsed ? PANEL_W_C : PANEL_W,
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: 'var(--color-sidebar-bg, var(--color-bg-elevated, var(--color-bg)))',
          display: 'flex', flexDirection: 'column',
          transition: 'width 220ms cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
        }}>

          {/* ── Header ── */}
          <div style={{
            height: 52,
            display: 'flex', alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            padding: collapsed ? '0' : '0 10px 0 14px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0, gap: 6,
          }}>
            {!collapsed && (
              <>
                <Link
                  to="/"
                  onClick={() => audio.playNav()}
                  onMouseEnter={audio.playHover}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    color: 'var(--color-text-disabled, var(--color-text-muted, var(--color-text-secondary)))',
                    background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'color 150ms',
                    textDecoration: 'none',
                  }}
                  title="Home"
                >
                  <LayoutGrid size={13} />
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Customer
                  </span>
                </Link>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ThemeSwitcher />
                  <button
                    onClick={audio.toggleMute}
                    onMouseEnter={audio.playHover}
                    title={audio.muted ? 'Unmute sounds' : 'Mute sounds'}
                    style={{ ...collapseBtn, color: audio.muted ? '#a855f7' : undefined }}
                  >
                    {audio.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <button
                    onClick={() => doCollapse(true)}
                    onMouseEnter={audio.playHover}
                    style={collapseBtn}
                    title="Collapse panel"
                  >
                    <ChevronLeft size={14} />
                  </button>
                </div>
              </>
            )}

            {collapsed && (
              <Link
                to="/"
                style={{
                  width: 28, height: 28, borderRadius: 7,
                  background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textDecoration: 'none',
                }}
                title="Home"
              >
                <LayoutGrid size={13} color="white" />
              </Link>
            )}
          </div>

          {/* ── Nav ── */}
          <nav style={{
            padding: collapsed ? '6px 4px' : '6px 8px',
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
          }}>
            {CUSTOMER_GROUPS.map((group, groupIndex) => (
              <div key={group.label}>
                {groupIndex > 0 && !collapsed && (
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                )}

                <p style={groupLabelStyle}>
                  {collapsed ? '·' : group.label}
                </p>

                {group.items.map((item) => {
                  const Icon     = item.icon;
                  const isActive = pathname === item.path || pathname.startsWith(item.path + '/');

                  return (
                    <button
                      key={item.name}
                      onClick={() => {
                        if (item.active) { navigate(item.path); audio.playNav(); }
                      }}
                      onMouseEnter={e => {
                        audio.playHover();
                        if (!isActive && item.active) {
                          e.currentTarget.style.background = 'rgba(168,85,247,0.08)';
                          e.currentTarget.style.color = '#d8b4fe';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isActive && item.active) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--color-text-secondary, var(--color-text-muted, var(--color-text)))';
                        }
                      }}
                      title={collapsed ? item.name : ''}
                      disabled={!item.active}
                      style={{
                        ...btnBase,
                        background: isActive ? 'rgba(168,85,247,0.15)' : 'transparent',
                        color: isActive
                          ? '#5a4c69'
                          : 'var(--color-text-secondary, var(--color-text-muted, var(--color-text)))',
                        opacity: item.active ? 1 : 0.4,
                        cursor: item.active ? 'pointer' : 'default',
                      }}
                    >
                      <div style={iconSquare(item.bg)}>
                        <Icon size={12} color="white" strokeWidth={2.2} />
                      </div>
                      {!collapsed && (
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* ── Footer: user mini-card + expand trigger ── */}
          {collapsed ? (
            <div style={{
              padding: '10px 4px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              {/* Avatar */}
              <Link
                to="/profile"
                onClick={() => audio.playNav()}
                style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textDecoration: 'none',
                  flexShrink: 0,
                }}
                title={user?.name || 'Profile'}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'white' }}>
                  {(user?.name || user?.email || 'U')[0].toUpperCase()}
                </span>
              </Link>

              {/* Expand button */}
              <button
                onClick={() => doCollapse(false)}
                onMouseEnter={audio.playHover}
                title="Expand panel"
                style={{ ...collapseBtn, width: '100%', height: 32, borderRadius: 8 }}
              >
                <ChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} />
              </button>
            </div>
          ) : (
            <div style={{
              padding: '10px 8px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              {/* User card */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px',
                borderRadius: 10,
                background: 'rgba(168,85,247,0.06)',
                border: '1px solid rgba(168,85,247,0.1)',
                marginBottom: 8,
              }}>
                <Link
                  to="/profile"
                  onClick={() => audio.playNav()}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    textDecoration: 'none',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'white' }}>
                    {(user?.name || user?.email || 'U')[0].toUpperCase()}
                  </span>
                </Link>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.name || 'Guest'}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: '#9ca3af', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.email || 'Not signed in'}
                  </p>
                </div>
              </div>

              {/* Action row */}
              <div style={{ display: 'flex', gap: 6 }}>
                <Link
                  to="/profile"
                  onClick={() => audio.playNav()}
                  onMouseEnter={audio.playHover}
                  style={{
                    flex: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    padding: '6px 0',
                    borderRadius: 6,
                    fontSize: '0.72rem', fontWeight: 600,
                    color: '#a855f7',
                    background: 'rgba(168,85,247,0.08)',
                    border: '1px solid rgba(168,85,247,0.15)',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'background 150ms',
                  }}
                >
                  <Settings size={12} /> Settings
                </Link>

                {isAuthenticated ? (
                  <button
                    onClick={handleLogout}
                    onMouseEnter={audio.playHover}
                    style={{
                      flex: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '6px 0',
                      borderRadius: 6,
                      fontSize: '0.72rem', fontWeight: 600,
                      color: '#ef4444',
                      background: 'rgba(239,68,68,0.06)',
                      border: '1px solid rgba(239,68,68,0.12)',
                      cursor: 'pointer',
                      transition: 'background 150ms',
                    }}
                  >
                    <LogOut size={12} /> Sign Out
                  </button>
                ) : (
                  <Link
                    to="/login"
                    onClick={() => audio.playNav()}
                    onMouseEnter={audio.playHover}
                    style={{
                      flex: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      padding: '6px 0',
                      borderRadius: 6,
                      fontSize: '0.72rem', fontWeight: 600,
                      color: '#10b981',
                      background: 'rgba(16,185,129,0.06)',
                      border: '1px solid rgba(16,185,129,0.15)',
                      textDecoration: 'none',
                      cursor: 'pointer',
                      transition: 'background 150ms',
                    }}
                  >
                    <User size={12} /> Sign In
                  </Link>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {children}
        </main>

      </div>
    </div>
  );
}