import React, { useState } from 'react';
import { useVaultLogs } from '../../../hooks/vaultHooks';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Action badge colors
// ─────────────────────────────────────────────────────────────────────────────
const ACTION_STYLES = {
  view:     { color: '#2563eb', bg: '#e7f0ff' },
  download: { color: '#7c3aed', bg: '#f5f3ff' },
  upload:   { color: '#16a34a', bg: '#f0fdf4' },
  delete:   { color: '#e03131', bg: '#fff5f5' },
  archive:  { color: '#e67700', bg: '#fff7ed' },
  move:     { color: '#0891b2', bg: '#ecfeff' },
  unlock:   { color: '#f59e0b', bg: '#fffbeb' },
  create:   { color: '#16a34a', bg: '#f0fdf4' },
  update:   { color: '#475569', bg: '#f8fafc' },
};

function getActionStyle(action) {
  return ACTION_STYLES[action?.toLowerCase()] ?? { color: '#6c757d', bg: '#f1f3f5' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
const Icons = {
  logs: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2 4h11M2 7.5h7M2 11h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  search: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="5.5" cy="5.5" r="4" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8.5 8.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
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
  chevLeft:  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M8 3L5 6.5 8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chevRight: <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M5 3l3 3.5L5 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
};

const LOG_ACTIONS = [
  'view', 'download', 'upload', 'delete', 'archive',
  'move', 'unlock', 'create', 'update',
];

const TARGET_TYPES = ['document', 'folder', 'policy', 'setting'];

// ─────────────────────────────────────────────────────────────────────────────
// Log row
// ─────────────────────────────────────────────────────────────────────────────
function LogRow({ log }) {
  const actionStyle = getActionStyle(log.action);

  return (
    <tr className="vault-logs__row">
      <td className="vault-logs__cell vault-logs__cell--time">
        {formatDateTime(log.created_at)}
      </td>
      <td className="vault-logs__cell">
        <span className="vault-logs__action-badge" style={{ color: actionStyle.color, background: actionStyle.bg }}>
          {log.action}
        </span>
      </td>
      <td className="vault-logs__cell">
        <span className="vault-logs__target-type">{log.target_type}</span>
      </td>
      <td className="vault-logs__cell vault-logs__cell--name">
        <span className="vault-logs__target-name" title={log.target_name}>
          {log.target_name ?? `#${log.target_id}`}
        </span>
      </td>
      <td className="vault-logs__cell vault-logs__cell--user">
        <div className="vault-logs__user">
          <span className="vault-logs__user-name">{log.user?.name ?? `User #${log.user_id}`}</span>
          {log.user?.email && (
            <span className="vault-logs__user-email">{log.user.email}</span>
          )}
        </div>
      </td>
      <td className="vault-logs__cell vault-logs__cell--ip">
        <span className="vault-logs__ip">{log.ip_address ?? '—'}</span>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultLogsView
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultLogsView() {
  const { logs, meta, loading, error, filter, nextPage, prevPage, reload } = useVaultLogs();

  const [filterAction,     setFilterAction]     = useState('');
  const [filterTargetType, setFilterTargetType] = useState('');
  const [filterUserId,     setFilterUserId]     = useState('');
  const [filterDateFrom,   setFilterDateFrom]   = useState('');
  const [filterDateTo,     setFilterDateTo]     = useState('');

  const handleFilter = () => {
    filter({
      action:      filterAction      || undefined,
      target_type: filterTargetType  || undefined,
      user_id:     filterUserId      || undefined,
      date_from:   filterDateFrom    || undefined,
      date_to:     filterDateTo      || undefined,
    });
  };

  const handleReset = () => {
    setFilterAction('');
    setFilterTargetType('');
    setFilterUserId('');
    setFilterDateFrom('');
    setFilterDateTo('');
    filter({});
  };

  const hasFilters = filterAction || filterTargetType || filterUserId || filterDateFrom || filterDateTo;

  return (
    <div className="vault-logs">

      {/* Header */}
      <div className="vault-logs__header">
        <div>
          <h2 className="vault-logs__title">Access logs</h2>
          <p className="vault-logs__sub">Full audit trail of all vault activity.</p>
        </div>
        <button className="vault-logs__reload-btn" onClick={reload} disabled={loading} aria-label="Reload">
          {Icons.refresh}
        </button>
      </div>

      {/* Filters */}
      <div className="vault-logs__filters">
        <select
          className="vault-logs__filter-input"
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
        >
          <option value="">All actions</option>
          {LOG_ACTIONS.map(a => (
            <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
          ))}
        </select>

        <select
          className="vault-logs__filter-input"
          value={filterTargetType}
          onChange={e => setFilterTargetType(e.target.value)}
        >
          <option value="">All targets</option>
          {TARGET_TYPES.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>

        <input
          type="text"
          className="vault-logs__filter-input"
          value={filterUserId}
          onChange={e => setFilterUserId(e.target.value)}
          placeholder="User ID"
        />

        <input
          type="date"
          className="vault-logs__filter-input"
          value={filterDateFrom}
          onChange={e => setFilterDateFrom(e.target.value)}
          aria-label="Date from"
        />

        <input
          type="date"
          className="vault-logs__filter-input"
          value={filterDateTo}
          onChange={e => setFilterDateTo(e.target.value)}
          aria-label="Date to"
        />

        <button className="vault-logs__filter-btn" onClick={handleFilter}>
          {Icons.search}
          Filter
        </button>

        {hasFilters && (
          <button className="vault-logs__reset-btn" onClick={handleReset}>
            Clear
          </button>
        )}
      </div>

      {/* Meta bar */}
      {meta && (
        <div className="vault-logs__meta-bar">
          <span className="vault-logs__meta-count">
            {meta.total?.toLocaleString() ?? 0} entries
          </span>
          {meta.last_page > 1 && (
            <span className="vault-logs__meta-page">
              Page {meta.current_page} of {meta.last_page}
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="vault-logs__error">
          Failed to load logs.
          <button onClick={reload} className="vault-logs__error-retry">Retry</button>
        </div>
      )}

      {/* Skeleton */}
      {loading && logs.length === 0 && (
        <div className="vault-logs__skeleton-wrap">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="vault-logs__skeleton" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && logs.length === 0 && !error && (
        <div className="vault-logs__empty">
          <span aria-hidden="true">{Icons.logs}</span>
          <p>{hasFilters ? 'No logs match your filters.' : 'No access logs yet.'}</p>
        </div>
      )}

      {/* Table */}
      {logs.length > 0 && (
        <div className="vault-logs__table-wrap">
          <table className="vault-logs__table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Target type</th>
                <th>Target</th>
                <th>User</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <LogRow key={log.id ?? i} log={log} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta && meta.last_page > 1 && (
        <div className="vault-logs__pagination">
          <button
            className="vault-logs__page-btn"
            onClick={prevPage}
            disabled={loading || meta.current_page <= 1}
            aria-label="Previous page"
          >
            {Icons.chevLeft} Prev
          </button>
          <span className="vault-logs__page-info">
            {meta.current_page} / {meta.last_page}
          </span>
          <button
            className="vault-logs__page-btn"
            onClick={nextPage}
            disabled={loading || meta.current_page >= meta.last_page}
            aria-label="Next page"
          >
            Next {Icons.chevRight}
          </button>
        </div>
      )}

      <style>{styles}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  .vault-logs {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 24px;
    overflow-y: auto;
    flex: 1;
  }

  /* Header */
  .vault-logs__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .vault-logs__title {
    font-size: 14px;
    font-weight: 700;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0 0 2px;
  }

  .vault-logs__sub {
    font-size: 12.5px;
    color: var(--D-text-secondary, #6c757d);
    margin: 0;
  }

  .vault-logs__reload-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    border-radius: var(--D-radius-sm, 6px);
    color: var(--D-text-secondary, #6c757d);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 100ms;
  }

  .vault-logs__reload-btn:hover:not(:disabled) { background: var(--D-hover, #f1f3f5); }
  .vault-logs__reload-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Filters */
  .vault-logs__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .vault-logs__filter-input {
    padding: 6px 10px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    color: var(--D-text-primary, #1a1a2e);
    font-size: 12.5px;
    outline: none;
    height: 32px;
    font-family: inherit;
    transition: border-color 120ms, box-shadow 120ms;
  }

  .vault-logs__filter-input:focus {
    border-color: var(--D-accent, #2563eb);
    box-shadow: 0 0 0 2px var(--D-accent-soft, #e7f0ff);
  }

  .vault-logs__filter-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--D-radius-sm, 6px);
    border: none;
    background: var(--D-accent, #2563eb);
    color: #fff;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    height: 32px;
    transition: background 120ms;
  }

  .vault-logs__filter-btn:hover { background: var(--D-accent-hover, #1d4ed8); }

  .vault-logs__reset-btn {
    padding: 6px 10px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-border, #e9ecef);
    background: transparent;
    color: var(--D-text-secondary, #6c757d);
    font-size: 12.5px;
    cursor: pointer;
    height: 32px;
    transition: background 100ms;
  }

  .vault-logs__reset-btn:hover { background: var(--D-hover, #f1f3f5); }

  /* Meta bar */
  .vault-logs__meta-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: var(--D-text-muted, #adb5bd);
  }

  /* Table */
  .vault-logs__table-wrap {
    border: 1px solid var(--D-border, #e9ecef);
    border-radius: var(--D-radius, 8px);
    overflow-x: auto;
  }

  .vault-logs__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }

  .vault-logs__table th {
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

  .vault-logs__row:not(:last-child) .vault-logs__cell {
    border-bottom: 1px solid var(--D-border, #e9ecef);
  }

  .vault-logs__row:hover { background: var(--D-hover, #f8f9fa); }

  .vault-logs__cell {
    padding: 8px 12px;
    vertical-align: middle;
    white-space: nowrap;
  }

  .vault-logs__cell--time {
    color: var(--D-text-muted, #adb5bd);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }

  .vault-logs__cell--name { max-width: 200px; }
  .vault-logs__cell--user { max-width: 160px; }
  .vault-logs__cell--ip   { color: var(--D-text-muted, #adb5bd); font-size: 11.5px; }

  .vault-logs__action-badge {
    display: inline-flex;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 20px;
    text-transform: capitalize;
  }

  .vault-logs__target-type {
    font-size: 11.5px;
    color: var(--D-text-secondary, #6c757d);
    text-transform: capitalize;
  }

  .vault-logs__target-name {
    font-weight: 500;
    color: var(--D-text-primary, #1a1a2e);
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    max-width: 180px;
  }

  .vault-logs__user {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .vault-logs__user-name {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-logs__user-email {
    font-size: 11px;
    color: var(--D-text-muted, #adb5bd);
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
    display: block;
  }

  .vault-logs__ip {
    font-family: monospace;
    font-size: 11.5px;
  }

  /* Pagination */
  .vault-logs__pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 4px 0;
  }

  .vault-logs__page-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 12px;
    border: 1px solid var(--D-border, #e9ecef);
    border-radius: var(--D-radius-sm, 6px);
    background: var(--D-surface, #ffffff);
    color: var(--D-text-primary, #1a1a2e);
    font-size: 12.5px;
    cursor: pointer;
    transition: background 100ms;
    height: 30px;
  }

  .vault-logs__page-btn:hover:not(:disabled) { background: var(--D-hover, #f1f3f5); }
  .vault-logs__page-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .vault-logs__page-info {
    font-size: 12.5px;
    color: var(--D-text-secondary, #6c757d);
    min-width: 60px;
    text-align: center;
  }

  /* States */
  .vault-logs__meta-count { font-weight: 500; }
  .vault-logs__meta-page  { }

  .vault-logs__error {
    padding: 10px 14px;
    background: var(--D-danger-soft, #fff5f5);
    border: 1px solid var(--D-danger-border, #ffc9c9);
    border-radius: var(--D-radius, 8px);
    color: var(--D-danger, #e03131);
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .vault-logs__error-retry {
    background: none;
    border: none;
    color: var(--D-danger, #e03131);
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
  }

  .vault-logs__empty {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 48px 24px;
    color: var(--D-text-muted, #adb5bd);
    font-size: 13px;
    justify-content: center;
  }

  .vault-logs__empty p { margin: 0; }

  .vault-logs__skeleton-wrap { display: flex; flex-direction: column; gap: 6px; }

  .vault-logs__skeleton {
    height: 40px;
    border-radius: var(--D-radius-sm, 6px);
    background: linear-gradient(90deg, var(--D-skeleton-base, #e9ecef) 25%, var(--D-skeleton-shine, #f1f3f5) 50%, var(--D-skeleton-base, #e9ecef) 75%);
    background-size: 200% 100%;
    animation: vault-shimmer 1.4s ease-in-out infinite;
  }

  @keyframes vault-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;