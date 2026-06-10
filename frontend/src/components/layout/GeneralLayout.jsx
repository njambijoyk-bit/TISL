import {
  Package, Tags, Folder, ChevronLeft, LucideBinary,
  LayoutGrid, Users, Briefcase, FolderGit2Icon,
  LucideBadgeDollarSign, Volume2, BugIcon, VolumeX, FolderCodeIcon,
  FolderCog, BrainCircuit, KeyRound, Activity, Blocks, Bot,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import ThemeSwitcher from '../common/ThemeSwitcher';
import { useLayoutAudio } from './useLayoutAudio';

const GROUPS = [
  {
    label: 'Catalog',
    items: [
      { name: 'Products',   icon: Package,              bg: 'linear-gradient(135deg,#7c3aed,#a855f7)', path: '/admin/settings/general/bulk/products',   active: true },
      { name: 'Brands',     icon: Tags,                 bg: 'linear-gradient(135deg,#ec4899,#f472b6)', path: '/admin/settings/general/bulk/brands',     active: false },
      { name: 'Categories', icon: Folder,               bg: 'linear-gradient(135deg,#10b981,#34d399)', path: '/admin/settings/general/bulk/categories', active: false },
    ],
  },
  {
    label: 'People',
    items: [
      { name: 'Customers', icon: Users,    bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)', path: '/admin/settings/general/bulk/customers', active: true },
      { name: 'Employees', icon: Briefcase,bg: 'linear-gradient(135deg,#f59e0b,#fbbf24)', path: '/admin/settings/general/bulk/employees', active: true },
    ],
  },
  {
    label: 'AI',
    items: [
      { name: 'AI Analytics', icon: BrainCircuit, bg: 'linear-gradient(135deg,#7c3aed,#a855f7)', path: '/admin/ai-analytics',          active: true },
      { name: 'AI Keys',      icon: KeyRound,     bg: 'linear-gradient(135deg,#0ea5e9,#38bdf8)', path: '/admin/ai-analytics/keys',     active: true },
      { name: 'AI Sessions',  icon: Activity,     bg: 'linear-gradient(135deg,#10b981,#34d399)', path: '/admin/ai-analytics/sessions', active: true },
      { name: 'AI Modules',   icon: Blocks,       bg: 'linear-gradient(135deg,#ec4899,#f472b6)', path: '/admin/ai-analytics/modules',  active: true },
      { name: 'Mimi Bot',     icon: Bot,          bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)', path: '/admin/ai-analytics/mimi',     active: true },
    ],
  },
  {
    label: 'FlowCharts',
    items: [
      { name: 'Orders',       icon: FolderGit2Icon,        bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)', path: '/admin/flowchart/orders',       active: true },
      { name: 'Customers',    icon: LucideBinary,          bg: 'linear-gradient(135deg,#ec4899,#f472b6)', path: '/admin/flowchart/customers',    active: true },
      { name: 'Transactions', icon: LucideBadgeDollarSign, bg: 'linear-gradient(135deg,#10b981,#34d399)', path: '/admin/flowchart/transactions', active: true },
    ],
  },
  {
    label: 'Bugs',
    items: [
      { name: 'Bug Reports', icon: BugIcon,      bg: 'linear-gradient(135deg,#c2410c,#ea580c)', path: '/admin/bug-reports', active: true },
      { name: 'Dev Notes',   icon: FolderCodeIcon,bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)', path: '/admin/dev-notes',   active: true },
      { name: 'Dev Keys',    icon: FolderCog,    bg: 'linear-gradient(135deg,#7c3aed,#a855f7)', path: '/admin/dev-keys',    active: true },
    ],
  },
];

const PANEL_W   = 224;
const PANEL_W_C = 52;

export default function GeneralLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);
  const audio        = useLayoutAudio();
  const navigate     = useNavigate();
  const { pathname } = useLocation();

  const doCollapse = (val) => {
    setCollapsed(val);
    val ? audio.playCollapse() : audio.playExpand();
  };

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

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar ──────────────────────────────────────── */}
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
                  onClick={() => { navigate('/admin/settings/general'); audio.playNav(); }}
                  onMouseEnter={audio.playHover}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    color: 'var(--color-text-disabled, var(--color-text-muted, var(--color-text-secondary)))',
                    background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'color 150ms',
                  }}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-disabled, var(--color-text-muted, var(--color-text-secondary)))'}
                  title="Go Back"
                >
                  <LayoutGrid size={13} />
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    General
                  </span>
                </button>
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
                  <button onClick={() => doCollapse(true)} onMouseEnter={audio.playHover} style={collapseBtn} title="Collapse panel">
                    <ChevronLeft size={14} />
                  </button>
                </div>
              </>
            )}

            {collapsed && (
              <div style={{
                width: 28, height: 28, borderRadius: 7,
                background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <LayoutGrid size={13} color="white" />
              </div>
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
            {GROUPS.map((group, groupIndex) => (
              <div key={group.label}>
                {groupIndex > 0 && !collapsed && (
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />
                )}

                <p style={groupLabelStyle}>
                  {collapsed ? '·' : group.label}
                </p>

                {group.items.map((item) => {
                  const Icon     = item.icon;
                  const isActive = pathname === item.path;

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

          {/* ── Footer — expand trigger when collapsed ── */}
          {collapsed && (
            <div style={{
              padding: '10px 4px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}>
              <button
                onClick={() => doCollapse(false)}
                onMouseEnter={audio.playHover}
                title="Expand panel"
                style={{ ...collapseBtn, width: '100%', height: 32, borderRadius: 8 }}
              >
                <ChevronLeft size={14} style={{ transform: 'rotate(180deg)' }} />
              </button>
            </div>
          )}
        </aside>

        {/* ── Main content ───────────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {children}
        </main>

      </div>
    </div>
  );
}