import { Table2, LayoutGrid } from 'lucide-react';

/**
 * The Table / Cards switch. The button that would switch the layout carries data-hotkey="F3", so F3 flips it (see lib/pageHotkeys).
 * `view` and `setView` come from useViewMode.
 */
export default function ViewToggle({ view, setView }) {
  const seg = (v, Icon, label) => (
    <button type="button" aria-pressed={view === v} aria-label={label} title={view === v ? label : `${label} (F3)`} data-hotkey={view === v ? undefined : 'F3'} onClick={() => setView(v)}
      style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        background: view === v ? 'color-mix(in srgb, var(--color-primary-500) 16%, transparent)' : 'transparent', color: view === v ? 'var(--color-primary-600)' : 'var(--text-tertiary)' }}>
      <Icon size={16} />
    </button>
  );
  return (
    <div role="group" aria-label="Layout" style={{ display: 'inline-flex', overflow: 'hidden', borderRadius: 8, border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 20%, transparent)' }}>
      {seg('table', Table2, 'Table')}{seg('cards', LayoutGrid, 'Cards')}
    </div>
  );
}
