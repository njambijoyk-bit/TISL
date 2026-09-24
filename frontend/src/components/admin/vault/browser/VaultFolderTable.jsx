import React, { useState, useRef, useEffect } from 'react';
import { useDragDrop } from '../../../../hooks/vaultHooks';

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
const Icons = {
  folder: ({ type }) => {
    const color = {
      system_logs:    '#f59e0b',
      system_exports: '#10b981',
      cold_storage:   '#6366f1',
    }[type] ?? 'var(--D-accent, #2563eb)';
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M1 4C1 3.17 1.67 2.5 2.5 2.5H6.5L8 4H13.5C14.33 4 15 4.67 15 5.5V12.5C15 13.33 14.33 14 13.5 14h-11C1.67 14 1 13.33 1 12.5V4z"
          fill={color} opacity=".18"/>
        <path d="M1 4C1 3.17 1.67 2.5 2.5 2.5H6.5L8 4H13.5C14.33 4 15 4.67 15 5.5V12.5C15 13.33 14.33 14 13.5 14h-11C1.67 14 1 13.33 1 12.5V4z"
          stroke={color} strokeWidth="1.2" strokeLinejoin="round"/>
      </svg>
    );
  },
  lock:    <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1.5" y="5" width="8" height="5.5" rx="1.2" fill="currentColor" opacity=".5"/><path d="M3.2 5V3.5a2.3 2.3 0 014.6 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  dots:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="3" cy="7" r="1.2" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/><circle cx="11" cy="7" r="1.2" fill="currentColor"/></svg>,
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

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Row context menu
// ─────────────────────────────────────────────────────────────────────────────
function RowMenu({ folder, onEdit, onMove, onArchive, onDelete, onClose, anchorRef }) {
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
    { icon: Icons.edit,    label: 'Edit',    action: onEdit },
    { icon: Icons.move,    label: 'Move',    action: onMove },
    { icon: Icons.archive, label: 'Archive', action: onArchive },
    { icon: Icons.delete,  label: 'Delete',  action: () => onDelete(folder), danger: true },
  ];

  return (
    <div className="vault-folder-row-menu" ref={menuRef} role="menu">
      {items.map(({ icon, label, action, danger }) => (
        <button
          key={label}
          className={`vault-folder-row-menu__item ${danger ? 'vault-folder-row-menu__item--danger' : ''}`}
          role="menuitem"
          onClick={e => { e.stopPropagation(); action(folder); onClose(); }}
        >
          <span className="vault-folder-row-menu__icon" aria-hidden="true">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FolderRow
// ─────────────────────────────────────────────────────────────────────────────
function FolderRow({ folder, onOpen, onEdit, onMove, onArchive, onDelete, onDrop }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dotsRef = useRef(null);

  const { getDragProps, getDropProps, isDropTarget } = useDragDrop({ onDrop });
  const isTarget = isDropTarget(folder.id);

  const sensColor = SENSITIVITY_COLORS[folder.sensitivity_level];

  return (
    <tr
      className={[
        'vault-folder-row',
        isTarget ? 'vault-folder-row--drop-target' : '',
      ].join(' ')}
      onClick={() => onOpen(folder)}
      tabIndex={0}
      role="row"
      aria-label={`Folder: ${folder.name}`}
      onKeyDown={e => e.key === 'Enter' && onOpen(folder)}
      {...getDragProps('folder', folder)}
      {...getDropProps(folder.id)}
    >
      {/* Icon + name */}
      <td className="vault-folder-row__cell vault-folder-row__cell--name">
        {sensColor && (
          <span className="vault-folder-row__stripe" style={{ background: sensColor }} aria-hidden="true" />
        )}
        <span className="vault-folder-row__name-wrap">
          <Icons.folder type={folder.folder_type} />
          <span className="vault-folder-row__name" title={folder.name}>{folder.name}</span>
          {folder.is_locked && (
            <span className="vault-folder-row__lock" aria-label="Password protected">{Icons.lock}</span>
          )}
        </span>
      </td>

      {/* Items count */}
      <td className="vault-folder-row__cell vault-folder-row__cell--count">
        {folder.documents_count ?? '—'}
      </td>

      {/* Sensitivity */}
      <td className="vault-folder-row__cell vault-folder-row__cell--sens">
        {sensColor
          ? <span className="vault-folder-row__sens-badge" style={{ color: sensColor, borderColor: sensColor }}>
              {folder.sensitivity_level.replace('_', ' ')}
            </span>
          : <span className="vault-folder-row__muted">—</span>
        }
      </td>

      {/* Modified */}
      <td className="vault-folder-row__cell vault-folder-row__cell--date">
        <span className="vault-folder-row__muted">{formatDate(folder.updated_at)}</span>
      </td>

      {/* Actions */}
      <td className="vault-folder-row__cell vault-folder-row__cell--actions" onClick={e => e.stopPropagation()}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button
            ref={dotsRef}
            className="vault-folder-row__dots"
            aria-label="Folder options"
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
          >
            {Icons.dots}
          </button>
          {menuOpen && (
            <RowMenu
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
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultFolderTable
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultFolderTable({ folders, onOpen, onEdit, onDelete, onArchive, onMove, onDrop }) {
  return (
    <>
      <div className="vault-folder-table-wrap">
        <table className="vault-folder-table" role="table">
          <thead>
            <tr>
              <th className="vault-folder-table__th vault-folder-table__th--name">Name</th>
              <th className="vault-folder-table__th vault-folder-table__th--count">Files</th>
              <th className="vault-folder-table__th vault-folder-table__th--sens">Sensitivity</th>
              <th className="vault-folder-table__th vault-folder-table__th--date">Modified</th>
              <th className="vault-folder-table__th vault-folder-table__th--actions" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {folders.map(folder => (
              <FolderRow
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
          </tbody>
        </table>
      </div>

      <style>{styles}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  /* ── Table wrap ─────────────────────────────────────────────────────────── */
  .vault-folder-table-wrap {
    width: 100%;
    overflow-x: auto;
    border-radius: var(--D-radius, 8px);
    border: 1px solid var(--D-border, #e9ecef);
  }

  .vault-folder-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  /* ── Header ─────────────────────────────────────────────────────────────── */
  .vault-folder-table__th {
    padding: 8px 12px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--D-text-muted, #adb5bd);
    background: var(--D-hover, #f8f9fa);
    border-bottom: 1px solid var(--D-border, #e9ecef);
    white-space: nowrap;
  }

  .vault-folder-table__th--actions { width: 40px; }
  .vault-folder-table__th--count   { width: 60px; }
  .vault-folder-table__th--sens    { width: 110px; }
  .vault-folder-table__th--date    { width: 120px; }

  /* ── Row ────────────────────────────────────────────────────────────────── */
  .vault-folder-row {
    cursor: pointer;
    transition: background 100ms;
    position: relative;
  }

  .vault-folder-row:not(:last-child) td {
    border-bottom: 1px solid var(--D-border, #e9ecef);
  }

  .vault-folder-row:hover {
    background: var(--D-hover, #f8f9fa);
  }

  .vault-folder-row:focus-visible {
    outline: 2px solid var(--D-accent, #2563eb);
    outline-offset: -2px;
  }

  .vault-folder-row--drop-target {
    background: var(--D-accent-soft, #e7f0ff) !important;
    outline: 2px solid var(--D-accent, #2563eb);
    outline-offset: -2px;
  }

  /* ── Cells ──────────────────────────────────────────────────────────────── */
  .vault-folder-row__cell {
    padding: 9px 12px;
    vertical-align: middle;
    color: var(--D-text-primary, #1a1a2e);
    white-space: nowrap;
    position: relative;
  }

  .vault-folder-row__cell--name {
    max-width: 240px;
  }

  /* Sensitivity stripe on name cell */
  .vault-folder-row__stripe {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    border-radius: 2px 0 0 2px;
  }

  .vault-folder-row__name-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 6px;
    min-width: 0;
  }

  .vault-folder-row__name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .vault-folder-row__lock {
    display: flex;
    align-items: center;
    color: var(--D-text-muted, #adb5bd);
    flex-shrink: 0;
  }

  .vault-folder-row__muted {
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-folder-row__sens-badge {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: capitalize;
    border: 1px solid;
    border-radius: 3px;
    padding: 1px 5px;
  }

  /* ── Actions ────────────────────────────────────────────────────────────── */
  .vault-folder-row__cell--actions {
    text-align: right;
    width: 40px;
  }

  .vault-folder-row__dots {
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
    opacity: 0;
    transition: opacity 100ms, background 100ms, color 100ms;
  }

  .vault-folder-row:hover .vault-folder-row__dots,
  .vault-folder-row__dots:focus-visible {
    opacity: 1;
  }

  .vault-folder-row__dots:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  /* ── Row context menu ────────────────────────────────────────────────────── */
  .vault-folder-row-menu {
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

  .vault-folder-row-menu__item {
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

  .vault-folder-row-menu__item:hover {
    background: var(--D-hover, #f1f3f5);
  }

  .vault-folder-row-menu__item--danger {
    color: var(--D-danger, #e03131);
  }

  .vault-folder-row-menu__item--danger:hover {
    background: var(--D-danger-soft, #fff5f5);
  }

  .vault-folder-row-menu__icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    opacity: 0.7;
  }
`;