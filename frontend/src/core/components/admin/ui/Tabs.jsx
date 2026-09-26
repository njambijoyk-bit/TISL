import { colors } from '../../../../_shared/theme/tokens';

/**
 * Underline tab bar matching ProductForm / CustomerDetail.
 * @param {{id: string, label: string, count?: number}[]} tabs
 */
export default function Tabs({ tabs, active, onChange, style }) {
  return (
    <div role="tablist" style={{
      display: 'flex', gap: 4, overflowX: 'auto', marginBottom: 20,
      borderBottom: `2px solid ${colors.tint(0.1)}`, ...style,
    }}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            style={{
              padding: '10px 16px', fontSize: '0.82rem', fontWeight: on ? 700 : 500, whiteSpace: 'nowrap',
              color: on ? colors.primary : colors.textFaint,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              borderBottom: `2px solid ${on ? colors.primary : 'transparent'}`,
              marginBottom: -2, transition: 'color 150ms',
            }}
          >
            {t.label}
            {t.count != null && (
              <span style={{
                marginLeft: 6, padding: '1px 7px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700,
                background: on ? colors.tint(0.12) : colors.neutralBg, color: on ? colors.primaryDeep : colors.textMuted,
              }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
