import { X } from 'lucide-react';
import { card, colors } from '../../../../_shared/theme/tokens';
import { GENERAL, REPORTS } from './reportDev';

const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };
const code = { ...mono, fontSize: '0.74rem', background: colors.tint(0.07), padding: '1px 5px', borderRadius: 4 };
const h = { margin: '14px 0 6px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textFaint };

/** //dev: the developer guide for the open report and for the engine, revealed with Shift + D + E + V pressed together. */
export default function DevGuide({ report, onClose }) {
  const d = REPORTS[report.engine];
  return (
    <section aria-label="Developer guide" style={{ ...card, padding: '12px 16px', marginTop: 18, borderStyle: 'dashed' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...mono, fontWeight: 700, fontSize: '0.85rem', color: colors.primary }}>//dev</span>
        <span style={{ flex: 1, fontSize: '0.74rem', color: colors.textFaint }}>Developer guide · Shift + D + E + V together shows or hides it</span>
        <button type="button" onClick={onClose} aria-label="Close the developer guide" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', color: colors.textMuted }}><X size={16} /></button>
      </div>
      <div style={{ fontSize: '0.8rem', lineHeight: 1.6, color: colors.textBody, maxWidth: '90ch' }}>
        <h3 style={h}>This report: {report.label}</h3>
        <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', gap: '4px 14px' }}>
          <dt style={{ color: colors.textFaint }}>Key</dt><dd style={{ margin: 0 }}><code style={code}>{report.engine}</code> · <code style={code}>GET /api/admin/reports/{report.engine}</code></dd>
          {d && <><dt style={{ color: colors.textFaint }}>Backend</dt><dd style={{ margin: 0 }}><code style={code}>{`backend/app/Services/Books/Engine/Reports/${d.cls.split(' ')[0]}.php`}</code>{d.cls.includes(' ') ? ` ${d.cls.slice(d.cls.indexOf(' '))}` : ''}</dd>
            <dt style={{ color: colors.textFaint }}>Screen</dt><dd style={{ margin: 0 }}><code style={code}>{d.view}</code> · list entry in <code style={code}>reportCatalog.js</code> · text in <code style={code}>reportAbout.js</code></dd>
            <dt style={{ color: colors.textFaint }}>Reads</dt><dd style={{ margin: 0 }}>{d.reads}</dd>
            <dt style={{ color: colors.textFaint }}>Tests</dt><dd style={{ margin: 0 }}>{d.tests}</dd></>}
        </dl>
        {d?.notes?.length > 0 && <><h3 style={h}>Notes</h3><ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>{d.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></>}
        {GENERAL.map((g) => (
          <div key={g.title}>
            <h3 style={h}>{g.title}</h3>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>{g.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}
