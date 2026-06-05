/**
 * Portal (PWA Home) — dark glowy purple redesign
 * No white backgrounds. Compact, touch-friendly, animated.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShoppingCart, FileText, Bell, LogOut, Edit3, Check, X, ChevronDown,
  User, Star, CreditCard, Lock, LayoutDashboard, Briefcase, ChevronUp,
  Users, Shield, ShieldAlert, Package, Wrench, ShoppingBag, ClipboardList,
  Heart, Gavel, Tag, BarChart2, LifeBuoy, FolderOpen, Award,
  MessageSquare, BookOpen, Info, Settings, Gift, ChevronRight,
  Eye, EyeOff, Loader2, Sparkles, Globe, ShieldCheck,
} from 'lucide-react';
import { useAuthStore, useCartStore, useQuoteListStore, usePromoCodeStore } from '../../store';
import {
  customersAPI, authAPI, customerLoyaltyAPI,
  referralsAPI, customerTiersAPI, workAPI, notificationsAPI,
} from '../../api';
import employeesAPI from '../../api/employees';
import ThemeSwitcher from '../../components/common/ThemeSwitcher';
import toast from 'react-hot-toast';

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG       = 'transparent';
const SURFACE  = 'rgba(128,128,128,0.07)';
const SURFACE2 = 'rgba(128,128,128,0.11)';
const BORDER   = 'rgba(128,128,128,0.18)';
const BORDER_P = 'rgba(168,85,247,0.3)';
const TEXT     = 'inherit';
const MUTED    = 'rgba(128,128,128,0.75)';
const PURPLE   = '#a855f7';
const PURPLE_D = '#7c3aed';

const glass = (extra = {}) => ({
  background: SURFACE,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: `1px solid ${BORDER}`,
  borderRadius: 14,
  ...extra,
});

const glowBtn = (color) => ({
  background: `radial-gradient(ellipse at 50% 0%, ${color}25 0%, ${color}0a 100%)`,
  border: `1px solid ${color}35`,
  boxShadow: `0 2px 12px ${color}18`,
});

// ── Route catalogs ────────────────────────────────────────────────────────────
const CUSTOMER_ROUTES = [
  { key: 'orders',         label: 'My Orders',      icon: ShoppingBag,   path: '/orders',            color: '#f97316' },
  { key: 'quotes',         label: 'My Quotes',      icon: FileText,      path: '/my-quotes',         color: '#8b5cf6' },
  { key: 'quote-requests', label: 'Quote Requests', icon: MessageSquare, path: '/my-quote-requests', color: '#ec4899' },
  { key: 'bookings',       label: 'Bookings',       icon: ClipboardList, path: '/bookings',          color: '#10b981' },
  { key: 'tickets',        label: 'Support',        icon: LifeBuoy,      path: '/my-tickets',        color: '#ef4444' },
  { key: 'projects',       label: 'Projects',       icon: FolderOpen,    path: '/my-projects',       color: '#14b8a6' },
  { key: 'wishlist',       label: 'Wishlist',       icon: Heart,         path: '/wishlist',          color: '#f43f5e' },
  { key: 'hampers',        label: 'Hampers',        icon: Gift,          path: '/hampers',           color: '#a855f7' },
  { key: 'products',       label: 'Products',       icon: Package,       path: '/products',          color: '#3b82f6' },
  { key: 'services',       label: 'Services',       icon: Wrench,        path: '/services',          color: '#06b6d4' },
  { key: 'auctions',       label: 'Auctions',       icon: Gavel,         path: '/auctions',          color: '#dc2626' },
  { key: 'specials',       label: 'Specials',       icon: Tag,           path: '/specials',          color: '#f59e0b' },
  { key: 'brochures',      label: 'Brochures',      icon: BookOpen,      path: '/brochures',         color: '#64748b' },
  { key: 'careers',        label: 'Careers',        icon: Briefcase,     path: '/careers',           color: '#7c3aed' },
  { key: 'profile',        label: 'My Profile',     icon: Info,          path: '/profile',           color: '#0ea5e9' },
];

const ADMIN_ROUTES = [
  { key: 'dashboard',  label: 'Dashboard',  icon: LayoutDashboard, path: '/admin',                color: '#6366f1' },
  { key: 'orders',     label: 'Orders',     icon: ShoppingBag,     path: '/admin/orders',         color: '#f97316' },
  { key: 'products',   label: 'Products',   icon: Package,         path: '/admin/products',       color: '#a855f7' },
  { key: 'customers',  label: 'Customers',  icon: Users,           path: '/admin/customers',      color: '#3b82f6' },
  { key: 'quotes',     label: 'Quotes',     icon: FileText,        path: '/admin/quotes',         color: '#8b5cf6' },
  { key: 'bookings',   label: 'Bookings',   icon: ClipboardList,   path: '/admin/bookings',       color: '#10b981' },
  { key: 'reports',    label: 'Reports',    icon: BarChart2,       path: '/admin/reports',        color: '#22c55e' },
  { key: 'tickets',    label: 'Tickets',    icon: LifeBuoy,        path: '/admin/tickets',        color: '#ef4444' },
  { key: 'work',       label: 'My Work',    icon: Briefcase,       path: '/admin/work',           color: '#ec4899' },
  { key: 'projects',   label: 'Projects',   icon: FolderOpen,      path: '/admin/projects',       color: '#14b8a6' },
  { key: 'loyalty',    label: 'Loyalty',    icon: Award,           path: '/admin/loyalty',        color: '#f59e0b' },
  { key: 'settings',   label: 'Settings',   icon: Settings,        path: '/admin/settings',       color: '#64748b' },
  { key: 'q-requests', label: 'Quote Reqs', icon: MessageSquare,   path: '/admin/quote-requests', color: '#f43f5e' },
  { key: 'employees',  label: 'Employees',  icon: Users,           path: '/admin/employees',      color: '#0ea5e9' },
  { key: 'algorithm',  label: 'Algorithm',  icon: Sparkles,        path: '/admin/algorithm',      color: '#7c3aed' },
];

const DEFAULT_CUSTOMER_SHORTCUTS = ['orders', 'quotes', 'bookings', 'profile', 'products', 'services'];
const DEFAULT_ADMIN_SHORTCUTS    = ['dashboard', 'orders', 'products', 'customers', 'bookings', 'reports'];

const ROLE_LABELS = {
  admin: 'Admin', super_admin: 'Super Admin', manager: 'Manager',
  finance: 'Finance', logistics: 'Logistics', sales_rep: 'Sales Rep', staff: 'Staff',
};
const ROLE_COLORS = {
  super_admin: '#a855f7', admin: '#3b82f6', manager: '#10b981',
  finance: '#f59e0b', logistics: '#f97316', sales_rep: '#ec4899', staff: '#06b6d4',
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

// ── Global styles ─────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @keyframes portalSpin  { to { transform: rotate(360deg); } }
  @keyframes portalFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes portalPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
  .portal-press { transition: transform 110ms ease; }
  .portal-press:active { transform: scale(0.93) !important; }
  .portal-row-hover { transition: background 140ms ease; }
  .portal-row-hover:hover { background: rgba(168,85,247,0.07) !important; }
`;

// ── PWA Header ────────────────────────────────────────────────────────────────
function PWAHeader({ name, onLogout }) {
  const [showNotifs,    setShowNotifs]    = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try { const res = await notificationsAPI.unreadCount(); setUnreadCount(res.data.count); } catch {}
    };
    fetch();
    const id = setInterval(fetch, 60_000);
    return () => clearInterval(id);
  }, []);

  const openPanel = async () => {
    setShowNotifs(true); setLoading(true);
    try { const res = await notificationsAPI.list({ per_page: 30 }); setNotifications(res.data.data); }
    catch { toast.error('Could not load notifications'); }
    finally { setLoading(false); }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await notificationsAPI.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString(), is_read: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read_at: new Date().toISOString(), is_read: true })));
      setUnreadCount(0);
    } catch { toast.error('Failed'); }
  };

  const handleDelete = async (id) => {
    const notif = notifications.find(n => n.id === id);
    try {
      await notificationsAPI.destroy(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      if (!notif?.is_read) setUnreadCount(c => Math.max(0, c - 1));
    } catch { toast.error('Could not delete'); }
  };

  const TYPE_COLORS = {
    referral_earned: '#a855f7', birthday_promo: '#ec4899',
    win_back_promo: '#f97316', vip_upgrade_promo: '#f59e0b',
    loyalty_milestone_promo: '#10b981', order_placed: '#3b82f6',
    order_shipped: '#6366f1', order_delivered: '#22c55e',
  };

  const iconBtn = {
    width: 36, height: 36, borderRadius: '50%',
    background: SURFACE, border: `1px solid ${BORDER}`,
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: 'inherit', transition: 'background 150ms',
  };

  return (
    <>
      <div style={{
        padding: 'calc(16px + env(safe-area-inset-top, 0px)) 18px 14px',
        background: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
        borderBottom: `1px solid ${BORDER_P}`,
      }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.68rem', color: MUTED, fontWeight: 500 }}>{getGreeting()}</p>
          <p style={{ margin: '1px 0 0', fontSize: '1.1rem', fontWeight: 900, color: TEXT, letterSpacing: '-0.02em' }}>
            {name} 👋
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThemeSwitcher />
          <button onClick={openPanel} className="portal-press" style={{ ...iconBtn, position: 'relative' }}>
            <Bell size={16} strokeWidth={2.2} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 3, right: 3,
                width: 14, height: 14, borderRadius: '50%',
                background: '#ef4444', border: '2px solid transparent',
                fontSize: '0.5rem', fontWeight: 800, color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <button onClick={onLogout} className="portal-press" style={iconBtn} title="Sign out">
            <LogOut size={15} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Notifications sheet */}
      {showNotifs && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowNotifs(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{
            width: '100%', borderRadius: '20px 20px 0 0',
            background: 'var(--color-background, #ffffff)', border: `1px solid ${BORDER_P}`,
            maxHeight: '82vh', display: 'flex', flexDirection: 'column',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            animation: 'portalFadeUp 200ms ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: TEXT }}>Notifications</p>
                {unreadCount > 0 && (
                  <span style={{ padding: '1px 7px', borderRadius: 99, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '0.65rem', fontWeight: 700 }}>
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} style={{ padding: '4px 10px', borderRadius: 8, border: `1px solid ${BORDER_P}`, background: 'rgba(168,85,247,0.1)', color: PURPLE, fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer' }}>
                    Mark all read
                  </button>
                )}
                <button onClick={() => setShowNotifs(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex' }}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                  <Loader2 size={20} color={PURPLE} style={{ animation: 'portalSpin 1s linear infinite' }} />
                </div>
              ) : notifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: MUTED }}>
                  <Bell size={28} strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.4 }} />
                  <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: MUTED }}>No notifications yet</p>
                </div>
              ) : notifications.map(n => {
                const accent = TYPE_COLORS[n.type] ?? '#6b7280';
                return (
                  <div key={n.id} className="portal-row-hover" style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '11px 16px',
                    background: n.is_read ? 'transparent' : 'rgba(168,85,247,0.05)',
                    borderBottom: `1px solid ${BORDER}`,
                  }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: n.is_read ? BORDER : accent }} />
                    <div style={{ flex: 1, minWidth: 0 }} onClick={() => !n.is_read && handleMarkAsRead(n.id)}>
                      <p style={{ margin: '0 0 2px', fontSize: '0.8rem', fontWeight: n.is_read ? 500 : 700, color: n.is_read ? MUTED : 'inherit', lineHeight: 1.3 }}>{n.title}</p>
                      <p style={{ margin: '0 0 4px', fontSize: '0.72rem', color: MUTED, lineHeight: 1.4 }}>{n.message}</p>
                      <p style={{ margin: 0, fontSize: '0.65rem', color: MUTED, opacity: 0.7, fontWeight: 600 }}>{n.time_ago}</p>
                    </div>
                    <button onClick={() => handleDelete(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4, display: 'flex', flexShrink: 0, transition: 'color 150ms' }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = MUTED}
                    ><X size={13} /></button>
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

