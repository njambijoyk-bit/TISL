import {
  Globe, DollarSign, FileText, Phone, BookOpen, Home, Crown,
  Briefcase, Gift, Tag, Users, ChevronRight, GraduationCap,
  UserCheck, Settings as SettingsIcon, FootprintsIcon, Truck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../../components/layout/Sidebar';

const GROUPS = [
  {
    label: 'Content',
    items: [
      { name: 'About',    icon: FileText,       bg: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', color: '#3b82f6', path: '/admin/settings/content/about',    active: true },
      { name: 'Contact',  icon: Phone,          bg: 'linear-gradient(135deg,#c2410c,#f97316)', color: '#f97316', path: '/admin/settings/content/contact',  active: true },
      { name: 'Manual',   icon: BookOpen,       bg: 'linear-gradient(135deg,#6d28d9,#a855f7)', color: '#a855f7', path: '/admin/settings/content/manual',   active: true },
      { name: 'Homepage', icon: Home,           bg: 'linear-gradient(135deg,#15803d,#22c55e)', color: '#22c55e', path: '/admin/settings/content/homepage', active: true },
      { name: 'Footer',   icon: FootprintsIcon, bg: 'linear-gradient(135deg,#b45309,#f59e0b)', color: '#f59e0b', path: '/admin/settings/content/footer',   active: true },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'General',  icon: Globe,      bg: 'linear-gradient(135deg,#0e7490,#06b6d4)', color: '#06b6d4', path: '/admin/settings/general',  active: true },
      { name: 'Currency', icon: DollarSign, bg: 'linear-gradient(135deg,#065f46,#10b981)', color: '#10b981', path: '/admin/settings/currency', active: true },
      { name: 'Customer Tiers',icon: Crown, bg: 'linear-gradient(135deg,#ec4899,#f472b6)', color: '#f472b6', path: '/admin/settings/customer-tiers',   active: true },
      { name: 'Shipping', icon: Truck,      bg: 'linear-gradient(135deg,#f97316,#fb923c)', color: '#fb923c', path: '/admin/settings/shipping', active: true },
      
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Work', icon: Briefcase,         bg: 'linear-gradient(135deg,#9d174d,#ec4899)', color: '#ec4899', path: '/admin/work', active: true },
      { name: 'Careers', icon: GraduationCap,  bg: 'linear-gradient(135deg,#4338ca,#6366f1)', color: '#6366f1', path: '/admin/careers/jobs', active: true },
      { name: 'Publications', icon: FileText,  bg: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#a855f7', path: '/admin/publications', active: true },
    ],
  },
  {
    label: 'People & Promos',
    items: [
      { name: 'Employee Management', icon: UserCheck,   bg: 'linear-gradient(135deg,#854d0e,#eab308)', color: '#eab308', path: '/admin/employees',   active: true },
      { name: 'User Management',     icon: Users, bg: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', color: '#3b82f6', path: '/admin/users',       active: true },
      { name: 'Referral Codes',      icon: Gift,  bg: 'linear-gradient(135deg,#ec4899,#f472b6)', color: '#f472b6', path: '/admin/referrals',   active: true },
      { name: 'Promo Codes',         icon: Tag,   bg: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#a78bfa', path: '/admin/promo-codes', active: true },
    ],
  },
];

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
      <div style={{
        width: 36, height: 36, borderRadius: 9,
        background: item.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }}>
        <Icon size={16} color="white" strokeWidth={2.2} />
      </div>

      <span style={{
        flex: 1,
        fontSize: '0.88rem',
        fontWeight: 600,
        color: item.color,
      }}>
        {item.name}
      </span>

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

export default function Settings() {
  const navigate = useNavigate();

  const leftGroups  = GROUPS.filter((_, i) => i % 2 === 0);
  const rightGroups = GROUPS.filter((_, i) => i % 2 !== 0);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1 }}>
        <Sidebar />

        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 32px' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(168,85,247,0.3)',
              }}>
                <SettingsIcon size={16} color="white" strokeWidth={2} />
              </div>
              <h1 style={{
                margin: 0,
                fontSize: '1.6rem', fontWeight: 800,
                letterSpacing: '-0.02em',
                color: '#a855f7',
              }}>
                Settings
              </h1>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '20px 20px',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {leftGroups.map(group => (
                  <GroupCard key={group.label} group={group} onNavigate={navigate} />
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {rightGroups.map(group => (
                  <GroupCard key={group.label} group={group} onNavigate={navigate} />
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}