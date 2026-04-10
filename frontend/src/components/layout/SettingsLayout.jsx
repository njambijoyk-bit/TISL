import {
  Globe, DollarSign, Palette, Shield,
  Bell, Mail, FileText, Phone, BookOpen, Home,
  Briefcase, BarChart2, Zap, HardDrive,Gift, 
  Tag, Users, Settings as SettingsIcon,
  FootprintsIcon,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const GROUPS = [
  {
    label: 'System',
    items: [
      { name: 'General',    icon: Globe,       bg: 'bg-blue-500',    path: '/admin/settings/general',          active: true  },
      { name: 'Currency',   icon: DollarSign,  bg: 'bg-emerald-500', path: '/admin/settings/currency',         active: true  },
    ],
  },
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
    label: 'Operations',
    items: [
      { name: 'Work', icon: Briefcase, bg: 'bg-purple-500', path: '/admin/work', active: true },
    ],
  },
  {
    label: 'People',
    items: [
      { name: 'User Management', icon: Users, bg: 'bg-rose-500', path: '/admin/settings/users', active: true },
      { name: 'Referral Codes',    icon: Gift,  bg: 'bg-purple-500', path: '/admin/referrals',    active: true },
      { name: 'Promo Codes',       icon: Tag,   bg: 'bg-violet-500', path: '/admin/promo-codes',  active: true },
    ],
  },
];

/**
 * Two-panel settings layout.
 *
 * Left panel  — settings nav (all groups + items).
 * Right panel — children (page content).
 *
 * Usage:
 *   <SettingsLayout>
 *     <YourPageContent />
 *   </SettingsLayout>
 */
export default function SettingsLayout({ children }) {
  const navigate  = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">

      <div className="flex flex-1 overflow-hidden">

        {/* ── Settings left panel ── */}
        <aside className="w-56 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-y-auto">
          {/* Panel title */}
          <div className="flex items-center gap-2 px-4 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
            <SettingsIcon size={14} className="text-gray-400 dark:text-gray-500" />
            <span className="text-[12px] font-bold tracking-widest uppercase text-gray-400 dark:text-gray-500">
              Settings
            </span>
          </div>

          {/* Groups */}
          <nav className="py-3 px-2">
            {GROUPS.map((group) => (
              <div key={group.label} className="mb-4">
                {/* Group label */}
                <p className="text-[10px] font-bold tracking-[0.1em] uppercase text-gray-400 dark:text-gray-600 px-2 mb-1">
                  {group.label}
                </p>

                {/* Items */}
                {group.items.map((item) => {
                  const Icon    = item.icon;
                  const isActive = pathname === item.path;

                  return (
                    <button
                      key={item.name}
                      onClick={() => item.active && navigate(item.path)}
                      className={[
                        'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left mb-0.5 transition-colors duration-100',
                        isActive
                          ? 'bg-gray-100 dark:bg-gray-800'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                        !item.active ? 'opacity-40 cursor-default' : 'cursor-pointer',
                      ].join(' ')}
                    >
                      {/* Icon square */}
                      <div className={`w-6 h-6 rounded-[6px] ${item.bg} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                        <Icon size={12} className="text-white" strokeWidth={2.2} />
                      </div>

                      {/* Label */}
                      <span className={[
                        'text-[13px] font-medium truncate',
                        isActive
                          ? 'text-gray-900 dark:text-white'
                          : 'text-gray-600 dark:text-gray-400',
                      ].join(' ')}>
                        {item.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>

    </div>
  );
}