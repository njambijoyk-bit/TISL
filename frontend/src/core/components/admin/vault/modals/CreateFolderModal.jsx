import React, { useState, useEffect } from 'react';
import useVaultStore from '../../../../../_shared/store/useVaultStore';

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icons = {
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  folder: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 4C1 3.17 1.67 2.5 2.5 2.5H6.5L8 4H13.5C14.33 4 15 4.67 15 5.5V12.5C15 13.33 14.33 14 13.5 14h-11C1.67 14 1 13.33 1 12.5V4z"
        fill="var(--D-accent, #2563eb)" opacity=".18" stroke="var(--D-accent, #2563eb)" strokeWidth="1.2" strokeLinejoin="round"/>
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
};

const SENSITIVITY_OPTIONS = [
  { value: 'public',       label: 'Public' },
  { value: 'internal',     label: 'Internal' },
  { value: 'confidential', label: 'Confidential' },
  { value: 'restricted',   label: 'Restricted' },
  { value: 'top_secret',   label: 'Top Secret' },
];

const FOLDER_TYPES = [
  { value: 'manual',         label: 'Manual' },
  { value: 'system_logs',    label: 'System Logs' },
  { value: 'system_exports', label: 'System Exports' },
  { value: 'cold_storage',   label: 'Cold Storage' },
];

// ─── CreateFolderModal ───────────────────────────────────────────────────────
export default function CreateFolderModal({ onClose, onCreate }) {
  const { currentFolder } = useVaultStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [folderType, setFolderType] = useState('manual');
  const [sensitivity, setSensitivity] = useState('internal');
  const [inheritsPolicy, setInheritsPolicy] = useState(true);
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
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        folder_type: folderType,
        sensitivity_level: sensitivity,
        inherits_parent_policy: inheritsPolicy,
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create folder.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vault-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Create folder">
      <div className="vault-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="vault-modal__header">
          <div className="vault-modal__header-left">
            <span className="vault-modal__header-icon">{Icons.folder}</span>
            <h3 className="vault-modal__title">New folder</h3>
          </div>
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

            <div className="vault-modal__row">
              <div className="vault-modal__field vault-modal__field--half">
                <label className="vault-modal__label">Folder type</label>
                <select
                  className="vault-modal__select"
                  value={folderType}
                  onChange={e => setFolderType(e.target.value)}
                >
                  {FOLDER_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="vault-modal__field vault-modal__field--half">
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
            </div>

            <label className="vault-modal__checkbox">
              <input
                type="checkbox"
                checked={inheritsPolicy}
                onChange={e => setInheritsPolicy(e.target.checked)}
              />
              <span>Inherit parent folder policies</span>
            </label>

            {currentFolder && (
              <p className="vault-modal__context">
                Will be created inside <strong>{currentFolder.name}</strong>
              </p>
            )}

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
                  Creating…
                </>
              ) : (
                <>
                  {Icons.check}
                  Create folder
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

  .vault-modal__header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .vault-modal__header-icon {
    display: flex;
    align-items: center;
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

  .vault-modal__row {
    display: flex;
    gap: 10px;
  }

  .vault-modal__field--half {
    flex: 1;
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

  .vault-modal__context {
    font-size: 12px;
    color: var(--D-text-muted, #adb5bd);
    margin: 0;
    padding: 4px 0;
  }

  .vault-modal__context strong {
    color: var(--D-text-secondary, #6c757d);
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
