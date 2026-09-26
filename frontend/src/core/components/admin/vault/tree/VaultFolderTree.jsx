import React, { useCallback }  from 'react';
import useVaultStore            from '../../../../../_shared/store/useVaultStore';
import { useVaultTree, useDragDrop } from '../../../../../_shared/hooks/vaultHooks';

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
const ChevronIcon = ({ open }) => (
  <svg
    width="12" height="12" viewBox="0 0 12 12" fill="none"
    style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms' }}
  >
    <path d="M4 2.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const FolderIcon = ({ type, open }) => {
  const color = {
    system_logs:    '#f59e0b',
    system_exports: '#10b981',
    cold_storage:   '#6366f1',
    manual:         open ? '#2563eb' : 'currentColor',
  }[type] ?? 'currentColor';

  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0 }}>
      {open
        ? <path d="M1 4.5C1 3.67 1.67 3 2.5 3H6l1.5 1.5H12.5C13.33 4.5 14 5.17 14 6v5.5c0 .83-.67 1.5-1.5 1.5h-10C1.67 13 1 12.33 1 11.5v-7z"
            fill={color} opacity=".85"/>
        : <>
            <path d="M1 4.5C1 3.67 1.67 3 2.5 3H6l1.5 1.5H12.5C13.33 4.5 14 5.17 14 6v5.5c0 .83-.67 1.5-1.5 1.5h-10C1.67 13 1 12.33 1 11.5v-7z"
              fill={color} opacity=".18"/>
            <path d="M1 4.5C1 3.67 1.67 3 2.5 3H6l1.5 1.5H12.5C13.33 4.5 14 5.17 14 6v5.5c0 .83-.67 1.5-1.5 1.5h-10C1.67 13 1 12.33 1 11.5v-7z"
              stroke={color} strokeWidth="1.2"/>
          </>
      }
    </svg>
  );
};

const SpinnerIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="vault-tree__spinner">
    <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 8" opacity=".6"/>
  </svg>
);

const VaultRootIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" style={{ flexShrink: 0 }}>
    <rect x="1" y="1" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.3" fill="none" opacity=".4"/>
    <rect x="3.5" y="3.5" width="8" height="8" rx="1.5" fill="currentColor" opacity=".15"/>
    <path d="M7.5 5v5M5 7.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// VaultFolderTree — sidebar root
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultFolderTree({ onDrop }) {
  const { currentFolder, openFolder } = useVaultStore();
  const tree = useVaultTree();

  const rootChildren = tree.getChildren(null);
  const rootLoading  = tree.isLoading(null);

  return (
    <div className="vault-tree" role="tree" aria-label="Folder tree">

      {/* Vault root row */}
      <VaultRootRow
        active={currentFolder === null}
        onClick={() => openFolder(null)}
        onDrop={onDrop}
      />

      {/* Root-level folders */}
      {rootLoading && <TreeLoadingRow depth={0} />}

      {rootChildren?.map(folder => (
        <VaultTreeNode
          key={folder.id}
          folder={folder}
          depth={0}
          tree={tree}
          onDrop={onDrop}
        />
      ))}

      <style>{styles}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultRootRow
// ─────────────────────────────────────────────────────────────────────────────
function VaultRootRow({ active, onClick, onDrop }) {
  const { dropTarget } = useVaultStore();
  const { getDropProps } = useDragDrop({ onDrop });
  const isTarget = dropTarget === 'root';

  return (
    <div
      className={`vault-tree__root-row ${active ? 'vault-tree__row--active' : ''} ${isTarget ? 'vault-tree__row--drop-target' : ''}`}
      onClick={onClick}
      role="treeitem"
      aria-selected={active}
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      {...getDropProps('root')}
    >
      <VaultRootIcon />
      <span className="vault-tree__label">Vault</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultTreeNode — recursive
// ─────────────────────────────────────────────────────────────────────────────
function VaultTreeNode({ folder, depth, tree, onDrop }) {
  const { currentFolder, openFolder, dropTarget } = useVaultStore();

  const isActive   = currentFolder?.id === folder.id;
  const isExpanded = tree.isExpanded(folder.id);
  const isLoading  = tree.isLoading(folder.id);
  const children   = tree.getChildren(folder.id);
  const isTarget   = dropTarget === folder.id;

  const { getDragProps, getDropProps } = useDragDrop({ onDrop });

  const handleChevronClick = useCallback((e) => {
    e.stopPropagation();
    if (isExpanded) {
      tree.collapse(folder.id);
    } else {
      tree.expand(folder.id);
    }
  }, [isExpanded, folder.id, tree]);

  const handleRowClick = useCallback(() => {
    openFolder(folder);
    if (!isExpanded) tree.expand(folder.id);
  }, [folder, isExpanded, openFolder, tree]);

  const indentPx = 10 + depth * 14;

  return (
    <div role="treeitem" aria-expanded={isExpanded} aria-selected={isActive}>

      {/* Row */}
      <div
        className={[
          'vault-tree__row',
          isActive  ? 'vault-tree__row--active'      : '',
          isTarget  ? 'vault-tree__row--drop-target'  : '',
        ].join(' ')}
        style={{ paddingLeft: indentPx }}
        onClick={handleRowClick}
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && handleRowClick()}
        {...getDragProps('folder', folder)}
        {...getDropProps(folder.id)}
      >
        {/* Chevron / spinner */}
        <span
          className="vault-tree__chevron"
          onClick={handleChevronClick}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isLoading
            ? <SpinnerIcon />
            : <ChevronIcon open={isExpanded} />
          }
        </span>

        <FolderIcon type={folder.folder_type} open={isExpanded && isActive} />

        <span className="vault-tree__label" title={folder.name}>
          {folder.name}
        </span>

        {/* Lock indicator */}
        {folder.is_locked && (
          <span className="vault-tree__lock" aria-label="Password protected">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="1.5" y="4.5" width="7" height="5" rx="1" fill="currentColor" opacity=".5"/>
              <path d="M3 4.5V3a2 2 0 014 0v1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </span>
        )}

        {/* Sensitivity badge — only for confidential and above */}
        {['confidential','restricted','top_secret'].includes(folder.sensitivity_level) && (
          <span
            className={`vault-tree__badge vault-tree__badge--${folder.sensitivity_level}`}
            aria-label={`Sensitivity: ${folder.sensitivity_level}`}
          />
        )}
      </div>

      {/* Children */}
      {isExpanded && (
        <div role="group">
          {isLoading && <TreeLoadingRow depth={depth + 1} />}

          {children?.length === 0 && !isLoading && (
            <div
              className="vault-tree__empty"
              style={{ paddingLeft: indentPx + 24 }}
            >
              No subfolders
            </div>
          )}

          {children?.map(child => (
            <VaultTreeNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              tree={tree}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TreeLoadingRow
// ─────────────────────────────────────────────────────────────────────────────
function TreeLoadingRow({ depth }) {
  return (
    <div className="vault-tree__loading-row" style={{ paddingLeft: 10 + depth * 14 + 24 }}>
      <div className="vault-tree__loading-bar" style={{ width: `${55 + Math.random() * 30}%` }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  .vault-tree {
    padding: 8px 0;
    user-select: none;
  }

  /* ── Root row ────────────────────────────────────────────────────────────── */
  .vault-tree__root-row {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 12px;
    cursor: pointer;
    border-radius: 0;
    color: var(--D-text-secondary, #6c757d);
    font-size: 13px;
    font-weight: 600;
    transition: background 100ms, color 100ms;
  }

  .vault-tree__root-row:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  /* ── Node row ────────────────────────────────────────────────────────────── */
  .vault-tree__row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 5px;
    padding-bottom: 5px;
    padding-right: 10px;
    cursor: pointer;
    color: var(--D-text-secondary, #6c757d);
    font-size: 13px;
    font-weight: 450;
    transition: background 100ms, color 100ms;
    border-radius: 0;
    min-height: 30px;
    position: relative;
  }

  .vault-tree__row:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-tree__row:focus-visible {
    outline: 2px solid var(--D-accent, #2563eb);
    outline-offset: -2px;
  }

  .vault-tree__row--active {
    background: var(--D-accent-soft, #e7f0ff);
    color: var(--D-accent, #2563eb);
    font-weight: 600;
  }

  .vault-tree__row--active:hover {
    background: var(--D-accent-soft, #e7f0ff);
  }

  .vault-tree__row--drop-target {
    background: var(--D-accent-soft, #e7f0ff) !important;
    outline: 2px solid var(--D-accent, #2563eb);
    outline-offset: -2px;
  }

  /* ── Chevron ─────────────────────────────────────────────────────────────── */
  .vault-tree__chevron {
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

  .vault-tree__row:hover .vault-tree__chevron,
  .vault-tree__row--active .vault-tree__chevron {
    color: currentColor;
  }

  .vault-tree__chevron:hover {
    background: rgba(0,0,0,0.06);
  }

  /* ── Label ───────────────────────────────────────────────────────────────── */
  .vault-tree__label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Lock icon ───────────────────────────────────────────────────────────── */
  .vault-tree__lock {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--D-text-muted, #adb5bd);
  }

  /* ── Sensitivity dot ─────────────────────────────────────────────────────── */
  .vault-tree__badge {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .vault-tree__badge--confidential { background: #f59e0b; }
  .vault-tree__badge--restricted   { background: #ef4444; }
  .vault-tree__badge--top_secret   { background: #7c3aed; }

  /* ── Empty / loading ─────────────────────────────────────────────────────── */
  .vault-tree__empty {
    font-size: 11.5px;
    color: var(--D-text-muted, #adb5bd);
    padding: 4px 0;
    font-style: italic;
  }

  .vault-tree__loading-row {
    padding: 6px 10px;
  }

  .vault-tree__loading-bar {
    height: 10px;
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      var(--D-skeleton-base, #e9ecef) 25%,
      var(--D-skeleton-shine, #f1f3f5) 50%,
      var(--D-skeleton-base, #e9ecef) 75%
    );
    background-size: 200% 100%;
    animation: vault-shimmer 1.4s ease-in-out infinite;
  }

  /* ── Spinner ─────────────────────────────────────────────────────────────── */
  .vault-tree__spinner {
    animation: vault-spin 800ms linear infinite;
  }

  @keyframes vault-spin    { to { transform: rotate(360deg); } }
  @keyframes vault-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;