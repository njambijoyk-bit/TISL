import { useRef, useState } from 'react';
import {
  Circle, CheckCircle2, ChevronDown, ChevronUp,
  User, Calendar, Link2, AlertCircle, Pencil, Trash2,
  Clock, Tag, Flag, ExternalLink, Check, Loader2,
} from 'lucide-react';
import TaskStatusBadge from '../../admin/TaskStatusBadge';
import ProjectPriorityBadge from '../../admin/ProjectPriorityBadge';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TYPE_LABEL = {
  quote_request: 'Quote Request',
  quote:         'Quote',
  order:         'Order',
  project_item:  'Project Item',
  milestone:     'Milestone',
};

const PRIORITY_COLOR = {
  low:    'text-gray-400 dark:text-gray-500',
  medium: 'text-blue-500 dark:text-blue-400',
  high:   'text-orange-500 dark:text-orange-400',
  urgent: 'text-red-500 dark:text-red-400',
};

const STATUS_PILL = {
  todo:    { bg: 'rgba(156,163,175,0.22)', border: 'rgba(156,163,175,0.45)', glow: 'rgba(156,163,175,0.12)' },
  doing:   { color: '#3b82f6', bg: 'rgba(99,102,241,0.28)',  border: 'rgba(99,102,241,0.55)',  glow: 'rgba(99,102,241,0.15)'  },
  blocked: { color: '#ef4444', bg: 'rgba(239,68,68,0.25)',   border: 'rgba(239,68,68,0.5)',    glow: 'rgba(239,68,68,0.12)' },
  done:    { color: '#10b981', bg: 'rgba(16,185,129,0.22)',  border: 'rgba(16,185,129,0.5)',   glow: 'rgba(16,185,129,0.12)' },
};

const STATUS_ICON = {
  todo:    <Circle style={{ width: 10, height: 10 }} />,
  doing:   <Clock style={{ width: 10, height: 10 }} />,
  blocked: <AlertCircle style={{ width: 10, height: 10 }} />,
  done:    <CheckCircle2 style={{ width: 10, height: 10 }} />,
};

const STATUS_OPTIONS = [
  { value: 'todo',    label: 'To Do'   },
  { value: 'doing',   label: 'Doing'   },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done',    label: 'Done'    },
];

const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Low'    },
  { value: 'medium', label: 'Medium' },
  { value: 'high',   label: 'High'   },
  { value: 'urgent', label: 'Urgent' },
];

const PRIORITY_DOT = {
  low:    '#6b7280',
  medium: '#3b82f6',
  high:   '#f59e0b',
  urgent: '#ef4444',
};

