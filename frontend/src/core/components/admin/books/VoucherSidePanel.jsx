import { useWideScreen } from './voucherKeys';
import { colors } from '../../../../_shared/theme/tokens';

/**
 * A voucher form with a column of action buttons on its right, as in Tally: each shows its key. The keys work on any screen; the panel itself shows only on a large one.
 * actions: [{ keys: 'Ctrl+H', label: 'Change mode', note?, onClick, disabled?, active? }]; a { gap: true } entry leaves a space.
 */
export default function WithSidePanel({ actions, children }) {
  const wide = useWideScreen();
  if (!wide) return children;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px', gap: 16, alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>{children}</div>
      <aside aria-label="Voucher actions" style={{ position: 'sticky', top: 72, display: 'grid', gap: 4, background: colors.tint(0.06), borderRadius: 10, padding: 8 }}>
        {actions.map((a, i) => (a.gap
          ? <div key={`g${i}`} style={{ height: 10 }} />
          : (
            <button key={a.keys + a.label} type="button" onClick={a.onClick} disabled={a.disabled} title={a.note}
              style={{ display: 'flex', gap: 8, alignItems: 'baseline', textAlign: 'left', padding: '7px 10px', border: `1px solid ${colors.tint(0.14)}`, borderRadius: 6, background: a.active ? colors.tint(0.14) : '#fff',
                cursor: a.disabled ? 'default' : 'pointer', opacity: a.disabled ? 0.45 : 1, fontSize: '0.78rem', color: colors.text }}>
              <span style={{ fontWeight: 700, color: colors.primary, minWidth: 58 }}>{a.keys}</span>
              <span style={{ flex: 1 }}>{a.label}{a.note && <span style={{ display: 'block', fontSize: '0.68rem', color: colors.textFaint }}>{a.note}</span>}</span>
            </button>
          )))}
      </aside>
    </div>
  );
}
