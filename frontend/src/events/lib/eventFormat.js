import { formatMoney } from '../../_shared/lib/money';

// Small helpers shared by the event screens (staff and customer).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** "Sat 14 Mar 2026, 18:30" from the server's "2026-03-14T18:30" (a wall-clock time, shown as it is: no timezone shifting). */
export const whenText = (s, { time = true } = {}) => {
  if (!s) return '—';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return String(s);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  const date = `${day} ${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
  return time ? `${date}, ${m[4]}:${m[5]}` : date;
};

/** the value a datetime-local input wants, from a server value or a Date */
export const toInput = (v) => {
  if (!v) return '';
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}T${pad(v.getHours())}:${pad(v.getMinutes())}`;
  return String(v).replace(' ', 'T').slice(0, 16);
};

export const STATUS = {
  draft:     { label: 'Draft',     tone: 'neutral' },
  published: { label: 'On sale',   tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  postponed: { label: 'Postponed', tone: 'warning' },
};

export const KINDS = [
  { id: 'in_person', label: 'In person' },
  { id: 'online', label: 'Online' },
  { id: 'hybrid', label: 'In person and online' },
];

/** The price on a card: "Free", "From KSh 1,500" or nothing when nothing is on sale. */
export const priceLabel = (e) => {
  if (e.is_free) return 'Free';
  if (e.price_from === null || e.price_from === undefined) return '';

  return `From ${formatMoney(e.price_from, e.currency?.symbol || e.currency?.code || '', { decimals: 'auto' })}`;
};

