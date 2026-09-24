import React, { useState, useEffect } from 'react';
import vaultAPI from '../../../../api/vault';

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icons = {
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  lock: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="7" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="none"/>
      <path d="M5 7V4.5a3.5 3.5 0 017 0V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  unlock: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="7" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="none"/>
      <path d="M5 7V4.5a3.5 3.5 0 017 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M8 10.5v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  eye: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4S1 7 1 7z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" fill="none"/>
    </svg>
  ),
  eyeOff: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 7s2-4 6-4 6 4 6 4-2 4-6 4S1 7 1 7z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3" fill="none"/>
      <path d="M2 12L12 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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
  trash: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 3.5h9M5 3.5V2h3v1.5M5.5 6v3.5M7.5 6v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M3 3.5l.7 7.2a.8.8 0 00.8.8h5a.8.8 0 00.8-.8L11 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

// ─── PasswordModal ───────────────────────────────────────────────────────────
export default function PasswordModal({ item, mode = 'set', onClose, onSuccess }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isDocument = item.original_filename !== undefined;
  const targetType = isDocument ? 'document' : 'folder';
  const itemName = isDocument ? (item.name || item.original_filename) : item.name;
  const isLocked = item.is_locked;

  // Close on Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleSetPassword = async (e) => {
    e.preventDefault();
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (targetType === 'folder') {
        await vaultAPI.setFolderPassword(item.id, password);
      } else {
        await vaultAPI.setDocumentPassword(item.id, password);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to set password.');
      setLoading(false);
    }
  };

  const handleUnlock = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter the password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (targetType === 'folder') {
        await vaultAPI.unlockFolder(item.id, password);
      } else {
        await vaultAPI.unlockDocument(item.id, password);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Incorrect password.');
      setLoading(false);
    }
  };

  const handleRemovePassword = async () => {
    if (!window.confirm(`Remove password protection from "${itemName}"?`)) return;

    setLoading(true);
    setError(null);

    try {
      if (targetType === 'folder') {
        await vaultAPI.removeFolderPassword(item.id);
      } else {
        await vaultAPI.removeDocumentPassword(item.id);
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove password.');
      setLoading(false);
    }
  };

  // Determine the actual mode based on item state
  const actualMode = mode === 'unlock' || isLocked ? 'unlock' : 'set';

  return (
    <div className="vault-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Password management">
      <div className="vault-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="vault-modal__header">
          <div className="vault-modal__header-left">
            <span className="vault-modal__header-icon">
              {actualMode === 'unlock' ? Icons.unlock : Icons.lock}
            </span>
            <h3 className="vault-modal__title">
              {actualMode === 'unlock' ? 'Unlock' : 'Set password'}
            </h3>
          </div>
          <button className="vault-modal__close" onClick={onClose} aria-label="Close">
            {Icons.close}
          </button>
        </div>

        <form onSubmit={actualMode === 'unlock' ? handleUnlock : handleSetPassword}>
          <div className="vault-modal__body">
            <p className="vault-password__context">
              {actualMode === 'unlock'
                ? <>"<strong>{itemName}</strong>" is password protected.</>
                : <>Set a password for <strong>{itemName}</strong></>
              }
            </p>

            <div className="vault-modal__field">
              <label className="vault-modal__label">
                {actualMode === 'unlock' ? 'Password' : 'New password'}
              </label>
              <div className="vault-password__input-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="vault-modal__input vault-password__input"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={actualMode === 'unlock' ? 'Enter password' : 'Min 4 characters'}
                  autoFocus
                  required
                />
                <button
                  type="button"
                  className="vault-password__toggle"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? Icons.eyeOff : Icons.eye}
                </button>
              </div>
            </div>

            {actualMode === 'set' && (
              <div className="vault-modal__field">
                <label className="vault-modal__label">Confirm password</label>
                <div className="vault-password__input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="vault-modal__input vault-password__input"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    required
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="vault-modal__error">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="vault-modal__footer">
            {actualMode === 'set' && isLocked && (
              <button
                type="button"
                className="vault-modal__btn vault-modal__btn--danger"
                onClick={handleRemovePassword}
                disabled={loading}
              >
                {Icons.trash}
                Remove
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button type="button" className="vault-modal__btn vault-modal__btn--ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="vault-modal__btn vault-modal__btn--primary"
              disabled={!password || loading}
            >
              {loading ? (
                <>
                  {Icons.spinner}
                  {actualMode === 'unlock' ? 'Unlocking…' : 'Setting…'}
                </>
              ) : (
                <>
                  {actualMode === 'unlock' ? Icons.unlock : Icons.check}
                  {actualMode === 'unlock' ? 'Unlock' : 'Set password'}
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
    max-width: 380px;
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

  .vault-modal__input {
    padding: 8px 10px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    color: var(--D-text-primary, #1a1a2e);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 120ms, box-shadow 120ms;
    width: 100%;
  }

  .vault-modal__input:focus {
    border-color: var(--D-accent, #2563eb);
    box-shadow: 0 0 0 3px var(--D-accent-soft, #e7f0ff);
  }

  .vault-password__context {
    font-size: 13px;
    color: var(--D-text-secondary, #6c757d);
    margin: 0 0 4px;
  }

  .vault-password__context strong {
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-password__input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .vault-password__input {
    padding-right: 36px;
  }

  .vault-password__toggle {
    position: absolute;
    right: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    background: transparent;
    border-radius: 4px;
    color: var(--D-text-muted, #adb5bd);
    cursor: pointer;
    transition: color 100ms;
  }

  .vault-password__toggle:hover {
    color: var(--D-text-primary, #1a1a2e);
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
    align-items: center;
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

  .vault-modal__btn--danger {
    background: transparent;
    border-color: var(--D-danger-border, #ffc9c9);
    color: var(--D-danger, #e03131);
  }

  .vault-modal__btn--danger:hover:not(:disabled) {
    background: var(--D-danger-soft, #fff5f5);
  }

  .vault-modal__spinner {
    animation: vault-spin 700ms linear infinite;
  }

  @keyframes vault-spin {
    to { transform: rotate(360deg); }
  }
`;
