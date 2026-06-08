import { Circle, Clock, CheckCircle2, Ban } from 'lucide-react';
import '../../styles/bug.css';

const CONFIG = {
  open: {
    label: 'Open',
    icon: Circle,
    className: 'bug-badge-open',
  },
  in_progress: {
    label: 'In Progress',
    icon: Clock,
    className: 'bug-badge-progress',
  },
  resolved: {
    label: 'Resolved',
    icon: CheckCircle2,
    className: 'bug-badge-resolved',
  },
  wont_fix: {
    label: "Won't Fix",
    icon: Ban,
    className: 'bug-badge-wontfix',
  },
};

/**
 * StatusBadge
 * @param {'open'|'in_progress'|'resolved'|'wont_fix'} status
 * @param {'sm'|'md'} size
 * @param {boolean} showIcon
 */
export default function StatusBadge({ status, size = 'sm', showIcon = true }) {
  const cfg = CONFIG[status] ?? CONFIG.open;
  const Icon = cfg.icon;
  const sizeClass = size === 'md' ? 'bug-badge-md' : 'bug-badge-sm';

  return (
    <span className={`bug-badge ${sizeClass} ${cfg.className}`}>
      {showIcon && <Icon size={10} style={{ flexShrink: 0 }} />}
      {cfg.label}
    </span>
  );
}
