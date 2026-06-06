import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../../store';
import useFinancialJournalStore from '../../../store/useFinancialJournalStore';
import api from '../../../api/axios';
import toast from 'react-hot-toast';

const NOTE_TYPE_COLORS = {
  refund:             { bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)',    text: '#ef4444' },
  overpayment:        { bg: 'rgba(245,158,11,0.1)',   border: 'rgba(245,158,11,0.3)',   text: '#f59e0b' },
  credit_adjustment:  { bg: 'rgba(59,130,246,0.1)',   border: 'rgba(59,130,246,0.3)',   text: '#3b82f6' },
  loyalty_adjustment: { bg: 'rgba(168,85,247,0.1)',   border: 'rgba(168,85,247,0.3)',   text: '#a855f7' },
  manual_payment:     { bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.3)',   text: '#10b981' },
  reversal:           { bg: 'rgba(249,115,22,0.1)',   border: 'rgba(249,115,22,0.3)',   text: '#f97316' },
  other:              { bg: 'rgba(100,116,139,0.1)',  border: 'rgba(100,116,139,0.3)',  text: '#64748b' },
};

const DIRECTION_COLORS = {
  in:  { text: '#10b981', label: '▲ IN' },
  out: { text: '#ef4444', label: '▼ OUT' },
};

const S = {
  page: {
    minHeight: '100vh',
    background: 'var(--bg-primary, #0f0f1a)',
    padding: '32px',
    fontFamily: 'monospace',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '28px',
    flexWrap: 'wrap',
    gap: '16px',
  },
  title: {
    color: '#e2e8f0',
    fontSize: '22px',
    fontWeight: 800,
    letterSpacing: '0.04em',
    marginBottom: '4px',
  },
  subtitle: {
    color: '#475569',
    fontSize: '12px',
    letterSpacing: '0.06em',
  },
  newBtn: {
    padding: '10px 20px',
    background: 'linear-gradient(135deg, #a855f7, #7c3aed)',
    border: 'none',
    borderRadius: '10px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 700,
    fontFamily: 'monospace',
    cursor: 'pointer',
    letterSpacing: '0.05em',
  },

  // filters
  filters: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  filterInput: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(168,85,247,0.2)',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '12px',
    padding: '8px 12px',
    fontFamily: 'monospace',
    outline: 'none',
    minWidth: '160px',
  },
  filterSelect: {
    background: '#0f0f1a',
    border: '1px solid rgba(168,85,247,0.2)',
    borderRadius: '8px',
    color: '#e2e8f0',
    fontSize: '12px',
    padding: '8px 12px',
    fontFamily: 'monospace',
    outline: 'none',
    cursor: 'pointer',
  },

  // table
  tableWrap: {
    background: 'linear-gradient(160deg, #0f0f1a 0%, #1a1a2e 100%)',
    border: '1px solid rgba(168,85,247,0.2)',
    borderRadius: '14px',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    color: '#475569',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    borderBottom: '1px solid rgba(168,85,247,0.15)',
    background: 'rgba(168,85,247,0.04)',
    fontFamily: 'monospace',
  },
  td: {
    padding: '14px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'top',
  },
  tr: (hover) => ({
    background: hover ? 'rgba(168,85,247,0.04)' : 'transparent',
    transition: 'background 0.15s',
    cursor: 'default',
  }),

  // pills
  pill: (colors) => ({
    display: 'inline-block',
    padding: '3px 8px',
    borderRadius: '6px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    background: colors.bg,
    border: `1px solid ${colors.border}`,
    color: colors.text,
    fontFamily: 'monospace',
    textTransform: 'uppercase',
  }),

  noteNumber: {
    color: '#a855f7',
    fontSize: '11px',
    fontWeight: 700,
  },
  refLabel: {
    color: '#94a3b8',
    fontSize: '11px',
    marginTop: '3px',
  },
  body: {
    color: '#cbd5e1',
    fontSize: '12px',
    lineHeight: 1.5,
    maxWidth: '360px',
  },
  bodyMuted: {
    color: '#475569',
    fontSize: '11px',
    marginTop: '4px',
    fontStyle: 'italic',
  },
  amount: (dir) => ({
    color: dir === 'in' ? '#10b981' : dir === 'out' ? '#ef4444' : '#94a3b8',
    fontSize: '13px',
    fontWeight: 700,
    fontFamily: 'monospace',
  }),
  meta: {
    color: '#475569',
    fontSize: '10px',
    lineHeight: 1.6,
  },
  deleteBtn: {
    background: 'transparent',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '6px',
    color: '#ef4444',
    fontSize: '10px',
    padding: '4px 8px',
    cursor: 'pointer',
    fontFamily: 'monospace',
    transition: 'all 0.15s',
  },

  // empty
  empty: {
    padding: '60px 20px',
    textAlign: 'center',
    color: '#475569',
    fontSize: '13px',
    fontFamily: 'monospace',
  },

  // pagination
  pagination: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px',
    borderTop: '1px solid rgba(168,85,247,0.1)',
  },
  pageInfo: {
    color: '#475569',
    fontSize: '11px',
    fontFamily: 'monospace',
  },
  pageButtons: {
    display: 'flex',
    gap: '6px',
  },
  pageBtn: (disabled) => ({
    padding: '6px 12px',
    background: 'transparent',
    border: '1px solid rgba(168,85,247,0.2)',
    borderRadius: '6px',
    color: disabled ? '#334155' : '#a855f7',
    fontSize: '11px',
    fontFamily: 'monospace',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }),
};

