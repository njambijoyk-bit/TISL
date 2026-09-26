import React, { useState, useEffect } from 'react';

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icons = {
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  archive: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="3" rx="1" fill="currentColor" opacity=".8"/>
      <rect x="1" y="7" width="14" height="7" rx="1" fill="currentColor" opacity=".25"/>
      <path d="M6 10.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  spinner: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="vault-modal__spinner">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" strokeDasharray="16 24" opacity=".6"/>
    </svg>
  ),
  lock: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="5.5" width="9" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M3.5 5.5V4a2.5 2.5 0 015 0v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  compress: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1" y="2" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" fill="none"/>
      <path d="M3 5l3-2 3 2M3 7l3 2 3-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

// ─── ArchiveModal ────────────────────────────────────────────────────────────
export default function ArchiveModal({ item, type, onClose, onArchive }) {
  const [compress, setCompress] = useState(false);
  const [lock, setLock] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const itemName = type === 'folder' ? item.name : (item.name || item.original_filename);

  // Close on Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const options = {
        notes: notes.trim() || undefined,
      };
      if (type === 'document') {
        options.compress = compress;
        options.lock = lock;
      } else {
        options.lock = lock;
      }

      await onArchive(options);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Archive failed. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="vault-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Archive item">
      <div className="vault-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="vault-modal__header">
          <div className="vault-modal__header-left">
            <span className="vault-modal__header-icon">{Icons.archive}</span>
            <h3 className="vault-modal__title">Archive {type}</h3>
          </div>
          <button className="vault-modal__close" onClick={onClose} aria-label="Close">
            {Icons.close}
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="vault-modal__body">
            <p className="vault-archive__context">
              Archive <strong>{itemName}</strong> to cold storage.
              {type === 'folder' && ' The entire folder tree will be compressed into a zip.'}
            </p>

            {type === 'document' && (
              <label className="vault-modal__checkbox">
                <input
                  type="checkbox"
                  checked={compress}
                  onChange={e => setCompress(e.target.checked)}
                />
                <span className="vault-archive__check-label">
                  <span className="vault-archive__check-icon">{Icons.compress}</span>
                  Compress into zip
                </span>
              </label>
            )}

            <label className="vault-modal__checkbox">
              <input
                type="checkbox"
                checked={lock}
                onChange={e => setLock(e.target.checked)}
              />
              <span className="vault-archive__check-label">
                <span className="vault-archive__check-icon">{Icons.lock}</span>
                Lock after archive
              </span>
            </label>

            <div className="vault-modal__field">
              <label className="vault-modal__label">Notes <span className="vault-modal__hint">(optional)</span></label>
              <textarea
                className="vault-modal__textarea"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Reason for archiving..."
                rows={3}
              />
            </div>

            {error && (
              <div className="vault-modal__error">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="vault-modal__footer">
            <button type="button" className="vault-modal__btn vault-modal__btn--ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="vault-modal__btn vault-modal__btn--primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  {Icons.spinner}
                  Archiving…
                </>
              ) : (
                <>
                  {Icons.check}
                  Archive
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      <style>{styles}</style>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = `
  .vault-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0,0,0,0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    animation: vault-modal-fade-in 120ms ease;
  }

  @keyframes vault-modal-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .vault-modal {
    background: var(--D-surface, #ffffff);
    border-radius: var(--D-radius, 8px);
    border: 1px solid var(--D-border, #e9ecef);
    box-shadow: 0 12px 40px rgba(0,0,0,0.15);
    width: 100%;
    max-width: 400px;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: vault-modal-slide-in 180ms ease;
  }

  @keyframes vault-modal-slide-in {
    from { opacity: 0; transform: translateY(-8px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .vault-modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--D-border, #e9ecef);
    flex-shrink: 0;
  }

  .vault-modal__header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .vault-modal__header-icon {
    display: flex;
    align-items: center;
    color: var(--D-text-secondary, #6c757d);
  }

  .vault-modal__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0;
  }

  .vault-modal__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 5px;
    color: var(--D-text-secondary, #6c757d);
    cursor: pointer;
    transition: background 100ms, color 100ms;
  }

  .vault-modal__close:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-modal__body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
  }

  .vault-modal__field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .vault-modal__label {
    font-size: 12px;
    font-weight: 600;
    color: var(--D-text-secondary, #6c757d);
  }

  .vault-modal__hint {
    font-weight: 400;
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-modal__textarea {
    padding: 8px 10px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    color: var(--D-text-primary, #1a1a2e);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 120ms, box-shadow 120ms;
    resize: vertical;
  }

  .vault-modal__textarea:focus {
    border-color: var(--D-accent, #2563eb);
    box-shadow: 0 0 0 3px var(--D-accent-soft, #e7f0ff);
  }

  .vault-modal__checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--D-text-primary, #1a1a2e);
    cursor: pointer;
    padding: 6px 8px;
    border-radius: var(--D-radius-sm, 6px);
    transition: background 100ms;
  }

  .vault-modal__checkbox:hover {
    background: var(--D-hover, #f1f3f5);
  }

  .vault-modal__checkbox input {
    width: 16px;
    height: 16px;
    accent-color: var(--D-accent, #2563eb);
    cursor: pointer;
    flex-shrink: 0;
  }

  .vault-archive__context {
    font-size: 13px;
    color: var(--D-text-secondary, #6c757d);
    margin: 0 0 4px;
  }

  .vault-archive__context strong {
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-archive__check-label {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .vault-archive__check-icon {
    display: flex;
    align-items: center;
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-modal__error {
    padding: 10px 12px;
    background: var(--D-danger-soft, #fff5f5);
    border: 1px solid var(--D-danger-border, #ffc9c9);
    border-radius: var(--D-radius-sm, 6px);
    color: var(--D-danger, #e03131);
    font-size: 12.5px;
  }

  .vault-modal__footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--D-border, #e9ecef);
    flex-shrink: 0;
  }

  .vault-modal__btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: var(--D-radius-sm, 6px);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 120ms, border-color 120ms, opacity 120ms;
    height: 34px;
  }

  .vault-modal__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .vault-modal__btn--ghost {
    background: transparent;
    border-color: var(--D-border, #e9ecef);
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-modal__btn--ghost:hover:not(:disabled) {
    background: var(--D-hover, #f1f3f5);
  }

  .vault-modal__btn--primary {
    background: var(--D-accent, #2563eb);
    border-color: var(--D-accent, #2563eb);
    color: #ffffff;
  }

  .vault-modal__btn--primary:hover:not(:disabled) {
    background: var(--D-accent-hover, #1d4ed8);
    border-color: var(--D-accent-hover, #1d4ed8);
  }

  .vault-modal__spinner {
    animation: vault-spin 700ms linear infinite;
  }

  @keyframes vault-spin {
    to { transform: rotate(360deg); }
  }
`;
