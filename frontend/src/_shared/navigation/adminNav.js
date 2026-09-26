import {
  LayoutDashboard, ShoppingCart, DollarSign, FileText, CreditCard, Scale, NotebookPen,
  Package, Wrench, Tag, Award, Gift, Gavel, CalendarCheck,
  Users, Star, TicketPercent, Landmark, Receipt, BarChart2,
  LifeBuoy, IdCardLanyard, Newspaper, Bot, ClipboardList, GraduationCap,
  Truck, Boxes, Briefcase, AlertTriangle, Settings, Bug, FolderCode, FolderCog,
  Database, GitBranch,
} from 'lucide-react';
import { MODULES, isModuleActive } from './modules';
import { FINANCE_READ } from '../lib/roles';

/**
 * The admin navigation — the single source for the sidebar, the section tabs
 * at the top of a page, the Settings hub and the Ctrl+K quick-jump.
 *
 * Group:  { id, label, module?, roles?, ownerOnly?, items }
 * Item:   { id, title, icon, color, path, exact?, also?, roles?, module?,
 *           keywords?, tabs?, hideTabs? }
 * Tab:    { title, path, exact?, also?, roles?, module?, group?, soon?, icon?, color?, description? }
 *
 * - `path` must be a real route in App.jsx.
 * - `also` lists extra path prefixes that belong to the item (e.g. detail pages
 *   whose URL doesn't start with the item's path).
 * - `roles` is an allow-list; omitted = every admin role except drivers.
 * - `module` hides the group/item/tab when that module is off.
 * - `ownerOnly` = the platform owner's developer tools (super_admin for now).
 * - `hideTabs` keeps the tabs for search only (the page draws its own tabs).
 * - `soon` tabs appear on the Settings hub as "Soon" and nowhere else.
 */

const PAYMENTS_ROLES = ['admin', 'super_admin', 'finance'];
export const DRIVER_ROLE = 'driver';

