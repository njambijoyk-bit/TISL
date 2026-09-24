import React, { useState, useCallback } from 'react';
import { useVaultArchiver } from '../../../hooks/vaultHooks';
import vaultAPI from '../../../api/vault';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatBytes(b) {
  if (!b) return '—';
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
  if (b >= 1048576)    return (b / 1048576).toFixed(2)    + ' MB';
  if (b >= 1024)       return (b / 1024).toFixed(2)       + ' KB';
  return b + ' B';
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
const Icons = {
  archive: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="3" rx="1" fill="currentColor" opacity=".8"/>
      <rect x="1" y="7" width="14" height="7" rx="1" fill="currentColor" opacity=".25"/>
      <path d="M6 10.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  play: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
      <path d="M3 2l7 4-7 4V2z" fill="currentColor"/>
    </svg>
  ),
  spinner: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="vault-archiver__spin">
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="14 18" opacity=".7"/>
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  error: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 4v3M6 8.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  ),
  clock: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M6 3.5V6l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
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
  trash: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 3.5h9M5 3.5V2.5h3v1M5.5 6v4M7.5 6v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M3 3.5l.6 6.7a.8.8 0 00.8.8h4.2a.8.8 0 00.8-.8L10 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  close: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 2l9 9M11 2l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  warn: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5L14.5 13H1.5L8 1.5z" fill="currentColor" opacity=".15" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M8 6v3.5M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────────────────────
