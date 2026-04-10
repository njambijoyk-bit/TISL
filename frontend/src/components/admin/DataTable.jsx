import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CheckSquare, Square } from 'lucide-react';
import LoadingSpinner from '../layout/LoadingSpinner';
import EmptyState from '../layout/EmptyState';

const thStyle = {
  padding: '10px 20px', textAlign: 'left',
  fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '12px 20px', fontSize: '0.82rem', color: '#374151',
  borderBottom: '1px solid #f9fafb', verticalAlign: 'middle',
};

const pageBtn = (disabled) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 8,
  border: '1.5px solid #e5e7eb', cursor: disabled ? 'not-allowed' : 'pointer',
  color: disabled ? '#d1d5db' : '#374151', opacity: disabled ? 0.5 : 1,
  transition: 'all 150ms', background: 'transparent',
});

export default function DataTable({
  columns, data, loading, pagination, onPageChange,
  emptyMessage = 'No data available',
  selectable = false, selectedIds = [], onSelectAll, onSelectRow,
}) {
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
      <LoadingSpinner />
    </div>
  );

  if (!data || data.length === 0) return <EmptyState message={emptyMessage} />;

  const allSelected  = data.length > 0 && selectedIds.length === data.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < data.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Table */}
      <div style={{ borderRadius: 16, border: '1px solid #f3f4f6', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {selectable && (
                  <th style={{ ...thStyle, width: 44 }}>
                    <button onClick={onSelectAll} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
                      {allSelected
                        ? <CheckSquare size={18} color="#a855f7" />
                        : someSelected
                          ? <div style={{ width: 18, height: 18, border: '2px solid #a855f7', borderRadius: 4, background: 'rgba(168,85,247,0.1)' }} />
                          : <Square size={18} color="#d1d5db" />}
                    </button>
                  </th>
                )}
                {columns.map((col, i) => (
                  <th key={i} style={thStyle}>{col.header}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {data.map((row, rowIndex) => {
                const isSelected = selectable && selectedIds.includes(row.id);
                return (
                  <tr key={rowIndex}
                    style={{ background: isSelected ? 'rgba(168,85,247,0.04)' : 'transparent', transition: 'background 150ms' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#fafafa'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {selectable && (
                      <td style={tdStyle}>
                        <button onClick={() => onSelectRow(row.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {isSelected
                            ? <CheckSquare size={18} color="#a855f7" />
                            : <Square size={18} color="#d1d5db" />}
                        </button>
                      </td>
                    )}
                    {columns.map((col, colIndex) => (
                      <td key={colIndex} style={tdStyle}>
                        {typeof col.accessor === 'function'
                          ? col.accessor(row)
                          : col.render
                            ? col.render(row)
                            : row[col.accessor]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {pagination && pagination.last_page > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 12, border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 500 }}>
            Showing {((pagination.current_page - 1) * pagination.per_page) + 1}–{Math.min(pagination.current_page * pagination.per_page, pagination.total)} of {pagination.total}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => onPageChange(1)} disabled={pagination.current_page === 1} style={pageBtn(pagination.current_page === 1)} title="First page">
              <ChevronsLeft size={15} />
            </button>
            <button onClick={() => onPageChange(pagination.current_page - 1)} disabled={pagination.current_page === 1} style={pageBtn(pagination.current_page === 1)} title="Previous page">
              <ChevronLeft size={15} />
            </button>

            <div style={{ display: 'flex', gap: 4 }}>
              {[...Array(pagination.last_page)].map((_, i) => {
                const page = i + 1;
                const near = page === 1 || page === pagination.last_page || (page >= pagination.current_page - 2 && page <= pagination.current_page + 2);
                const ellipsis = page === pagination.current_page - 3 || page === pagination.current_page + 3;
                if (!near && !ellipsis) return null;
                if (ellipsis) return <span key={page} style={{ color: '#9ca3af', padding: '0 4px', lineHeight: '32px' }}>…</span>;
                const isActive = page === pagination.current_page;
                return (
                  <button key={page} onClick={() => onPageChange(page)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${isActive ? '#a855f7' : '#e5e7eb'}`, background: isActive ? '#a855f7' : 'transparent', color: isActive ? 'white' : '#374151', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', boxShadow: isActive ? '0 0 0 3px rgba(168,85,247,0.15)' : 'none', transition: 'all 150ms' }}>
                    {page}
                  </button>
                );
              })}
            </div>

            <button onClick={() => onPageChange(pagination.current_page + 1)} disabled={pagination.current_page === pagination.last_page} style={pageBtn(pagination.current_page === pagination.last_page)} title="Next page">
              <ChevronRight size={15} />
            </button>
            <button onClick={() => onPageChange(pagination.last_page)} disabled={pagination.current_page === pagination.last_page} style={pageBtn(pagination.current_page === pagination.last_page)} title="Last page">
              <ChevronsRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}