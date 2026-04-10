import { useState } from 'react';
import toast from 'react-hot-toast';
import { ExternalLink, Link2, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import useProjectStore from '../../../store/projectStore';
import LinkProjectModal from './LinkProjectModal';

const TYPE_LABELS = {
  quote_request: 'Quote Request',
  quote:         'Quote',
  order:         'Order',
};

// Type pills — visible on both themes (colored text + tinted fill)
const TYPE_PILL = {
  quote_request: { color: '#60a5fa', bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.28)'  },
  quote:         { color: '#c084fc', bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.28)'  },
  order:         { color: '#6ee7b7', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.28)'  },
};

// Relation pills
const RELATION_PILL = {
  primary:  { color: 'var(--color-text-secondary)', bg: 'var(--color-background-secondary)', border: 'var(--color-border-tertiary)' },
  addendum: { color: '#fcd34d', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  },
  revision: { color: '#fdba74', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.3)'  },
  phase:    { color: '#c084fc', bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.28)' },
};

// Status colors — mid-range, readable on both light and dark
const STATUS_COLOR = {
  pending:    '#d97706',
  reviewing:  '#2563eb',
  draft:      'var(--color-text-secondary)',
  sent:       '#2563eb',
  approved:   '#059669',
  quoted:     '#7c3aed',
  converted:  '#059669',
  confirmed:  '#2563eb',
  processing: '#4338ca',
  shipped:    '#0d9488',
  delivered:  '#0d9488',
  completed:  '#059669',
  cancelled:  '#dc2626',
  rejected:   '#dc2626',
};

const typeLabel = (t) =>
  t?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? '';

const docRoute = (linkType, linkId) => {
  if (linkType === 'quote_request') return `/admin/quote-requests/${linkId}`;
  if (linkType === 'quote')         return `/admin/quotes/${linkId}`;
  if (linkType === 'order')         return `/admin/orders/${linkId}`;
  return '#';
};

// ─────────────────────────────────────────────────────────────────────────────

const ProjectLinksPanel = ({ project }) => {
  const { links, loading, deleteLink } = useProjectStore();
  const [showAdd,       setShowAdd]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const res = await deleteLink(project.id, confirmDelete.id);
    if (res.success) toast.success('Link removed.');
    else             toast.error(res.error || 'Failed to remove link.');
    setConfirmDelete(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link2 style={{ width: 14, height: 14, color: '#a855f7' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c084fc' }}>
            Linked Documents{' '}
            <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              ({links.length})
            </span>
          </span>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', fontSize: '0.72rem', fontWeight: 700,
            borderRadius: 8, border: 'none', cursor: 'pointer',
            color: 'white',
            background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
            boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
            transition: 'box-shadow 150ms',
          }}
          onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.45)'}
          onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(168,85,247,0.3)'}>
          + Link Document
        </button>
      </div>

      {/* ── Skeleton ── */}
      {loading.links ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{
              height: 64, borderRadius: 12,
              background: 'rgba(168,85,247,0.06)',
              border: '1px solid rgba(168,85,247,0.1)',
            }} />
          ))}
        </div>

      ) : links.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic', margin: 0 }}>
          No documents linked yet. Attach a quote request, quote, or order.
        </p>

      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {links.map((link) => {
            const summary  = link.linked_model_summary;
            const name     = summary?.name;
            const title    = summary?.title;
            const docNum   = summary?.document_number ?? link.name ?? `#${link.link_id}`;
            const status   = summary?.status;
            const custName = summary?.customer_name;

            const primaryText   = name || title || docNum;
            const secondaryText = primaryText !== docNum ? docNum : null;

            const tpill = TYPE_PILL[link.link_type]   ?? { color: 'var(--color-text-secondary)', bg: 'var(--color-background-secondary)', border: 'var(--color-border-tertiary)' };
            const rpill = RELATION_PILL[link.relation] ?? RELATION_PILL.primary;

            return (
              <div key={link.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  gap: 12, padding: '12px 14px', borderRadius: 12,
                  border: '1px solid rgba(168,85,247,0.18)',
                  background: 'rgba(168,85,247,0.03)',
                  transition: 'border-color 160ms, background 160ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.35)'; e.currentTarget.style.background = 'rgba(168,85,247,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.background = 'rgba(168,85,247,0.03)'; }}>

                {/* Left */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0 }}>

                  {/* Type pill */}
                  <span style={{
                    flexShrink: 0, marginTop: 1,
                    fontSize: '0.67rem', fontWeight: 700,
                    color: tpill.color, background: tpill.bg, border: `1px solid ${tpill.border}`,
                    padding: '2px 8px', borderRadius: 20,
                    whiteSpace: 'nowrap',
                  }}>
                    {TYPE_LABELS[link.link_type] || typeLabel(link.link_type)}
                  </span>

                  <div style={{ minWidth: 0 }}>
                    {/* Primary title — clickable */}
                    <a
                      href={docRoute(link.link_type, link.link_id)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: '0.84rem', fontWeight: 600,
                        color: '#a855f7', textDecoration: 'none',
                        transition: 'color 120ms',
                      }}
                      onMouseEnter={e => e.currentTarget.style.color = '#c084fc'}
                      onMouseLeave={e => e.currentTarget.style.color = '#a855f7'}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                        {primaryText}
                      </span>
                      <ExternalLink style={{ width: 11, height: 11, opacity: 0.6, flexShrink: 0 }} />
                    </a>

                    {/* Document number */}
                    {secondaryText && (
                      <p style={{
                        fontSize: '0.7rem', fontFamily: 'monospace',
                        color: 'var(--color-text-secondary)',
                        margin: '2px 0 0',
                      }}>
                        {secondaryText}
                      </p>
                    )}

                    {/* Meta row: customer · status · relation */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      {custName && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                          {custName}
                        </span>
                      )}
                      {status && (
                        <span style={{
                          fontSize: '0.72rem', fontWeight: 600,
                          color: STATUS_COLOR[status] ?? 'var(--color-text-secondary)',
                        }}>
                          · {typeLabel(status)}
                        </span>
                      )}
                      <span style={{
                        fontSize: '0.67rem', fontWeight: 700,
                        color: rpill.color, background: rpill.bg, border: `1px solid ${rpill.border}`,
                        padding: '1px 7px', borderRadius: 20,
                      }}>
                        {typeLabel(link.relation)}
                      </span>
                    </div>

                    {/* Notes */}
                    {link.notes && (
                      <p style={{
                        fontSize: '0.71rem', color: 'var(--color-text-secondary)',
                        marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280,
                      }}>
                        {link.notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Remove button */}
                <button
                  onClick={() => setConfirmDelete(link)}
                  style={{
                    flexShrink: 0, padding: 5, borderRadius: 7,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--color-text-secondary)',
                    display: 'flex', alignItems: 'center',
                    transition: 'color 120ms, background 120ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}>
                  <Trash2 style={{ width: 13, height: 13 }} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Add modal ── */}
      {showAdd && (
        <LinkProjectModal project={project} onClose={() => setShowAdd(false)} />
      )}

      {/* ── Delete confirm modal ── */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
          padding: 16,
        }}>
          <div style={{
            width: '100%', maxWidth: 380, borderRadius: 16, overflow: 'hidden',
            background: '#0f0d1a',
            border: '1px solid rgba(168,85,247,0.25)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          }}>
            {/* Red accent strip */}
            <div style={{ height: 3, background: 'linear-gradient(90deg,#ef4444,#dc2626)' }} />

            <div style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <AlertTriangle style={{ width: 16, height: 16, color: '#f87171' }} />
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0' }}>
                  Remove Link
                </span>
              </div>

              <p style={{ fontSize: '0.82rem', color: '#9ca3af', lineHeight: 1.6, marginBottom: 20 }}>
                Remove{' '}
                <strong style={{ color: '#c084fc' }}>
                  {confirmDelete.linked_model_summary?.title
                    || confirmDelete.linked_model_summary?.document_number
                    || `${TYPE_LABELS[confirmDelete.link_type]} #${confirmDelete.link_id}`}
                </strong>{' '}
                from this project?
              </p>

              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: 10,
                paddingTop: 16, borderTop: '1px solid rgba(168,85,247,0.12)',
              }}>
                <button
                  onClick={() => setConfirmDelete(null)}
                  style={{
                    padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600,
                    borderRadius: 8, cursor: 'pointer',
                    color: '#9ca3af', background: 'transparent',
                    border: '1px solid rgba(168,85,247,0.22)',
                    transition: 'border-color 150ms, color 150ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)'; e.currentTarget.style.color = '#c084fc'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.color = '#9ca3af'; }}>
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading.submitting}
                  style={{
                    padding: '6px 14px', fontSize: '0.8rem', fontWeight: 700,
                    borderRadius: 8, border: 'none', cursor: 'pointer',
                    color: '#fff',
                    background: 'linear-gradient(135deg,#ef4444,#dc2626)',
                    boxShadow: '0 2px 10px rgba(239,68,68,0.35)',
                    opacity: loading.submitting ? 0.6 : 1,
                    display: 'flex', alignItems: 'center', gap: 6,
                    transition: 'box-shadow 150ms',
                  }}
                  onMouseEnter={e => { if (!loading.submitting) e.currentTarget.style.boxShadow = '0 4px 16px rgba(239,68,68,0.5)'; }}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(239,68,68,0.35)'}>
                  {loading.submitting && <Loader2 style={{ width: 12, height: 12 }} />}
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectLinksPanel;