import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';
import { useMenusKind } from '../lib/menusKind';
import KindFilter from './KindFilter';

/**
 * The count sheet: every variant of every ingredient in one table with what the books say is there, filtered by a search or by ingredient. The counted quantity (in packs, the bigger unit
 * or the base unit) is typed straight into the row and the difference shows at once. A row is counted when a quantity is typed in it (0 counts: nothing is there); counted rows are kept in
 * this browser as a draft (per branch) until they are saved or discarded. Variants left empty are not touched. Saving sends every counted row at once (all or nothing).
 */

const draftKey = (loc) => `menus.countDraft.${loc}`;
const readDraft = (loc) => { try { return JSON.parse(localStorage.getItem(draftKey(loc)) || '{}') || {}; } catch { return {}; } };
const writeDraft = (loc, edits) => { try { if (Object.keys(edits).length) localStorage.setItem(draftKey(loc), JSON.stringify(edits)); else localStorage.removeItem(draftKey(loc)); } catch { /* private window: the draft just is not kept */ } };
const num = (n, dp = 2) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-KE', { maximumFractionDigits: dp }));
const counted = (e) => !!e && e.quantity !== undefined && e.quantity !== '' && e.quantity !== null;
const th = { position: 'sticky', top: 0, zIndex: 2, background: colors.surface, textAlign: 'left', padding: '8px 8px', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textFaint, borderBottom: `1px solid ${colors.tint(0.14)}`, whiteSpace: 'nowrap' };
const td = { padding: '4px 6px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'middle' };
const cell = { width: '100%', padding: '6px 8px', fontSize: '0.8rem', borderRadius: 6, border: `1px solid ${colors.tint(0.2)}`, background: 'transparent', color: 'inherit', fontFamily: 'inherit', boxSizing: 'border-box' };
const seg = (on) => ({ padding: '5px 12px', fontSize: '0.74rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${on ? colors.primary : colors.tint(0.2)}`, background: on ? colors.tint(0.14) : 'transparent', color: on ? colors.primary : colors.textMuted });
const defaultUnit = (v) => (v.pack_size_base ? 'pack' : v.alt_unit ? 'alt' : 'base');
const perUnit = (v, unit) => (unit === 'pack' ? v.pack_size_base ?? 1 : unit === 'alt' ? v.alt_factor ?? 1 : 1);
const countedBase = (v, e) => (counted(e) ? Number(e.quantity) * perUnit(v, e.unit ?? defaultUnit(v)) : null);
const EPS = 0.00005;

const Row = memo(function Row({ v, e, idx, error, onEdit, onEnter, readOnly }) {
  const unit = e?.unit ?? defaultUnit(v);
  const units = [...(v.pack_size_base ? [['pack', 'pack']] : []), ...(v.alt_unit ? [['alt', v.alt_unit]] : []), ['base', v.base_unit]];
  const base = countedBase(v, e);
  const diff = base === null ? null : Math.round((base - v.book) * 10000) / 10000;
  const worth = diff !== null && v.cost != null ? diff * v.cost : null;
  const shade = diff === null ? undefined : Math.abs(diff) < EPS ? '#15803d' : diff < 0 ? colors.danger : '#15803d';

  return (
    <tr data-row-variant={v.id} data-counted={base !== null ? 'true' : undefined} style={{ background: error ? colors.dangerBg : base !== null ? colors.tint(0.08) : 'transparent' }}>
      <td style={{ ...td, fontWeight: 700, minWidth: 130 }}>{v.ingredient}</td>
      <td style={{ ...td, minWidth: 130 }}>{v.name}{v.pack_size_base ? <span style={{ color: colors.textFaint, fontSize: '0.7rem' }}> · {num(v.alt_unit ? v.pack_size_base / v.alt_factor : v.pack_size_base, 3)} {v.alt_unit ?? v.base_unit}</span> : null}</td>
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {num(v.book, 3)} {v.base_unit}
        {v.pack_size_base && v.book > 0 ? <div style={{ fontSize: '0.7rem', color: colors.textFaint }}>{num(v.book / v.pack_size_base, 2)} packs</div> : null}
      </td>
      <td style={{ ...td, width: 110 }}><input type="number" min="0" step="any" aria-label={`Counted ${v.ingredient} ${v.name}`} data-col="quantity" data-row={idx} style={cell} disabled={readOnly} value={e?.quantity ?? ''} onChange={(ev) => onEdit(v.id, { quantity: ev.target.value })} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); onEnter(idx); } }} /></td>
      <td style={{ ...td, width: 84 }}>
        <select aria-label={`Unit of ${v.ingredient} ${v.name}`} style={cell} disabled={readOnly || units.length === 1} value={unit} onChange={(ev) => onEdit(v.id, { unit: ev.target.value })}>{units.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </td>
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: shade }} data-testid={`diff-${v.id}`}>
        {diff === null ? '' : Math.abs(diff) < EPS ? 'agrees' : `${diff > 0 ? '+' : ''}${num(diff, 3)} ${v.base_unit}`}
      </td>
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', width: 100, color: shade }}>{worth !== null && Math.abs(diff) >= EPS ? num(worth) : ''}</td>
      <td style={{ ...td, minWidth: 150, fontSize: '0.72rem', color: colors.danger }}>{error}</td>
    </tr>
  );
});