function RunStatusBadge({ status }) {
  const map = {
    completed: { label: 'Completed', color: '#16a34a', bg: '#f0fdf4', icon: Icons.check },
    failed:    { label: 'Failed',    color: '#e03131', bg: '#fff5f5', icon: Icons.error },
    running:   { label: 'Running',   color: '#2563eb', bg: '#e7f0ff', icon: Icons.spinner },
    pending:   { label: 'Pending',   color: '#e67700', bg: '#fff7ed', icon: Icons.clock },
  };
  const s = map[status] ?? { label: status, color: '#6c757d', bg: '#f1f3f5', icon: null };
  return (
    <span className="vault-archiver__badge" style={{ color: s.color, background: s.bg }}>
      {s.icon}{s.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk run modal — table selection + mode
// ─────────────────────────────────────────────────────────────────────────────

// mode: 'archive' | 'archive_purge'
function BulkArchiveModal({ configs, mode, onClose, onComplete }) {
  const [selected, setSelected]   = useState(new Set(configs.map(c => c.id)));
  const [running,  setRunning]    = useState(false);
  const [results,  setResults]    = useState(null); // null = not run yet
  const [confirmed, setConfirmed] = useState(false);

  const isPurge   = mode === 'archive_purge';
  const logTables = configs.filter(c => c.archiver_type === 'log_table');
  const others    = configs.filter(c => c.archiver_type !== 'log_table');

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allIds = configs.map(c => c.id);
    setSelected(prev => prev.size === allIds.length ? new Set() : new Set(allIds));
  };

  const handleRun = async () => {
    if (selected.size === 0) return;
    setRunning(true);
    setResults(null);
    try {
      const res = await vaultAPI.runMultipleArchiverConfigs([...selected], isPurge);
      setResults(res);
      onComplete(); // refresh configs + runs in parent
    } catch (err) {
      setResults({ error: err?.response?.data?.message ?? 'Request failed.' });
    } finally {
      setRunning(false);
    }
  };

  const allSelected = selected.size === configs.length;
  const noneSelected = selected.size === 0;

  return (
    <div className="vault-archiver__modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="vault-archiver__modal">

        {/* Header */}
        <div className="vault-archiver__modal-head">
          <div className="vault-archiver__modal-title-row">
            <span className={`vault-archiver__modal-icon ${isPurge ? 'vault-archiver__modal-icon--danger' : 'vault-archiver__modal-icon--accent'}`}>
              {isPurge ? Icons.trash : Icons.archive}
            </span>
            <div>
              <h3 className="vault-archiver__modal-title">
                {isPurge ? 'Archive & Purge' : 'Archive only'}
              </h3>
              <p className="vault-archiver__modal-sub">
                {isPurge
                  ? 'Export selected log tables to the Vault, then permanently delete source rows.'
                  : 'Export selected log tables to the Vault. Source rows are kept intact.'}
              </p>
            </div>
          </div>
          <button className="vault-archiver__modal-close" onClick={onClose} aria-label="Close">
            {Icons.close}
          </button>
        </div>

        {/* Results view — shown after run */}
        {results ? (
          <div className="vault-archiver__modal-results">
            {results.error ? (
              <div className="vault-archiver__modal-result-error">{results.error}</div>
            ) : (
              <>
                <div className="vault-archiver__modal-result-summary">
                  <span className="vault-archiver__modal-result-ok">✓ {results.summary?.completed ?? 0} completed</span>
                  {results.summary?.failed > 0 && (
                    <span className="vault-archiver__modal-result-fail">✗ {results.summary.failed} failed</span>
                  )}
                </div>
                <div className="vault-archiver__modal-result-list">
                  {(results.data ?? []).map((r, i) => (
                    <div key={i} className={`vault-archiver__modal-result-row vault-archiver__modal-result-row--${r.status}`}>
                      <span className="vault-archiver__modal-result-label">{r.config}</span>
                      <span className="vault-archiver__modal-result-meta">
                        {r.status === 'completed'
                          ? `${r.rows?.toLocaleString() ?? 0} rows · ${formatBytes(r.size)}`
                          : r.error}
                      </span>
                      <RunStatusBadge status={r.status} />
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="vault-archiver__modal-footer">
              <button className="vault-archiver__modal-btn vault-archiver__modal-btn--secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Table selection */}
            <div className="vault-archiver__modal-body">

              {/* Purge warning */}
              {isPurge && (
                <div className="vault-archiver__modal-warn">
                  {Icons.warn}
                  <span>Source rows older than each config's retention period will be <strong>permanently deleted</strong> from the database after export.</span>
                </div>
              )}

              {/* Purge confirmation checkbox */}
              {isPurge && (
                <label className="vault-archiver__modal-confirm-row">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={e => setConfirmed(e.target.checked)}
                    className="vault-archiver__modal-checkbox"
                  />
                  <span className="vault-archiver__modal-confirm-text">
                    I understand that source rows will be permanently deleted after archiving.
                  </span>
                </label>
              )}
              
              {/* Select all */}
              <div className="vault-archiver__modal-select-all">
                <label className="vault-archiver__modal-check-row">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="vault-archiver__modal-checkbox"
                  />
                  <span className="vault-archiver__modal-check-label vault-archiver__modal-check-label--bold">
                    Select all ({configs.length})
                  </span>
                </label>
              </div>

              {/* Log tables */}
              {logTables.length > 0 && (
                <div className="vault-archiver__modal-group">
                  <p className="vault-archiver__modal-group-label">Log tables</p>
                  {logTables.map(config => (
                    <label key={config.id} className="vault-archiver__modal-check-row">
                      <input
                        type="checkbox"
                        checked={selected.has(config.id)}
                        onChange={() => toggle(config.id)}
                        disabled={!config.is_enabled}
                        className="vault-archiver__modal-checkbox"
                      />
                      <span className={`vault-archiver__modal-check-label ${!config.is_enabled ? 'vault-archiver__modal-check-label--muted' : ''}`}>
                        {config.label}
                        <span className="vault-archiver__modal-check-meta">
                          {config.table_name} · {config.retention_days}d · {config.export_format?.toUpperCase()}
                          {!config.is_enabled && ' · disabled'}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* Other types */}
              {others.length > 0 && (
                <div className="vault-archiver__modal-group">
                  <p className="vault-archiver__modal-group-label">Other</p>
                  {others.map(config => (
                    <label key={config.id} className="vault-archiver__modal-check-row">
                      <input
                        type="checkbox"
                        checked={selected.has(config.id)}
                        onChange={() => toggle(config.id)}
                        disabled={!config.is_enabled}
                        className="vault-archiver__modal-checkbox"
                      />
                      <span className={`vault-archiver__modal-check-label ${!config.is_enabled ? 'vault-archiver__modal-check-label--muted' : ''}`}>
                        {config.label}
                        <span className="vault-archiver__modal-check-meta">
                          {config.archiver_type?.replace('_', ' ')}
                          {!config.is_enabled && ' · disabled'}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              {/* Purge confirmation checkbox */}
              {isPurge && (
                <label className="vault-archiver__modal-confirm-row">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={e => setConfirmed(e.target.checked)}
                    className="vault-archiver__modal-checkbox"
                  />
                  <span className="vault-archiver__modal-confirm-text">
                    I understand that source rows will be permanently deleted after archiving.
                  </span>
                </label>
              )}
            </div>

            {/* Footer */}
            <div className="vault-archiver__modal-footer">
              <span className="vault-archiver__modal-footer-count">
                {selected.size} of {configs.length} selected
              </span>
              <button
                className="vault-archiver__modal-btn vault-archiver__modal-btn--secondary"
                onClick={onClose}
                disabled={running}
              >
                Cancel
              </button>
              <button
                className={`vault-archiver__modal-btn ${isPurge ? 'vault-archiver__modal-btn--danger' : 'vault-archiver__modal-btn--primary'}`}
                onClick={handleRun}
                disabled={running || noneSelected || (isPurge && !confirmed)}
              >
                {running ? Icons.spinner : (isPurge ? Icons.trash : Icons.archive)}
                {running
                  ? 'Running…'
                  : isPurge
                    ? `Archive & purge ${selected.size} table${selected.size !== 1 ? 's' : ''}`
                    : `Archive ${selected.size} table${selected.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Config card
// ─────────────────────────────────────────────────────────────────────────────
function ConfigCard({ config, triggering, onTrigger }) {
  const isTriggering = triggering === config.id;

  return (
    <div className="vault-archiver__card">
      <div className="vault-archiver__card-top">
        <div className="vault-archiver__card-info">
          <p className="vault-archiver__card-label">{config.label}</p>
          {config.description && (
            <p className="vault-archiver__card-desc">{config.description}</p>
          )}
        </div>
        <button
          className="vault-archiver__run-btn"
          onClick={() => onTrigger(config.id)}
          disabled={isTriggering || !config.is_enabled}
          title={config.is_enabled ? 'Run now' : 'Config disabled'}
          aria-label={`Run ${config.label}`}
        >
          {isTriggering ? Icons.spinner : Icons.play}
          {isTriggering ? 'Running…' : 'Run now'}
        </button>
      </div>
      <div className="vault-archiver__card-meta">
        <span className="vault-archiver__meta-item">
          <span className="vault-archiver__meta-label">Type</span>
          <span className="vault-archiver__meta-value">{config.archiver_type?.replace('_', ' ')}</span>
        </span>
        <span className="vault-archiver__meta-item">
          <span className="vault-archiver__meta-label">Format</span>
          <span className="vault-archiver__meta-value">{config.export_format?.toUpperCase() ?? '—'}</span>
        </span>
        {config.retention_days && (
          <span className="vault-archiver__meta-item">
            <span className="vault-archiver__meta-label">Retention</span>
            <span className="vault-archiver__meta-value">{config.retention_days}d</span>
          </span>
        )}
        <span className="vault-archiver__meta-item">
          <span className="vault-archiver__meta-label">Last run</span>
          <span className="vault-archiver__meta-value">{formatDate(config.last_archived_at)}</span>
        </span>
        <span className={`vault-archiver__status-dot ${config.is_enabled ? 'vault-archiver__status-dot--on' : 'vault-archiver__status-dot--off'}`}>
          {config.is_enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultArchiverView
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultArchiverView() {
  const {
    configs, runs, runsMeta,
    loading, error, triggering,
    triggerRun, reloadConfigs, reloadRuns,
  } = useVaultArchiver();

  const [runsPage,  setRunsPage]  = useState(1);
  const [bulkModal, setBulkModal] = useState(null); // null | 'archive' | 'archive_purge'
  
  const [retentionOpen, setRetentionOpen] = useState(false);

  const handlePageChange = (page) => {
    setRunsPage(page);
    reloadRuns({ page });
  };

  const handleBulkComplete = useCallback(() => {
    reloadConfigs();
    reloadRuns({ page: 1 });
    setRunsPage(1);
    // Keep modal open so user can see results
  }, [reloadConfigs, reloadRuns]);

  const enabledLogTableConfigs = configs.filter(c => c.archiver_type === 'log_table');

  return (
    <div className="vault-archiver">

      {/* ── Configs ────────────────────────────────────────────────────────── */}
      <section className="vault-archiver__section">
        <div className="vault-archiver__section-header">
          <div>
            <h2 className="vault-archiver__section-title">Archiver configs</h2>
            <p className="vault-archiver__section-sub">Automated archiving rules. Trigger manually or let them run on schedule.</p>
          </div>

          {/* Retention info — collapsible */}
            <div className="vault-archiver__info-box">
            <button
                className="vault-archiver__info-toggle"
                onClick={() => setRetentionOpen(v => !v)}
                type="button"
            >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M6.5 5.5v4M6.5 4v-.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                How retention periods work
                <svg
                width="11" height="11" viewBox="0 0 11 11" fill="none"
                style={{ marginLeft: 'auto', transition: 'transform 180ms', transform: retentionOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                <path d="M2 4l3.5 3.5L9 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </button>

            {retentionOpen && (
                <div className="vault-archiver__info-body">
                    <p className="vault-archiver__info-text">
                        The archiver only touches rows <strong>older than</strong> each config's retention period — newer rows are never exported or deleted.
                    </p>
                    <div className="vault-archiver__info-rows">
                        <div className="vault-archiver__info-row">
                            <span className="vault-archiver__info-chip">7 days</span>
                            <span style={{ flex: 1, minWidth: 0 }}>Cache Entries</span>
                        </div>
                        <div className="vault-archiver__info-row">
                            <span className="vault-archiver__info-chip">30 days</span>
                            <span style={{ flex: 1, minWidth: 0 }}>Driver Location Pings, Search Events, Dev Access Key Logs, Notifications, User Sessions, Failed Jobs</span>
                        </div>
                        <div className="vault-archiver__info-row">
                            <span className="vault-archiver__info-chip">60 days</span>
                            <span style={{ flex: 1, minWidth: 0 }}>Mimi Query Logs, Mimi Sessions</span>
                        </div>
                        <div className="vault-archiver__info-row">
                            <span className="vault-archiver__info-chip">90 days</span>
                            <span style={{ flex: 1, minWidth: 0 }}>Delivery Activity Logs, Order Activity Logs, Booking Activity Logs, Hamper Activity Logs, Referral Activity Logs, Auction Order Activity Logs, AI Analytics Sessions, AI Analytics Outputs, Shipping Activities, Inventory Lifecycle Movements, Inventory Location Movements, Project Activities, Customer Tier Activities, Inventory Export Logs, Vault Access Logs</span>
                        </div>
                        <div className="vault-archiver__info-row">
                            <span className="vault-archiver__info-chip">180 days</span>
                            <span style={{ flex: 1, minWidth: 0 }}>Bug Report Status History, Application Status History, Inventory Repairs Log, Inventory Disputes Log, Referral Code Usage, Review Helpful Votes</span>
                        </div>
                        <div className="vault-archiver__info-row">
                            <span className="vault-archiver__info-chip">365 days</span>
                            <span style={{ flex: 1, minWidth: 0 }}>Policy Change Logs, Reconciliation Lines, Employee Leave Logs, Loyalty Point Transactions, Policy Acceptances, Store Credit Transactions, Customer Credit Transactions, Product Reviews, Customer Algorithm Scores</span>
                        </div>
                        </div>
                    <p className="vault-archiver__info-text vault-archiver__info-text--muted">
                        This keeps live tables lean while guaranteeing recent data is never touched. To force-archive everything regardless of age, temporarily set <code>retention_days = 0</code>, run the archiver, then restore the original value.
                    </p>
                </div>
            )}
            </div>

          {/* ── Bulk action buttons ─────────────────────────────────────────── */}
          <div className="vault-archiver__bulk-actions">
            <button
              className="vault-archiver__bulk-btn vault-archiver__bulk-btn--archive"
              onClick={() => setBulkModal('archive')}
              disabled={loading || configs.length === 0}
              title="Select tables to archive (source rows kept)"
            >
              {Icons.archive}
              Archive
            </button>
            <button
              className="vault-archiver__bulk-btn vault-archiver__bulk-btn--purge"
              onClick={() => setBulkModal('archive_purge')}
              disabled={loading || configs.length === 0}
              title="Select tables to archive then delete source rows"
            >
              {Icons.trash}
              Archive & purge
            </button>
            <button
              className="vault-archiver__reload-btn"
              onClick={reloadConfigs}
              disabled={loading}
              aria-label="Reload configs"
            >
              {Icons.refresh}
            </button>
          </div>
        </div>

        {loading && configs.length === 0 && (
          <div className="vault-archiver__skeleton-wrap">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="vault-archiver__skeleton" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        )}

        {error && (
          <div className="vault-archiver__error">
            Failed to load archiver configs.
            <button onClick={reloadConfigs} className="vault-archiver__error-retry">Retry</button>
          </div>
        )}

        {!loading && configs.length === 0 && !error && (
          <div className="vault-archiver__empty">
            <span aria-hidden="true">{Icons.archive}</span>
            <p>No archiver configs configured yet.</p>
          </div>
        )}

        <div className="vault-archiver__cards">
          {configs.map(config => (
            <ConfigCard
              key={config.id}
              config={config}
              triggering={triggering}
              onTrigger={triggerRun}
            />
          ))}
        </div>
      </section>

      {/* ── Run history ────────────────────────────────────────────────────── */}
      <section className="vault-archiver__section">
        <div className="vault-archiver__section-header">
          <div>
            <h2 className="vault-archiver__section-title">Run history</h2>
            <p className="vault-archiver__section-sub">Recent archive job results.</p>
          </div>
          <button
            className="vault-archiver__reload-btn"
            onClick={() => reloadRuns({ page: runsPage })}
            disabled={loading}
            aria-label="Reload runs"
          >
            {Icons.refresh}
          </button>
        </div>

        {runs.length > 0 ? (
          <div className="vault-archiver__table-wrap">
            <table className="vault-archiver__table">
              <thead>
                <tr>
                  <th>Config</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Finished</th>
                  <th>Records</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => (
                  <tr key={run.id} className="vault-archiver__run-row">
                    <td className="vault-archiver__run-config">{run.config?.label ?? '—'}</td>
                    <td><RunStatusBadge status={run.status} /></td>
                    <td className="vault-archiver__run-muted">{formatDateTime(run.started_at)}</td>
                    <td className="vault-archiver__run-muted">{formatDateTime(run.completed_at)}</td>
                    <td className="vault-archiver__run-muted">{run.rows_exported?.toLocaleString() ?? '—'}</td>
                    <td>
                      {run.file_path
                        ? <span className="vault-archiver__filename">{run.file_path.split('/').pop()}</span>
                        : <span className="vault-archiver__run-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {runsMeta && runsMeta.last_page > 1 && (
              <div className="vault-archiver__pagination">
                <button
                  className="vault-archiver__page-btn"
                  onClick={() => handlePageChange(runsPage - 1)}
                  disabled={runsPage <= 1}
                >
                  ← Prev
                </button>
                <span className="vault-archiver__page-info">
                  Page {runsMeta.current_page} of {runsMeta.last_page}
                </span>
                <button
                  className="vault-archiver__page-btn"
                  onClick={() => handlePageChange(runsPage + 1)}
                  disabled={runsPage >= runsMeta.last_page}
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        ) : (
          !loading && (
            <div className="vault-archiver__empty">
              <span aria-hidden="true">{Icons.clock}</span>
              <p>No archive runs yet.</p>
            </div>
          )
        )}
      </section>

      {/* ── Bulk modal ─────────────────────────────────────────────────────── */}
      {bulkModal && configs.length > 0 && (
        <BulkArchiveModal
          configs={configs}
          mode={bulkModal}
          onClose={() => setBulkModal(null)}
          onComplete={handleBulkComplete}
        />
      )}

      <style>{styles}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  .vault-archiver {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 24px;
    overflow-y: auto;
    height: 100%;
    box-sizing: border-box;
  }

  /* Section */
  .vault-archiver__section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .vault-archiver__section-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .vault-archiver__section-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0 0 2px;
  }

  .vault-archiver__section-sub {
    font-size: 12px;
    color: var(--D-text-secondary, #6c757d);
    margin: 0;
  }

  /* Info / collapsible */
.vault-archiver__info-box {
  border: 1px solid var(--D-border, #e9ecef);
  border-radius: var(--D-radius, 8px);
  overflow: hidden;
  flex-shrink: 0;
}

.vault-archiver__info-toggle {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  padding: 9px 12px;
  background: var(--D-hover, #f8f9fa);
  border: none;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--D-text-secondary, #6c757d);
  text-align: left;
  font-family: inherit;
  transition: background 100ms, color 100ms;
}
.vault-archiver__info-toggle:hover {
  background: var(--D-border, #e9ecef);
  color: var(--D-text-primary, #1a1a2e);
}

.vault-archiver__info-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--D-border, #e9ecef);
  overflow: hidden;        /* ← contain children */
  min-width: 0;            /* ← allow flex shrink */
  word-break: break-word;  /* ← force long text to wrap */
  box-sizing: border-box;
  width: 100%;
}

.vault-archiver__info-text {
  font-size: 12px;
  color: var(--D-text-secondary, #6c757d);
  margin: 0;
  line-height: 1.6;
}
.vault-archiver__info-text--muted { color: var(--D-text-muted, #adb5bd); }
.vault-archiver__info-text code {
  font-family: monospace;
  font-size: 11px;
  background: var(--D-hover, #f1f3f5);
  padding: 1px 5px;
  border-radius: 4px;
}

.vault-archiver__info-rows {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  min-width: 0;
  overflow: hidden;
}

.vault-archiver__info-row {
  display: flex;
  align-items: flex-start;   /* was center — lets text wrap naturally */
  gap: 8px;
  font-size: 12px;
  color: var(--D-text-secondary, #6c757d);
  flex-wrap: wrap;            /* ← allows text to drop to next line */
}

.vault-archiver__info-chip {
  font-family: monospace;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--D-accent-soft, #e7f0ff);
  color: var(--D-accent, #2563eb);
  white-space: nowrap;
  flex-shrink: 0;             /* chip never shrinks */
  align-self: flex-start;     /* pins chip to top when text wraps */
}

  /* Bulk action buttons */
  .vault-archiver__bulk-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .vault-archiver__bulk-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    height: 32px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    font-family: inherit;
    transition: background 100ms, color 100ms, opacity 100ms;
  }

  .vault-archiver__bulk-btn:disabled { opacity: 0.45; cursor: not-allowed; }

  .vault-archiver__bulk-btn--archive {
    background: var(--D-accent-soft, #e7f0ff);
    border-color: var(--D-accent, #2563eb);
    color: var(--D-accent, #2563eb);
  }
  .vault-archiver__bulk-btn--archive:hover:not(:disabled) {
    background: var(--D-accent, #2563eb);
    color: #fff;
  }

  .vault-archiver__bulk-btn--purge {
    background: #fff5f5;
    border-color: #ffa8a8;
    color: #e03131;
  }
  .vault-archiver__bulk-btn--purge:hover:not(:disabled) {
    background: #e03131;
    color: #fff;
  }

  .vault-archiver__reload-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    color: var(--D-text-secondary, #6c757d);
    cursor: pointer;
    transition: background 100ms;
    flex-shrink: 0;
  }
  .vault-archiver__reload-btn:hover:not(:disabled) { background: var(--D-hover, #f1f3f5); }
  .vault-archiver__reload-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  /* Config cards */
  .vault-archiver__cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .vault-archiver__card {
    background: var(--D-surface, #ffffff);
    border: 1px solid var(--D-border, #e9ecef);
    border-radius: var(--D-radius, 8px);
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .vault-archiver__card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .vault-archiver__card-info { flex: 1; min-width: 0; }

  .vault-archiver__card-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0 0 2px;
  }

  .vault-archiver__card-desc {
    font-size: 12px;
    color: var(--D-text-secondary, #6c757d);
    margin: 0;
  }

  .vault-archiver__run-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-accent, #2563eb);
    background: var(--D-accent-soft, #e7f0ff);
    color: var(--D-accent, #2563eb);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background 100ms, opacity 100ms;
    font-family: inherit;
  }
  .vault-archiver__run-btn:hover:not(:disabled) { background: var(--D-accent, #2563eb); color: #fff; }
  .vault-archiver__run-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .vault-archiver__card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .vault-archiver__meta-item { display: flex; flex-direction: column; gap: 1px; }
  .vault-archiver__meta-label { font-size: 10px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--D-text-muted, #adb5bd); }
  .vault-archiver__meta-value { font-size: 12px; font-weight: 500; color: var(--D-text-primary, #1a1a2e); text-transform: capitalize; }

  .vault-archiver__status-dot { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; margin-left: auto; }
  .vault-archiver__status-dot--on  { background: #f0fdf4; color: #16a34a; }
  .vault-archiver__status-dot--off { background: var(--D-hover, #f1f3f5); color: var(--D-text-muted, #adb5bd); }

  /* Table */
  .vault-archiver__table-wrap { border: 1px solid var(--D-border, #e9ecef); border-radius: var(--D-radius, 8px); overflow-x: auto; }
  .vault-archiver__table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .vault-archiver__table th { padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--D-text-muted, #adb5bd); background: var(--D-hover, #f8f9fa); border-bottom: 1px solid var(--D-border, #e9ecef); white-space: nowrap; }
  .vault-archiver__run-row td { padding: 9px 12px; vertical-align: middle; border-bottom: 1px solid var(--D-border, #e9ecef); }
  .vault-archiver__run-row:last-child td { border-bottom: none; }
  .vault-archiver__run-row:hover { background: var(--D-hover, #f8f9fa); }
  .vault-archiver__run-config { font-weight: 500; color: var(--D-text-primary, #1a1a2e); }
  .vault-archiver__run-muted { color: var(--D-text-secondary, #6c757d); white-space: nowrap; }
  .vault-archiver__filename { font-family: monospace; font-size: 11.5px; color: var(--D-text-secondary, #6c757d); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }

  /* Badge */
  .vault-archiver__badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 20px; white-space: nowrap; }

  /* Pagination */
  .vault-archiver__pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 8px 0; }
  .vault-archiver__page-btn { padding: 5px 12px; border: 1px solid var(--D-border, #e9ecef); border-radius: var(--D-radius-sm, 6px); background: var(--D-surface, #ffffff); color: var(--D-text-primary, #1a1a2e); font-size: 12.5px; cursor: pointer; transition: background 100ms; font-family: inherit; }
  .vault-archiver__page-btn:hover:not(:disabled) { background: var(--D-hover, #f1f3f5); }
  .vault-archiver__page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .vault-archiver__page-info { font-size: 12.5px; color: var(--D-text-secondary, #6c757d); }

  /* States */
  .vault-archiver__error { padding: 10px 14px; background: var(--D-danger-soft, #fff5f5); border: 1px solid var(--D-danger-border, #ffc9c9); border-radius: var(--D-radius, 8px); color: var(--D-danger, #e03131); font-size: 13px; display: flex; align-items: center; gap: 10px; }
  .vault-archiver__error-retry { background: none; border: none; color: var(--D-danger, #e03131); font-weight: 600; cursor: pointer; text-decoration: underline; padding: 0; font-size: 13px; }
  .vault-archiver__empty { display: flex; align-items: center; gap: 10px; padding: 20px; color: var(--D-text-muted, #adb5bd); font-size: 13px; border: 1px dashed var(--D-border, #e9ecef); border-radius: var(--D-radius, 8px); }
  .vault-archiver__skeleton-wrap { display: flex; flex-direction: column; gap: 10px; }
  .vault-archiver__skeleton { height: 90px; border-radius: var(--D-radius, 8px); background: linear-gradient(90deg, var(--D-skeleton-base, #e9ecef) 25%, var(--D-skeleton-shine, #f1f3f5) 50%, var(--D-skeleton-base, #e9ecef) 75%); background-size: 200% 100%; animation: vault-shimmer 1.4s ease-in-out infinite; }

  /* ── Modal ───────────────────────────────────────────────────────────────── */
  .vault-archiver__modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.45);
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .vault-archiver__modal {
    background: var(--D-surface, #ffffff);
    border-radius: var(--D-radius, 10px);
    border: 1px solid var(--D-border, #e9ecef);
    width: 100%;
    max-width: 540px;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,.2);
  }

  .vault-archiver__modal-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 20px 14px;
    border-bottom: 1px solid var(--D-border, #e9ecef);
    flex-shrink: 0;
  }

  .vault-archiver__modal-title-row { display: flex; align-items: flex-start; gap: 12px; }

  .vault-archiver__modal-icon {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0; margin-top: 2px;
  }
  .vault-archiver__modal-icon--accent { background: var(--D-accent-soft, #e7f0ff); color: var(--D-accent, #2563eb); }
  .vault-archiver__modal-icon--danger { background: #fff5f5; color: #e03131; }

  .vault-archiver__modal-title { font-size: 14px; font-weight: 700; color: var(--D-text-primary, #1a1a2e); margin: 0 0 2px; }
  .vault-archiver__modal-sub { font-size: 12px; color: var(--D-text-secondary, #6c757d); margin: 0; line-height: 1.5; }

  .vault-archiver__modal-close {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; border-radius: 6px;
    border: none; background: none; cursor: pointer;
    color: var(--D-text-muted, #adb5bd);
    transition: background 100ms, color 100ms;
    flex-shrink: 0;
  }
  .vault-archiver__modal-close:hover { background: var(--D-hover, #f1f3f5); color: var(--D-text-primary, #1a1a2e); }

  .vault-archiver__modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .vault-archiver__modal-warn {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 14px;
    background: #fff7ed;
    border: 1px solid #ffd8a8;
    border-radius: var(--D-radius, 8px);
    color: #e67700;
    font-size: 12.5px;
    line-height: 1.5;
    flex-shrink: 0;
  }
  .vault-archiver__modal-warn svg { flex-shrink: 0; margin-top: 1px; }

  .vault-archiver__modal-select-all {
    padding-bottom: 8px;
    border-bottom: 1px solid var(--D-border, #e9ecef);
  }

  .vault-archiver__modal-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .vault-archiver__modal-group-label {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--D-text-muted, #adb5bd);
    margin: 0 0 4px;
  }

  .vault-archiver__modal-check-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 7px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 80ms;
  }
  .vault-archiver__modal-check-row:hover { background: var(--D-hover, #f8f9fa); }

  .vault-archiver__modal-checkbox {
    margin-top: 2px;
    width: 15px;
    height: 15px;
    cursor: pointer;
    flex-shrink: 0;
    accent-color: var(--D-accent, #2563eb);
  }

  .vault-archiver__modal-check-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--D-text-primary, #1a1a2e);
    display: flex;
    flex-direction: column;
    gap: 1px;
    line-height: 1.4;
  }
  .vault-archiver__modal-check-label--bold { font-weight: 700; }
  .vault-archiver__modal-check-label--muted { color: var(--D-text-muted, #adb5bd); }

  .vault-archiver__modal-check-meta {
    font-size: 11px;
    font-weight: 400;
    color: var(--D-text-muted, #adb5bd);
    font-family: monospace;
  }

  .vault-archiver__modal-confirm-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px 14px;
    background: #fff5f5;
    border: 1px solid #ffc9c9;
    border-radius: var(--D-radius, 8px);
    cursor: pointer;
    margin-top: 4px;
  }

  .vault-archiver__modal-confirm-text {
    font-size: 12.5px;
    color: #c92a2a;
    font-weight: 500;
    line-height: 1.5;
  }

  .vault-archiver__modal-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 20px;
    border-top: 1px solid var(--D-border, #e9ecef);
    flex-shrink: 0;
  }

  .vault-archiver__modal-footer-count {
    font-size: 12px;
    color: var(--D-text-muted, #adb5bd);
    margin-right: auto;
  }

  .vault-archiver__modal-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    height: 34px;
    border-radius: var(--D-radius-sm, 6px);
    border: none;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 100ms, opacity 100ms;
    font-family: inherit;
  }
  .vault-archiver__modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .vault-archiver__modal-btn--secondary { background: var(--D-hover, #f1f3f5); color: var(--D-text-primary, #1a1a2e); }
  .vault-archiver__modal-btn--secondary:hover:not(:disabled) { background: var(--D-border, #e9ecef); }
  .vault-archiver__modal-btn--primary { background: var(--D-accent, #2563eb); color: #fff; }
  .vault-archiver__modal-btn--primary:hover:not(:disabled) { background: #1d4ed8; }
  .vault-archiver__modal-btn--danger { background: #e03131; color: #fff; }
  .vault-archiver__modal-btn--danger:hover:not(:disabled) { background: #c92a2a; }

  /* Results */
  .vault-archiver__modal-results { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
  .vault-archiver__modal-result-error { padding: 16px 20px; color: #e03131; font-size: 13px; }
  .vault-archiver__modal-result-summary { display: flex; gap: 14px; padding: 14px 20px; border-bottom: 1px solid var(--D-border, #e9ecef); }
  .vault-archiver__modal-result-ok { font-size: 13px; font-weight: 700; color: #16a34a; }
  .vault-archiver__modal-result-fail { font-size: 13px; font-weight: 700; color: #e03131; }
  .vault-archiver__modal-result-list { flex: 1; overflow-y: auto; padding: 8px 0; }
  .vault-archiver__modal-result-row { display: flex; align-items: center; gap: 10px; padding: 9px 20px; }
  .vault-archiver__modal-result-row:hover { background: var(--D-hover, #f8f9fa); }
  .vault-archiver__modal-result-label { font-size: 13px; font-weight: 500; color: var(--D-text-primary, #1a1a2e); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vault-archiver__modal-result-meta { font-size: 12px; color: var(--D-text-secondary, #6c757d); white-space: nowrap; flex-shrink: 0; }
  .vault-archiver__modal-result-row--failed .vault-archiver__modal-result-meta { color: #e03131; }

  /* Spinner / shimmer */
  .vault-archiver__spin { animation: vault-spin 800ms linear infinite; }
  @keyframes vault-spin    { to { transform: rotate(360deg); } }
  @keyframes vault-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;