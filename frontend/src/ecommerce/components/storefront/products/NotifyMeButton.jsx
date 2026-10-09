import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X } from 'lucide-react';
import stockAlertsAPI from '../../../../_shared/api/stockAlerts';
import StockAlertForm from './StockAlertForm';

/**
 * "Notify me" on a card for an out-of-stock product or hamper: a small button that opens the "email me when it is back" form in a dialog (a card has no room for it). The dialog is drawn on the page itself, not inside the card: a card that lifts on hover would otherwise trap it.
 * Nothing is drawn when the company has switched the alerts off. Clicks do not follow the card's own link.
 */
export default function NotifyMeButton({ productId, hamperId, name, className = '', style }) {
  const [on, setOn] = useState(false);
  const [open, setOpen] = useState(false);
  const opener = useRef(null);
  useEffect(() => { let live = true; stockAlertsAPI.enabled().then((v) => live && setOn(!!v)); return () => { live = false; }; }, []);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); opener.current?.focus(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!on) return null;
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };   // (the opening button sits inside the card's link)
  const keep = (e) => e.stopPropagation();   // inside the dialog a click must still reach its own buttons (a submit is a click)
  const close = () => { setOpen(false); opener.current?.focus(); };
  return (
    <>
      <button ref={opener} type="button" className={className} onClick={(e) => { stop(e); setOpen(true); }}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1.5px solid var(--color-primary-500)', background: 'transparent', color: 'var(--color-primary-600, var(--color-primary-500))', fontWeight: 700, fontSize: '0.78rem', fontFamily: 'inherit', cursor: 'pointer', ...style }}>
        <Bell size={13} aria-hidden="true" /> Notify me
      </button>
      {open && createPortal(
        <div role="presentation" onClick={(e) => { keep(e); if (e.target === e.currentTarget) close(); }} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,10,30,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="dialog" aria-modal="true" aria-label={`Tell me when ${name || 'this'} is back`} onClick={keep} style={{ width: '100%', maxWidth: 420, background: 'var(--surface-card, #fff)', color: 'var(--text-primary, #111827)', borderRadius: 14, padding: 20, boxShadow: '0 24px 80px rgba(0,0,0,0.3)', cursor: 'default' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, marginBottom: 12 }}>
              <strong style={{ fontSize: '0.95rem' }}>{name || 'This item'} is out of stock</strong>
              <button type="button" onClick={close} aria-label="Close" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', padding: 2 }}><X size={18} /></button>
            </div>
            <StockAlertForm productId={productId} hamperId={hamperId} bare />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