export const ADMIN_NAV = [
  {
    id: 'home',
    label: null,
    items: [
      { id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, color: '#a855f7', path: '/admin', exact: true, roles: 'all' },
    ],
  },

  {
    id: 'sales',
    label: 'Sales',
    items: [
      { id: 'orders', title: 'Orders', icon: ShoppingCart, color: '#f97316', path: '/admin/orders', keywords: 'invoices shipping' },
      { id: 'payments', title: 'Payments', icon: DollarSign, color: '#10b981', path: '/admin/finance/payments', roles: PAYMENTS_ROLES, keywords: 'mpesa transactions' },
      {
        id: 'quotes', title: 'Quotes', icon: FileText, color: '#8b5cf6', path: '/admin/quotes', also: ['/admin/quote-requests'],
        tabs: [
          { title: 'Quotes', path: '/admin/quotes' },
          { title: 'Quote requests', path: '/admin/quote-requests' },
        ],
      },
      { id: 'credit', title: 'Credit accounts', icon: CreditCard, color: '#6366f1', path: '/admin/credit', keywords: 'store credit invoices' },
      { id: 'reconciliation', title: 'Reconciliation', icon: Scale, color: '#065f46', path: '/admin/reconciliation', keywords: 'stock count' },
      { id: 'financial-notes', title: 'Financial notes', icon: NotebookPen, color: '#0ea5e9', path: '/admin/financial-notes', keywords: 'credit note debit note' },
    ],
  },

  {
    id: 'catalogue',
    label: 'Catalogue',
    module: MODULES.ECOMMERCE,
    items: [
      {
        id: 'products', title: 'Products', icon: Package, color: '#a855f7', path: '/admin/products', keywords: 'variants stock',
        tabs: [
          { title: 'All products', path: '/admin/products' },
          { title: 'Bulk edit', path: '/admin/settings/general/bulk/products' },
        ],
      },
      {
        id: 'services', title: 'Services', icon: Wrench, color: '#10b981', path: '/admin/services', also: ['/admin/service-categories'],
        tabs: [
          { title: 'Services', path: '/admin/services' },
          { title: 'Service categories', path: '/admin/service-categories' },
        ],
      },
      { id: 'categories', title: 'Categories', icon: Tag, color: '#3b82f6', path: '/admin/categories' },
      { id: 'brands', title: 'Brands', icon: Award, color: '#f59e0b', path: '/admin/brands' },
      { id: 'hampers', title: 'Hampers', icon: Gift, color: '#fc7bf5', path: '/admin/hampers', module: MODULES.HAMPERS },
      {
        id: 'auctions', title: 'Auctions', icon: Gavel, color: '#ef4444', path: '/admin/auctions', also: ['/admin/auction-orders'], module: MODULES.AUCTIONS, keywords: 'bids',
        tabs: [
          { title: 'Auctions', path: '/admin/auctions' },
          { title: 'Auction orders', path: '/admin/auction-orders' },
        ],
      },
      {
        id: 'bookings', title: 'Bookings', icon: CalendarCheck, color: '#06b6d4', path: '/admin/bookings', also: ['/admin/settings/bookings'], module: MODULES.BOOKINGS, keywords: 'appointments worksheets',
        tabs: [
          { title: 'Bookings', path: '/admin/bookings' },
          { title: 'Booking settings', path: '/admin/settings/bookings' },
        ],
      },
    ],
  },

  {
    id: 'customers',
    label: 'Customers',
    items: [
      {
        id: 'customers', title: 'Customers', icon: Users, color: '#6366f1', path: '/admin/customers', keywords: 'crm clients',
        tabs: [
          { title: 'All customers', path: '/admin/customers' },
          { title: 'Bulk edit', path: '/admin/settings/general/bulk/customers' },
        ],
      },
      {
        id: 'loyalty', title: 'Loyalty', icon: Award, color: '#ec4899', path: '/admin/loyalty', keywords: 'points',
        tabs: [
          { title: 'Ledger', path: '/admin/loyalty' },
          { title: 'Loyalty settings', path: '/admin/loyalty/settings' },
        ],
      },
      {
        id: 'codes', title: 'Promo & referral codes', icon: TicketPercent, color: '#7c3aed', path: '/admin/promo-codes', also: ['/admin/referrals'], keywords: 'discount coupon',
        tabs: [
          { title: 'Promo codes', path: '/admin/promo-codes' },
          { title: 'Referral codes', path: '/admin/referrals' },
        ],
      },
      { id: 'reviews', title: 'Reviews', icon: Star, color: '#f59e0b', path: '/admin/reviews', keywords: 'ratings feedback' },
    ],
  },

  {
    id: 'finance',
    label: 'Tax & Finance',
    items: [
      { id: 'tax', title: 'Tax & Compliance', icon: Landmark, color: '#7c3aed', path: '/admin/tax', roles: FINANCE_READ, keywords: 'vat kra tax rates' },
      { id: 'withholding', title: 'Withholding & Compliance', icon: Receipt, color: '#0d9488', path: '/admin/withholding', roles: FINANCE_READ, keywords: 'wht certificates' },
      {
        id: 'reports', title: 'Reports', icon: BarChart2, color: '#22c55e', path: '/admin/reports', also: ['/admin/settings/analytics'],
        tabs: [
          { title: 'Reports', path: '/admin/reports' },
          { title: 'Site analytics', path: '/admin/settings/analytics' },
        ],
      },
    ],
  },

  {
    id: 'workplace',
    label: 'Workplace',
    items: [
      { id: 'tickets', title: 'Help desk', icon: LifeBuoy, color: '#ef4444', path: '/admin/tickets', keywords: 'tickets support' },
      {
        id: 'team', title: 'Team', icon: IdCardLanyard, color: '#eab308', path: '/admin/employees', keywords: 'employees staff',
        tabs: [
          { title: 'Employees', path: '/admin/employees' },
          { title: 'Bulk edit', path: '/admin/settings/general/bulk/employees' },
        ],
      },
      { id: 'publications', title: 'Publications', icon: Newspaper, color: '#a855f7', path: '/admin/settings/publications', keywords: 'blog news brochures' },
      {
        id: 'mimi', title: 'Mimi AI', icon: Bot, color: '#3b82f6', path: '/admin/ai-analytics', module: MODULES.MIMI, keywords: 'ai assistant chatbot',
        tabs: [
          { title: 'AI settings', path: '/admin/ai-analytics', exact: true },
          { title: 'Keys', path: '/admin/ai-analytics/keys' },
          { title: 'Modules', path: '/admin/ai-analytics/modules' },
          { title: 'Sessions', path: '/admin/ai-analytics/sessions' },
          { title: 'Mimi', path: '/admin/ai-analytics/mimi', also: ['/admin/ai-analytics/mimi-sessions', '/admin/ai-analytics/mimi-eligibility', '/admin/ai-analytics/mimi-harmful'] },
        ],
      },
    ],
  },

  {
    id: 'projects',
    label: 'Projects',
    module: MODULES.PROJECTS,
    items: [
      {
        id: 'projects', title: 'Projects', icon: ClipboardList, color: '#14b8a6', path: '/admin/projects', keywords: 'milestones tasks',
        tabs: [
          { title: 'Overview', path: '/admin/projects', exact: true },
          { title: 'All projects', path: '/admin/projects/list' },
          { title: 'New project', path: '/admin/projects/create' },
        ],
      },
    ],
  },

  {
    id: 'careers',
    label: 'Careers',
    module: MODULES.CAREERS,
    items: [
      {
        id: 'careers', title: 'Careers', icon: GraduationCap, color: '#6366f1', path: '/admin/careers', keywords: 'jobs ats applicants recruitment',
        hideTabs: true, // the careers pages draw their own tab bar
        tabs: [
          { title: 'Overview', path: '/admin/careers', exact: true },
          { title: 'Jobs', path: '/admin/careers/jobs' },
          { title: 'Applications', path: '/admin/careers/applications' },
          { title: 'Applicants', path: '/admin/careers/applicants' },
        ],
      },
    ],
  },

  {
    id: 'operations',
    label: 'Operations',
    module: MODULES.EXTRAS,
    items: [
      {
        id: 'delivery', title: 'Delivery', icon: Truck, color: '#f97316', path: '/admin/delivery', keywords: 'manifests drivers logistics',
        tabs: [
          { title: 'Overview', path: '/admin/delivery', exact: true },
          { title: 'Manifests', path: '/admin/delivery/manifests' },
          { title: 'Drivers', path: '/admin/delivery/drivers' },
          { title: 'Incidents', path: '/admin/delivery/incidents' },
          { title: 'Ratings', path: '/admin/delivery/ratings' },
          { title: 'Insights', path: '/admin/delivery/insights' },
          { title: 'Reports', path: '/admin/delivery/reports' },
        ],
      },
      { id: 'inventory', title: 'Inventory', icon: Boxes, color: '#c2410c', path: '/admin/inventory', keywords: 'stock warehouse' },
      { id: 'work', title: 'Work board', icon: Briefcase, color: '#ec4899', path: '/admin/work', keywords: 'assignments team load deadlines' },
    ],
  },

  {
    id: 'driver',
    label: 'My deliveries',
    module: MODULES.EXTRAS,
    roles: [DRIVER_ROLE],
    items: [
      { id: 'driver-manifests', title: 'My manifests', icon: FileText, color: '#3b82f6', path: '/driver/manifests', roles: [DRIVER_ROLE] },
      { id: 'driver-ratings', title: 'My ratings', icon: Star, color: '#ec4899', path: '/driver/ratings', roles: [DRIVER_ROLE] },
      { id: 'driver-incidents', title: 'My incidents', icon: AlertTriangle, color: '#f59e0b', path: '/driver/incidents', roles: [DRIVER_ROLE] },
    ],
  },

  {
    id: 'system',
    label: 'System',
    items: [
      {
        id: 'settings', title: 'Settings', icon: Settings, color: '#64748b', path: '/admin/settings', keywords: 'configuration',
        tabs: [
          { group: 'System', title: 'Overview', path: '/admin/settings', exact: true, description: 'Every setting in one place' },
          { group: 'System', title: 'General', path: '/admin/settings/general', description: 'Business details and defaults' },
          { group: 'System', title: 'Currency', path: '/admin/settings/currency', description: 'Currencies and exchange rates' },
          { group: 'System', title: 'Units', path: '/admin/settings/units', description: 'Units of measure' },
          { group: 'System', title: 'Customer tiers', path: '/admin/settings/customer-tiers', description: 'Tiers and their discounts' },
          { group: 'System', title: 'Shipping', path: '/admin/settings/shipping', description: 'Zones and delivery fees' },
          { group: 'Content', title: 'About', path: '/admin/settings/content/about' },
          { group: 'Content', title: 'Contact', path: '/admin/settings/content/contact' },
          { group: 'Content', title: 'Manual', path: '/admin/settings/content/manual' },
          { group: 'Content', title: 'Homepage', path: '/admin/settings/content/homepage' },
          { group: 'Content', title: 'Footer', path: '/admin/settings/content/footer' },
          { group: 'Content', title: 'Policies', path: '/admin/settings/policy', description: 'Terms, privacy, returns' },
          { group: 'Access', title: 'Users & roles', path: '/admin/users', description: 'Staff accounts and their roles' },
          { group: 'Platform', title: 'Algorithm', path: '/admin/algorithm', module: MODULES.EXTRAS, description: 'Ranking, pins and catalogue boosts' },
          { group: 'Platform', title: 'Vault', path: '/admin/vault', description: 'Stored documents and secrets' },
          { group: 'Platform', title: 'Activity logs', path: '/admin/logs', description: 'Who changed what, and exports' },
          { group: 'Platform', title: 'Themes', path: '/admin/settings/themes', soon: true, description: 'Colours for the store and admin' },
          { group: 'Platform', title: 'Navigation', path: '/admin/settings/navigation', soon: true, description: 'Storefront menu and links' },
          { group: 'Platform', title: 'Modules', path: '/admin/settings/modules', soon: true, description: 'Module Center and license keys' },
        ],
      },
    ],
  },

  {
    id: 'developer',
    label: 'Developer',
    ownerOnly: true,
    items: [
      { id: 'bug-reports', title: 'Bug reports', icon: Bug, color: '#c2410c', path: '/admin/bug-reports', ownerOnly: true },
      { id: 'dev-notes', title: 'Dev notes', icon: FolderCode, color: '#3b82f6', path: '/admin/dev-notes', ownerOnly: true },
      { id: 'dev-keys', title: 'Dev keys', icon: FolderCog, color: '#7c3aed', path: '/admin/dev-keys', ownerOnly: true },
      { id: 'data-engine', title: 'Data Engine', icon: Database, color: '#10b981', path: '/admin/data-engine', ownerOnly: true },
      {
        id: 'flowcharts', title: 'Flowcharts', icon: GitBranch, color: '#ec4899', path: '/admin/flowchart/orders', also: ['/admin/flowchart'], ownerOnly: true,
        tabs: [
          { title: 'Orders', path: '/admin/flowchart/orders' },
          { title: 'Customers', path: '/admin/flowchart/customers' },
          { title: 'Transactions', path: '/admin/flowchart/transactions' },
        ],
      },
    ],
  },
];

