import { Chip } from './ui';

/** A client's health (build 3.5): green, amber or red, as one of the theme's named statuses, with the reasons when asked for. */
const LOOK = { green: ['good', 'Healthy'], amber: ['warning', 'Needs attention'], red: ['problem', 'At risk'] };

export default function HealthDot({ health, withReasons = false }) {
  if (!health) return null;
  const [status, label] = LOOK[health.colour];
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }} data-health={health.colour}>
      <Chip status={status}>{label}</Chip>
      {withReasons && health.reasons.length > 0 && <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{health.reasons.join(' · ')}</span>}
    </span>
  );
}
