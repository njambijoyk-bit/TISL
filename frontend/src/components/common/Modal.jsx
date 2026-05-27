import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const sizeMap = {
  sm:  460,
  md:  540,
  lg:  720,
  xl:  960,
  '2xl': 1100,
};

const Modal = ({ isOpen, onClose, title, size = 'md', children }) => {

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e) => { if (e.key === 'Escape' && isOpen) onClose(); };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, overflowY: 'auto' }}>

      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />

      {/* Centering wrapper */}
      <div style={{
        display: 'flex', minHeight: '100%',
        alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}>

        {/* Modal panel */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative', width: '100%',
            maxWidth: sizeMap[size] ?? sizeMap.md,
            background: 'white', borderRadius: 14,
            border: '1px solid rgba(168,85,247,0.15)',
            boxShadow: '0 8px 40px rgba(168,85,247,0.12), 0 2px 12px rgba(0,0,0,0.08)',
          }}
        >

          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1.5px solid rgba(168,85,247,0.1)',
          }}>
            <h3 style={{
              fontSize: '0.95rem', fontWeight: 700,
              color: '#111827', margin: 0,
            }}>
              {title}
            </h3>

            <button
              onClick={onClose}
              aria-label="Close modal"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 8,
                border: 'none', background: 'none',
                color: '#9ca3af', cursor: 'pointer',
                transition: 'all 150ms',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(168,85,247,0.08)';
                e.currentTarget.style.color = '#7c3aed';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.color = '#9ca3af';
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '16px 20px' }}>
            {children}
          </div>

        </div>
      </div>
    </div>
  );
};

export default Modal;