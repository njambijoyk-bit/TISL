import React, { useState, useEffect } from 'react';
import vaultAPI from '../../../../api/vault';

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icons = {
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  version: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" fill="none"/>
      <path d="M8 5v3.5l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  download: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1.5v7M4 6L6.5 8.5 9 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1.5 9.5v1.5a1 1 0 001 1h8a1 1 0 001-1V9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  upload: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 11.5v-7M4 7L6.5 4.5 9 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1.5 3.5V2a1 1 0 011-1h8a1 1 0 001 1v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  spinner: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="vault-modal__spinner">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.8" strokeDasharray="16 24" opacity=".6"/>
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── VersionHistoryPanel ─────────────────────────────────────────────────────
export default function VersionHistoryPanel({ document: doc, onClose }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [newFile, setNewFile] = useState(null);
  const [changeNote, setChangeNote] = useState('');

  // Close on Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Load document with versions
  useEffect(() => {
    setLoading(true);
    vaultAPI.showDocument(doc.id)
      .then(res => {
        const data = res.data ?? res;
        setVersions(data.versions ?? []);
      })
      .catch(err => setError(err.response?.data?.message || 'Failed to load versions.'))
      .finally(() => setLoading(false));
  }, [doc.id]);

  const handleUploadVersion = async (e) => {
    e.preventDefault();
    if (!newFile) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', newFile);
      if (changeNote.trim()) formData.append('change_note', changeNote.trim());

      const res = await vaultAPI.uploadVersion(doc.id, formData);
      const data = res.data ?? res;
      setVersions(data.versions ?? []);
      setShowUpload(false);
      setNewFile(null);
      setChangeNote('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload version.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (version) => {
    vaultAPI.downloadDocument(doc.id, `${doc.name}_v${version.version_number}.${doc.extension}`);
  };

  return (
    <div className="vault-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Version history">
      <div className="vault-modal vault-modal--wide" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="vault-modal__header">
          <div className="vault-modal__header-left">
            <span className="vault-modal__header-icon">{Icons.version}</span>
            <h3 className="vault-modal__title">Version history</h3>
          </div>
          <button className="vault-modal__close" onClick={onClose} aria-label="Close">
            {Icons.close}
          </button>
        </div>

        <div className="vault-modal__body vault-modal__body--scroll">
          {/* Upload new version */}
          {!showUpload ? (
            <button
              className="vault-version__upload-btn"
              onClick={() => setShowUpload(true)}
            >
              {Icons.upload}
              Upload new version
            </button>
          ) : (
            <form onSubmit={handleUploadVersion} className="vault-version__upload-form">
              <div className="vault-version__file-row">
                <input
                  type="file"
                  onChange={e => setNewFile(e.target.files[0])}
                  className="vault-version__file-input"
                  required
                />
                {newFile && (
                  <span className="vault-version__file-name">{newFile.name} ({formatSize(newFile.size)})</span>
                )}
              </div>
              <input
                type="text"
                className="vault-modal__input"
                value={changeNote}
                onChange={e => setChangeNote(e.target.value)}
                placeholder="Change note (optional)"
              />
              <div className="vault-version__upload-actions">
                <button type="button" className="vault-modal__btn vault-modal__btn--ghost" onClick={() => { setShowUpload(false); setNewFile(null); }}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="vault-modal__btn vault-modal__btn--primary"
                  disabled={!newFile || uploading}
                >
                  {uploading ? (
                    <>
                      {Icons.spinner}
                      Uploading…
                    </>
                  ) : (
                    <>
                      {Icons.check}
                      Upload version
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {loading && (
            <div className="vault-version__loading">
              {Icons.spinner}
              <span>Loading versions…</span>
            </div>
          )}

          {error && (
            <div className="vault-modal__error">
              {error}
            </div>
          )}

          {!loading && versions.length === 0 && !error && (
            <div className="vault-version__empty">
              No versions found.
            </div>
          )}

          {/* Version list */}
          <div className="vault-version__list">
            {versions.map((version, index) => (
              <div
                key={version.id}
                className={`vault-version__item ${index === 0 ? 'vault-version__item--current' : ''}`}
              >
                <div className="vault-version__item-left">
                  <span className="vault-version__badge">
                    v{version.version_number}
                    {index === 0 && <span className="vault-version__current-label">current</span>}
                  </span>
                  <div className="vault-version__meta">
                    {version.change_note && (
                      <p className="vault-version__note">{version.change_note}</p>
                    )}
                    <p className="vault-version__detail">
                      {version.uploader?.name || 'System'} · {formatDate(version.created_at)} · {formatSize(version.file_size)}
                    </p>
                  </div>
                </div>
                <button
                  className="vault-version__download"
                  onClick={() => handleDownload(version)}
                  title="Download this version"
                  aria-label={`Download version ${version.version_number}`}
                >
                  {Icons.download}
                </button>
              </div>
            ))}
          </div>
        </div>
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
    max-width: 480px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: vault-modal-slide-in 180ms ease;
  }

  .vault-modal--wide {
    max-width: 520px;
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
    flex: 1;
  }

  .vault-modal__body--scroll {
    padding: 12px 16px;
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
  }

  .vault-modal__input:focus {
    border-color: var(--D-accent, #2563eb);
    box-shadow: 0 0 0 3px var(--D-accent-soft, #e7f0ff);
  }

  .vault-modal__error {
    padding: 10px 12px;
    background: var(--D-danger-soft, #fff5f5);
    border: 1px solid var(--D-danger-border, #ffc9c9);
    border-radius: var(--D-radius-sm, 6px);
    color: var(--D-danger, #e03131);
    font-size: 12.5px;
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

  /* ── Version list ────────────────────────────────────────────────────────── */
  .vault-version__upload-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px dashed var(--D-border, #e9ecef);
    background: var(--D-bg, #f8f9fa);
    color: var(--D-text-secondary, #6c757d);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: border-color 120ms, color 120ms, background 120ms;
    width: 100%;
  }

  .vault-version__upload-btn:hover {
    border-color: var(--D-accent, #2563eb);
    color: var(--D-accent, #2563eb);
    background: var(--D-accent-soft, #e7f0ff);
  }

  .vault-version__upload-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--D-bg, #f8f9fa);
    border-radius: var(--D-radius, 8px);
    border: 1px solid var(--D-border, #e9ecef);
  }

  .vault-version__file-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .vault-version__file-input {
    font-size: 13px;
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-version__file-name {
    font-size: 12px;
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-version__upload-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .vault-version__loading {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 20px;
    color: var(--D-text-muted, #adb5bd);
    font-size: 13px;
    justify-content: center;
  }

  .vault-version__empty {
    text-align: center;
    padding: 24px;
    color: var(--D-text-muted, #adb5bd);
    font-size: 13px;
  }

  .vault-version__list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .vault-version__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    transition: border-color 120ms;
  }

  .vault-version__item:hover {
    border-color: var(--D-border-strong, #dee2e6);
  }

  .vault-version__item--current {
    border-color: var(--D-accent, #2563eb);
    background: var(--D-accent-soft, #e7f0ff);
  }

  .vault-version__item-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
  }

  .vault-version__badge {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    height: 36px;
    border-radius: var(--D-radius-sm, 6px);
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-secondary, #6c757d);
    font-size: 11px;
    font-weight: 700;
    flex-shrink: 0;
    gap: 1px;
  }

  .vault-version__item--current .vault-version__badge {
    background: var(--D-accent, #2563eb);
    color: #fff;
  }

  .vault-version__current-label {
    font-size: 8px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.8;
  }

  .vault-version__meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .vault-version__note {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vault-version__detail {
    font-size: 11px;
    color: var(--D-text-muted, #adb5bd);
    margin: 0;
  }

  .vault-version__download {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 5px;
    color: var(--D-text-muted, #adb5bd);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 100ms, color 100ms;
  }

  .vault-version__download:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-accent, #2563eb);
  }
`;