// ── Tab bar ───────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex', flexShrink: 0,
      background: SURFACE,
      backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${BORDER}`,
    }}>
      {tabs.map(tab => {
        const isActive = active === tab.key;
        return (
          <button key={tab.key} onClick={() => onChange(tab.key)} className="portal-press" style={{
            flex: 1, padding: '10px 4px 8px', border: 'none',
            background: isActive ? 'rgba(168,85,247,0.08)' : 'none',
            cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: isActive ? `2px solid ${PURPLE}` : '2px solid transparent',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
            transition: 'all 150ms ease',
          }}>
            <tab.icon size={16} color={isActive ? PURPLE : MUTED} strokeWidth={2.2} />
            <span style={{ fontSize: '0.58rem', fontWeight: 700, color: isActive ? PURPLE : MUTED, whiteSpace: 'nowrap' }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Shortcut grid ─────────────────────────────────────────────────────────────
function ShortcutGrid({ allRoutes, storageKey, defaultShortcuts }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState(() => {
    try { const s = localStorage.getItem(storageKey); return s ? JSON.parse(s) : defaultShortcuts; }
    catch { return defaultShortcuts; }
  });
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(selected);
  const active = allRoutes.filter(r => selected.includes(r.key));

  const toggleDraft = (key) => {
    setDraft(prev => prev.includes(key) ? prev.filter(k => k !== key) : prev.length < 6 ? [...prev, key] : prev);
  };
  const save = () => {
    setSelected(draft);
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); } catch {}
    setEditing(false);
    toast.success('Shortcuts saved');
  };

  return (
    <div style={{ padding: '16px 14px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: '0.62rem', fontWeight: 800, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.12em' }}>Quick Access</p>
        <button onClick={() => { setDraft(selected); setEditing(true); }} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8,
          border: `1px solid ${BORDER_P}`, background: 'rgba(168,85,247,0.08)',
          color: PURPLE, fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer',
        }}>
          <Edit3 size={10} /> Edit
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {active.map(route => {
          const Icon = route.icon;
          return (
            <button key={route.key} onClick={() => navigate(route.path)} className="portal-press" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '12px 6px', borderRadius: 13,
              ...glowBtn(route.color),
              cursor: 'pointer', fontFamily: 'inherit', color: 'inherit',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${route.color}30`,
                boxShadow: `0 0 14px ${route.color}35`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={18} color={route.color} strokeWidth={2} />
              </div>
              <span style={{ fontSize: '0.64rem', fontWeight: 700, color: TEXT, textAlign: 'center', lineHeight: 1.2 }}>
                {route.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Edit sheet */}
      {editing && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditing(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'flex-end' }}>
          <div style={{
            width: '100%', background: 'var(--color-background, #ffffff)', borderRadius: '20px 20px 0 0',
            border: `1px solid ${BORDER_P}`,
            padding: '18px 14px',
            paddingBottom: 'calc(18px + env(safe-area-inset-bottom, 0px))',
            maxHeight: '80vh', overflowY: 'auto',
            animation: 'portalFadeUp 200ms ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: TEXT }}>Customize Shortcuts</p>
              <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '0.7rem', color: MUTED }}>{draft.length}/6 selected</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
              {allRoutes.map(route => {
                const Icon = route.icon;
                const isSelected = draft.includes(route.key);
                const isDisabled = !isSelected && draft.length >= 6;
                return (
                  <button key={route.key} onClick={() => !isDisabled && toggleDraft(route.key)} className="portal-press" style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    padding: '10px 6px', borderRadius: 12, fontFamily: 'inherit', color: '#000000',
                    background: isSelected ? `${route.color}15` : SURFACE,
                    border: isSelected ? `1.5px solid ${route.color}50` : `1px solid ${BORDER}`,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.3 : 1, position: 'relative',
                    transition: 'all 150ms ease',
                  }}>
                    {isSelected && (
                      <div style={{ position: 'absolute', top: 5, right: 5, width: 14, height: 14, borderRadius: '50%', background: route.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={8} color="white" strokeWidth={3} />
                      </div>
                    )}
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: `${route.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={15} color={route.color} strokeWidth={2} />
                    </div>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: isSelected ? TEXT : MUTED, textAlign: 'center', lineHeight: 1.2 }}>
                      {route.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <button onClick={save} className="portal-press" style={{
              width: '100%', padding: '11px', borderRadius: 11, border: 'none',
              background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_D})`,
              color: 'white', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: `0 4px 16px rgba(168,85,247,0.35)`,
            }}>
              Save Shortcuts
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Footer bar ────────────────────────────────────────────────────────────────
function PWAFooterBar({ children }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'var(--color-background, rgba(255,255,255,0.92))',
      backdropFilter: 'blur(16px)',
      borderTop: `1px solid ${BORDER_P}`,
      display: 'flex', gap: 8, padding: '8px 14px',
      paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
    }}>
      {children}
    </div>
  );
}

