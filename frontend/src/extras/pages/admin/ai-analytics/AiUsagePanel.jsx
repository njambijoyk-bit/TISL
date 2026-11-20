import { useEffect, useState } from 'react';
import aiAnalyticsAPI from '../../../../_shared/api/aiAnalytics';
import { amount } from './aiFormat';

const C = { card: 'var(--surface-card, #fff)', border: 'color-mix(in srgb, var(--color-primary-500) 18%, transparent)', accent: 'var(--color-primary-500)', mid: 'var(--color-text-secondary)', dim: 'var(--color-text-tertiary)', bad: 'var(--color-error-600, #dc2626)', warn: 'var(--color-warning-600, #b45309)' };
const th = { textAlign: 'left', padding: '7px 9px', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: C.mid, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' };
const td = { padding: '7px 9px', fontSize: '0.76rem', borderBottom: `1px solid ${C.border}`, fontVariantNumeric: 'tabular-nums' };
const r = { ...td, textAlign: 'right' };
const n = (x) => Number(x ?? 0).toLocaleString();
const box = { padding: 16, borderRadius: 14, border: `1px solid ${C.border}`, background: C.card, display: 'grid', gap: 10, minWidth: 0 };

/** AI → Keys, Usage tab (docs/AI_PURPOSES_SPEC.md, build A.3): from the call log, never what was asked. Costs are estimates from rough rates, not a bill. */
export default function AiUsagePanel({ purposes }) {
  const [u, setU] = useState(null);
  const [problem, setProblem] = useState('');
  useEffect(() => { aiAnalyticsAPI.getUsage().then(setU).catch(() => setProblem('The usage could not be loaded.')); }, []);
  if (problem) return <p role="alert" style={{ color: C.bad, fontSize: '0.8rem' }}>{problem}</p>;
  if (!u) return null;
  if (!u.ready) return <p style={{ color: C.mid, fontSize: '0.8rem' }}>Usage needs database script <code>270_ai_purposes.sql</code>.</p>;
  const name = (k) => purposes.find((p) => p.key === k)?.name ?? k;
  const most = Math.max(1, ...u.months.flatMap((m) => Object.values(m.by_purpose).map((x) => x.tokens)), ...u.months.map((m) => Object.values(m.by_purpose).reduce((a, x) => a + x.tokens, 0)));

  return (
    <div style={{ display: 'grid', gap: 16 }} data-ai-usage-tab>
      <section style={box}>
        <strong style={{ fontSize: '0.9rem' }}>{u.month}, by purpose</strong>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 620 }}>
            <thead><tr><th style={th}>Purpose</th><th style={{ ...th, textAlign: 'right' }}>Calls</th><th style={{ ...th, textAlign: 'right' }}>Fell back</th><th style={{ ...th, textAlign: 'right' }}>Failed tries</th><th style={{ ...th, textAlign: 'right' }}>Tokens</th><th style={{ ...th, textAlign: 'right' }}>Est. cost</th><th style={{ ...th, textAlign: 'right' }}>Avg time</th><th style={th}>Limit</th></tr></thead>
            <tbody>
              {u.purposes.map((p) => (
                <tr key={p.key} data-ai-usage-purpose={p.key}>
                  <td style={td}>{p.name}</td><td style={r}>{n(p.calls)}</td><td style={r}>{n(p.fell_back)}</td><td style={{ ...r, color: p.failed ? C.warn : undefined }}>{n(p.failed)}</td>
                  <td style={r}>{n(p.tokens)}</td><td style={r}>{amount(p.cost, 'cost')}</td><td style={r}>{p.calls ? `${n(p.ms)} ms` : '—'}</td>
                  <td style={{ ...td, color: p.stopped ? C.bad : p.used_pct >= 80 ? C.warn : C.mid }}>{p.limit == null ? 'none' : `${p.used_pct}% of ${amount(p.limit, p.limit_unit)}${p.stopped ? ' · stopped' : ''}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={box}>
        <strong style={{ fontSize: '0.9rem' }}>{u.month}, by key</strong>
        {u.keys.length === 0 ? <p style={{ margin: 0, fontSize: '0.76rem', color: C.dim }}>No key has been used this month.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 560 }}>
              <thead><tr><th style={th}>Key</th><th style={th}>Served</th><th style={{ ...th, textAlign: 'right' }}>Calls</th><th style={{ ...th, textAlign: 'right' }}>Failed tries</th><th style={{ ...th, textAlign: 'right' }}>Tokens</th><th style={{ ...th, textAlign: 'right' }}>Est. cost</th></tr></thead>
              <tbody>
                {u.keys.map((k) => (
                  <tr key={k.key_id} data-ai-usage-key={k.label}>
                    <td style={td}>{k.label}</td><td style={{ ...td, color: C.mid }}>{k.purposes.map(name).join(', ') || '—'}</td><td style={r}>{n(k.calls)}</td><td style={{ ...r, color: k.failed ? C.warn : undefined }}>{n(k.failed)}</td><td style={r}>{n(k.tokens)}</td><td style={r}>{amount(k.cost, 'cost')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={box}>
        <strong style={{ fontSize: '0.9rem' }}>Tokens in the last six months</strong>
        <div role="list" style={{ display: 'grid', gap: 6 }}>
          {u.months.map((m) => {
            const total = Object.values(m.by_purpose).reduce((a, x) => a + x.tokens, 0);
            return (
              <div role="listitem" key={m.month} data-ai-month={m.month} style={{ display: 'grid', gridTemplateColumns: '70px minmax(0,1fr) 110px', gap: 10, alignItems: 'center', fontSize: '0.72rem' }}>
                <span style={{ color: C.mid }}>{m.label}</span>
                <span style={{ height: 10, borderRadius: 99, background: 'color-mix(in srgb, var(--color-primary-500) 8%, transparent)', overflow: 'hidden' }}>
                  <i style={{ display: 'block', height: '100%', width: `${(total / most) * 100}%`, background: C.accent, borderRadius: 99 }} />
                </span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{n(total)}</span>
              </div>
            );
          })}
        </div>
        <p style={{ margin: 0, fontSize: '0.64rem', color: C.dim }}>Costs are estimates from rough rates per provider, not a bill. What was asked and answered is never kept here.</p>
      </section>
    </div>
  );
}
