import { AlertTriangle } from 'lucide-react';
import { colors } from '../../../../_shared/theme/tokens';

/**
 * Says so when the scheduler or the queue worker is not running: without them emails and WhatsApp messages sit unsent and nothing else would tell you.
 * Nothing is shown when both are fine. `health` comes from the notification settings endpoint.
 */
export default function HealthBanner({ health }) {
  if (!health || health.ok) return null;
  const parts = [['Scheduler', health.scheduler], ['Queue worker', health.queue]].filter(([, p]) => p.state !== 'ok' && !(p === health.queue && p.state === 'unknown' && health.scheduler.state !== 'ok'));
  if (!parts.length) return null;
  return (
    <div role="alert" style={{ margin: '0 0 16px', padding: '12px 14px', borderRadius: 10, background: colors.warningBg, border: `1px solid ${colors.warning}`, color: colors.warningText, display: 'flex', gap: 10 }}>
      <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
      <div style={{ fontSize: '0.84rem', lineHeight: 1.5 }}>
        <strong>Messages may not be going out.</strong>
        {parts.map(([name, p]) => <p key={name} style={{ margin: '4px 0 0' }}><strong>{name}:</strong> {p.message}</p>)}
        {health.queue.pending > 0 && <p style={{ margin: '4px 0 0' }}>{health.queue.pending} message job(s) are waiting in the queue{health.queue.failed > 0 ? `, and ${health.queue.failed} failed` : ''}.</p>}
      </div>
    </div>
  );
}
