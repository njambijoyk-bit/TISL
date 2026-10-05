import {
  LayoutDashboard, ShoppingCart, DollarSign, FileText, CreditCard, NotebookPen,
  Package, PackagePlus, Wrench, Award, Gift, Gavel, CalendarCheck,
  Users, Star, TicketPercent, Landmark, Receipt, BarChart2,
  LifeBuoy, IdCardLanyard, Newspaper, Bot, ClipboardList, GraduationCap,
  Truck, Boxes, AlertTriangle, Settings, Bug, FolderCode, FolderCog,
  GitBranch, BookOpen, Banknote, ListTree, TrendingUp, UserCircle,
} from 'lucide-react';
import { MODULES, isModuleActive } from './modules';
import { FINANCE_READ, PAYROLL_ROLES } from '../lib/roles';

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
      { id: 'dashboard', title: 'Dashboard', icon: LayoutDashboard, color: 'var(--color-primary-500)', path: '/admin', exact: true },
    ],
  },

  {
    id: 'sales',
    label: 'Sales',
    items: [
      { id: 'orders', title: 'Orders', icon: ShoppingCart, color: '#f97316', path: '/admin/orders', keywords: 'invoices shipping' },
      { id: 'payments', title: 'Payments', icon: DollarSign, color: '#10b981', path: '/admin/finance/payments', roles: PAYMENTS_ROLES, keywords: 'mpesa transactions' },
      {
        id: 'quotes', title: 'Quotes', icon: FileText, color: 'var(--color-primary-400)', path: '/admin/quotes',
      },
      { id: 'credit', title: 'Credit accounts', icon: CreditCard, color: '#6366f1', path: '/admin/credit', keywords: 'gift voucher invoices' },
    ],
  },

  {
    id: 'catalogue',
    label: 'Catalogue',
    // no module on the group: Purchases (and Bookings, when rebuilt) are Core. Products, services, hampers and auctions carry the E-commerce module themselves.
    items: [
      {
        id: 'products', title: 'Products', icon: Package, color: 'var(--color-primary-500)', path: '/admin/products', module: MODULES.ECOMMERCE,
        keywords: 'variants stock categories brands', also: ['/admin/categories', '/admin/brands'],
        tabs: [
          { title: 'All products', path: '/admin/products' },
          { title: 'Categories', path: '/admin/categories' },
          { title: 'Brands', path: '/admin/brands' },
          { title: 'Bulk edit', path: '/admin/settings/general/bulk/products' },
        ],
      },
      {
        id: 'purchases', title: 'Purchases', icon: PackagePlus, color: '#0ea5e9', path: '/admin/purchases', roles: FINANCE_READ,
        keywords: 'buy stock supplier vendor creditor receive batch expiry expired opening stock write off recall quarantine transfer branch count journal job work in progress wip', also: ['/admin/vendors', '/admin/stock/opening', '/admin/stock/expiry', '/admin/stock/held', '/admin/stock/transfers', '/admin/stock/counts', '/admin/stock/journal', '/admin/stock/reports', '/admin/stock/jobs'],
        tabs: [
          { title: 'Purchases', path: '/admin/purchases', exact: true },
          { title: 'Vendors', path: '/admin/vendors' },
          { title: 'Opening stock', path: '/admin/stock/opening' },
          { title: 'Expiring stock', path: '/admin/stock/expiry' },
          { title: 'Held stock', path: '/admin/stock/held' },
          { title: 'Transfers', path: '/admin/stock/transfers' },
          { title: 'Stock counts', path: '/admin/stock/counts' },
          { title: 'Stock reports', path: '/admin/stock/reports' },
          { title: 'Stock journal', path: '/admin/stock/journal' },
          { title: 'Jobs in progress', path: '/admin/stock/jobs' },
        ],
      },
      {
        id: 'services', title: 'Services', icon: Wrench, color: '#10b981', path: '/admin/services', module: MODULES.ECOMMERCE, also: ['/admin/service-categories', '/admin/service-settings'],
        tabs: [
          { title: 'Services', path: '/admin/services' },
          { title: 'Service categories', path: '/admin/service-categories' },
          { title: 'Service settings', path: '/admin/service-settings' },
        ],
      },
      { id: 'hampers', title: 'Hampers', icon: Gift, color: '#fc7bf5', path: '/admin/hampers', module: MODULES.HAMPERS },
      {
        id: 'auctions', title: 'Auctions', icon: Gavel, color: '#ef4444', path: '/admin/auctions', module: MODULES.AUCTIONS, keywords: 'bids',
        tabs: [
          { title: 'Auctions', path: '/admin/auctions' },
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
        id: 'codes', title: 'Promo & referral codes', icon: TicketPercent, color: 'var(--color-primary-600)', path: '/admin/promo-codes', also: ['/admin/referrals'], keywords: 'discount coupon',
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
      {
        id: 'books', title: 'Books', icon: BookOpen, color: '#6366f1', path: '/admin/books', also: ['/admin/books/vouchers'], roles: FINANCE_READ,
        keywords: 'vouchers ledgers accounts invoice sales purchase journal receipt payment day book trial balance profit loss mail email whatsapp send documents',
        tabs: [
          { title: 'Overview', path: '/admin/books', exact: true },
          { title: 'Vouchers', path: '/admin/books?tab=vouchers', also: ['/admin/books/vouchers'] },
          { title: 'Gift vouchers', path: '/admin/books?tab=gifts' },
          { title: 'Mail', path: '/admin/books?tab=mail' },
          { title: 'Edit log', path: '/admin/books/edit-log' },
          { title: 'Settings', path: '/admin/books?tab=settings' },
        ],
      },
      { id: 'accounts', title: 'Chart of accounts', icon: ListTree, color: '#7c3aed', path: '/admin/books?tab=accounts', roles: FINANCE_READ, keywords: 'ledgers groups accounts chart' },
      {
        id: 'cash-bank', title: 'Cash & bank', icon: Banknote, color: '#0d9488', path: '/admin/books/cash', roles: FINANCE_READ, keywords: 'till cash count cheque deposit bounce bank driver cash on delivery',
        tabs: [
          { title: 'Cash', path: '/admin/books/cash' },
          { title: 'Cheques', path: '/admin/books/cheques' },
          { title: 'Petty cash', path: '/admin/petty-cash' },
        ],
      },
      { id: 'petty-cash', title: 'Petty cash', icon: Banknote, color: '#0d9488', path: '/admin/petty-cash', keywords: 'petty cash float custodian receipts' },
      { id: 'memoranda', title: 'Memoranda', icon: NotebookPen, color: '#0ea5e9', path: '/admin/books/memoranda', keywords: 'memorandum memo notes expected agreed journal' },
      { id: 'tax', title: 'Tax & Compliance', icon: Landmark, color: 'var(--color-primary-600)', path: '/admin/tax', roles: FINANCE_READ, keywords: 'vat kra tax rates' },
      { id: 'withholding', title: 'Withholding & Compliance', icon: Receipt, color: '#0d9488', path: '/admin/withholding', roles: FINANCE_READ, keywords: 'wht certificates' },
      { id: 'verification', title: 'Verification', icon: ClipboardList, color: '#0ea5e9', path: '/admin/verification', keywords: 'verify vouchers check audit register observation query' },
      { id: 'reports', title: 'Reports', icon: BarChart2, color: '#22c55e', path: '/admin/books?tab=reports', roles: FINANCE_READ, keywords: 'day book trial balance profit loss balance sheet ageing receivables payables tax' },
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
      {
        id: 'calendar', title: 'Calendar', icon: CalendarCheck, color: '#10b981', path: '/admin/calendar', also: ['/admin/bookings'], keywords: 'schedule bookings staff availability google ics appointments',
        tabs: [
          { title: 'My calendar', path: '/admin/calendar', exact: true },
          { title: 'Team calendar', path: '/admin/calendar/team', roles: ['admin', 'super_admin', 'manager'] },
          { title: 'Bookings', path: '/admin/bookings' },
          { title: 'Staff & resources', path: '/admin/resources', roles: ['admin', 'super_admin', 'manager'] },
        ],
      },
      { id: 'assets', title: 'Assets', icon: Boxes, color: '#c2410c', path: '/admin/assets', also: ['/admin/inventory'], keywords: 'furniture equipment laptops issued loaned repairs depreciation register' },
      { id: 'analytics', title: 'Site analytics', icon: TrendingUp, color: '#0ea5e9', path: '/admin/settings/analytics', keywords: 'visitors traffic' },
      { id: 'my-payslips', title: 'My payslips', icon: Banknote, color: '#16a34a', path: '/admin/my-payslips', keywords: 'salary pay slip wages my pay' },
      { id: 'attendance', title: 'Attendance', icon: IdCardLanyard, color: '#eab308', path: '/admin/attendance', keywords: 'sign in clock staff present absent late verify dispute' },
      {
        id: 'payroll', title: 'Payroll', icon: Banknote, color: '#16a34a', path: '/admin/payroll', roles: PAYROLL_ROLES, keywords: 'salary payslip paye nssf deductions wages',
        tabs: [
          { title: 'Runs', path: '/admin/payroll', exact: true },
          { title: 'Gratuity', path: '/admin/payroll/gratuity' },
          { title: 'Settings', path: '/admin/payroll/settings' },
        ],
      },
      { id: 'publications', title: 'Publications', icon: Newspaper, color: 'var(--color-primary-500)', path: '/admin/settings/publications', keywords: 'blog news brochures' },
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
    id: 'menus',
    label: 'Menus',
    module: MODULES.MENUS,
    items: [
      {
        id: 'recipes', title: 'Recipes', icon: ClipboardList, color: '#f59e0b', path: '/admin/menus/recipes', keywords: 'recipe ingredients manufacture production made to order dish',
        tabs: [{ title: 'Recipes & production', path: '/admin/menus/recipes' }],
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
    ],
  },

  {
    id: 'driver',
    label: 'My deliveries',
    module: MODULES.EXTRAS,
    roles: [DRIVER_ROLE],
    items: [
      { id: 'driver-profile', title: 'My profile', icon: UserCircle, color: '#8b5cf6', path: '/driver/profile', roles: [DRIVER_ROLE] },
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
          { group: 'System', title: 'Stock & expiry', path: '/admin/settings/stock', roles: ['admin', 'super_admin'], description: 'Expired goods, warnings and which batch is used first' },
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
          { group: 'Platform', title: 'Appearance', path: '/admin/appearance', description: 'Colours, fonts, icons and layouts' },
          { group: 'Platform', title: 'Branches', path: '/admin/settings/locations', roles: ['admin', 'super_admin'], description: 'Locations, per-branch currency and tax, staff clearance' },
          { group: 'Platform', title: 'Navigation', path: '/admin/settings/navigation', roles: ['admin', 'super_admin'], description: 'Storefront menu and links' },
          { group: 'Platform', title: 'Modules', path: '/admin/settings/modules', roles: ['super_admin'], description: 'Module Center and license keys' },
          { group: 'Platform', title: 'Backups', path: '/admin/settings/backups', roles: ['admin', 'super_admin'], description: 'Scheduled encrypted data backups and restore' },
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
      { id: 'dev-keys', title: 'Dev keys', icon: FolderCog, color: 'var(--color-primary-600)', path: '/admin/dev-keys', ownerOnly: true },
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

/** Does `pathname` sit at or under `path`? Segment-aware: /admin/orders ≠ /admin/orders-old. */
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
export function findActive(nav, pathname, search = '') {
  const here = new URLSearchParams(search);
  let best = { item: null, tab: null, len: -1 };
  const consider = (item, tab, path, exact) => {
    // a tab can name a query too (/admin/books?tab=accounts): every key it names must be in the address
    const cut = path.indexOf('?');
    const base = cut < 0 ? path : path.slice(0, cut);
    if (!pathMatches(pathname, base, exact)) return;
    if (cut >= 0) {
      for (const [k, v] of new URLSearchParams(path.slice(cut + 1))) if (here.get(k) !== v) return;
    }
    // Longer wins; on a tie within the same item, prefer the tab (so the tab lights up)
    const len = path.length;
    const tieToTab = len === best.len && tab && best.item === item && !best.tab;
    if (len > best.len || tieToTab) best = { item, tab, len };
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
