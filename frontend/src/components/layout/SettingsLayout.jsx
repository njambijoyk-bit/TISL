import {
  Globe, DollarSign, GraduationCap,
  FileText, Phone, BookOpen, Home,
  Briefcase, Gift, UserCheck, Crown,
  Tag, Users, Settings as SettingsIcon,
  FootprintsIcon, ChevronLeft, Truck,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ThemeSwitcher from '../common/ThemeSwitcher';

const GROUPS = [
  {
    label: 'System',
    items: [
      { name: 'General',  icon: Globe,      bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)', path: '/admin/settings/general',          active: true },
      { name: 'Currency', icon: DollarSign, bg: 'linear-gradient(135deg,#10b981,#34d399)', path: '/admin/settings/currency',         active: true },
      { name: 'Customer Tiers',icon: Crown, bg: 'linear-gradient(135deg,#ec4899,#f472b6)', path: '/admin/settings/customer-tiers',   active: true },
      { name: 'Shipping', icon: Truck,      bg: 'linear-gradient(135deg,#f97316,#fb923c)', path: '/admin/settings/shipping',         active: true },
    ],
  },
  {
    label: 'Content',
    items: [
      { name: 'About',    icon: FileText,       bg: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', path: '/admin/settings/content/about',    active: true },
      { name: 'Contact',  icon: Phone,          bg: 'linear-gradient(135deg,#c2410c,#f97316)', path: '/admin/settings/content/contact',  active: true },
      { name: 'Manual',   icon: BookOpen,       bg: 'linear-gradient(135deg,#6366f1,#818cf8)', path: '/admin/settings/content/manual',   active: true },
      { name: 'Homepage', icon: Home,           bg: 'linear-gradient(135deg,#22c55e,#4ade80)', path: '/admin/settings/content/homepage', active: true },
      { name: 'Footer',   icon: FootprintsIcon, bg: 'linear-gradient(135deg,#b45309,#f59e0b)', path: '/admin/settings/content/footer',   active: true },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Work', icon: Briefcase, bg: 'linear-gradient(135deg,#9d174d,#ec4899)', path: '/admin/work', active: true },
      { name: 'Careers', icon: GraduationCap,  bg: 'linear-gradient(135deg,#4338ca,#6366f1)', path: '/admin/careers/jobs',  active: true },
    ],
  },
  {
    label: 'People',
    items: [
      { name: 'Employee Management', icon: UserCheck, bg: 'linear-gradient(135deg,#f97316,#fb923c)', path: '/admin/employees',   active: true },
      { name: 'User Management', icon: Users, bg: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', path: '/admin/users',       active: true },
      { name: 'Referral Codes',  icon: Gift,  bg: 'linear-gradient(135deg,#ec4899,#f472b6)', path: '/admin/referrals',   active: true },
      { name: 'Promo Codes',     icon: Tag,   bg: 'linear-gradient(135deg,#7c3aed,#a78bfa)', path: '/admin/promo-codes', active: true },
    ],
  },
];

const PANEL_W   = 224;
const PANEL_W_C = 52;   // collapsed — icon squares only

export default function SettingsLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate     = useNavigate();
  const { pathname } = useLocation();

  // ─── shared tokens ────────────────────────────────────────────────────────
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

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Settings left panel ──────────────────────────────────────── */}
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
                <button
                  onClick={() => navigate('/admin/settings')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    color: 'var(--color-text-disabled, var(--color-text-muted, var(--color-text-secondary)))',
                    background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'color 150ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-disabled, var(--color-text-muted, var(--color-text-secondary)))'}
                  title="Settings home"
                >
                  <SettingsIcon size={13} />
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Settings
                  </span>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ThemeSwitcher />
                  <button onClick={() => setCollapsed(true)} style={collapseBtn} title="Collapse panel">
                    <ChevronLeft size={14} />
                  </button>
                </div>
              </>
            )}

            {/* Collapsed: purple settings badge as identity marker */}
            {collapsed && (
              <div style={{
                width: 28, height: 28, borderRadius: 7,
                background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <SettingsIcon size={13} color="white" />
              </div>
            )}
          </div>

          {/* ── Nav ── */}
          <nav style={{ padding: collapsed ? '6px 4px' : '6px 8px', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
            {GROUPS.map((group) => (
              <div key={group.label}>
                <p style={groupLabelStyle}>
                  {collapsed ? '·' : group.label}
                </p>

                {group.items.map((item) => {
                  const Icon     = item.icon;
                  const isActive = pathname === item.path;

                  return (
                    <button
                      key={item.name}
                      onClick={() => item.active && navigate(item.path)}
                      title={collapsed ? item.name : ''}
                      style={{
                        ...btnBase,
                        background: isActive ? 'rgba(168,85,247,0.15)' : 'transparent',
                        color: isActive
                          ? '#5a4c69'
                          : 'var(--color-text-secondary, var(--color-text-muted, var(--color-text)))',
                        opacity: item.active ? 1 : 0.4,
                        cursor: item.active ? 'pointer' : 'default',
                      }}
                      onMouseEnter={e => {
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

          {/* ── Footer — expand trigger when collapsed ── */}
          {collapsed && (
            <div style={{
              padding: '10px 4px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <button
                onClick={() => setCollapsed(false)}
                title="Expand panel"
                style={{ ...collapseBtn, width: '100%', height: 32, borderRadius: 8 }}
              >
                <ChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} />
              </button>
            </div>
          )}
        </aside>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>

      </div>
    </div>
  );
}