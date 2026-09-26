import React, { useState, useRef, useEffect } from 'react';
import { useDragDrop } from '../../../../../_shared/hooks/vaultHooks';
import useVaultStore from '../../../../../_shared/store/useVaultStore';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 ** 2)   return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)   return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

const SENSITIVITY_COLORS = {
  confidential: '#f59e0b',
  restricted:   '#ef4444',
  top_secret:   '#7c3aed',
};

// Extension → color + label
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
  zip:  { color: '#92400e', bg: '#fffbeb' },
  rar:  { color: '#92400e', bg: '#fffbeb' },
};

function getExtMeta(filename) {
  const ext = (filename?.split('.').pop() ?? '').toLowerCase();
  return { ext: ext || '?', ...(EXT_META[ext] ?? { color: '#6c757d', bg: '#f1f3f5' }) };
}

const PREVIEWABLE = new Set(['pdf','png','jpg','jpeg','gif','webp','csv','json','md','xlsx','xls']);

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
const Icons = {
  lock:     <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><rect x="1.5" y="5" width="8" height="5.5" rx="1.2" fill="currentColor" opacity=".5"/><path d="M3.2 5V3.5a2.3 2.3 0 014.6 0V5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  dots:     <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="3" r="1.2" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/><circle cx="7" cy="11" r="1.2" fill="currentColor"/></svg>,
  dotsH:    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="3" cy="7" r="1.2" fill="currentColor"/><circle cx="7" cy="7" r="1.2" fill="currentColor"/><circle cx="11" cy="7" r="1.2" fill="currentColor"/></svg>,
  edit:     <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M9 2l2 2-7 7H2v-2L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>,
  move:     <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/><path d="M9.5 3.5L11.5 6.5l-2 3M3.5 3.5L1.5 6.5l2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  archive:  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1.5" width="11" height="3" rx=".8" fill="currentColor" opacity=".7"/><rect x="1" y="6" width="11" height="6" rx=".8" fill="currentColor" opacity=".2"/><path d="M4.5 8.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  password: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1.5" y="6" width="10" height="6.5" rx="1.3" stroke="currentColor" strokeWidth="1.3"/><path d="M4 6V4.5a2.5 2.5 0 015 0V6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  versions: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.3"/><path d="M6.5 3.5v3l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  delete:   <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 3.5h9M5 3.5V2h3v1.5M5.5 6v3.5M7.5 6v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><path d="M3 3.5l.7 7.2a.8.8 0 00.8.8h5a.8.8 0 00.8-.8L11 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared context menu items
// ─────────────────────────────────────────────────────────────────────────────
function DocMenu({ doc, onEdit, onMove, onArchive, onPassword, onVersions, onDelete, onClose, anchorRef }) {
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
    { icon: Icons.edit,     label: 'Edit',          action: onEdit },
    { icon: Icons.move,     label: 'Move',           action: onMove },
    { icon: Icons.versions, label: 'Version history',action: onVersions },
    { icon: Icons.password, label: doc.is_locked ? 'Manage password' : 'Set password', action: onPassword },
    { icon: Icons.archive,  label: 'Archive',        action: onArchive },
    { icon: Icons.delete,   label: 'Delete',         action: () => onDelete(doc), danger: true },
  ];

  return (
    <div className="vault-doc-menu" ref={menuRef} role="menu">
      {items.map(({ icon, label, action, danger }) => (
        <button
          key={label}
          className={`vault-doc-menu__item ${danger ? 'vault-doc-menu__item--danger' : ''}`}
          role="menuitem"
          onClick={e => { e.stopPropagation(); action(doc); onClose(); }}
        >
          <span className="vault-doc-menu__icon" aria-hidden="true">{icon}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultDocumentCard
// ─────────────────────────────────────────────────────────────────────────────
function VaultDocumentCard({ doc, onEdit, onMove, onArchive, onPassword, onVersions, onDelete, onDrop }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dotsRef = useRef(null);
  const { openPreview } = useVaultStore();

  const { getDragProps, isDropTarget } = useDragDrop({ onDrop });
  // documents are drag sources only, not drop targets

  const { ext, color, bg } = getExtMeta(doc.original_filename ?? doc.name);
  const sensColor = SENSITIVITY_COLORS[doc.sensitivity_level];
  const canPreview = PREVIEWABLE.has(ext);

  function handleClick() {
    if (canPreview) openPreview(doc);
  }

  return (
    <div
      className="vault-doc-card"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`${canPreview ? 'Preview' : 'Select'} document ${doc.name ?? doc.original_filename}`}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
      style={{ cursor: canPreview ? 'pointer' : 'default' }}
      {...getDragProps('document', doc)}
    >
      {/* Sensitivity stripe */}
      {sensColor && <span className="vault-doc-card__stripe" style={{ background: sensColor }} aria-hidden="true" />}

      {/* Top row */}
      <div className="vault-doc-card__top">
        {/* Extension badge */}
        <span className="vault-doc-card__ext" style={{ color, background: bg }}>
          {ext.toUpperCase()}
        </span>

        <button
          ref={dotsRef}
          className="vault-doc-card__menu-btn"
          aria-label="Document options"
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
        >
          {Icons.dots}
        </button>

        {menuOpen && (
          <DocMenu
            doc={doc}
            onEdit={onEdit}
            onMove={onMove}
            onArchive={onArchive}
            onPassword={onPassword}
            onVersions={onVersions}
            onDelete={onDelete}
            onClose={() => setMenuOpen(false)}
            anchorRef={dotsRef}
          />
        )}
      </div>

      {/* Name + meta */}
      <div className="vault-doc-card__body">
        <p className="vault-doc-card__name" title={doc.name ?? doc.original_filename}>
          {doc.name ?? doc.original_filename}
        </p>
        <div className="vault-doc-card__meta">
          <span>{formatSize(doc.file_size)}</span>
          {doc.version_number && doc.version_number > 1 && (
            <span>v{doc.version_number}</span>
          )}
        </div>
      </div>

      {/* Footer badges */}
      <div className="vault-doc-card__footer">
        <span className="vault-doc-card__date">{formatDate(doc.updated_at ?? doc.created_at)}</span>
        <div className="vault-doc-card__badges">
          {doc.is_locked && (
            <span className="vault-doc-card__badge vault-doc-card__badge--lock" aria-label="Password protected">
              {Icons.lock}
            </span>
          )}
          {sensColor && (
            <span
              className="vault-doc-card__badge vault-doc-card__badge--sens"
              style={{ color: sensColor, borderColor: sensColor }}
              aria-label={`Sensitivity: ${doc.sensitivity_level}`}
            >
              {doc.sensitivity_level.replace('_', ' ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultDocumentGrid — export
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultDocumentGrid({
  documents,
  onEdit, onDelete, onArchive, onMove, onPassword, onVersions, onDrop,
}) {
  return (
    <>
      <div className="vault-doc-grid">
        {documents.map(doc => (
          <VaultDocumentCard
            key={doc.id}
            doc={doc}
            onEdit={onEdit}
            onDelete={onDelete}
            onArchive={onArchive}
            onMove={onMove}
            onPassword={onPassword}
            onVersions={onVersions}
            onDrop={onDrop}
          />
        ))}
      </div>
      <style>{styles}</style>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultDocumentTable — named export
// ─────────────────────────────────────────────────────────────────────────────
export function VaultDocumentTable({
  documents,
  onEdit, onDelete, onArchive, onMove, onPassword, onVersions, onDrop,
}) {
  return (
    <>
      <div className="vault-doc-table-wrap">
        <table className="vault-doc-table" role="table">
          <thead>
            <tr>
              <th className="vault-doc-table__th vault-doc-table__th--name">Name</th>
              <th className="vault-doc-table__th vault-doc-table__th--size">Size</th>
              <th className="vault-doc-table__th vault-doc-table__th--sens">Sensitivity</th>
              <th className="vault-doc-table__th vault-doc-table__th--date">Modified</th>
              <th className="vault-doc-table__th vault-doc-table__th--actions" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {documents.map(doc => (
              <DocRow
                key={doc.id}
                doc={doc}
                onEdit={onEdit}
                onDelete={onDelete}
                onArchive={onArchive}
                onMove={onMove}
                onPassword={onPassword}
                onVersions={onVersions}
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
// DocRow
// ─────────────────────────────────────────────────────────────────────────────
function DocRow({ doc, onEdit, onMove, onArchive, onPassword, onVersions, onDelete, onDrop }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dotsRef = useRef(null);
  const { openPreview } = useVaultStore();

  const { getDragProps } = useDragDrop({ onDrop });

  const { ext, color, bg } = getExtMeta(doc.original_filename ?? doc.name);
  const sensColor = SENSITIVITY_COLORS[doc.sensitivity_level];
  const canPreview = PREVIEWABLE.has(ext);

  return (
    <tr
      className="vault-doc-row"
      onClick={() => canPreview && openPreview(doc)}
      tabIndex={0}
      role="row"
      style={{ cursor: canPreview ? 'pointer' : 'default' }}
      onKeyDown={e => e.key === 'Enter' && canPreview && openPreview(doc)}
      {...getDragProps('document', doc)}
    >
      {/* Name */}
      <td className="vault-doc-row__cell vault-doc-row__cell--name">
        {sensColor && (
          <span className="vault-doc-row__stripe" style={{ background: sensColor }} aria-hidden="true" />
        )}
        <span className="vault-doc-row__name-wrap">
          <span className="vault-doc-row__ext" style={{ color, background: bg }}>
            {ext.toUpperCase()}
          </span>
          <span className="vault-doc-row__name" title={doc.name ?? doc.original_filename}>
            {doc.name ?? doc.original_filename}
          </span>
          {doc.is_locked && (
            <span className="vault-doc-row__lock" aria-label="Password protected">{Icons.lock}</span>
          )}
          {doc.version_number && doc.version_number > 1 && (
            <span className="vault-doc-row__version">v{doc.version_number}</span>
          )}
        </span>
      </td>

      {/* Size */}
      <td className="vault-doc-row__cell vault-doc-row__cell--size">
        <span className="vault-doc-row__muted">{formatSize(doc.file_size)}</span>
      </td>

      {/* Sensitivity */}
      <td className="vault-doc-row__cell vault-doc-row__cell--sens">
        {sensColor
          ? <span className="vault-doc-row__sens-badge" style={{ color: sensColor, borderColor: sensColor }}>
              {doc.sensitivity_level.replace('_', ' ')}
            </span>
          : <span className="vault-doc-row__muted">—</span>
        }
      </td>

      {/* Date */}
      <td className="vault-doc-row__cell vault-doc-row__cell--date">
        <span className="vault-doc-row__muted">{formatDate(doc.updated_at ?? doc.created_at)}</span>
      </td>

      {/* Actions */}
      <td className="vault-doc-row__cell vault-doc-row__cell--actions" onClick={e => e.stopPropagation()}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button
            ref={dotsRef}
            className="vault-doc-row__dots"
            aria-label="Document options"
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
          >
            {Icons.dotsH}
          </button>
          {menuOpen && (
            <DocMenu
              doc={doc}
              onEdit={onEdit}
              onMove={onMove}
              onArchive={onArchive}
              onPassword={onPassword}
              onVersions={onVersions}
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
const styles = `
  /* ═══════════════════════════════════════════════════════════════════════════
     GRID
  ═══════════════════════════════════════════════════════════════════════════ */
  .vault-doc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;
  }

  .vault-doc-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 12px 10px;
    border-radius: var(--D-radius, 8px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    transition: border-color 120ms, box-shadow 120ms;
    user-select: none;
    overflow: hidden;
  }

  .vault-doc-card:hover {
    border-color: var(--D-border-strong, #dee2e6);
    box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  }

  .vault-doc-card:focus-visible {
    outline: 2px solid var(--D-accent, #2563eb);
    outline-offset: 2px;
  }

  .vault-doc-card__stripe {
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    border-radius: 8px 8px 0 0;
  }

  .vault-doc-card__top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    position: relative;
  }

  .vault-doc-card__ext {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    border-radius: 4px;
    padding: 3px 6px;
    line-height: 1;
  }

  .vault-doc-card__menu-btn {
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

  .vault-doc-card:hover .vault-doc-card__menu-btn,
  .vault-doc-card__menu-btn:focus-visible {
    opacity: 1;
  }

  .vault-doc-card__menu-btn:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-doc-card__body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }

  .vault-doc-card__name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vault-doc-card__meta {
    display: flex;
    gap: 6px;
    font-size: 11px;
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-doc-card__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .vault-doc-card__date {
    font-size: 11px;
    color: var(--D-text-muted, #adb5bd);
    white-space: nowrap;
  }

  .vault-doc-card__badges {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .vault-doc-card__badge {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 600;
    border-radius: 3px;
    padding: 1px 4px;
  }

  .vault-doc-card__badge--lock {
    color: var(--D-text-muted, #adb5bd);
    background: var(--D-hover, #f1f3f5);
  }

  .vault-doc-card__badge--sens {
    border: 1px solid;
    text-transform: capitalize;
    letter-spacing: 0.02em;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     TABLE
  ═══════════════════════════════════════════════════════════════════════════ */
  .vault-doc-table-wrap {
    width: 100%;
    overflow-x: auto;
    border-radius: var(--D-radius, 8px);
    border: 1px solid var(--D-border, #e9ecef);
  }

  .vault-doc-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .vault-doc-table__th {
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

  .vault-doc-table__th--actions { width: 40px; }
  .vault-doc-table__th--size    { width: 72px; }
  .vault-doc-table__th--sens    { width: 110px; }
  .vault-doc-table__th--date    { width: 120px; }

  .vault-doc-row {
    transition: background 100ms;
  }

  .vault-doc-row:not(:last-child) td {
    border-bottom: 1px solid var(--D-border, #e9ecef);
  }

  .vault-doc-row:hover {
    background: var(--D-hover, #f8f9fa);
  }

  .vault-doc-row:focus-visible {
    outline: 2px solid var(--D-accent, #2563eb);
    outline-offset: -2px;
  }

  .vault-doc-row__cell {
    padding: 9px 12px;
    vertical-align: middle;
    color: var(--D-text-primary, #1a1a2e);
    white-space: nowrap;
    position: relative;
  }

  .vault-doc-row__cell--name { max-width: 260px; }

  .vault-doc-row__stripe {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 3px;
    border-radius: 2px 0 0 2px;
  }

  .vault-doc-row__name-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 6px;
    min-width: 0;
  }

  .vault-doc-row__ext {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    border-radius: 3px;
    padding: 2px 5px;
    flex-shrink: 0;
  }

  .vault-doc-row__name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }

  .vault-doc-row__lock {
    display: flex;
    align-items: center;
    color: var(--D-text-muted, #adb5bd);
    flex-shrink: 0;
  }

  .vault-doc-row__version {
    font-size: 10px;
    color: var(--D-text-muted, #adb5bd);
    background: var(--D-hover, #f1f3f5);
    border-radius: 3px;
    padding: 1px 4px;
    flex-shrink: 0;
  }

  .vault-doc-row__muted {
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-doc-row__sens-badge {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: capitalize;
    border: 1px solid;
    border-radius: 3px;
    padding: 1px 5px;
  }

  .vault-doc-row__cell--actions {
    text-align: right;
    width: 40px;
  }

  .vault-doc-row__dots {
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

  .vault-doc-row:hover .vault-doc-row__dots,
  .vault-doc-row__dots:focus-visible {
    opacity: 1;
  }

  .vault-doc-row__dots:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     SHARED CONTEXT MENU
  ═══════════════════════════════════════════════════════════════════════════ */
  .vault-doc-menu {
    position: absolute;
    top: 28px;
    right: 0;
    z-index: 50;
    min-width: 160px;
    background: var(--D-surface, #ffffff);
    border: 1px solid var(--D-border, #e9ecef);
    border-radius: var(--D-radius, 8px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.10);
    padding: 4px;
    display: flex;
    flex-direction: column;
  }

  .vault-doc-menu__item {
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
    white-space: nowrap;
  }

  .vault-doc-menu__item:hover {
    background: var(--D-hover, #f1f3f5);
  }

  .vault-doc-menu__item--danger {
    color: var(--D-danger, #e03131);
  }

  .vault-doc-menu__item--danger:hover {
    background: var(--D-danger-soft, #fff5f5);
  }

  .vault-doc-menu__icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    opacity: 0.7;
  }
`;