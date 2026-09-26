import React, { useState, useEffect } from 'react';
import vaultAPI from '../../../../../_shared/api/vault';
import { useVaultTree } from '../../../../../_shared/hooks/vaultHooks';

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icons = {
  close: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  move: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M10.5 3.5L13 7l-2.5 3.5M3.5 3.5L1 7l2.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  folder: ({ open, type }) => {
    const color = {
      system_logs:    '#f59e0b',
      system_exports: '#10b981',
      cold_storage:   '#6366f1',
    }[type] ?? 'var(--D-accent, #2563eb)';
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
        {open
          ? <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5.5L7 3.5H11.5C12.33 3.5 13 4.17 13 5v5.5c0 .83-.67 1.5-1.5 1.5h-9C1.67 12 1 11.33 1 10.5v-7z"
              fill={color} opacity=".85"/>
          : <>
              <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5.5L7 3.5H11.5C12.33 3.5 13 4.17 13 5v5.5c0 .83-.67 1.5-1.5 1.5h-9C1.67 12 1 11.33 1 10.5v-7z"
                fill={color} opacity=".18"/>
              <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5.5L7 3.5H11.5C12.33 3.5 13 4.17 13 5v5.5c0 .83-.67 1.5-1.5 1.5h-9C1.67 12 1 11.33 1 10.5v-7z"
                stroke={color} strokeWidth="1.2"/>
            </>
        }
      </svg>
    );
  },
  chevron: ({ open }) => (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}>
      <path d="M3.5 1.5l3 3.5-3 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  vault: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.3" fill="none" opacity=".4"/>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" fill="currentColor" opacity=".15"/>
      <path d="M7 4.5v5M4.5 7h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  spinner: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="vault-modal__spinner">
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="12 18" opacity=".6"/>
    </svg>
  ),
};

