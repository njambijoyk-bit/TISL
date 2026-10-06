import { useState } from 'react';
import { Drawn } from './Moodboard';
import { STICKERS, SVG_LIST } from '../lib/moodboardKit';

const tab = (on) => ({ padding: '4px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.74rem', fontWeight: on ? 800 : 600, color: on ? 'var(--color-primary-500)' : 'var(--text-secondary)', border: `1.5px solid ${on ? 'var(--color-primary-500)' : 'var(--line)'}`, background: 'transparent' });
const cell = (on) => ({ padding: 4, borderRadius: 8, cursor: 'pointer', background: 'transparent', border: `2px solid ${on ? 'var(--color-primary-500)' : 'transparent'}` });

/** Choose a sticker for a spot: emoji, or drawn line art that can be black, white or any colour. `cur` is the spot's content, onChange gets the new one. */
export default function StickerPicker({ cur, disabled, onChange }) {
  const drawnNow = String(cur.value ?? '').startsWith('svg:');
  const [mode, setMode] = useState(drawnNow ? 'drawn' : 'emoji');
  const color = cur.color ?? '#222222';

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" style={tab(mode === 'emoji')} onClick={() => setMode('emoji')}>Emoji</button>
        <button type="button" style={tab(mode === 'drawn')} onClick={() => setMode('drawn')}>Drawn</button>
      </div>
      {mode === 'emoji' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2, maxHeight: 190, overflowY: 'auto' }}>
          {STICKERS.map((s) => <button key={s} type="button" disabled={disabled} onClick={() => onChange({ value: s })} aria-label={`Sticker ${s}`} style={{ ...cell(cur.value === s), fontSize: '1.2rem' }}>{s}</button>)}
        </div>
      )}
      {mode === 'drawn' && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="color" value={color} onChange={(e) => onChange({ value: drawnNow ? cur.value : SVG_LIST[0][0], color: e.target.value })} disabled={disabled} style={{ width: 40, height: 28, border: 0, background: 'transparent', padding: 0 }} aria-label="Sticker colour" />
            <button type="button" disabled={disabled} style={tab(false)} onClick={() => onChange({ value: drawnNow ? cur.value : SVG_LIST[0][0], color: '#000000' })}>Black</button>
            <button type="button" disabled={disabled} style={{ ...tab(false), background: '#555', color: '#fff' }} onClick={() => onChange({ value: drawnNow ? cur.value : SVG_LIST[0][0], color: '#ffffff' })}>White</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, maxHeight: 190, overflowY: 'auto', background: color.toLowerCase() === '#ffffff' ? '#8a8a8a' : 'transparent', borderRadius: 8, padding: 2 }}>
            {SVG_LIST.map(([k, l]) => (
              <button key={k} type="button" disabled={disabled} title={l} aria-label={l} onClick={() => onChange({ value: k, color })} style={{ ...cell(cur.value === k), position: 'relative', aspectRatio: '1 / 1' }}>
                <span style={{ position: 'absolute', inset: 8 }}><Drawn value={k} color={color} /></span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