export default function CountStockGrid({ ingredients, kinds = [], locationId, onSave, readOnly = false }) {
  const [edits, setEdits] = useState(() => readDraft(locationId));
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('');
  const [kind, setKind] = useMenusKind(kinds);
  const pickKind = (v) => { setKind(v); setOnly(''); };
  const [show, setShow] = useState('all');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const loadedFor = useRef(locationId);

  // another branch has its own draft
  useEffect(() => { if (loadedFor.current !== locationId) { loadedFor.current = locationId; setEdits(readDraft(locationId)); setErrors({}); setMessage(null); } }, [locationId]);
  useEffect(() => { if (loadedFor.current === locationId) writeDraft(locationId, edits); }, [edits, locationId]);

  // variants in use, and any that are switched off but still have stock to count
  const variants = useMemo(() => ingredients.filter((i) => i.is_active || i.variants.some((v) => v.book_qty > 0)).flatMap((i) => i.variants.filter((v) => (v.is_active && i.is_active) || v.book_qty > 0).map((v) => ({
    id: v.id, ingredient: i.name, ingredientId: i.id, kindId: i.kind_id, name: v.name, pack_size_base: v.pack_size_base, base_unit: i.base_unit, alt_unit: i.alt_unit, alt_factor: i.alt_factor ?? 1, book: v.book_qty ?? 0, cost: v.book_cost,
  }))), [ingredients]);
  const needle = q.trim().toLowerCase();
  const rowDiff = (v) => { const b = countedBase(v, edits[v.id]); return b === null ? null : b - v.book; };
  const rows = useMemo(() => variants.filter((v) => {
    if (only && String(v.ingredientId) !== only) return false;
    if (kind && String(v.kindId) !== kind) return false;
    if (needle && !`${v.ingredient} ${v.name}`.toLowerCase().includes(needle)) return false;
    const d = rowDiff(v);
    return show === 'all' || (show === 'counted' && d !== null) || (show === 'uncounted' && d === null) || (show === 'differs' && d !== null && Math.abs(d) >= EPS);
  }), [variants, only, kind, needle, show, edits]); // eslint-disable-line react-hooks/exhaustive-deps
  const known = useMemo(() => new Set(variants.map((v) => String(v.id))), [variants]);
  const countedIds = useMemo(() => Object.keys(edits).filter((id) => known.has(id) && counted(edits[id])), [edits, known]);
  const summary = useMemo(() => {
    let differ = 0; let loss = 0; let gain = 0;
    countedIds.forEach((id) => {
      const v = variants.find((x) => String(x.id) === id); const d = rowDiff(v);
      if (d !== null && Math.abs(d) >= EPS) { differ += 1; const w = d * (v.cost ?? 0); if (w < 0) loss += -w; else gain += w; }
    });
    return { differ, loss, gain };
  }, [countedIds, variants, edits]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = useCallback((id, patch) => {
    setEdits((all) => {
      const next = { ...all, [id]: { ...(all[id] ?? {}), ...patch } };
      if (next[id].quantity === '' || next[id].quantity === undefined) delete next[id];   // emptied again: not counted
      return next;
    });
    setErrors((x) => (x[id] ? { ...x, [id]: undefined } : x));
  }, []);
  const enter = useCallback((idx) => { document.querySelector(`[data-col="quantity"][data-row="${idx + 1}"]`)?.focus(); }, []);

  const discard = () => {
    if (!countedIds.length || !window.confirm(`Throw away what you counted in ${countedIds.length} row${countedIds.length === 1 ? '' : 's'}?`)) return;
    setEdits({}); setErrors({}); setMessage(null);
  };

  const saveAll = async () => {
    const lines = countedIds.map((id) => ({ id, v: variants.find((x) => String(x.id) === id), e: edits[id] }));
    const found = {};
    lines.forEach(({ id, v, e }) => {
      if (Number(e.quantity) < 0) found[id] = 'A count cannot be negative.';
      else if ((e.unit ?? defaultUnit(v)) === 'pack' && !v.pack_size_base) found[id] = 'No pack size: pick another unit.';
    });
    if (Object.keys(found).length) { setErrors(found); setMessage('Fix the marked rows before anything is saved.'); return; }
    setBusy(true); setErrors({}); setMessage(null);
    try {
      await onSave(lines.map(({ v, e }) => ({ item_id: v.id, quantity: Number(e.quantity), unit: e.unit ?? defaultUnit(v) })));
      setEdits({});
    } catch (x) {
      const text = x?.response?.data?.message ?? x?.message ?? 'Could not save the count.';
      const line = /^Line (\d+):/.exec(text);
      if (line && lines[Number(line[1]) - 1]) setErrors({ [lines[Number(line[1]) - 1].id]: text.replace(/^Line \d+:\s*/, '') });
      setMessage(`Nothing was saved. ${text}`);
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="count-grid">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textFaint, pointerEvents: 'none' }} />
          <TextInput aria-label="Search items or variants" placeholder="Search items or variants…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <KindFilter kinds={kinds} value={kind} onChange={pickKind} />
        <SelectInput aria-label="Item" value={only} onChange={(e) => setOnly(e.target.value)} style={{ width: 'auto', maxWidth: 220 }}>
          <option value="">All items</option>
          {ingredients.filter((i) => (!kind || String(i.kind_id) === kind) && variants.some((v) => v.ingredientId === i.id)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </SelectInput>
        <div role="group" aria-label="Show" style={{ display: 'inline-flex' }}>
          {[['all', 'All'], ['counted', 'Counted'], ['uncounted', 'Not counted'], ['differs', 'Differences']].map(([k, l], i, a) => <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} style={{ ...seg(show === k), borderRadius: i === 0 ? '8px 0 0 8px' : i === a.length - 1 ? '0 8px 8px 0' : 0, marginLeft: i ? -1 : 0 }}>{l}</button>)}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '0.78rem', color: colors.textMuted }} data-testid="count-summary">
          {countedIds.length ? `${countedIds.length} counted · ${summary.differ} differ${summary.loss > 0 ? ` · loss ${num(summary.loss)}` : ''}${summary.gain > 0 ? ` · found ${num(summary.gain)}` : ''}` : 'Nothing counted yet'}
        </span>
        {!readOnly && <button type="button" style={btnGhost} disabled={!countedIds.length || busy} onClick={discard}>Discard changes</button>}
        {!readOnly && <button type="button" data-hotkey="Save" style={{ ...btnPrimary, opacity: !countedIds.length || busy ? 0.55 : 1 }} disabled={!countedIds.length || busy} onClick={saveAll}>{busy ? 'Saving…' : `Save count (${countedIds.length})`}</button>}
      </div>
      {message && <p role="alert" style={{ margin: '0 0 10px', padding: '8px 12px', borderRadius: 8, background: colors.dangerBg, color: colors.dangerText, fontSize: '0.82rem' }}>{message}</p>}
      {countedIds.length > 0 && <p role="status" style={{ margin: '0 0 8px', fontSize: '0.72rem', color: colors.textFaint }}>Kept on this computer until you save or discard, so a reload or a closed tab loses nothing.</p>}
      <div style={{ ...card, padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 330px)', minHeight: 220 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 900 }}>
          <thead><tr>
            <th style={th}>Item</th><th style={th}>Variant</th><th style={{ ...th, textAlign: 'right' }}>The books say</th><th style={th}>Counted</th><th style={th}>In</th><th style={{ ...th, textAlign: 'right' }}>Difference</th><th style={{ ...th, textAlign: 'right' }}>Worth</th><th style={th} />
          </tr></thead>
          <tbody>
            {rows.map((v, idx) => <Row key={v.id} v={v} e={edits[v.id]} idx={idx} error={errors[v.id]} onEdit={edit} onEnter={enter} readOnly={readOnly} />)}
            {rows.length === 0 && <tr><td colSpan={8} style={{ ...td, padding: 20, color: colors.textMuted }}>{variants.length === 0 ? 'Add items and their variants under Ingredients first.' : 'Nothing matches these filters.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>Count what is really on the shelf, in packs where a variant has a pack size. Type 0 where nothing is left. Rows you leave empty are not touched. A shortage comes off the lots expiring first; stock found becomes a new lot at the last cost. Enter moves down to the next row.</p>
    </div>
  );
}
