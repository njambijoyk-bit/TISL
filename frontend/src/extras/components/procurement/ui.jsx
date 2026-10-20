import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import { colors, card, radius } from '../../../_shared/theme/tokens';
import { th, linkStyle, fmtLongDate, fmtDateTime, fmtFee, fmtSize, METHOD_LABELS, SUBMISSION_LABELS, CATEGORY_LABELS, DOC_TYPE_LABELS, GROUP_LABELS, NOTICE_TYPE_LABELS } from './format';

const TONES = {
  neutral: { bg: colors.neutralBg, text: colors.neutralText },
  info:    { bg: colors.infoBg, text: colors.infoText },
  warning: { bg: colors.warningBg, text: colors.warningText },
  success: { bg: colors.successBg, text: colors.successText },
  danger:  { bg: colors.dangerBg, text: colors.dangerText },
};

const STATUS_TONE = {
  draft: 'neutral', withdrawn: 'neutral', pending: 'neutral',
  published: 'info', open: 'info', terminated: 'danger', submitted: 'info', sent: 'info',
  closed: 'warning', under_review: 'warning', shortlisted: 'warning', pending_approval: 'warning', evaluating: 'warning',
  awarded: 'success', qualified: 'success', active: 'success', delivered: 'success', approved: 'success',
  rejected: 'danger', cancelled: 'danger', inactive: 'danger', suspended: 'danger',
};

export function StatusBadge({ status, label }) {
  const t = TONES[STATUS_TONE[status] || 'neutral'];
  return (
    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: radius.sm, textTransform: 'uppercase', letterSpacing: '0.04em', background: t.bg, color: t.text, whiteSpace: 'nowrap' }}>
      {label ?? String(status || 'pending').replace(/_/g, ' ')}
    </span>
  );
}

export function Page({ width = 1100, children }) {
  return <div style={{ padding: '32px 24px', maxWidth: width, margin: '0 auto' }}>{children}</div>;
}

export function AdminPage({ width, children }) {
  return <AdminLayout><Page width={width}>{children}</Page></AdminLayout>;
}

export function Heading({ title, description, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: colors.primary, letterSpacing: '-0.02em', margin: '0 0 4px' }}>{title}</h1>
        {description && <p style={{ fontSize: '0.8rem', color: colors.textMuted, margin: 0, lineHeight: 1.55 }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** A server error shown on the page itself (the message the server sent), not only in the network tab. */
export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <p role="alert" style={{ margin: '0 0 14px', padding: '10px 14px', borderRadius: radius.sm, fontSize: '0.8rem', lineHeight: 1.5, background: colors.dangerBg, color: colors.dangerText, overflowWrap: 'anywhere' }}>
      {message}
    </p>
  );
}

export function Loading() {
  return <p style={{ padding: 32, textAlign: 'center', color: colors.textMuted, margin: 0 }}>Loading…</p>;
}