// ─── MoveModal ───────────────────────────────────────────────────────────────
export default function MoveModal({ item, type, onClose, onMove }) {
  const tree = useVaultTree();
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [expanded, setExpanded] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Close on Escape
  useEffect(() => {
    function handleKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Load root on mount
  useEffect(() => {
    if (!tree.hasTreeChildren(null)) {
      tree.expand(null);
    }
  }, []); // eslint-disable-line

  const toggleExpand = async (folderId) => {
    const next = new Set(expanded);
    if (next.has(folderId)) {
      next.delete(folderId);
    } else {
      if (!tree.hasTreeChildren(folderId)) {
        await tree.expand(folderId);
      }
      next.add(folderId);
    }
    setExpanded(next);
  };

  const handleSelect = (folderId) => {
    // Can't move into itself (for folders)
    if (type === 'folder' && folderId === item.id) return;
    setSelectedFolderId(folderId);
    setError(null);
  };

  const handleMove = async () => {
    setLoading(true);
    setError(null);
    try {
      await onMove(selectedFolderId);
    } catch (err) {
      setError(err.response?.data?.message || 'Move failed. Please try again.');
      setLoading(false);
    }
  };

  const itemLabel = type === 'folder' ? item.name : (item.name || item.original_filename);

  return (
    <div className="vault-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Move item">
      <div className="vault-modal vault-modal--wide" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="vault-modal__header">
          <div className="vault-modal__header-left">
            <span className="vault-modal__header-icon">{Icons.move}</span>
            <h3 className="vault-modal__title">Move {type}</h3>
          </div>
          <button className="vault-modal__close" onClick={onClose} aria-label="Close">
            {Icons.close}
          </button>
        </div>

        <div className="vault-modal__body vault-modal__body--scroll">
          <p className="vault-move__context">
            Moving <strong>{itemLabel}</strong> to:
          </p>

          {/* Root option */}
          <button
            className={`vault-move__row vault-move__row--root ${selectedFolderId === null ? 'vault-move__row--selected' : ''}`}
            onClick={() => handleSelect(null)}
          >
            <Icons.vault />
            <span>Vault root</span>
          </button>

          {/* Tree */}
          <div className="vault-move__tree">
            {renderTreeNodes({
              nodes: tree.getChildren(null) || [],
              tree,
              expanded,
              toggleExpand,
              selectedFolderId,
              handleSelect,
              depth: 0,
              excludeId: type === 'folder' ? item.id : null,
            })}
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
            className="vault-modal__btn vault-modal__btn--primary"
            onClick={handleMove}
            disabled={loading}
          >
            {loading ? (
              <>
                {Icons.spinner}
                Moving…
              </>
            ) : (
              <>
                {Icons.move}
                Move here
              </>
            )}
          </button>
        </div>
      </div>

      <style>{styles}</style>
    </div>
  );
}

// ─── Recursive tree renderer ─────────────────────────────────────────────────
function renderTreeNodes({ nodes, tree, expanded, toggleExpand, selectedFolderId, handleSelect, depth, excludeId }) {
  return nodes.map(folder => {
    const isExpanded = expanded.has(folder.id);
    const children = tree.getChildren(folder.id);
    const isExcluded = folder.id === excludeId;
    const isSelected = selectedFolderId === folder.id;

    return (
      <div key={folder.id}>
        <button
          className={[
            'vault-move__row',
            isSelected ? 'vault-move__row--selected' : '',
            isExcluded ? 'vault-move__row--disabled' : '',
          ].join(' ')}
          style={{ paddingLeft: 12 + depth * 18 }}
          onClick={() => !isExcluded && handleSelect(folder.id)}
          disabled={isExcluded}
          title={isExcluded ? 'Cannot move into itself' : folder.name}
        >
          {/* Expand toggle */}
          <span
            className="vault-move__chevron"
            onClick={e => { e.stopPropagation(); toggleExpand(folder.id); }}
            role="button"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <Icons.chevron open={isExpanded} />
          </span>

          <Icons.folder type={folder.folder_type} open={isExpanded} />
          <span className="vault-move__label">{folder.name}</span>
        </button>

        {isExpanded && children?.map(child =>
          renderTreeNodes({
            nodes: [child],
            tree,
            expanded,
            toggleExpand,
            selectedFolderId,
            handleSelect,
            depth: depth + 1,
            excludeId,
          })
        )}
      </div>
    );
  });
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
    max-width: 360px;
    max-height: 80vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: vault-modal-slide-in 180ms ease;
  }

  .vault-modal--wide {
    max-width: 400px;
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
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    flex: 1;
  }

  .vault-modal__body--scroll {
    padding: 8px 4px 8px 8px;
  }

  .vault-modal__error {
    margin-top: 8px;
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

  /* ── Move tree rows ──────────────────────────────────────────────────────── */
  .vault-move__context {
    font-size: 12.5px;
    color: var(--D-text-secondary, #6c757d);
    margin: 0 0 6px 4px;
  }

  .vault-move__context strong {
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-move__row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border: none;
    background: transparent;
    border-radius: 5px;
    color: var(--D-text-primary, #1a1a2e);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    width: 100%;
    transition: background 100ms;
    min-height: 30px;
  }

  .vault-move__row:hover:not(:disabled) {
    background: var(--D-hover, #f1f3f5);
  }

  .vault-move__row--selected {
    background: var(--D-accent-soft, #e7f0ff);
    color: var(--D-accent, #2563eb);
  }

  .vault-move__row--selected:hover {
    background: var(--D-accent-soft, #e7f0ff);
  }

  .vault-move__row--disabled {
    opacity: 0.4;
    cursor: not-allowed;
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-move__row--root {
    margin-bottom: 4px;
  }

  .vault-move__chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    border-radius: 3px;
    color: var(--D-text-muted, #adb5bd);
    transition: color 100ms;
  }

  .vault-move__chevron:hover {
    background: rgba(0,0,0,0.06);
  }

  .vault-move__label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vault-move__tree {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
`;
