import React, { useState, useEffect } from 'react';
import vaultAPI from '../../../../../_shared/api/vault';

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icons = {
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  save: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  spinner: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="vault-modal__spinner">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" strokeDasharray="16 24" opacity=".6"/>
    </svg>
  ),
  trash: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 3.5h9M5 3.5V2h3v1.5M5.5 6v3.5M7.5 6v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M3 3.5l.7 7.2a.8.8 0 00.8.8h5a.8.8 0 00.8-.8L11 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

const SENSITIVITY_OPTIONS = [
  { value: 'public',       label: 'Public' },
  { value: 'internal',     label: 'Internal' },
  { value: 'confidential', label: 'Confidential' },
  { value: 'restricted',   label: 'Restricted' },
  { value: 'top_secret',   label: 'Top Secret' },
];

// ─── EditFolderModal ─────────────────────────────────────────────────────────
export default function EditFolderModal({ folder, onClose, onSave }) {
  const [name, setName] = useState(folder.name || '');
  const [description, setDescription] = useState(folder.description || '');
  const [sensitivity, setSensitivity] = useState(folder.sensitivity_level || 'internal');
  const [inheritsPolicy, setInheritsPolicy] = useState(folder.inherits_parent_policy ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Close on Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await vaultAPI.updateFolder(folder.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        sensitivity_level: sensitivity,
        inherits_parent_policy: inheritsPolicy,
      });
      onSave();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update folder.');
      setLoading(false);
    }
  };

  return (
    <div className="vault-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Edit folder">
      <div className="vault-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="vault-modal__header">
          <h3 className="vault-modal__title">Edit folder</h3>
          <button className="vault-modal__close" onClick={onClose} aria-label="Close">
            {Icons.close}
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="vault-modal__body">
            <div className="vault-modal__field">
              <label className="vault-modal__label">Name <span className="vault-modal__required">*</span></label>
              <input
                type="text"
                className="vault-modal__input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Folder name"
                autoFocus
                required
                maxLength={255}
              />
            </div>

            <div className="vault-modal__field">
              <label className="vault-modal__label">Description</label>
              <textarea
                className="vault-modal__textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={3}
              />
            </div>

            <div className="vault-modal__field">
              <label className="vault-modal__label">Sensitivity</label>
              <select
                className="vault-modal__select"
                value={sensitivity}
                onChange={e => setSensitivity(e.target.value)}
              >
                {SENSITIVITY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <label className="vault-modal__checkbox">
              <input
                type="checkbox"
                checked={inheritsPolicy}
                onChange={e => setInheritsPolicy(e.target.checked)}
              />
              <span>Inherit parent folder policies</span>
            </label>

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
              disabled={!name.trim() || loading}
            >
              {loading ? (
                <>
                  {Icons.spinner}
                  Saving…
                </>
              ) : (
                <>
                  {Icons.save}
                  Save changes
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
    max-width: 420px;
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
    gap: 12px;
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

  .vault-modal__required {
    color: var(--D-danger, #e03131);
  }

  .vault-modal__input,
  .vault-modal__select,
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

  .vault-modal__input:focus,
  .vault-modal__select:focus,
  .vault-modal__textarea:focus {
    border-color: var(--D-accent, #2563eb);
    box-shadow: 0 0 0 3px var(--D-accent-soft, #e7f0ff);
  }

  .vault-modal__select {
    cursor: pointer;
  }

  .vault-modal__checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--D-text-primary, #1a1a2e);
    cursor: pointer;
    padding: 4px 0;
  }

  .vault-modal__checkbox input {
    width: 16px;
    height: 16px;
    accent-color: var(--D-accent, #2563eb);
    cursor: pointer;
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
