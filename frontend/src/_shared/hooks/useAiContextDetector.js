import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import useAiPanelStore from '../store/useAiPanelStore';

/**
 * useAiContextDetector
 * Reads the current pathname and infers the AI module context.
 * Call this once near the top of the admin layout / App.
 *
 * Detected modules:
 *   /admin/projects/:id        → projects  / project
 *   /admin/orders/:id          → orders    / order
 *   /admin/customers/:id       → customers / customer
 *   /admin/inventory           → inventory / null
 *   /admin/reports             → reports   / null
 */

// ── Route matchers (order matters — more specific first) ─────────────────────
const MATCHERS = [
  // Project detail
  {
    pattern: /^\/admin\/projects\/(\d+)/,
    resolve: (m) => ({
      moduleKey:  'projects',
      entityType: 'project',
      entityId:    Number(m[1]),
      label:      `Project #${m[1]}`,
    }),
  },
  // Order detail
  {
    pattern: /^\/admin\/orders\/(\d+)/,
    resolve: (m) => ({
      moduleKey:  'orders',
      entityType: 'order',
      entityId:    Number(m[1]),
      label:      `Order #${m[1]}`,
    }),
  },
  // Customer detail
  {
    pattern: /^\/admin\/customers\/(\d+)/,
    resolve: (m) => ({
      moduleKey:  'customers',
      entityType: 'customer',
      entityId:    Number(m[1]),
      label:      `Customer #${m[1]}`,
    }),
  },
  // Inventory
  {
    pattern: /^\/admin\/(assets|inventory)/,
    resolve: () => ({
      moduleKey:  'inventory',
      entityType: null,
      entityId:   null,
      label:      'Inventory',
    }),
  },
  // Reports
  {
    pattern: /^\/admin\/reports/,
    resolve: () => ({
      moduleKey:  'reports',
      entityType: null,
      entityId:   null,
      label:      'Reports',
    }),
  },
  // Projects list/dashboard
  {
    pattern: /^\/admin\/projects/,
    resolve: () => ({
      moduleKey:  'projects',
      entityType: null,
      entityId:   null,
      label:      'Projects',
    }),
  },
  // Auction detail
  {
    pattern: /^\/admin\/auctions\/(\d+)/,
    resolve: (m) => ({
      moduleKey:  'auctions',
      entityType: 'auction',
      entityId:    Number(m[1]),
      label:      `Auction #${m[1]}`,
    }),
  },
  // Auctions list
  {
    pattern: /^\/admin\/auctions/,
    resolve: () => ({
      moduleKey:  'auctions',
      entityType: null,
      entityId:   null,
      label:      'Auctions',
    }),
  },
  // Finance
  {
    pattern: /^\/admin\/finance/,
    resolve: () => ({
      moduleKey:  'finance',
      entityType: null,
      entityId:   null,
      label:      'Finance',
    }),
  },
];

export default function useAiContextDetector() {
  const { pathname } = useLocation();
  const setContext   = useAiPanelStore(s => s.setContext);

  useEffect(() => {
    let resolved = null;

    for (const { pattern, resolve } of MATCHERS) {
      const m = pathname.match(pattern);
      if (m) {
        resolved = resolve(m);
        break;
      }
    }

    setContext(resolved); // null if no match — panel shows "no context" state
  }, [pathname]);
}