import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import VariantPicker from './products/VariantPicker';

/** "Which one?" — shown when a product has more than one variant and the shopper has not chosen yet. */
export default function VariantChooserModal({ product, confirmLabel = 'Add to cart', onConfirm, onClose }) {
  const [choice, setChoice] = useState(null);
  // portalled to <body>: a card that lifts on hover would otherwise trap a fixed-position dialog, and clicks must not reach the card
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Choose an option for ${product.name}`} onClick={(e) => { e.stopPropagation(); onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-card, white)', color: 'inherit', borderRadius: 16, padding: 20, width: 'min(460px, 100%)', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10, marginBottom: 6 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>{product.name}</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6b7280' }}>Choose the option you want.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280' }}><X size={18} /></button>
        </div>
        <div style={{ margin: '14px 0' }}><VariantPicker product={product} onChange={setChoice} /></div>
        <button type="button" disabled={!choice} onClick={() => onConfirm(choice)}
          style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', cursor: choice ? 'pointer' : 'not-allowed', fontWeight: 700, color: 'white', opacity: choice ? 1 : 0.5, background: 'linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600))' }}>
          {confirmLabel}
        </button>
      </div>
    </div>,
    document.body
  );
}
