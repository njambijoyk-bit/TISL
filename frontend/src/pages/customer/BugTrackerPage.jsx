import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Search, ArrowRight, Loader2, AlertCircle,
  Clock, Hash, Flag, Calendar
} from 'lucide-react';
import '../../styles/bug.css';
import Header from '../../components/layout/Header';
import StatusBadge from '../../components/bugs/StatusBadge';
import PriorityBadge from '../../components/bugs/PriorityBadge';
import MimiFooter from '../../components/bugs/MimiFooter';
import { trackReport } from '../../api/bugReportsAPI';

function MetaRow({ icon: Icon, label, children }) {
  return (
    <div className="bug-flex bug-items-start bug-gap-3" style={{ padding: '12px 0' }}>
      <div className="bug-meta-icon-box">
        <Icon size={13} className="bug-text-muted" />
      </div>
      <div className="bug-flex-1 bug-min-w-0">
        <p className="bug-text-xs bug-text-muted" style={{ marginBottom: 2 }}>{label}</p>
        <div className="bug-text-sm bug-text">{children}</div>
      </div>
    </div>
  );
}

function Timeline({ history }) {
  if (!history?.length) return null;
  return (
    <div className="bug-flex-col">
      {history.map((h, i) => (
        <div key={i} className="bug-flex" style={{ gap: 16 }}>
          {/* spine */}
          <div className="bug-flex-col bug-items-center" style={{ width: 24, flexShrink: 0 }}>
            <div
              className={`bug-timeline-dot-lg ${i === 0 ? 'bug-timeline-dot-lg-active' : 'bug-timeline-dot-lg-inactive'}`}
            />
            {i < history.length - 1 && (
              <div className="bug-timeline-line" />
            )}
          </div>

          {/* content */}
          <div className="bug-pb-5 bug-min-w-0 bug-flex-1">
            <div className="bug-flex bug-items-center bug-gap-2 bug-flex-wrap">
              {h.from ? (
                <>
                  <StatusBadge status={h.from} showIcon={false} />
                  <ArrowRight size={12} className="bug-text-muted" />
                  <StatusBadge status={h.to} />
                </>
              ) : (
                <div className="bug-flex bug-items-center bug-gap-1.5">
                  <StatusBadge status={h.to} />
                  <span className="bug-text-xs bug-text-muted">— submitted</span>
                </div>
              )}
            </div>

            {h.note && (
              <p className="bug-note-bubble">
                {h.note}
              </p>
            )}

            <p className="bug-text-xs bug-text-muted" style={{ marginTop: 6 }}>
              {h.changed_at
                ? new Date(h.changed_at).toLocaleString()
                : ''}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * BugTrackerPage — /track-bug  and  /track-bug/:token
 * Public. If :token in URL, auto-fetches. Otherwise shows token input.
 */
export default function BugTrackerPage() {
  const { token: urlToken } = useParams();
  const navigate = useNavigate();

  const [tokenInput, setTokenInput] = useState(urlToken ?? '');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const lookup = async (token) => {
    if (!token?.trim()) { setError('Please enter a tracking token.'); return; }
    setError(null);
    setLoading(true);
    setReport(null);
    try {
      const data = await trackReport(token.trim());
      setReport(data);
      if (!urlToken) navigate(`/track-bug/${token.trim()}`, { replace: true });
    } catch (err) {
      if (err?.response?.status === 404) {
        setError('No report found for that token. Double-check and try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // auto-lookup when token is in URL
  useEffect(() => {
    if (urlToken) lookup(urlToken);
  }, [urlToken]);

  return (
    <div className="bug-page">
      <Header />
      <main className="bug-main">
        <div className="bug-container">

          {/* header */}
          <div className="bug-flex-col bug-gap-2">
            <div className="bug-flex bug-items-center bug-gap-2.5">
              <div className="bug-icon-box bug-icon-box-md bug-icon-box-blue">
                <Search size={18} />
              </div>
              <h1 className="bug-text-2xl bug-font-bold bug-text">Track Your Report</h1>
            </div>
            <p className="bug-text-sm bug-text-muted">
              Enter the tracking token you received when you submitted your report.
            </p>
          </div>

          {/* token input */}
          <div className="bug-card-2xl">
            <div className="bug-flex" style={{ gap: 8 }}>
              <input
                type="text"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') lookup(tokenInput); }}
                placeholder="Paste your tracking token..."
                className="bug-input"
              />
              <button
                onClick={() => lookup(tokenInput)}
                disabled={loading}
                className="bug-btn bug-btn-primary"
                style={{ flexShrink: 0 }}
              >
                {loading ? <Loader2 size={15} className="bug-animate-spin" /> : <Search size={15} />}
                {loading ? '' : 'Track'}
              </button>
            </div>

            {error && (
              <div className="bug-alert bug-alert-red" style={{ marginTop: 12 }}>
                <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                {error}
              </div>
            )}
          </div>

          {/* result */}
          {report && (
            <div className="bug-card">

              {/* report header */}
              <div className="bug-px-6" style={{ paddingTop: 20, paddingBottom: 16, borderBottom: '1px solid var(--bug-border-light)' }}>
                <div className="bug-flex bug-items-start bug-justify-between bug-gap-3">
                  <h2 className="bug-text-base bug-font-semibold bug-text" style={{ flex: 1 }}>
                    {report.title}
                  </h2>
                  <StatusBadge status={report.status} size="md" />
                </div>
              </div>

              {/* meta */}
              <div className="bug-px-6 divide-y">
                <MetaRow icon={Hash} label="Report number">
                  <span className="bug-mono">{report.report_number}</span>
                </MetaRow>
                <MetaRow icon={Flag} label="Priority">
                  <PriorityBadge priority={report.priority} size="md" />
                </MetaRow>
                <MetaRow icon={Calendar} label="Submitted">
                  {new Date(report.created_at).toLocaleString()}
                </MetaRow>
              </div>

              {/* timeline */}
              {report.history?.length > 0 && (
                <div className="bug-px-6" style={{ paddingTop: 20, paddingBottom: 24 }}>
                  <p className="bug-text-xs bug-font-semibold bug-uppercase bug-text-muted" style={{ letterSpacing: '0.05em', marginBottom: 16 }}>
                    <Clock size={12} style={{ display: 'inline', marginRight: 6 }} /> Status History
                  </p>
                  <Timeline history={report.history} />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <MimiFooter />
    </div>
  );
}