export default function FinancialNotes() {
  const { open: openModal } = useFinancialJournalStore();

  const [notes, setNotes]       = useState([]);
  const [meta, setMeta]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [hoveredRow, setHovered] = useState(null);
  const [page, setPage]         = useState(1);

  const [filters, setFilters] = useState({
    search:       '',
    note_type:    '',
    direction:    '',
    from:         '',
    to:           '',
  });

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, per_page: 30, ...filters };
      // strip empty
      Object.keys(params).forEach(k => !params[k] && delete params[k]);
      const res = await api.get('/admin/financial-notes', { params });
      setNotes(res.data.data);
      setMeta(res.data);
    } catch {
      toast.error('Failed to load notes');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  const handleDelete = async (note) => {
    if (!confirm(`Delete note ${note.note_number}?`)) return;
    try {
      await api.delete(`/admin/financial-notes/${note.id}`);
      toast.success('Note deleted');
      fetchNotes();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Cannot delete note');
    }
  };

  const setFilter = (key, val) => {
    setFilters(f => ({ ...f, [key]: val }));
    setPage(1);
  };

  return (
    <div style={S.page}>

      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.title}>📓 FINANCIAL NOTES</div>
          <div style={S.subtitle}>SCRATCH PAD — ADMIN JOURNAL FOR FINANCIAL EVENTS</div>
        </div>
        <button style={S.newBtn} onClick={openModal}>+ NEW NOTE</button>
      </div>

      {/* Filters */}
      <div style={S.filters}>
        <input
          style={S.filterInput}
          placeholder="Search notes..."
          value={filters.search}
          onChange={e => setFilter('search', e.target.value)}
        />
        <select style={S.filterSelect} value={filters.note_type} onChange={e => setFilter('note_type', e.target.value)}>
          <option value="">All Types</option>
          <option value="refund">Refund</option>
          <option value="overpayment">Overpayment</option>
          <option value="credit_adjustment">Credit Adjustment</option>
          <option value="loyalty_adjustment">Loyalty Adjustment</option>
          <option value="manual_payment">Manual Payment</option>
          <option value="reversal">Reversal</option>
          <option value="other">Other</option>
        </select>
        <select style={S.filterSelect} value={filters.direction} onChange={e => setFilter('direction', e.target.value)}>
          <option value="">All Directions</option>
          <option value="in">Money In</option>
          <option value="out">Money Out</option>
        </select>
        <input
          style={S.filterInput}
          type="date"
          value={filters.from}
          onChange={e => setFilter('from', e.target.value)}
          title="From date"
        />
        <input
          style={S.filterInput}
          type="date"
          value={filters.to}
          onChange={e => setFilter('to', e.target.value)}
          title="To date"
        />
      </div>

      {/* Table */}
      <div style={S.tableWrap}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Note</th>
              <th style={S.th}>Type</th>
              <th style={S.th}>Amount</th>
              <th style={S.th}>Details</th>
              <th style={S.th}>Linked To</th>
              <th style={S.th}>By</th>
              <th style={S.th}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} style={S.empty}>Loading...</td>
              </tr>
            ) : notes.length === 0 ? (
              <tr>
                <td colSpan={7} style={S.empty}>No notes found. Use the floating journal to add one.</td>
              </tr>
            ) : notes.map(note => (
              <tr
                key={note.id}
                style={S.tr(hoveredRow === note.id)}
                onMouseEnter={() => setHovered(note.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Note number + date */}
                <td style={S.td}>
                  <div style={S.noteNumber}>{note.note_number}</div>
                  <div style={S.meta}>
                    {new Date(note.created_at).toLocaleDateString('en-KE', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </div>
                </td>

                {/* Type pill */}
                <td style={S.td}>
                  <span style={S.pill(NOTE_TYPE_COLORS[note.note_type] || NOTE_TYPE_COLORS.other)}>
                    {note.note_type.replace(/_/g, ' ')}
                  </span>
                </td>

                {/* Amount */}
                <td style={S.td}>
                  {note.amount ? (
                    <>
                      <div style={S.amount(note.direction)}>
                        {note.direction && (
                          <span style={{ fontSize: '10px', marginRight: '4px' }}>
                            {DIRECTION_COLORS[note.direction]?.label}
                          </span>
                        )}
                        {Number(note.amount).toLocaleString('en-KE', {
                          minimumFractionDigits: 2
                        })} {note.currency}
                      </div>
                    </>
                  ) : (
                    <span style={{ color: '#334155', fontSize: '11px' }}>—</span>
                  )}
                </td>

                {/* Body + ref label */}
                <td style={S.td}>
                  <div style={S.body}>{note.body}</div>
                  {note.reference_label && (
                    <div style={S.refLabel}>🔗 {note.reference_label}</div>
                  )}
                </td>

                {/* Linked record */}
                <td style={S.td}>
                  {note.subject_table ? (
                    <div style={S.meta}>
                      <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                        {note.subject_table}
                      </div>
                      <div style={{ color: '#475569' }}>#{note.subject_id}</div>
                    </div>
                  ) : (
                    <span style={{ color: '#334155', fontSize: '11px' }}>—</span>
                  )}
                </td>

                {/* Author */}
                <td style={S.td}>
                  <div style={{ color: '#94a3b8', fontSize: '11px' }}>
                    {note.author?.name ?? `User #${note.written_by}`}
                  </div>
                </td>

                {/* Delete */}
                <td style={S.td}>
                  <button style={S.deleteBtn} onClick={() => handleDelete(note)}>
                    DELETE
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Pagination */}
        {meta && meta.last_page > 1 && (
          <div style={S.pagination}>
            <span style={S.pageInfo}>
              {meta.from}–{meta.to} of {meta.total} notes
            </span>
            <div style={S.pageButtons}>
              <button
                style={S.pageBtn(page === 1)}
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
              >← PREV</button>
              <button
                style={S.pageBtn(page === meta.last_page)}
                disabled={page === meta.last_page}
                onClick={() => setPage(p => p + 1)}
              >NEXT →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}