import { useEffect, useState, useRef, useCallback } from 'react';
import { NotebookPen } from 'lucide-react';
import { useAuthStore } from '../../store';
import api from '../../api/axios';
import useFinancialJournalStore from '../../store/useFinancialJournalStore';
import toast from 'react-hot-toast';

const ADMIN_ROLES = ['admin', 'super_admin', 'manager', 'finance', 'sales_rep'];

const NOTE_TYPES = [
  { value: 'refund',             label: 'Refund' },
  { value: 'overpayment',        label: 'Overpayment' },
  { value: 'credit_adjustment',  label: 'Credit Adjustment' },
  { value: 'loyalty_adjustment', label: 'Loyalty Adjustment' },
  { value: 'manual_payment',     label: 'Manual Payment' },
  { value: 'reversal',           label: 'Reversal' },
  { value: 'other',              label: 'Other' },
];

const SUBJECT_TABLES = [
  { value: 'payments',                     label: 'Payment' },
  { value: 'orders',                       label: 'Order' },
  { value: 'store_credit_transactions',    label: 'Store Credit' },
  { value: 'loyalty_point_transactions',   label: 'Loyalty Points' },
  { value: 'customer_credit_transactions', label: 'Credit Account' },
  { value: 'auction_orders',               label: 'Auction Order' },
  { value: 'hamper_orders',                label: 'Hamper Order' },
  { value: 'quotes',                       label: 'Quote' },
];

const S = {
  input: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(168,85,247,0.25)',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '12px',
    padding: '8px 10px',
    fontFamily: 'monospace',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    background: '#0f0f1a',
    border: '1px solid rgba(168,85,247,0.25)',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '12px',
    padding: '8px 10px',
    fontFamily: 'monospace',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  label: {
    color: '#94a3b8',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    display: 'block',
    marginBottom: '4px',
  },
  fieldWrap: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '10px',
  },
  dirBtn: (active, dir) => ({
    flex: 1,
    padding: '7px',
    borderRadius: '8px',
    border: `1px solid ${active ? (dir === 'in' ? '#10b981' : '#ef4444') : 'rgba(168,85,247,0.2)'}`,
    background: active ? (dir === 'in' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)') : 'transparent',
    color: active ? (dir === 'in' ? '#10b981' : '#ef4444') : '#64748b',
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'monospace',
    cursor: 'pointer',
    letterSpacing: '0.05em',
    transition: 'all 0.15s',
  }),
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: '6px',
    fontSize: '14px',
    lineHeight: 1,
  },
  syncDot: (syncing, error) => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: error ? '#ef4444' : syncing ? '#f59e0b' : '#10b981',
    flexShrink: 0,
  }),
};

export default function FloatingMemoModal() {
  const { user } = useAuthStore();
  if (!user || !ADMIN_ROLES.includes(user.role)) return null;
  return <FloatingMemoModalInner />;
}

