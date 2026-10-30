import { useEffect, useState } from 'react';
import { subscribe } from './visualProgress';
import { colors } from '../../../_shared/theme/tokens';

/** A small panel in the top right corner while pictures are being made: one bar per picture, gone a moment after it is saved. */
export default function ExportProgress() {
  const [jobs, setJobs] = useState([]);
  useEffect(() => subscribe(setJobs), []);
  if (!jobs.length) return null;
  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', top: 16, right: 16, zIndex: 60, display: 'grid', gap: 8, width: 260 }}>
      {jobs.map((j) => {
        const tone = j.state === 'failed' ? colors.dangerText : j.state === 'done' ? colors.successText : colors.primary;
        return (
          <div key={j.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-card, #fff)', border: `1px solid ${colors.tint(0.18)}`, boxShadow: '0 6px 20px rgba(0,0,0,0.14)', fontSize: '0.76rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</b>
              <span style={{ color: tone, fontWeight: 700, flexShrink: 0 }}>{j.state === 'failed' ? 'Failed' : j.state === 'queued' ? 'Waiting' : `${Math.round(j.pct)}%`}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: colors.tint(0.12), overflow: 'hidden' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(j.pct)} aria-label={`Making ${j.name}`}>
              <div style={{ width: `${j.state === 'failed' ? 100 : j.pct}%`, height: '100%', background: tone, transition: 'width 250ms ease-out' }} />
            </div>
            <div style={{ marginTop: 5, color: colors.textMuted }}>{j.step}</div>
          </div>
        );
      })}
    </div>
  );
}
