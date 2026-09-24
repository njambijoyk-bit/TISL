import React, { useState } from 'react';
import { useVaultPolicies } from '../../../hooks/vaultHooks';
import useVaultStore from '../../../store/useVaultStore';
import PolicyBuilderModal from '../../../components/admin/vault/modals/PolicyBuilderModal';

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────
const Icons = {
  shield: (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 1.5L2 4V8C2 11 4.5 13.5 7.5 14.5 10.5 13.5 13 11 13 8V4L7.5 1.5z" fill="currentColor" opacity=".18" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M5 7.5l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  plus: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  edit: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M9 2l2 2-7 7H2v-2L9 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  ),
  trash: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M2 3.5h9M5 3.5V2h3v1.5M5.5 6v3.5M7.5 6v3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M3 3.5l.7 7.2a.8.8 0 00.8.8h5a.8.8 0 00.8-.8L11 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
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

const EFFECT_STYLES = {
  allow: { color: '#16a34a', bg: '#f0fdf4' },
  deny:  { color: '#e03131', bg: '#fff5f5' },
};

const TARGET_LABELS = {
  folder:   'Folder',
  document: 'Document',
  global:   'Global',
};

// ─────────────────────────────────────────────────────────────────────────────
// Policy row
// ─────────────────────────────────────────────────────────────────────────────
function PolicyRow({ policy, onEdit, onDelete }) {
  const effect = EFFECT_STYLES[policy.effect] ?? EFFECT_STYLES.allow;

  return (
    <tr className="vault-policies__row">
      <td className="vault-policies__cell vault-policies__cell--name">
        <div className="vault-policies__name-wrap">
          <span className="vault-policies__name">{policy.name}</span>
          {policy.description && (
            <span className="vault-policies__desc">{policy.description}</span>
          )}
        </div>
      </td>
      <td className="vault-policies__cell">
        <span className="vault-policies__badge" style={{ color: effect.color, background: effect.bg }}>
          {policy.effect}
        </span>
      </td>
      <td className="vault-policies__cell">
        <span className="vault-policies__target">
          {TARGET_LABELS[policy.target_type] ?? policy.target_type}
        </span>
      </td>
      <td className="vault-policies__cell vault-policies__cell--num">
        {policy.conditions?.length ?? 0}
      </td>
      <td className="vault-policies__cell vault-policies__cell--num">
        {policy.assignments?.length ?? 0}
      </td>
      <td className="vault-policies__cell vault-policies__cell--num">
        {policy.priority ?? 0}
      </td>
      <td className="vault-policies__cell">
        <span className={`vault-policies__active ${policy.is_active ? 'vault-policies__active--on' : ''}`}>
          {policy.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="vault-policies__cell vault-policies__cell--actions">
        <button
          className="vault-policies__action-btn"
          onClick={() => onEdit(policy)}
          aria-label="Edit policy"
          title="Edit"
        >
          {Icons.edit}
        </button>
        <button
          className="vault-policies__action-btn vault-policies__action-btn--danger"
          onClick={() => onDelete(policy.id)}
          aria-label="Delete policy"
          title="Delete"
        >
          {Icons.trash}
        </button>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultPoliciesView
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultPoliciesView() {
  const { policies, loading, error, reload, createPolicy, updatePolicy, deletePolicy } = useVaultPolicies();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [filterEffect, setFilterEffect] = useState('');
  const [filterTarget, setFilterTarget] = useState('');

  const handleEdit = (policy) => {
    setEditingPolicy(policy);
    setBuilderOpen(true);
  };

  const handleDelete = async (policyId) => {
    if (!window.confirm('Delete this policy? This cannot be undone.')) return;
    await deletePolicy(policyId);
  };

  const handleClose = () => {
    setBuilderOpen(false);
    setEditingPolicy(null);
  };

  const filtered = policies.filter(p => {
    if (filterEffect && p.effect !== filterEffect) return false;
    if (filterTarget && p.target_type !== filterTarget) return false;
    return true;
  });

  return (
    <div className="vault-policies">

      {/* Header */}
      <div className="vault-policies__header">
        <div>
          <h2 className="vault-policies__title">Access policies</h2>
          <p className="vault-policies__sub">Define who can access what and under which conditions.</p>
        </div>
        <div className="vault-policies__header-actions">
          <button className="vault-policies__reload-btn" onClick={reload} disabled={loading} aria-label="Reload">
            {Icons.refresh}
          </button>
          <button
            className="vault-policies__new-btn"
            onClick={() => { setEditingPolicy(null); setBuilderOpen(true); }}
          >
            {Icons.plus}
            New policy
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="vault-policies__filters">
        <select
          className="vault-policies__filter-select"
          value={filterEffect}
          onChange={e => setFilterEffect(e.target.value)}
        >
          <option value="">All effects</option>
          <option value="allow">Allow</option>
          <option value="deny">Deny</option>
        </select>
        <select
          className="vault-policies__filter-select"
          value={filterTarget}
          onChange={e => setFilterTarget(e.target.value)}
        >
          <option value="">All targets</option>
          <option value="folder">Folder</option>
          <option value="document">Document</option>
          <option value="global">Global</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="vault-policies__error">
          Failed to load policies.
          <button onClick={reload} className="vault-policies__error-retry">Retry</button>
        </div>
      )}

      {/* Skeleton */}
      {loading && policies.length === 0 && (
        <div className="vault-policies__skeleton-wrap">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="vault-policies__skeleton" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && !error && (
        <div className="vault-policies__empty">
          <span aria-hidden="true">{Icons.shield}</span>
          <p>{policies.length === 0 ? 'No policies defined yet.' : 'No policies match your filters.'}</p>
          {policies.length === 0 && (
            <button
              className="vault-policies__empty-btn"
              onClick={() => setBuilderOpen(true)}
            >
              Create your first policy
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="vault-policies__table-wrap">
          <table className="vault-policies__table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Effect</th>
                <th>Target</th>
                <th title="Conditions">Cond.</th>
                <th title="Assignments">Assign.</th>
                <th>Priority</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(policy => (
                <PolicyRow
                  key={policy.id}
                  policy={policy}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Policy builder modal */}
      {builderOpen && (
        <PolicyBuilderModal
          policy={editingPolicy}
          onClose={handleClose}
          onSave={reload}
        />
      )}

      <style>{styles}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  .vault-policies {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 24px;
    overflow-y: auto;
    flex: 1;
  }

  /* Header */
  .vault-policies__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .vault-policies__title {
    font-size: 14px;
    font-weight: 700;
    color: var(--D-text-primary, #1a1a2e);
    margin: 0 0 2px;
  }

  .vault-policies__sub {
    font-size: 12.5px;
    color: var(--D-text-secondary, #6c757d);
    margin: 0;
  }

  .vault-policies__header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .vault-policies__reload-btn {
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
    transition: background 100ms;
  }

  .vault-policies__reload-btn:hover:not(:disabled) { background: var(--D-hover, #f1f3f5); }
  .vault-policies__reload-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .vault-policies__new-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: var(--D-radius-sm, 6px);
    border: none;
    background: var(--D-accent, #2563eb);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    height: 32px;
    transition: background 120ms;
  }

  .vault-policies__new-btn:hover { background: var(--D-accent-hover, #1d4ed8); }

  /* Filters */
  .vault-policies__filters {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .vault-policies__filter-select {
    padding: 6px 10px;
    border-radius: var(--D-radius-sm, 6px);
    border: 1px solid var(--D-border, #e9ecef);
    background: var(--D-surface, #ffffff);
    color: var(--D-text-primary, #1a1a2e);
    font-size: 12.5px;
    cursor: pointer;
    outline: none;
  }

  .vault-policies__filter-select:focus {
    border-color: var(--D-accent, #2563eb);
    box-shadow: 0 0 0 2px var(--D-accent-soft, #e7f0ff);
  }

  /* Table */
  .vault-policies__table-wrap {
    border: 1px solid var(--D-border, #e9ecef);
    border-radius: var(--D-radius, 8px);
    overflow-x: auto;
  }

  .vault-policies__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .vault-policies__table th {
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

  .vault-policies__row:not(:last-child) .vault-policies__cell {
    border-bottom: 1px solid var(--D-border, #e9ecef);
  }

  .vault-policies__row:hover {
    background: var(--D-hover, #f8f9fa);
  }

  .vault-policies__cell {
    padding: 10px 12px;
    vertical-align: middle;
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-policies__cell--name { max-width: 240px; }
  .vault-policies__cell--num  { text-align: center; color: var(--D-text-secondary, #6c757d); }
  .vault-policies__cell--actions {
    text-align: right;
    width: 72px;
  }

  .vault-policies__name-wrap {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .vault-policies__name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .vault-policies__desc {
    font-size: 11.5px;
    color: var(--D-text-muted, #adb5bd);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .vault-policies__badge {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 20px;
    text-transform: capitalize;
  }

  .vault-policies__target {
    font-size: 12px;
    color: var(--D-text-secondary, #6c757d);
  }

  .vault-policies__active {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 20px;
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-muted, #adb5bd);
  }

  .vault-policies__active--on {
    background: #f0fdf4;
    color: #16a34a;
  }

  .vault-policies__action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    border-radius: 4px;
    color: var(--D-text-muted, #adb5bd);
    cursor: pointer;
    transition: background 100ms, color 100ms;
  }

  .vault-policies__action-btn:hover { background: var(--D-hover, #f1f3f5); color: var(--D-text-primary, #1a1a2e); }
  .vault-policies__action-btn--danger:hover { background: var(--D-danger-soft, #fff5f5); color: var(--D-danger, #e03131); }

  /* States */
  .vault-policies__error {
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

  .vault-policies__error-retry {
    background: none;
    border: none;
    color: var(--D-danger, #e03131);
    font-weight: 600;
    cursor: pointer;
    text-decoration: underline;
    padding: 0;
    font-size: 13px;
  }

  .vault-policies__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 48px 24px;
    color: var(--D-text-muted, #adb5bd);
    font-size: 13px;
    text-align: center;
  }

  .vault-policies__empty p { margin: 0; }

  .vault-policies__empty-btn {
    padding: 7px 16px;
    border-radius: var(--D-radius-sm, 6px);
    border: none;
    background: var(--D-accent, #2563eb);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 4px;
    transition: background 120ms;
  }

  .vault-policies__empty-btn:hover { background: var(--D-accent-hover, #1d4ed8); }

  .vault-policies__skeleton-wrap { display: flex; flex-direction: column; gap: 8px; }

  .vault-policies__skeleton {
    height: 52px;
    border-radius: var(--D-radius, 8px);
    background: linear-gradient(90deg, var(--D-skeleton-base, #e9ecef) 25%, var(--D-skeleton-shine, #f1f3f5) 50%, var(--D-skeleton-base, #e9ecef) 75%);
    background-size: 200% 100%;
    animation: vault-shimmer 1.4s ease-in-out infinite;
  }

  @keyframes vault-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
`;