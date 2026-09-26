import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function AdminPagination({ pagination, onPageChange }) {
  if (!pagination || pagination.last_page <= 1) return null;

  const { current_page, last_page } = pagination;

  const getPages = () => {
    const pages = [];
    let prevWasEllipsis = false;

    for (let i = 1; i <= last_page; i++) {
        const isEdge    = i === 1 || i === last_page;
        const isNear    = i >= current_page - 2 && i <= current_page + 2;
        const isGapMark = i === current_page - 3 || i === current_page + 3;

        if (isEdge || isNear) {
        pages.push(i);
        prevWasEllipsis = false;
        } else if (isGapMark && !prevWasEllipsis) {
        // only add ellipsis if the adjacent slot isn't already a page number
        const prev = pages[pages.length - 1];
        const next = i + 1; // lookahead
        if (typeof prev === 'number' && prev !== i - 1) {
            pages.push('...');
            prevWasEllipsis = true;
        }
        }
    }

    return pages;
    };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 32 }}>

      {/* Prev */}
      <button
        onClick={() => onPageChange(current_page - 1)}
        disabled={current_page === 1}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '8px 14px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 600,
          border: '1.5px solid #e5e7eb', background: 'white', color: '#374151',
          cursor: current_page === 1 ? 'not-allowed' : 'pointer',
          opacity: current_page === 1 ? 0.4 : 1,
          transition: 'all 150ms ease',
        }}
        onMouseEnter={e => { if (current_page !== 1) { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.color = '#a855f7'; }}}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#374151'; }}
      >
        <ChevronLeft size={15} /> Prev
      </button>

      {/* Page numbers */}
      {getPages().map((page, idx) =>
        page === '...' ? (
          <span key={`dot-${idx}`} style={{ padding: '0 4px', color: '#9ca3af', fontSize: '0.85rem' }}>…</span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            style={{
              width: 38, height: 38, borderRadius: 10, fontSize: '0.82rem', fontWeight: 700,
              border: `1.5px solid ${page === current_page ? '#a855f7' : '#e5e7eb'}`,
              background: page === current_page ? '#a855f7' : 'white',
              color: page === current_page ? 'white' : '#374151',
              cursor: 'pointer', transition: 'all 150ms ease',
              boxShadow: page === current_page ? '0 2px 8px rgba(168,85,247,0.35)' : 'none',
            }}
            onMouseEnter={e => { if (page !== current_page) { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.color = '#a855f7'; }}}
            onMouseLeave={e => { if (page !== current_page) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#374151'; }}}
          >
            {page}
          </button>
        )
      )}

      {/* Next */}
      <button
        onClick={() => onPageChange(current_page + 1)}
        disabled={current_page === last_page}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '8px 14px', borderRadius: 10, fontSize: '0.8rem', fontWeight: 600,
          border: '1.5px solid #e5e7eb', background: 'white', color: '#374151',
          cursor: current_page === last_page ? 'not-allowed' : 'pointer',
          opacity: current_page === last_page ? 0.4 : 1,
          transition: 'all 150ms ease',
        }}
        onMouseEnter={e => { if (current_page !== last_page) { e.currentTarget.style.borderColor = '#a855f7'; e.currentTarget.style.color = '#a855f7'; }}}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#374151'; }}
      >
        Next <ChevronRight size={15} />
      </button>
    </div>
  );
}