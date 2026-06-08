/**
 * searchEventService.js
 * Silent, fire-and-forget analytics tracker.
 * Import { searchEvents } and call methods anywhere — never throws, never blocks.
 *
 * Session ID is generated once per browser tab and stored in sessionStorage
 * so you can reconstruct a full user journey within a session.
 */

import api from '../api/axios';

// ── Session ID — one per browser tab, persists across page navigations ────────
let _sessionId = sessionStorage.getItem('search_session_id');
if (!_sessionId) {
  _sessionId = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
  sessionStorage.setItem('search_session_id', _sessionId);
}

// ── Last active query — used to link actions (cart/wishlist) back to a search ─
let _lastQuery = null;

// ── Debounce tracking — avoid spamming on every keystroke ────────────────────
let _typingTimer = null;
const TYPING_DEBOUNCE = 600; // ms — only fires after user pauses

// ── Core fire function — truly silent ────────────────────────────────────────
const fire = (payload) => {
  api.post('/search-events', {
    session_id: _sessionId,
    ...payload,
  }).catch(() => {}); // swallow all errors — this must never crash the app
};

// ── Public API ────────────────────────────────────────────────────────────────
export const searchEvents = {

  /**
   * Called internally by SmartSearchBox when the user pauses typing.
   * NOT called directly — the component uses this.
   */
  _trackTyping(query, context) {
    _lastQuery = query;
    // Don't fire yet — wait for searchResult() which has the count
    // If no result fires within 2s, fire as a bare search anyway
    clearTimeout(_typingTimer);
    _typingTimer = setTimeout(() => {
      fire({
        event_type:     'search',
        search_context: context,
        query,
        had_results:    null, // unknown without result count
      });
    }, 5000);
  },

  /**
   * Call this AFTER your products/services API resolves so we log the result count.
   * This cancels the bare search timer from _trackTyping.
   *
   * @param {string} query         - the search term
   * @param {string} context       - 'product' | 'service'
   * @param {number} resultsCount  - total results returned
   *
   * Example (in Products.jsx fetchProducts):
   *   if (filters.search) {
   *     searchEvents.searchResult(filters.search, 'product', paginationData.total);
   *   }
   */
  searchResult(query, context, resultsCount) {
    if (!query?.trim()) return;
    clearTimeout(_typingTimer); // cancel the fallback timer
    _lastQuery = query.trim();

    fire({
      event_type:     resultsCount > 0 ? 'search' : 'product_not_found',
      search_context: context,
      query:          query.trim(),
      results_count:  resultsCount,
      had_results:    resultsCount > 0,
    });
  },

  /**
   * Call when a filter pill/card is clicked (brand, category, price range etc)
   *
   * @param {string} filterType    - 'brand' | 'category' | 'price_range' | 'featured' | 'on_sale' | 'new' | 'sort'
   * @param {string|number} value  - the value selected (brand name, category name, etc)
   * @param {string} context       - 'product' | 'service'
   *
   * Example:
   *   searchEvents.filter('brand', brand.name, 'product');
   *   searchEvents.filter('category', cat.name, 'product');
   *   searchEvents.filter('sort', 'price_asc', 'product');
   */
  filter(filterType, value, context, resultsCount = null) {
    fire({
        event_type:        'filter',
        search_context:    context,
        filter_type:       filterType,
        filter_value:      String(value),
        results_count:     resultsCount,
        had_results:       resultsCount !== null ? resultsCount > 0 : null,
        originating_query: _lastQuery,
    });
  },

  /**
   * Call when user clicks into a product detail page.
   *
   * @param {object} product       - product object (needs id, name, sku)
   * @param {number} position      - 0-based index in the results list (optional)
   *
   * Example (in ProductGrid or CollapsedProductCard onClick):
   *   searchEvents.productView(product, index);
   */
  productView(product, position = null) {
    fire({
      event_type:        'product_view',
      search_context:    'product',
      entity_type:       'product',
      entity_id:         product.id,
      entity_name:       product.name,
      entity_sku:        product.sku,
      result_position:   position,
      originating_query: _lastQuery,
    });
  },

  /**
   * Call when user clicks into a service detail page.
   */
  serviceView(service, position = null) {
    fire({
      event_type:        'service_view',
      search_context:    'service',
      entity_type:       'service',
      entity_id:         service.id,
      entity_name:       service.name,
      entity_sku:        service.sku ?? null,
      result_position:   position,
      originating_query: _lastQuery,
    });
  },

  /**
   * Call inside cartStore addItem — tracks what search led to a cart add.
   *
   * Example (in cartStore.js addItem):
   *   import { searchEvents } from '../services/searchEventService';
   *   searchEvents.addToCart(product);
   */
  addToCart(product) {
    fire({
      event_type:        'add_to_cart',
      entity_type:       'product',
      entity_id:         product.id,
      entity_name:       product.name,
      entity_sku:        product.sku ?? null,
      originating_query: _lastQuery,
    });
  },

  /**
   * Call inside wishlistStore add/toggle.
   *
   * Example:
   *   searchEvents.addToWishlist({ id: productId, name: '...', sku: '...' });
   */
  addToWishlist(product) {
    fire({
      event_type:        'add_to_wishlist',
      entity_type:       'product',
      entity_id:         product.id,
      entity_name:       product.name ?? null,
      entity_sku:        product.sku  ?? null,
      originating_query: _lastQuery,
    });
  },

  /**
   * Call inside quoteListStore addItem.
   */
  addToQuotelist(product) {
    fire({
      event_type:        'add_to_quotelist',
      entity_type:       'product',
      entity_id:         product.id,
      entity_name:       product.name ?? null,
      entity_sku:        product.sku  ?? null,
      originating_query: _lastQuery,
    });
  },
};