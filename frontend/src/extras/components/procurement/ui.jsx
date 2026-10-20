import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import { colors, card, radius } from '../../../_shared/theme/tokens';
import { th, linkStyle, fmtLongDate, fmtDateTime, fmtFee, METHOD_LABELS, SUBMISSION_LABELS, CATEGORY_LABELS, DOC_TYPE_LABELS } from './format';

const TONES = {
  neutral: { bg: colors.neutralBg, text: colors.neutralText },
  info:    { bg: colors.infoBg, text: colors.infoText },
  warning: { bg: colors.warningBg, text: colors.warningText },
  success: { bg: colors.successBg, text: colors.successText },
  danger:  { bg: colors.dangerBg, text: colors.dangerText },
};

const STATUS_TONE = {
  draft: 'neutral', withdrawn: 'neutral', pending: 'neutral',
  published: 'info', submitted: 'info', sent: 'info',
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

/**
 * The notice details of a tender, as a procurement notice lays them out.
 * `extra` adds rows ([label, value]) after the standard ones; `documentUrl(doc)` makes the attachments downloadable.
 */
export function NoticeDetails({ tender: t, extra = [], documentUrl }) {
  const rows = [
    ['OCID', t.ocid],
    ['Tender number', t.tender_number],
    ['Title', t.title],
    ['Procurement method', METHOD_LABELS[t.procurement_method] || t.procurement_method],
    ['Procurement category', CATEGORY_LABELS[t.category] || t.category],
    ['Submission methods', SUBMISSION_LABELS[t.submission_method] || t.submission_method],
    ['Reservation scheme', t.reservation_scheme],
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

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      {rows.map(([label, value], i) => (
        <div key={label} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', padding: '11px 18px', borderTop: i ? `1px solid ${colors.tint(0.08)}` : 'none' }}>
          <div style={{ flex: '0 0 220px', maxWidth: '100%', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.primaryDeep, paddingTop: 2 }}>{label}</div>
          <div style={{ flex: '1 1 260px', minWidth: 0, fontSize: '0.85rem', color: colors.text, overflowWrap: 'anywhere' }}>{value}</div>
        </div>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', padding: '11px 18px', borderTop: `1px solid ${colors.tint(0.08)}` }}>
        <div style={{ flex: '0 0 220px', maxWidth: '100%', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: colors.primaryDeep, paddingTop: 2 }}>Attachments</div>
        <div style={{ flex: '1 1 260px', minWidth: 0, display: 'grid', gap: 8 }}>
          {docs.length === 0 && <span style={{ fontSize: '0.85rem', color: colors.textMuted }}>None</span>}
          {docs.map(d => {
            const url = documentUrl?.(d);
            const when = d.uploaded_at || d.created_at;
            return (
              <div key={d.id} style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 14px', fontSize: '0.82rem', color: colors.text }}>
                <span style={{ fontWeight: 600 }}>{DOC_TYPE_LABELS[d.document_type] || 'Tender document'}</span>
                {url
                  ? <a href={url} style={{ ...linkStyle, overflowWrap: 'anywhere' }}>{d.name}</a>
                  : <span style={{ overflowWrap: 'anywhere' }}>{d.name}</span>}
                <span style={{ color: colors.textMuted }}>{fmtDateTime(when)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