// ── Glass card + info row helpers ─────────────────────────────────────────────
const GlassCard = ({ children, style = {} }) => (
  <div style={{ ...glass(), padding: '13px 14px', marginBottom: 10, ...style }}>
    {children}
  </div>
);

const InfoRow = ({ label, value, last = false, statusMeta }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', borderBottom: last ? 'none' : `1px solid ${BORDER}` }}>
    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: MUTED }}>{label}</span>
    {statusMeta ? (
      <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: '0.65rem', fontWeight: 700, background: statusMeta.bg, color: statusMeta.text }}>
        {value?.replace('_', ' ')}
      </span>
    ) : (
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: TEXT, maxWidth: '58%', textAlign: 'right' }}>{value ?? '—'}</span>
    )}
  </div>
);

// ── Password field – module-level so React never remounts on parent re-render ─
const pwdInputBase = {
  width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: '0.82rem',
  background: SURFACE, border: `1.5px solid ${BORDER}`,
  color: 'inherit', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  transition: 'border-color 150ms',
};

function PwdField({ label, field, showKey, pwd, show, errors, setPwd, setErrors, setShow }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: '0.65rem', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={show[showKey] ? 'text' : 'password'}
          value={pwd[field]}
          onChange={e => { setPwd(p => ({ ...p, [field]: e.target.value })); setErrors(er => ({ ...er, [field]: null })); }}
          style={{ ...pwdInputBase, paddingRight: 36, borderColor: errors[field] ? '#ef4444' : BORDER }}
          onFocus={e => e.target.style.borderColor = PURPLE}
          onBlur={e  => e.target.style.borderColor = errors[field] ? '#ef4444' : BORDER}
        />
        <button type="button" onClick={() => setShow(s => ({ ...s, [showKey]: !s[showKey] }))} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex' }}>
          {show[showKey] ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {errors[field] && <p style={{ margin: '3px 0 0', fontSize: '0.68rem', color: '#ef4444' }}>{errors[field][0]}</p>}
    </div>
  );
}

