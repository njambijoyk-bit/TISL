/**
 * PWAHome
 *
 * App-like landing page shown only when the site is opened as an installed PWA.
  * Provides quick access to key features for customers and admins, with a focus on
 * Three views:
 *   UnauthPWAHome   — Browse / Sign In tabs
 *   CustomerPWAHome — Personal | Rewards | Wallet | Password + shortcuts + cart/quotelist footer
 *   AdminPWAHome    — Overview | My Work | Employee | Security + shortcuts
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


// ── Shortcut route catalogs ───────────────────────────────────────────────────
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
  { key: 'about',          label: 'About Us',       icon: Info,          path: '/about',             color: '#0ea5e9' },
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

const DEFAULT_CUSTOMER_SHORTCUTS = ['orders', 'quotes', 'bookings', 'tickets', 'products', 'services'];
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

// ── Shared: PWA header ────────────────────────────────────────────────────────
function PWAHeader({ name, onLogout }) {
  const [showNotifs,    setShowNotifs]    = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(false);

  // Poll unread count every 60s
  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await notificationsAPI.unreadCount();
        setUnreadCount(res.data.count);
      } catch {}
    };
    fetch();
    const id = setInterval(fetch, 60_000);
    return () => clearInterval(id);
  }, []);

  const openPanel = async () => {
    setShowNotifs(true);
    setLoading(true);
    try {
      const res = await notificationsAPI.list({ per_page: 30 });
      setNotifications(res.data.data);
    } catch { toast.error('Could not load notifications'); }
    finally { setLoading(false); }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await notificationsAPI.markAsRead(id);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString(), is_read: true } : n)
      );
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

  return (
    <>
      <div style={{
        padding: 'calc(18px + env(safe-area-inset-top, 0px)) 20px 14px',
        background: 'linear-gradient(135deg, #6d28d9 0%, #a855f7 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)', fontWeight: 500, letterSpacing: '0.02em' }}>
            {getGreeting()}
          </p>
          <p style={{ margin: '1px 0 0', fontSize: '1.15rem', fontWeight: 900, color: 'white', letterSpacing: '-0.02em' }}>
            {name} 👋
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThemeSwitcher />

          {/* Bell with badge */}
          <button onClick={openPanel} style={{
            position: 'relative', width: 38, height: 38, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
          }}>
            <Bell size={17} strokeWidth={2.2} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                width: 16, height: 16, borderRadius: '50%',
                background: '#ef4444', border: '2px solid #7c3aed',
                fontSize: '0.55rem', fontWeight: 800, color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <button onClick={onLogout} title="Sign out" style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
          }}>
            <LogOut size={16} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {/* Notifications bottom sheet */}
      {showNotifs && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowNotifs(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div style={{
            width: '100%', background: 'white', borderRadius: '20px 20px 0 0',
            maxHeight: '82vh', display: 'flex', flexDirection: 'column',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}>
            {/* Sheet header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 16px 12px', borderBottom: '1px solid #f3f4f6', flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#111827' }}>
                  Notifications
                </p>
                {unreadCount > 0 && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 99,
                    background: '#fef2f2', color: '#ef4444',
                    fontSize: '0.68rem', fontWeight: 700,
                  }}>
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllRead} style={{
                    padding: '5px 10px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.25)',
                    background: 'rgba(168,85,247,0.06)', color: '#a855f7',
                    fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                  }}>
                    Mark all read
                  </button>
                )}
                <button onClick={() => setShowNotifs(false)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex',
                }}>
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* List */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                  <Loader2 size={22} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : notifications.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                  <Bell size={32} strokeWidth={1.5} style={{ marginBottom: 10, opacity: 0.4 }} />
                  <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600 }}>No notifications yet</p>
                </div>
              ) : notifications.map(n => {
                const accent = TYPE_COLORS[n.type] ?? '#6b7280';
                return (
                  <div key={n.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '13px 16px',
                    background: n.is_read ? 'white' : 'rgba(168,85,247,0.04)',
                    borderBottom: '1px solid #f9fafb',
                    transition: 'background 200ms',
                  }}>
                    {/* Accent dot */}
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                      background: n.is_read ? '#e5e7eb' : accent,
                    }} />

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }} onClick={() => !n.is_read && handleMarkAsRead(n.id)}>
                      <p style={{
                        margin: '0 0 2px', fontSize: '0.82rem', fontWeight: n.is_read ? 600 : 800,
                        color: '#111827', lineHeight: 1.3,
                      }}>
                        {n.title}
                      </p>
                      <p style={{
                        margin: '0 0 5px', fontSize: '0.75rem',
                        color: n.is_read ? '#9ca3af' : '#4b5563', lineHeight: 1.4,
                      }}>
                        {n.message}
                      </p>
                      <p style={{ margin: 0, fontSize: '0.68rem', color: '#d1d5db', fontWeight: 600 }}>
                        {n.time_ago}
                      </p>
                    </div>

                    {/* Delete */}
                    <button onClick={() => handleDelete(n.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#e5e7eb', padding: 4, display: 'flex', flexShrink: 0,
                    }}
                      onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                      onMouseLeave={e => e.currentTarget.style.color = '#e5e7eb'}
                    >
                      <X size={14} />
                    </button>
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

