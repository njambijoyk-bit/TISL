import { useState } from 'react';
import { useWideScreen } from './voucherKeys';
import { colors } from '../../../../_shared/theme/tokens';

const row = (active, disabled) => ({
  display: 'flex', gap: 8, alignItems: 'baseline', textAlign: 'left', width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: '0.78rem', fontFamily: 'inherit',
  border: `1px solid ${colors.tint(active ? 0.45 : 0.16)}`, background: active ? colors.tint(0.18) : colors.surface, color: colors.text,
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
});

/**
 * A voucher form with a column of action buttons on its right, as in Tally: each shows its key. The keys work on any screen; the panel itself shows only on a large one.
 * actions: [{ keys: 'F2', label: 'Date', note?, onClick, disabled?, active?, submenu?: [{ label, onClick, active? }] }]; { gap: true } leaves a space.
 * Colours come from the theme, so it follows light and dark.
 */
export default function WithSidePanel({ actions, children }) {
  const wide = useWideScreen();
  const [openMenu, setOpenMenu] = useState(null);
  if (!wide) return children;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px', gap: 16, alignItems: 'start' }}>
      <div style={{ minWidth: 0 }}>{children}</div>
      <aside aria-label="Voucher actions" style={{ position: 'sticky', top: 72, display: 'grid', gap: 4, background: colors.tint(0.05), border: `1px solid ${colors.tint(0.12)}`, borderRadius: 10, padding: 8, maxHeight: 'calc(100vh - 96px)', overflowY: 'auto' }}>
        {actions.map((a, i) => {
          if (a.gap) return <div key={`g${i}`} style={{ height: 8 }} />;
          const menu = a.submenu && openMenu === i;
          return (
            <div key={`${a.keys}${a.label}`}>
              <button type="button" disabled={a.disabled} title={a.note} onClick={() => (a.submenu ? setOpenMenu(menu ? null : i) : a.onClick?.())} style={row(a.active, a.disabled)}>
                <span style={{ fontWeight: 700, color: colors.primary, minWidth: 44 }}>{a.keys}</span>
                <span style={{ flex: 1 }}>{a.label}{a.note && <span style={{ display: 'block', fontSize: '0.68rem', color: colors.textFaint }}>{a.note}</span>}</span>
                {a.submenu && <span aria-hidden style={{ color: colors.textFaint }}>{menu ? '▾' : '▸'}</span>}
              </button>
              {menu && (
                <div style={{ display: 'grid', gap: 3, margin: '4px 0 2px 10px' }}>
                  {a.submenu.map((s) => <button key={s.label} type="button" onClick={() => { setOpenMenu(null); s.onClick(); }} style={row(s.active, false)}><span style={{ flex: 1 }}>{s.label}</span></button>)}
                </div>
              )}
            </div>
          );
        })}
      </aside>
    </div>
  );
}
