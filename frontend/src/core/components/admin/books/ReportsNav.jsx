import { useMemo, useState } from 'react';
import { ChevronDown, ListTree, Search, Star } from 'lucide-react';
import { card, colors } from '../../../../_shared/theme/tokens';
import { GROUPS } from './reportCatalog';

const row = (on) => ({ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit',
  background: on ? colors.tint(0.12) : 'transparent', color: on ? colors.primaryDeep : colors.text, fontWeight: on ? 700 : 500 });
const badge = { fontFamily: 'ui-monospace, monospace', fontSize: '0.62rem', color: colors.textFaint, border: `1px solid ${colors.tint(0.15)}`, borderRadius: 4, padding: '0 4px', flexShrink: 0, lineHeight: '15px' };
const head = { fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textFaint, padding: '10px 8px 2px' };

/** The report list: search, the person's favourites (keys 1 to 9) and every report under its group, with the letter that goes to it (G, then the letter). */
export default function ReportsNav({ visible, current, open, favourites, onStar, searchRef, goHint }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [shown, setShown] = useState(false);   // on a phone the list is folded away until asked for, so the report is what you see
  const byKey = useMemo(() => new Map(visible.map((r) => [r.engine, r])), [visible]);
  const favs = favourites.map((k) => byKey.get(k)).filter(Boolean);
  const term = q.trim().toLowerCase();
  const found = term ? visible.filter((r) => `${r.label} ${r.group}`.toLowerCase().includes(term) || r.letter.toLowerCase() === term) : null;

  const onKey = (e) => {
    if (!found) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, found.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && found[hi]) { e.preventDefault(); open(found[hi]); setQ(''); setShown(false); e.target.blur(); }
    else if (e.key === 'Escape') { setQ(''); e.target.blur(); }
  };

  const item = (r, extra) => (
    <div key={r.id + (extra?.key ?? '')} style={{ display: 'flex', alignItems: 'center', gap: 2 }} className="rn-item">
      <button type="button" style={row(r.id === current.id || extra?.hi)} aria-current={r.id === current.id ? 'page' : undefined} onClick={() => { open(r); setQ(''); setShown(false); }}>
        {extra?.number && <span style={{ ...badge, color: colors.warningText, borderColor: colors.warning }}>{extra.number}</span>}
        <span style={{ flex: 1, minWidth: 0 }}>{r.label}</span>
        <span style={badge} title={`Press G, then ${r.letter}`}>G {r.letter}</span>
      </button>
      <button type="button" aria-label={favourites.includes(r.engine) ? `Remove ${r.label} from favourites` : `Add ${r.label} to favourites`} aria-pressed={favourites.includes(r.engine)} onClick={() => onStar(r)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'inline-flex', color: favourites.includes(r.engine) ? colors.warning : colors.textGhost }}>
        <Star size={14} fill={favourites.includes(r.engine) ? 'currentColor' : 'none'} />
      </button>
    </div>
  );

  return (
    <div className="rn-wrap">
      <button type="button" className="rn-toggle" aria-expanded={shown} onClick={() => setShown((v) => !v)}
        style={{ ...card, alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, color: colors.text, textAlign: 'left' }}>
        <ListTree size={16} style={{ color: colors.primary }} /> <span style={{ flex: 1 }}>{current.label}</span><span style={{ fontWeight: 500, color: colors.textFaint, fontSize: '0.74rem' }}>All reports</span>
        <ChevronDown size={16} style={{ transform: shown ? 'rotate(180deg)' : undefined }} />
      </button>
    <nav aria-label="Reports" className={`rn-nav${shown ? ' rn-open' : ''}`} style={{ ...card, padding: 10 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 9px', border: `1px solid ${colors.tint(0.15)}`, borderRadius: 8, marginBottom: 4 }}>
        <Search size={14} style={{ color: colors.textFaint }} />
        <input ref={searchRef} type="search" value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={onKey} placeholder="Search reports  ( / )" aria-label="Search reports"
          style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.78rem', color: colors.text, fontFamily: 'inherit' }} />
      </label>
      {goHint && <div role="status" style={{ margin: '6px 0', padding: '6px 8px', borderRadius: 7, background: colors.warningBg, color: colors.warningText, fontSize: '0.72rem' }}>Go to a report: press its letter</div>}
      {found ? (
        <>
          <div style={head}>{found.length ? `${found.length} found` : 'Nothing found'}</div>
          {found.map((r, i) => item(r, { hi: i === hi, key: 'f' }))}
        </>
      ) : (
        <>
          {favs.length > 0 && <div style={head}>Favourites</div>}
          {favs.map((r, i) => item(r, { number: i + 1, key: 'fav' }))}
          {GROUPS.map((g) => {
            const list = visible.filter((r) => r.group === g);
            return list.length ? <div key={g}><div style={head}>{g}</div>{list.map((r) => item(r))}</div> : null;
          })}
          {!favs.length && <p style={{ margin: '10px 8px 2px', fontSize: '0.7rem', color: colors.textFaint, lineHeight: 1.4 }}>Star a report to pin it here. Then keys 1 to 9 open your favourites.</p>}
        </>
      )}
    </nav>
      <style>{`
        .rn-toggle { display: none; }
        .rn-nav { position: sticky; top: 12px; max-height: calc(100vh - 24px); overflow-y: auto; }
        @media (max-width: 800px) {
          .rn-toggle { display: flex; }
          .rn-nav { display: none; position: static; max-height: 60vh; margin-top: 6px; }
          .rn-nav.rn-open { display: block; }
        }
      `}</style>
    </div>
  );
}
