import { useState, useRef, useEffect } from 'react';
import { useTheme } from '../../theme';
import useCurrencyStore from '../../store/currencyStore';

const MODE_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };
const MODE_ICONS  = { system: '⊙', light: '☀', dark: '☾' };

// Generic outside-click-closing dropdown
function Dropdown({ trigger, children, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <div onClick={() => setOpen(o => !o)}>{trigger(open)}</div>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          [align === 'right' ? 'right' : 'left']: 0,
          minWidth: 200,
          background: 'var(--bg-card, var(--bg-primary))',
          border: '1px solid var(--border-primary, var(--border-light))',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          zIndex: 9999,
          overflow: 'hidden',
        }}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      padding: '8px 14px 4px',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
      textTransform: 'uppercase',
      color: 'var(--text-muted, var(--text-tertiary))',
      borderTop: '1px solid var(--border-primary, var(--border-light))',
      marginTop: 4,
    }}>
      {children}
    </div>
  );
}

function DropItem({ label, active, onClick, preview, suffix }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', textAlign: 'left',
        padding: '8px 14px',
        border: 'none', cursor: 'pointer',
        background: active
          ? 'var(--color-primary-50, color-mix(in srgb, var(--color-primary-500) 4%, var(--bg-primary)))'
          : hovered ? 'var(--bg-secondary, #f9fafb)' : 'transparent',
        color: active
          ? 'var(--color-primary-700, var(--color-primary-700))'
          : 'var(--text-primary, #111827)',
        fontSize: 13, fontWeight: active ? 600 : 400,
        display: 'flex', alignItems: 'center', gap: 8,
        transition: 'background 0.1s',
      }}
    >
      {preview && (
        <span style={{
          width: 13, height: 13, borderRadius: '50%',
          background: preview,
          border: '1px solid var(--border-primary, var(--border-light))',
          flexShrink: 0,
        }} />
      )}
      <span style={{ flex: 1 }}>{label}</span>
      {suffix && <span style={{ fontSize: 11, opacity: 0.55 }}>{suffix}</span>}
      {active && <span style={{ fontSize: 11 }}>✓</span>}
    </button>
  );
}

export function ThemePicker() {
  const {
    colourings, fonts, iconStyles,
    activeColouringId, mode, headingFontId, bodyFontId, iconStyleId,
    setColouring, setMode, setHeadingFont, setBodyFont, setIconStyle,
    loading,
  } = useTheme();

  const currencies = useCurrencyStore(st => st.currencies);
  const displayCurrency = useCurrencyStore(st => st.displayCurrency);
  const setDisplayCurrency = useCurrencyStore(st => st.setDisplayCurrency);

  if (loading) return null;

  const activeColouring = colourings.find(c => c.id === activeColouringId);
  const activeFonts = fonts.filter(f => f.is_active);
  const activeIconStyles = iconStyles.filter(s => s.is_active);
  const showIcons = activeIconStyles.length > 1;
  const showCurrency = currencies && currencies.length > 1;

  // Trigger button label: show active colouring name or mode icon
  const triggerLabel = activeColouring?.name ?? 'Appearance';

  return (
    <Dropdown
      align="right"
      trigger={(open) => (
        <button
          title="Appearance settings"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 9, cursor: 'pointer',
            border: '1px solid var(--border-primary, var(--border-light))',
            background: open
              ? 'var(--bg-secondary, #f9fafb)'
              : 'transparent',
            color: 'var(--text-primary, #374151)',
            fontSize: 13, fontWeight: 500,
            transition: 'background 0.15s',
          }}
        >
          <span style={{ fontSize: 15 }}>{MODE_ICONS[mode]}</span>
          <span style={{
            maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', fontSize: 12,
          }}>
            {triggerLabel}
          </span>
          <span style={{ fontSize: 9, opacity: 0.4 }}>▾</span>
        </button>
      )}
    >
      {(close) => (
        <>
          {/* Mode */}
          <div style={{ padding: '8px 14px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-muted, var(--text-tertiary))' }}>
            Mode
          </div>
          {Object.entries(MODE_LABELS).map(([val, label]) => (
            <DropItem key={val} label={label} active={mode === val}
              suffix={MODE_ICONS[val]}
              onClick={() => { setMode(val); close(); }} />
          ))}

          {/* Colour Theme */}
          {colourings.filter(c => c.is_active).length > 0 && (
            <>
              <SectionLabel>Colour Theme</SectionLabel>
              {colourings.filter(c => c.is_active).map(c => (
                <DropItem key={c.id} label={c.name} active={activeColouringId === c.id}
                  preview={c.light_tokens?.['--color-primary-500'] ?? null}
                  onClick={() => { setColouring(c.id); close(); }} />
              ))}
            </>
          )}

          {/* Heading Font */}
          {activeFonts.length > 0 && (
            <>
              <SectionLabel>Heading Font</SectionLabel>
              {activeFonts.map(f => (
                <DropItem key={`h-${f.id}`} label={f.family} active={headingFontId === f.id}
                  onClick={() => { setHeadingFont(f.id); }} />
              ))}
            </>
          )}

          {/* Body Font */}
          {activeFonts.length > 0 && (
            <>
              <SectionLabel>Body Font</SectionLabel>
              {activeFonts.map(f => (
                <DropItem key={`b-${f.id}`} label={f.family} active={bodyFontId === f.id}
                  onClick={() => { setBodyFont(f.id); }} />
              ))}
            </>
          )}

          {/* Icon Style */}
          {showIcons && (
            <>
              <SectionLabel>Icons</SectionLabel>
              {activeIconStyles.map(s => (
                <DropItem key={s.id} label={s.name} active={iconStyleId === s.id}
                  onClick={() => { setIconStyle(s.id); close(); }} />
              ))}
            </>
          )}

          {/* Currency */}
          {showCurrency && (
            <>
              <SectionLabel>Currency</SectionLabel>
              {currencies.map(c => (
                <DropItem key={c.code} label={`${c.code} — ${c.name ?? c.code}`}
                  active={displayCurrency === c.code || (!displayCurrency && c.is_base)}
                  onClick={() => { setDisplayCurrency(c.code); close(); }} />
              ))}
            </>
          )}
        </>
      )}
    </Dropdown>
  );
}
