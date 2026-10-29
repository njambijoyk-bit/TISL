import { useMemo, useState } from 'react';
import { ChevronDown, ListTree, Search, Star } from 'lucide-react';
import { card, colors } from '../../../_shared/theme/tokens';
import { GROUPS } from './visualCatalog';
import { DEFS } from './visualDefs';

const row = (on) => ({ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit',
  background: on ? colors.tint(0.12) : 'transparent', color: on ? colors.primaryDeep : colors.text, fontWeight: on ? 700 : 500 });
const badge = { fontFamily: 'ui-monospace, monospace', fontSize: '0.62rem', color: colors.textFaint, border: `1px solid ${colors.tint(0.15)}`, borderRadius: 4, padding: '0 4px', flexShrink: 0, lineHeight: '15px' };
const head = { fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.textFaint, padding: '10px 8px 2px' };

/** The chart list: search, the person's favourites (keys 1 to 9) and every chart under its group, with the key that goes to it (G, then the key). Folds behind one bar on a phone. */
export default function VisualNav({ charts, current, open, favourites, onStar, goHint }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const [shown, setShown] = useState(false);
  const byKey = useMemo(() => new Map(charts.map((c) => [c.key, c])), [charts]);
  const favs = favourites.map((k) => byKey.get(k)).filter(Boolean);
  const term = q.trim().toLowerCase();
  const found = term ? charts.filter((c) => `${DEFS[c.key].title} ${c.group}`.toLowerCase().includes(term) || c.go.toLowerCase() === term) : null;
  const choose = (c) => { open(c); setQ(''); setShown(false); };

  const onKey = (e) => {
    if (!found) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, found.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && found[hi]) { e.preventDefault(); choose(found[hi]); e.target.blur(); }
    else if (e.key === 'Escape') { setQ(''); e.target.blur(); }
  };

  const item = (c, extra) => {
    const star = favourites.includes(c.key);
    const title = DEFS[c.key].title;
    return (
      <div key={c.key + (extra?.key ?? '')} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button type="button" style={row(c.key === current?.key || extra?.hi)} aria-current={c.key === current?.key ? 'page' : undefined} onClick={() => choose(c)}>
          {extra?.number && <span style={{ ...badge, color: colors.warningText, borderColor: colors.warning }}>{extra.number}</span>}
          <span style={{ flex: 1, minWidth: 0 }}>{title}</span>
          <span style={badge} title={`Press G, then ${c.go}`}>G {c.go}</span>
        </button>
        <button type="button" aria-label={star ? `Remove ${title} from favourites` : `Add ${title} to favourites`} aria-pressed={star} onClick={() => onStar(c)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'inline-flex', color: star ? colors.warning : colors.textGhost }}>
          <Star size={14} fill={star ? 'currentColor' : 'none'} />
        </button>
      </div>
    );
  };

  return (
    <div className="vn-wrap">
      <button type="button" className="vn-toggle" aria-expanded={shown} onClick={() => setShown((v) => !v)}
        style={{ ...card, alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, color: colors.text, textAlign: 'left' }}>
        <ListTree size={16} style={{ color: colors.primary }} /> <span style={{ flex: 1 }}>{current ? DEFS[current.key].title : 'All charts'}</span><span style={{ fontWeight: 500, color: colors.textFaint, fontSize: '0.74rem' }}>All charts</span>
        <ChevronDown size={16} style={{ transform: shown ? 'rotate(180deg)' : undefined }} />
      </button>
      <nav aria-label="Charts" className={`vn-nav${shown ? ' vn-open' : ''}`} style={{ ...card, padding: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 9px', border: `1px solid ${colors.tint(0.15)}`, borderRadius: 8, marginBottom: 4 }}>
          <Search size={14} style={{ color: colors.textFaint }} />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} onKeyDown={onKey} placeholder="Search charts  ( / )" aria-label="Search charts"
            style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.78rem', color: colors.text, fontFamily: 'inherit' }} />
        </label>
        {goHint && <div role="status" style={{ margin: '6px 0', padding: '6px 8px', borderRadius: 7, background: colors.warningBg, color: colors.warningText, fontSize: '0.72rem' }}>Go to a chart: press its key (0 for the questions)</div>}
        {found ? (
          <>
            <div style={head}>{found.length ? `${found.length} found` : 'Nothing found'}</div>
            {found.map((c, i) => item(c, { hi: i === hi, key: 'f' }))}
          </>
        ) : (
          <>
            {favs.length > 0 && <div style={head}>Favourites</div>}
            {favs.map((c, i) => item(c, { number: i + 1, key: 'fav' }))}
            {GROUPS.map((g) => {
              const list = charts.filter((c) => c.group === g);
              return list.length ? <div key={g}><div style={head}>{g}</div>{list.map((c) => item(c))}</div> : null;
            })}
            {!favs.length && <p style={{ margin: '10px 8px 2px', fontSize: '0.7rem', color: colors.textFaint, lineHeight: 1.4 }}>Star a chart to pin it here. Then keys 1 to 9 open your favourites.</p>}
          </>
        )}
      </nav>
      <style>{`
        .vn-toggle { display: none; }
        .vn-nav { position: sticky; top: 12px; max-height: calc(100vh - 24px); overflow-y: auto; }
        @media (max-width: 800px) { .vn-toggle { display: flex; } .vn-nav { display: none; position: static; max-height: 60vh; margin-top: 6px; } .vn-nav.vn-open { display: block; } }
      `}</style>
    </div>
  );
}
