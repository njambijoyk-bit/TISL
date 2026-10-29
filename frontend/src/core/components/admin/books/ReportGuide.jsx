import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { card, colors } from '../../../../_shared/theme/tokens';
import { GUIDE } from './reportAbout';

const KEY = 'report-guide-collapsed';
const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const write = (v) => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* private window: it stays as chosen for this visit */ } };

/** What the open report is for, how it differs from the ones it is mistaken for, and what is good to know. At the foot of the report, open unless the person has folded it. */
export default function ReportGuide({ report, reports, open }) {
  const [folded, setFolded] = useState(read);
  const g = GUIDE[report.engine];
  if (!g) return null;
  const toggle = () => { write(!folded); setFolded(!folded); };
  const byKey = new Map(reports.map((r) => [r.engine, r]));
  const h = { margin: '14px 0 6px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textFaint };

  return (
    <section aria-label={`About ${report.label}`} style={{ ...card, padding: '12px 16px', marginTop: 18 }}>
      <button type="button" onClick={toggle} aria-expanded={!folded}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, color: colors.text, textAlign: 'left' }}>
        <span style={{ flex: 1 }}>About {report.label}</span>
        <span style={{ fontWeight: 500, fontSize: '0.72rem', color: colors.textFaint }}>{folded ? 'Show' : 'Hide'}</span>
        {folded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      {!folded && (
        <div style={{ fontSize: '0.82rem', lineHeight: 1.6, color: colors.textBody, maxWidth: '78ch' }}>
          <p style={{ margin: '10px 0 0' }}>{g.purpose}</p>
          {g.differs?.length > 0 && (
            <>
              <h3 style={h}>How it differs from similar reports</h3>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
                {g.differs.map((d) => {
                  const other = byKey.get(d.key);
                  return (
                    <li key={d.key}>
                      {other
                        ? <button type="button" onClick={() => open(other)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 700, color: colors.primary, textDecoration: 'underline' }}>{other.label}</button>
                        : <b>{d.key}</b>}
                      {': '}{d.text}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {g.tips?.length > 0 && (
            <>
              <h3 style={h}>Good to know</h3>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>{g.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}
