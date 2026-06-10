// pages/admin/general/GeneralLayout.jsx
import {
  Package, Tags, Folder, ChevronRight,
  LayoutGrid, Users, Briefcase,
  FolderGit2Icon, LucideBadgeDollarSign,
  LucideBinary, KeyRound, Activity, Blocks, Bot,
  BugIcon,
  FolderCodeIcon,
  FolderCog,
  BrainCircuit,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import SettingsLayout from '../../../components/layout/SettingsLayout';

const GROUPS = [
  {
    label: 'Catalog',
    items: [
      {
        name: 'Products',
        icon: Package,
        bg: 'linear-gradient(135deg,#7c3aed,#a855f7)',
        color: '#a855f7',
        path: '/admin/settings/general/bulk/products',
        active: true,
      },
      {
        name: 'Brands',
        icon: Tags,
        bg: 'linear-gradient(135deg,#ec4899,#f472b6)',
        color: '#f472b6',
        path: '/admin/settings/general/bulk/brands',
        active: false,
      },
      {
        name: 'Categories',
        icon: Folder,
        bg: 'linear-gradient(135deg,#10b981,#34d399)',
        color: '#34d399',
        path: '/admin/settings/general/bulk/categories',
        active: false,
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        name: 'Customers',
        icon: Users,
        bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)',
        color: '#60a5fa',
        path: '/admin/settings/general/bulk/customers',
        active: true,
      },
      {
        name: 'Employees',
        icon: Briefcase,
        bg: 'linear-gradient(135deg,#f59e0b,#fbbf24)',
        color: '#fbbf24',
        path: '/admin/settings/general/bulk/employees',
        active: true,
      },
    ],
  },
  {
    label: 'AI',
    items: [
      {
        name: 'AI Analytics',
        icon: BrainCircuit,
        bg: 'linear-gradient(135deg,#7c3aed,#a855f7)',
        color: '#a855f7',
        path: '/admin/ai-analytics',
        active: true,
      },
      {
        name: 'AI Keys',
        icon: KeyRound,
        bg: 'linear-gradient(135deg,#0ea5e9,#38bdf8)',
        color: '#38bdf8',
        path: '/admin/ai-analytics/keys',
        active: true,
      },
      {
        name: 'AI Sessions',
        icon: Activity,
        bg: 'linear-gradient(135deg,#10b981,#34d399)',
        color: '#34d399',
        path: '/admin/ai-analytics/sessions',
        active: true,
      },
      {
        name: 'AI Modules',
        icon: Blocks,
        bg: 'linear-gradient(135deg,#ec4899,#f472b6)',
        color: '#f472b6',
        path: '/admin/ai-analytics/modules',
        active: true,
      },
      {
        name: 'Mimi Bot',
        icon: Bot,
        bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)',
        color: '#60a5fa',
        path: '/admin/ai-analytics/mimi',
        active: true,
      },
    ],
  },
  {
    label: 'FlowCharts',
    items: [
      {
        name: 'Orders',
        icon: FolderGit2Icon,
        bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)',
        color: '#60a5fa',
        path: '/admin/flowchart/orders',
        active: true,
      },
      {
        name: 'Customers',
        icon: LucideBinary,
        bg: 'linear-gradient(135deg,#ec4899,#f472b6)',
        color: '#f472b6',
        path: '/admin/flowchart/customers',
        active: true,
      },
      {
        name: 'Transactions',
        icon: LucideBadgeDollarSign,
        bg: 'linear-gradient(135deg,#10b981,#34d399)',
        color: '#34d399',
        path: '/admin/flowchart/transactions',
        active: true,
      },
    ],
  },
  {
    label: 'System Bugs',
    items: [
      {
        name: 'Bug Reports',
        icon: BugIcon,
        bg: 'linear-gradient(135deg,#c2410c,#ea580c)',
        color: '#ea580c ',
        path: '/admin/bug-reports',
        active: true,
      },
      {
        name: 'Dev Notes',
        icon: FolderCodeIcon,
        bg: 'linear-gradient(135deg,#3b82f6,#60a5fa)',
        color: '#60a5fa',
        path: '/admin/dev-notes',
        active: true,
      },
      {
        name: 'Dev Keys',
        icon: FolderCog,
        bg: 'linear-gradient(135deg,#7c3aed,#a855f7)',
        color: '#a855f7',
        path: '/admin/dev-keys',
        active: true,
      },
    ],
  },
];

// ── Reusable Setting Row ──────────────────────────────────────────────────
const SettingRow = ({ item, onClick, isLast }) => {
  const Icon = item.icon;

  return (
    <button
      onClick={() => item.active && onClick(item.path)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '14px 18px',
        background: 'transparent',
        border: 'none',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
        cursor: item.active ? 'pointer' : 'default',
        opacity: item.active ? 1 : 0.4,
        fontFamily: 'inherit',
        transition: 'background 150ms',
        textAlign: 'left',
      }}
      onMouseEnter={e => {
        if (item.active) e.currentTarget.style.background = 'rgba(168,85,247,0.08)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      {/* Gradient Icon Square */}
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: item.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }}>
        <Icon size={16} color="white" strokeWidth={2.2} />
      </div>

      {/* Label */}
      <span style={{
        flex: 1,
        fontSize: '0.88rem',
        fontWeight: 600,
        color: item.color,
      }}>
        {item.name}
      </span>

      {/* Badge or Arrow */}
      {!item.active ? (
        <span style={{
          fontSize: '0.6rem', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--color-text-muted, var(--color-text-secondary, var(--color-text)))',
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '2px 7px', borderRadius: 20,
        }}>
          Soon
        </span>
      ) : (
        <ChevronRight size={13} strokeWidth={2.5} color="rgba(255,255,255,0.15)" />
      )}
    </button>
  );
};

// ── Group Card ────────────────────────────────────────────────────────────
const GroupCard = ({ group, onNavigate }) => (
  <div>
    <p style={{
      fontSize: '0.6rem', fontWeight: 700,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      color: '#a855f7',
      padding: '0 2px 8px',
      margin: 0, userSelect: 'none',
    }}>
      {group.label}
    </p>
    <div style={{
      background: 'var(--color-bg-elevated, var(--color-bg))',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    }}>
      {group.items.map((item, i) => (
        <SettingRow
          key={item.name}
          item={item}
          onClick={onNavigate}
          isLast={i === group.items.length - 1}
        />
      ))}
    </div>
  </div>
);

// ── Main Layout ───────────────────────────────────────────────────────────
export default function GeneralLayout() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1 }}>
        {/* Main admin sidebar */}
        <SettingsLayout />

        {/* Content area */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 32px' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(168,85,247,0.3)',
              }}>
                <LayoutGrid size={16} color="white" strokeWidth={2} />
              </div>
              <h1 style={{
                margin: 0,
                fontSize: '1.6rem', fontWeight: 800,
                letterSpacing: '-0.02em',
                color: '#a855f7',
              }}>
                General
              </h1>
            </div>

            {/* Group cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px' }}>
              {GROUPS.map(group => (
                <GroupCard key={group.label} group={group} onNavigate={navigate} />
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}