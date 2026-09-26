import { useState, useEffect } from 'react';
import {
  GitBranch, GitPullRequest, Hash, Link2, FileText, Tag, 
  Activity, Loader2, AlertCircle, Search, X as XIcon,
} from 'lucide-react';
import { DEV_NOTE_TYPES, DEV_NOTE_STATUSES, gitFieldsForType, searchReports } from '../../../_shared/api/bugReportsAPI';
import '../../../styles/bug.css';

const GIT_FIELD_CONFIG = {
  pr_number: { label: 'PR Number', icon: GitPullRequest, placeholder: '#42' },
  pr_url: { label: 'PR URL', icon: Link2, placeholder: 'https://github.com/.../pull/42' },
  branch_name: { label: 'Branch Name', icon: GitBranch, placeholder: 'fix/login-redirect' },
  git_url: { label: 'Git URL', icon: Link2, placeholder: 'https://github.com/...' },
  commit_hash: { label: 'Commit Hash', icon: Hash, placeholder: 'a1b2c3d...' },
};

// add this hook just above the component
function useBugSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchReports({ search: query, per_page: 10, page: 1 });
        setResults(res.data ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return { query, setQuery, results, searching, open, setOpen };
}

const PRIORITY_DOT = {
  critical: '#dc2626',
  high:     '#d97706',
  medium:   '#2563eb',
  low:      '#9ca3af',
};

const STATUS_COLORS = {
  open:        { bg: 'rgba(37,99,235,0.08)',  color: '#1d4ed8' },
  in_progress: { bg: 'rgba(217,119,6,0.08)',  color: '#b45309' },
  resolved:    { bg: 'rgba(22,163,74,0.08)',   color: '#15803d' },
  wont_fix:    { bg: 'rgba(107,114,128,0.08)', color: '#6b7280' },
};

function BugSearchField({ value, onChange }) {
  // value = { id, label } | null
  const { query, setQuery, results, searching, open, setOpen } = useBugSearch();
  const [focused, setFocused] = useState(false);

  // If a bug is already selected, show its label; otherwise show the search input
  if (value) {
    return (
      <div
        className="bug-input bug-flex bug-items-center bug-justify-between"
        style={{ cursor: 'default', paddingTop: 0, paddingBottom: 0, height: 38 }}
      >
        <span className="bug-text-sm bug-text bug-truncate" style={{ flex: 1 }}>{value.label}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', color: 'var(--bug-text-muted)' }}
        >
          <XIcon size={13} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.45 }} />
        {searching && (
          <Loader2 size={13} className="bug-animate-spin" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', opacity: 0.45 }} />
        )}
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { setFocused(true); if (results.length) setOpen(true); }}
          onBlur={() => setTimeout(() => { setFocused(false); setOpen(false); }, 150)}
          placeholder="Search by title or report number..."
          className="bug-input"
          style={{ paddingLeft: 32, paddingRight: 32 }}
        />
      </div>

      {open && results.length > 0 && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
            background: 'var(--bug-card-bg, #fff)',
            border: '1px solid var(--bug-border-light)',
            borderRadius: 10, overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
          }}
        >
          {results.map(r => {
            const sc = STATUS_COLORS[r.status] ?? STATUS_COLORS.open;
            return (
              <button
                key={r.id}
                type="button"
                onMouseDown={() => {
                  onChange({ id: r.id, label: `${r.report_number} — ${r.title}` });
                  setQuery('');
                  setOpen(false);
                }}
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none',
                  padding: '10px 14px', cursor: 'pointer', display: 'flex',
                  alignItems: 'center', gap: 10, borderBottom: '1px solid var(--bug-border-light)',
                }}
                className="bug-row-hover"
              >
                {/* priority dot */}
                <span style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: PRIORITY_DOT[r.priority] ?? '#9ca3af',
                }} />

                {/* main info */}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="bug-mono bug-text-xs bug-text-muted" style={{ display: 'block' }}>{r.report_number}</span>
                  <span className="bug-text-sm bug-text bug-truncate" style={{ display: 'block' }}>{r.title}</span>
                </span>

                {/* status pill */}
                <span style={{
                  fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 20, flexShrink: 0,
                  background: sc.bg, color: sc.color,
                }}>
                  {r.status.replace('_', ' ')}
                </span>

                {/* priority label */}
                <span className="bug-text-xs bug-text-muted" style={{ flexShrink: 0, textTransform: 'capitalize' }}>
                  {r.priority}
                </span>
              </button>
            );
          })}

          {!searching && results.length === 0 && (
            <p className="bug-text-xs bug-text-muted" style={{ padding: '12px 14px', margin: 0 }}>No reports found.</p>
          )}
        </div>
      )}

      {open && !searching && results.length === 0 && query.trim() && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
          background: 'var(--bug-card-bg, #fff)', border: '1px solid var(--bug-border-light)',
          borderRadius: 10, padding: '12px 14px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
        }}>
          <p className="bug-text-xs bug-text-muted" style={{ margin: 0 }}>No reports found.</p>
        </div>
      )}
    </div>
  );
}
/**
 * DevNoteForm
 *
 * @param {Object}   [initial]       pre-populated values for edit mode
 * @param {Function} onSubmit        called with (data) — async, should throw on error
 * @param {Function} [onCancel]
 * @param {string}   [submitLabel]
 */
