import { colors, card, radius } from '../../../../_shared/theme/tokens';

/**
 * Plain admin table with loading and empty states.
 *
 * @param {{key: string, label: string, render?: (row) => ReactNode, align?: 'left'|'right', width?: number}[]} columns
 * @param {object[]} rows
 * @param {ReactNode} empty    what to show with no rows (sentence + optional action)
 * @param {(row) => void} onRowClick
 */
export default function SimpleTable({ columns, rows, loading, empty, onRowClick, rowKey = 'id' }) {
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.tint(0.1)}`, background: colors.tint(0.02) }}>
              {columns.map((c) => (
                <th key={c.key} scope="col" style={{
                  padding: '10px 16px', textAlign: c.align ?? 'left', minWidth: c.width,
                  fontSize: '0.65rem', fontWeight: 700, color: colors.textFaint, whiteSpace: 'nowrap',
                }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && !rows.length ? (
              [0, 1, 2].map((i) => (
                <tr key={i}>
                  <td colSpan={columns.length} style={{ padding: '10px 16px' }}>
                    <div style={{ height: 18, borderRadius: radius.sm, background: colors.tint(0.06) }} />
                  </td>
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: '36px 16px', textAlign: 'center', color: colors.textMuted, fontSize: '0.82rem' }}>
                  {empty ?? 'Nothing here yet.'}
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={row[rowKey] ?? i}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{
                    borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${colors.tint(0.05)}`,
                    cursor: onRowClick ? 'pointer' : 'default',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = colors.tint(0.02); }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {columns.map((c) => (
                    <td key={c.key} style={{ padding: '11px 16px', textAlign: c.align ?? 'left', color: colors.textBody, verticalAlign: 'middle' }}>
                      {c.render ? c.render(row) : (row[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
