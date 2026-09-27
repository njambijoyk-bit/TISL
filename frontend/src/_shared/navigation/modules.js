/**
 * Module keys used by the admin navigation, the storefront nav manager and
 * the Module Center.
 *
 * `isModuleActive` reads a live snapshot of the active paid modules that the
 * server reports (fetched by moduleStore from `/modules/active`). Core is
 * always on. A sub-feature such as 'ecommerce.hampers' needs its parent
 * ('ecommerce') to be active.
 *
 * The snapshot is a plain module-level Set rather than a hook so it can be
 * used from non-React code (nav config, route guards). moduleStore keeps it
 * in step via setActiveModules().
 */
export const MODULES = {
  CORE:        'core',
  ECOMMERCE:   'ecommerce',
  HAMPERS:     'ecommerce.hampers',
  AUCTIONS:    'ecommerce.auctions',
  BOOKINGS:    'core.bookings',   // Core shared capability (always on)
  MIMI:        'core.mimi',
  CAREERS:     'careers',
  PROJECTS:    'projects',
  EXTRAS:      'extras',          // TISL extras: delivery, inventory, work, algorithm
  // New modules (not built yet)
  LISTINGS:        'listings',
  CAMPAIGNS:       'campaigns',
  COURSES:         'courses',
  ACCOMMODATIONS:  'accommodations',
  MENUS:           'menus',
  EVENTS:          'events',
  MEMBERSHIPS:     'memberships',
};

/** The 11 paid top-level module keys (Core and sub-features excluded). */
export const PAID_MODULES = [
  'ecommerce', 'listings', 'campaigns', 'courses', 'accommodations',
  'menus', 'events', 'memberships', 'careers', 'projects', 'extras',
];

/**
 * Live snapshot of active paid modules. Starts empty (fail-closed) and is
 * filled by moduleStore.fetch() / persisted rehydrate. Kept as a Set of
 * top-level keys, e.g. {'ecommerce','careers'}.
 */
let ACTIVE = new Set();

/** Replace the active-module snapshot (called by moduleStore). */
export function setActiveModules(list) {
  ACTIVE = new Set(Array.isArray(list) ? list : []);
}

/** Read the current active top-level keys (for menus/manifests). */
export function getActiveModules() {
  return [...ACTIVE];
}

/**
 * Is this module (or sub-feature) switched on and licensed?
 * Core (and any 'core.*' sub-feature) is always on. Everything else must be
 * in the live active set; a sub-feature also needs its parent.
 */
export function isModuleActive(key) {
  if (!key) return true;
  if (key === MODULES.CORE) return true;

  const parent = key.includes('.') ? key.split('.')[0] : key;
  if (parent === MODULES.CORE) return true;      // core.mimi etc.

  return ACTIVE.has(parent);
}