export default function DevNoteForm({ initial = {}, onSubmit, onCancel, submitLabel = 'Save Note' }) {
  const [form, setForm] = useState({
    title: initial.title ?? '',
    description: initial.description ?? '',
    type: initial.type ?? 'general',
    status: initial.status ?? 'pending',
    pr_number: initial.pr_number ?? '',
    pr_url: initial.pr_url ?? '',
    branch_name: initial.branch_name ?? '',
    git_url: initial.git_url ?? '',
    commit_hash: initial.commit_hash ?? '',
  });

  const [selectedBug, setSelectedBug] = useState(
    initial.bug_report_id
      ? { id: initial.bug_report_id, label: `#${initial.bug_report_id}` }
      : null
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const visibleGitFields = gitFieldsForType(form.type);

  // Reset git fields when type changes and they're no longer relevant
  useEffect(() => {
    const relevant = gitFieldsForType(form.type);
    const allGitFields = ['pr_number', 'pr_url', 'branch_name', 'git_url', 'commit_hash'];
    const toClear = allGitFields.filter(f => !relevant.includes(f));
    if (toClear.length) {
      setForm(prev => {
        const next = { ...prev };
        toClear.forEach(f => { next[f] = ''; });
        return next;
      });
    }
  }, [form.type]);

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setError(null);
    setLoading(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        type: form.type,
        status: form.status,
        bug_report_id: selectedBug ? selectedBug.id : undefined,
      };
      visibleGitFields.forEach(f => {
        if (form[f]?.trim()) payload[f] = form[f].trim();
      });
      await onSubmit(payload);
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bug-flex-col bug-gap-5">
      {/* type + status row */}
      <div className="bug-grid-2">
        <div className="bug-field">
          <label className="bug-label">
            <span><Tag size={13} /> Type</span>
          </label>
          <select value={form.type} onChange={set('type')} className="bug-select" style={{ cursor: 'pointer' }}>
            {DEV_NOTE_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="bug-field">
          <label className="bug-label">
            <span><Activity size={13} /> Status</span>
          </label>
          <select value={form.status} onChange={set('status')} className="bug-select" style={{ cursor: 'pointer' }}>
            {DEV_NOTE_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* title */}
      <div className="bug-field">
        <label className="bug-label">
          <span><FileText size={13} /> Title <span className="bug-text-red">*</span></span>
        </label>
        <input
          type="text"
          value={form.title}
          onChange={set('title')}
          placeholder="Short summary of this note"
          maxLength={255}
          className="bug-input"
        />
      </div>

      {/* linked bug report */}
      <div className="bug-field">
        <label className="bug-label">
          <span><Link2 size={13} /> Linked Bug Report <span className="bug-text-muted bug-font-normal">(optional)</span></span>
        </label>
        <BugSearchField value={selectedBug} onChange={setSelectedBug} />
      </div>

      {/* conditional git fields */}
      {visibleGitFields.length > 0 && (
        <div className="bug-card" style={{ padding: 16 }}>
          <p className="bug-text-xs bug-font-semibold bug-text-muted bug-uppercase" style={{ letterSpacing: '0.05em', marginBottom: 16 }}>
            Git Details
          </p>
          <div className="bug-flex-col bug-gap-4">
            {visibleGitFields.map(field => {
              const cfg = GIT_FIELD_CONFIG[field];
              const Icon = cfg.icon;
              return (
                <div key={field} className="bug-field">
                  <label className="bug-label">
                    <span><Icon size={13} /> {cfg.label}</span>
                  </label>
                  <input
                    type="text"
                    value={form[field]}
                    onChange={set(field)}
                    placeholder={cfg.placeholder}
                    className="bug-input"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* description */}
      <div className="bug-field">
        <label className="bug-label">
          <span>Description <span className="bug-text-muted bug-font-normal">(optional)</span></span>
        </label>
        <textarea
          value={form.description}
          onChange={set('description')}
          placeholder="Additional context, observations, notes..."
          rows={5}
          className="bug-textarea bug-resize-none"
        />
      </div>

      {/* error */}
      {error && (
        <div className="bug-alert bug-alert-red">
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          {error}
        </div>
      )}

      {/* actions */}
      <div className="bug-flex bug-items-center bug-gap-3 bug-justify-end" style={{ paddingTop: 4 }}>
        {onCancel && (
          <button onClick={onCancel} disabled={loading} className="bug-btn">
            Cancel
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="bug-btn bug-btn-primary"
        >
          {loading ? <><Loader2 size={15} className="bug-animate-spin" /> Saving...</> : submitLabel}
        </button>
      </div>
    </div>
  );
}
