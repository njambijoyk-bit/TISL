import React, { useState, useRef, useCallback, useEffect } from 'react';
import vaultAPI from '../../../../api/vault';
import useVaultStore from '../../../../store/useVaultStore';

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icons = {
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  upload: (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M16 8v12M10 14l6-6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 20v4a2 2 0 002 2h20a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  file: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M8 1H3a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V4L8 1z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
      <path d="M8 1v3h3" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  ),
  remove: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
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

const DOC_TYPES = [
  'invoice', 'contract', 'report', 'receipt', 'other',
  'system_log_archive', 'manual', 'policy', 'export',
];

// ─── UploadDocumentModal ─────────────────────────────────────────────────────
export default function UploadDocumentModal({ onClose, onUpload }) {
  const { currentFolder } = useVaultStore();
  const fileInputRef = useRef(null);
  const dropRef = useRef(null);

  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const [name, setName] = useState('');
  const [docType, setDocType] = useState('other');
  const [sensitivity, setSensitivity] = useState('internal');
  const [tags, setTags] = useState('');

  // Close on Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleFileSelect = useCallback((selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setName(selectedFile.name);
    setError(null);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    handleFileSelect(dropped);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder_id', currentFolder?.id ?? '');
      formData.append('name', name || file.name);
      formData.append('document_type', docType);
      formData.append('sensitivity_level', sensitivity);
      if (tags.trim()) {
        tags.split(',').map(t => t.trim()).filter(Boolean).forEach(tag => {
          formData.append('tags[]', tag);
        });
      }

      await onUpload(formData);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  };

  return (
    <div className="vault-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Upload document">
      <div className="vault-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="vault-modal__header">
          <h3 className="vault-modal__title">Upload document</h3>
          <button className="vault-modal__close" onClick={onClose} aria-label="Close">
            {Icons.close}
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Drop zone */}
          {!file ? (
            <div
              ref={dropRef}
              className={`vault-upload__dropzone ${dragOver ? 'vault-upload__dropzone--active' : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
            >
              <div className="vault-upload__drop-icon">{Icons.upload}</div>
              <p className="vault-upload__drop-text">Drop a file here, or click to browse</p>
              <p className="vault-upload__drop-hint">Max 100 MB</p>
              <input
                ref={fileInputRef}
                type="file"
                className="vault-upload__input"
                onChange={e => handleFileSelect(e.target.files[0])}
              />
            </div>
          ) : (
            <div className="vault-upload__file-preview">
              <div className="vault-upload__file-info">
                <span className="vault-upload__file-icon">{Icons.file}</span>
                <div className="vault-upload__file-details">
                  <p className="vault-upload__file-name" title={file.name}>{file.name}</p>
                  <p className="vault-upload__file-size">{formatSize(file.size)}</p>
                </div>
              </div>
              <button
                type="button"
                className="vault-upload__file-remove"
                onClick={() => { setFile(null); setName(''); }}
                aria-label="Remove file"
              >
                {Icons.remove}
              </button>
            </div>
          )}

          {/* Fields */}
          <div className="vault-modal__body">
            <div className="vault-modal__field">
              <label className="vault-modal__label">Name</label>
              <input
                type="text"
                className="vault-modal__input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Document name"
                required
              />
            </div>

            <div className="vault-modal__row">
              <div className="vault-modal__field vault-modal__field--half">
                <label className="vault-modal__label">Document type</label>
                <select
                  className="vault-modal__select"
                  value={docType}
                  onChange={e => setDocType(e.target.value)}
                >
                  {DOC_TYPES.map(t => (
                    <option key={t} value={t}>{t.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}</option>
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

            <div className="vault-modal__field">
              <label className="vault-modal__label">Tags <span className="vault-modal__hint">(comma separated)</span></label>
              <input
                type="text"
                className="vault-modal__input"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="e.g. invoice, 2024, q1"
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
            <button type="button" className="vault-modal__btn vault-modal__btn--ghost" onClick={onClose} disabled={uploading}>
              Cancel
            </button>
            <button
              type="submit"
              className="vault-modal__btn vault-modal__btn--primary"
              disabled={!file || uploading}
            >
              {uploading ? (
                <>
                  {Icons.spinner}
                  Uploading…
                </>
              ) : (
                <>
                  {Icons.check}
                  Upload
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
    max-width: 440px;
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

  .vault-modal__hint {
    font-weight: 400;
    color: var(--D-text-muted, #adb5bd);
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

  /* ── Upload dropzone ─────────────────────────────────────────────────────── */
  .vault-upload__dropzone {
    margin: 16px 16px 0;
    padding: 28px 20px;
    border: 2px dashed var(--D-border, #e9ecef);
    border-radius: var(--D-radius, 8px);
    background: var(--D-bg, #f8f9fa);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    transition: border-color 150ms, background 150ms;
    text-align: center;
  }

  .vault-upload__dropzone:hover,
  .vault-upload__dropzone--active {
    border-color: var(--D-accent, #2563eb);
    background: var(--D-accent-soft, #e7f0ff);
  }

  .vault-upload__drop-icon {
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-upload__dropzone:hover .vault-upload__drop-icon,
  .vault-upload__dropzone--active .vault-upload__drop-icon {
    color: var(--D-accent, #2563eb);
  }

  .vault-upload__drop-text {
    font-size: 13px;
    font-weight: 500;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0;
  }

  .vault-upload__drop-hint {
    font-size: 11.5px;
    color: var(--D-text-muted, #adb5bd);
    margin: 0;
  }

  .vault-upload__input {
    display: none;
  }

  /* ── File preview ────────────────────────────────────────────────────────── */
  .vault-upload__file-preview {
    margin: 16px 16px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 12px 14px;
    background: var(--D-accent-soft, #e7f0ff);
    border: 1px solid var(--D-accent-soft, #e7f0ff);
    border-radius: var(--D-radius, 8px);
  }

  .vault-upload__file-info {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .vault-upload__file-icon {
    display: flex;
    align-items: center;
    color: var(--D-accent, #2563eb);
    flex-shrink: 0;
  }

  .vault-upload__file-details {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .vault-upload__file-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vault-upload__file-size {
    font-size: 11px;
    color: var(--D-text-muted, #adb5bd);
    margin: 0;
  }

  .vault-upload__file-remove {
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
    flex-shrink: 0;
    transition: background 100ms, color 100ms;
  }

  .vault-upload__file-remove:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-danger, #e03131);
  }
`;
