import { colors } from '../../../_shared/theme/tokens';

export const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: colors.textFaint };
export const td = { padding: '9px 10px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'top', color: colors.textBody };
export const mono = { fontFamily: 'monospace', fontSize: '0.76rem' };
export const linkStyle = { color: colors.primary, fontWeight: 600, textDecoration: 'none' };

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');
export const kes = (n) => `KES ${Number(n || 0).toLocaleString()}`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

const two = (n) => String(n).padStart(2, '0');

/** October 13th, 2026 */
export const fmtLongDate = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return `${MONTHS[x.getMonth()]} ${ordinal(x.getDate())}, ${x.getFullYear()}`;
};

/** Oct 21st 2026 10:00 */
export const fmtDateTime = (d) => {
  if (!d) return '—';
  const x = new Date(d);
  return `${MONTHS[x.getMonth()].slice(0, 3)} ${ordinal(x.getDate())} ${x.getFullYear()} ${two(x.getHours())}:${two(x.getMinutes())}`;
};

export const METHOD_LABELS = {
  open_tender: 'Open Tender',
  restricted_tender: 'Restricted Tender',
  request_for_quotation: 'Request for Quotation',
  request_for_proposal: 'Request for Proposal',
  expression_of_interest: 'Expression of Interest',
  direct_procurement: 'Direct Procurement',
  framework_agreement: 'Framework Agreement',
};

export const SUBMISSION_LABELS = {
  electronic: 'Electronic submission',
  physical: 'Physical submission',
  both: 'Electronic and physical submission',
};

export const CATEGORY_LABELS = { goods: 'Goods', services: 'Services', works: 'Works' };

export const DOC_TYPE_LABELS = {
  tender_document: 'Tender document', tender_notice: 'Tender notice', advertisement: 'Advertisement', addendum: 'Addendum',
  clarification: 'Clarification', award_notice: 'Notice of award', other: 'Other',
};

export const GROUP_LABELS = { youth: 'Youth', women: 'Women', pwd: 'Persons with disabilities', sme: 'SMEs' };

export const VISIBILITY_LABELS = {
  public: 'Public: everyone, including customers',
  all_vendors: 'Vendors: any signed-in vendor',
  prequalified: 'Pre-qualified vendors only',
  invited: 'Invited vendors only',
};

export const NOTICE_TYPE_LABELS = { tender: 'Tender', prequalification: 'Pre-qualification', expression_of_interest: 'Expression of interest' };

export const fmtSize = (b) => (!b ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/** "5 days 3 hours", "2 hours 10 minutes", or "Closed". */
export const timeToClose = (deadline, now = Date.now()) => {
  if (!deadline) return '—';
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return 'Closed';
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return `${days} day${days === 1 ? '' : 's'} ${hours} hr${hours === 1 ? '' : 's'}`;
  if (hours > 0) return `${hours} hr${hours === 1 ? '' : 's'} ${mins % 60} min`;
  return `${Math.max(mins, 1)} min`;
};

export const fmtFee = (n, currency = 'KES') => (Number(n) > 0 ? `${currency} ${Number(n).toLocaleString()}` : '0');
