import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CheckSquare, Square } from 'lucide-react';
import LoadingSpinner from '../../../_shared/components/layout/LoadingSpinner';
import EmptyState from '../../../_shared/components/layout/EmptyState';

const thStyle = {
  padding: '10px 20px', textAlign: 'left',
  fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-tertiary)',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  borderBottom: '1.5px solid color-mix(in srgb, var(--color-primary-500) 12%, transparent)', whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '12px 20px', fontSize: '0.82rem', color: 'var(--text-primary)',
  verticalAlign: 'middle',
};

const pageBtn = (disabled) => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 8,
  border: '1.5px solid color-mix(in srgb, var(--color-primary-500) 18%, transparent)', cursor: disabled ? 'not-allowed' : 'pointer',
  color: disabled ? 'var(--line, #d1d5db)' : 'var(--color-primary-500)', opacity: disabled ? 0.3 : 1,
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
      <div style={{ borderRadius: 16, background: 'var(--surface-card, #fff)', border: '1px solid var(--line, color-mix(in srgb, var(--color-primary-500) 12%, transparent))', overflow: 'hidden', boxShadow: '0 2px 16px color-mix(in srgb, var(--color-primary-500) 7%, transparent)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'color-mix(in srgb, var(--color-primary-500) 3%, transparent)' }}>
                {selectable && (
                  <th style={{ ...thStyle, width: 44 }}>
                    <button onClick={onSelectAll} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
                      {allSelected
                        ? <CheckSquare size={18} color="var(--color-primary-500)" />
                        : someSelected
                          ? <div style={{ width: 18, height: 18, border: '2px solid var(--color-primary-500)', borderRadius: 4, background: 'color-mix(in srgb, var(--color-primary-500) 10%, transparent)' }} />
                          : <Square size={18} color="var(--line, #d1d5db)" />}
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
                    style={{
                      background: isSelected ? 'color-mix(in srgb, var(--color-primary-500) 5%, transparent)' : 'transparent',
                      boxShadow: isSelected ? 'inset 3px 0 0 var(--color-primary-500)' : 'inset 3px 0 0 transparent',
                      transition: 'background 200ms ease, box-shadow 200ms ease',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'color-mix(in srgb, var(--color-primary-500) 6%, transparent)';
                        e.currentTarget.style.boxShadow = 'inset 3px 0 0 color-mix(in srgb, var(--color-primary-500) 25%, transparent)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.boxShadow = 'inset 3px 0 0 transparent';
                      }
                    }}
                  >
                    {selectable && (
                      <td style={tdStyle}>
                        <button onClick={() => onSelectRow(row.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
                          {isSelected
                            ? <CheckSquare size={18} color="var(--color-primary-500)" />
                            : <Square size={18} color="var(--line, #d1d5db)" />}
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--color-primary-500) 12%, transparent)', boxShadow: '0 2px 12px color-mix(in srgb, var(--color-primary-500) 6%, transparent)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', fontWeight: 500 }}>
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
                if (ellipsis) return <span key={page} style={{ color: 'var(--text-tertiary)', padding: '0 4px', lineHeight: '32px' }}>…</span>;
                const isActive = page === pagination.current_page;
                return (
                  <button key={page} onClick={() => onPageChange(page)}
                    style={{ width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${isActive ? 'var(--color-primary-500)' : 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)'}`, background: isActive ? 'var(--color-primary-500)' : 'transparent', color: isActive ? 'white' : 'var(--text-primary)', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', boxShadow: isActive ? '0 0 0 3px color-mix(in srgb, var(--color-primary-500) 15%, transparent)' : 'none', transition: 'all 150ms' }}>
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