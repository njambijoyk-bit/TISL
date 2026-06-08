import { useState, useEffect } from 'react';
import {
  GitBranch, GitPullRequest, Hash, Link2, FileText,
  Tag, Activity, Loader2, AlertCircle
} from 'lucide-react';
import { DEV_NOTE_TYPES, DEV_NOTE_STATUSES, gitFieldsForType } from '../../api/bugReportsAPI';
import '../../styles/bug.css';

const GIT_FIELD_CONFIG = {
  pr_number: { label: 'PR Number', icon: GitPullRequest, placeholder: '#42' },
  pr_url: { label: 'PR URL', icon: Link2, placeholder: 'https://github.com/.../pull/42' },
  branch_name: { label: 'Branch Name', icon: GitBranch, placeholder: 'fix/login-redirect' },
  git_url: { label: 'Git URL', icon: Link2, placeholder: 'https://github.com/...' },
  commit_hash: { label: 'Commit Hash', icon: Hash, placeholder: 'a1b2c3d...' },
};

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
    bug_report_id: initial.bug_report_id ? String(initial.bug_report_id) : '',
    pr_number: initial.pr_number ?? '',
    pr_url: initial.pr_url ?? '',
    branch_name: initial.branch_name ?? '',
    git_url: initial.git_url ?? '',
    commit_hash: initial.commit_hash ?? '',
  });

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
        bug_report_id: form.bug_report_id ? Number(form.bug_report_id) : undefined,
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
          <span><Link2 size={13} /> Linked Bug Report ID <span className="bug-text-muted bug-font-normal">(optional)</span></span>
        </label>
        <input
          type="number"
          value={form.bug_report_id}
          onChange={set('bug_report_id')}
          placeholder="e.g. 14"
          className="bug-input"
        />
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
