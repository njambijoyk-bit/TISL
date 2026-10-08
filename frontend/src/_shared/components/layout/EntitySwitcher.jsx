import { useEffect } from 'react';
import { Building2 } from 'lucide-react';
import useEntityStore from '../../store/entityStore';

/**
 * "Viewing: <company>" and a way to change it for this tab. Hidden while the business keeps books for one company.
 */
export default function EntitySwitcher() {
  const { entities, loaded, fetch, choose } = useEntityStore();
  const current = useEntityStore((s) => s.current());

  useEffect(() => { if (!loaded) fetch(); }, [loaded, fetch]);

  if (entities.length < 2 || !current) return null;

  return (
    <label title="The company whose books this tab shows" style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 12px 0', padding: '5px 8px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-primary-600)', background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-primary-500) 25%, transparent)' }}>
      <Building2 size={13} />
      <span style={{ opacity: 0.75 }}>Viewing</span>
      <select value={current.id} onChange={(e) => choose(Number(e.target.value))} aria-label="Company"
        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', cursor: 'pointer', outline: 'none' }}>
        {entities.map((e) => <option key={e.id} value={e.id} style={{ color: 'initial' }}>{e.short_code} · {e.name}</option>)}
      </select>
    </label>
  );
}
