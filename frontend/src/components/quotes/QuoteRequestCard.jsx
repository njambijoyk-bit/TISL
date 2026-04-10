import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Calendar, DollarSign, Clock, AlertCircle, CheckCircle, XCircle, User, Package, Wrench, Layers } from 'lucide-react';

const STATUS_CFG = {
  pending:   { color: '#f59e0b', label: 'Pending' },
  reviewing: { color: '#3b82f6', label: 'Under Review' },
  quoted:    { color: '#10b981', label: 'Quoted' },
  rejected:  { color: '#ef4444', label: 'Rejected' },
  expired:   { color: '#9ca3af', label: 'Expired' },
};
const PRIORITY_CFG = {
  low:    { color: '#9ca3af' },
  medium: { color: '#3b82f6' },
  high:   { color: '#f59e0b' },
  urgent: { color: '#ef4444' },
};
const TYPE_MAP = {
  product:  { label: 'Product',           Icon: Package },
  service:  { label: 'Service',           Icon: Wrench },
  mixed:    { label: 'Product & Service', Icon: Layers },
  not_sure: { label: 'Not Sure',          Icon: AlertCircle },
};

const formatDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const QuoteRequestCard = ({ request, onView, showCustomer = false }) => {
  const statusCfg   = STATUS_CFG[request.status] || { color: '#9ca3af', label: request.status };
  const priorityCfg = request.priority ? PRIORITY_CFG[request.priority] : null;
  const typeCfg     = TYPE_MAP[request.request_type] || { label: request.request_type, Icon: FileText };
  const TypeIcon    = typeCfg.Icon;

  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      style={{ border: '1px solid rgba(168,85,247,0.2)' }}
    >
      {/* Status accent bar */}
      <div style={{ height: 3, background: statusCfg.color, opacity: 0.7 }} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <FileText size={12} className="text-primary flex-shrink-0" />
              <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{request.request_number}</span>
            </div>
            <h3 className="text-base font-regular text-primary leading-snug">{request.request_title}</h3>
            {showCustomer && request.customer && (
              <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400 dark:text-gray-500">
                <User size={11} /> {request.customer.first_name} {request.customer.last_name}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-regular"
              style={{ background: `${statusCfg.color}18`, border: `1px solid ${statusCfg.color}44`, color: statusCfg.color }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusCfg.color }} />
              {request.status_label || statusCfg.label}
            </span>
            {priorityCfg && (
              <span className="text-xs font-regular px-2 py-0.5 rounded-full"
                style={{ background: `${priorityCfg.color}14`, border: `1px solid ${priorityCfg.color}33`, color: priorityCfg.color }}>
                {request.priority_label || request.priority}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        {request.request_description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 line-clamp-2 leading-relaxed">{request.request_description}</p>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-2 mb-3 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1.5"><TypeIcon size={12} color="#c084fc" /> {typeCfg.label}</div>
          <div className="flex items-center gap-1.5"><Calendar size={12} color="#c084fc" /> {formatDate(request.created_at)}</div>
          {request.budget_range && <div className="flex items-center gap-1.5"><DollarSign size={12} color="#c084fc" /> {request.budget_range}</div>}
          {request.timeline_needed && <div className="flex items-center gap-1.5"><Clock size={12} color="#c084fc" /> {request.timeline_needed}</div>}
        </div>

        {/* Items count */}
        {request.requested_items?.length > 0 && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/40 text-xs font-bold text-gray-600 dark:text-gray-400"
            style={{ border: '1px solid rgba(168,85,247,0.15)' }}>
            {request.requested_items.length} {request.requested_items.length === 1 ? 'item' : 'items'} requested
          </div>
        )}

        {/* Alert badges */}
        {request.requires_clarification && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20"
            style={{ border: '1px solid rgba(245,158,11,0.25)' }}>
            <AlertCircle size={13} color="#f59e0b" className="flex-shrink-0" />
            <span className="text-xs font-regular text-amber-800 dark:text-amber-200">Clarification Needed</span>
          </div>
        )}
        {request.quote_id && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20"
            style={{ border: '1px solid rgba(16,185,129,0.25)' }}>
            <CheckCircle size={13} color="#10b981" className="flex-shrink-0" />
            <span className="text-xs font-regular text-emerald-800 dark:text-emerald-200">Quote Created</span>
          </div>
        )}
        {request.status === 'rejected' && request.rejection_reason && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20"
            style={{ border: '1px solid rgba(239,68,68,0.25)' }}>
            <div className="flex items-center gap-2 mb-1">
              <XCircle size={13} color="#ef4444" className="flex-shrink-0" />
              <span className="text-xs font-regular text-red-800 dark:text-red-200">Rejected</span>
            </div>
            <p className="text-xs text-red-700 dark:text-red-300 ml-5">{request.rejection_reason}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          {onView ? (
            <button onClick={() => onView(request)} type="button"
              className="flex-1 py-2 px-3 rounded-xl text-xs font-regular text-center transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)', boxShadow: '0 2px 8px rgba(168,85,247,0.3)', color: '#f7f7f7' }}>
              View Details
            </button>
          ) : (
            <Link to={`/my-quote-requests/${request.id}`}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-regular text-center transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg,#a855f7,#7c3aed)', boxShadow: '0 2px 8px rgba(168,85,247,0.3)', color: '#feffff' }}>
              View Details
            </Link>
          )}
          {request.quote_id && (
            <Link to={showCustomer ? `/admin/quotes/${request.quote_id}` : `/my-quotes/${request.quote_id}`}
              className="flex-1 py-2 px-3 rounded-xl text-xs font-regular text-center transition-opacity hover:opacity-90"
              style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#10b981' }}>
              View Quote
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuoteRequestCard;