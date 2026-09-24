import React, { useState, useRef, useEffect } from 'react';
import { useDragDrop } from '../../../../hooks/vaultHooks';

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
const Icons = {
  folder: ({ type, open }) => {
    const color = {
      system_logs:    '#f59e0b',
      system_exports: '#10b981',
      cold_storage:   '#6366f1',
      manual:         open ? '#2563eb' : null,
    }[type] ?? null;

    return (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <path
          d="M3 10C3 7.79 4.79 6 7 6H15L18 9.5H29C31.21 9.5 33 11.29 33 13.5V27C33 29.21 31.21 31 29 31H7C4.79 31 3 29.21 3 27V10z"
          fill={color ?? 'var(--D-accent, #2563eb)'}
          opacity=".18"
        />
        <path
          d="M3 10C3 7.79 4.79 6 7 6H15L18 9.5H29C31.21 9.5 33 11.29 33 13.5V27C33 29.21 31.21 31 29 31H7C4.79 31 3 29.21 3 27V10z"
          stroke={color ?? 'var(--D-accent, #2563eb)'}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  },
  lock: (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
      <rect x="1.5" y="5" width="8" height="5.5" rx="1.2" fill="currentColor" opacity=".5"/>
      <path d="M3.2 5V3.5a2.3 2.3 0 014.6 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  dots: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="3"  r="1.2" fill="currentColor"/>
      <circle cx="7" cy="7"  r="1.2" fill="currentColor"/>
      <circle cx="7" cy="11" r="1.2" fill="currentColor"/>
    </svg>
  ),
  edit:    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9 2l2 2-7 7H2v-2L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  move:    <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M9.5 3.5L11.5 6.5l-2 3M3.5 3.5L1.5 6.5l2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  archive: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1.5" width="11" height="3" rx=".8" fill="currentColor" opacity=".7"/><rect x="1" y="6" width="11" height="6" rx=".8" fill="currentColor" opacity=".2"/><path d="M4.5 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  delete:  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M5 3.5V2h3v1.5M5.5 6v3.5M7.5 6v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M3 3.5l.7 7.2a.8.8 0 00.8.8h5a.8.8 0 00.8-.8L11 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

const SENSITIVITY_COLORS = {
  confidential: '#f59e0b',
  restricted:   '#ef4444',
  top_secret:   '#7c3aed',
};

// ─────────────────────────────────────────────────────────────────────────────
// Context menu
// ─────────────────────────────────────────────────────────────────────────────
function FolderContextMenu({ folder, onEdit, onMove, onArchive, onDelete, onClose, anchorRef }) {
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target) &&
          anchorRef.current && !anchorRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  const items = [
    { icon: Icons.edit,    label: 'Edit',    action: onEdit,    className: '' },
    { icon: Icons.move,    label: 'Move',    action: onMove,    className: '' },
    { icon: Icons.archive, label: 'Archive', action: onArchive, className: '' },
    { icon: Icons.delete,  label: 'Delete',  action: () => onDelete(folder), className: 'vault-folder-menu__item--danger' },
  ];

  return (
    <div className="vault-folder-menu" ref={menuRef} role="menu">
      {items.map(({ icon, label, action, className }) => (
        <button
          key={label}
          className={`vault-folder-menu__item ${className}`}
          role="menuitem"
          onClick={(e) => { e.stopPropagation(); action(folder); onClose(); }}
        >
          <span className="vault-folder-menu__icon" aria-hidden="true">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultFolderCard
// ─────────────────────────────────────────────────────────────────────────────
function VaultFolderCard({ folder, onOpen, onEdit, onMove, onArchive, onDelete, onDrop }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dotsRef = useRef(null);

  const { getDragProps, getDropProps, isDropTarget } = useDragDrop({ onDrop });
  const isTarget = isDropTarget(folder.id);

  const sensColor = SENSITIVITY_COLORS[folder.sensitivity_level];

  return (
    <div
      className={[
        'vault-folder-card',
        isTarget ? 'vault-folder-card--drop-target' : '',
      ].join(' ')}
      onClick={() => onOpen(folder)}
      role="button"
      tabIndex={0}
      aria-label={`Open folder ${folder.name}`}
      onKeyDown={e => e.key === 'Enter' && onOpen(folder)}
      {...getDragProps('folder', folder)}
      {...getDropProps(folder.id)}
    >
      {/* Sensitivity stripe */}
      {sensColor && (
        <span className="vault-folder-card__stripe" style={{ background: sensColor }} aria-hidden="true" />
      )}

      {/* Top row: icon + menu */}
      <div className="vault-folder-card__top">
        <Icons.folder type={folder.folder_type} />

        <button
          ref={dotsRef}
          className="vault-folder-card__menu-btn"
          aria-label="Folder options"
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
        >
          {Icons.dots}
        </button>

        {menuOpen && (
          <FolderContextMenu
            folder={folder}
            onEdit={onEdit}
            onMove={onMove}
            onArchive={onArchive}
            onDelete={onDelete}
            onClose={() => setMenuOpen(false)}
            anchorRef={dotsRef}
          />
        )}
      </div>

      {/* Name + meta */}
      <div className="vault-folder-card__body">
        <p className="vault-folder-card__name" title={folder.name}>{folder.name}</p>

        <div className="vault-folder-card__meta">
          {folder.children_count !== undefined && (
            <span>{folder.children_count} folder{folder.children_count !== 1 ? 's' : ''}</span>
          )}
          {folder.documents_count !== undefined && (
            <span>{folder.documents_count} file{folder.documents_count !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* Badges row */}
      <div className="vault-folder-card__badges">
        {folder.is_locked && (
          <span className="vault-folder-card__badge vault-folder-card__badge--lock" aria-label="Password protected">
            {Icons.lock}
          </span>
        )}
        {sensColor && (
          <span
            className="vault-folder-card__badge vault-folder-card__badge--sens"
            style={{ color: sensColor, borderColor: sensColor }}
            aria-label={`Sensitivity: ${folder.sensitivity_level}`}
          >
            {folder.sensitivity_level.replace('_', ' ')}
          </span>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultFolderGrid
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultFolderGrid({ folders, onOpen, onEdit, onDelete, onArchive, onMove, onDrop }) {
  return (
    <>
      <div className="vault-folder-grid">
        {folders.map(folder => (
          <VaultFolderCard
            key={folder.id}
            folder={folder}
            onOpen={onOpen}
            onEdit={onEdit}
            onDelete={onDelete}
            onArchive={onArchive}
            onMove={onMove}
            onDrop={onDrop}
          />
        ))}
      </div>

      <style>{styles}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  /* ── Grid ───────────────────────────────────────────────────────────────── */
  .vault-folder-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;
  }

  /* ── Card ───────────────────────────────────────────────────────────────── */
  .vault-folder-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 12px 10px;
    border-radius: var(--D-radius, 8px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    cursor: pointer;
    transition: border-color 120ms, box-shadow 120ms, opacity 120ms;
    user-select: none;
    overflow: hidden;
  }

  .vault-folder-card:hover {
    border-color: var(--D-border-strong, #dee2e6);
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }

  .vault-folder-card:focus-visible {
    outline: 2px solid var(--D-accent, #2563eb);
    outline-offset: 2px;
  }

  .vault-folder-card--drop-target {
    border-color: var(--D-accent, #2563eb) !important;
    box-shadow: 0 0 0 3px var(--D-accent-soft, #e7f0ff) !important;
  }

  /* Dragging — set by useDragDrop via opacity on the element */
  .vault-folder-card[draggable="true"]:active {
    opacity: 0.4;
  }

  /* Sensitivity stripe */
  .vault-folder-card__stripe {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    border-radius: 8px 8px 0 0;
  }

  /* Top row */
  .vault-folder-card__top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    position: relative;
  }

  /* Menu button */
  .vault-folder-card__menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: 4px;
    color: var(--D-text-muted, #adb5bd);
    cursor: pointer;
    opacity: 0;
    transition: opacity 100ms, background 100ms, color 100ms;
    flex-shrink: 0;
  }

  .vault-folder-card:hover .vault-folder-card__menu-btn,
  .vault-folder-card__menu-btn:focus-visible {
    opacity: 1;
  }

  .vault-folder-card__menu-btn:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  /* Body */
  .vault-folder-card__body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .vault-folder-card__name {
    font-size: 13px;
    font-weight: 600;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vault-folder-card__meta {
    display: flex;
    gap: 6px;
    font-size: 11px;
    color: var(--D-text-muted, #adb5bd);
  }

  /* Badges */
  .vault-folder-card__badges {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    min-height: 18px;
  }

  .vault-folder-card__badge {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    border-radius: 3px;
    padding: 1px 5px;
  }

  .vault-folder-card__badge--lock {
    color: var(--D-text-muted, #adb5bd);
    background: var(--D-hover, #f1f3f5);
  }

  .vault-folder-card__badge--sens {
    background: transparent;
    border: 1px solid;
    text-transform: capitalize;
  }

  /* ── Context menu ────────────────────────────────────────────────────────── */
  .vault-folder-menu {
    position: absolute;
    top: 28px;
    right: 0;
    z-index: 50;
    min-width: 140px;
    background: var(--D-surface, #ffffff);
    border: 1px solid var(--D-border, #e9ecef);
    border-radius: var(--D-radius, 8px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
    padding: 4px;
    display: flex;
    flex-direction: column;
  }

  .vault-folder-menu__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border: none;
    background: transparent;
    border-radius: 5px;
    font-size: 13px;
    color: var(--D-text-primary, #1a1a2e);
    cursor: pointer;
    text-align: left;
    transition: background 100ms;
  }

  .vault-folder-menu__item:hover {
    background: var(--D-hover, #f1f3f5);
  }

  .vault-folder-menu__item--danger {
    color: var(--D-danger, #e03131);
  }

  .vault-folder-menu__item--danger:hover {
    background: var(--D-danger-soft, #fff5f5);
  }

  .vault-folder-menu__icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    opacity: 0.7;
  }
`;