// ── Password tab ──────────────────────────────────────────────────────────────
function PasswordTab({ customer, onVerifyEmail, onLogout }) {
  const [pwd,  setPwd]  = useState({ current_password: '', new_password: '', new_password_confirmation: '' });
  const [show, setShow] = useState({ cur: false, nw: false, cf: false });
  const [saving,    setSaving]    = useState(false);
  const [errors,    setErrors]    = useState({});
  const [otpSent,   setOtpSent]   = useState(false);
  const [otp,       setOtp]       = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  const sendOtp = async () => {
    setOtpLoading(true);
    try { await authAPI.sendEmailOtp(); setOtpSent(true); toast.success('OTP sent'); }
    catch { toast.error('Failed to send OTP'); }
    finally { setOtpLoading(false); }
  };

  const verifyOtp = async () => {
    setOtpLoading(true);
    try { await authAPI.verifyEmail({ otp }); toast.success('Email verified!'); onVerifyEmail?.(); }
    catch { toast.error('Invalid OTP'); }
    finally { setOtpLoading(false); }
  };

  const handleSave = async () => {
    if (pwd.new_password !== pwd.new_password_confirmation) {
      setErrors({ new_password_confirmation: ['Passwords do not match.'] }); return;
    }
    setSaving(true);
    try {
      await authAPI.changePassword(pwd);
      toast.success('Password changed');
      setPwd({ current_password: '', new_password: '', new_password_confirmation: '' });
      setErrors({});
    } catch (e) {
      setErrors(e.response?.data?.errors ?? {});
      toast.error(e.response?.data?.message ?? 'Failed');
    } finally { setSaving(false); }
  };

  const fieldProps = { pwd, show, errors, setPwd, setErrors, setShow };

  return (
    <div style={{ padding: '14px 14px 8px' }}>
      {customer && !customer.email_verified_at && (
        <GlassCard style={{ marginBottom: 12, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <ShieldAlert size={14} color="#ef4444" />
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ef4444' }}>Email not verified</span>
          </div>
          {!otpSent ? (
            <button onClick={sendOtp} disabled={otpLoading} className="portal-press" style={{ width: '100%', padding: '8px', borderRadius: 9, border: 'none', background: '#ef4444', color: 'white', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {otpLoading ? 'Sending…' : 'Send verification code'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="Enter OTP"
                style={{ ...pwdInputBase, flex: 1 }}
                onFocus={e => e.target.style.borderColor = PURPLE}
                onBlur={e  => e.target.style.borderColor = BORDER}
              />
              <button onClick={verifyOtp} disabled={otpLoading || !otp} className="portal-press" style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: PURPLE, color: 'white', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {otpLoading ? '…' : 'Verify'}
              </button>
            </div>
          )}
        </GlassCard>
      )}

      {customer?.email_verified_at && (
        <GlassCard style={{ marginBottom: 12, border: '1px solid rgba(16,185,129,0.25)', background: 'rgba(16,185,129,0.06)', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px' }}>
          <ShieldCheck size={14} color="#10b981" />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981' }}>Email verified</span>
        </GlassCard>
      )}

      <GlassCard>
        <PwdField label="Current Password"    field="current_password"          showKey="cur" {...fieldProps} />
        <PwdField label="New Password"        field="new_password"              showKey="nw"  {...fieldProps} />
        <PwdField label="Confirm New Password" field="new_password_confirmation" showKey="cf"  {...fieldProps} />
        <button onClick={handleSave}
          disabled={saving || !pwd.current_password || !pwd.new_password || !pwd.new_password_confirmation}
          className="portal-press"
          style={{ width: '100%', padding: '10px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_D})`, color: 'white', fontSize: '0.85rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 14px rgba(168,85,247,0.3)' }}>
          {saving ? <><Loader2 size={14} style={{ animation: 'portalSpin 1s linear infinite' }} /> Saving…</> : 'Update Password'}
        </button>
      </GlassCard>

      {onLogout && (
        <GlassCard style={{ border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.04)' }}>
          <p style={{ margin: '0 0 4px', fontSize: '0.78rem', fontWeight: 700, color: '#ef4444' }}>Sign out</p>
          <p style={{ margin: '0 0 10px', fontSize: '0.7rem', color: 'rgba(239,68,68,0.6)' }}>Sign out of your account on this device</p>
          <button onClick={onLogout} className="portal-press" style={{ width: '100%', padding: '9px', borderRadius: 9, border: 'none', background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <LogOut size={14} /> Sign out
          </button>
        </GlassCard>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER VIEW
// ═══════════════════════════════════════════════════════════════════════════════
const CUSTOMER_TABS = [
  { key: 'personal', label: 'Personal', icon: User       },
  { key: 'rewards',  label: 'Rewards',  icon: Star       },
  { key: 'wallet',   label: 'Wallet',   icon: CreditCard },
  { key: 'password', label: 'Security', icon: Lock       },
];

function CustomerPWAHome({ user, onLogout }) {
  const navigate = useNavigate();
  const { items: cartItems }      = useCartStore();
  const { items: quoteListItems } = useQuoteListStore();
  const { myCodes, fetchMyCodes } = usePromoCodeStore();
  const cartCount      = cartItems?.reduce((s, i) => s + (i.quantity ?? 1), 0) ?? 0;
  const quoteListCount = quoteListItems?.length ?? 0;
  const [activeTab, setActiveTab] = useState('personal');
  const [customer,  setCustomer]  = useState(null);
  const [wallet,    setWallet]    = useState(null);
  const [tierOptions, setTierOptions] = useState([]);
  const [loading,   setLoading]   = useState(true);

  const loadProfile = () => {
    setLoading(true);
    Promise.allSettled([
      customersAPI.getProfile(),
      referralsAPI.myCode(),
      customerTiersAPI.getActiveTiers(),
    ]).then(([profileRes, referralRes, tiersRes]) => {
      if (profileRes.status === 'fulfilled') {
        const c = profileRes.value?.customer ?? profileRes.value;
        if (referralRes.status === 'fulfilled') {
          const rd = referralRes.value;
          const rc = rd?.code ?? rd?.referral_code ?? rd?.data ?? null;
          c.referral_code = (rc && typeof rc.code === 'string') ? rc : null;
        }
        setCustomer(c);
      }
      if (tiersRes.status === 'fulfilled') setTierOptions(tiersRes.value);
      setLoading(false);
    });
  };

  useEffect(() => { loadProfile(); }, []);
  useEffect(() => { if (activeTab === 'rewards') fetchMyCodes(); }, [activeTab]);
  useEffect(() => { if (activeTab === 'wallet') customerLoyaltyAPI.myBalance().then(setWallet).catch(() => {}); }, [activeTab]);

  const firstName = customer?.first_name ?? user?.name?.split(' ')[0] ?? 'there';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
      <style>{GLOBAL_CSS}</style>
      <PWAHeader name={firstName} onLogout={onLogout} />
      <TabBar tabs={CUSTOMER_TABS} active={activeTab} onChange={setActiveTab} />

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 74 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Loader2 size={22} color={PURPLE} style={{ animation: 'portalSpin 1s linear infinite' }} />
          </div>
        ) : (
          <div style={{ animation: 'portalFadeUp 250ms ease' }}>
            {activeTab === 'personal' && <CustomerPersonalTab  customer={customer} user={user} navigate={navigate} />}
            {activeTab === 'rewards'  && <CustomerRewardsTab   customer={customer} wallet={wallet} myCodes={myCodes} tierOptions={tierOptions} navigate={navigate} />}
            {activeTab === 'wallet'   && <CustomerWalletTab    wallet={wallet} navigate={navigate} />}
            {activeTab === 'password' && <PasswordTab customer={customer} onVerifyEmail={() => loadProfile()} onLogout={onLogout} />}
          </div>
        )}

        <ShortcutGrid allRoutes={CUSTOMER_ROUTES} storageKey={`pwa_customer_shortcuts_${user?.id}`} defaultShortcuts={DEFAULT_CUSTOMER_SHORTCUTS} />
        <div style={{ height: 14 }} />
      </div>

      <PWAFooterBar>
        <button onClick={() => navigate('/cart')} className="portal-press" style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px', borderRadius: 11,
          border: `1.5px solid ${BORDER_P}`,
          background: 'rgba(168,85,247,0.08)',
          cursor: 'pointer', fontFamily: 'inherit',
          fontSize: '0.82rem', fontWeight: 700, color: PURPLE, position: 'relative',
        }}>
          <ShoppingCart size={15} strokeWidth={2.2} />
          Cart
          {cartCount > 0 && (
            <span style={{ position: 'absolute', top: 6, right: 8, minWidth: 16, height: 16, borderRadius: 99, padding: '0 3px', background: PURPLE, color: 'white', fontSize: '0.55rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {cartCount > 99 ? '99+' : cartCount}
            </span>
          )}
        </button>
        <button onClick={() => navigate('/quote-list')} className="portal-press" style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '10px', borderRadius: 11, border: 'none',
          background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_D})`,
          cursor: 'pointer', fontFamily: 'inherit',
          fontSize: '0.82rem', fontWeight: 700, color: 'white', position: 'relative',
          boxShadow: '0 2px 12px rgba(168,85,247,0.35)',
        }}>
          <FileText size={15} strokeWidth={2.2} />
          Quote List
          {quoteListCount > 0 && (
            <span style={{ position: 'absolute', top: 6, right: 8, minWidth: 16, height: 16, borderRadius: 99, padding: '0 3px', background: 'white', color: PURPLE_D, fontSize: '0.55rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {quoteListCount > 99 ? '99+' : quoteListCount}
            </span>
          )}
        </button>
      </PWAFooterBar>
    </div>
  );
}

// ── Customer: Personal tab ────────────────────────────────────────────────────
function CustomerPersonalTab({ customer, user, navigate }) {
  if (!customer) return null;
  const [showAll, setShowAll] = useState(false);
  const primaryRows = [
    { label: 'Full Name', value: customer.full_name ?? `${customer.first_name} ${customer.last_name}` },
    { label: 'Phone',     value: customer.phone || '—' },
    { label: 'Company',   value: customer.company_name || '—' },
  ];
  const extraRows = [
    { label: 'Email',     value: user?.email ?? customer.email },
    { label: 'WhatsApp',  value: customer.whatsapp || '—' },
    { label: 'Birthday',  value: customer.birthday ? new Date(customer.birthday).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : '—' },
  ];
  const visibleRows = showAll ? [...primaryRows, ...extraRows] : primaryRows;
  return (
    <div style={{ padding: '14px 14px 8px' }}>
      {/* Profile strip */}
      <div style={{ ...glass(), padding: '14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <img src={customer.profile_image_url} alt={customer.full_name}
          style={{ width: 50, height: 50, borderRadius: 12, objectFit: 'cover', background: SURFACE, flexShrink: 0, border: `1px solid ${BORDER}` }} />
        <div>
          <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: TEXT }}>{customer.first_name} {customer.last_name}</p>
          <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: MUTED }}>{user?.email}</p>
        </div>
      </div>

      <div style={{ ...glass(), overflow: 'hidden', marginBottom: 10 }}>
        {visibleRows.map((row) => <InfoRow key={row.label} {...row} last={false} />)}
        <button onClick={() => setShowAll(s => !s)} style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', borderTop: `1px solid ${BORDER}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: '0.7rem', fontWeight: 700, color: PURPLE, fontFamily: 'inherit' }}>
          {showAll ? <><ChevronUp size={13} /> Show less</> : <><ChevronDown size={13} /> Show more details</>}
        </button>
      </div>

      <button onClick={() => navigate('/profile')} className="portal-press" style={{ width: '100%', padding: '10px', borderRadius: 11, border: `1px solid ${BORDER_P}`, background: 'rgba(168,85,247,0.08)', color: PURPLE, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        Edit Full Profile <ChevronRight size={13} />
      </button>
    </div>
  );
}

// ── Customer: Rewards tab ─────────────────────────────────────────────────────
function CustomerRewardsTab({ customer, wallet, myCodes, tierOptions, navigate }) {
  if (!customer) return null;
  const tier       = customer.tier ?? 'bronze';
  const tierOption = tierOptions?.find(t => t.slug === tier);
  const tierColor  = tierOption?.color ?? ({ bronze: '#f97316', silver: '#94a3b8', gold: '#f59e0b', platinum: '#a855f7' }[tier] ?? '#a855f7');
  const tierLabel  = tierOption?.name ?? (tier.charAt(0).toUpperCase() + tier.slice(1));
  const points     = wallet?.loyalty_points ?? customer.loyalty_points ?? 0;

  return (
    <div style={{ padding: '14px 14px 8px' }}>
      {/* Tier card */}
      <div style={{ ...glass(), padding: '14px', marginBottom: 10, border: `1px solid ${tierColor}30`, background: `radial-gradient(ellipse at 0% 50%, ${tierColor}18 0%, ${tierColor}06 100%)`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${tierColor}25`, boxShadow: `0 0 16px ${tierColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Award size={22} color={tierColor} strokeWidth={2} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: '0.62rem', color: tierColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Current Tier</p>
          <p style={{ margin: '2px 0 0', fontSize: '1rem', fontWeight: 900, color: tierColor }}>{tierLabel}</p>
        </div>
        {customer.tier_benefits?.discount > 0 && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: tierColor }}>{customer.tier_benefits.discount}%</p>
            <p style={{ margin: 0, fontSize: '0.58rem', color: tierColor, opacity: 0.7 }}>discount</p>
          </div>
        )}
      </div>

      {/* Points */}
      <GlassCard>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Loyalty Points</span>
          <span style={{ fontSize: '1rem', fontWeight: 900, color: PURPLE }}>{points.toLocaleString()}</span>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: 'rgba(168,85,247,0.12)', overflow: 'hidden', marginBottom: 5 }}>
          <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(100, (points / 1000) * 100)}%`, background: `linear-gradient(90deg, ${PURPLE}, ${PURPLE_D})`, transition: 'width 0.7s ease' }} />
        </div>
        <p style={{ margin: 0, fontSize: '0.68rem', color: MUTED }}>
          {points >= 1000 ? '🎁 Ready to redeem!' : `${(1000 - points).toLocaleString()} pts to first redemption`}
        </p>
      </GlassCard>

      {/* Referral code */}
      {customer.referral_code && (
        <GlassCard>
          <p style={{ margin: '0 0 8px', fontSize: '0.62rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Referral Code</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ flex: 1, padding: '7px 11px', borderRadius: 8, background: 'rgba(168,85,247,0.12)', border: `1px dashed ${BORDER_P}`, fontFamily: 'monospace', fontWeight: 900, fontSize: '0.9rem', color: '#c4b5fd', letterSpacing: '0.06em' }}>
              {customer.referral_code.code}
            </code>
            <button onClick={() => { navigator.clipboard.writeText(customer.referral_code.code); toast.success('Copied!'); }} className="portal-press" style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${BORDER_P}`, background: 'rgba(168,85,247,0.1)', color: PURPLE, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Copy
            </button>
          </div>
        </GlassCard>
      )}

      {/* Promo codes */}
      {myCodes?.active?.length > 0 && (
        <GlassCard>
          <p style={{ margin: '0 0 10px', fontSize: '0.62rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Promo Codes</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {myCodes.active.slice(0, 3).map(code => (
              <div key={code.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 9, background: 'rgba(168,85,247,0.08)', border: `1px solid ${BORDER_P}` }}>
                <div>
                  <code style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.82rem', color: '#c4b5fd', letterSpacing: '0.06em' }}>{code.code}</code>
                  <p style={{ margin: '2px 0 0', fontSize: '0.65rem', color: MUTED }}>
                    {code.reward_type === 'percentage' ? `${code.reward_value}% off` : `KES ${Number(code.reward_value).toLocaleString()} off`}
                  </p>
                </div>
                <button onClick={() => { navigator.clipboard.writeText(code.code); toast.success('Copied!'); }} className="portal-press" style={{ padding: '4px 10px', borderRadius: 7, border: `1px solid ${BORDER_P}`, background: 'rgba(168,85,247,0.1)', color: PURPLE, fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}>
                  Copy
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <button onClick={() => navigate('/profile')} className="portal-press" style={{ width: '100%', padding: '10px', borderRadius: 11, border: `1px solid ${BORDER_P}`, background: 'rgba(168,85,247,0.08)', color: PURPLE, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        Full Rewards Detail <ChevronRight size={13} />
      </button>
    </div>
  );
}

// ── Customer: Wallet tab ──────────────────────────────────────────────────────
function CustomerWalletTab({ wallet, navigate }) {
  const credit = wallet?.store_credit ?? 0;
  const points = wallet?.loyalty_points ?? 0;
  const fmt    = n => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

  return (
    <div style={{ padding: '14px 14px 8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {[
          { label: 'Store Credit',   value: fmt(credit), color: '#10b981', icon: CreditCard },
          { label: 'Loyalty Points', value: points.toLocaleString(), color: PURPLE, icon: Star },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} style={{ ...glowBtn(color), borderRadius: 13, padding: '14px 12px', textAlign: 'center' }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: `${color}28`, boxShadow: `0 0 12px ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
              <Icon size={16} color={color} strokeWidth={2} />
            </div>
            <p style={{ margin: '0 0 2px', fontSize: '0.6rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, color }}>{value}</p>
          </div>
        ))}
      </div>
      <button onClick={() => navigate('/profile')} className="portal-press" style={{ width: '100%', padding: '10px', borderRadius: 11, border: `1px solid ${BORDER_P}`, background: 'rgba(168,85,247,0.08)', color: PURPLE, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        Full Wallet & Transactions <ChevronRight size={13} />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN VIEW
// ═══════════════════════════════════════════════════════════════════════════════
const ADMIN_TABS = [
  { key: 'overview',  label: 'Overview',  icon: LayoutDashboard },
  { key: 'work',      label: 'My Work',   icon: Briefcase       },
  { key: 'employee',  label: 'Employee',  icon: Users           },
  { key: 'security',  label: 'Security',  icon: Shield          },
];

function AdminPWAHome({ user, onLogout }) {
  const navigate = useNavigate();
  const [activeTab,    setActiveTab]    = useState('overview');
  const [loading,      setLoading]      = useState(true);
  const [assignments,  setAssignments]  = useState({ customers: [], orders: [], quotes: [], quoteRequests: [], projects: [], tasks: [], milestones: [], tickets: [], counts: {} });
  const [empRecord,    setEmpRecord]    = useState(null);
  const [openSections, setOpenSections] = useState({ customers: true, projects: true, orders: false, quotes: false, quoteRequests: false, tickets: false });

  const toggleSection = key => setOpenSections(p => ({ ...p, [key]: !p[key] }));
  const daysUntil     = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

  useEffect(() => {
    workAPI.myDashboard().then(data => {
      setAssignments(data?.assignments ?? { customers: [], orders: [], quotes: [], quoteRequests: [], projects: [], tasks: [], milestones: [], tickets: [], counts: {} });
      setLoading(false);
    }).catch(() => setLoading(false));
    employeesAPI.getMyRecord().then(data => setEmpRecord(data.employee)).catch(() => {});
  }, []);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
      <style>{GLOBAL_CSS}</style>
      <PWAHeader name={firstName} onLogout={onLogout} />
      <TabBar tabs={ADMIN_TABS} active={activeTab} onChange={setActiveTab} />

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 16 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Loader2 size={22} color={PURPLE} style={{ animation: 'portalSpin 1s linear infinite' }} />
          </div>
        ) : (
          <div style={{ animation: 'portalFadeUp 250ms ease' }}>
            {activeTab === 'overview'  && <AdminOverviewTab  user={user} navigate={navigate} />}
            {activeTab === 'work'      && <AdminWorkTab assignments={assignments} openSections={openSections} toggleSection={toggleSection} daysUntil={daysUntil} navigate={navigate} />}
            {activeTab === 'employee'  && <AdminEmployeeTab  user={user} empRecord={empRecord} navigate={navigate} />}
            {activeTab === 'security'  && <PasswordTab onLogout={onLogout} />}
          </div>
        )}
        <ShortcutGrid allRoutes={ADMIN_ROUTES} storageKey={`pwa_admin_shortcuts_${user?.id}`} defaultShortcuts={DEFAULT_ADMIN_SHORTCUTS} />
        <div style={{ height: 14 }} />
      </div>
    </div>
  );
}

function AdminOverviewTab({ user, navigate }) {
  const role      = user?.role ?? 'staff';
  const roleColor = ROLE_COLORS[role] ?? '#6b7280';
  const roleLabel = ROLE_LABELS[role] ?? role;
  const links = [
    { label: 'Dashboard', desc: 'Revenue & order KPIs',    path: '/admin',           icon: LayoutDashboard, color: '#6366f1' },
    { label: 'Orders',    desc: 'Manage fulfillment queue', path: '/admin/orders',    icon: ShoppingBag,     color: '#f97316' },
    { label: 'Reports',   desc: 'Revenue & sales analytics', path: '/admin/reports',  icon: BarChart2,       color: '#22c55e' },
    { label: 'Settings',  desc: 'System configuration',    path: '/admin/settings',   icon: Settings,        color: '#64748b' },
  ];
  return (
    <div style={{ padding: '14px 14px 8px' }}>
      {/* Role badge */}
      <div style={{ ...glowBtn(roleColor), borderRadius: 13, padding: '13px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 11, background: `${roleColor}28`, boxShadow: `0 0 16px ${roleColor}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Shield size={20} color={roleColor} strokeWidth={2} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: '0.62rem', color: roleColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your Role</p>
          <p style={{ margin: '2px 0 0', fontSize: '1rem', fontWeight: 900, color: roleColor }}>{roleLabel}</p>
        </div>
      </div>

      <div style={{ ...glass(), overflow: 'hidden' }}>
        {links.map((link, i) => {
          const Icon = link.icon;
          return (
            <button key={link.label} onClick={() => navigate(link.path)} className="portal-press portal-row-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'none', border: 'none', borderBottom: i < links.length - 1 ? `1px solid ${BORDER}` : 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'inherit' }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: `${link.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={15} color={link.color} strokeWidth={2} />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: link.color }}>{link.label}</p>
                <p style={{ margin: '1px 0 0', fontSize: '0.65rem', color: MUTED }}>{link.desc}</p>
              </div>
              <ChevronRight size={13} color={link.color} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AdminWorkTab({ assignments, openSections, toggleSection, daysUntil, navigate }) {
  // ── Status & Priority badges ──────────────────────────────────────────────────
  function StatusBadge({ status }) {
    const map = {
      active:           { bg: 'rgba(22,163,74,0.18)',   color: '#4ade80' },
      delivered:        { bg: 'rgba(22,163,74,0.18)',   color: '#4ade80' },
      approved:         { bg: 'rgba(22,163,74,0.18)',   color: '#4ade80' },
      resolved:         { bg: 'rgba(22,163,74,0.18)',   color: '#4ade80' },
      confirmed:        { bg: 'rgba(22,163,74,0.18)',   color: '#4ade80' },
      pending:          { bg: 'rgba(245,158,11,0.18)',  color: '#fbbf24' },
      open:             { bg: 'rgba(245,158,11,0.18)',  color: '#fbbf24' },
      planning:         { bg: 'rgba(59,130,246,0.18)',  color: '#60a5fa' },
      converted:        { bg: 'rgba(59,130,246,0.18)',  color: '#60a5fa' },
      in_progress:      { bg: 'rgba(59,130,246,0.18)',  color: '#60a5fa' },
      waiting_customer: { bg: 'rgba(249,115,22,0.18)',  color: '#fb923c' },
      draft:            { bg: 'rgba(128,128,128,0.15)', color: '#9ca3af' },
      closed:           { bg: 'rgba(128,128,128,0.15)', color: '#9ca3af' },
      no_show:          { bg: 'rgba(239,68,68,0.18)',   color: '#f87171' },
    };
    const style = map[status] ?? { bg: 'rgba(128,128,128,0.15)', color: '#9ca3af' };
    return (
      <span style={{
        padding: '2px 8px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700,
        background: style.bg, color: style.color, flexShrink: 0,
      }}>
        {status?.replace(/_/g, ' ')}
      </span>
    );
  }

  function PriorityBadge({ priority }) {
    const map = {
      urgent: { bg: 'rgba(239,68,68,0.18)',  color: '#f87171' },
      high:   { bg: 'rgba(249,115,22,0.18)', color: '#fb923c' },
      medium: { bg: 'rgba(59,130,246,0.18)', color: '#60a5fa' },
      low:    { bg: 'rgba(128,128,128,0.15)',color: '#9ca3af' },
    };
    const style = map[priority] ?? { bg: 'rgba(128,128,128,0.15)', color: '#9ca3af' };
    return (
      <span style={{
        padding: '2px 8px', borderRadius: 99, fontSize: '0.62rem', fontWeight: 700,
        background: style.bg, color: style.color,
      }}>
        {priority}
      </span>
    );
  }

  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const sections = [
    {
      key: 'customers', label: 'Assigned Customers', count: assignments.counts?.customers || 0, color: '#3b82f6', items: assignments.customers, emptyMsg: 'No customers assigned',
      renderItem: (c, i) => (
        <button key={i} onClick={() => navigate(`/admin/customers/${c.id}`)} className="portal-press portal-row-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4, textAlign: 'left', color: 'inherit' }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(59,130,246,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 800, color: '#3b82f6', flexShrink: 0 }}>
            {`${c.first_name?.[0]||''}${c.last_name?.[0]||''}`}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</p>
            <p style={{ margin: 0, fontSize: '0.67rem', color: MUTED }}>{c.email}</p>
          </div>
          <ChevronRight size={13} color={MUTED} />
        </button>
      ),
    },
    {
      key: 'projects', label: 'My Projects', count: assignments.counts?.projects || 0, color: '#10b981', items: assignments.projects, emptyMsg: 'No projects assigned',
      renderItem: (p, i) => (
        <button key={i} onClick={() => navigate(`/admin/projects/${p.id}`)} className="portal-press portal-row-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4, textAlign: 'left', color: 'inherit' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: TEXT }}>{p.title}</p>
            <p style={{ margin: 0, fontSize: '0.67rem', color: MUTED }}>{p.customer?.full_name || 'No customer'}</p>
          </div>
          {p.deadline && <span style={{ fontSize: '0.68rem', fontWeight: 700, color: daysUntil(p.deadline) <= 7 ? '#ef4444' : MUTED, flexShrink: 0 }}>{daysUntil(p.deadline)}d</span>}
          <ChevronRight size={13} color={MUTED} />
        </button>
      ),
    },
    {
      key: 'orders', label: 'Assigned Orders', count: assignments.counts?.orders || 0, color: '#f59e0b', items: assignments.orders, emptyMsg: 'No orders assigned',
      renderItem: (o, i) => (
        <button key={i} onClick={() => navigate(`/admin/orders/${o.id}`)} className="portal-press portal-row-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4, textAlign: 'left', color: 'inherit' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: TEXT }}>{o.order_number}</p>
            <p style={{ margin: 0, fontSize: '0.67rem', color: MUTED }}>{o.customer?.full_name}</p>
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', flexShrink: 0 }}>{o.currency || 'KES'} {Number(o.total||0).toLocaleString()}</span>
          <ChevronRight size={13} color={MUTED} />
        </button>
      ),
    },
    {
      key: 'quotes', label: 'Assigned Quotes', count: assignments.counts?.quotes || 0, color: '#8b5cf6', items: assignments.quotes, emptyMsg: 'No quotes assigned',
      renderItem: (q, i) => (
        <button key={i} onClick={() => navigate(`/admin/quotes/${q.id}`)} className="portal-press portal-row-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4, textAlign: 'left', color: 'inherit' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: TEXT }}>{q.quote_number}</p>
            <p style={{ margin: 0, fontSize: '0.67rem', color: MUTED }}>{q.customer?.full_name}</p>
          </div>
          <ChevronRight size={13} color={MUTED} />
        </button>
      ),
    },
    {
      key: 'bookings',
      label: 'My Bookings',
      count: assignments.counts?.bookings || 0,
      color: '#db2777',
      items: assignments.bookings,
      emptyMsg: 'No bookings assigned to you yet',
      renderItem: (b, idx) => (
        <Link
          key={idx}
          to={b.url}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 12px', borderRadius: 9,
            background: 'none', textDecoration: 'none',
            borderBottom: '1px solid rgba(128,128,128,0.10)',
            transition: 'background 140ms',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(219,39,119,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>{b.booking_number}</p>
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af' }}>{b.customer || 'Unknown customer'}</p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <StatusBadge status={b.status} />
            {b.scheduled_at && (
              <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: '3px 0 0' }}>{fmtDate(b.scheduled_at)}</p>
            )}
          </div>
          {b.role && (
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
              padding: '2px 7px', borderRadius: 99,
              background: b.role === 'lead' ? 'rgba(219,39,119,0.12)' : 'rgba(128,128,128,0.10)',
              color: b.role === 'lead' ? '#db2777' : '#6b7280',
            }}>
              {b.role}
            </span>
          )}
          <ChevronRight size={13} style={{ color: '#9ca3af', flexShrink: 0 }} />
        </Link>
      ),
    },
    {
      key: 'tickets', label: 'Assigned Tickets', count: assignments.counts?.tickets || 0, color: '#ef4444', items: assignments.tickets, emptyMsg: 'No tickets assigned',
      renderItem: (t, i) => (
        <button key={i} onClick={() => navigate(`/admin/tickets/${t.id}`)} className="portal-press portal-row-hover" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4, textAlign: 'left', color: 'inherit' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: TEXT }}>{t.subject || t.ticket_number}</p>
            <p style={{ margin: 0, fontSize: '0.67rem', color: MUTED }}>{t.customer?.full_name}</p>
          </div>
          <ChevronRight size={13} color={MUTED} />
        </button>
      ),
    },
  ];

  return (
    <div style={{ padding: '14px 14px 8px' }}>
      {sections.map(section => (
        <div key={section.key} style={{ marginBottom: 8, borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}`, background: SURFACE }}>
          <button onClick={() => toggleSection(section.key)} className="portal-press" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'inherit' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: section.color, flexShrink: 0, boxShadow: `0 0 6px ${section.color}` }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: section.color }}>{section.label}</span>
              <span style={{ fontSize: '0.62rem', fontWeight: 700, color: section.color, background: `${section.color}18`, padding: '1px 7px', borderRadius: 99 }}>{section.count}</span>
            </div>
            {openSections[section.key] ? <ChevronUp size={13} color={MUTED} /> : <ChevronDown size={13} color={MUTED} />}
          </button>
          {openSections[section.key] && (
            <div style={{ padding: '2px 8px 8px', borderTop: `1px solid ${BORDER}` }}>
              {section.items?.length > 0
                ? section.items.slice(0, 5).map((item, i) => section.renderItem(item, i))
                : <p style={{ margin: 0, fontSize: '0.72rem', color: MUTED, padding: '10px 4px' }}>{section.emptyMsg}</p>
              }
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AdminEmployeeTab({ user, empRecord, navigate }) {
  const STATUS_COLORS = {
    active:    { bg: 'rgba(22,163,74,0.18)',  text: '#4ade80' },
    on_leave:  { bg: 'rgba(245,158,11,0.18)', text: '#fbbf24' },
    probation: { bg: 'rgba(99,102,241,0.18)', text: '#818cf8' },
    suspended: { bg: 'rgba(239,68,68,0.18)',  text: '#f87171' },
  };
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const rows = empRecord ? [
    { label: 'Full Name',    value: user?.name },
    { label: 'Email',        value: user?.email },
    { label: 'Role',         value: user?.role?.replace(/_/g, ' ')?.toUpperCase() },
    { label: 'Job Title',    value: empRecord.job_title || '—' },
    { label: 'Department',   value: empRecord.department?.name || '—' },
    { label: 'Employee No.', value: empRecord.employee_number || '—' },
    { label: 'Start Date',   value: fmtDate(empRecord.start_date) },
    { label: 'Status',       value: empRecord.employment_status, isStatus: true },
  ] : [
    { label: 'Full Name', value: user?.name },
    { label: 'Email',     value: user?.email },
    { label: 'Role',      value: user?.role?.replace(/_/g, ' ')?.toUpperCase() },
  ];

  return (
    <div style={{ padding: '14px 14px 8px' }}>
      <div style={{ ...glass(), overflow: 'hidden', marginBottom: 10 }}>
        {rows.map((row, i) => (
          <InfoRow key={row.label} label={row.label} value={row.value} last={i === rows.length - 1}
            statusMeta={row.isStatus ? (STATUS_COLORS[row.value] ?? { bg: 'rgba(107,114,128,0.18)', text: '#9ca3af' }) : undefined}
          />
        ))}
      </div>

      {empRecord?.skills?.length > 0 && (
        <GlassCard>
          <p style={{ margin: '0 0 8px', fontSize: '0.62rem', fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Skills</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {empRecord.skills.map((s, i) => (
              <span key={i} style={{ padding: '3px 10px', borderRadius: 99, background: 'rgba(168,85,247,0.15)', border: `1px solid ${BORDER_P}`, fontSize: '0.68rem', fontWeight: 600, color: '#c4b5fd' }}>
                {s.name ?? s}
              </span>
            ))}
          </div>
        </GlassCard>
      )}

      <button onClick={() => navigate('/admin/profile')} className="portal-press" style={{ width: '100%', padding: '10px', borderRadius: 11, border: `1px solid ${BORDER_P}`, background: 'rgba(168,85,247,0.08)', color: PURPLE, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
        Full Employee Record <ChevronRight size={13} />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNAUTHENTICATED VIEW
// ═══════════════════════════════════════════════════════════════════════════════
const UNAUTH_TABS = [
  { key: 'browse',  label: 'Browse',  icon: Globe },
  { key: 'signin',  label: 'Sign In', icon: User  },
];

function UnauthPWAHome() {
  const navigate    = useNavigate();
  const [activeTab, setActiveTab] = useState('browse');

  const browseLinks = [
    { key: 'products',  label: 'Products',  path: '/products',  color: '#3b82f6', icon: Package   },
    { key: 'services',  label: 'Services',  path: '/services',  color: '#10b981', icon: Wrench    },
    { key: 'specials',  label: 'Specials',  path: '/specials',  color: '#f59e0b', icon: Tag       },
    { key: 'auctions',  label: 'Auctions',  path: '/auctions',  color: '#dc2626', icon: Gavel     },
    { key: 'brochures', label: 'Brochures', path: '/brochures', color: '#64748b', icon: BookOpen  },
    { key: 'careers',   label: 'Careers',   path: '/careers',   color: '#7c3aed', icon: Briefcase },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'transparent' }}>
      <style>{GLOBAL_CSS}</style>
      <div style={{ padding: 'calc(20px + env(safe-area-inset-top, 0px)) 18px 14px', borderBottom: `1px solid ${BORDER_P}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.65rem', color: MUTED }}>Welcome to</p>
          <p style={{ margin: '1px 0 0', fontSize: '1.4rem', fontWeight: 900, color: TEXT, letterSpacing: '-0.03em' }}>TISL</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ThemeSwitcher />
        <Bell size={20} color={MUTED} />
        </div>
      </div>

      <TabBar tabs={UNAUTH_TABS} active={activeTab} onChange={setActiveTab} />

      <div style={{ flex: 1, padding: 14, animation: 'portalFadeUp 250ms ease' }}>
        {activeTab === 'browse' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {browseLinks.map(link => {
              const Icon = link.icon;
              return (
                <button key={link.key} onClick={() => navigate(link.path)} className="portal-press" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '12px 6px', borderRadius: 13, ...glowBtn(link.color), cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${link.color}30`, boxShadow: `0 0 14px ${link.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={18} color={link.color} strokeWidth={2} />
                  </div>
                  <span style={{ fontSize: '0.64rem', fontWeight: 700, color: 'inherit' }}>{link.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {activeTab === 'signin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 340, margin: '0 auto' }}>
            <div style={{ ...glass(), padding: '22px 18px', textAlign: 'center', marginBottom: 4 }}>
              <div style={{ width: 50, height: 50, borderRadius: 14, background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_D})`, boxShadow: `0 4px 18px rgba(168,85,247,0.4)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <User size={24} color="white" strokeWidth={2} />
              </div>
              <p style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 800, color: TEXT }}>Welcome back</p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: MUTED }}>Sign in to access your account</p>
            </div>
            <button onClick={() => navigate('/login')} className="portal-press" style={{ width: '100%', padding: '12px', borderRadius: 11, border: 'none', background: `linear-gradient(135deg, ${PURPLE}, ${PURPLE_D})`, color: 'white', fontSize: '0.87rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 4px 16px rgba(168,85,247,0.35)` }}>
              Sign In
            </button>
            <button onClick={() => navigate('/register')} className="portal-press" style={{ width: '100%', padding: '12px', borderRadius: 11, border: `1.5px solid ${BORDER_P}`, background: 'rgba(168,85,247,0.08)', color: PURPLE, fontSize: '0.87rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Create Account
            </button>
            <button onClick={() => navigate('/products')} className="portal-press" style={{ width: '100%', padding: '10px', borderRadius: 11, border: `1px solid ${BORDER}`, background: SURFACE, color: MUTED, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Browse as Guest →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
export default function Portal() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();
  const handleLogout = () => { logout(); navigate('/login'); };
  const isAdmin = ['admin', 'super_admin', 'manager', 'finance', 'logistics', 'sales_rep', 'staff'].includes(user?.role);

  if (!isAuthenticated) return <UnauthPWAHome />;
  if (isAdmin)          return <AdminPWAHome   user={user} onLogout={handleLogout} />;
  return                       <CustomerPWAHome user={user} onLogout={handleLogout} />;
}