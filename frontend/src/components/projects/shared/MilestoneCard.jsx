import { useState } from 'react';
import toast from 'react-hot-toast';
import {
  Calendar, DollarSign, User, Clock, CheckCircle2,
  XCircle, ChevronDown, ChevronUp, AlertCircle, Pencil, Trash2
} from 'lucide-react';
import MilestoneStatusBadge from '../../admin/MilestoneStatusBadge';
import useProjectStore from '../../../store/projectStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 100;

const formatDate = (dateStr) =>
  new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

const formatDateTime = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' at '
    + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const money = (n, currency = '') =>
  (currency ? `${currency} ` : '') +
  parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isOverdue = (dateStr, status) => {
  if (!dateStr || ['approved', 'completed', 'rejected'].includes(status)) return false;
  return new Date(dateStr) < new Date();
};

const displayName = (person) => {
  if (!person) return '—';
  if (person.name) return person.name;
  const parts = [person.first_name, person.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '—';
};

// ── Status colour map ─────────────────────────────────────────────────────────
const STATUS_CFG = {
  pending:           { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.3)'  },
  ready_for_review:  { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.3)'  },
  in_progress:       { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.3)'  },
  approved:          { color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.3)'  },
  completed:         { color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.3)'  },
  rejected:          { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.3)'   },
  cancelled:         { color: '#6b7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.3)' },
};

const statusCfg = (status) => STATUS_CFG[status] ?? { color: '#9ca3af', bg: 'rgba(156,163,175,0.08)', border: 'rgba(156,163,175,0.3)' };

// ── Component ─────────────────────────────────────────────────────────────────

const MilestoneCard = ({
  milestone,
  projectId,
  selected = false,
  onSelect,
  canApprove     = false,
  canViewFinance = false,
  isAdmin        = false,
  onEdit,
  onDelete,
  readOnly       = false,
}) => {
  const {
    approveMilestone,
    rejectMilestone,
    customerApproveMilestone,
    loading,
  } = useProjectStore();

  const [expanded,        setExpanded]        = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectNotes,     setRejectNotes]     = useState('');
  const [approvalNotes,   setApprovalNotes]   = useState('');

  const overdue   = isOverdue(milestone.due_date, milestone.status);
  const canAction = canApprove && ['pending', 'ready_for_review'].includes(milestone.status);
  const showFinance = isAdmin || canViewFinance;
  const approvedBy  = milestone.approvedBy ?? milestone.approved_by_user ?? milestone.approved_by;
  const isRejected  = milestone.status === 'rejected';
  const cfg         = statusCfg(milestone.status);

  const desc        = milestone.description || '';
  const isLong      = desc.length > PREVIEW_LIMIT;
  const descPreview = isLong ? desc.slice(0, PREVIEW_LIMIT).trimEnd() + '…' : desc;

  const handleApprove = async () => {
    const action = isAdmin ? approveMilestone : customerApproveMilestone;
    const res = await action(projectId, milestone.id, { approval_notes: approvalNotes || undefined });
    if (res.success) { toast.success('Milestone approved.'); setApprovalNotes(''); }
    else toast.error(res.error || 'Failed to approve.');
  };

  const handleReject = async () => {
    if (!rejectNotes.trim()) return toast.error('Please provide rejection notes.');
    const res = await rejectMilestone(projectId, milestone.id, { approval_notes: rejectNotes });
    if (res.success) { toast.success('Milestone rejected.'); setShowRejectInput(false); setRejectNotes(''); }
    else toast.error(res.error || 'Failed to reject.');
  };

  return (
    <div className="rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(168,85,247,0.2)' }}>

      {/* Status accent bar */}
      <div style={{ height: 3, background: cfg.color, opacity: 0.7 }} />

      {/* ── Main row ── */}
      <div className="bg-white dark:bg-gray-800 px-4 py-3 flex items-start justify-between gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onSelect?.(milestone.id)}
          className="mt-1 w-4 h-4 accent-red-600"
        />

        <div className="min-w-0 flex-1">

          {/* Title + status */}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{milestone.title}</p>

            {/* Colorcoded status pill */}
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full"
              style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
              {milestone.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>

            {overdue && (
              <span className="flex items-center gap-1 text-xs font-medium"
                style={{ color: '#ef4444' }}>
                <AlertCircle className="w-3 h-3" /> Overdue
              </span>
            )}
          </div>

          {/* Description preview */}
          {desc && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              {descPreview}
              {isLong && !expanded && (
                <button type="button" onClick={() => setExpanded(true)}
                  className="ml-1 hover:underline whitespace-nowrap"
                  style={{ color: '#a855f7' }}>
                  Show more
                </button>
              )}
            </p>
          )}

          {/* Key meta */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
            {milestone.due_date ? (
              <span className="flex items-center gap-1 text-xs"
                style={{ color: overdue ? '#ef4444' : '#9ca3af' }}>
                <Calendar className="w-3 h-3" />
                {formatDate(milestone.due_date)}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs italic text-gray-400 dark:text-gray-500">
                <Calendar className="w-3 h-3" /> No due date scheduled
              </span>
            )}

            {showFinance && milestone.amount && (
              <span className="flex items-center gap-1 text-xs font-semibold"
                style={{ color: '#10b981' }}>
                <DollarSign className="w-3 h-3" />
                {money(milestone.amount, milestone.currency)}
              </span>
            )}

            {approvedBy && typeof approvedBy === 'object' && (
              <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                <User className="w-3 h-3" />
                {displayName(approvedBy)}
              </span>
            )}
          </div>
        </div>

        {/* Right: actions + expand */}
        <div className="flex items-center gap-2 shrink-0">
          {!readOnly && (
            <>
              {canAction && (
                <>
                  <button type="button" onClick={handleApprove} disabled={loading.submitting}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-colors disabled:opacity-60"
                    style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(16,185,129,0.18)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(16,185,129,0.1)'}>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                  </button>
                  {isAdmin && (
                    <button type="button"
                      onClick={() => { setShowRejectInput(!showRejectInput); setExpanded(true); }}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg transition-colors"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.15)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}>
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  )}
                </>
              )}
              {onEdit && (
                <button type="button" onClick={() => onEdit(milestone)}
                  className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                  title="Edit">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
              {onDelete && (
                <button type="button" onClick={() => onDelete(milestone)}
                  className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          )}

          <button type="button" onClick={() => setExpanded((v) => !v)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div className="bg-white dark:bg-gray-800 px-4 py-4 space-y-4"
          style={{ borderTop: '1px solid rgba(168,85,247,0.12)' }}>

          {desc && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-1"
                style={{ color: '#c084fc' }}>
                Description
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{desc}</p>
            </div>
          )}

          {/* Detail grid */}
          <div className="rounded-xl overflow-hidden"
            style={{ border: '1px solid rgba(168,85,247,0.15)' }}>
            {/* Grid header */}
            <div style={{ padding: '8px 14px', background: 'rgba(168,85,247,0.06)', borderBottom: '1px solid rgba(168,85,247,0.12)' }}>
              <p style={{ fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a855f7', margin: 0 }}>
                Details
              </p>
            </div>

            <div className="bg-white dark:bg-gray-800">
              {[
                milestone.due_date && {
                  icon: <Calendar className="w-3.5 h-3.5" />, label: 'Due Date',
                  color: overdue ? '#ef4444' : '#3b82f6', bg: overdue ? 'rgba(239,68,68,0.06)' : 'rgba(59,130,246,0.06)',
                  value: <span style={{ color: overdue ? '#ef4444' : undefined }}>{formatDate(milestone.due_date)}{overdue && ' · Overdue'}</span>,
                },
                {
                  icon: <Clock className="w-3.5 h-3.5" />, label: 'Created',
                  color: '#9ca3af', bg: 'transparent',
                  value: formatDateTime(milestone.created_at),
                },
                showFinance && {
                  icon: <DollarSign className="w-3.5 h-3.5" />, label: 'Amount',
                  color: '#10b981', bg: 'rgba(16,185,129,0.06)',
                  value: milestone.amount ? money(milestone.amount, milestone.currency) : '—',
                },
                showFinance && milestone.amount_kes && milestone.currency !== 'KES' && {
                  icon: <DollarSign className="w-3.5 h-3.5" />, label: 'Amount (KES)',
                  color: '#10b981', bg: 'rgba(16,185,129,0.06)',
                  value: (
                    <>
                      {money(milestone.amount_kes, 'KES')}
                      {milestone.exchange_rate_to_kes && (
                        <span style={{ color: '#9ca3af', marginLeft: 6 }}>
                          @ {parseFloat(milestone.exchange_rate_to_kes).toFixed(4)}
                        </span>
                      )}
                    </>
                  ),
                },
                approvedBy && typeof approvedBy === 'object' && {
                  icon: <User className="w-3.5 h-3.5" />, label: isRejected ? 'Rejected By' : 'Approved By',
                  color: isRejected ? '#ef4444' : '#10b981', bg: isRejected ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)',
                  value: displayName(approvedBy),
                },
                milestone.approved_at && {
                  icon: <Clock className="w-3.5 h-3.5" />, label: isRejected ? 'Rejected At' : 'Approved At',
                  color: isRejected ? '#ef4444' : '#10b981', bg: isRejected ? 'rgba(239,68,68,0.06)' : 'rgba(16,185,129,0.06)',
                  value: formatDateTime(milestone.approved_at),
                },
              ].filter(Boolean).map((row, i, arr) => (
                <div key={row.label}
                  style={{
                    display: 'grid', gridTemplateColumns: '150px 1fr',
                    alignItems: 'center', padding: '9px 14px',
                    background: row.bg,
                    borderBottom: i < arr.length - 1 ? '1px solid rgba(168,85,247,0.08)' : 'none',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: row.color }}>{row.icon}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: row.color }}>{row.label}</span>
                  </div>
                  <span className="text-sm text-gray-800 dark:text-gray-200 font-medium">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stored approval / rejection notes */}
          {milestone.approval_notes && (
            <div className="rounded-lg px-3 py-2.5 text-sm"
              style={isRejected
                ? { background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', color: '#b91c1c' }
                : { background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.2)', color: '#6b7280' }
              }>
              <p className="text-xs font-bold uppercase tracking-wide mb-1"
                style={{ color: isRejected ? '#ef4444' : '#a855f7', opacity: 0.85 }}>
                {isRejected ? 'Rejection Notes' : 'Approval Notes'}
              </p>
              <p className="italic">{milestone.approval_notes}</p>
            </div>
          )}

          {/* Inline approval notes input */}
          {canAction && !showRejectInput && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                Approval Notes <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea rows={2} value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Add any notes to accompany this approval..."
                className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none focus:outline-none"
                style={{ border: '1.5px solid rgba(16,185,129,0.3)' }}
                onFocus={e => e.currentTarget.style.borderColor = '#10b981'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(16,185,129,0.3)'}
              />
            </div>
          )}

          {/* Inline reject notes input */}
          {showRejectInput && isAdmin && (
            <div className="space-y-2">
              <label className="block text-xs font-medium" style={{ color: '#ef4444' }}>
                Rejection Reason <span>*</span>
              </label>
              <textarea rows={2} value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="Explain why this milestone is being rejected..."
                className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white resize-none focus:outline-none"
                style={{ border: '1.5px solid rgba(239,68,68,0.3)' }}
                onFocus={e => e.currentTarget.style.borderColor = '#ef4444'}
                onBlur={e => e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'}
              />
              <div className="flex gap-2">
                <button type="button" onClick={handleReject} disabled={loading.submitting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-60"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.18)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}>
                  <XCircle className="w-3.5 h-3.5" />
                  {loading.submitting ? 'Rejecting...' : 'Confirm Reject'}
                </button>
                <button type="button" onClick={() => { setShowRejectInput(false); setRejectNotes(''); }}
                  className="px-3 py-1.5 text-xs rounded-lg transition-colors text-gray-600 dark:text-gray-400"
                  style={{ border: '1px solid rgba(168,85,247,0.2)' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Small helper layout component ─────────────────────────────────────────────
const Detail = ({ icon, label, children }) => (
  <div className="flex flex-col gap-0.5">
    <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
      {icon} {label}
    </span>
    <span className="text-sm text-gray-800 dark:text-gray-200">
      {children}
    </span>
  </div>
);

export default MilestoneCard;