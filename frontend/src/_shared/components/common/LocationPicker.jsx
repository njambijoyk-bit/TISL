import React from 'react';
import { MapPin } from 'lucide-react';
import useLocationStore from '../../store/locationStore';

/**
 * Storefront branch picker. Renders only when the business has more than one
 * branch. Changing it stores the choice (axios sends X-Location) and reloads so
 * the whole storefront re-scopes to that branch's catalogue, prices and stock.
 */
export default function LocationPicker({ dark = false, color = '#374151', compact = false }) {
  const locations = useLocationStore((s) => s.locations);
  const currentId = useLocationStore((s) => s.currentId);
  const setLocation = useLocationStore((s) => s.setLocation);

  if (!locations || locations.length <= 1) return null;

  const current = locations.find((l) => l.id === currentId)
    || locations.find((l) => l.is_default)
    || locations[0];

  const onChange = (e) => {
    const id = Number(e.target.value);
    if (id && id !== current?.id) {
      setLocation(id);
      // Re-scope everything to the chosen branch.
      window.location.reload();
    }
  };

  return (
    <label
      title="Choose branch"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: compact ? '4px 8px' : '6px 10px', borderRadius: 9,
        border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)'}`,
        color, fontSize: '0.8rem', cursor: 'pointer',
        background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
      }}
    >
      <MapPin size={14} style={{ flexShrink: 0, color: 'var(--color-primary-500)' }} />
      <select
        value={current?.id || ''}
        onChange={onChange}
        style={{
          border: 'none', background: 'transparent', color, fontFamily: 'inherit',
          fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', outline: 'none', maxWidth: 160,
        }}
      >
        {locations.map((l) => (
          <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>
        ))}
      </select>
    </label>
  );
}
