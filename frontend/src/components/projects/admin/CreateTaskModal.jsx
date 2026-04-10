import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { X, Search, Loader2, ChevronDown, ChevronUp, User, Link2 } from 'lucide-react';
import useProjectStore from '../../../store/projectStore';
import { getAdminQuoteRequests } from '../../../api/quoteRequests';
import { getAllQuotes } from '../../../api/quotes';
import ordersAPI from '../../../api/orders';

// ── Constants ─────────────────────────────────────────────────────────────────

const RELATED_TYPES = ['quote_request', 'quote', 'order', 'project_item', 'milestone'];
const TYPE_LABEL    = { quote_request: 'Quote Request', quote: 'Quote', order: 'Order', project_item: 'Project Item', milestone: 'Milestone' };

const STATUS_BADGE = {
  pending:         { bg: 'rgba(234,179,8,0.12)',   color: '#b45309' },
  reviewing:       { bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8' },
  draft:           { bg: 'rgba(107,114,128,0.12)', color: '#4b5563' },
  sent:            { bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8' },
  approved:        { bg: 'rgba(34,197,94,0.12)',   color: '#15803d' },
  quoted:          { bg: 'rgba(168,85,247,0.12)',  color: '#7c3aed' },
  converted:       { bg: 'rgba(16,185,129,0.12)',  color: '#065f46' },
  rejected:        { bg: 'rgba(239,68,68,0.12)',   color: '#b91c1c' },
  confirmed:       { bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8' },
  processing:      { bg: 'rgba(99,102,241,0.12)',  color: '#4338ca' },
  completed:       { bg: 'rgba(16,185,129,0.12)',  color: '#065f46' },
  cancelled:       { bg: 'rgba(239,68,68,0.12)',   color: '#b91c1c' },
  pending_approval:{ bg: 'rgba(249,115,22,0.12)',  color: '#c2410c' },
  todo:            { bg: 'rgba(107,114,128,0.12)', color: '#4b5563' },
  doing:           { bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8' },
  blocked:         { bg: 'rgba(239,68,68,0.12)',   color: '#b91c1c' },
  done:            { bg: 'rgba(34,197,94,0.12)',   color: '#15803d' },
};

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', padding: '7px 11px', borderRadius: 8, fontSize: '0.82rem',
  background: 'rgba(168,85,247,0.04)',
  border: '1.5px solid rgba(168,85,247,0.18)',
  color: '#111827', outline: 'none',
  transition: 'border-color 150ms, box-shadow 150ms',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};
const inputFocus = (e) => { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(168,85,247,0.1)'; };
const inputBlur  = (e) => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.18)'; e.currentTarget.style.boxShadow = 'none'; };

const labelStyle = {
  fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.08em', color: '#7c3aed', display: 'block', marginBottom: 5,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';

const personName = (p) => {
  if (!p) return null;
  if (p.admin_user) return p.admin_user.name;
  if (p.customer)   return `${p.customer.first_name ?? ''} ${p.customer.last_name ?? ''}`.trim();
  return null;
};

const personUserId = (p) => {
  if (p.admin_user) return p.admin_user.id;
  if (p.customer)   return p.customer.user_id ?? p.customer.id;
  return null;
};

const fetchAllPages = async (fetcher, customerId) => {
  let page = 1, all = [];
  while (true) {
    const res      = await fetcher({ customer_id: customerId, per_page: 100, page });
    const items    = Array.isArray(res) ? res : (res.data || []);
    const lastPage = res?.meta?.last_page ?? res?.last_page ?? 1;
    all = [...all, ...items];
    if (page >= lastPage) break;
    page++;
  }
  return all.filter((d) =>
    d.customer_id === undefined || Number(d.customer_id) === Number(customerId)
  );
};

const fetchDocuments = async (relatedType, customerId) => {
  try {
    if (relatedType === 'quote_request') {
      const list = await fetchAllPages(getAdminQuoteRequests, customerId);
      return list.map((d) => ({ id: d.id, label: d.request_number, sublabel: d.title ?? null, status: d.status }));
    }
    if (relatedType === 'quote') {
      const list = await fetchAllPages(getAllQuotes, customerId);
      return list.map((d) => ({ id: d.id, label: d.quote_number, sublabel: d.title ?? null, status: d.status }));
    }
    if (relatedType === 'order') {
      const list = await fetchAllPages(ordersAPI.getAllOrders, customerId);
      return list.map((d) => ({ id: d.id, label: d.order_number, sublabel: d.title ?? null, status: d.status }));
    }
  } catch { return []; }
  return [];
};

// ── SearchableDropdown ────────────────────────────────────────────────────────

const SearchableDropdown = ({ items, groups, value, onChange, placeholder, loading, renderItem, renderSelected }) => {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = search.trim().toLowerCase();

  const renderedGroups = (() => {
    if (groups) {
      return groups.map((g) => ({
        ...g,
        items: q ? g.items.filter((i) => JSON.stringify(i).toLowerCase().includes(q)) : g.items,
      }));
    }
    const flat = items ?? [];
    const filtered = q ? flat.filter((i) => JSON.stringify(i).toLowerCase().includes(q)) : flat;
    return [{ label: null, items: filtered }];
  })();

  const totalVisible = renderedGroups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...inputStyle,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: 'pointer', textAlign: 'left',
        }}
        onFocus={inputFocus} onBlur={inputBlur}
      >
        <span style={{ color: value ? '#111827' : '#9ca3af', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value ? renderSelected(value) : placeholder}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#a855f7', flexShrink: 0, marginLeft: 8 }}>
          {loading && <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />}
          {open
            ? <ChevronUp  style={{ width: 14, height: 14 }} />
            : <ChevronDown style={{ width: 14, height: 14 }} />}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 30, top: 'calc(100% + 4px)', left: 0, right: 0,
          background: 'white',
          border: '1.5px solid rgba(168,85,247,0.22)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(168,85,247,0.15)',
          overflow: 'hidden',
        }}>
          {/* Search */}
          <div style={{ padding: '8px 10px', borderBottom: '1px solid rgba(168,85,247,0.1)' }}>
            <div style={{ position: 'relative' }}>
              <Search style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#a855f7', pointerEvents: 'none' }} />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                style={{
                  ...inputStyle,
                  paddingLeft: 26, padding: '5px 8px 5px 26px',
                  fontSize: '0.75rem',
                }}
                onFocus={inputFocus} onBlur={inputBlur}
              />
            </div>
          </div>

          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {/* Clear */}
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); setSearch(''); }}
              style={{
                width: '100%', padding: '7px 12px', textAlign: 'left',
                fontSize: '0.72rem', color: '#9ca3af', fontStyle: 'italic',
                background: 'none', border: 'none', borderBottom: '1px solid rgba(168,85,247,0.08)',
                cursor: 'pointer',
                transition: 'background 120ms',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              — None —
            </button>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '20px 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} /> Loading…
              </div>
            ) : totalVisible === 0 ? (
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', padding: '20px 0', margin: 0 }}>
                No results found.
              </p>
            ) : (
              renderedGroups.map((group, gi) => (
                <div key={gi}>
                  {group.label !== null && (
                    <div style={{
                      padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6,
                      background: 'rgba(168,85,247,0.05)',
                      borderTop: gi > 0 ? '1px solid rgba(168,85,247,0.1)' : 'none',
                      position: 'sticky', top: 0,
                    }}>
                      <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#a855f7' }}>
                        {group.label}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: '#c4b5fd' }}>({group.items.length})</span>
                    </div>
                  )}
                  {group.items.length === 0 ? (
                    <p style={{ padding: '8px 12px', fontSize: '0.72rem', color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>
                      {group.emptyText ?? 'None'}
                    </p>
                  ) : (
                    group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => { onChange(item); setOpen(false); setSearch(''); }}
                        style={{
                          width: '100%', textAlign: 'left', background: value?.id === item.id ? 'rgba(168,85,247,0.07)' : 'none',
                          border: 'none', cursor: 'pointer', transition: 'background 120ms',
                        }}
                        onMouseEnter={e => { if (value?.id !== item.id) e.currentTarget.style.background = 'rgba(168,85,247,0.04)'; }}
                        onMouseLeave={e => { if (value?.id !== item.id) e.currentTarget.style.background = 'none'; }}
                      >
                        {renderItem(item)}
                      </button>
                    ))
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main modal ────────────────────────────────────────────────────────────────

const CreateTaskModal = ({ project, onClose }) => {
  const { createTask, loading } = useProjectStore();

  const [form, setForm] = useState({
    title:       '',
    description: '',
    status:      'todo',
    priority:    'medium',
    due_date:    '',
  });

  const [assignedParticipant, setAssignedParticipant] = useState(null);
  const [relatedType,         setRelatedType]         = useState('');
  const [relatedDoc,          setRelatedDoc]          = useState(null);
  const [docCache,            setDocCache]            = useState({});
  const [docLoading,          setDocLoading]          = useState(false);

  const participants = project?.participants ?? [];
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  useEffect(() => {
    setRelatedDoc(null);
    const apiTypes = ['quote_request', 'quote', 'order'];
    if (!relatedType || !apiTypes.includes(relatedType)) return;
    if (docCache[relatedType]) return;

    setDocLoading(true);
    fetchDocuments(relatedType, project.customer_id)
      .then((list) => { setDocCache((c) => ({ ...c, [relatedType]: list })); setDocLoading(false); })
      .catch(() => { setDocCache((c) => ({ ...c, [relatedType]: [] })); setDocLoading(false); });
  }, [relatedType]);

  const isApiType    = ['quote_request', 'quote', 'order'].includes(relatedType);
  const projectLinks = project?.links ?? [];

  const currentDocs = (() => {
    if (!relatedType) return null;
    if (isApiType) {
      const all      = docCache[relatedType] ?? [];
      const linkedIds = new Set(projectLinks.filter((l) => l.link_type === relatedType).map((l) => l.link_id));
      return [
        { label: 'Linked to this project', emptyText: 'No linked documents of this type.', items: all.filter((d) => linkedIds.has(d.id)) },
        { label: 'Other documents',        emptyText: 'No other documents found.',          items: all.filter((d) => !linkedIds.has(d.id)) },
      ];
    }
    if (relatedType === 'project_item') {
      return (project.items ?? []).map((i) => ({
        id: i.id, label: i.description ?? `Item #${i.id}`,
        sublabel: i.item_type ? cap(i.item_type.replace(/_/g, ' ')) : null, status: i.status,
      }));
    }
    if (relatedType === 'milestone') {
      return (project.milestones ?? []).map((m) => ({ id: m.id, label: m.title, sublabel: null, status: m.status }));
    }
    return [];
  })();

  const participantOptions = participants
    .filter((p) => p.status === 'active' || p.participant_type === 'admin')
    .map((p) => ({ id: personUserId(p), label: personName(p) ?? `User #${personUserId(p)}`, role: p.role, type: p.participant_type }))
    .filter((p) => p.id);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!form.title.trim()) return toast.error('Title is required.');
    const payload = {
      title:       form.title.trim(),
      description: form.description.trim() || undefined,
      status:      form.status,
      priority:    form.priority,
      due_date:    form.due_date || undefined,
    };
    if (assignedParticipant) payload.assigned_to = assignedParticipant.id;
    if (relatedType && relatedDoc) { payload.related_type = relatedType; payload.related_id = relatedDoc.id; }

    const res = await createTask(project.id, payload);
    if (res.success) { toast.success('Task created.'); onClose(); }
    else toast.error(res.error || 'Failed to create task.');
  };

  const isBusy = loading.submitting;

  // Priority colours
  const PRIORITY_COLOR = { low: '#22c55e', medium: '#f59e0b', high: '#f97316', urgent: '#ef4444' };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 500, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
        borderRadius: 18, overflow: 'hidden',
        background: 'white',
        border: '1px solid rgba(168,85,247,0.3)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.2)',
      }}>

        {/* Accent strip */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#a855f7,#7c3aed)', flexShrink: 0 }} />

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid rgba(168,85,247,0.12)', flexShrink: 0,
        }}>
          <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#a855f7', margin: 0 }}>
            Create Task
          </p>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#6b7280', display: 'flex', padding: 4, borderRadius: 6,
            transition: 'color 120ms',
          }}
            onMouseEnter={e => e.currentTarget.style.color = '#a855f7'}
            onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Title */}
          <div>
            <span style={labelStyle}>Title *</span>
            <input type="text" required value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="e.g. Review design mockups"
              style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
          </div>

          {/* Description */}
          <div>
            <span style={labelStyle}>Description</span>
            <textarea rows={2} value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What needs to be done?"
              style={{ ...inputStyle, resize: 'none' }}
              onFocus={inputFocus} onBlur={inputBlur} />
          </div>

          {/* Status + Priority */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <span style={labelStyle}>Status</span>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}>
                <option value="todo">To Do</option>
                <option value="doing">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
            </div>
            <div>
              <span style={labelStyle}>Priority</span>
              <select value={form.priority} onChange={e => set('priority', e.target.value)}
                style={{
                  ...inputStyle,
                  borderColor: `${PRIORITY_COLOR[form.priority]}55`,
                  color: PRIORITY_COLOR[form.priority],
                  fontWeight: 600,
                }}
                onFocus={inputFocus} onBlur={inputBlur}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          {/* Due Date */}
          <div>
            <span style={labelStyle}>Due Date</span>
            <input type="date" value={form.due_date}
              onChange={e => set('due_date', e.target.value)}
              style={inputStyle} onFocus={inputFocus} onBlur={inputBlur} />
          </div>

          {/* Assign To */}
          <div>
            <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 5 }}>
              <User style={{ width: 10, height: 10 }} /> Assign To
            </span>
            <SearchableDropdown
              items={participantOptions}
              value={assignedParticipant}
              onChange={setAssignedParticipant}
              placeholder="Select a participant…"
              loading={false}
              renderSelected={(p) => (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.6rem', fontWeight: 700, flexShrink: 0,
                  }}>
                    {p.label.charAt(0).toUpperCase()}
                  </span>
                  {p.label}
                </span>
              )}
              renderItem={(p) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px' }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: 'linear-gradient(135deg,#a855f7,#7c3aed)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
                  }}>
                    {p.label.charAt(0).toUpperCase()}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</p>
                    <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0, textTransform: 'capitalize' }}>
                      {p.role?.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
              )}
            />
          </div>

          {/* Related To */}
          <div>
            <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Link2 style={{ width: 10, height: 10 }} /> Related To
            </span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <select value={relatedType} onChange={e => setRelatedType(e.target.value)}
                style={inputStyle} onFocus={inputFocus} onBlur={inputBlur}>
                <option value="">None</option>
                {RELATED_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>

              {relatedType ? (
                <SearchableDropdown
                  {...(isApiType ? { groups: currentDocs } : { items: currentDocs ?? [] })}
                  value={relatedDoc}
                  onChange={setRelatedDoc}
                  placeholder="Select document…"
                  loading={docLoading}
                  renderSelected={(d) => <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</span>}
                  renderItem={(d) => (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 12px' }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#111827', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</p>
                        {d.sublabel && <p style={{ fontSize: '0.68rem', color: '#9ca3af', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.sublabel}</p>}
                      </div>
                      {d.status && (() => {
                        const s = STATUS_BADGE[d.status] ?? { bg: 'rgba(107,114,128,0.12)', color: '#4b5563' };
                        return (
                          <span style={{
                            fontSize: '0.62rem', padding: '2px 8px', borderRadius: 20,
                            fontWeight: 600, flexShrink: 0,
                            background: s.bg, color: s.color,
                          }}>
                            {cap(d.status.replace(/_/g, ' '))}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                />
              ) : (
                <div style={{
                  ...inputStyle,
                  display: 'flex', alignItems: 'center',
                  borderStyle: 'dashed', color: '#d1d5db',
                  fontSize: '0.75rem', fontStyle: 'italic',
                  background: 'transparent',
                }}>
                  Select a type first
                </div>
              )}
            </div>

            {/* Selected doc chip */}
            {relatedDoc && (
              <div style={{
                marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', borderRadius: 8,
                background: 'rgba(168,85,247,0.06)',
                border: '1px solid rgba(168,85,247,0.2)',
              }}>
                <span style={{ fontSize: '0.68rem', color: '#7c3aed', fontWeight: 700 }}>
                  {TYPE_LABEL[relatedType]}:
                </span>
                <span style={{ fontSize: '0.72rem', color: '#a855f7', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {relatedDoc.label}
                </span>
                <button type="button" onClick={() => setRelatedDoc(null)} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#c4b5fd', display: 'flex', flexShrink: 0,
                  transition: 'color 120ms',
                }}
                  onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={e => e.currentTarget.style.color = '#c4b5fd'}>
                  <X style={{ width: 13, height: 13 }} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '12px 20px 14px',
          borderTop: '1px solid rgba(168,85,247,0.12)', flexShrink: 0,
        }}>
          <button type="button" onClick={onClose} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
            background: 'transparent', color: '#9ca3af',
            border: '1px solid rgba(168,85,247,0.22)', cursor: 'pointer',
            transition: 'border-color 150ms, color 150ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.45)'; e.currentTarget.style.color = '#c084fc'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(168,85,247,0.22)'; e.currentTarget.style.color = '#9ca3af'; }}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={isBusy} style={{
            padding: '6px 18px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
            border: 'none', cursor: isBusy ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
            boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
            opacity: isBusy ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 7,
            transition: 'box-shadow 150ms, opacity 150ms',
          }}
            onMouseEnter={e => { if (!isBusy) e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.45)'; }}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(168,85,247,0.3)'}>
            {isBusy && <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />}
            {isBusy ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateTaskModal;