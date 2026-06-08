import { useState } from 'react';
import {
  Bug, Globe, Camera, User, Mail, Send, Copy, Check, ExternalLink, Loader2, AlertCircle
} from 'lucide-react';
import { submitReport } from '../../api/bugReportsAPI';
import '../../styles/bug.css';

const MAX_DESC = 5000;

/**
 * BugReportForm
 *
 * @param {Function}  onSuccess       called with the response after successful submit
 * @param {Function}  [onCancel]      called when user clicks cancel (modal use)
 * @param {boolean}   [isModal]       compact layout tweaks for modal use
 * @param {Object}    [currentUser]   auth user object — null = guest mode
 */
export default function BugReportForm({ onSuccess, onCancel, isModal = false, currentUser = null }) {
  const isGuest = !currentUser;

  const [form, setForm] = useState({
    title: '',
    description: '',
    page_url: typeof window !== 'undefined' ? window.location.href : '',
    screenshot_url: '',
    guest_name: '',
    guest_email: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const descLeft = MAX_DESC - form.description.length;

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!form.description.trim()) { setError('Description is required.'); return; }
    setError(null);
    setLoading(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        page_url: form.page_url.trim() || undefined,
        screenshot_url: form.screenshot_url.trim() || undefined,
      };
      if (isGuest) {
        if (form.guest_name.trim()) payload.guest_name = form.guest_name.trim();
        if (form.guest_email.trim()) payload.guest_email = form.guest_email.trim();
      }
      const res = await submitReport(payload);
      setResult(res);
      if (onSuccess) onSuccess(res);
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToken = () => {
    navigator.clipboard.writeText(result.tracking_token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── success state ──────────────────────────────────────────────
  if (result) {
    return (
      <div className="bug-flex-col bug-gap-5">
        <div className="bug-flex-col bug-items-center bug-gap-3 bug-py-4 bug-text-center">
          <div className="bug-success-circle">
            <Check size={22} />
          </div>
          <div>
            <p className="bug-text-base bug-font-semibold bug-text">Report submitted</p>
            <p className="bug-text-sm bug-text-muted bug-mt-0.5">Thank you for helping us improve.</p>
          </div>
        </div>

        <div className="bug-card divide-y" style={{ fontSize: 14 }}>
          <div className="bug-flex bug-items-center bug-justify-between bug-px-4 bug-py-3">
            <span className="bug-text-muted">Report number</span>
            <span className="bug-mono bug-font-medium bug-text">{result.report_number}</span>
          </div>
          <div className="bug-flex bug-items-center bug-justify-between bug-px-4 bug-py-3">
            <span className="bug-text-muted">Tracking token</span>
            <div className="bug-flex bug-items-center bug-gap-2">
              <span className="bug-mono bug-text-xs bug-text-secondary" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {result.tracking_token}
              </span>
              <button onClick={copyToken} className="bug-copy-btn" title="Copy token">
                {copied ? <Check size={14} className="bug-text-green" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>

        <p className="bug-text-xs bug-text-muted bug-text-center">
          Save your tracking token to check the status of this report later.
        </p>

        <div className="bug-flex bug-gap-2 bug-justify-center">
          <a href={`/track-bug/${result.tracking_token}`} className="bug-link">
            <ExternalLink size={13} />
            Track this report
          </a>
        </div>

        {onCancel && (
          <button
            onClick={onCancel}
            className="bug-btn bug-mt-1"
            style={{ width: '100%' }}
          >
            Close
          </button>
        )}
      </div>
    );
  }

  // ── form state ─────────────────────────────────────────────────
  return (
    <div className="bug-flex-col bug-gap-5">
      {/* guest fields */}
      {isGuest && (
        <div className="bug-grid-2">
          <div className="bug-field">
            <label className="bug-label">
              <span><User size={13} /> Name <span className="bug-text-muted bug-font-normal">(optional)</span></span>
            </label>
            <input
              type="text"
              value={form.guest_name}
              onChange={set('guest_name')}
              placeholder="Your name"
              maxLength={120}
              className="bug-input"
            />
          </div>
          <div className="bug-field">
            <label className="bug-label">
              <span><Mail size={13} /> Email <span className="bug-text-muted bug-font-normal">(optional)</span></span>
            </label>
            <input
              type="email"
              value={form.guest_email}
              onChange={set('guest_email')}
              placeholder="you@example.com"
              maxLength={180}
              className="bug-input"
            />
          </div>
        </div>
      )}

      {/* title */}
      <div className="bug-field">
        <label className="bug-label">
          <span><Bug size={13} /> Title <span className="bug-text-red">*</span></span>
        </label>
        <input
          type="text"
          value={form.title}
          onChange={set('title')}
          placeholder="Brief summary of the issue"
          maxLength={255}
          className="bug-input"
        />
      </div>

      {/* description */}
      <div className="bug-field">
        <div className="bug-flex bug-items-center bug-justify-between" style={{ marginBottom: 6 }}>
          <label className="bug-label" style={{ marginBottom: 0 }}>
            Description <span className="bug-text-red">*</span>
          </label>
          <span className={`bug-text-xs ${descLeft < 100 ? 'bug-text-red' : 'bug-text-muted'}`}>
            {descLeft} left
          </span>
        </div>
        <textarea
          value={form.description}
          onChange={set('description')}
          placeholder="Steps to reproduce, expected vs actual behaviour, browser/device info..."
          maxLength={MAX_DESC}
          rows={isModal ? 5 : 7}
          className="bug-textarea bug-resize-none"
        />
      </div>

      {/* page url + screenshot */}
      <div className="bug-grid-2">
        <div className="bug-field">
          <label className="bug-label">
            <span><Globe size={13} /> Page URL <span className="bug-text-muted bug-font-normal">(optional)</span></span>
          </label>
          <input
            type="text"
            value={form.page_url}
            onChange={set('page_url')}
            placeholder="https://..."
            maxLength={2048}
            className="bug-input"
          />
        </div>
        <div className="bug-field">
          <label className="bug-label">
            <span><Camera size={13} /> Screenshot URL <span className="bug-text-muted bug-font-normal">(optional)</span></span>
          </label>
          <input
            type="text"
            value={form.screenshot_url}
            onChange={set('screenshot_url')}
            placeholder="Paste image URL"
            maxLength={2048}
            className="bug-input"
          />
        </div>
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
          {loading
            ? <><Loader2 size={15} className="bug-animate-spin" /> Submitting...</>
            : <><Send size={15} /> Submit Report</>
          }
        </button>
      </div>
    </div>
  );
}
