import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { X, Search, Loader2, ChevronDown, ChevronUp, Check } from 'lucide-react';
import useProjectStore from '../../../store/projectStore';
import { getAdminQuoteRequests } from '../../../api/quoteRequests';
import { getAllQuotes } from '../../../api/quotes';
import ordersAPI from '../../../api/orders';

// ── Constants ─────────────────────────────────────────────────────────────────

const LINK_TYPES = ['quote_request', 'quote', 'order'];
const RELATIONS  = ['primary', 'addendum', 'revision', 'phase'];
const typeLabel  = (t) => t?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? '';

const TAB_META = {
  quote_request: { label: 'Quote Requests', accent: '#2563eb', bg: 'rgba(37,99,235,0.08)',  border: 'rgba(37,99,235,0.25)'  },
  quote:         { label: 'Quotes',         accent: '#7c3aed', bg: 'rgba(124,58,237,0.08)', border: 'rgba(124,58,237,0.25)' },
  order:         { label: 'Orders',         accent: '#16a34a', bg: 'rgba(22,163,74,0.08)',  border: 'rgba(22,163,74,0.25)'  },
};

const STATUS_BADGE = {
  pending:    { bg: 'rgba(234,179,8,0.12)',   color: '#b45309' },
  reviewing:  { bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8' },
  draft:      { bg: 'rgba(107,114,128,0.12)', color: '#4b5563' },
  sent:       { bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8' },
  approved:   { bg: 'rgba(34,197,94,0.12)',   color: '#15803d' },
  quoted:     { bg: 'rgba(168,85,247,0.12)',  color: '#7c3aed' },
  converted:  { bg: 'rgba(16,185,129,0.12)',  color: '#065f46' },
  rejected:   { bg: 'rgba(239,68,68,0.12)',   color: '#b91c1c' },
  confirmed:  { bg: 'rgba(59,130,246,0.12)',  color: '#1d4ed8' },
  processing: { bg: 'rgba(99,102,241,0.12)',  color: '#4338ca' },
  shipped:    { bg: 'rgba(20,184,166,0.12)',  color: '#0f766e' },
  delivered:  { bg: 'rgba(20,184,166,0.12)',  color: '#0f766e' },
  completed:  { bg: 'rgba(16,185,129,0.12)',  color: '#065f46' },
  cancelled:  { bg: 'rgba(239,68,68,0.12)',   color: '#b91c1c' },
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

const selKey = (linkType, id) => `${linkType}:${id}`;

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
  return all.filter((d) => Number(d.customer_id) === Number(customerId));
};

const fetchDocuments = async (linkType, customerId) => {
  try {
    if (linkType === 'quote_request') {
      const list = await fetchAllPages(getAdminQuoteRequests, customerId);
      return list.map((d) => ({ id: d.id, document_number: d.request_number, title: d.title ?? null, status: d.status, link_type: 'quote_request' }));
    }
    if (linkType === 'quote') {
      const list = await fetchAllPages(getAllQuotes, customerId);
      return list.map((d) => ({ id: d.id, document_number: d.quote_number, title: d.title ?? null, status: d.status, link_type: 'quote' }));
    }
    if (linkType === 'order') {
      const list = await fetchAllPages(ordersAPI.getAllOrders, customerId);
      return list.map((d) => ({ id: d.id, document_number: d.order_number, title: d.title ?? null, status: d.status, link_type: 'order' }));
    }
  } catch { return []; }
  return [];
};

// ── Checkbox ──────────────────────────────────────────────────────────────────

const Checkbox = ({ checked }) => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 16, height: 16, minWidth: 16, borderRadius: 3, flexShrink: 0,
    border:      checked ? '2px solid #a855f7' : '2px solid rgba(168,85,247,0.3)',
    background:  checked ? 'linear-gradient(135deg,#a855f7,#7c3aed)' : 'transparent',
    transition: 'all 150ms',
  }}>
    {checked && (
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </span>
);

// ── Modal ─────────────────────────────────────────────────────────────────────

const LinkProjectModal = ({ project, onClose }) => {
  const { addLink } = useProjectStore();

  const [activeTab,   setActiveTab]   = useState('quote_request');
  const [search,      setSearch]      = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [tabDropdown, setTabDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const [docCache, setDocCache] = useState({ quote_request: null, quote: null, order: null });
  const [fetching, setFetching] = useState({ quote_request: false, quote: false, order: false });
  const [selections, setSelections] = useState(new Map());

  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setTabDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!project.customer_id || docCache[activeTab] !== null) return;
    setFetching((f) => ({ ...f, [activeTab]: true }));
    fetchDocuments(activeTab, project.customer_id)
      .then((list) => { setDocCache((c) => ({ ...c, [activeTab]: list })); setFetching((f) => ({ ...f, [activeTab]: false })); })
      .catch(() => { setDocCache((c) => ({ ...c, [activeTab]: [] })); setFetching((f) => ({ ...f, [activeTab]: false })); });
  }, [activeTab, project.customer_id]);

  const visibleDocs = (() => {
    const list = docCache[activeTab] || [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter((d) => d.document_number?.toLowerCase().includes(q) || d.title?.toLowerCase().includes(q));
  })();

  const isSelected  = (doc) => selections.has(selKey(doc.link_type, doc.id));
  const toggleDoc   = (doc) => {
    setSelections((prev) => {
      const next = new Map(prev), k = selKey(doc.link_type, doc.id);
      next.has(k) ? next.delete(k) : next.set(k, { doc, link_type: doc.link_type, relation: 'primary', notes: '' });
      return next;
    });
  };
  const updateField = (key, field, value) => {
    setSelections((prev) => { const next = new Map(prev); const e = next.get(key); if (e) next.set(key, { ...e, [field]: value }); return next; });
  };
  const removeSelection = (key) => setSelections((prev) => { const next = new Map(prev); next.delete(key); return next; });
  const handleTabChange = (t) => { setActiveTab(t); setSearch(''); setTabDropdown(false); };

  const handleSubmit = async () => {
    if (selections.size === 0) return toast.error('Select at least one document.');
    setSubmitting(true);
    let ok = 0, fail = 0, firstError = null;
    for (const { doc, link_type, relation, notes } of selections.values()) {
      const res = await addLink(project.id, { link_type, link_id: doc.id, relation, notes: notes?.trim() || undefined });
      if (res.success) ok++; else { fail++; if (!firstError) firstError = res.error; }
    }
    setSubmitting(false);
    if (fail === 0)  { toast.success(`${ok} document${ok > 1 ? 's' : ''} linked.`); onClose(); }
    else if (ok > 0) { toast.success(`${ok} linked.`); toast.error(`${fail} failed: ${firstError}`); onClose(); }
    else             { toast.error(firstError || 'Failed to link documents.'); }
  };

  const customerName = project.customer
    ? `${project.customer.first_name || ''} ${project.customer.last_name || ''}`.trim()
    : `Customer #${project.customer_id}`;

  const selectionList = [...selections.values()];
  const totalSelected  = selectionList.length;
  const tab            = TAB_META[activeTab];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 500, maxHeight: '92vh', minHeight: 0,
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
          <div>
            <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#a855f7', margin: 0 }}>
              Link Documents
            </p>
            <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '2px 0 0' }}>
              Documents for{' '}
              <span style={{ fontWeight: 600, color: '#4b5563' }}>{customerName}</span>{' '}
              only
            </p>
          </div>
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

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14, padding: '16px 20px' }}>

          {/* Tab row — dropdown trigger + pills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Dropdown trigger */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} ref={dropdownRef}>
              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Viewing:</span>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setTabDropdown((v) => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 8, fontSize: '0.75rem', fontWeight: 700,
                    background: tab.bg, border: `1.5px solid ${tab.border}`, color: tab.accent,
                    cursor: 'pointer', transition: 'all 150ms', fontFamily: 'inherit',
                  }}
                >
                  {tab.label}
                  {fetching[activeTab] && <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite' }} />}
                  {tabDropdown
                    ? <ChevronUp  style={{ width: 12, height: 12 }} />
                    : <ChevronDown style={{ width: 12, height: 12 }} />}
                </button>

                {tabDropdown && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20, width: 180,
                    background: 'white', borderRadius: 10, overflow: 'hidden',
                    border: '1.5px solid rgba(168,85,247,0.2)',
                    boxShadow: '0 8px 28px rgba(168,85,247,0.15)',
                  }}>
                    {LINK_TYPES.map((t) => {
                      const cnt = selectionList.filter((s) => s.link_type === t).length;
                      const m   = TAB_META[t];
                      const isA = activeTab === t;
                      return (
                        <button key={t} type="button" onClick={() => handleTabChange(t)} style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '9px 12px', textAlign: 'left', fontSize: '0.8rem', fontFamily: 'inherit',
                          background: isA ? m.bg : 'none', color: isA ? m.accent : '#374151',
                          fontWeight: isA ? 700 : 400, border: 'none', cursor: 'pointer',
                          borderBottom: '1px solid rgba(168,85,247,0.07)',
                          transition: 'background 120ms',
                        }}
                          onMouseEnter={e => { if (!isA) e.currentTarget.style.background = 'rgba(168,85,247,0.04)'; }}
                          onMouseLeave={e => { if (!isA) e.currentTarget.style.background = 'none'; }}
                        >
                          <span>{m.label}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {fetching[t] && <Loader2 style={{ width: 11, height: 11, animation: 'spin 1s linear infinite', color: '#9ca3af' }} />}
                            {cnt > 0 && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 16, height: 16, borderRadius: '50%', fontSize: '0.6rem', fontWeight: 700,
                                background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
                              }}>{cnt}</span>
                            )}
                            {isA && <Check style={{ width: 12, height: 12 }} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Pills */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {LINK_TYPES.map((t) => {
                const cnt  = selectionList.filter((s) => s.link_type === t).length;
                const m    = TAB_META[t];
                const isA  = activeTab === t;
                return (
                  <button key={t} type="button" onClick={() => handleTabChange(t)} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 8, fontSize: '0.72rem', fontWeight: 700,
                    border: `1.5px solid ${isA ? m.accent : 'rgba(168,85,247,0.18)'}`,
                    background: isA ? m.bg : 'transparent',
                    color: isA ? m.accent : '#9ca3af',
                    cursor: 'pointer', transition: 'all 150ms', fontFamily: 'inherit',
                  }}>
                    {m.label}
                    {fetching[t] && <Loader2 style={{ width: 10, height: 10, animation: 'spin 1s linear infinite' }} />}
                    {cnt > 0 && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 15, height: 15, borderRadius: '50%', fontSize: '0.58rem', fontWeight: 700,
                        background: isA ? m.accent : 'linear-gradient(135deg,#a855f7,#7c3aed)',
                        color: 'white',
                      }}>{cnt}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: '#a855f7', pointerEvents: 'none' }} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${tab.label}…`}
              style={{ ...inputStyle, paddingLeft: 30 }}
              onFocus={inputFocus} onBlur={inputBlur}
            />
          </div>

          {/* Document list */}
          <div style={{
            border: '1.5px solid rgba(168,85,247,0.18)', borderRadius: 10,
            overflow: 'hidden',
          }}>
            {fetching[activeTab] ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '28px 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />
                Loading {tab.label}…
              </div>
            ) : visibleDocs.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '28px 0', fontSize: '0.72rem', color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>
                No {tab.label} found.
              </p>
            ) : (
              <div style={{ maxHeight: 210, overflowY: 'auto' }}>
                {visibleDocs.map((doc, i) => {
                  const sel = isSelected(doc);
                  const badge = doc.status ? (STATUS_BADGE[doc.status] ?? { bg: 'rgba(107,114,128,0.12)', color: '#4b5563' }) : null;
                  return (
                    <button key={doc.id} type="button" onClick={() => toggleDoc(doc)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 12px', textAlign: 'left',
                      background: sel ? 'rgba(168,85,247,0.06)' : 'none',
                      border: 'none', borderBottom: i < visibleDocs.length - 1 ? '1px solid rgba(168,85,247,0.08)' : 'none',
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'background 120ms',
                    }}
                      onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'rgba(168,85,247,0.04)'; }}
                      onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'none'; }}
                    >
                      <Checkbox checked={sel} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: 'block', fontSize: '0.82rem', fontWeight: 600,
                          color: sel ? '#7c3aed' : '#111827',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {doc.title || doc.document_number}
                        </span>
                        {doc.title && (
                          <span style={{ display: 'block', fontSize: '0.68rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.document_number}
                          </span>
                        )}
                      </div>
                      {badge && (
                        <span style={{
                          fontSize: '0.62rem', padding: '2px 8px', borderRadius: 20, fontWeight: 600, flexShrink: 0,
                          background: badge.bg, color: badge.color,
                        }}>
                          {typeLabel(doc.status)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selection tray */}
          {totalSelected > 0 && (
            <div style={{
              border: '1.5px solid rgba(168,85,247,0.25)', borderRadius: 10, overflow: 'hidden',
            }}>
              {/* Tray header */}
              <div style={{
                padding: '8px 14px',
                background: 'rgba(168,85,247,0.06)',
                borderBottom: '1px solid rgba(168,85,247,0.12)',
              }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: '#7c3aed', margin: 0 }}>
                  {totalSelected} selected — set relation &amp; notes for each
                </p>
              </div>

              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                {selectionList.map(({ doc, link_type, relation, notes }, i) => {
                  const k = selKey(link_type, doc.id);
                  const m = TAB_META[link_type];
                  return (
                    <div key={k} style={{
                      padding: '10px 14px',
                      borderBottom: i < selectionList.length - 1 ? '1px solid rgba(168,85,247,0.08)' : 'none',
                      display: 'flex', flexDirection: 'column', gap: 8,
                      background: 'white',
                    }}>
                      {/* Row 1 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Type pill */}
                        <span style={{
                          flexShrink: 0, fontSize: '0.6rem', padding: '2px 7px', borderRadius: 6, fontWeight: 700,
                          background: m.bg, color: m.accent, border: `1px solid ${m.border}`,
                        }}>
                          {typeLabel(link_type).split(' ')[0]}
                        </span>

                        {/* Doc title */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {doc.title || doc.document_number}
                          </span>
                          {doc.title && (
                            <span style={{ display: 'block', fontSize: '0.65rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {doc.document_number}
                            </span>
                          )}
                        </div>

                        {/* Relation selector */}
                        <select
                          value={relation}
                          onChange={e => updateField(k, 'relation', e.target.value)}
                          onClick={e => e.stopPropagation()}
                          style={{
                            flexShrink: 0, fontSize: '0.72rem', padding: '4px 8px',
                            borderRadius: 6, fontFamily: 'inherit', cursor: 'pointer',
                            border: '1.5px solid rgba(168,85,247,0.22)',
                            background: 'rgba(168,85,247,0.04)',
                            color: '#7c3aed', fontWeight: 600, outline: 'none',
                          }}
                          onFocus={inputFocus} onBlur={inputBlur}
                        >
                          {RELATIONS.map(r => <option key={r} value={r}>{typeLabel(r)}</option>)}
                        </select>

                        {/* Remove */}
                        <button type="button" onClick={() => removeSelection(k)} style={{
                          flexShrink: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer',
                          color: '#c4b5fd', transition: 'color 120ms, background 120ms',
                        }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#c4b5fd'; e.currentTarget.style.background = 'none'; }}
                        >
                          <X style={{ width: 13, height: 13 }} />
                        </button>
                      </div>

                      {/* Notes */}
                      <textarea
                        rows={2}
                        value={notes}
                        onChange={e => updateField(k, 'notes', e.target.value)}
                        onClick={e => e.stopPropagation()}
                        placeholder="Optional note for this link…"
                        style={{
                          ...inputStyle,
                          resize: 'none', fontSize: '0.75rem',
                          background: 'rgba(168,85,247,0.03)',
                        }}
                        onFocus={inputFocus} onBlur={inputBlur}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: 0 }}>
            Each document can only be linked to one project at a time.
          </p>
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
          <button type="button" onClick={handleSubmit} disabled={selections.size === 0 || submitting} style={{
            padding: '6px 18px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
            border: 'none', cursor: (selections.size === 0 || submitting) ? 'not-allowed' : 'pointer',
            background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: 'white',
            boxShadow: '0 2px 10px rgba(168,85,247,0.3)',
            opacity: (selections.size === 0 || submitting) ? 0.6 : 1,
            display: 'flex', alignItems: 'center', gap: 7,
            transition: 'box-shadow 150ms, opacity 150ms',
          }}
            onMouseEnter={e => { if (selections.size > 0 && !submitting) e.currentTarget.style.boxShadow = '0 4px 16px rgba(168,85,247,0.45)'; }}
            onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 10px rgba(168,85,247,0.3)'}>
            {submitting && <Loader2 style={{ width: 13, height: 13, animation: 'spin 1s linear infinite' }} />}
            {submitting
              ? 'Linking…'
              : `Link${selections.size > 0 ? ` ${selections.size}` : ''} Document${selections.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LinkProjectModal;