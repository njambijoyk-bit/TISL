import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { colors, card } from '../../../theme/tokens';

/**
 * Admin modal shell. Rendered in a portal on <body>, and it stops submit
 * events from bubbling up the React tree — so a modal <form> opened from
 * inside another form (e.g. the variant editor inside ProductForm) never
 * submits the outer form.
 * Closes on Escape and backdrop click, locks body scroll,
 * and moves focus inside on open.
 *
 * @param {string}    title
 * @param {string}    subtitle   one line under the title
 * @param {ReactNode} footer     usually <ModalActions>
 * @param {number}    width      max width in px (default 520)
 */
export default function Modal({ title, subtitle, onClose, children, footer, width = 520 }) {
  const panelRef = useRef(null);
  // Keep the latest onClose without re-running the mount effect (which would
  // steal focus back to the first field on every parent re-render).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // focus the first field, else the panel
    const first = panelRef.current?.querySelector('input, select, textarea, button:not([data-close])');
    (first ?? panelRef.current)?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return createPortal(
    <div
      onSubmit={(e) => e.stopPropagation()}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: colors.overlay, backdropFilter: 'blur(6px)',
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{
          ...card, width: '100%', maxWidth: width, maxHeight: 'calc(100vh - 32px)',
          display: 'flex', flexDirection: 'column', outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '20px 24px 14px' }}>
          <div>
            <p style={{ fontSize: '0.95rem', fontWeight: 700, color: colors.text, margin: 0 }}>{title}</p>
            {subtitle && <p style={{ fontSize: '0.75rem', color: colors.textFaint, margin: '4px 0 0' }}>{subtitle}</p>}
          </div>
          <button type="button" data-close onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, display: 'flex', padding: 2 }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '4px 24px 20px', overflowY: 'auto' }}>{children}</div>
        {footer && (
          <div style={{ padding: '14px 24px', borderTop: `1px solid ${colors.tint(0.08)}` }}>{footer}</div>
        )}
      </div>
    </div>
  , document.body);
}