const formatDate = (dateStr) => {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' at '
    + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

const isOverdue = (dateStr, status) => {
  if (!dateStr || status === 'done') return false;
  return new Date(dateStr) < new Date();
};

const resolveRelation = (task) => {
  if (!task.related_type || !task.related_id) return null;
  const summary = task.related_model_summary ?? null;
  const typeKey = task.related_type;
  const id      = task.related_id;
  const name    = summary?.name;
  const title   = summary?.title;
  const docNum  = summary?.document_number ?? `#${id}`;
  const primaryText   = name || title || docNum;
  const secondaryText = primaryText !== docNum ? docNum : null;
  const status  = summary?.status;
  const route = (() => {
    if (typeKey === 'quote_request') return `/admin/quote-requests/${id}`;
    if (typeKey === 'quote')         return `/admin/quotes/${id}`;
    if (typeKey === 'order')         return `/admin/orders/${id}`;
    return null;
  })();
  return { typeKey, primaryText, secondaryText, status, route };
};

// ── RelationChip ──────────────────────────────────────────────────────────────

const RelationChip = ({ relation }) => {
  const { typeKey, primaryText, route } = relation;
  const label = `${TYPE_LABEL[typeKey] ?? typeKey.replace(/_/g, ' ')}: ${primaryText}`;
  const inner = (
    <span style={{
      display: 'flex', alignItems: 'center', gap: 5,
      fontSize: '0.7rem', fontWeight: 500, letterSpacing: '0.01em',
      color: '#c084fc', background: 'rgba(168,85,247,0.08)',
      border: '1px solid rgba(168,85,247,0.2)',
      padding: '2px 8px', borderRadius: 20,
    }}>
      <Link2 style={{ width: 10, height: 10, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{label}</span>
      {route && <ExternalLink style={{ width: 9, height: 9, flexShrink: 0, opacity: 0.6 }} />}
    </span>
  );
  if (route) {
    return (
      <a href={route} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
        style={{ textDecoration: 'none' }}>
        {inner}
      </a>
    );
  }
  return inner;
};

// ── RelationDetail ────────────────────────────────────────────────────────────

const STATUS_TEXT = {
  pending:          '#f59e0b',
  reviewing:        '#60a5fa',
  draft:            '#9ca3af',
  sent:             '#60a5fa',
  approved:         '#34d399',
  quoted:           '#c084fc',
  converted:        '#34d399',
  rejected:         '#f87171',
  confirmed:        '#60a5fa',
  processing:       '#818cf8',
  completed:        '#34d399',
  cancelled:        '#f87171',
  pending_approval: '#fb923c',
};

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '';

const RelationDetail = ({ relation }) => {
  const { typeKey, primaryText, secondaryText, status, route } = relation;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: '0.7rem', color: '#9ca3af', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {TYPE_LABEL[typeKey] ?? cap(typeKey)}
      </span>
      {route ? (
        <a href={route} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.82rem', fontWeight: 600,
            color: '#c084fc', textDecoration: 'none' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{primaryText}</span>
          <ExternalLink style={{ width: 11, height: 11, flexShrink: 0, opacity: 0.7 }} />
        </a>
      ) : (
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{primaryText}</span>
      )}
      {(secondaryText || status) && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.7rem', fontFamily: 'monospace', color: '#6b7280' }}>
          {secondaryText && <span>{secondaryText}</span>}
          {status && (
            <span style={{ fontStyle: 'normal', fontFamily: 'inherit', fontWeight: 600, color: STATUS_TEXT[status] ?? '#9ca3af' }}>
              · {cap(status)}
            </span>
          )}
        </span>
      )}
    </div>
  );
};

// ── InlineSelect ──────────────────────────────────────────────────────────────

const InlineSelect = ({ options, current, saving, onSelect, renderOption, renderTrigger }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useState(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = async (value) => {
    if (value === current) { setOpen(false); return; }
    setOpen(false);
    await onSelect(value);
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}
      className="group/inline">
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {renderTrigger(current)}
      </span>
      <button type="button" disabled={saving}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          opacity: 0, padding: '2px', borderRadius: 4, background: 'transparent',
          border: 'none', cursor: 'pointer', color: '#9ca3af', transition: 'opacity 150ms, color 150ms',
        }}
        className="group-hover/inline:!opacity-100"
        title="Change">
        {saving
          ? <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />
          : <Pencil style={{ width: 11, height: 11 }} />}
      </button>

      {open && (
        <div onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', left: 0, top: '100%', marginTop: 6, zIndex: 40,
            minWidth: 148, borderRadius: 10, overflow: 'hidden',
            background: '#1e1b2e',
            border: '1px solid rgba(168,85,247,0.3)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(168,85,247,0.08)',
          }}>
          {options.map((opt) => (
            <button key={opt.value} type="button" onClick={() => handleSelect(opt.value)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 8, padding: '8px 12px', background: 'transparent', border: 'none',
                cursor: 'pointer', fontSize: '0.8rem', color: '#e2e8f0', textAlign: 'left',
                transition: 'background 120ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(168,85,247,0.1)'; e.currentTarget.style.color = '#f1f5f9'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#e2e8f0'; }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {renderOption(opt.value, opt.label)}
              </span>
              {opt.value === current && (
                <Check style={{ width: 12, height: 12, color: '#a855f7', flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── TaskCard ──────────────────────────────────────────────────────────────────

const TaskCard = ({
  task,
  onEdit,
  onDelete,
  onStatusChange,
  onUpdate,
  readOnly = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [savingField, setSavingField] = useState(null);
  const [hovered, setHovered] = useState(false);

  const isDone  = task.status === 'done';
  const overdue = isOverdue(task.due_date, task.status);
  const desc    = task.description || '';

  const handleToggle = () => {
    if (readOnly || !onStatusChange) return;
    onStatusChange(task, isDone ? 'todo' : 'done');
  };

  const handleFieldSave = async (field, value) => {
    if (!onUpdate) return;
    setSavingField(field);
    try {
      const res = await onUpdate(task, { [field]: value });
      if (res && !res.success) console.error(res.error);
    } finally {
      setSavingField(null);
    }
  };

  const assigneeName = task.assigned_to
    ? (task.assigned_to?.name
        ?? task.assigned_to_user?.name
        ?? `User #${typeof task.assigned_to === 'object' ? task.assigned_to?.id : task.assigned_to}`)
    : null;

  const relation = resolveRelation(task);
  const canEdit  = !readOnly && !!onUpdate;

  const pill = STATUS_PILL[task.status] ?? STATUS_PILL.todo;

  // Card border: glows on hover, stronger for active tasks
  const borderColor = hovered
    ? 'rgba(168,85,247,0.5)'
    : isDone
    ? 'rgba(168,85,247,0.1)'
    : 'rgba(168,85,247,0.22)';

  const cardBg = isDone
    ? 'rgba(168,85,247,0.02)'
    : hovered
    ? 'rgba(168,85,247,0.04)'
    : 'transparent';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: 14,
        border: `1px solid ${borderColor}`,
        background: cardBg,
        boxShadow: hovered && !isDone
          ? '0 0 0 3px rgba(168,85,247,0.07), 0 4px 20px rgba(168,85,247,0.08)'
          : 'none',
        transition: 'border-color 180ms ease, box-shadow 180ms ease, background 180ms ease',
        overflow: 'hidden',
      }}>

      {/* ── Status accent strip ── */}
      <div style={{
        height: 2,
        background: `linear-gradient(90deg, ${pill.color}55, ${pill.color}22, transparent)`,
        transition: 'opacity 200ms',
        opacity: hovered ? 1 : 0.6,
      }} />

      {/* ── Main row ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px 12px' }}>

        {/* Checkbox toggle */}
        {!readOnly && onDelete && (
          <button type="button" onClick={handleToggle}
            disabled={readOnly || !onStatusChange}
            title={isDone ? 'Mark as to do' : 'Mark as done'}
            style={{
              marginTop: 2, flexShrink: 0, background: 'none', border: 'none',
              cursor: readOnly || !onStatusChange ? 'default' : 'pointer',
              color: isDone ? '#34d399' : hovered ? '#c084fc' : '#4b5563',
              opacity: readOnly || !onStatusChange ? 0.4 : 1,
              transition: 'color 150ms',
              padding: 0,
            }}>
            {isDone
              ? <CheckCircle2 style={{ width: 18, height: 18 }} />
              : <Circle style={{ width: 18, height: 18 }} />}
          </button>
        )}

        {/* Content */}
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.9rem', fontWeight: 600, lineHeight: 1.35,
              textDecoration: isDone ? 'line-through' : 'none',
              color: isDone ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
              letterSpacing: '-0.01em',
              transition: 'color 150ms',
            }}>
              {task.title}
            </span>
            {(task.priority === 'high' || task.priority === 'urgent') && (
              <span title={`${task.priority} priority`}
                style={{ color: PRIORITY_COLOR[task.priority]?.includes('orange') ? '#fb923c' : '#f87171', flexShrink: 0 }}>
                <Flag style={{ width: 11, height: 11, fill: 'currentColor' }} />
              </span>
            )}
            {overdue && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 3,
                fontSize: '0.7rem', fontWeight: 600, color: '#f87171',
                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                padding: '1px 7px', borderRadius: 20, flexShrink: 0,
              }}>
                <AlertCircle style={{ width: 9, height: 9 }} /> Overdue
              </span>
            )}
          </div>

          {/* Description */}
          {desc && !expanded && (
            <p style={{
              fontSize: '0.76rem', color: '#6b7280', marginTop: 3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              lineHeight: 1.5,
            }}>{desc}</p>
          )}

          {/* Meta pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
            {/* Status pill */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.02em',
              color: pill.color, background: pill.bg,
              border: `1px solid ${pill.border}`,
              padding: '3px 9px', borderRadius: 20,
              boxShadow: hovered ? `0 0 8px ${pill.glow}` : 'none',
              transition: 'box-shadow 180ms',
            }}>
              {STATUS_ICON[task.status]}
              {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
            </span>

            {/* Priority pill */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: '0.7rem', fontWeight: 600,
              color: PRIORITY_DOT[task.priority] ?? '#9ca3af',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              padding: '3px 9px', borderRadius: 20,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: PRIORITY_DOT[task.priority] ?? '#9ca3af',
              }} />
              {task.priority?.charAt(0).toUpperCase() + task.priority?.slice(1)}
            </span>

            {task.due_date && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: '0.7rem', fontWeight: 500,
                color: overdue ? '#f87171' : '#6b7280',
              }}>
                <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} />
                {formatDate(task.due_date)}
              </span>
            )}

            {assigneeName && !readOnly && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: '0.7rem', color: '#6b7280',
              }}>
                <User style={{ width: 11, height: 11, flexShrink: 0 }} /> {assigneeName}
              </span>
            )}
          </div>
        </div>

        {/* Relation chip */}
        {relation && (
          <div style={{ flexShrink: 0, marginLeft: 8 }}>
            <RelationChip relation={relation} />
          </div>
        )}

        {/* Right action buttons */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 150ms',
        }}>
          {!readOnly && onEdit && (
            <button type="button" onClick={() => onEdit(task)} title="Edit"
              style={actionBtnStyle}
              onMouseEnter={e => e.currentTarget.style.color = '#c084fc'}
              onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}>
              <Pencil style={{ width: 13, height: 13 }} />
            </button>
          )}
          {!readOnly && onDelete && (
            <button type="button" onClick={() => onDelete(task)} title="Delete"
              style={actionBtnStyle}
              onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#6b7280'; e.currentTarget.style.background = 'transparent'; }}>
              <Trash2 style={{ width: 13, height: 13 }} />
            </button>
          )}
          <button type="button" onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Collapse' : 'Expand'}
            style={{ ...actionBtnStyle, opacity: 1, color: expanded ? '#a855f7' : '#6b7280' }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
            onMouseLeave={e => e.currentTarget.style.color = expanded ? '#a855f7' : '#6b7280'}>
            {expanded ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />}
          </button>
        </div>
      </div>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div style={{
          padding: '16px 20px 18px',
          borderTop: '1px solid rgba(168,85,247,0.12)',
          background: 'rgba(168,85,247,0.03)',
        }}>
          {desc && (
            <div style={{ marginBottom: 16 }}>
              <p style={{
                fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: '#7c3aed', marginBottom: 6,
              }}>Description</p>
              <p style={{
                fontSize: '0.83rem', color: 'var(--color-text-primary)', lineHeight: 1.65,
                padding: '10px 14px',
                background: 'rgba(168,85,247,0.06)',
                border: '1px solid rgba(168,85,247,0.12)',
                borderRadius: 9,
              }}>{desc}</p>
            </div>
          )}

          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            gap: '12px 24px',
          }}>
            <DetailRow icon={<Tag style={{ width: 12, height: 12 }} />} label="Status">
              {canEdit ? (
                <InlineSelect
                  options={STATUS_OPTIONS}
                  current={task.status}
                  saving={savingField === 'status'}
                  onSelect={(v) => handleFieldSave('status', v)}
                  renderTrigger={(val) => {
                    const p = STATUS_PILL[val] ?? STATUS_PILL.todo;
                    return (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: '0.7rem', fontWeight: 700,
                        color: p.color, background: p.bg,
                        border: `1px solid ${p.border}`,
                        padding: '3px 9px', borderRadius: 20,
                      }}>
                        {STATUS_ICON[val]}
                        {val.charAt(0).toUpperCase() + val.slice(1)}
                      </span>
                    );
                  }}
                  renderOption={(val) => {
                    const p = STATUS_PILL[val] ?? STATUS_PILL.todo;
                    return (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        fontSize: '0.7rem', fontWeight: 700,
                        color: p.color, background: p.bg,
                        border: `1px solid ${p.border}`,
                        padding: '2px 8px', borderRadius: 20,
                      }}>
                        {STATUS_ICON[val]}
                        {val.charAt(0).toUpperCase() + val.slice(1)}
                      </span>
                    );
                  }}
                />
              ) : (
                <TaskStatusBadge status={task.status} />
              )}
            </DetailRow>

            <DetailRow icon={<Flag style={{ width: 12, height: 12 }} />} label="Priority">
              {canEdit ? (
                <InlineSelect
                  options={PRIORITY_OPTIONS}
                  current={task.priority}
                  saving={savingField === 'priority'}
                  onSelect={(v) => handleFieldSave('priority', v)}
                  renderTrigger={(val) => (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: '0.7rem', fontWeight: 600,
                      color: PRIORITY_DOT[val] ?? '#9ca3af',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      padding: '3px 9px', borderRadius: 20,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_DOT[val] ?? '#9ca3af' }} />
                      {val.charAt(0).toUpperCase() + val.slice(1)}
                    </span>
                  )}
                  renderOption={(val, label) => (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_DOT[val] ?? '#9ca3af', flexShrink: 0 }} />
                      <span style={{ color: '#e2e8f0' }}>{label}</span>
                    </span>
                  )}
                />
              ) : (
                <ProjectPriorityBadge priority={task.priority} showDot />
              )}
            </DetailRow>

            {task.due_date && (
              <DetailRow icon={<Calendar style={{ width: 12, height: 12 }} />} label="Due Date"
                valueColor={overdue ? '#f87171' : undefined}>
                {formatDate(task.due_date)}{overdue && ' — Overdue'}
              </DetailRow>
            )}

            {task.created_at && (
              <DetailRow icon={<Clock style={{ width: 12, height: 12 }} />} label="Created">
                {formatDateTime(task.created_at)}
              </DetailRow>
            )}
            {task.updated_at && (
              <DetailRow icon={<Clock style={{ width: 12, height: 12 }} />} label="Updated">
                {formatDateTime(task.updated_at)}
              </DetailRow>
            )}

            {assigneeName && !readOnly && (
              <DetailRow icon={<User style={{ width: 12, height: 12 }} />} label="Assigned To">
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: 'rgba(168,85,247,0.15)',
                    border: '1px solid rgba(168,85,247,0.3)',
                    color: '#c084fc', fontSize: '0.7rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    {assigneeName.charAt(0)}
                  </span>
                  {assigneeName}
                </span>
              </DetailRow>
            )}

            {relation && (
              <DetailRow icon={<Link2 style={{ width: 12, height: 12 }} />} label="Related To">
                <RelationDetail relation={relation} />
              </DetailRow>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Shared styles ─────────────────────────────────────────────────────────────

const actionBtnStyle = {
  padding: '5px', borderRadius: 7, background: 'transparent',
  border: 'none', cursor: 'pointer', color: '#6b7280',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'color 120ms, background 120ms',
};

// ── DetailRow ─────────────────────────────────────────────────────────────────

const DetailRow = ({ icon, label, children, valueColor }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span style={{
      display: 'flex', alignItems: 'center', gap: 5,
      fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
      letterSpacing: '0.08em', color: '#7c3aed',
    }}>
      {icon} {label}
    </span>
    <span style={{ fontSize: '0.82rem', color: valueColor ?? 'var(--color-text-primary)', fontWeight: 500 }}>
      {children}
    </span>
  </div>
);

export default TaskCard;