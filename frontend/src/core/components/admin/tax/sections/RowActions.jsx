import { Pencil, Trash2 } from 'lucide-react';
import { colors, btnIcon } from '../../../../../_shared/theme/tokens';

/** Edit / delete icon buttons for table rows. Stops the click reaching the row. */
export default function RowActions({ onEdit, onDelete, label = 'item' }) {
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
      {onEdit && (
        <button type="button" aria-label={`Edit ${label}`} onClick={stop(onEdit)} style={btnIcon}
          onMouseEnter={(e) => { e.currentTarget.style.background = colors.tint(0.08); e.currentTarget.style.color = colors.primary; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textFaint; }}>
          <Pencil size={13} />
        </button>
      )}
      {onDelete && (
        <button type="button" aria-label={`Delete ${label}`} onClick={stop(onDelete)} style={btnIcon}
          onMouseEnter={(e) => { e.currentTarget.style.background = colors.dangerBg; e.currentTarget.style.color = colors.danger; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = colors.textFaint; }}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}
