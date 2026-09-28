import React, { useEffect, useRef, useState } from 'react';
import { Languages } from 'lucide-react';

/**
 * Translate entry point. We rely on the browser's built-in page translation
 * (Chrome / Edge / Safari) rather than a custom i18n layer, so this is just the
 * Lucide "Languages" icon with a short hint on how to translate the page.
 *
 * `iconOnly` = compact header button; otherwise a labelled control (menus).
 */
export default function TranslateButton({ dark = false, color = '#374151', iconOnly = false }) {
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

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Translate this page"
        aria-label="Translate this page"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          height: 36, width: iconOnly ? 36 : undefined, padding: iconOnly ? 0 : '0 12px',
          justifyContent: 'center', borderRadius: 9,
          border: iconOnly ? 'none' : `1px solid ${dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)'}`,
          background: iconOnly ? 'none' : (dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
          color, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
        }}
        className={iconOnly ? 'dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700' : ''}
      >
        <Languages size={17} />
        {!iconOnly && <span>Translate</span>}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 999,
            background: dark ? '#1f1b2e' : 'white', borderRadius: 12, width: 250,
            boxShadow: '0 16px 44px rgba(0,0,0,0.16)',
            border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : '#f3f4f6'}`,
            padding: 14, color: dark ? '#e4e4e7' : '#374151',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Languages size={16} style={{ color: 'var(--color-primary-500)' }} />
            <strong style={{ fontSize: '0.85rem' }}>Translate this page</strong>
          </div>
          <p style={{ margin: 0, fontSize: '0.78rem', lineHeight: 1.5, color: dark ? '#a1a1aa' : '#6b7280' }}>
            Use your browser's built-in translator to read this site in your language:
          </p>
          <ul style={{ margin: '8px 0 0', padding: '0 0 0 16px', fontSize: '0.76rem', lineHeight: 1.6, color: dark ? '#a1a1aa' : '#6b7280' }}>
            <li>Right-click the page → <strong>Translate</strong>, or</li>
            <li>Click the translate icon in your browser's address bar.</li>
          </ul>
        </div>
      )}
    </div>
  );
}
