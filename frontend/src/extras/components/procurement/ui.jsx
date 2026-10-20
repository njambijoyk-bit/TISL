import AdminLayout from '../../../_shared/components/layout/AdminLayout';
import { colors, card, radius } from '../../../_shared/theme/tokens';
import { th } from './format';

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
