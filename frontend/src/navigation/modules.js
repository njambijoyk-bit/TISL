/**
 * Module keys used by the admin navigation (and, later, the storefront nav
 * manager and the Module Center).
 *
 * Until the module registry and license keys exist, every module is active.
 * When they land, only `isModuleActive` changes: it will read the active
 * modules the server reports (e.g. from a store loaded at login).
 */
export const MODULES = {
  CORE:        'core',
  ECOMMERCE:   'ecommerce',
  HAMPERS:     'ecommerce.hampers',
  AUCTIONS:    'ecommerce.auctions',
  BOOKINGS:    'ecommerce.bookings',
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

/**
 * Is this module (or sub-feature) switched on? A sub-feature such as
 * 'ecommerce.hampers' also needs its parent 'ecommerce'.
 */
export function isModuleActive(key) {
  if (!key || key === MODULES.CORE) return true;
  const parent = key.includes('.') ? key.split('.')[0] : null;
  if (parent && parent !== MODULES.CORE && !isModuleActive(parent)) return false;
  return true; // stub: everything is on until the module registry exists
}
