import React, { useCallback } from 'react';
import useVaultStore          from '../../../../store/useVaultStore';
import { useVaultFolder }     from '../../../../hooks/vaultHooks';
import VaultFolderTree        from '../tree/VaultFolderTree';
import VaultToolbar           from './VaultToolbar';
import VaultFolderGrid        from '../browser/VaultFolderGrid';
import VaultFolderTable       from '../browser/VaultFolderTable';
import VaultDocumentGrid      from '../browser/VaultDocumentGrid';
import { VaultDocumentTable } from "../browser/VaultDocumentGrid";
import VaultPreviewPanel      from '../preview/VaultPreviewPanel';
import { VaultPreviewExpanded } from '../preview/VaultPreviewPanel';

// Modals — all rendered here so they portal above everything
import UploadDocumentModal    from '../modals/UploadDocumentModal';
import CreateFolderModal      from '../modals/CreateFolderModal';
import EditFolderModal        from '../modals/EditFolderModal';
import EditDocumentModal      from '../modals/EditDocumentModal';
import MoveModal              from '../modals/MoveModal';
import PasswordModal          from '../modals/PasswordModal';
import ArchiveModal           from '../modals/ArchiveModal';
import VersionHistoryPanel    from '../modals/VersionHistoryPanel';

// ─────────────────────────────────────────────────────────────────────────────
// VaultBrowserView
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultBrowserView() {
  const {
    layout,
    viewMode,
    previewDoc,
    previewExpanded,
    modals,
    modalContext,
    openModal,
    closeModal,
  } = useVaultStore();

  const {
    folders,
    documents,
    loading,
    error,
    reload,
    createFolder,
    deleteFolder,
    deleteDocument,
    moveDocument,
    moveFolder,
    uploadDocument,
    archiveFolder,
    archiveDocument,
    openFolder,
  } = useVaultFolder();

  // ── Drop handler (used by useDragDrop inside cards) ───────────────────────
  const handleDrop = useCallback(async ({ type, item }, destinationFolderId) => {
    try {
      if (type === 'document') await moveDocument(item, destinationFolderId);
      if (type === 'folder')   await moveFolder(item, destinationFolderId);
    } catch {
      // errors handled inside the mutation — toast from caller
    }
  }, [moveDocument, moveFolder]);

  // ── Shared content area ───────────────────────────────────────────────────
  const contentArea = (
    <div className="vault-browser__content">
      <VaultToolbar
        loading={loading}
        onReload={reload}
        onUpload={() => openModal('uploadDocument')}
        onNewFolder={() => openModal('createFolder')}
      />

      {error && (
        <div className="vault-browser__error">
          Failed to load folder contents.{' '}
          <button onClick={reload} className="vault-browser__error-retry">Retry</button>
        </div>
      )}

      {/* Subfolders */}
      {folders.length > 0 && (
        <section className="vault-browser__section">
          <p className="vault-browser__section-label">Folders</p>
          {viewMode === 'card'
            ? <VaultFolderGrid
                folders={folders}
                onOpen={openFolder}
                onEdit={f  => openModal('editFolder',   { item: f })}
                onDelete={deleteFolder}
                onArchive={f => openModal('archive',    { item: f, type: 'folder' })}
                onMove={f  => openModal('move',         { item: f, type: 'folder' })}
                onDrop={handleDrop}
              />
            : <VaultFolderTable
                folders={folders}
                onOpen={openFolder}
                onEdit={f  => openModal('editFolder',   { item: f })}
                onDelete={deleteFolder}
                onArchive={f => openModal('archive',    { item: f, type: 'folder' })}
                onMove={f  => openModal('move',         { item: f, type: 'folder' })}
                onDrop={handleDrop}
              />
          }
        </section>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <section className="vault-browser__section">
          <p className="vault-browser__section-label">Documents</p>
          {viewMode === 'card'
            ? <VaultDocumentGrid
                documents={documents}
                onEdit={d    => openModal('editDocument',  { item: d })}
                onDelete={deleteDocument}
                onArchive={d => openModal('archive',       { item: d, type: 'document' })}
                onMove={d    => openModal('move',          { item: d, type: 'document' })}
                onPassword={d => openModal('password',    { item: d, mode: 'set' })}
                onVersions={d => openModal('versionHistory', { item: d })}
                onDrop={handleDrop}
              />
            : <VaultDocumentTable
                documents={documents}
                onEdit={d    => openModal('editDocument',  { item: d })}
                onDelete={deleteDocument}
                onArchive={d => openModal('archive',       { item: d, type: 'document' })}
                onMove={d    => openModal('move',          { item: d, type: 'document' })}
                onPassword={d => openModal('password',    { item: d, mode: 'set' })}
                onVersions={d => openModal('versionHistory', { item: d })}
                onDrop={handleDrop}
              />
          }
        </section>
      )}

      {/* Empty state */}
      {!loading && folders.length === 0 && documents.length === 0 && !error && (
        <VaultEmptyState
          onUpload={() => openModal('uploadDocument')}
          onNewFolder={() => openModal('createFolder')}
        />
      )}
    </div>
  );

  return (
    <div className={`vault-browser vault-browser--${layout} ${previewDoc ? 'vault-browser--previewing' : ''}`}>

      {/* ── Sidebar layout ─────────────────────────────────────────────── */}
      {layout === 'sidebar' && (
        <>
          <aside className="vault-browser__sidebar">
            <VaultFolderTree onDrop={handleDrop} />
          </aside>
          <div className="vault-browser__main">
            {contentArea}
            {previewDoc && <VaultPreviewPanel />}
          </div>
        </>
      )}

      {/* ── Breadcrumb layout ──────────────────────────────────────────── */}
      {layout === 'breadcrumb' && (
        <div className="vault-browser__main vault-browser__main--full">
          {contentArea}
          {previewDoc && <VaultPreviewPanel />}
        </div>
      )}

      {/* ── Full-screen preview overlay ────────────────────────────────── */}
      {previewExpanded && <VaultPreviewExpanded />}

      {/* ── Modals ─────────────────────────────────────────────────────── */}
      {modals.uploadDocument  && (
        <UploadDocumentModal
          onClose={() => closeModal('uploadDocument')}
          onUpload={uploadDocument}
        />
      )}
      {modals.createFolder && (
        <CreateFolderModal
          onClose={() => closeModal('createFolder')}
          onCreate={createFolder}
        />
      )}
      {modals.editFolder && modalContext?.item && (
        <EditFolderModal
          folder={modalContext.item}
          onClose={() => closeModal('editFolder')}
          onSave={reload}
        />
      )}
      {modals.editDocument && modalContext?.item && (
        <EditDocumentModal
          document={modalContext.item}
          onClose={() => closeModal('editDocument')}
          onSave={reload}
        />
      )}
      {modals.move && modalContext?.item && (
        <MoveModal
          item={modalContext.item}
          type={modalContext.type}
          onClose={() => closeModal('move')}
          onMove={async (destinationFolderId) => {
            await handleDrop({ type: modalContext.type, item: modalContext.item }, destinationFolderId);
            closeModal('move');
          }}
        />
      )}
      {modals.password && modalContext?.item && (
        <PasswordModal
          item={modalContext.item}
          mode={modalContext.mode ?? 'set'}
          onClose={() => closeModal('password')}
          onSuccess={reload}
        />
      )}
      {modals.archive && modalContext?.item && (
        <ArchiveModal
          item={modalContext.item}
          type={modalContext.type}
          onClose={() => closeModal('archive')}
          onArchive={async (options) => {
            if (modalContext.type === 'folder') {
              await archiveFolder(modalContext.item, options);
            } else {
              await archiveDocument(modalContext.item, options);
            }
            closeModal('archive');
          }}
        />
      )}
      {modals.versionHistory && modalContext?.item && (
        <VersionHistoryPanel
          document={modalContext.item}
          onClose={() => closeModal('versionHistory')}
        />
      )}

      <style>{styles}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
function VaultEmptyState({ onUpload, onNewFolder }) {
  return (
    <div className="vault-empty">
      <div className="vault-empty__icon" aria-hidden="true">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <rect x="4" y="8" width="40" height="32" rx="4" stroke="currentColor" strokeWidth="2" fill="none" opacity=".2"/>
          <rect x="4" y="8" width="18" height="8" rx="2" fill="currentColor" opacity=".15"/>
          <path d="M24 28v-8M20 24h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      <p className="vault-empty__title">This folder is empty</p>
      <p className="vault-empty__sub">Upload a document or create a subfolder to get started.</p>
      <div className="vault-empty__actions">
        <button className="vault-empty__btn vault-empty__btn--primary" onClick={onUpload}>
          Upload document
        </button>
        <button className="vault-empty__btn" onClick={onNewFolder}>
          New folder
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  /* ── Shell ──────────────────────────────────────────────────────────────── */
  .vault-browser {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
    height: 100%;  
    width: 100%; 
  }

  /* ── Sidebar layout ─────────────────────────────────────────────────────── */
  .vault-browser__sidebar {
    width: 240px;
    flex-shrink: 0;
    border-right: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .vault-browser__main {
    flex: 1;
    min-width: 0;
    min-height: 0;  
    display: flex;
    overflow: hidden;
    height: 100%
  }

  .vault-browser__main--full {
    width: 100%;
  }

  /* When preview panel is open, main splits into content + panel */
  .vault-browser__content {
    flex: 1;
    min-width: 0;
    min-height: 0; 
    overflow-y: auto;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%; 
  }

  /* ── Section labels ─────────────────────────────────────────────────────── */
  .vault-browser__section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .vault-browser__section-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--D-text-muted, #adb5bd);
    margin: 0;
    padding: 4px 0 2px;
  }

  /* ── Error banner ───────────────────────────────────────────────────────── */
  .vault-browser__error {
    padding: 10px 14px;
    background: var(--D-danger-soft, #fff5f5);
    border: 1px solid var(--D-danger-border, #ffc9c9);
    border-radius: var(--D-radius, 8px);
    color: var(--D-danger, #e03131);
    font-size: 13px;
  }

  .vault-browser__error-retry {
    background: none;
    border: none;
    color: var(--D-danger, #e03131);
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
    font-size: 13px;
  }

  /* ── Empty state ────────────────────────────────────────────────────────── */
  .vault-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 24px;
    text-align: center;
    gap: 10px;
    color: var(--D-text-secondary, #6c757d);
    flex: 1;
  }

  .vault-empty__icon {
    color: var(--D-text-muted, #adb5bd);
    margin-bottom: 4px;
  }

  .vault-empty__title {
    font-size: 15px;
    font-weight: 600;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0;
  }

  .vault-empty__sub {
    font-size: 13px;
    color: var(--D-text-secondary, #6c757d);
    margin: 0;
    max-width: 280px;
  }

  .vault-empty__actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .vault-empty__btn {
    padding: 8px 16px;
    border-radius: var(--D-radius, 8px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    color: var(--D-text-primary, #1a1a2e);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 120ms;
  }

  .vault-empty__btn:hover {
    background: var(--D-hover, #f1f3f5);
  }

  .vault-empty__btn--primary {
    background: var(--D-accent, #2563eb);
    color: #fff;
    border-color: var(--D-accent, #2563eb);
  }

  .vault-empty__btn--primary:hover {
    background: var(--D-accent-hover, #1d4ed8);
    border-color: var(--D-accent-hover, #1d4ed8);
  }

  /* ── Responsive ─────────────────────────────────────────────────────────── */
  @media (max-width: 768px) {
    .vault-browser__sidebar {
      display: none;
    }

    .vault-browser__content {
      padding: 14px 16px;
    }
  }
`;