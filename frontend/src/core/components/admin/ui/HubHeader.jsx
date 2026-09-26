import { colors } from '../../../../_shared/theme/tokens';

/** Page title block for the admin hubs, with an optional action on the right. */
export default function HubHeader({ title, description, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: colors.primary, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
          {title}
        </h1>
        {description && <p style={{ fontSize: '0.8rem', color: colors.textMuted, margin: 0, lineHeight: 1.55 }}>{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Row of filters / actions above a table. */
export function Toolbar({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{children}</div>
      {right && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>}
    </div>
  );
}

/** Shown when a role can't see a whole page. */
export function NoAccess({ what = 'this page' }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: '0.95rem', fontWeight: 700, color: colors.text, margin: '0 0 6px' }}>You don't have access to {what}</p>
      <p style={{ fontSize: '0.8rem', color: colors.textMuted, margin: 0 }}>It's available to finance, manager, admin and super admin users.</p>
    </div>
  );
}