function FloatingMemoModalInner() {
  // ── drag state ─────────────────────────────────────────────────
  // collapsed: pinned to right edge, only top varies (right=0 always)
  // expanded:  freely draggable anywhere
  const [pos, setPos]   = useState({ top: 120, right: 0 });
  const dragging        = useRef(false);
  const dragStart       = useRef({ mx: 0, my: 0, top: 0, right: 0 });
  const didDrag         = useRef(false);

  // ── local UI state ─────────────────────────────────────────────
  const [subjectSearch, setSubjectSearch]       = useState('');
  const [subjectResults, setSubjectResults]     = useState([]);
  const [searchingSubject, setSearchingSubject] = useState(false);
  const searchTimer = useRef(null);
  const syncTimer   = useRef(null);

  const {
    isOpen, isMinimised,
    draft, savedNoteId,
    isSyncing, lastSyncedAt, syncError,
    subjectPreview, isLoadingPreview,
    open, close, minimise, expand,
    updateDraft, resetDraft,
    syncDraft, submitNote,
    fetchSubjectPreview, clearSubjectPreview,
  } = useFinancialJournalStore();

  // ── visibility sync ────────────────────────────────────────────
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') syncDraft(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [syncDraft]);

  // ── collapsed bubble drag — vertical only, pinned to right edge ─
  const onBubbleMouseDown = useCallback((e) => {
    e.preventDefault();
    didDrag.current  = false;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, top: pos.top, right: 0 };

    const onMove = (mv) => {
      if (!dragging.current) return;
      const dy = mv.clientY - dragStart.current.my;
      if (Math.abs(dy) > 3) didDrag.current = true;
      setPos({
        top:   Math.max(8, Math.min(window.innerHeight - 120, dragStart.current.top + dy)),
        right: 0,
      });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  // ── expanded modal drag — free movement ────────────────────────
  const onHeaderMouseDown = useCallback((e) => {
    e.preventDefault();
    dragging.current  = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, top: pos.top, right: pos.right };

    const onMove = (mv) => {
      if (!dragging.current) return;
      const dx = mv.clientX - dragStart.current.mx;
      const dy = mv.clientY - dragStart.current.my;
      setPos({
        top:   Math.max(8, dragStart.current.top  + dy),
        right: Math.max(8, dragStart.current.right - dx),
      });
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [pos]);

  // ── when opening modal, offset from right edge so it's visible ─
  const handleOpen = () => {
    if (didDrag.current) return;
    setPos(prev => ({ top: prev.top, right: 24 }));
    isMinimised ? expand() : open();
  };

  // ── helpers ────────────────────────────────────────────────────
  const handleBodyChange = (val) => {
    updateDraft({ body: val });
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => syncDraft(), 3000);
  };

  const handleSubmit = async () => {
    clearTimeout(syncTimer.current);
    const result = await submitNote();
    if (result.success) {
      toast.success('Memo saved — ' + (result.note?.note_number ?? ''));
      setSubjectSearch('');
      setSubjectResults([]);
    } else {
      toast.error(result.message || 'Failed to save memo');
    }
  };

  const handleMinimise = () => {
    // snap back to right edge when minimising
    setPos(prev => ({ top: prev.top, right: 0 }));
    minimise();
  };

  const syncLabel = syncError
    ? `Sync error: ${syncError}`
    : isSyncing    ? 'Syncing...'
    : lastSyncedAt ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
    : savedNoteId  ? 'Draft saved'
    : 'Not yet synced';

  // ══════════════════════════════════════════════════════════════
  // COLLAPSED — loyalty-pill style, right edge, vertical drag only
  // ══════════════════════════════════════════════════════════════
  if (!isOpen || isMinimised) {
    return (
      <>
        <style>{`
          @keyframes memoPulse {
            0%,100% { box-shadow: -2px 0 12px rgba(168,85,247,0.25); }
            50%      { box-shadow: -5px 0 24px rgba(168,85,247,0.5); }
          }
        `}</style>
        <button
          onMouseDown={onBubbleMouseDown}
          onClick={handleOpen}
          style={{
            position: 'fixed',
            top: pos.top,
            right: 0,
            zIndex: 10000,
            width: '36px',
            height: '96px',
            borderRadius: '10px 0 0 10px',
            border: '1px solid rgba(168,85,247,0.4)',
            borderRight: 'none',
            background: 'var(--bg-secondary, #1a1a2e)',
            cursor: dragging.current ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '6px',
            animation: 'memoPulse 2.5s ease-in-out infinite',
            transition: 'transform 150ms ease',
            userSelect: 'none',
            padding: 0,
          }}
          onMouseEnter={e => { if (!dragging.current) e.currentTarget.style.transform = 'translateX(-3px)'; }}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}
          title="Open financial memo"
        >
          <NotebookPen size={14} color="#a855f7" strokeWidth={2} />
          <span style={{
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            transform: 'rotate(180deg)',
            fontSize: '9px',
            fontWeight: 700,
            fontFamily: 'monospace',
            letterSpacing: '0.1em',
            color: '#a855f7',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}>
            Memo
          </span>
          {savedNoteId && (
            <span style={{
              position: 'absolute',
              top: '-4px',
              right: '4px',
              background: '#a855f7',
              color: '#fff',
              borderRadius: '50%',
              width: '13px',
              height: '13px',
              fontSize: '8px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'monospace',
            }}>1</span>
          )}
        </button>
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // EXPANDED — draggable modal, opens near top-right
  // ══════════════════════════════════════════════════════════════
  return (
    <>
      <style>{`
        @keyframes memoPop {
          from { opacity: 0; transform: scale(0.88) translateY(-12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0); }
        }
      `}</style>

      <div style={{
        position: 'fixed',
        top: pos.top,
        right: pos.right,
        zIndex: 9999,
        width: '420px',
        background: 'linear-gradient(160deg, #0f0f1a 0%, #1a1a2e 100%)',
        border: '1px solid rgba(168,85,247,0.4)',
        borderRadius: '16px',
        boxShadow: '0 0 40px rgba(168,85,247,0.15), 0 20px 60px rgba(0,0,0,0.6)',
        fontFamily: 'monospace',
        overflow: 'hidden',
        animation: 'memoPop 250ms cubic-bezier(0.34,1.56,0.64,1)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 48px)',
      }}>

        {/* ── Draggable header ── */}
        <div
          onMouseDown={onHeaderMouseDown}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgba(168,85,247,0.2)',
            background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(124,58,237,0.1))',
            cursor: 'grab',
            userSelect: 'none',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <NotebookPen size={15} color="#fff" strokeWidth={2} />
            </div>
            <div>
              <div style={{ color: '#e2e8f0', fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em' }}>
                FINANCIAL MEMO
              </div>
              <div style={{ color: '#64748b', fontSize: '9px', letterSpacing: '0.08em', marginTop: '1px' }}>
                SCRATCH PAD — SAVES TO DB · drag to move
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '4px' }} onMouseDown={e => e.stopPropagation()}>
            <button style={S.iconBtn} onClick={resetDraft}     title="Clear draft">↺</button>
            <button style={S.iconBtn} onClick={handleMinimise} title="Minimise">─</button>
            <button style={S.iconBtn} onClick={close}          title="Close">✕</button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{
          padding: '14px 16px',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}>

          {/* Note type */}
          <div style={S.fieldWrap}>
            <label style={S.label}>Memo Type</label>
            <select style={S.select} value={draft.note_type}
              onChange={e => updateDraft({ note_type: e.target.value })}>
              {NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Amount + currency */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Amount</label>
              <input style={S.input} type="number" min="0" step="0.01" placeholder="0.00"
                value={draft.amount}
                onChange={e => updateDraft({ amount: e.target.value })}
                onBlur={syncDraft} />
            </div>
            <div style={{ flex: '0 0 68px' }}>
              <label style={S.label}>Currency</label>
              <input style={S.input} type="text" maxLength={8}
                value={draft.currency}
                onChange={e => updateDraft({ currency: e.target.value.toUpperCase() })}
                onBlur={syncDraft} />
            </div>
          </div>

          {/* Direction */}
          <div style={S.fieldWrap}>
            <label style={S.label}>Direction</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              {['in', 'out'].map(dir => (
                <button key={dir} style={S.dirBtn(draft.direction === dir, dir)}
                  onClick={() => updateDraft({ direction: dir })}>
                  {dir === 'in' ? '▲ MONEY IN' : '▼ MONEY OUT'}
                </button>
              ))}
            </div>
          </div>

          {/* Linked to */}
          <div style={S.fieldWrap}>
            <label style={S.label}>Linked To</label>
            <select style={S.select} value={draft.subject_table}
              onChange={e => {
                updateDraft({ subject_table: e.target.value, subject_id: '' });
                setSubjectSearch('');
                setSubjectResults([]);
                clearSubjectPreview();
              }}>
              <option value="">— none —</option>
              {SUBJECT_TABLES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Subject search */}
          {draft.subject_table && (
            <div style={S.fieldWrap}>
              <label style={S.label}>
                {['store_credit_transactions', 'loyalty_point_transactions', 'customer_credit_transactions'].includes(draft.subject_table)
                  ? 'Record ID' : 'Search by number or ID'}
              </label>
              <input
                style={S.input}
                type="text"
                placeholder={
                  draft.subject_table === 'payments'       ? 'e.g. PAY-2026-001' :
                  draft.subject_table === 'orders'         ? 'e.g. ORD-2026-001' :
                  draft.subject_table === 'quotes'         ? 'e.g. QUO-2026-001' :
                  draft.subject_table === 'auction_orders' ? 'e.g. AUC-2026-001' :
                  draft.subject_table === 'hamper_orders'  ? 'e.g. HAM-2026-001' :
                  'Enter record ID'
                }
                value={subjectSearch}
                onChange={e => {
                  const val = e.target.value;
                  setSubjectSearch(val);
                  setSubjectResults([]);
                  updateDraft({ subject_id: '' });
                  clearSubjectPreview();
                  clearTimeout(searchTimer.current);
                  if (!val.trim()) return;
                  searchTimer.current = setTimeout(async () => {
                    setSearchingSubject(true);
                    try {
                      const res = await api.get('/admin/financial-notes/resolve-subject', {
                        params: { table: draft.subject_table, q: val.trim() },
                      });
                      setSubjectResults(res.data);
                    } catch {
                      setSubjectResults([]);
                    } finally {
                      setSearchingSubject(false);
                    }
                  }, 400);
                }}
              />
              {searchingSubject && (
                <div style={{ color: '#475569', fontSize: '10px', marginTop: '4px' }}>Searching...</div>
              )}
              {subjectResults.length > 0 && !draft.subject_id && (
                <div style={{
                  background: '#0f0f1a',
                  border: '1px solid rgba(168,85,247,0.3)',
                  borderRadius: '8px',
                  marginTop: '4px',
                  overflow: 'hidden',
                }}>
                  {subjectResults.map(r => (
                    <div
                      key={r.id}
                      onClick={() => {
                        updateDraft({ subject_id: r.id });
                        setSubjectSearch(r.label);
                        setSubjectResults([]);
                        fetchSubjectPreview(draft.subject_table, r.id);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(168,85,247,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ color: '#a855f7', fontWeight: 700, fontSize: '12px' }}>{r.label}</span>
                      <span style={{ color: '#475569', fontSize: '10px' }}>#{r.id}</span>
                    </div>
                  ))}
                </div>
              )}
              {draft.subject_id && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  <span style={{ color: '#10b981', fontSize: '10px' }}>✓ ID #{draft.subject_id} selected</span>
                  <button
                    onClick={() => {
                      updateDraft({ subject_id: '' });
                      setSubjectSearch('');
                      setSubjectResults([]);
                      clearSubjectPreview();
                    }}
                    style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '10px' }}>
                    ✕ clear
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Subject preview */}
          {isLoadingPreview && (
            <div style={{
              background: 'rgba(168,85,247,0.06)',
              border: '1px solid rgba(168,85,247,0.2)',
              borderRadius: '8px',
              padding: '8px 10px',
              marginBottom: '10px',
            }}>
              <div style={{ color: '#64748b', fontSize: '10px' }}>Looking up record...</div>
            </div>
          )}
          {subjectPreview && !isLoadingPreview && (
            <div style={{
              background: 'rgba(168,85,247,0.06)',
              border: '1px solid rgba(168,85,247,0.2)',
              borderRadius: '8px',
              padding: '8px 10px',
              marginBottom: '10px',
            }}>
              <div style={{ color: '#a855f7', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>
                🔗 {subjectPreview.label}
              </div>
              {subjectPreview.existingNotes?.length > 0 && (
                <div style={{ color: '#f59e0b', fontSize: '10px' }}>
                  ⚠ {subjectPreview.existingNotes.length} existing memo{subjectPreview.existingNotes.length > 1 ? 's' : ''} on this record
                </div>
              )}
            </div>
          )}

          {/* Reference label */}
          <div style={S.fieldWrap}>
            <label style={S.label}>Reference Label</label>
            <input
              style={S.input}
              type="text"
              placeholder='e.g. "Order #ORD-2026-001 — refund via mpesa"'
              value={draft.reference_label}
              onChange={e => updateDraft({ reference_label: e.target.value })}
              onBlur={syncDraft}
            />
          </div>

          {/* Body */}
          <div style={S.fieldWrap}>
            <label style={S.label}>Note <span style={{ color: '#ef4444' }}>*</span></label>
            <textarea
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(168,85,247,0.25)',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '12px',
                padding: '10px',
                fontFamily: 'monospace',
                outline: 'none',
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                minHeight: '80px',
                lineHeight: 1.5,
              }}
              placeholder="What happened? Who authorised it? Mpesa ref? Any context that helps reconciliation later..."
              value={draft.body}
              onChange={e => handleBodyChange(e.target.value)}
              onBlur={syncDraft}
            />
          </div>

        </div>

        {/* ── Sync bar ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 16px',
          flexShrink: 0,
        }}>
          <div style={S.syncDot(isSyncing, !!syncError)} />
          <span style={{ color: '#475569', fontSize: '10px', fontFamily: 'monospace' }}>{syncLabel}</span>
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '10px 16px',
          borderTop: '1px solid rgba(168,85,247,0.15)',
          flexShrink: 0,
        }}>
          <button
            onClick={resetDraft}
            style={{
              flex: 1,
              padding: '9px',
              background: 'transparent',
              border: '1px solid rgba(168,85,247,0.25)',
              borderRadius: '8px',
              color: '#94a3b8',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: 'monospace',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >CLEAR</button>
          <button
            disabled={!draft.body?.trim()}
            onClick={handleSubmit}
            style={{
              flex: 2,
              padding: '9px',
              background: !draft.body?.trim()
                ? 'rgba(168,85,247,0.2)'
                : 'linear-gradient(135deg, #a855f7, #7c3aed)',
              border: 'none',
              borderRadius: '8px',
              color: !draft.body?.trim() ? '#64748b' : '#fff',
              fontSize: '12px',
              fontWeight: 700,
              fontFamily: 'monospace',
              cursor: !draft.body?.trim() ? 'not-allowed' : 'pointer',
              letterSpacing: '0.05em',
            }}
          >{isSyncing ? 'SAVING...' : 'SAVE MEMO'}</button>
        </div>

      </div>
    </>
  );
}