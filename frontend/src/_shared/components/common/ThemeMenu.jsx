import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../../theme';

const MODES = [
  { v: 'system', Icon: Monitor, label: 'System' },
  { v: 'light',  Icon: Sun,     label: 'Light' },
  { v: 'dark',   Icon: Moon,    label: 'Dark' },
];
const PANEL_W = 208;
const MARGIN = 10;

/**
 * Appearance + colour menu. One component for the admin sidebar and the public
 * careers pages. The panel is fixed-positioned from the button and kept inside
 * the viewport, so it never runs over the screen edge.
 *
 * @param {object}  buttonStyle  extra style for the trigger button
 * @param {string}  iconColor    colour of the mode icon in the trigger
 * @param {string}  manageTo     optional link to the full appearance settings
 */
export default function ThemeMenu({ buttonStyle, iconColor = 'var(--text-secondary)', manageTo }) {
  const { colourings, activeColouringId, mode, setColouring, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current.getBoundingClientRect();
      const left = Math.min(Math.max(MARGIN, r.right - PANEL_W), window.innerWidth - PANEL_W - MARGIN);
      setPos({ top: r.bottom + 8, left });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  const ModeIcon = MODES.find((m) => m.v === mode)?.Icon ?? Monitor;
  const active = colourings.find((c) => c.id === activeColouringId);
  const activeSwatch = active?.light_tokens?.['--color-primary-500'] ?? 'var(--color-primary-500)';
  const choices = colourings.filter((c) => c.is_active !== false);
  const head = { padding: '10px 14px 4px', fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-tertiary)' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)} title="Appearance" aria-label="Appearance" aria-expanded={open}
        style={{
          height: 28, minWidth: 28, padding: '0 7px', borderRadius: 6, cursor: 'pointer', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          background: 'var(--surface-input)', border: '1px solid var(--line)', ...buttonStyle,
        }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: activeSwatch, flexShrink: 0 }} />
        <ModeIcon size={12} style={{ color: iconColor }} />
      </button>

      {open && (
        <div role="dialog" aria-label="Appearance" style={{
          position: 'fixed', top: pos.top, left: pos.left, width: PANEL_W, maxWidth: `calc(100vw - ${MARGIN * 2}px)`,
          background: 'var(--surface-card, var(--bg-primary))', color: 'var(--text-primary)',
          border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 12px 36px rgba(0,0,0,0.3)',
          zIndex: 10000, overflow: 'hidden', fontFamily: 'var(--font-body, inherit)',
        }}>
          <div style={head}>Appearance</div>
          <div style={{ display: 'flex', gap: 5, padding: '4px 10px 10px' }}>
            {MODES.map(({ v, Icon, label }) => (
              <button key={v} type="button" onClick={() => setMode(v)} title={label} aria-pressed={mode === v}
                style={{
                  flex: 1, height: 32, borderRadius: 7, cursor: 'pointer', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 11, fontWeight: 600,
                  background: mode === v ? 'color-mix(in srgb, var(--color-primary-500) 16%, var(--surface-card, var(--bg-primary)))' : 'var(--surface-input)',
                  outline: mode === v ? '1.5px solid var(--color-primary-500)' : '1.5px solid transparent',
                  color: mode === v ? 'var(--color-primary-500)' : 'var(--text-secondary)',
                }}>
                <Icon size={13} />
              </button>
            ))}
          </div>

          {choices.length > 0 && (
            <>
              <div style={{ ...head, borderTop: '1px solid var(--line)' }}>Colour</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, padding: '6px 14px 14px' }}>
                {choices.map((c) => {
                  const swatch = c.light_tokens?.['--color-primary-500'] ?? '#a855f7';
                  const on = activeColouringId === c.id;
                  return (
                    <button key={c.id} type="button" title={c.name} aria-label={c.name} onClick={() => { setColouring(c.id); setOpen(false); }}
                      style={{
                        width: 24, height: 24, borderRadius: '50%', border: 'none', cursor: 'pointer', background: swatch,
                        outline: on ? '2.5px solid var(--text-primary)' : '2.5px solid transparent', outlineOffset: 2,
                      }} />
                  );
                })}
              </div>
            </>
          )}

          {manageTo && (
            <div style={{ borderTop: '1px solid var(--line)' }}>
              <Link to={manageTo} onClick={() => setOpen(false)}
                style={{ display: 'block', padding: '10px 14px', fontSize: 12, fontWeight: 500, color: 'var(--color-primary-500)', textDecoration: 'none' }}>
                Manage themes →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