export function Empty({ icon: Icon, children }) {
  return (
    <div style={{ ...card, padding: 48, textAlign: 'center' }}>
      {Icon && <Icon size={32} style={{ color: colors.tint(0.35), margin: '0 auto 10px', display: 'block' }} />}
      <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: colors.textMuted }}>{children}</p>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: `1.5px solid ${colors.tint(0.18)}` }}>
      {tabs.map(([key, label]) => (
        <button key={key} type="button" onClick={() => onChange(key)}
          style={{ padding: '9px 16px', background: 'none', border: 'none', fontFamily: 'inherit', fontSize: '0.82rem', cursor: 'pointer', marginBottom: -1.5,
            fontWeight: value === key ? 700 : 500, color: value === key ? colors.primary : colors.textMuted,
            borderBottom: `2px solid ${value === key ? colors.primary : 'transparent'}` }}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Table({ head, children }) {
  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function GroupBadge({ group }) {
  if (!group) return null;
  return <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '2px 8px', borderRadius: radius.sm, background: colors.infoBg, color: colors.infoText, whiteSpace: 'nowrap' }}>{GROUP_LABELS[group] || group}</span>;
}

const rowLabel = { flex: '0 0 220px', maxWidth: '100%', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.primaryDeep, paddingTop: 2 };
const rowBox = (first) => ({ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', padding: '11px 18px', borderTop: first ? 'none' : `1px solid ${colors.tint(0.08)}` });
const miniBtn = { background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontSize: '0.8rem', cursor: 'pointer', ...linkStyle };

/** One attachment: its type, name, upload date and time, and Open (PDF and HTML) / Download. `onOpen(doc, inline)` fetches the file. */
export function AttachmentRow({ doc: d, onOpen, extra }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 14px', fontSize: '0.82rem', color: colors.text }}>
      <span style={{ fontWeight: 700, minWidth: 120 }}>{DOC_TYPE_LABELS[d.type || d.document_type] || 'Other'}</span>
      <span style={{ overflowWrap: 'anywhere', flex: '1 1 200px' }}>{d.name}</span>
      <span style={{ color: colors.textMuted }}>{fmtDateTime(d.uploaded_at || d.created_at)}{d.size || d.file_size ? ` · ${fmtSize(d.size || d.file_size)}` : ''}</span>
      <span style={{ display: 'inline-flex', gap: 12 }}>
        {d.viewable !== false && ['pdf', 'html', 'htm'].includes(String(d.extension || '').toLowerCase()) && <button type="button" style={miniBtn} onClick={() => onOpen(d, true)}>Open</button>}
        <button type="button" style={miniBtn} onClick={() => onOpen(d, false)}>Download</button>
        {extra}
      </span>
    </div>
  );
}

/**
 * The notice details of a tender, as a procurement notice lays them out, then its lots and attachments.
 * `extra` adds rows ([label, value]); `onOpen(doc, inline)` opens or downloads an attachment.
 */
export function NoticeDetails({ tender: t, extra = [], onOpen }) {
  const rows = [
    ['OCID', t.ocid],
    ['Tender number', t.tender_number],
    ['Notice type', t.notice_type && t.notice_type !== 'tender' ? NOTICE_TYPE_LABELS[t.notice_type] : null],
    ['Title', t.title],
    ['Procuring entity', t.procuring_entity],
    ['Procurement method', METHOD_LABELS[t.procurement_method] || t.procurement_method],
    ['Procurement category', CATEGORY_LABELS[t.category] || t.category],
    ['Submission methods', SUBMISSION_LABELS[t.submission_method] || t.submission_method],
    ['Reservation scheme', t.reservation_scheme && (GROUP_LABELS[t.reservation_scheme] || t.reservation_scheme)],
    ['Opening venue', t.opening_venue],
    ['Published date', fmtLongDate(t.published_at)],
    ['Close date and time', fmtDateTime(t.submission_deadline)],
    ['Tender fee', fmtFee(t.tender_fee, t.currency)],
    ['Tender validity in days', t.validity_days],
    ['Financial year', t.financial_year],
    ['Preference and reservation scheme', t.has_preference_scheme ? 'YES' : 'NO'],
    ['Public link', t.public_link && <a href={t.public_link} target="_blank" rel="noopener noreferrer" style={{ ...linkStyle, wordBreak: 'break-all' }}>{t.public_link}</a>],
    ...extra,
  ].filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false);

  const docs = t.documents || [];
  const lots = t.lots || [];

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      {rows.map(([label, value], i) => (
        <div key={label} style={rowBox(i === 0)}>
          <div style={rowLabel}>{label}</div>
          <div style={{ flex: '1 1 260px', minWidth: 0, fontSize: '0.85rem', color: colors.text, overflowWrap: 'anywhere' }}>{value}</div>
        </div>
      ))}
      {lots.length > 0 && (
        <div style={rowBox(false)}>
          <div style={rowLabel}>Lots</div>
          <div style={{ flex: '1 1 260px', minWidth: 0, display: 'grid', gap: 8 }}>
            {lots.map(l => (
              <div key={l.code} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px', fontSize: '0.85rem', color: colors.text }}>
                <strong>Lot {l.code}</strong>
                <span style={{ overflowWrap: 'anywhere' }}>{l.title}</span>
                <GroupBadge group={l.reservation_group} />
                {l.description && <span style={{ flexBasis: '100%', color: colors.textMuted, fontSize: '0.8rem' }}>{l.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={rowBox(false)}>
        <div style={rowLabel}>Attachments</div>
        <div style={{ flex: '1 1 260px', minWidth: 0, display: 'grid', gap: 10 }}>
          {docs.length === 0 && <span style={{ fontSize: '0.85rem', color: colors.textMuted }}>None</span>}
          {docs.map(d => <AttachmentRow key={d.id} doc={d} onOpen={onOpen} />)}
        </div>
      </div>
    </div>
  );
}
