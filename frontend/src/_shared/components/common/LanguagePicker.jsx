import React, { useEffect, useRef, useState } from 'react';
import { Globe, Check, ChevronDown } from 'lucide-react';
import useLanguageStore, { LANGUAGES } from '../../store/languageStore';

/**
 * Language switcher for the header. Stores the chosen language (sent as
 * X-Locale); actual UI translation is a later i18n task.
 *
 * `iconOnly` renders just the globe + dropdown (header); otherwise a labelled
 * control (menus / profile).
 */
export default function LanguagePicker({ dark = false, color = '#374151', iconOnly = false }) {
  const current = useLanguageStore((s) => s.current);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const active = LANGUAGES.find((l) => l.code === current) || LANGUAGES[0];

  const choose = (code) => { setOpen(false); setLanguage(code); };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Language"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 36, padding: iconOnly ? '0 8px' : '0 12px', borderRadius: 9,
          border: `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)'}`,
          background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
          color, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8rem', fontWeight: 600,
        }}
      >
        <Globe size={16} style={{ color: 'var(--color-primary-500)' }} />
        {!iconOnly && <span>{active.native}</span>}
        {iconOnly && <span style={{ textTransform: 'uppercase' }}>{active.code}</span>}
        <ChevronDown size={12} style={{ color: '#9ca3af', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 999,
            background: dark ? '#1f1b2e' : 'white', borderRadius: 10, minWidth: 170,
            boxShadow: '0 16px 44px rgba(0,0,0,0.14)',
            border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : '#f3f4f6'}`,
            padding: 6,
          }}
        >
          {LANGUAGES.map((l) => {
            const selected = l.code === active.code;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => choose(l.code)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, padding: '8px 10px', borderRadius: 8, border: 'none',
                  background: selected ? 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)' : 'transparent',
                  color: dark ? '#e4e4e7' : '#374151', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: '0.82rem', fontWeight: selected ? 700 : 500, textAlign: 'left',
                }}
              >
                <span>{l.native} <span style={{ color: '#9ca3af', fontWeight: 400 }}>· {l.label}</span></span>
                {selected && <Check size={14} style={{ color: 'var(--color-primary-500)' }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
