import { ArrowDown, ArrowRight, ArrowUp, Flame } from 'lucide-react';
import '../../styles/bug.css';

const CONFIG = {
  low: {
    label: 'Low',
    icon: ArrowDown,
    className: 'bug-badge-priority-low',
    pulse: false,
  },
  medium: {
    label: 'Medium',
    icon: ArrowRight,
    className: 'bug-badge-priority-medium',
    pulse: false,
  },
  high: {
    label: 'High',
    icon: ArrowUp,
    className: 'bug-badge-priority-high',
    pulse: false,
  },
  critical: {
    label: 'Critical',
    icon: Flame,
    className: 'bug-badge-priority-critical',
    pulse: true,
  },
};

/**
 * PriorityBadge
 * @param {'low'|'medium'|'high'|'critical'} priority
 * @param {'sm'|'md'} size
 * @param {boolean} showIcon
 */
export default function PriorityBadge({ priority, size = 'sm', showIcon = true }) {
  const cfg = CONFIG[priority] ?? CONFIG.medium;
  const Icon = cfg.icon;
  const sizeClass = size === 'md' ? 'bug-badge-md' : 'bug-badge-sm';

  return (
    <span className={`bug-badge ${sizeClass} ${cfg.className}`}>
      {showIcon && (
        <span className={cfg.pulse ? 'bug-relative-pulse' : undefined}>
          {cfg.pulse && <span className="bug-pulse-ring" />}
          <Icon size={10} style={{ flexShrink: 0, position: 'relative' }} />
        </span>
      )}
      {cfg.label}
    </span>
  );
}
