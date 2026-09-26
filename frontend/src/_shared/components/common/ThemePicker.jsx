import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Monitor, Settings } from 'lucide-react';
import { useTheme } from '../../theme';

const MODES = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light',  label: 'Light',  Icon: Sun },
  { value: 'dark',   label: 'Dark',   Icon: Moon },
];

const MODE_ICONS = { system: Monitor, light: Sun, dark: Moon };

const MODE_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

export function ThemePicker() {
  const { mode, setMode, loading, colourings, activeColouringId } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  if (loading) return null;

  const ModeIcon = MODE_ICONS[mode] ?? Monitor;
  const activeColouring = colourings.find(c => c.id === activeColouringId);
  const swatch = activeColouring?.light_tokens?.['--color-primary-500'] ?? 'var(--color-primary-500)';
  const label = activeColouring?.name ?? MODE_LABELS[mode] ?? 'Theme';

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        title="Display mode"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px', borderRadius: 9, cursor: 'pointer',
          border: '1px solid var(--border-primary)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontSize: 12, fontWeight: 500,
          transition: 'background 0.15s',
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: swatch, flexShrink: 0 }} />
        <ModeIcon size={13} />
        <span style={{ fontSize: 9, opacity: 0.4 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          minWidth: 190,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
          zIndex: 9999,
          overflow: 'hidden',
          padding: '6px 0',
          isolation: 'isolate',
        }}>
          {/* Mode section */}
          <div style={{ padding: '6px 14px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Display mode
          </div>
          {MODES.map(({ value, label, Icon }) => {
            const active = mode === value;
            return (
              <button
                key={value}
                onClick={() => { setMode(value); setOpen(false); }}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '8px 14px', border: 'none', cursor: 'pointer',
                  background: active
                    ? 'color-mix(in srgb, var(--color-primary-500) 10%, var(--bg-secondary))'
                    : 'transparent',
                  color: active ? 'var(--color-primary-600)' : 'var(--text-primary)',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  display: 'flex', alignItems: 'center', gap: 9,
                  transition: 'background 0.1s',
                }}
              >
                <Icon size={14} style={{ opacity: active ? 1 : 0.6 }} />
                <span style={{ flex: 1 }}>{label}</span>
                {active && <span style={{ fontSize: 11, color: 'var(--color-primary-500)' }}>✓</span>}
              </button>
            );
          })}

          {/* Appearance settings link */}
          <div style={{ borderTop: '1px solid var(--border-primary)', padding: '6px 8px', marginTop: 4 }}>
            <Link
              to="/settings/appearance"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 8px', borderRadius: 8, textDecoration: 'none',
                fontSize: 13, fontWeight: 500,
                color: 'var(--color-primary-600)',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Settings size={14} />
              Appearance settings
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
