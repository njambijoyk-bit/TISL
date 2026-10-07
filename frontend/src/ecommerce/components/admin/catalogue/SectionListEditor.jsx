import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { colors } from '../../../../_shared/theme/tokens';
import { SECTION_LABELS } from '../../../lib/catalogue/labels';
import { THEMES, THEME_KEYS, themeOf } from '../../../lib/catalogue/themes';
import { fieldStyle } from './catalogueMeta';

const iconBtn = { border: '1px solid var(--line)', background: 'var(--surface-card)', color: 'inherit', borderRadius: 6, padding: 4, display: 'inline-flex', cursor: 'pointer' };

/** An ordered list of sections, each with its theme: move them, change the look, remove, add the ones this item type can use. */
export default function SectionListEditor({ type, value, onChange, keys, disabled }) {
  const used = new Set(value.map((s) => s.key));
  const addable = keys.filter((k) => !used.has(k));
  const set = (i, patch) => onChange(value.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= value.length) return; const next = [...value]; [next[i], next[j]] = [next[j], next[i]]; onChange(next); };

  return (
    <div style={{ display: 'grid', gap: 6 }} data-type={type}>
      {value.length === 0 && <span style={{ fontSize: '0.8rem', color: colors.textFaint }}>No sections: add at least one.</span>}
      {value.map((s, i) => {
        const th = themeOf(s.theme);

        return (
          <div key={s.key} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--surface-card)' }}>
            <span title={THEMES[s.theme]?.label} style={{ width: 22, height: 22, borderRadius: 6, flex: '0 0 auto', background: th.bg, border: `2px solid ${th.accent}` }} />
            <span style={{ flex: '1 1 auto', fontSize: '0.82rem', color: colors.text, minWidth: 0 }}>{SECTION_LABELS[s.key] ?? s.key}</span>
            <select value={s.theme} disabled={disabled} onChange={(e) => set(i, { theme: e.target.value })} aria-label={`Theme for ${s.key}`} style={{ ...fieldStyle, width: 110, padding: '4px 6px' }}>
              {THEME_KEYS.map((k) => <option key={k} value={k}>{THEMES[k].label}</option>)}
            </select>
            {!disabled && (
              <>
                <button type="button" style={iconBtn} aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
                <button type="button" style={iconBtn} aria-label="Move down" disabled={i === value.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
                <button type="button" style={iconBtn} aria-label={`Remove ${s.key}`} onClick={() => onChange(value.filter((_, n) => n !== i))}><X size={13} /></button>
              </>
            )}
          </div>
        );
      })}
      {!disabled && addable.length > 0 && (
        <select value="" onChange={(e) => e.target.value && onChange([...value, { key: e.target.value, theme: 'paper' }])} aria-label="Add a section" style={{ ...fieldStyle, maxWidth: 360 }}>
          <option value="">+ Add a section…</option>
          {addable.map((k) => <option key={k} value={k}>{SECTION_LABELS[k] ?? k}</option>)}
        </select>
      )}
    </div>
  );
}