// ── Shared: tab bar ───────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      display: 'flex', background: 'white',
      borderBottom: '1px solid #f3f4f6', flexShrink: 0,
    }}>
      {tabs.map(tab => {
        const isActive = active === tab.key;
        return (
          <button key={tab.key} onClick={() => onChange(tab.key)} style={{
            flex: 1, padding: '11px 6px 9px', border: 'none', background: 'none',
            cursor: 'pointer', fontFamily: 'inherit',
            borderBottom: isActive ? '2px solid #a855f7' : '2px solid transparent',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            transition: 'all 150ms ease',
          }}>
            <tab.icon size={17} color={isActive ? '#a855f7' : '#d1d5db'} strokeWidth={2.2} />
            <span style={{
              fontSize: '0.62rem', fontWeight: 700, whiteSpace: 'nowrap',
              color: isActive ? '#a855f7' : '#9ca3af',
            }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Shared: customizable shortcut grid ───────────────────────────────────────
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
    setDraft(prev =>
      prev.includes(key) ? prev.filter(k => k !== key)
        : prev.length < 6 ? [...prev, key] : prev
    );
  };

  const save = () => {
    setSelected(draft);
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); } catch {}
    setEditing(false);
    toast.success('Shortcuts saved');
  };

  return (
    <div style={{ padding: '18px 16px 0' }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Quick Access
        </p>
        <button onClick={() => { setDraft(selected); setEditing(true); }} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 8,
          border: '1px solid rgba(168,85,247,0.25)', background: 'rgba(168,85,247,0.06)',
          color: '#a855f7', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
        }}>
          <Edit3 size={11} /> Edit
        </button>
      </div>

      {/* 3 × 2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {active.map(route => {
          const Icon = route.icon;
          return (
            <button key={route.key} onClick={() => navigate(route.path)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '14px 6px', borderRadius: 14, background: 'white',
              border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              cursor: 'pointer', fontFamily: 'inherit', transition: 'transform 120ms ease',
            }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <div style={{
                width: 40, height: 40, borderRadius: 12, background: `${route.color}15`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon size={20} color={route.color} strokeWidth={2} />
              </div>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#374151', textAlign: 'center', lineHeight: 1.2 }}>
                {route.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Edit bottom-sheet modal */}
      {editing && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setEditing(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div style={{
            width: '100%', background: 'white', borderRadius: '20px 20px 0 0',
            padding: '20px 16px',
            paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            maxHeight: '78vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#111827' }}>
                Customize Shortcuts
              </p>
              <button onClick={() => setEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ margin: '0 0 14px', fontSize: '0.73rem', color: '#9ca3af' }}>
              Select up to 6 · {draft.length}/6 selected
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              {allRoutes.map(route => {
                const Icon       = route.icon;
                const isSelected = draft.includes(route.key);
                const isDisabled = !isSelected && draft.length >= 6;
                return (
                  <button key={route.key} onClick={() => !isDisabled && toggleDraft(route.key)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    padding: '12px 6px', borderRadius: 12, fontFamily: 'inherit',
                    background: isSelected ? `${route.color}10` : '#f9fafb',
                    border: isSelected ? `2px solid ${route.color}60` : '2px solid transparent',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.35 : 1, position: 'relative',
                    transition: 'all 150ms ease',
                  }}>
                    {isSelected && (
                      <div style={{
                        position: 'absolute', top: 5, right: 5,
                        width: 15, height: 15, borderRadius: '50%',
                        background: route.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check size={9} color="white" strokeWidth={3} />
                      </div>
                    )}
                    <div style={{
                      width: 34, height: 34, borderRadius: 9, background: `${route.color}18`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={17} color={route.color} strokeWidth={2} />
                    </div>
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#374151', textAlign: 'center', lineHeight: 1.2 }}>
                      {route.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <button onClick={save} style={{
              width: '100%', padding: '13px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white',
              fontSize: '0.88rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Save Shortcuts
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared: fixed bottom bar ──────────────────────────────────────────────────
function PWAFooterBar({ children }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
      background: 'white', borderTop: '1px solid #f3f4f6',
      display: 'flex', gap: 10, padding: '10px 16px',
      paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.06)',
    }}>
      {children}
    </div>
  );
}

// ── Shared: password tab ──────────────────────────────────────────────────────
function PasswordTab({ customer, onVerifyEmail, onLogout }) {
  const [pwd,  setPwd]  = useState({ current_password: '', new_password: '', new_password_confirmation: '' });
  const [show, setShow] = useState({ cur: false, nw: false, cf: false });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [otpSent,      setOtpSent]      = useState(false);
  const [otp,          setOtp]          = useState('');
  const [otpLoading,   setOtpLoading]   = useState(false);

  const sendOtp = async () => {
    setOtpLoading(true);
    try { await authAPI.sendEmailOtp(); setOtpSent(true); toast.success('OTP sent to your email'); }
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
      setErrors({ new_password_confirmation: ['Passwords do not match.'] });
      return;
    }
    setSaving(true);
    try {
      await authAPI.changePassword(pwd);
      toast.success('Password changed');
      setPwd({ current_password: '', new_password: '', new_password_confirmation: '' });
      setErrors({});
    } catch (e) {
      setErrors(e.response?.data?.errors ?? {});
      toast.error(e.response?.data?.message ?? 'Failed to change password');
    } finally { setSaving(false); }
  };

  const PwdField = ({ label, field, showKey }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={show[showKey] ? 'text' : 'password'}
          value={pwd[field]}
          onChange={e => { setPwd(p => ({ ...p, [field]: e.target.value })); setErrors(er => ({ ...er, [field]: null })); }}
          style={{
            width: '100%', padding: '10px 36px 10px 12px', borderRadius: 10, boxSizing: 'border-box',
            border: errors[field] ? '1.5px solid #ef4444' : '1.5px solid #e5e7eb',
            fontSize: '0.85rem', outline: 'none', fontFamily: 'inherit', background: 'white',
          }}
          onFocus={e => e.target.style.borderColor = '#a855f7'}
          onBlur={e  => e.target.style.borderColor = errors[field] ? '#ef4444' : '#e5e7eb'}
        />
        <button type="button" onClick={() => setShow(s => ({ ...s, [showKey]: !s[showKey] }))} style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex',
        }}>
          {show[showKey] ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {errors[field] && <p style={{ margin: '3px 0 0', fontSize: '0.7rem', color: '#ef4444' }}>{errors[field][0]}</p>}
    </div>
  );

  return (
    <div style={{ padding: '18px 16px' }}>
      {/* Email verification — only show if not verified */}
      {customer && !customer.email_verified_at && (
        <div style={{
          marginBottom: 16, padding: '12px 14px', borderRadius: 12,
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <ShieldAlert size={15} color="#ef4444" />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ef4444' }}>Email not verified</span>
          </div>
          {!otpSent ? (
            <button onClick={sendOtp} disabled={otpLoading} style={{
              width: '100%', padding: '9px', borderRadius: 9, border: 'none',
              background: '#ef4444', color: 'white', fontSize: '0.8rem',
              fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {otpLoading ? 'Sending…' : 'Send verification code'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={otp} onChange={e => setOtp(e.target.value)}
                placeholder="Enter OTP"
                style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1.5px solid #e5e7eb', fontSize: '0.83rem', outline: 'none', fontFamily: 'inherit' }}
                onFocus={e => e.target.style.borderColor = '#a855f7'}
                onBlur={e  => e.target.style.borderColor = '#e5e7eb'}
              />
              <button onClick={verifyOtp} disabled={otpLoading || !otp} style={{
                padding: '9px 14px', borderRadius: 9, border: 'none',
                background: '#a855f7', color: 'white', fontSize: '0.8rem',
                fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>
                {otpLoading ? '…' : 'Verify'}
              </button>
            </div>
          )}
        </div>
      )}

      {customer?.email_verified_at && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 12,
          background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <ShieldCheck size={15} color="#10b981" />
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#10b981' }}>Email verified</span>
        </div>
      )}

      <p style={{ margin: '0 0 18px', fontSize: '0.82rem', color: '#6b7280', lineHeight: 1.5 }}>
        Keep your account secure with a strong password.
      </p>
      <PwdField label="Current Password"       field="current_password"          showKey="cur" />
      <PwdField label="New Password"            field="new_password"              showKey="nw"  />
      <PwdField label="Confirm New Password"    field="new_password_confirmation" showKey="cf"  />
      <button
        onClick={handleSave}
        disabled={saving || !pwd.current_password || !pwd.new_password || !pwd.new_password_confirmation}
        style={{
          width: '100%', padding: '13px', borderRadius: 12, border: 'none',
          background: saving ? '#e5e7eb' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
          color: 'white', fontSize: '0.88rem', fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        {saving
          ? <><Loader2 size={15} style={{ animation: 'pwaSpinKey 1s linear infinite' }} /> Saving…</>
          : 'Update Password'}
      </button>
      
      {onLogout && (
        <div style={{
          marginTop: 16, padding: '12px 14px', borderRadius: 12,
          background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)',
        }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.82rem', fontWeight: 700, color: '#991b1b' }}>Sign out</p>
          <p style={{ margin: '0 0 10px', fontSize: '0.72rem', color: '#b91c1c' }}>Sign out of your account on this device</p>
          <button onClick={onLogout} style={{
            width: '100%', padding: '11px', borderRadius: 10, border: 'none',
            background: '#ef4444', color: 'white', fontSize: '0.85rem',
            fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
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
  { key: 'password', label: 'Password', icon: Lock       },
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
  const [walletTxs, setWalletTxs] = useState(null);
  const [walletLedger, setWalletLedger] = useState('points');
  const [walletPage,   setWalletPage]   = useState(1);
  const [tierOptions,  setTierOptions]  = useState([]);
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

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (activeTab === 'rewards') fetchMyCodes();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'wallet') {
      customerLoyaltyAPI.myBalance().then(setWallet).catch(() => {});
    }
  }, [activeTab]);

  const firstName = customer?.first_name ?? user?.name?.split(' ')[0] ?? 'there';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        @keyframes pwaSpinKey { to { transform: rotate(360deg); } }
      `}</style>

      <PWAHeader name={firstName} onLogout={onLogout} />
      <TabBar tabs={CUSTOMER_TABS} active={activeTab} onChange={setActiveTab} />

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 82 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Loader2 size={24} color="#a855f7" style={{ animation: 'pwaSpinKey 1s linear infinite' }} />
          </div>
        ) : (
          <>
            {activeTab === 'personal' && <CustomerPersonalTab  customer={customer} user={user} navigate={navigate} />}
            {activeTab === 'rewards'  && <CustomerRewardsTab customer={customer} wallet={wallet} myCodes={myCodes} tierOptions={tierOptions} navigate={navigate} />}
            {activeTab === 'wallet'   && <CustomerWalletTab  wallet={wallet} walletTxs={walletTxs} walletLedger={walletLedger} setWalletLedger={setWalletLedger} navigate={navigate} />}
            {activeTab === 'password' && <PasswordTab customer={customer} onVerifyEmail={() => loadProfile()} onLogout={onLogout} />}
          </>
        )}

        <ShortcutGrid
          allRoutes={CUSTOMER_ROUTES}
          storageKey={`pwa_customer_shortcuts_${user?.id}`}
          defaultShortcuts={DEFAULT_CUSTOMER_SHORTCUTS}
        />
        <div style={{ height: 12 }} />
      </div>

      {/* Fixed bottom bar */}
      <PWAFooterBar>
        <button onClick={() => navigate('/cart')} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '12px', borderRadius: 12, border: '1.5px solid #e5e7eb',
          cursor: 'pointer', fontFamily: 'inherit',
          fontSize: '0.85rem', fontWeight: 700, color: '#374151', position: 'relative',
        }}>
          <ShoppingCart size={17} color="#a855f7" strokeWidth={2.2} />
          Cart
          {cartCount > 0 && (
            <span style={{
              position: 'absolute', top: 8, right: 10,
              minWidth: 17, height: 17, borderRadius: 99, padding: '0 4px',
              background: '#a855f7', color: 'white', fontSize: '0.58rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{cartCount > 99 ? '99+' : cartCount}</span>
          )}
        </button>
        <button onClick={() => navigate('/quote-list')} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          padding: '12px', borderRadius: 12, border: 'none',
          background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
          cursor: 'pointer', fontFamily: 'inherit',
          fontSize: '0.85rem', fontWeight: 700, color: 'white', position: 'relative',
        }}>
          <FileText size={17} strokeWidth={2.2} />
          Quote List
          {quoteListCount > 0 && (
            <span style={{
              position: 'absolute', top: 8, right: 10,
              minWidth: 17, height: 17, borderRadius: 99, padding: '0 4px',
              background: 'white', color: '#a855f7', fontSize: '0.58rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{quoteListCount > 99 ? '99+' : quoteListCount}</span>
          )}
        </button>
      </PWAFooterBar>
    </div>
  );
}

// ── Customer tab: Personal ────────────────────────────────────────────────────
function CustomerPersonalTab({ customer, user, navigate }) {
  if (!customer) return null;
  const rows = [
    { label: 'Full Name',  value: customer.full_name ?? `${customer.first_name} ${customer.last_name}` },
    { label: 'Email',      value: user?.email ?? customer.email },
    { label: 'Phone',      value: customer.phone || '—' },
    { label: 'WhatsApp',   value: customer.whatsapp || '—' },
    { label: 'Birthday',   value: customer.birthday ? new Date(customer.birthday).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : '—' },
    { label: 'Company',    value: customer.company_name || '—' },
  ];
  return (
    <div style={{ padding: '16px 16px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <img
          src={customer.profile_image_url}
          alt={customer.full_name}
          style={{ width: 58, height: 58, borderRadius: 14, objectFit: 'cover', background: '#f3f4f6', flexShrink: 0 }}
        />
        <div>
          <p style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#111827' }}>
            {customer.first_name} {customer.last_name}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: '0.73rem', color: '#9ca3af' }}>{user?.email}</p>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden', marginBottom: 12 }}>
        {rows.map((row, i) => (
          <div key={row.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '11px 14px',
            borderBottom: i < rows.length - 1 ? '1px solid #f9fafb' : 'none',
          }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af' }}>{row.label}</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', maxWidth: '58%', textAlign: 'right' }}>{row.value}</span>
          </div>
        ))}
      </div>

      <button onClick={() => navigate('/profile')} style={{
        width: '100%', padding: '11px', borderRadius: 12,
        border: '1.5px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.05)',
        color: '#a855f7', fontSize: '0.82rem', fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        Edit Full Profile <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ── Customer tab: Rewards ─────────────────────────────────────────────────────
function CustomerRewardsTab({ customer, wallet, myCodes, tierOptions, navigate }) {
  if (!customer) return null;
  const tier       = customer.tier ?? 'bronze';
  const tierOption = tierOptions?.find(t => t.slug === tier);
  const tierColor  = tierOption?.color ?? ({ bronze: '#f97316', silver: '#6b7280', gold: '#f59e0b', platinum: '#a855f7' }[tier] ?? '#a855f7');
  const tierLabel  = tierOption?.name ?? (tier.charAt(0).toUpperCase() + tier.slice(1));
  const points    = wallet?.loyalty_points ?? customer.loyalty_points ?? 0;

  return (
    <div style={{ padding: '16px 16px 8px' }}>
      {/* Tier card */}
      <div style={{
        background: `${tierColor}10`, border: `1px solid ${tierColor}28`,
        borderRadius: 14, padding: '16px', marginBottom: 10,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: `${tierColor}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Award size={24} color={tierColor} strokeWidth={2} />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: '0.68rem', color: tierColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Current Tier</p>
          <p style={{ margin: '2px 0 0', fontSize: '1.1rem', fontWeight: 900, color: tierColor }}>
            {tierLabel}
          </p>
        </div>
        {customer.tier_benefits?.discount > 0 && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: '1.3rem', fontWeight: 900, color: tierColor }}>{customer.tier_benefits.discount}%</p>
            <p style={{ margin: 0, fontSize: '0.6rem', color: tierColor, opacity: 0.7 }}>discount</p>
          </div>
        )}
      </div>

      {/* Points bar */}
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', padding: '14px', marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Loyalty Points</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 900, color: '#a855f7' }}>{points.toLocaleString()}</span>
        </div>
        <div style={{ height: 6, borderRadius: 99, background: 'rgba(168,85,247,0.1)', overflow: 'hidden', marginBottom: 6 }}>
          <div style={{
            height: '100%', borderRadius: 99,
            width: `${Math.min(100, (points / 1000) * 100)}%`,
            background: 'linear-gradient(90deg, #a855f7, #7c3aed)', transition: 'width 0.6s ease',
          }} />
        </div>
        <p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af' }}>
          {points >= 1000 ? '🎁 Ready to redeem!' : `${(1000 - points).toLocaleString()} pts to first redemption`}
        </p>
      </div>

      {/* Referral code */}
      {customer.referral_code && (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', padding: '14px', marginBottom: 10 }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Referral Code</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, background: '#f5f3ff',
              border: '1px dashed #c4b5fd', fontFamily: 'monospace', fontWeight: 900,
              fontSize: '0.92rem', color: '#7c3aed', letterSpacing: '0.06em',
            }}>
              {customer.referral_code.code}
            </code>
            <button onClick={() => { navigator.clipboard.writeText(customer.referral_code.code); toast.success('Copied!'); }} style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid #c4b5fd',
              background: 'white', color: '#7c3aed', fontSize: '0.75rem', fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Copy
            </button>
          </div>
        </div>
      )}
      {myCodes?.active?.length > 0 && (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', padding: '14px', marginBottom: 10 }}>
          <p style={{ margin: '0 0 10px', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Your Promo Codes
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myCodes.active.slice(0, 3).map(code => (
              <div key={code.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: 10,
                background: '#faf5ff', border: '1px solid #e9d5ff',
              }}>
                <div>
                  <code style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.85rem', color: '#6d28d9', letterSpacing: '0.06em' }}>
                    {code.code}
                  </code>
                  <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: '#7c3aed' }}>
                    {code.reward_type === 'percentage' ? `${code.reward_value}% off` : `KES ${Number(code.reward_value).toLocaleString()} off`}
                  </p>
                </div>
                <button onClick={() => { navigator.clipboard.writeText(code.code); toast.success('Copied!'); }} style={{
                  padding: '5px 10px', borderRadius: 7, border: '1px solid #c4b5fd',
                  background: 'white', color: '#7c3aed', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                }}>
                  Copy
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => navigate('/profile')} style={{
        width: '100%', padding: '11px', borderRadius: 12,
        border: '1.5px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.05)',
        color: '#a855f7', fontSize: '0.82rem', fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        Full Rewards Detail <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ── Customer tab: Wallet ──────────────────────────────────────────────────────
function CustomerWalletTab({ wallet, navigate }) {
  const credit = wallet?.store_credit ?? 0;
  const points = wallet?.loyalty_points ?? 0;
  const fmt    = n => Number(n ?? 0).toLocaleString('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 });

  return (
    <div style={{ padding: '16px 16px 8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        {[
          { label: 'Store Credit',   value: fmt(credit), color: '#10b981', icon: CreditCard },
          { label: 'Loyalty Points', value: points.toLocaleString(), color: '#a855f7', icon: Star },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} style={{
            background: 'white', borderRadius: 14, border: '1px solid #f3f4f6',
            padding: '14px', textAlign: 'center',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: `${color}12`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px',
            }}>
              <Icon size={18} color={color} strokeWidth={2} />
            </div>
            <p style={{ margin: '0 0 2px', fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 900, color }}>{value}</p>
          </div>
        ))}
      </div>

      <button onClick={() => navigate('/profile')} style={{
        width: '100%', padding: '11px', borderRadius: 12,
        border: '1.5px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.05)',
        color: '#a855f7', fontSize: '0.82rem', fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        Full Wallet & Transactions <ChevronRight size={14} />
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
  const [deadlines,    setDeadlines]    = useState({ projects: [], quotes: [], milestones: [], tasks: [], tickets: [] });
  const [activity,     setActivity]     = useState([]);
  const [empRecord,    setEmpRecord]    = useState(null);
  const [openSections, setOpenSections] = useState({ customers: true, projects: true, orders: false, quotes: false, quoteRequests: false, tickets: false });

  const toggleSection = key => setOpenSections(p => ({ ...p, [key]: !p[key] }));

  const daysUntil = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

  useEffect(() => {
    workAPI.myDashboard().then(data => {
      setAssignments(data?.assignments ?? { customers: [], orders: [], quotes: [], quoteRequests: [], projects: [], tasks: [], milestones: [], tickets: [], counts: {} });
      setDeadlines(data?.deadlines ?? { projects: [], quotes: [], milestones: [], tasks: [], tickets: [] });
      setActivity(data?.activity ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));

    employeesAPI.getMyRecord().then(data => setEmpRecord(data.employee)).catch(() => {});
  }, []);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <style>{`@keyframes pwaSpinKey { to { transform: rotate(360deg); } }`}</style>

      <PWAHeader name={firstName} onLogout={onLogout} />
      <TabBar tabs={ADMIN_TABS} active={activeTab} onChange={setActiveTab} />

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 24 }}>
        {activeTab === 'overview'  && <AdminOverviewTab  user={user} navigate={navigate} />}
        {activeTab === 'work' && <AdminWorkTab assignments={assignments} openSections={openSections} toggleSection={toggleSection} daysUntil={daysUntil} navigate={navigate} />}
        {activeTab === 'employee' && <AdminEmployeeTab user={user} empRecord={empRecord} navigate={navigate} />}
        {activeTab === 'security' && <PasswordTab onLogout={onLogout} />}

        <ShortcutGrid
          allRoutes={ADMIN_ROUTES}
          storageKey={`pwa_admin_shortcuts_${user?.id}`}
          defaultShortcuts={DEFAULT_ADMIN_SHORTCUTS}
        />
        <div style={{ height: 12 }} />
      </div>
    </div>
  );
}

function AdminOverviewTab({ user, navigate }) {
  const role      = user?.role ?? 'staff';
  const roleColor = ROLE_COLORS[role] ?? '#6b7280';
  const roleLabel = ROLE_LABELS[role] ?? role;
  const links = [
    { label: 'Dashboard', desc: 'Revenue & order KPIs', path: '/admin' },
    { label: 'Orders',    desc: 'Manage fulfillment queue', path: '/admin/orders' },
    { label: 'Reports',   desc: 'Revenue & sales analytics', path: '/admin/reports' },
    { label: 'Settings',  desc: 'System configuration', path: '/admin/settings' },
  ];
  return (
    <div style={{ padding: '16px 16px 8px' }}>
      <div style={{
        background: `${roleColor}10`, border: `1px solid ${roleColor}25`,
        borderRadius: 14, padding: '16px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, background: `${roleColor}20`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Shield size={24} color={roleColor} strokeWidth={2} />
        </div>
        <div>
          <p style={{ margin: 0, fontSize: '0.68rem', color: roleColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your Role</p>
          <p style={{ margin: '2px 0 0', fontSize: '1.1rem', fontWeight: 900, color: roleColor }}>{roleLabel}</p>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden' }}>
        {links.map((link, i) => (
          <button key={link.label} onClick={() => navigate(link.path)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '13px 14px', background: 'none', border: 'none',
            borderBottom: i < links.length - 1 ? '1px solid #f9fafb' : 'none',
            cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          }}>
            <div>
              <p style={{ margin: 0, fontSize: '0.83rem', fontWeight: 600, color: '#111827' }}>{link.label}</p>
              <p style={{ margin: '1px 0 0', fontSize: '0.68rem', color: '#9ca3af' }}>{link.desc}</p>
            </div>
            <ChevronRight size={14} color="#d1d5db" />
          </button>
        ))}
      </div>
    </div>
  );
}

function AdminWorkTab({ assignments, openSections, toggleSection, daysUntil, navigate }) {
  const sections = [
    { key: 'customers',     label: 'Assigned Customers',      count: assignments.counts?.customers     || 0, color: '#3b82f6', items: assignments.customers,     emptyMsg: 'No customers assigned',
      renderItem: (c, i) => (
        <button key={i} onClick={() => navigate(`/admin/customers/${c.id}`)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#f9fafb', border: '1px solid #f3f4f6', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6, textAlign: 'left' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6', flexShrink: 0 }}>
            {`${c.first_name?.[0]||''}${c.last_name?.[0]||''}`}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</p>
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af' }}>{c.email}</p>
          </div>
          <ChevronRight size={14} color="#d1d5db" />
        </button>
      )
    },
    { key: 'projects',      label: 'My Projects',             count: assignments.counts?.projects      || 0, color: '#10b981', items: assignments.projects,      emptyMsg: 'No projects assigned',
      renderItem: (p, i) => (
        <button key={i} onClick={() => navigate(`/admin/projects/${p.id}`)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#f9fafb', border: '1px solid #f3f4f6', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6, textAlign: 'left' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>{p.title}</p>
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af' }}>{p.customer?.full_name || 'No customer'}</p>
          </div>
          {p.deadline && <span style={{ fontSize: '0.72rem', fontWeight: 700, color: daysUntil(p.deadline) <= 7 ? '#ef4444' : '#9ca3af' }}>{daysUntil(p.deadline)}d</span>}
          <ChevronRight size={14} color="#d1d5db" />
        </button>
      )
    },
    { key: 'orders',        label: 'Assigned Orders',         count: assignments.counts?.orders        || 0, color: '#f59e0b', items: assignments.orders,        emptyMsg: 'No orders assigned',
      renderItem: (o, i) => (
        <button key={i} onClick={() => navigate(`/admin/orders/${o.id}`)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#f9fafb', border: '1px solid #f3f4f6', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6, textAlign: 'left' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>{o.order_number}</p>
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af' }}>{o.customer?.full_name}</p>
          </div>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827' }}>{o.currency || 'KES'} {Number(o.total||0).toLocaleString()}</span>
          <ChevronRight size={14} color="#d1d5db" />
        </button>
      )
    },
    { key: 'quotes',        label: 'Assigned Quotes',         count: assignments.counts?.quotes        || 0, color: '#8b5cf6', items: assignments.quotes,        emptyMsg: 'No quotes assigned',
      renderItem: (q, i) => (
        <button key={i} onClick={() => navigate(`/admin/quotes/${q.id}`)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#f9fafb', border: '1px solid #f3f4f6', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6, textAlign: 'left' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>{q.quote_number}</p>
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af' }}>{q.customer?.full_name}</p>
          </div>
          <ChevronRight size={14} color="#d1d5db" />
        </button>
      )
    },
    { key: 'tickets',       label: 'Assigned Tickets',        count: assignments.counts?.tickets       || 0, color: '#ef4444', items: assignments.tickets,       emptyMsg: 'No tickets assigned',
      renderItem: (t, i) => (
        <button key={i} onClick={() => navigate(`/admin/tickets/${t.id}`)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: '#f9fafb', border: '1px solid #f3f4f6', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 6, textAlign: 'left' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#111827' }}>{t.subject || t.ticket_number}</p>
            <p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af' }}>{t.customer?.full_name}</p>
          </div>
          <ChevronRight size={14} color="#d1d5db" />
        </button>
      )
    },
  ];

  return (
    <div style={{ padding: '16px 16px 8px' }}>
      {sections.map(section => (
        <div key={section.key} style={{ marginBottom: 10, borderRadius: 12, overflow: 'hidden', border: '1px solid #f3f4f6' }}>
          <button onClick={() => toggleSection(section.key)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', background: 'white', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: section.color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827' }}>{section.label}</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: section.color, background: `${section.color}15`, padding: '1px 7px', borderRadius: 99 }}>{section.count}</span>
            </div>
            {openSections[section.key] ? <ChevronUp size={14} color="#9ca3af" /> : <ChevronDown size={14} color="#9ca3af" />}
          </button>
          {openSections[section.key] && (
            <div style={{ padding: '4px 12px 10px' }}>
              {section.items?.length > 0
                ? section.items.slice(0, 5).map((item, i) => section.renderItem(item, i))
                : <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af', padding: '8px 2px' }}>{section.emptyMsg}</p>
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
    active:    { bg: '#dcfce7', text: '#166534' },
    on_leave:  { bg: '#fef3c7', text: '#92400e' },
    probation: { bg: '#e0e7ff', text: '#3730a3' },
    suspended: { bg: '#fee2e2', text: '#991b1b' },
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
    { label: 'Status',       value: empRecord.employment_status },
  ] : [
    { label: 'Full Name', value: user?.name },
    { label: 'Email',     value: user?.email },
    { label: 'Role',      value: user?.role?.replace(/_/g, ' ')?.toUpperCase() },
  ];

  return (
    <div style={{ padding: '16px 16px 8px' }}>
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', overflow: 'hidden', marginBottom: 12 }}>
        {rows.map((row, i) => (
          <div key={row.label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 14px', borderBottom: i < rows.length - 1 ? '1px solid #f9fafb' : 'none',
          }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af' }}>{row.label}</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', maxWidth: '55%', textAlign: 'right' }}>
              {row.label === 'Status' && empRecord ? (
                <span style={{
                  padding: '2px 8px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 700,
                  ...(STATUS_COLORS[row.value] ?? { bg: '#f3f4f6', text: '#6b7280' }),
                  background: (STATUS_COLORS[row.value] ?? {}).bg,
                  color: (STATUS_COLORS[row.value] ?? {}).text,
                }}>
                  {row.value?.replace('_', ' ')}
                </span>
              ) : row.value}
            </span>
          </div>
        ))}
      </div>

      {empRecord?.skills?.length > 0 && (
        <div style={{ background: 'white', borderRadius: 14, border: '1px solid #f3f4f6', padding: '14px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Skills</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {empRecord.skills.map((s, i) => (
              <span key={i} style={{ padding: '3px 10px', borderRadius: 99, background: '#f5f3ff', border: '1px solid #e9d5ff', fontSize: '0.72rem', fontWeight: 600, color: '#7c3aed' }}>
                {s.name ?? s}
              </span>
            ))}
          </div>
        </div>
      )}

      <button onClick={() => navigate('/admin/profile')} style={{
        width: '100%', padding: '11px', borderRadius: 12,
        border: '1.5px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.05)',
        color: '#a855f7', fontSize: '0.82rem', fontWeight: 700,
        cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        Full Employee Record <ChevronRight size={14} />
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: 'calc(22px + env(safe-area-inset-top, 0px)) 20px 16px',
        background: 'linear-gradient(135deg, #6d28d9 0%, #a855f7 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.7rem', color: 'rgba(255,255,255,0.65)' }}>Welcome to</p>
          <p style={{ margin: '1px 0 0', fontSize: '1.5rem', fontWeight: 900, color: 'white', letterSpacing: '-0.03em' }}>TISL</p>
        </div>
        <Bell size={22} color="rgba(255,255,255,0.75)" />
      </div>

      <TabBar tabs={UNAUTH_TABS} active={activeTab} onChange={setActiveTab} />

      <div style={{ flex: 1, padding: 16 }}>
        {activeTab === 'browse' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {browseLinks.map(link => {
              const Icon = link.icon;
              return (
                <button key={link.key} onClick={() => navigate(link.path)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                  padding: '14px 6px', borderRadius: 14, background: 'white',
                  border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, background: `${link.color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={20} color={link.color} strokeWidth={2} />
                  </div>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#374151' }}>{link.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {activeTab === 'signin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340, margin: '0 auto' }}>
            <div style={{
              background: 'white', borderRadius: 16, border: '1px solid #f3f4f6',
              padding: '24px 20px', textAlign: 'center', marginBottom: 4,
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
              }}>
                <User size={26} color="white" strokeWidth={2} />
              </div>
              <p style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 800, color: '#111827' }}>Welcome back</p>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#9ca3af' }}>Sign in to access your account</p>
            </div>
            <button onClick={() => navigate('/login')} style={{
              width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
              color: 'white', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>Sign In</button>
            <button onClick={() => navigate('/register')} style={{
              width: '100%', padding: '14px', borderRadius: 12,
              border: '1.5px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.05)',
              color: '#a855f7', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>Create Account</button>
            <button onClick={() => navigate('/products')} style={{
              width: '100%', padding: '12px', borderRadius: 12,
              border: '1.5px solid #e5e7eb', background: 'white',
              color: '#6b7280', fontSize: '0.83rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>Browse as Guest →</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — routes to the right view
// ═══════════════════════════════════════════════════════════════════════════════

export default function Portal() {
  const { isAuthenticated, user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const isAdmin = ['admin', 'super_admin', 'manager', 'finance', 'logistics', 'sales_rep', 'staff']
    .includes(user?.role);

  if (!isAuthenticated) return <UnauthPWAHome />;
  if (isAdmin)          return <AdminPWAHome   user={user} onLogout={handleLogout} />;
  return                       <CustomerPWAHome user={user} onLogout={handleLogout} />;
}