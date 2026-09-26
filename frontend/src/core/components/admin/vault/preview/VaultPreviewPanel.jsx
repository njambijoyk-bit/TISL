import React, { useState, useEffect, useCallback } from 'react';
import useVaultStore from '../../../../../_shared/store/useVaultStore';
import vaultAPI from '../../../../../_shared/api/vault';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const EXT_META = {
  pdf:  { color: '#e03131', bg: '#fff5f5' },
  doc:  { color: '#2563eb', bg: '#e7f0ff' },
  docx: { color: '#2563eb', bg: '#e7f0ff' },
  xls:  { color: '#16a34a', bg: '#f0fdf4' },
  xlsx: { color: '#16a34a', bg: '#f0fdf4' },
  csv:  { color: '#16a34a', bg: '#f0fdf4' },
  ppt:  { color: '#ea580c', bg: '#fff7ed' },
  pptx: { color: '#ea580c', bg: '#fff7ed' },
  png:  { color: '#7c3aed', bg: '#f5f3ff' },
  jpg:  { color: '#7c3aed', bg: '#f5f3ff' },
  jpeg: { color: '#7c3aed', bg: '#f5f3ff' },
  gif:  { color: '#7c3aed', bg: '#f5f3ff' },
  webp: { color: '#7c3aed', bg: '#f5f3ff' },
  json: { color: '#0891b2', bg: '#ecfeff' },
  md:   { color: '#475569', bg: '#f8fafc' },
};

function getExtMeta(filename) {
  const ext = (filename?.split('.').pop() ?? '').toLowerCase();
  return { ext: ext || '?', ...(EXT_META[ext] ?? { color: '#6c757d', bg: '#f1f3f5' }) };
}

const SENSITIVITY_COLORS = {
  confidential: '#f59e0b',
  restricted:   '#ef4444',
  top_secret:   '#7c3aed',
};

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
const Icons = {
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  expand: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M8.5 1.5H12.5V5.5M5.5 12.5H1.5V8.5M12.5 1.5L8 6M2 12.5L6.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  collapse: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M12 2L7.5 6.5M2 12L6.5 7.5M7.5 2H12V6.5M2 7.5V12H6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  download: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5v7M4.5 6L7 8.5 9.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1.5 10.5v1a1 1 0 001 1h9a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  lock: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <rect x="1.5" y="5.5" width="9" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M3.5 5.5V4a2.5 2.5 0 015 0v1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  spinner: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="vault-preview__spinner-svg">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="2" strokeDasharray="20 28" opacity=".6"/>
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Preview content renderers
// ─────────────────────────────────────────────────────────────────────────────

function ImagePreview({ url, name, expanded }) {
  return (
    <div className={`vault-preview__img-wrap ${expanded ? 'vault-preview__img-wrap--expanded' : ''}`}>
      <img src={url} alt={name} className="vault-preview__img" />
    </div>
  );
}

function PdfPreview({ url, expanded }) {
  return (
    <iframe
      src={`${url}#toolbar=0&navpanes=0`}
      className={`vault-preview__iframe ${expanded ? 'vault-preview__iframe--expanded' : ''}`}
      title="PDF preview"
    />
  );
}

function CsvPreview({ url, expanded }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!url) return;
    setLoading(true);
    fetch(url)
      .then(r => r.text())
      .then(text => {
        const lines = text.trim().split('\n').slice(0, expanded ? 200 : 50);
        setRows(lines.map(l => l.split(',')));
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [url, expanded]);

  if (loading) return <PreviewSpinner />;

  return (
    <div className="vault-preview__csv-wrap">
      <table className="vault-preview__csv-table">
        <thead>
          <tr>{rows[0]?.map((cell, i) => <th key={i}>{cell}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(1).map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function JsonPreview({ url }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!url) return;
    setLoading(true);
    fetch(url)
      .then(r => r.json())
      .then(data => setContent(JSON.stringify(data, null, 2)))
      .catch(() => setContent(null))
      .finally(() => setLoading(false));
  }, [url]);

  if (loading) return <PreviewSpinner />;
  if (!content) return <PreviewUnsupported label="Could not parse JSON" />;

  return (
    <div className="vault-preview__code-wrap">
      <pre className="vault-preview__code">{content}</pre>
    </div>
  );
}

function MarkdownPreview({ url }) {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!url) return;
    setLoading(true);
    fetch(url)
      .then(r => r.text())
      .then(setContent)
      .catch(() => setContent(null))
      .finally(() => setLoading(false));
  }, [url]);

  if (loading) return <PreviewSpinner />;
  if (!content) return <PreviewUnsupported label="Could not load file" />;

  return (
    <div className="vault-preview__code-wrap">
      <pre className="vault-preview__code vault-preview__code--md">{content}</pre>
    </div>
  );
}

