import {
  Globe,
  DollarSign,
  Palette,
  Shield,
  Bell,
  Mail,
  FileText,
  Phone,
  BookOpen,
  Home,
  Gift, 
  Tag,
  Briefcase,
  BarChart2,
  Zap,
  HardDrive,
  Users,
  ChevronRight,
  Settings as SettingsIcon,
  Trash2,
  FootprintsIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../../../components/layout/Header';
import Footer from '../../../components/layout/Footer';
import Sidebar from '../../../components/layout/Sidebar';

// ─── Full settings hierarchy ─────────────────────────────────────────────────
const GROUPS = [
  {
    label: 'Content',
    items: [
      { name: 'About',    icon: FileText,    bg: 'bg-sky-500',    path: '/admin/settings/content/about',    active: true },
      { name: 'Contact',  icon: Phone,       bg: 'bg-teal-500',   path: '/admin/settings/content/contact',  active: true },
      { name: 'Manual',   icon: BookOpen,    bg: 'bg-indigo-500', path: '/admin/settings/content/manual',   active: true },
      { name: 'Homepage', icon: Home,        bg: 'bg-green-500',  path: '/admin/settings/content/homepage', active: true },
      { name: 'Footer',   icon: FootprintsIcon, bg: 'bg-slate-500',  path: '/admin/settings/content/footer',   active: true },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'General',    icon: Globe,       bg: 'bg-blue-500',    path: '/admin/settings/general',          active: true  },
      { name: 'Currency',   icon: DollarSign,  bg: 'bg-emerald-500', path: '/admin/settings/currency',         active: true  },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Work', icon: Briefcase, bg: 'bg-purple-500', path: '/admin/work', active: true },
    ],
  },
  {
    label: 'People',
    items: [
      { name: 'User Management', icon: Users, bg: 'bg-rose-500', path: '/admin/users', active: true },
      { name: 'Referral Codes',    icon: Gift,  bg: 'bg-purple-500', path: '/admin/referrals',    active: true },
      { name: 'Promo Codes',       icon: Tag,   bg: 'bg-violet-500', path: '/admin/promo-codes',  active: true },
    ],
  },
];

// ─── Single item row ──────────────────────────────────────────────────────────
const SettingRow = ({ item, onClick }) => {
  const Icon = item.icon;
  return (
    <button
      onClick={() => item.active && onClick(item.path)}
      className={[
        'group w-full flex items-center gap-3.5 px-4 py-3',
        'border-b border-gray-100 dark:border-gray-800 last:border-0',
        'transition-colors duration-100',
        item.active
          ? 'hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer'
          : 'cursor-default opacity-40',
      ].join(' ')}
    >
      {/* Rounded-square icon — Apple style */}
      <div className={[
        'w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0 shadow-sm',
        item.bg,
      ].join(' ')}>
        <Icon size={15} className="text-white" strokeWidth={2.2} />
      </div>

      {/* Label */}
      <span className="flex-1 text-[14px] font-medium text-gray-800 dark:text-gray-200 text-left">
        {item.name}
      </span>

      {/* Coming soon pill OR chevron */}
      {!item.active ? (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">
          Soon
        </span>
      ) : (
        <ChevronRight
          size={14}
          strokeWidth={2.5}
          className="text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500 transition-colors flex-shrink-0"
        />
      )}
    </button>
  );
};

// ─── Group card ───────────────────────────────────────────────────────────────
const GroupCard = ({ group, onNavigate }) => (
  <div className="flex flex-col">
    <p className="text-[11px] font-bold tracking-[0.08em] uppercase text-gray-400 dark:text-gray-500 mb-2 px-1">
      {group.label}
    </p>
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
      {group.items.map((item) => (
        <SettingRow key={item.name} item={item} onClick={onNavigate} />
      ))}
    </div>
  </div>
);

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Settings() {
  const navigate = useNavigate();

  const leftGroups  = GROUPS.filter((_, i) => i % 2 === 0); // System, Content, Platform
  const rightGroups = GROUPS.filter((_, i) => i % 2 !== 0); // Communication, Operations, People

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <Header />

      <div className="flex flex-1">
        <Sidebar />

        <div className="flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-8 py-10">

            {/* Page title */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-9 h-9 rounded-[10px] bg-gray-800 dark:bg-gray-700 flex items-center justify-center shadow-sm">
                <SettingsIcon size={17} className="text-white" strokeWidth={2} />
              </div>
              <h1 className="text-[28px] font-bold text-gray-900 dark:text-white tracking-tight">
                Settings
              </h1>
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-2 gap-x-5 gap-y-6">
              <div className="flex flex-col gap-6">
                {leftGroups.map((group) => (
                  <GroupCard key={group.label} group={group} onNavigate={navigate} />
                ))}
              </div>
              <div className="flex flex-col gap-6">
                {rightGroups.map((group) => (
                  <GroupCard key={group.label} group={group} onNavigate={navigate} />
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}