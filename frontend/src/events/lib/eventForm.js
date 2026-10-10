// The event form's state, and how it maps to and from what the server sends and takes. Dates and ticket types are rows with a local `key`: the server's id once saved, a
// temporary one before. A ticket type names the dates it admits by key; new dates reach the server under that key, so a type can point at a date that is not saved yet.

let counter = 0;
export const newKey = () => `n${++counter}`;

export const blankEvent = () => ({
  title: '', summary: '', description: '', kind: 'in_person', venue_name: '', venue_address: '', map_url: '', online_url: '', organiser: '', is_listed: true,
  currency_id: '', sales_ledger_id: '', max_per_order: 10, refund_until: '', refund_policy: '', allow_name_change: true,
});

export const blankSession = (over = {}) => ({ key: newKey(), label: '', starts_at: '', ends_at: '', capacity: '', is_cancelled: false, ...over });

export const blankType = (over = {}) => ({
  key: newKey(), name: '', description: '', price: '', capacity: '', min_per_order: 1, max_per_order: '', sale_starts_at: '', sale_ends_at: '', is_active: true, session_keys: [],
  sold: 0, taken: 0, remaining: null, revenue: 0, ...over,
});

const FIELDS = Object.keys(blankEvent());
const text = (v) => v ?? '';

/** What the server sent -> the form's state */
export function fromServer(e) {
  const event = {};
  FIELDS.forEach((k) => { event[k] = k === 'is_listed' || k === 'allow_name_change' ? Boolean(e[k]) : text(e[k]); });
  const sessions = (e.sessions ?? []).map((s) => ({ key: `s${s.id}`, id: s.id, label: text(s.label), starts_at: text(s.starts_at), ends_at: text(s.ends_at), capacity: text(s.capacity), is_cancelled: Boolean(s.is_cancelled) }));
  const types = (e.ticket_types ?? []).map((t) => ({
    key: `t${t.id}`, id: t.id, name: text(t.name), description: text(t.description), price: text(t.price), capacity: text(t.capacity), min_per_order: text(t.min_per_order) || 1, max_per_order: text(t.max_per_order),
    sale_starts_at: text(t.sale_starts_at), sale_ends_at: text(t.sale_ends_at), is_active: Boolean(t.is_active), session_keys: (t.session_ids ?? []).map((i) => `s${i}`),
    sold: t.sold ?? 0, taken: t.taken ?? 0, remaining: t.remaining ?? null, revenue: t.revenue ?? 0,
  }));

  return { event, sessions, types };
}

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/** The form's state -> what the server takes */
export function toServer({ event, sessions, types }) {
  const known = new Set(sessions.map((s) => s.key));
  const ref = (key) => {
    const s = sessions.find((x) => x.key === key);
    return s?.id ?? key;   // a saved date by its id, a new one by its key
  };

  return {
    ...event,
    currency_id: num(event.currency_id), sales_ledger_id: num(event.sales_ledger_id), refund_until: event.refund_until || null, max_per_order: Number(event.max_per_order) || 10,
    sessions: sessions.map((s) => ({ id: s.id, key: s.key, label: s.label, starts_at: s.starts_at, ends_at: s.ends_at || null, capacity: num(s.capacity), is_cancelled: s.is_cancelled })),
    ticket_types: types.map((t, i) => ({
      id: t.id, name: t.name, description: t.description, price: Number(t.price) || 0, capacity: num(t.capacity), min_per_order: Number(t.min_per_order) || 1, max_per_order: num(t.max_per_order),
      sale_starts_at: t.sale_starts_at || null, sale_ends_at: t.sale_ends_at || null, is_active: t.is_active, sort_order: i,
      session_ids: t.session_keys.filter((k) => known.has(k)).map(ref),
    })),
  };
}

/** Everything that is saved, as one string: two of these differ when there is something to save. */
export const snapshot = (state) => JSON.stringify({ event: state.event, sessions: state.sessions, types: state.types.map(({ sold, taken, remaining, revenue, ...rest }) => rest) });   // eslint-disable-line no-unused-vars
