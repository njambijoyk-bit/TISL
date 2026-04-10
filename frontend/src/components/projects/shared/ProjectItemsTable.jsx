import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';

// ── Status colour map ─────────────────────────────────────────────────────────
const STATUS_CFG = {
  planned:   { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)',  border: 'rgba(156,163,175,0.3)'  },
  requested: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.3)'   },
  quoted:    { color: '#a855f7', bg: 'rgba(168,85,247,0.1)',   border: 'rgba(168,85,247,0.3)'   },
  approved:  { color: '#10b981', bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)'   },
  ordered:   { color: '#6366f1', bg: 'rgba(99,102,241,0.1)',   border: 'rgba(99,102,241,0.3)'   },
  delivered: { color: '#0891b2', bg: 'rgba(8,145,178,0.1)',    border: 'rgba(8,145,178,0.3)'    },
  completed: { color: '#059669', bg: 'rgba(5,150,105,0.1)',    border: 'rgba(5,150,105,0.3)'    },
  cancelled: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)'    },
};

const statusCfg = (s) => STATUS_CFG[s] ?? { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', border: 'rgba(156,163,175,0.3)' };

const label   = (s) => s?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? '';
const fmt     = (n, d = 2) => parseFloat(n || 0).toFixed(d);
const money   = (n, d = 2) => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const hasKes  = (item) => item.currency !== 'KES' && item.line_total_kes;
const hasVars = (item) => item.variant_details && Object.keys(item.variant_details).length > 0;

// ── Expanded detail row ───────────────────────────────────────────────────────
const ExpandedRow = ({ item, colSpan }) => (
  <tr style={{ background: 'rgba(168,85,247,0.03)', borderBottom: '1px solid rgba(168,85,247,0.12)' }}>
    <td colSpan={colSpan} className="px-5 py-3">
      <div className="flex flex-wrap gap-x-8 gap-y-2.5 text-xs">

        {/* KES conversion */}
        {hasKes(item) && (
          <div className="flex items-start gap-2.5">
            <span className="font-semibold shrink-0 mt-0.5" style={{ color: '#3b82f6' }}>KES Equiv.</span>
            <div className="space-y-0.5" style={{ color: '#3b82f6' }}>
              <div>
                Unit: <strong>KES {money(item.unit_price_kes)}</strong>
                &nbsp;·&nbsp;
                Total: <strong>KES {money(item.line_total_kes)}</strong>
              </div>
              <div style={{ color: '#60a5fa' }}>
                Rate: 1 {item.currency} = {fmt(item.exchange_rate_to_kes, 4)} KES
                {item.converted_currency_at && (
                  <span className="ml-2" style={{ color: '#93c5fd' }}>
                    · converted {new Date(item.converted_currency_at).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Variant details */}
        {hasVars(item) && (
          <div className="flex items-start gap-2.5">
            <span className="font-semibold shrink-0 mt-0.5" style={{ color: '#a855f7' }}>Variants</span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(item.variant_details).map(([k, v]) => (
                <span key={k} className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', color: '#a855f7' }}>
                  <span className="font-bold">{k}:</span> {v}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {item.notes && (
          <div className="flex items-start gap-2.5">
            <span className="font-semibold shrink-0 mt-0.5 text-gray-600 dark:text-gray-300">Notes</span>
            <span className="text-gray-600 dark:text-gray-400">{item.notes}</span>
          </div>
        )}

        {/* Source */}
        {item.source_type && item.source_type !== 'manual' && (
          <div className="flex items-start gap-2.5">
            <span className="font-semibold shrink-0 mt-0.5 text-gray-600 dark:text-gray-300">Source</span>
            <span className="text-gray-600 dark:text-gray-400">{label(item.source_type)} #{item.source_id}</span>
          </div>
        )}
      </div>
    </td>
  </tr>
);

// ── Delete confirm inline ─────────────────────────────────────────────────────
const DeleteConfirmRow = ({ item, colSpan, onConfirm, onCancel }) => (
  <tr style={{ background: 'rgba(239,68,68,0.04)', borderBottom: '1px solid rgba(239,68,68,0.2)' }}>
    <td colSpan={colSpan} className="px-5 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: '#b91c1c' }}>
          Delete <strong>"{item.description}"</strong>? This cannot be undone.
        </p>
        <div className="flex items-center gap-2 ml-4 shrink-0">
          <button type="button" onClick={onCancel}
            className="px-3 py-1.5 text-xs rounded-lg transition-colors text-gray-600 dark:text-gray-300"
            style={{ border: '1px solid rgba(168,85,247,0.2)' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(168,85,247,0.2)'}>
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(item)}
            className="px-3 py-1.5 text-xs rounded-lg transition-colors text-white"
            style={{ background: 'linear-gradient(135deg,#ef4444,#dc2626)', boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }}>
            Yes, Delete
          </button>
        </div>
      </div>
    </td>
  </tr>
);

// ── Main table ────────────────────────────────────────────────────────────────
const ProjectItemsTable = ({ items, loading, onEdit, onDelete, readOnly = false }) => {
  const [expanded,  setExpanded]  = useState(new Set());
  const [confirmId, setConfirmId] = useState(null);

  const toggleExpand = (id) => {
    if (confirmId === id) setConfirmId(null);
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDeleteClick = (item) => {
    setExpanded((prev) => { const next = new Set(prev); next.delete(item.id); return next; });
    setConfirmId(item.id);
  };

  const handleDeleteConfirm = (item) => {
    setConfirmId(null);
    onDelete(item);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <p className="text-sm text-gray-400 dark:text-gray-500 italic py-4 text-center">
        No items added yet.
      </p>
    );
  }

  const totals = items.reduce((acc, item) => {
    const cur = item.currency || 'KES';
    acc[cur] = (acc[cur] || 0) + parseFloat(item.line_total || 0);
    return acc;
  }, {});

  const totalKes = items.reduce((sum, item) => {
    if (item.line_total_kes) return sum + parseFloat(item.line_total_kes);
    if (item.currency === 'KES') return sum + parseFloat(item.line_total || 0);
    return sum;
  }, 0);

  const hasAnyKes    = items.some(hasKes);
  const hasAnyExtras = (item) =>
    hasKes(item) || hasVars(item) || item.notes ||
    (item.source_type && item.source_type !== 'manual');

  const colSpan = 6 + (hasAnyKes ? 1 : 0) + (readOnly ? 0 : 1) + 1;

  return (
    <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(168,85,247,0.2)' }}>
      <table className="w-full text-sm">

        {/* ── Header ── */}
        <thead>
          <tr style={{ borderBottom: '2px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.05)' }}>
            <th className="py-2.5 px-3 w-8" />
            {[
              ['left', 'Description'],
              ['left', 'Type'],
              ['right', 'Qty'],
              ['right', 'Unit Price'],
              ['right', 'Total'],
            ].map(([align, col]) => (
              <th key={col}
                className={`py-2.5 px-3 text-${align} text-xs font-extrabold uppercase tracking-wider`}
                style={{ color: '#a855f7' }}>
                {col}
              </th>
            ))}
            {hasAnyKes && (
              <th className="text-right py-2.5 px-3 text-xs font-extrabold uppercase tracking-wider"
                style={{ color: '#3b82f6' }}>
                KES Total
              </th>
            )}
            <th className="text-left py-2.5 px-3 text-xs font-extrabold uppercase tracking-wider"
              style={{ color: '#a855f7' }}>
              Status
            </th>
            {!readOnly && <th className="py-2.5 px-3 w-20" />}
          </tr>
        </thead>

        <tbody>
          {items.map((item) => {
            const isExpanded = expanded.has(item.id);
            const isConfirm  = confirmId === item.id;
            const canExpand  = hasAnyExtras(item);
            const scfg       = statusCfg(item.status);

            return [
              // ── Main row
              <tr key={item.id}
                onClick={() => canExpand && !isConfirm && toggleExpand(item.id)}
                className={`transition-colors ${canExpand && !isConfirm ? 'cursor-pointer' : ''}`}
                style={{
                  borderBottom: '1px solid rgba(168,85,247,0.1)',
                  background: isExpanded ? 'rgba(168,85,247,0.03)' : undefined,
                }}
                onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(168,85,247,0.02)'; }}
                onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = ''; }}
              >
                {/* Expand chevron */}
                <td className="py-3 px-3" style={{ color: '#c084fc' }}>
                  {canExpand && !isConfirm && (
                    isExpanded
                      ? <ChevronUp className="w-3.5 h-3.5" />
                      : <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </td>

                {/* Description */}
                <td className="py-3 px-3">
                  <p className="text-gray-900 dark:text-white font-medium truncate max-w-[220px]">
                    {item.description}
                  </p>
                </td>

                {/* Type */}
                <td className="py-3 px-3 text-xs whitespace-nowrap" style={{ color: '#9ca3af' }}>
                  {label(item.item_type)}
                </td>

                {/* Qty */}
                <td className="py-3 px-3 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {fmt(item.quantity)} {item.unit_of_measure}
                </td>

                {/* Unit Price */}
                <td className="py-3 px-3 text-right text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {item.currency} {money(item.unit_price)}
                </td>

                {/* Line Total */}
                <td className="py-3 px-3 text-right font-bold whitespace-nowrap" style={{ color: '#a855f7' }}>
                  {item.currency} {money(item.line_total)}
                </td>

                {/* KES Total */}
                {hasAnyKes && (
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    {hasKes(item)
                      ? <span className="font-semibold" style={{ color: '#3b82f6' }}>KES {money(item.line_total_kes)}</span>
                      : <span className="text-xs" style={{ color: '#a855f7' }}>{item.currency} {money(item.line_total)}</span>
                    }
                  </td>
                )}

                {/* Status pill */}
                <td className="py-3 px-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-0.5 rounded-full"
                    style={{ color: scfg.color, background: scfg.bg, border: `1px solid ${scfg.border}` }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: scfg.color, flexShrink: 0 }} />
                    {label(item.status)}
                  </span>
                </td>

                {/* Actions */}
                {!readOnly && (
                  <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {onEdit && (
                        <button onClick={() => { setConfirmId(null); onEdit(item); }} title="Edit item"
                          className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-primary-600 hover:bg-primary-50
                            dark:hover:text-primary-400 dark:hover:bg-primary-900/20">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {onDelete && (
                        <button onClick={() => handleDeleteClick(item)} title="Delete item"
                          className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-red-600 hover:bg-red-50
                            dark:hover:text-red-400 dark:hover:bg-red-900/20">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>,

              // ── Delete confirm row
              isConfirm && (
                <DeleteConfirmRow
                  key={`${item.id}-confirm`}
                  item={item} colSpan={colSpan}
                  onConfirm={handleDeleteConfirm}
                  onCancel={() => setConfirmId(null)}
                />
              ),

              // ── Expanded detail row
              isExpanded && canExpand && (
                <ExpandedRow key={`${item.id}-expanded`} item={item} colSpan={colSpan} />
              ),
            ];
          })}
        </tbody>

        {/* ── Footer totals ── */}
        <tfoot>
          <tr style={{ borderTop: '2px solid rgba(168,85,247,0.2)', background: 'rgba(168,85,247,0.05)' }}>
            <td colSpan={readOnly ? 5 : 6}
              className="py-2.5 px-3 text-right text-sm font-bold"
              style={{ color: '#a855f7' }}>
              Total
            </td>
            <td className="py-2.5 px-3 text-right font-extrabold whitespace-nowrap" style={{ color: '#a855f7' }}>
              {Object.entries(totals).map(([cur, amt]) => (
                <div key={cur}>{cur} {money(amt)}</div>
              ))}
            </td>
            {hasAnyKes && (
              <td className="py-2.5 px-3 text-right font-extrabold whitespace-nowrap" style={{ color: '#3b82f6' }}>
                KES {money(totalKes)}
              </td>
            )}
            <td />{/* status col */}
            {!readOnly && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default ProjectItemsTable;