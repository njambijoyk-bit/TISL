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
 *   /admin/bookings/:id        → bookings  / booking
 *   /admin/orders/:id          → orders    / order
 *   /admin/customers/:id       → customers / customer
 *   /admin/quotes/:id          → quotes    / quote
 *   /admin/quote-requests/:id  → quotes    / quote_request
 *   /admin/work                → work      / null
 *   /admin/inventory           → inventory / null
 *   /admin/reports             → reports   / null
 *   /admin/bookings/:id/worksheets/:wsId → bookings / worksheet (wsId)
 */

// ── Route matchers (order matters — more specific first) ─────────────────────
const MATCHERS = [
  // Booking worksheet detail
  {
    pattern: /^\/admin\/bookings\/(\d+)\/worksheets\/(\d+)/,
    resolve: (m) => ({
      moduleKey:  'bookings',
      entityType: 'worksheet',
      entityId:    Number(m[2]),
      label:      `Worksheet #${m[2]}`,
    }),
  },
  // Booking detail
  {
    pattern: /^\/admin\/bookings\/(\d+)/,
    resolve: (m) => ({
      moduleKey:  'bookings',
      entityType: 'booking',
      entityId:    Number(m[1]),
      label:      `Booking #${m[1]}`,
    }),
  },
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
  // Quote detail
  {
    pattern: /^\/admin\/quotes\/(\d+)/,
    resolve: (m) => ({
      moduleKey:  'quotes',
      entityType: 'quote',
      entityId:    Number(m[1]),
      label:      `Quote #${m[1]}`,
    }),
  },
  // Quote request detail
  {
    pattern: /^\/admin\/quote-requests\/(\d+)/,
    resolve: (m) => ({
      moduleKey:  'quotes',
      entityType: 'quote_request',
      entityId:    Number(m[1]),
      label:      `Quote Request #${m[1]}`,
    }),
  },
  // Work dashboard
  {
    pattern: /^\/admin\/work/,
    resolve: () => ({
      moduleKey:  'work',
      entityType: null,
      entityId:   null,
      label:      'Work Dashboard',
    }),
  },
  // Inventory
  {
    pattern: /^\/admin\/inventory/,
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
  // Bookings list
  {
    pattern: /^\/admin\/bookings$/,
    resolve: () => ({
      moduleKey:  'bookings',
      entityType: null,
      entityId:   null,
      label:      'Bookings',
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