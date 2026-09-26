import { useTheme } from '../../../_shared/theme';
import { MODE_OPTIONS } from '../../../_shared/theme/themeConstants';
import useCurrencyStore from '../../../_shared/store/currencyStore';
import { Sun, Moon, Monitor, Palette, Type, Layers, CheckCircle2 } from 'lucide-react';

const MODE_ICONS = { system: Monitor, light: Sun, dark: Moon };

function Card({ title, icon: Icon, children }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-primary)',
      borderRadius: 14,
      padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)',
        }}>
          <Icon size={15} style={{ color: 'var(--color-primary-500)' }} />
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function OptionRow({ label, active, onClick, swatch }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
        width: '100%', textAlign: 'left', fontFamily: 'inherit',
        background: active
          ? 'color-mix(in srgb, var(--color-primary-500) 10%, var(--bg-secondary))'
          : 'var(--bg-secondary)',
        outline: active ? '2px solid var(--color-primary-500)' : '2px solid transparent',
        transition: 'all 150ms',
      }}
    >
      {swatch && (
        <span style={{
          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
          background: swatch,
          border: '2px solid var(--border-primary)',
          boxShadow: active ? '0 0 0 2px var(--color-primary-500)' : 'none',
        }} />
      )}
      <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: active ? 600 : 400, color: 'var(--text-primary)' }}>
        {label}
      </span>
      {active && <CheckCircle2 size={15} style={{ color: 'var(--color-primary-500)', flexShrink: 0 }} />}
    </button>
  );
}

export default function AppearanceSettings() {
  const {
    colourings, fonts, iconStyles,
    activeColouringId, mode, headingFontId, bodyFontId, iconStyleId,
    setColouring, setMode, setHeadingFont, setBodyFont, setIconStyle,
    loading,
  } = useTheme();

  const currencies    = useCurrencyStore(s => s.currencies);
  const displayCurrency = useCurrencyStore(s => s.displayCurrency);
  const setDisplayCurrency = useCurrencyStore(s => s.setDisplayCurrency);

  const activeColourings = colourings.filter(c => c.is_active !== false);
  const activeFonts      = fonts.filter(f => f.is_active !== false);
  const activeIconStyles = iconStyles.filter(s => s.is_active !== false);

  if (loading) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ height: 120, borderRadius: 14, background: 'var(--bg-secondary)', animation: 'pulse 1.8s ease-in-out infinite' }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px 60px', display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
          Appearance
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Personalise how the site looks and feels for you.
        </p>
      </div>

      {/* Mode */}
      <Card title="Display mode" icon={Sun}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {MODE_OPTIONS.map(({ value, label }) => {
            const Icon = MODE_ICONS[value];
            const active = mode === value;
            return (
              <button
                key={value}
                onClick={() => setMode(value)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '14px 8px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: active
                    ? 'color-mix(in srgb, var(--color-primary-500) 12%, var(--bg-secondary))'
                    : 'var(--bg-secondary)',
                  outline: active ? '2px solid var(--color-primary-500)' : '2px solid transparent',
                  color: active ? 'var(--color-primary-600)' : 'var(--text-secondary)',
                  fontWeight: active ? 700 : 400,
                  fontSize: '0.8rem',
                  transition: 'all 150ms',
                }}
              >
                <Icon size={20} />
                {label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Colour Theme */}
      {activeColourings.length > 0 && (
        <Card title="Colour theme" icon={Palette}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeColourings.map(c => (
              <OptionRow
                key={c.id}
                label={c.name}
                active={activeColouringId === c.id}
                swatch={c.light_tokens?.['--color-primary-500']}
                onClick={() => setColouring(c.id)}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Fonts */}
      {activeFonts.length > 0 && (
        <Card title="Typography" icon={Type}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Heading font */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
                Heading font
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeFonts.map(f => (
                  <OptionRow
                    key={`h-${f.id}`}
                    label={<span style={{ fontFamily: `'${f.family}', sans-serif` }}>{f.family}</span>}
                    active={headingFontId === f.id}
                    onClick={() => setHeadingFont(f.id)}
                  />
                ))}
              </div>
            </div>

            {/* Body font */}
            <div>
              <p style={{ margin: '0 0 8px', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
                Body font
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeFonts.map(f => (
                  <OptionRow
                    key={`b-${f.id}`}
                    label={<span style={{ fontFamily: `'${f.family}', sans-serif` }}>{f.family}</span>}
                    active={bodyFontId === f.id}
                    onClick={() => setBodyFont(f.id)}
                  />
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}


      {/* Currency */}
      {currencies?.length > 1 && (
        <Card title="Currency" icon={Layers}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {currencies.map(c => (
              <OptionRow
                key={c.code}
                label={`${c.code} — ${c.name ?? c.code}`}
                active={displayCurrency === c.code || (!displayCurrency && c.is_base)}
                onClick={() => setDisplayCurrency(c.code)}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
