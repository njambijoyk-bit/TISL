import { useEffect, useRef } from 'react';
import { useAuthStore } from '../../store';
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
  { value: 'payments',                    label: 'Payment' },
  { value: 'orders',                      label: 'Order' },
  { value: 'store_credit_transactions',   label: 'Store Credit' },
  { value: 'loyalty_point_transactions',  label: 'Loyalty Points' },
  { value: 'customer_credit_transactions',label: 'Credit Account' },
  { value: 'auction_orders',              label: 'Auction Order' },
  { value: 'hamper_orders',               label: 'Hamper Order' },
  { value: 'quotes',                      label: 'Quote' },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  // floating tab (minimised)
  tab: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    border: '1px solid #a855f7',
    borderRadius: '12px',
    cursor: 'pointer',
    boxShadow: '0 0 16px rgba(168,85,247,0.3)',
    transition: 'all 0.2s ease',
    fontFamily: 'monospace',
  },
  tabIcon: {
    fontSize: '16px',
  },
  tabLabel: {
    color: '#a855f7',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    fontFamily: 'monospace',
  },
  tabBadge: {
    background: '#a855f7',
    color: '#fff',
    borderRadius: '50%',
    width: '18px',
    height: '18px',
    fontSize: '10px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // modal container
  modal: {
    position: 'fixed',
    bottom: '24px',
    right: '24px',
    zIndex: 9999,
    width: '420px',
    background: 'linear-gradient(160deg, #0f0f1a 0%, #1a1a2e 100%)',
    border: '1px solid rgba(168,85,247,0.4)',
    borderRadius: '16px',
    boxShadow: '0 0 40px rgba(168,85,247,0.15), 0 20px 60px rgba(0,0,0,0.6)',
    fontFamily: 'monospace',
    overflow: 'hidden',
  },

  // header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderBottom: '1px solid rgba(168,85,247,0.2)',
    background: 'rgba(168,85,247,0.05)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  headerTitle: {
    color: '#e2e8f0',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.05em',
  },
  headerSub: {
    color: '#64748b',
    fontSize: '10px',
    letterSpacing: '0.08em',
    marginTop: '1px',
  },
  headerActions: {
    display: 'flex',
    gap: '6px',
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    padding: '4px 6px',
    borderRadius: '6px',
    fontSize: '14px',
    transition: 'color 0.15s, background 0.15s',
  },

  // body
  body: {
    padding: '16px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },

  // row layout
  row: {
    display: 'flex',
    gap: '10px',
  },

  // field
  fieldWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
  },
  label: {
    color: '#94a3b8',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
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
    transition: 'border-color 0.15s',
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
  textarea: {
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
  },

  // direction toggle
  directionWrap: {
    display: 'flex',
    gap: '6px',
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

  // subject preview
  previewBox: {
    background: 'rgba(168,85,247,0.06)',
    border: '1px solid rgba(168,85,247,0.2)',
    borderRadius: '8px',
    padding: '8px 10px',
  },
  previewLabel: {
    color: '#a855f7',
    fontSize: '11px',
    fontWeight: 700,
    marginBottom: '4px',
  },
  previewNote: {
    color: '#64748b',
    fontSize: '10px',
    lineHeight: 1.5,
  },
  previewExisting: {
    color: '#f59e0b',
    fontSize: '10px',
    marginTop: '4px',
  },

  // sync status
  syncBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 18px 10px',
  },
  syncDot: (syncing, error) => ({
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: error ? '#ef4444' : syncing ? '#f59e0b' : '#10b981',
    flexShrink: 0,
  }),
  syncText: {
    color: '#475569',
    fontSize: '10px',
    fontFamily: 'monospace',
  },

  // footer
  footer: {
    display: 'flex',
    gap: '8px',
    padding: '12px 18px',
    borderTop: '1px solid rgba(168,85,247,0.15)',
  },
  btnSecondary: {
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
    transition: 'all 0.15s',
  },
  btnPrimary: (disabled) => ({
    flex: 2,
    padding: '9px',
    background: disabled ? 'rgba(168,85,247,0.2)' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
    border: 'none',
    borderRadius: '8px',
    color: disabled ? '#64748b' : '#fff',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'monospace',
    cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: '0.05em',
    transition: 'all 0.15s',
  }),
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function FloatingJournalModal() {
  const { user } = useAuthStore();
  const bodyRef   = useRef(null);
  const syncTimer = useRef(null);

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

  // only render for admin roles
  if (!user || !ADMIN_ROLES.includes(user.role)) return null;

  // ── blur sync on tab visibility change ────────────────────────
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') syncDraft();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [syncDraft]);

  // ── debounced auto-sync on body change (3s idle) ──────────────
  const handleBodyChange = (val) => {
    updateDraft({ body: val });
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => syncDraft(), 3000);
  };

  // ── subject lookup on both fields filled ─────────────────────
  const handleSubjectChange = (field, val) => {
    updateDraft({ [field]: val });
    const { subject_table, subject_id } = draft;
    const table = field === 'subject_table' ? val : subject_table;
    const id    = field === 'subject_id'    ? val : subject_id;
    if (table && id) fetchSubjectPreview(table, id);
    if (!table || !id) clearSubjectPreview();
  };

  // ── submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const result = await submitNote();
    if (result.success) {
      toast.success('Note saved — FN-' + (result.note?.note_number ?? ''));
    } else {
      toast.error(result.message || 'Failed to save note');
    }
  };

  // ── sync status label ─────────────────────────────────────────
  const syncLabel = syncError
    ? `Sync error: ${syncError}`
    : isSyncing
      ? 'Syncing...'
      : lastSyncedAt
        ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
        : savedNoteId
          ? 'Draft saved'
          : 'Not yet synced';

  // ── minimised tab ─────────────────────────────────────────────
  if (!isOpen) {
    return (
      <div style={S.tab} onClick={open} title="Open financial note">
        <span style={S.tabIcon}>📓</span>
        <span style={S.tabLabel}>JOURNAL</span>
        {savedNoteId && <span style={S.tabBadge}>1</span>}
      </div>
    );
  }

  if (isMinimised) {
    return (
      <div style={S.tab} onClick={expand} title="Expand journal">
        <span style={S.tabIcon}>📓</span>
        <span style={S.tabLabel}>JOURNAL</span>
        {savedNoteId && <span style={S.tabBadge}>1</span>}
        <span style={{ color: '#475569', fontSize: '10px' }}>▲</span>
      </div>
    );
  }

  // ── full modal ────────────────────────────────────────────────
  return (
    <div style={S.modal}>

      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <span style={{ fontSize: '16px' }}>📓</span>
          <div>
            <div style={S.headerTitle}>FINANCIAL NOTE</div>
            <div style={S.headerSub}>SCRATCH PAD — SAVES TO DB</div>
          </div>
        </div>
        <div style={S.headerActions}>
          <button style={S.iconBtn} onClick={resetDraft} title="Clear draft">↺</button>
          <button style={S.iconBtn} onClick={minimise}   title="Minimise">─</button>
          <button style={S.iconBtn} onClick={close}      title="Close">✕</button>
        </div>
      </div>

      {/* Body */}
      <div style={S.body}>

        {/* Note type */}
        <div style={S.fieldWrap}>
          <label style={S.label}>Note Type</label>
          <select
            style={S.select}
            value={draft.note_type}
            onChange={e => updateDraft({ note_type: e.target.value })}
          >
            {NOTE_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Amount + currency + direction */}
        <div style={S.row}>
          <div style={S.fieldWrap}>
            <label style={S.label}>Amount</label>
            <input
              style={S.input}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={draft.amount}
              onChange={e => updateDraft({ amount: e.target.value })}
              onBlur={syncDraft}
            />
          </div>
          <div style={{ ...S.fieldWrap, flex: '0 0 72px' }}>
            <label style={S.label}>Currency</label>
            <input
              style={S.input}
              type="text"
              maxLength={8}
              value={draft.currency}
              onChange={e => updateDraft({ currency: e.target.value.toUpperCase() })}
              onBlur={syncDraft}
            />
          </div>
        </div>

        {/* Direction toggle */}
        <div style={S.fieldWrap}>
          <label style={S.label}>Direction</label>
          <div style={S.directionWrap}>
            {['in', 'out'].map(dir => (
              <button
                key={dir}
                style={S.dirBtn(draft.direction === dir, dir)}
                onClick={() => updateDraft({ direction: dir })}
              >
                {dir === 'in' ? '▲ MONEY IN' : '▼ MONEY OUT'}
              </button>
            ))}
          </div>
        </div>

        {/* Subject table + ID */}
        <div style={S.row}>
          <div style={S.fieldWrap}>
            <label style={S.label}>Linked To</label>
            <select
              style={S.select}
              value={draft.subject_table}
              onChange={e => handleSubjectChange('subject_table', e.target.value)}
            >
              <option value="">— none —</option>
              {SUBJECT_TABLES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div style={{ ...S.fieldWrap, flex: '0 0 90px' }}>
            <label style={S.label}>Record ID</label>
            <input
              style={S.input}
              type="number"
              min="1"
              placeholder="ID"
              value={draft.subject_id}
              onChange={e => handleSubjectChange('subject_id', e.target.value)}
            />
          </div>
        </div>

        {/* Subject preview */}
        {isLoadingPreview && (
          <div style={S.previewBox}>
            <div style={S.previewNote}>Looking up record...</div>
          </div>
        )}
        {subjectPreview && !isLoadingPreview && (
          <div style={S.previewBox}>
            <div style={S.previewLabel}>🔗 {subjectPreview.label}</div>
            {subjectPreview.existingNotes?.length > 0 && (
              <div style={S.previewExisting}>
                ⚠ {subjectPreview.existingNotes.length} existing note{subjectPreview.existingNotes.length > 1 ? 's' : ''} on this record
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
            ref={bodyRef}
            style={S.textarea}
            placeholder="What happened? Who authorised it? Mpesa ref? Any context that helps reconciliation later..."
            value={draft.body}
            onChange={e => handleBodyChange(e.target.value)}
            onBlur={syncDraft}
          />
        </div>

      </div>

      {/* Sync status */}
      <div style={S.syncBar}>
        <div style={S.syncDot(isSyncing, !!syncError)} />
        <span style={S.syncText}>{syncLabel}</span>
      </div>

      {/* Footer */}
      <div style={S.footer}>
        <button style={S.btnSecondary} onClick={resetDraft}>CLEAR</button>
        <button
          style={S.btnPrimary(!draft.body?.trim())}
          disabled={!draft.body?.trim()}
          onClick={handleSubmit}
        >
          {isSyncing ? 'SAVING...' : 'SAVE NOTE'}
        </button>
      </div>

    </div>
  );
}