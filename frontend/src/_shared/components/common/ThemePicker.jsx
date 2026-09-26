import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../theme';

const MODE_ICONS = { system: '⊙', light: '☀', dark: '☾' };

function Dropdown({ label, icon, children, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={label}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          padding: '6px 10px', borderRadius: '8px', cursor: 'pointer',
          border: '1px solid var(--border-primary)',
          background: open ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          fontSize: '13px', fontWeight: 500,
          transition: 'background 0.15s',
        }}
      >
        <span style={{ fontSize: '16px' }}>{icon}</span>
        <span style={{ display: 'none' }}>{label}</span>
        <span style={{ fontSize: '10px', opacity: 0.5 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          [align === 'right' ? 'right' : 'left']: 0,
          minWidth: '180px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-primary)',
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 9999,
          overflow: 'hidden',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

function DropItem({ label, active, onClick, preview }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '9px 14px',
        border: 'none', cursor: 'pointer',
        background: active ? 'var(--color-primary-50)' : 'transparent',
        color: active ? 'var(--color-primary-700)' : 'var(--text-primary)',
        fontSize: '13px', fontWeight: active ? 600 : 400,
        display: 'flex', alignItems: 'center', gap: '8px',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {preview && (
        <span style={{
          width: '14px', height: '14px', borderRadius: '50%',
          background: preview, border: '1px solid var(--border-secondary)',
          flexShrink: 0,
        }} />
      )}
      {label}
      {active && <span style={{ marginLeft: 'auto', fontSize: '11px' }}>✓</span>}
    </button>
  );
}

function Divider({ label }) {
  return (
    <div style={{
      padding: '6px 14px 2px',
      fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
      textTransform: 'uppercase', color: 'var(--text-muted)',
      borderTop: '1px solid var(--border-primary)',
      marginTop: '4px',
    }}>
      {label}
    </div>
  );
}

export function ThemePicker() {
  const {
    colourings, fonts, iconStyles,
    activeColouringId, mode, headingFontId, bodyFontId, iconStyleId,
    setColouring, setMode, setHeadingFont, setBodyFont, setIconStyle,
    loading,
  } = useTheme();

  if (loading) return null;

  const activeColouring = colourings.find(c => c.id === activeColouringId);
  const primaryColor = activeColouring?.light_tokens?.['--color-primary-500'] ?? 'var(--color-primary-500)';

  const activeFonts = fonts.filter(f => f.is_active);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      {/* Mode toggle */}
      <Dropdown label="Display mode" icon={MODE_ICONS[mode] ?? '⊙'}>
        {['system', 'light', 'dark'].map(m => (
          <DropItem key={m} label={m.charAt(0).toUpperCase() + m.slice(1)} active={mode === m}
            onClick={() => setMode(m)} preview={null} />
        ))}
      </Dropdown>

      {/* Colouring picker */}
      <Dropdown label="Theme" icon="🎨" align="right">
        {colourings.filter(c => c.is_active).map(c => (
          <DropItem key={c.id} label={c.name} active={activeColouringId === c.id}
            onClick={() => setColouring(c.id)}
            preview={c.light_tokens?.['--color-primary-500'] ?? null}
          />
        ))}
      </Dropdown>

      {/* Font picker */}
      <Dropdown label="Font" icon="Aa" align="right">
        <Divider label="Heading" />
        {activeFonts.map(f => (
          <DropItem key={`h-${f.id}`} label={f.family} active={headingFontId === f.id}
            onClick={() => setHeadingFont(f.id)} />
        ))}
        <Divider label="Body" />
        {activeFonts.map(f => (
          <DropItem key={`b-${f.id}`} label={f.family} active={bodyFontId === f.id}
            onClick={() => setBodyFont(f.id)} />
        ))}
      </Dropdown>

      {/* Icon style picker */}
      {iconStyles.filter(s => s.is_active).length > 1 && (
        <Dropdown label="Icons" icon="◻" align="right">
          {iconStyles.filter(s => s.is_active).map(s => (
            <DropItem key={s.id} label={s.name} active={iconStyleId === s.id}
              onClick={() => setIconStyle(s.id)} />
          ))}
        </Dropdown>
      )}
    </div>
  );
}