function PreviewSpinner() {
  return (
    <div className="vault-preview__loading">
      {Icons.spinner}
    </div>
  );
}

function PreviewUnsupported({ label }) {
  return (
    <div className="vault-preview__unsupported">
      <p>{label ?? 'Preview not available for this file type.'}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PreviewContent — decides which renderer to use
// ─────────────────────────────────────────────────────────────────────────────
function PreviewContent({ doc, previewData, loading, error, expanded }) {
  if (loading) return <PreviewSpinner />;
  if (error)   return <PreviewUnsupported label="Failed to load preview." />;
  if (!previewData) return null;

  const { ext } = getExtMeta(doc.original_filename ?? doc.name);

  // ── Normalise URL — ensure it's absolute ──────────────────────────────────
  let url = previewData.url ?? previewData.file_path ?? null;
    if (url && !url.startsWith('http')) {
    url = (import.meta.env.VITE_STORAGE_URL ?? 'http://localhost:8000') + 
            (url.startsWith('/') ? '' : '/') + url;
    } else if (url?.startsWith('http://localhost:5175')) {
    // Fix Vite port bleed — swap to backend
    url = url.replace(
        /^http:\/\/localhost:\d+/,
        import.meta.env.VITE_STORAGE_URL ?? 'http://localhost:8000'
    );
    }
    console.log('[preview]', { previewData, url });
  if (!url) return <PreviewUnsupported label="No preview URL returned." />;

  if (['png','jpg','jpeg','gif','webp'].includes(ext)) {
    return <ImagePreview url={url} name={doc.name} expanded={expanded} />;
  }
  if (ext === 'pdf') {
    return <PdfPreview url={url} expanded={expanded} />;
  }
  if (ext === 'csv') {
    return <CsvPreview url={url} expanded={expanded} />;
  }
  if (ext === 'json') {
    return <JsonPreview url={url} />;
  }
  if (ext === 'md') {
    return <MarkdownPreview url={url} />;
  }
  if (['xlsx','xls'].includes(ext)) {
    return <PreviewUnsupported label="Spreadsheet preview coming soon." />;
  }
  return <PreviewUnsupported />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metadata section (shared between panel + expanded)
// ─────────────────────────────────────────────────────────────────────────────
function DocMeta({ doc }) {
  const { ext, color, bg } = getExtMeta(doc.original_filename ?? doc.name);
  const sensColor = SENSITIVITY_COLORS[doc.sensitivity_level];

  const rows = [
    { label: 'Size',     value: formatSize(doc.file_size) },
    { label: 'Type',     value: doc.document_type ?? ext.toUpperCase() },
    { label: 'Modified', value: formatDate(doc.updated_at) },
    { label: 'Created',  value: formatDate(doc.created_at) },
    { label: 'Version',  value: doc.version_number ? `v${doc.version_number}` : '1' },
    doc.sensitivity_level && { label: 'Sensitivity', value: doc.sensitivity_level.replace('_', ' ') },
  ].filter(Boolean);

  return (
    <div className="vault-preview__meta">
      {/* File header */}
      <div className="vault-preview__meta-header">
        <span className="vault-preview__meta-ext" style={{ color, background: bg }}>
          {ext.toUpperCase()}
        </span>
        <div className="vault-preview__meta-title-wrap">
          <p className="vault-preview__meta-name" title={doc.name ?? doc.original_filename}>
            {doc.name ?? doc.original_filename}
          </p>
          {doc.is_locked && (
            <span className="vault-preview__lock" aria-label="Password protected">{Icons.lock}</span>
          )}
        </div>
      </div>

      {/* Key-value rows */}
      <dl className="vault-preview__meta-rows">
        {rows.map(({ label, value }) => (
          <div key={label} className="vault-preview__meta-row">
            <dt className="vault-preview__meta-label">{label}</dt>
            <dd
              className="vault-preview__meta-value"
              style={label === 'Sensitivity' && sensColor ? { color: sensColor } : {}}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Tags */}
      {doc.tags?.length > 0 && (
        <div className="vault-preview__tags">
          {doc.tags.map(tag => (
            <span key={tag} className="vault-preview__tag">{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared hook — fetches preview data when doc changes
// ─────────────────────────────────────────────────────────────────────────────
function usePreviewData(doc) {
  const [previewData, setPreviewData] = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  useEffect(() => {
    if (!doc) { setPreviewData(null); return; }
    setLoading(true);
    setError(null);
    vaultAPI.previewDocument(doc.id)
      .then(res => setPreviewData(res.data ?? res))
      .catch(setError)
      .finally(() => setLoading(false));
  }, [doc?.id]);

  return { previewData, loading, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultPreviewPanel — right slide-in panel (300px)
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultPreviewPanel() {
  const { previewDoc, closePreview, expandPreview } = useVaultStore();
  const { previewData, loading, error } = usePreviewData(previewDoc);

  const handleDownload = useCallback(() => {
    if (!previewDoc) return;
    vaultAPI.downloadDocument(previewDoc.id, previewDoc.original_filename ?? previewDoc.name);
  }, [previewDoc]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') closePreview(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [closePreview]);

  if (!previewDoc) return null;

  return (
    <aside className="vault-preview-panel" aria-label="Document preview">

      {/* Header */}
      <div className="vault-preview-panel__header">
        <span className="vault-preview-panel__header-label">Preview</span>
        <div className="vault-preview-panel__header-actions">
          <button
            className="vault-preview-panel__icon-btn"
            onClick={handleDownload}
            title="Download"
            aria-label="Download document"
          >
            {Icons.download}
          </button>
          <button
            className="vault-preview-panel__icon-btn"
            onClick={expandPreview}
            title="Expand preview"
            aria-label="Expand to full screen"
          >
            {Icons.expand}
          </button>
          <button
            className="vault-preview-panel__icon-btn vault-preview-panel__icon-btn--close"
            onClick={closePreview}
            title="Close"
            aria-label="Close preview"
          >
            {Icons.close}
          </button>
        </div>
      </div>

      {/* Preview area */}
      <div className="vault-preview-panel__preview">
        <PreviewContent
          doc={previewDoc}
          previewData={previewData}
          loading={loading}
          error={error}
          expanded={false}
        />
      </div>

      {/* Metadata */}
      <DocMeta doc={previewDoc} />

      <style>{panelStyles}</style>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultPreviewExpanded — full-screen overlay
// ─────────────────────────────────────────────────────────────────────────────
export function VaultPreviewExpanded() {
  const { previewDoc, collapsePreview, closePreview } = useVaultStore();
  const { previewData, loading, error } = usePreviewData(previewDoc);

  const handleDownload = useCallback(() => {
    if (!previewDoc) return;
    vaultAPI.downloadDocument(previewDoc.id, previewDoc.original_filename ?? previewDoc.name);
  }, [previewDoc]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') collapsePreview();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [collapsePreview]);

  if (!previewDoc) return null;

  const { ext, color, bg } = getExtMeta(previewDoc.original_filename ?? previewDoc.name);

  return (
    <div
      className="vault-preview-expanded"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${previewDoc.name ?? previewDoc.original_filename}`}
    >
      {/* Top bar */}
      <div className="vault-preview-expanded__bar">
        <div className="vault-preview-expanded__bar-left">
          <span className="vault-preview-expanded__ext" style={{ color, background: bg }}>
            {ext.toUpperCase()}
          </span>
          <span className="vault-preview-expanded__name">
            {previewDoc.name ?? previewDoc.original_filename}
          </span>
        </div>
        <div className="vault-preview-expanded__bar-right">
          <button
            className="vault-preview-expanded__btn"
            onClick={handleDownload}
            aria-label="Download"
          >
            {Icons.download}
            Download
          </button>
          <button
            className="vault-preview-expanded__icon-btn"
            onClick={collapsePreview}
            title="Collapse to panel"
            aria-label="Collapse preview"
          >
            {Icons.collapse}
          </button>
          <button
            className="vault-preview-expanded__icon-btn"
            onClick={closePreview}
            title="Close preview"
            aria-label="Close preview"
          >
            {Icons.close}
          </button>
        </div>
      </div>

      {/* Main — content + sidebar */}
      <div className="vault-preview-expanded__main">
        <div className="vault-preview-expanded__content">
          <PreviewContent
            doc={previewDoc}
            previewData={previewData}
            loading={loading}
            error={error}
            expanded={true}
          />
        </div>
        <div className="vault-preview-expanded__sidebar">
          <DocMeta doc={previewDoc} />
        </div>
      </div>

      <style>{expandedStyles}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel styles
// ─────────────────────────────────────────────────────────────────────────────
const panelStyles = `
  .vault-preview-panel {
    width: 300px;
    flex-shrink: 0;
    border-left: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: vault-panel-slide-in 200ms ease;
  }

  @keyframes vault-panel-slide-in {
    from { transform: translateX(20px); opacity: 0; }
    to   { transform: translateX(0);    opacity: 1; }
  }

  /* Header */
  .vault-preview-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--D-border, #e9ecef);
    flex-shrink: 0;
  }

  .vault-preview-panel__header-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-preview-panel__header-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .vault-preview-panel__icon-btn {
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

  .vault-preview-panel__icon-btn:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-preview-panel__icon-btn--close:hover {
    background: var(--D-danger-soft, #fff5f5);
    color: var(--D-danger, #e03131);
  }

  /* Preview area */
  .vault-preview-panel__preview {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--D-bg, #f8f9fa);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Content renderers (panel) ── */
  .vault-preview__img-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 12px;
  }

  .vault-preview__img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
  }

  .vault-preview__iframe {
    width: 100%;
    height: 100%;
    border: none;
    min-height: 220px;
  }

  .vault-preview__csv-wrap {
    width: 100%;
    height: 100%;
    overflow: auto;
  }

  .vault-preview__csv-table {
    font-size: 11px;
    border-collapse: collapse;
    width: 100%;
  }

  .vault-preview__csv-table th,
  .vault-preview__csv-table td {
    padding: 4px 8px;
    border: 1px solid var(--D-border, #e9ecef);
    white-space: nowrap;
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-preview__csv-table th {
    background: var(--D-hover, #f8f9fa);
    font-weight: 600;
    color: var(--D-text-secondary, #6c757d);
  }

  .vault-preview__code-wrap {
    width: 100%;
    height: 100%;
    overflow: auto;
    padding: 12px;
  }

  .vault-preview__code {
    font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
    font-size: 11px;
    line-height: 1.6;
    color: var(--D-text-primary, #1a1a2e);
    white-space: pre;
    margin: 0;
  }

  .vault-preview__code--md {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .vault-preview__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-preview__spinner-svg {
    animation: vault-spin 800ms linear infinite;
  }

  .vault-preview__unsupported {
    padding: 32px 16px;
    text-align: center;
    color: var(--D-text-muted, #adb5bd);
    font-size: 13px;
  }

  /* Metadata */
  .vault-preview__meta {
    flex-shrink: 0;
    border-top: 1px solid var(--D-border, #e9ecef);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    max-height: 40%;
  }

  .vault-preview__meta-header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .vault-preview__meta-ext {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.05em;
    border-radius: 3px;
    padding: 2px 5px;
    flex-shrink: 0;
  }

  .vault-preview__meta-title-wrap {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    flex: 1;
  }

  .vault-preview__meta-name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .vault-preview__lock {
    display: flex;
    align-items: center;
    color: var(--D-text-muted, #adb5bd);
    flex-shrink: 0;
  }

  .vault-preview__meta-rows {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .vault-preview__meta-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }

  .vault-preview__meta-label {
    font-size: 11px;
    color: var(--D-text-muted, #adb5bd);
    font-weight: 500;
    flex-shrink: 0;
  }

  .vault-preview__meta-value {
    font-size: 11.5px;
    color: var(--D-text-primary, #1a1a2e);
    font-weight: 500;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-transform: capitalize;
  }

  .vault-preview__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .vault-preview__tag {
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 20px;
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-secondary, #6c757d);
    font-weight: 500;
  }

  @keyframes vault-spin {
    to { transform: rotate(360deg); }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Expanded styles
// ─────────────────────────────────────────────────────────────────────────────
const expandedStyles = `
  .vault-preview-expanded {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--D-surface, #ffffff);
    display: flex;
    flex-direction: column;
    animation: vault-expanded-in 180ms ease;
  }

  @keyframes vault-expanded-in {
    from { opacity: 0; transform: scale(0.98); }
    to   { opacity: 1; transform: scale(1); }
  }

  /* Top bar */
  .vault-preview-expanded__bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    height: 52px;
    border-bottom: 1px solid var(--D-border, #e9ecef);
    flex-shrink: 0;
    gap: 16px;
  }

  .vault-preview-expanded__bar-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
  }

  .vault-preview-expanded__ext {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    border-radius: 4px;
    padding: 3px 7px;
    flex-shrink: 0;
  }

  .vault-preview-expanded__name {
    font-size: 14px;
    font-weight: 600;
    color: var(--D-text-primary, #1a1a2e);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vault-preview-expanded__bar-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .vault-preview-expanded__btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    color: var(--D-text-primary, #1a1a2e);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 120ms;
    height: 32px;
  }

  .vault-preview-expanded__btn:hover {
    background: var(--D-hover, #f1f3f5);
  }

  .vault-preview-expanded__icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 6px;
    color: var(--D-text-secondary, #6c757d);
    cursor: pointer;
    transition: background 100ms, color 100ms;
  }

  .vault-preview-expanded__icon-btn:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  /* Main layout */
  .vault-preview-expanded__main {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  .vault-preview-expanded__content {
    flex: 1;
    min-width: 0;
    overflow: auto;
    background: var(--D-bg, #f8f9fa);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 24px;
  }

  /* Expanded image */
  .vault-preview__img-wrap--expanded {
    width: 100%;
    min-height: 400px;
    align-items: flex-start;
  }

  .vault-preview__img-wrap--expanded .vault-preview__img {
    max-height: none;
  }

  /* Expanded iframe */
  .vault-preview__iframe--expanded {
    min-height: calc(100vh - 52px);
  }

  /* Sidebar */
  .vault-preview-expanded__sidebar {
    width: 280px;
    flex-shrink: 0;
    border-left: 1px solid var(--D-border, #e9ecef);
    overflow-y: auto;
    background: var(--D-surface, #ffffff);
  }

  .vault-preview-expanded__sidebar .vault-preview__meta {
    border-top: none;
    max-height: none;
    padding: 20px;
  }

  @media (max-width: 768px) {
    .vault-preview-expanded__sidebar {
      display: none;
    }
  }
`;