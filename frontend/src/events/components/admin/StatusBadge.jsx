import { colors } from '../../../_shared/theme/tokens';
import { STATUS } from '../../lib/eventFormat';

const TONES = {
  neutral: { background: colors.neutralBg, color: colors.neutralText },
  success: { background: colors.successBg, color: colors.successText },
  danger: { background: colors.dangerBg, color: colors.dangerText },
  warning: { background: colors.warningBg, color: colors.warningText },
};

/** "On sale" / "Draft" / "Cancelled" / "Postponed", with an "Over" note once the last date has passed. */
export default function StatusBadge({ status, over = false }) {
  const s = STATUS[status] ?? STATUS.draft;
  const label = over && status === 'published' ? 'Over' : s.label;

  return <span style={{ ...TONES[over && status === 'published' ? 'neutral' : s.tone], padding: '2px 9px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>;
}
