import { useState, useEffect, useCallback } from 'react';
import {
  Bug, ChevronRight, ChevronLeft,
  Loader2, AlertCircle, ArrowRight, Clock, ExternalLink
} from 'lucide-react';
import '../../styles/bug.css';
import StatusBadge from '../../components/bugs/StatusBadge';
import PriorityBadge from '../../components/bugs/PriorityBadge';
import MimiFooter from '../../components/bugs/MimiFooter';
import Header from '../../components/layout/Header';
import { customerGetReports, customerGetReport } from '../../api/bugReportsAPI';

function Timeline({ history }) {
  if (!history?.length) return <p className="bug-text-sm bug-text-muted">No updates yet.</p>;
  return (
    <div className="bug-flex-col">
      {history.map((h, i) => (
        <div key={i} className="bug-flex" style={{ gap: 12 }}>
          <div className="bug-flex-col bug-items-center" style={{ width: 20, flexShrink: 0 }}>
            <div
              className={`bug-timeline-dot ${i === 0 ? 'bug-timeline-dot-active' : 'bug-timeline-dot-inactive'}`}
            />
            {i < history.length - 1 && <div className="bug-timeline-line" />}
          </div>
          <div className="bug-pb-4 bug-min-w-0 bug-flex-1">
            <div className="bug-flex bug-items-center bug-gap-1.5 bug-flex-wrap">
              {h.from_status ? (
                <>
                  <StatusBadge status={h.from_status} showIcon={false} />
                  <ArrowRight size={11} className="bug-text-muted" />
                  <StatusBadge status={h.to_status} />
                </>
              ) : (
                <StatusBadge status={h.to_status} />
              )}
            </div>
            {h.note && (
              <p className="bug-note-bubble">{h.note}</p>
            )}
            <p className="bug-text-xs bug-text-muted" style={{ marginTop: 4 }}>
              {h.created_at ? new Date(h.created_at).toLocaleString() : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailPanel({ reportId, onClose }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await customerGetReport(reportId);
        if (!cancelled) setReport(data);
      } catch {
        if (!cancelled) setError('Failed to load report.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [reportId]);

  return (
    <div className="bug-flex-col bug-h-full">
      <div className="bug-flex bug-items-center bug-gap-2 bug-px-5 bug-py-4 bug-border-b-light" style={{ flexShrink: 0 }}>
        <button
          onClick={onClose}
          className="bug-copy-btn"
          style={{ padding: 4, borderRadius: 6 }}
        >
          <ChevronRight size={16} />
        </button>
        <span className="bug-text-sm bug-font-medium bug-text">
          {report?.report_number ?? '—'}
        </span>
      </div>

      <div className="bug-flex-1 bug-overflow-y-auto bug-px-5 bug-py-5 bug-flex-col bug-gap-5">
        {loading && (
          <div className="bug-flex bug-items-center bug-justify-center" style={{ padding: '48px 0' }}>
            <Loader2 size={20} className="bug-animate-spin bug-text-muted" />
          </div>
        )}
        {error && (
          <div className="bug-flex bug-items-center bug-gap-2 bug-text-sm bug-text-red">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        {report && !loading && (
          <>
            <div className="bug-flex-col" style={{ gap: 8 }}>
              <h2 className="bug-text-base bug-font-semibold bug-text">{report.title}</h2>
              <div className="bug-flex bug-items-center bug-gap-2 bug-flex-wrap">
                <StatusBadge status={report.status} size="md" />
                <PriorityBadge priority={report.priority} size="md" />
              </div>
            </div>

            <p className="bug-text-sm bug-text-secondary bug-whitespace-pre">{report.description}</p>

            {(report.page_url || report.screenshot_url) && (
              <div className="bug-flex bug-flex-wrap" style={{ gap: 8 }}>
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
            )}

            <div className="bug-border-t-light" />

            <div>
              <p className="bug-text-xs bug-font-semibold bug-uppercase bug-text-muted" style={{ letterSpacing: '0.05em', marginBottom: 12 }}>
                <Clock size={11} style={{ display: 'inline', marginRight: 6 }} /> Status History
              </p>
              <Timeline history={report.status_history ?? report.statusHistory ?? []} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * MyBugReports — /account/bug-reports
 * Customer view: paginated list + detail side panel.
 */
export default function MyBugReports() {
  const [reports, setReports] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await customerGetReports({ page: p, per_page: 15 });
      setReports(res.data);
      setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
      setPage(p);
    } catch {
      setError('Could not load your reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  return (
    <div className="bug-page">
      <Header />
      <main className="flex-1 bug-px-4 bug-py-8" style={{ maxWidth: 1024, margin: '0 auto', width: '100%' }}>

        {/* header */}
        <div className="bug-flex bug-items-center bug-gap-2.5" style={{ marginBottom: 24 }}>
          <div className="bug-icon-box bug-icon-box-md bug-icon-box-blue">
            <Bug size={18} />
          </div>
          <div>
            <h1 className="bug-text-xl bug-font-bold bug-text">My Bug Reports</h1>
            {meta && (
              <p className="bug-text-xs bug-text-muted">{meta.total} report{meta.total !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>

        {/* split layout */}
        <div className="bug-split">

          {/* list */}
          <div className={`bug-flex-col bug-gap-2 ${selected ? 'bug-split-half' : 'bug-split-full'}`}>
            {loading && (
              <div className="bug-flex bug-items-center bug-justify-center" style={{ padding: '48px 0' }}>
                <Loader2 size={20} className="bug-animate-spin bug-text-muted" />
              </div>
            )}
            {error && (
              <div className="bug-flex bug-items-center bug-gap-2 bug-text-sm bug-text-red" style={{ padding: '16px 0' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}
            {!loading && !error && reports.length === 0 && (
              <div className="bug-flex-col bug-items-center bug-gap-3" style={{ padding: '64px 0' }}>
                <Bug size={32} strokeWidth={1.5} className="bug-text-muted" />
                <p className="bug-text-sm bug-text-muted">No bug reports yet.</p>
              </div>
            )}

            {reports.map(r => (
              <button
                key={r.id}
                onClick={() => setSelected(selected === r.id ? null : r.id)}
                className={`w-full bug-text-left bug-rounded-xl ${selected === r.id ? 'bug-selected' : 'bug-unselected'}`}
                style={{ padding: 16, display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <div className="bug-flex-1 bug-min-w-0">
                  <div className="bug-flex bug-items-start bug-justify-between bug-gap-2">
                    <p className="bug-text-sm bug-font-medium bug-text truncate">{r.title}</p>
                    <div style={{ flexShrink: 0 }}>
                      <StatusBadge status={r.status} showIcon={false} />
                    </div>
                  </div>
                  <div className="bug-flex bug-items-center bug-gap-2 bug-mt-1.5 bug-flex-wrap">
                    <span className="bug-mono bug-text-xs bug-text-muted">{r.report_number}</span>
                    <span className="bug-text-muted" style={{ opacity: 0.4 }}>·</span>
                    <PriorityBadge priority={r.priority} showIcon={false} />
                    <span className="bug-text-muted" style={{ opacity: 0.4 }}>·</span>
                    <span className="bug-text-xs bug-text-muted">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  size={15}
                  className="bug-text-muted"
                  style={{
                    flexShrink: 0,
                    marginTop: 2,
                    transform: selected === r.id ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.2s ease'
                  }}
                />
              </button>
            ))}

            {/* pagination */}
            {meta && meta.last_page > 1 && (
              <div className="bug-flex bug-items-center bug-justify-between" style={{ paddingTop: 16, marginTop: 8 }}>
                <button
                  onClick={() => load(page - 1)}
                  disabled={page <= 1 || loading}
                  className="bug-flex bug-items-center bug-gap-1.5 bug-text-sm bug-text-secondary"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: page <= 1 || loading ? 0.4 : 1 }}
                >
                  <ChevronLeft size={15} /> Previous
                </button>
                <span className="bug-text-xs bug-text-muted">
                  Page {meta.current_page} of {meta.last_page}
                </span>
                <button
                  onClick={() => load(page + 1)}
                  disabled={page >= meta.last_page || loading}
                  className="bug-flex bug-items-center bug-gap-1.5 bug-text-sm bug-text-secondary"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: page >= meta.last_page || loading ? 0.4 : 1 }}
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>

          {/* detail panel */}
          {selected && (
            <div className="bug-detail-panel">
              <DetailPanel
                reportId={selected}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
        </div>
      </main>

      <MimiFooter />
    </div>
  );
}