// ─── Access ──────────────────────────────────────────────────────────────────

/** The platform owner. Until owner accounts exist, that's super_admin. */
export const isOwner = (user) => user?.role === 'super_admin';

function allowed(entry, user) {
  const role = user?.role;
  if (entry.ownerOnly && !isOwner(user)) return false;
  if (entry.module && !isModuleActive(entry.module)) return false;
  if (entry.roles === 'all') return true;
  if (Array.isArray(entry.roles)) return entry.roles.includes(role);
  return role !== DRIVER_ROLE; // default: every admin role except drivers
}

/**
 * The navigation this user may see: groups, items and tabs filtered by role,
 * module and owner flag. Empty groups are dropped. `soon` tabs are kept (the
 * Settings hub shows them) — use `liveTabs()` for anything clickable.
 */
export function visibleNav(user) {
  return ADMIN_NAV
    .filter((g) => allowed({ ...g, roles: g.roles ?? 'all' }, user))
    .map((g) => ({
      ...g,
      items: g.items
        .filter((i) => allowed(i, user))
        .map((i) => (i.tabs ? { ...i, tabs: i.tabs.filter((t) => allowed({ ...t, roles: t.roles ?? 'all' }, user)) } : i)),
    }))
    .filter((g) => g.items.length > 0);
}

