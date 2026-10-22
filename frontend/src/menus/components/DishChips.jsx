import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { TextInput } from '../../core/components/admin/ui/Form';
import { btnGhost, colors } from '../../_shared/theme/tokens';

const small = { ...btnGhost, padding: '4px 10px', fontSize: '0.72rem', whiteSpace: 'nowrap' };

/**
 * The dishes picked for something (a delivery day), shown as chips that can be taken off, with a button that opens a searchable list of checkboxes to add or remove several at once.
 * `dishes` is [{id, name}], `value` the picked ids, `label` names it for screen readers.
 */
export default function DishChips({ dishes, value, onChange, label, addLabel = 'Add dishes' }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const name = (id) => dishes.find((d) => d.id === id)?.name ?? 'A dish that is gone';
  const shown = dishes.filter((d) => d.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id, on) => onChange(on ? [...value, id] : value.filter((x) => x !== id));

  return (
    <div data-testid="dish-chips" style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
      {value.length > 0 && (
        <ul aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {value.map((id) => (
            <li key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 4px 3px 9px', borderRadius: 999, background: colors.tint(0.1), fontSize: '0.78rem', lineHeight: 1.2 }}>
              <span>{name(id)}</span>
              <button type="button" aria-label={`Take ${name(id)} off`} onClick={() => onChange(value.filter((x) => x !== id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: 2, display: 'inline-flex' }}><X size={12} /></button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" style={small} aria-expanded={open} aria-label={`${addLabel} for ${label}`} onClick={() => { setOpen((o) => !o); setQ(''); }}>{open ? 'Done' : <><Plus size={12} aria-hidden="true" /> {addLabel}</>}</button>
      </div>
      {open && (
        <div role="group" aria-label={`Dishes for ${label}`} style={{ border: `1px solid ${colors.tint(0.14)}`, borderRadius: 8, padding: 6, display: 'grid', gap: 4, background: 'var(--surface-card, #fff)' }}>
          <TextInput aria-label={`Search dishes for ${label}`} value={q} placeholder="Search" onChange={(e) => setQ(e.target.value)} style={{ fontSize: '0.78rem' }} />
          <div style={{ maxHeight: 190, overflowY: 'auto', display: 'grid', gap: 1 }}>
            {shown.map((d) => (
              <label key={d.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.78rem', padding: '3px 2px', cursor: 'pointer' }}>
                <input type="checkbox" aria-label={`${d.name} for ${label}`} checked={value.includes(d.id)} onChange={(e) => toggle(d.id, e.target.checked)} /> {d.name}
              </label>
            ))}
            {shown.length === 0 && <span style={{ fontSize: '0.74rem', color: colors.textFaint }}>No dish matches.</span>}
          </div>
        </div>
      )}
    </div>
  );
}
