/**
 * Shared helpers for admin CRUD stores.
 */

/** Best human-readable message from a Laravel error response. */
export const errMsg = (error, fallback = 'Something went wrong') => {
  const data = error?.response?.data;
  if (data?.message) return data.message;
  if (data?.errors) {
    const first = Object.values(data.errors)[0];
    if (Array.isArray(first) && first.length) return first[0];
  }
  return fallback;
};

/** Laravel 422 validation errors as { field: 'first message' } for forms. */
export const fieldErrors = (error) => {
  const errors = error?.response?.data?.errors;
  if (!errors || typeof errors !== 'object') return {};
  return Object.fromEntries(
    Object.entries(errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)])
  );
};

export const emptyPagination = { current_page: 1, last_page: 1, per_page: 20, total: 0 };

/** Laravel LengthAwarePaginator JSON → { items, pagination } */
export const fromPaginator = (response) => ({
  items: response?.data ?? [],
  pagination: {
    current_page: response?.current_page ?? 1,
    last_page:    response?.last_page ?? 1,
    per_page:     response?.per_page ?? 20,
    total:        response?.total ?? 0,
  },
});

/** Replace an item by id in an array (or append if missing). */
export const upsertById = (list, item) => {
  if (!item) return list;
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const next = list.slice();
  next[idx] = { ...next[idx], ...item };
  return next;
};

export const removeById = (list, id) => list.filter((x) => x.id !== id);

/** Drop empty-string / null / undefined params so they aren't sent. */
export const cleanParams = (params = {}) =>
  Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
  );

/**
 * Loading/error wrappers for a store built with create((set, get) => ...).
 * The store must declare `loading: {}`, `actionLoading` and `error`.
 *
 *   const { act, load } = createRunners(set, get);
 *   fetchX: () => load('x', async () => {...}, 'Failed to load X'),
 *   saveX:  (d) => act(async () => {...}, 'Failed to save X'),
 *
 * Both rethrow so forms can read fieldErrors(error).
 */
export const createRunners = (set, get) => ({
  act: async (fn, fallback) => {
    set({ actionLoading: true, error: null });
    try {
      const result = await fn();
      set({ actionLoading: false });
      return result;
    } catch (error) {
      set({ actionLoading: false, error: errMsg(error, fallback) });
      throw error;
    }
  },
  load: async (flag, fn, fallback) => {
    set({ loading: { ...get().loading, [flag]: true }, error: null });
    try {
      const result = await fn();
      set({ loading: { ...get().loading, [flag]: false } });
      return result;
    } catch (error) {
      set({ loading: { ...get().loading, [flag]: false }, error: errMsg(error, fallback) });
      throw error;
    }
  },
});
