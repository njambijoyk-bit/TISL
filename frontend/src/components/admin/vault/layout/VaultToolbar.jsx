import React from 'react';
import useVaultStore from '../../../../store/useVaultStore';

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
const Icons = {
  home: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M1 6L6.5 1.5 12 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2.5 5V11.5h3V8.5h2v3h3V5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  chevron: (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <path d="M3.5 2l3.5 3.5L3.5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  upload: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 9.5V2.5M4 5.5L7 2.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1.5 10.5v1a1 1 0 001 1h9a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  folderPlus: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1 4C1 3.17 1.67 2.5 2.5 2.5H5.5L7 4H11.5C12.33 4 13 4.67 13 5.5V10.5C13 11.33 12.33 12 11.5 12h-9C1.67 12 1 11.33 1 10.5V4z"
        stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M7 6.5v3M5.5 8h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  refresh: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M1.5 6.5A5 5 0 0111 3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M11.5 6.5A5 5 0 012 9.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      <path d="M9 1.5l2 1.8-1.8 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 9.7L2 11.5.2 9.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// VaultToolbar
// Breadcrumb trail + upload + new folder + reload
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultToolbar({ loading, onReload, onUpload, onNewFolder }) {
  const { currentFolder, breadcrumbs, openFolder, navigateToBreadcrumb } = useVaultStore();

  return (
    <div className="vault-toolbar">

      {/* ── Breadcrumbs ──────────────────────────────────────────────────── */}
      <nav className="vault-toolbar__breadcrumbs" aria-label="Folder path">

        {/* Vault root */}
        <button
          className={`vault-toolbar__crumb vault-toolbar__crumb--root ${!currentFolder ? 'vault-toolbar__crumb--active' : ''}`}
          onClick={() => openFolder(null)}
          aria-current={!currentFolder ? 'page' : undefined}
        >
          <span className="vault-toolbar__crumb-icon" aria-hidden="true">{Icons.home}</span>
          <span className="vault-toolbar__crumb-label">Vault</span>
        </button>

        {/* Trail */}
        {breadcrumbs.map((folder, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <React.Fragment key={folder.id}>
              <span className="vault-toolbar__sep" aria-hidden="true">{Icons.chevron}</span>
              <button
                className={`vault-toolbar__crumb ${isLast ? 'vault-toolbar__crumb--active' : ''}`}
                onClick={() => navigateToBreadcrumb(index)}
                aria-current={isLast ? 'page' : undefined}
                title={folder.name}
              >
                <span className="vault-toolbar__crumb-label">{folder.name}</span>
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      <div className="vault-toolbar__actions">

        <button
          className="vault-toolbar__btn vault-toolbar__btn--ghost"
          onClick={onReload}
          disabled={loading}
          title="Reload"
          aria-label="Reload folder contents"
        >
          <span className={`vault-toolbar__btn-icon ${loading ? 'vault-toolbar__btn-icon--spinning' : ''}`} aria-hidden="true">
            {Icons.refresh}
          </span>
        </button>

        <button
          className="vault-toolbar__btn vault-toolbar__btn--secondary"
          onClick={onNewFolder}
          disabled={loading}
        >
          <span className="vault-toolbar__btn-icon" aria-hidden="true">{Icons.folderPlus}</span>
          New folder
        </button>

        <button
          className="vault-toolbar__btn vault-toolbar__btn--primary"
          onClick={onUpload}
          disabled={loading}
        >
          <span className="vault-toolbar__btn-icon" aria-hidden="true">{Icons.upload}</span>
          Upload
        </button>

      </div>

      <style>{styles}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  .vault-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 0 12px;
    border-bottom: 1px solid var(--D-border, #e9ecef);
    flex-shrink: 0;
    min-width: 0;
  }

  /* ── Breadcrumbs ─────────────────────────────────────────────────────────── */
  .vault-toolbar__breadcrumbs {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }

  .vault-toolbar__crumb {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 6px;
    border: none;
    background: transparent;
    border-radius: var(--D-radius-sm, 6px);
    color: var(--D-text-secondary, #6c757d);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: background 100ms, color 100ms;
    max-width: 160px;
  }

  .vault-toolbar__crumb:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-toolbar__crumb--root {
    flex-shrink: 0;
    max-width: none;
  }

  .vault-toolbar__crumb--active {
    color: var(--D-text-primary, #1a1a2e);
    font-weight: 600;
    cursor: default;
    pointer-events: none;
    background: transparent;
  }

  .vault-toolbar__crumb-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .vault-toolbar__crumb-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vault-toolbar__sep {
    display: flex;
    align-items: center;
    color: var(--D-text-muted, #adb5bd);
    flex-shrink: 0;
  }

  /* ── Actions ─────────────────────────────────────────────────────────────── */
  .vault-toolbar__actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .vault-toolbar__btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--D-radius-sm, 6px);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 120ms, border-color 120ms, color 120ms, opacity 120ms;
    white-space: nowrap;
    height: 32px;
  }

  .vault-toolbar__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .vault-toolbar__btn--ghost {
    background: transparent;
    border-color: transparent;
    color: var(--D-text-secondary, #6c757d);
    padding: 6px 8px;
  }

  .vault-toolbar__btn--ghost:hover:not(:disabled) {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-toolbar__btn--secondary {
    background: var(--D-surface, #ffffff);
    border-color: var(--D-border, #e9ecef);
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-toolbar__btn--secondary:hover:not(:disabled) {
    background: var(--D-hover, #f1f3f5);
    border-color: var(--D-border-strong, #dee2e6);
  }

  .vault-toolbar__btn--primary {
    background: var(--D-accent, #2563eb);
    border-color: var(--D-accent, #2563eb);
    color: #ffffff;
  }

  .vault-toolbar__btn--primary:hover:not(:disabled) {
    background: var(--D-accent-hover, #1d4ed8);
    border-color: var(--D-accent-hover, #1d4ed8);
  }

  .vault-toolbar__btn-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .vault-toolbar__btn-icon--spinning {
    animation: vault-spin 700ms linear infinite;
  }

  @keyframes vault-spin {
    to { transform: rotate(360deg); }
  }

  /* ── Responsive ─────────────────────────────────────────────────────────── */
  @media (max-width: 600px) {
    .vault-toolbar__btn--secondary span:last-child,
    .vault-toolbar__btn--primary span:last-child {
      display: none;
    }

    .vault-toolbar__btn--secondary,
    .vault-toolbar__btn--primary {
      padding: 6px 8px;
    }
  }
`;