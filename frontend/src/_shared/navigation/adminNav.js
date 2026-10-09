import {
  LayoutDashboard, ShoppingCart, DollarSign, FileText, CreditCard, NotebookPen,
  Package, PackagePlus, Wrench, Award, Gift, Gavel, CalendarCheck,
  Users, Star, TicketPercent, Landmark, Receipt, BarChart2,
  LifeBuoy, IdCardLanyard, Newspaper, Bot, ClipboardList, GraduationCap,
  Truck, Megaphone, Pin, Boxes, AlertTriangle, Settings, Bug, FolderCode, FolderCog,
  GitBranch, LayoutGrid, Palette, BookOpen, Banknote, ListTree, TrendingUp, UserCircle,
} from 'lucide-react';
import { MODULES, isModuleActive } from './modules';
import { accountType, hasPermission, isStaff } from '../lib/roles';

/**
 * The admin navigation — the single source for the sidebar, the section tabs
 * at the top of a page, the Settings hub and the Ctrl+K quick-jump.
 *
 * Group:  { id, label, module?, perm?, account?, items }
 * Item:   { id, title, icon, color, path, exact?, also?, perm?, account?, module?,
 *           keywords?, tabs?, hideTabs? }
 * Tab:    { title, path, exact?, also?, perm?, account?, module?, group?, soon?, icon?, color?, description? }
 *
 * - `path` must be a real route in App.jsx.
 * - `also` lists extra path prefixes that belong to the item (e.g. detail pages
 *   whose URL doesn't start with the item's path).
 * - `perm` is a permission from the catalogue (see Roles & access), or a list of them (any one will do); omitted = everyone who may open the admin area (drivers have their own screens).
 * - `account` shows an entry only to that kind of account ('driver' for the driver app). Never write role names here: roles are built in the role builder.
 * - `module` hides the group/item/tab when that module is off.
 * - `hideTabs` keeps the tabs for search only (the page draws its own tabs).
 * - `soon` tabs appear on the Settings hub as "Soon" and nowhere else.
 */

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
      { id: 'orders', title: 'Orders', icon: ShoppingCart, color: '#f97316', path: '/admin/orders', perm: 'books.view', keywords: 'invoices shipping' },
      { id: 'payments', title: 'Payments', icon: DollarSign, color: '#10b981', path: '/admin/finance/payments', perm: 'books.post', keywords: 'mpesa transactions' },
      {
        id: 'quotes', title: 'Quotes', icon: FileText, color: 'var(--color-primary-400)', path: '/admin/quotes', perm: 'quotes.view',
      },
      { id: 'credit', title: 'Credit accounts', icon: CreditCard, color: '#6366f1', path: '/admin/credit', perm: 'credit.view', keywords: 'gift voucher invoices' },
    ],
  },

  {
    id: 'catalogue',
    label: 'Catalogue',
    // no module on the group: Purchases (and Bookings, when rebuilt) are Core. Products, services, hampers and auctions carry the E-commerce module themselves.
    items: [
      {
        id: 'products', title: 'Products', icon: Package, color: 'var(--color-primary-500)', path: '/admin/products', module: MODULES.ECOMMERCE,
        keywords: 'variants stock categories brands price list catalogue brochure archive', also: ['/admin/categories', '/admin/brands', '/admin/price-lists', '/admin/price-list-archive', '/admin/catalogues', '/admin/catalogue-items', '/admin/catalogue-settings'],
        tabs: [
          { title: 'All products', path: '/admin/products', perm: 'catalogue.view' },
          { title: 'Categories', path: '/admin/categories', perm: 'catalogue.view' },
          { title: 'Brands', path: '/admin/brands', perm: 'catalogue.view' },
          { title: 'Bulk edit', path: '/admin/settings/general/bulk/products', perm: 'catalogue.edit' },
          { title: 'Price lists', path: '/admin/price-lists', also: ['/admin/price-list-archive'], perm: 'catalogue.pricelists' },
          { title: 'Catalogues', path: '/admin/catalogues', also: ['/admin/catalogue-items'], perm: 'catalogue.pricelists' },
          { title: 'Configuration', path: '/admin/catalogue-settings', perm: 'catalogue.pricelists' },
        ],
      },
      {
        id: 'purchases', title: 'Purchases', icon: PackagePlus, color: '#0ea5e9', path: '/admin/purchases',
        keywords: 'buy stock supplier vendor creditor receive batch expiry expired opening stock write off recall quarantine transfer branch count journal job work in progress wip', also: ['/admin/vendors', '/admin/stock/opening', '/admin/stock/expiry', '/admin/stock/held', '/admin/stock/transfers', '/admin/stock/counts', '/admin/stock/journal', '/admin/stock/reports', '/admin/stock/jobs'],
        tabs: [
          { title: 'Purchases', path: '/admin/purchases', exact: true, perm: 'books.view' },
          { title: 'Vendors', path: '/admin/vendors', perm: 'vendors.view' },
          { title: 'Opening stock', path: '/admin/stock/opening', perm: 'books.view' },
          { title: 'Expiring stock', path: '/admin/stock/expiry', perm: 'stock.view' },
          { title: 'Held stock', path: '/admin/stock/held', perm: 'stock.view' },
          { title: 'Transfers', path: '/admin/stock/transfers', perm: 'stock.view' },
          { title: 'Stock counts', path: '/admin/stock/counts', perm: 'stock.view' },
          { title: 'Stock reports', path: '/admin/stock/reports', perm: 'stock.view' },
          { title: 'Stock journal', path: '/admin/stock/journal', perm: 'stock.view' },
          { title: 'Jobs in progress', path: '/admin/stock/jobs', perm: 'stock.view' },
        ],
      },
      {
        id: 'services', title: 'Services', icon: Wrench, color: '#10b981', path: '/admin/services', module: MODULES.ECOMMERCE, also: ['/admin/brochures', '/admin/service-categories', '/admin/service-settings'],
        tabs: [
          { title: 'Services', path: '/admin/services', perm: 'catalogue.view' },
          { title: 'Brochures', path: '/admin/brochures', perm: 'catalogue.view' },
          { title: 'Service categories', path: '/admin/service-categories', perm: 'catalogue.view' },
          { title: 'Service configuration', path: '/admin/service-settings', perm: 'catalogue.view' },
        ],
      },
      { id: 'hampers', title: 'Hampers', icon: Gift, color: '#fc7bf5', path: '/admin/hampers', module: MODULES.HAMPERS, perm: 'hampers.manage' },
      {
        id: 'auctions', title: 'Auctions', icon: Gavel, color: '#ef4444', path: '/admin/auctions', module: MODULES.AUCTIONS, perm: 'auctions.manage', keywords: 'bids',
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
          { title: 'All customers', path: '/admin/customers', perm: 'customers.view' },
          { title: 'Bulk edit', path: '/admin/settings/general/bulk/customers', perm: 'customers.manage' },
        ],
      },
      {
        id: 'loyalty', title: 'Loyalty', icon: Award, color: '#ec4899', path: '/admin/loyalty', perm: 'customers.view', keywords: 'points',
        tabs: [
          { title: 'Ledger', path: '/admin/loyalty', perm: 'customers.view' },
          { title: 'Loyalty configuration', path: '/admin/loyalty/settings', perm: 'loyalty.configure' },
        ],
      },
      {
        id: 'codes', title: 'Promo & referral codes', icon: TicketPercent, color: 'var(--color-primary-600)', path: '/admin/promo-codes', also: ['/admin/referrals'], perm: 'promos.manage', keywords: 'discount coupon',
        tabs: [
          { title: 'Promo codes', path: '/admin/promo-codes' },
          { title: 'Referral codes', path: '/admin/referrals' },
        ],
      },
      { id: 'reviews', title: 'Reviews & comments', icon: Star, color: '#f59e0b', path: '/admin/reviews', module: MODULES.EXTRAS, perm: 'engagement.view', keywords: 'ratings feedback reviews comments approve moderate held' },
    ],
  },

  {
    id: 'finance',
    label: 'Tax & Finance',
    items: [
      {
        id: 'books', title: 'Books', icon: BookOpen, color: '#6366f1', path: '/admin/books', also: ['/admin/books/vouchers'], perm: 'books.view',
        keywords: 'vouchers ledgers accounts invoice sales purchase journal receipt payment day book trial balance profit loss mail email whatsapp send documents',
        tabs: [
          { title: 'Overview', path: '/admin/books', exact: true },
          { title: 'Vouchers', path: '/admin/books?tab=vouchers', also: ['/admin/books/vouchers'] },
          { title: 'Gift vouchers', path: '/admin/books?tab=gifts' },
          { title: 'Mail', path: '/admin/books?tab=mail' },
          { title: 'Edit log', path: '/admin/books/edit-log' },
          { title: 'Configuration', path: '/admin/books?tab=settings' },
        ],
      },
      { id: 'accounts', title: 'Chart of accounts', icon: ListTree, color: '#7c3aed', path: '/admin/books?tab=accounts', perm: 'books.view', keywords: 'ledgers groups accounts chart' },
      {
        id: 'cash-bank', title: 'Cash & bank', icon: Banknote, color: '#0d9488', path: '/admin/books/cash', perm: 'books.view', keywords: 'till cash count cheque deposit bounce bank driver cash on delivery',
        tabs: [
          { title: 'Cash', path: '/admin/books/cash' },
          { title: 'Cheques', path: '/admin/books/cheques' },
          { title: 'Petty cash', path: '/admin/petty-cash' },
        ],
      },
      { id: 'petty-cash', title: 'Petty cash', icon: Banknote, color: '#0d9488', path: '/admin/petty-cash', keywords: 'petty cash float custodian receipts' },
      { id: 'memoranda', title: 'Memoranda', icon: NotebookPen, color: '#0ea5e9', path: '/admin/books/memoranda', keywords: 'memorandum memo notes expected agreed journal' },
      { id: 'tax', title: 'Tax & Compliance', icon: Landmark, color: 'var(--color-primary-600)', path: '/admin/tax', perm: 'tax.view', keywords: 'vat kra tax rates' },
      { id: 'withholding', title: 'Withholding & Compliance', icon: Receipt, color: '#0d9488', path: '/admin/withholding', perm: 'tax.view', keywords: 'wht certificates' },
      { id: 'verification', title: 'Verification', icon: ClipboardList, color: '#0ea5e9', path: '/admin/verification', keywords: 'verify vouchers check audit register observation query' },
      { id: 'reports', title: 'Reports', icon: BarChart2, color: '#22c55e', path: '/admin/books?tab=reports', perm: 'books.view', keywords: 'day book trial balance profit loss balance sheet ageing receivables payables tax' },
    ],
  },

  {
    id: 'workplace',
    label: 'Workplace',
    items: [
      { id: 'tickets', title: 'Help desk', icon: LifeBuoy, color: '#ef4444', path: '/admin/tickets', perm: 'tickets.manage', keywords: 'tickets support' },
      {
        id: 'team', title: 'Team', icon: IdCardLanyard, color: '#eab308', path: '/admin/employees', keywords: 'employees staff',
        tabs: [
          { title: 'Employees', path: '/admin/employees', perm: 'hr.view' },
          { title: 'Bulk edit', path: '/admin/settings/general/bulk/employees', perm: 'hr.manage' },
        ],
      },
      {
        id: 'calendar', title: 'Calendar', icon: CalendarCheck, color: '#10b981', path: '/admin/calendar', also: ['/admin/bookings'], keywords: 'schedule bookings staff availability google ics appointments',
        tabs: [
          { title: 'My calendar', path: '/admin/calendar', exact: true },
          { title: 'Team calendar', path: '/admin/calendar/team', perm: 'calendar.team' },
          { title: 'Bookings', path: '/admin/bookings', perm: 'bookings.manage' },
          { title: 'Staff & resources', path: '/admin/resources', perm: 'resources.manage' },
        ],
      },
      { id: 'assets', title: 'Assets', icon: Boxes, color: '#c2410c', path: '/admin/assets', also: ['/admin/inventory'], perm: 'inventory.view', keywords: 'furniture equipment laptops issued loaned repairs depreciation register' },
      { id: 'analytics', title: 'Site analytics', icon: TrendingUp, color: '#0ea5e9', path: '/admin/settings/analytics', perm: 'analytics.view', keywords: 'visitors traffic' },
      { id: 'attendance', title: 'Attendance', icon: IdCardLanyard, color: '#eab308', path: '/admin/attendance', keywords: 'sign in clock staff present absent late verify dispute' },
      {
        id: 'mimi', title: 'Mimi AI', icon: Bot, color: '#3b82f6', path: '/admin/ai-analytics', module: MODULES.MIMI, keywords: 'ai assistant chatbot',
        tabs: [
          { title: 'AI configuration', path: '/admin/ai-analytics', exact: true },
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
        id: 'recipes', title: 'Recipes', icon: ClipboardList, color: '#f59e0b', path: '/admin/menus/recipes', perm: 'menus.view', keywords: 'recipe ingredients manufacture production made to order dish',
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
        id: 'projects', title: 'Projects', icon: ClipboardList, color: '#14b8a6', path: '/admin/projects', perm: 'projects.use', keywords: 'milestones tasks',
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
        id: 'careers', title: 'Careers', icon: GraduationCap, color: '#6366f1', path: '/admin/careers', perm: 'careers.manage', keywords: 'jobs ats applicants recruitment',
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
    id: 'campaigns',
    label: 'Campaigns',
    module: MODULES.CAMPAIGNS,
    perm: 'campaigns.build',
    items: [
      { id: 'campaigns', title: 'Campaigns', icon: Megaphone, color: '#d946ef', path: '/admin/campaigns', perm: 'campaigns.build', keywords: 'launch drop collection teaser brand story promotion' },
      { id: 'pins', title: 'Pins', icon: Pin, color: '#f43f5e', path: '/admin/pins', perm: 'campaigns.build', keywords: 'pinterest images videos moodboard boards library' },
      { id: 'boards', title: 'Boards', icon: LayoutGrid, color: '#8b5cf6', path: '/admin/boards', perm: 'campaigns.build', keywords: 'pinterest collections moodboard approve pins' },
      { id: 'moodboards', title: 'Moodboards', icon: Palette, color: '#ec4899', path: '/admin/moodboards', perm: 'campaigns.build', keywords: 'collage template layout inspiration look' },
    ],
  },

  {
    id: 'operations',
    label: 'Operations',
    module: MODULES.EXTRAS,
    items: [
      {
        id: 'delivery', title: 'Delivery', icon: Truck, color: '#f97316', path: '/admin/delivery', perm: 'delivery.manage', keywords: 'manifests drivers logistics',
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
      { id: 'my-payslips', title: 'My payslips', icon: Banknote, color: '#16a34a', path: '/admin/my-payslips', keywords: 'salary pay slip wages my pay' },
      {
        id: 'payroll', title: 'Payroll', icon: Banknote, color: '#16a34a', path: '/admin/payroll', perm: 'payroll.run', keywords: 'salary payslip paye nssf deductions wages',
        tabs: [
          { title: 'Runs', path: '/admin/payroll', exact: true },
          { title: 'Gratuity', path: '/admin/payroll/gratuity' },
          { title: 'Configuration', path: '/admin/payroll/settings' },
        ],
      },
    ],
  },

  {
    id: 'driver',
    label: 'My deliveries',
    module: MODULES.EXTRAS,
    account: 'driver',
    items: [
      { id: 'driver-profile', title: 'My profile', icon: UserCircle, color: '#8b5cf6', path: '/driver/profile', account: 'driver' },
      { id: 'driver-manifests', title: 'My manifests', icon: FileText, color: '#3b82f6', path: '/driver/manifests', account: 'driver' },
      { id: 'driver-ratings', title: 'My ratings', icon: Star, color: '#ec4899', path: '/driver/ratings', account: 'driver' },
      { id: 'driver-payslips', title: 'My payslips', icon: Banknote, color: '#16a34a', path: '/driver/payslips', account: 'driver', keywords: 'salary pay slip wages my pay' },
      { id: 'driver-incidents', title: 'My incidents', icon: AlertTriangle, color: '#f59e0b', path: '/driver/incidents', account: 'driver' },
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
          { group: 'System', title: 'Currency', path: '/admin/settings/currency', perm: 'currency.manage', description: 'Currencies and exchange rates' },
          { group: 'System', title: 'Units', path: '/admin/settings/units', perm: 'catalogue.edit', description: 'Units of measure' },
          { group: 'System', title: 'Customer tiers', path: '/admin/settings/customer-tiers', perm: 'customers.tiers', description: 'Tiers and their discounts' },
          { group: 'System', title: 'Shipping', path: '/admin/settings/shipping', perm: 'shipping.manage', description: 'Zones and delivery fees' },
          { group: 'System', title: 'Cost centres', path: '/admin/settings/cost-centres', perm: 'costcentres.view', description: 'Branches, utilities, payroll, projects and the defaults' },
          { group: 'System', title: 'Departments', path: '/admin/settings/departments', perm: 'hr.view', description: 'Each branch\'s departments and their cost centres' },
          { group: 'System', title: 'Stock & expiry', path: '/admin/settings/stock', perm: 'stock.settings', description: 'Expired goods, warnings and which batch is used first' },
          { group: 'Content', title: 'About', path: '/admin/settings/content/about', perm: 'content.manage' },
          { group: 'Content', title: 'Contact', path: '/admin/settings/content/contact', perm: 'content.manage' },
          { group: 'Content', title: 'Manual', path: '/admin/settings/content/manual', perm: 'content.manage' },
          { group: 'Content', title: 'Homepage', path: '/admin/settings/content/homepage', perm: 'content.manage' },
          { group: 'Content', title: 'Footer', path: '/admin/settings/content/footer', perm: 'content.manage' },
          { group: 'Content', title: 'Policies', path: '/admin/settings/policy', perm: 'policies.manage', description: 'Terms, privacy, returns' },
          { group: 'Access', title: 'Users & roles', path: '/admin/users', description: 'Staff accounts and their roles' },
          { group: 'Access', title: 'Roles & access', path: '/admin/access', perm: 'access.view', description: 'Clearance levels, roles, permissions and branch access' },
          { group: 'Platform', title: 'Algorithm', path: '/admin/algorithm', module: MODULES.EXTRAS, perm: 'algorithm.manage', description: 'Ranking, pins and catalogue boosts' },
          { group: 'Platform', title: 'Engagement', path: '/admin/settings/engagement', module: MODULES.EXTRAS, perm: 'engagement.settings', description: 'Who can review, comment, like, mark helpful and report' },
          { group: 'Platform', title: 'Vault', path: '/admin/vault', description: 'Stored documents and secrets' },
          { group: 'Platform', title: 'Activity logs', path: '/admin/logs', perm: 'system.logs', description: 'Who changed what, and exports' },
          { group: 'Platform', title: 'Appearance', path: '/admin/appearance', perm: 'appearance.manage', description: 'Colours, fonts, icons and layouts' },
          { group: 'Platform', title: 'Branches', path: '/admin/settings/locations', perm: 'locations.manage', description: 'Locations, per-branch currency and tax, staff clearance' },
          { group: 'Platform', title: 'Navigation', path: '/admin/settings/navigation', perm: 'system.navigation', description: 'Storefront menu and links' },
          { group: 'Platform', title: 'Modules', path: '/admin/settings/modules', perm: 'system.modules', description: 'Module Center and license keys' },
          { group: 'Platform', title: 'Backups', path: '/admin/settings/backups', perm: 'system.backups', description: 'Scheduled encrypted data backups and restore' },
        ],
      },
    ],
  },

  {
    id: 'developer',
    label: 'Developer',
    perm: 'system.devtools',
    items: [
      { id: 'bug-reports', title: 'Bug reports', icon: Bug, color: '#c2410c', path: '/admin/bug-reports' },
      { id: 'dev-notes', title: 'Dev notes', icon: FolderCode, color: '#3b82f6', path: '/admin/dev-notes' },
      { id: 'dev-keys', title: 'Dev keys', icon: FolderCog, color: 'var(--color-primary-600)', path: '/admin/dev-keys' },
      {
        id: 'flowcharts', title: 'Flowcharts', icon: GitBranch, color: '#ec4899', path: '/admin/flowchart/orders', also: ['/admin/flowchart'],
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

/**
 * May this person see this entry? Entries name a permission (`perm`) or a kind of account (`account`); with neither, groups and tabs show for
 * everyone and items for everyone who may open the admin area (drivers have their own screens).
 */
function allowed(entry, user, fallback = isStaff(user)) {
  if (entry.module && !isModuleActive(entry.module)) return false;
  if (entry.account) return accountType(user) === entry.account;
  if (entry.perm) return [].concat(entry.perm).some((p) => hasPermission(user, p));   // a list means any one of them
  return fallback;
}

/**
 * The navigation this user may see: groups, items and tabs filtered by permission,
 * module and account kind. Empty groups are dropped. `soon` tabs are kept (the
 * Settings hub shows them) — use `liveTabs()` for anything clickable.
 */
export function visibleNav(user) {
  return ADMIN_NAV
    .filter((g) => allowed(g, user, true))
    .map((g) => ({
      ...g,
      items: g.items
        .filter((i) => allowed(i, user))
        .map((i) => (i.tabs ? withOpenTabs(i, user) : i))
        .filter(Boolean),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * An item's tabs cut down to the ones this person may open. When the item has no permission of its own but its tabs do (Purchases: the list needs
 * the books, the stock tabs need stock), the item shows when any tab does, and its link goes to the first tab they may open.
 * Returns null when the item should not show at all.
 */
function withOpenTabs(item, user) {
  const tabs = item.tabs.filter((t) => allowed(t, user, true));
  const byTabs = !item.perm && !item.account && item.tabs.some((t) => t.perm);
  if (!byTabs) return { ...item, tabs };
  const live = tabs.filter((t) => !t.soon);
  if (!live.length) return null;
  const opens = (path) => live.some((t) => t.path === path || (t.also ?? []).includes(path));

  return { ...item, tabs, path: opens(item.path) ? item.path : live[0].path };
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