export const liveTabs = (item) => (item?.tabs ?? []).filter((t) => !t.soon);

// ─── Matching ────────────────────────────────────────────────────────────────

/** Does `pathname` sit at or under `path`? Segment-aware: /admin/quotes ≠ /admin/quote-requests. */
export function pathMatches(pathname, path, exact = false) {
  if (pathname === path) return true;
  if (exact) return false;
  return pathname.startsWith(path.endsWith('/') ? path : `${path}/`);
}

/**
 * Which item (and tab) the current page belongs to. The longest matching path
 * wins, so /admin/settings/general/bulk/products belongs to Products, not
 * Settings. Returns { item, tab } or { item: null, tab: null }.
 */
export function findActive(nav, pathname) {
  let best = { item: null, tab: null, len: -1 };
  const consider = (item, tab, path, exact) => {
    if (!pathMatches(pathname, path, exact)) return;
    // Longer wins; on a tie within the same item, prefer the tab (so the tab lights up)
    const tieToTab = path.length === best.len && tab && best.item === item && !best.tab;
    if (path.length > best.len || tieToTab) best = { item, tab, len: path.length };
  };

  for (const g of nav) {
    for (const item of g.items) {
      consider(item, null, item.path, item.exact);
      (item.also ?? []).forEach((p) => consider(item, null, p, false));
      for (const tab of liveTabs(item)) {
        consider(item, tab, tab.path, tab.exact);
        (tab.also ?? []).forEach((p) => consider(item, tab, p, false));
      }
    }
  }
  return { item: best.item, tab: best.tab };
}

/** Every place Ctrl+K can jump to: items, then their tabs. */
export function searchEntries(nav) {
  const out = [];
  for (const g of nav) {
    for (const item of g.items) {
      out.push({ key: item.id, title: item.title, section: g.label, path: item.path, icon: item.icon, color: item.color, keywords: item.keywords ?? '' });
      for (const tab of liveTabs(item)) {
        if (tab.path === item.path) continue;
        out.push({ key: `${item.id}:${tab.path}`, title: tab.title, parent: item.title, section: g.label, path: tab.path, icon: item.icon, color: item.color, keywords: `${item.title} ${item.keywords ?? ''} ${tab.group ?? ''}` });
      }
    }
  }
  return out;
}
