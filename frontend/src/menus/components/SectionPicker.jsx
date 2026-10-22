import { colors } from '../../_shared/theme/tokens';

/**
 * Which menu sections (Mains, Drinks...) a dish is listed under, as checkboxes grouped by menu. A dish that is in no section is not on any menu. `sections` is [{id, name, menu}].
 */
export default function SectionPicker({ sections, value, onChange }) {
  if (!sections || sections.length === 0) {
    return <p data-testid="sections-none" style={{ margin: 0, fontSize: '0.78rem', color: colors.textFaint }}>No menu sections yet: make a menu with sections under Menus, Menus, then come back to put the dish on it.</p>;
  }
  const menus = [...new Set(sections.map((s) => s.menu))];

  return (
    <fieldset data-testid="section-picker" style={{ border: `1px solid ${colors.tint(0.12)}`, borderRadius: 10, padding: 12, margin: 0 }}>
      <legend style={{ fontSize: '0.74rem', fontWeight: 700, color: colors.textMuted, padding: '0 6px' }}>On the menu, under</legend>
      <div style={{ display: 'grid', gap: 6 }}>
        {menus.map((m) => (
          <div key={m} style={{ display: 'flex', gap: '4px 16px', flexWrap: 'wrap', alignItems: 'center', fontSize: '0.8rem' }}>
            <strong style={{ minWidth: 120 }}>{m}</strong>
            {sections.filter((s) => s.menu === m).map((s) => (
              <label key={s.id} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <input type="checkbox" aria-label={`${m}: ${s.name}`} checked={value.includes(s.id)} onChange={(e) => onChange(e.target.checked ? [...value, s.id] : value.filter((x) => x !== s.id))} /> {s.name}
              </label>
            ))}
          </div>
        ))}
      </div>
      <div style={{ fontSize: '0.72rem', color: colors.textFaint, marginTop: 6 }}>A dish can be under several (Masala chai is on Breakfast and on Lunch &amp; dinner). A dish under none is not on any menu, so customers do not see it.</div>
    </fieldset>
  );
}
