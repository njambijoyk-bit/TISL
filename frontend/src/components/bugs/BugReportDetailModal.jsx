import { useState, useEffect } from 'react';
import {
  X, ExternalLink, User, Mail, Hash, Clock,
  ArrowRight, Loader2, ChevronDown, GitBranch,
  AlertCircle, FileText, ShieldAlert
} from 'lucide-react';
import '../../styles/bug.css';
import StatusBadge from './StatusBadge';
import PriorityBadge from './PriorityBadge';
import {
  adminGetReport, adminUpdateStatus, adminUpdatePriority,
  BUG_STATUSES, BUG_PRIORITIES
} from '../../api/bugReportsAPI';

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bug-flex-col bug-gap-3">
      <div className="bug-flex bug-items-center bug-gap-2">
        <Icon size={14} className="bug-text-muted" />
        <p className="bug-text-xs bug-font-semibold bug-uppercase bug-text-muted" style={{ letterSpacing: '0.05em' }}>{title}</p>
      </div>
      {children}
    </div>
  );
}

function Timeline({ history }) {
  if (!history?.length) return <p className="bug-text-sm bug-text-muted">No history yet.</p>;
  return (
    <div className="bug-flex-col bug-gap-0">
      {history.map((h, i) => (
        <div key={i} className="bug-flex bug-gap-3">
          <div className="bug-flex-col bug-items-center">
            <div
              className={`bug-timeline-dot ${i === 0 ? 'bug-timeline-dot-active' : 'bug-timeline-dot-inactive'}`}
            />
            {i < history.length - 1 && <div className="bug-timeline-line" />}
          </div>
          <div className="bug-pb-4 bug-min-w-0">
            <div className="bug-flex bug-items-center bug-gap-2 bug-flex-wrap">
              {h.from ? (
                <>
                  <StatusBadge status={h.from} size="sm" showIcon={false} />
                  <ArrowRight size={12} className="bug-text-muted" />
                  <StatusBadge status={h.to} size="sm" showIcon={false} />
                </>
              ) : (
                <StatusBadge status={h.to} size="sm" />
              )}
            </div>
            {h.note && (
              <p className="bug-text-xs bug-text-secondary bug-mt-1">{h.note}</p>
            )}
            <p className="bug-text-xs bug-text-muted" style={{ marginTop: 2 }}>
              {h.changed_at
                ? new Date(h.changed_at).toLocaleString()
                : h.created_at
                  ? new Date(h.created_at).toLocaleString()
                  : '—'}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * BugReportDetailModal
 *
 * @param {number}   reportId   id to fetch
 * @param {Function} onClose
 * @param {Function} onUpdated  called after status/priority change (refresh parent list)
 */
export default function BugReportDetailModal({ reportId, onClose, onUpdated }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [newPriority, setNewPriority] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await adminGetReport(reportId);
        if (!cancelled) {
          setReport(data);
          setNewStatus(data.status);
          setNewPriority(data.priority);
        }
      } catch {
        if (!cancelled) setError('Failed to load report.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [reportId]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleStatusSave = async () => {
    if (newStatus === report.status && !statusNote) return;
    setSaveErr(null);
    setSaving(true);
    try {
      const res = await adminUpdateStatus(reportId, { status: newStatus, note: statusNote || undefined });
      setReport(prev => ({ ...prev, ...res.report, statusHistory: res.report.status_history ?? prev.statusHistory }));
      setStatusNote('');
      if (onUpdated) onUpdated();
    } catch {
      setSaveErr('Failed to update status.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrioritySave = async (val) => {
    setNewPriority(val);
    try {
      await adminUpdatePriority(reportId, val);
      setReport(prev => ({ ...prev, priority: val }));
      if (onUpdated) onUpdated();
    } catch {
      setSaveErr('Failed to update priority.');
    }
  };

  const reporter = () => {
    if (report.customer) return report.customer.name ?? `Customer #${report.customer.id}`;
    if (report.user) return report.user.name ?? `Admin #${report.user.id}`;
    return report.guest_name ?? report.guest_email ?? 'Anonymous guest';
  };

  return (
    <div
      className="bug-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bug-modal">

        {/* header */}
        <div className="bug-flex bug-items-center bug-justify-between bug-px-6 bug-py-4 bug-border-b-light" style={{ flexShrink: 0 }}>
          <div className="bug-flex bug-items-center bug-gap-2">
            <ShieldAlert size={16} className="bug-text-muted" />
            <span className="bug-text-sm bug-font-semibold bug-text">
              {report?.report_number ?? 'Loading...'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="bug-btn"
            style={{ padding: 6 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* body */}
        <div className="bug-overflow-y-auto bug-flex-1 bug-px-6 bug-py-5 bug-flex-col bug-gap-6">
          {loading && (
            <div className="bug-flex bug-items-center bug-justify-center" style={{ padding: '64px 0' }}>
              <Loader2 size={22} className="bug-animate-spin bug-text-muted" />
            </div>
          )}

          {error && (
            <div className="bug-flex bug-items-center bug-gap-2 bug-text-sm bug-text-red">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {report && !loading && (
            <>
              {/* title + description */}
              <Section title="Report" icon={FileText}>
                <h2 className="bug-text-base bug-font-semibold bug-text">{report.title}</h2>
                <p className="bug-text-sm bug-text-secondary bug-whitespace-pre">{report.description}</p>
                <div className="bug-flex bug-flex-wrap bug-gap-3" style={{ marginTop: 4 }}>
                  {report.page_url && (
                    <a href={report.page_url} target="_blank" rel="noreferrer" className="bug-link">
                      <ExternalLink size={11} /> Affected page
                    </a>
                  )}
                  {report.screenshot_url && (
                    <a href={report.screenshot_url} target="_blank" rel="noreferrer" className="bug-link">
                      <ExternalLink size={11} /> Screenshot
                    </a>
                  )}
                </div>
              </Section>

              <div className="bug-border-t-light" />

              {/* metadata */}
              <Section title="Details" icon={Hash}>
                <div className="bug-grid-meta">
                  <div>
                    <p className="bug-text-xs bug-text-muted" style={{ marginBottom: 2 }}>Reporter</p>
                    <div className="bug-flex bug-items-center bug-gap-1.5 bug-text">
                      <User size={12} className="bug-text-muted" />
                      {reporter()}
                    </div>
                    {report.guest_email && !report.customer && (
                      <div className="bug-flex bug-items-center bug-gap-1.5 bug-text-xs bug-text-muted" style={{ marginTop: 2 }}>
                        <Mail size={11} /> {report.guest_email}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="bug-text-xs bug-text-muted" style={{ marginBottom: 2 }}>Submitted</p>
                    <div className="bug-flex bug-items-center bug-gap-1.5 bug-text">
                      <Clock size={12} className="bug-text-muted" />
                      {new Date(report.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <p className="bug-text-xs bug-text-muted" style={{ marginBottom: 4 }}>Status</p>
                    <StatusBadge status={report.status} size="md" />
                  </div>
                  <div>
                    <p className="bug-text-xs bug-text-muted" style={{ marginBottom: 4 }}>Priority</p>
                    <PriorityBadge priority={report.priority} size="md" />
                  </div>
                </div>
              </Section>

              <div className="bug-border-t-light" />

              {/* status update */}
              <Section title="Update Status" icon={Clock}>
                <div className="bug-flex-col bug-gap-3">
                  <div className="bug-flex bug-items-center bug-gap-3">
                    <select
                      value={newStatus}
                      onChange={e => setNewStatus(e.target.value)}
                      className="bug-select"
                    >
                      {BUG_STATUSES.map(s => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>

                    <select
                      value={newPriority}
                      onChange={e => handlePrioritySave(e.target.value)}
                      className="bug-select"
                    >
                      {BUG_PRIORITIES.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    value={statusNote}
                    onChange={e => setStatusNote(e.target.value)}
                    placeholder="Optional note (visible to reporter)..."
                    rows={2}
                    maxLength={1000}
                    className="bug-textarea bug-resize-none"
                  />

                  {saveErr && (
                    <p className="bug-text-xs bug-text-red bug-flex bug-items-center bug-gap-1">
                      <AlertCircle size={12} /> {saveErr}
                    </p>
                  )}

                  <button
                    onClick={handleStatusSave}
                    disabled={saving || newStatus === report.status}
                    className="bug-btn bug-btn-primary bug-self-start"
                  >
                    {saving ? <><Loader2 size={14} className="bug-animate-spin" /> Saving...</> : 'Save Status'}
                  </button>
                </div>
              </Section>

              <div className="bug-border-t-light" />

              {/* status history */}
              <Section title="History" icon={Clock}>
                <Timeline history={report.status_history ?? report.statusHistory ?? []} />
              </Section>

              {/* dev note section */}
              {report.dev_note && (
                <>
                  <div className="bug-border-t-light" />
                  <Section title="Dev Note" icon={GitBranch}>
                    <div className="bug-card" style={{ padding: 16 }}>
                      <div className="bug-flex bug-items-center bug-justify-between">
                        <span className="bug-mono bug-text-xs bug-text-muted">{report.dev_note.note_number}</span>
                        <span className="bug-text-xs bug-text-muted">{report.dev_note.type}</span>
                      </div>
                      <p className="bug-text-sm bug-font-medium bug-text-secondary">{report.dev_note.title}</p>
                      {report.dev_note.description && (
                        <p className="bug-text-xs bug-text-muted bug-whitespace-pre">{report.dev_note.description}</p>
                      )}
                      {report.dev_note.branch_name && (
                        <div className="bug-flex bug-items-center bug-gap-1.5 bug-text-xs bug-text-muted">
                          <GitBranch size={11} /> {report.dev_note.branch_name}
                        </div>
                      )}
                    </div>
                  </Section>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
