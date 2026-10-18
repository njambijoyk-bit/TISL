import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import { btnGhost, btnPrimary, card, colors } from '../../_shared/theme/tokens';
import { useMenusKind } from '../lib/menusKind';
import KindFilter from './KindFilter';

/**
 * The opening stock sheet: every variant of every ingredient in one table, filtered by a search or by ingredient, with the quantity, the unit, what one costs, a batch number and
 * an expiry date typed straight into its row. A row is touched when anything is typed in it; touched rows are counted on "Save all" and kept in this browser as a draft (per branch)
 * until they are saved or discarded, so a reload or a closed tab loses nothing. Saving sends every touched row at once (all or nothing).
 */

const draftKey = (loc) => `menus.openingDraft.${loc}`;
const readDraft = (loc) => { try { return JSON.parse(localStorage.getItem(draftKey(loc)) || '{}') || {}; } catch { return {}; } };
const writeDraft = (loc, edits) => { try { if (Object.keys(edits).length) localStorage.setItem(draftKey(loc), JSON.stringify(edits)); else localStorage.removeItem(draftKey(loc)); } catch { /* private window: the draft just is not kept */ } };
const num = (n, dp = 2) => (n == null || Number.isNaN(Number(n)) ? '—' : Number(n).toLocaleString('en-KE', { maximumFractionDigits: dp }));
const FIELDS = ['quantity', 'rate', 'batch_no', 'expiry_date'];
const touched = (e) => !!e && FIELDS.some((k) => e[k] !== undefined && e[k] !== '' && e[k] !== null);
const th = { position: 'sticky', top: 0, zIndex: 2, background: colors.surface, textAlign: 'left', padding: '8px 8px', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.textFaint, borderBottom: `1px solid ${colors.tint(0.14)}`, whiteSpace: 'nowrap' };
const td = { padding: '4px 6px', fontSize: '0.8rem', borderTop: `1px solid ${colors.tint(0.06)}`, verticalAlign: 'middle' };
const cell = { width: '100%', padding: '6px 8px', fontSize: '0.8rem', borderRadius: 6, border: `1px solid ${colors.tint(0.2)}`, background: 'transparent', color: 'inherit', fontFamily: 'inherit', boxSizing: 'border-box' };
const seg = (on) => ({ padding: '5px 12px', fontSize: '0.74rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${on ? colors.primary : colors.tint(0.2)}`, background: on ? colors.tint(0.14) : 'transparent', color: on ? colors.primary : colors.textMuted });
const defaultUnit = (v) => (v.pack_size_base ? 'pack' : v.alt_unit ? 'alt' : 'base');

const Row = memo(function Row({ v, e, idx, error, onEdit, onEnter, readOnly }) {
  const unit = e?.unit ?? defaultUnit(v);
  const units = [...(v.pack_size_base ? [['pack', 'pack']] : []), ...(v.alt_unit ? [['alt', v.alt_unit]] : []), ['base', v.base_unit]];
  const dirty = touched(e);
  const value = (Number(e?.quantity) || 0) * (Number(e?.rate) || 0);
  const key = (col) => (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); onEnter(col, idx); } };

  return (
    <tr data-row-variant={v.id} data-dirty={dirty ? 'true' : undefined} style={{ background: error ? colors.dangerBg : dirty ? colors.tint(0.08) : 'transparent' }}>
      <td style={{ ...td, fontWeight: 700, minWidth: 130 }}>{v.ingredient}</td>
      <td style={{ ...td, minWidth: 130 }}>{v.name}{v.pack_size_base ? <span style={{ color: colors.textFaint, fontSize: '0.7rem' }}> · {num(v.alt_unit ? v.pack_size_base / v.alt_factor : v.pack_size_base, 3)} {v.alt_unit ?? v.base_unit}</span> : null}</td>
      <td style={{ ...td, textAlign: 'right', color: colors.textMuted, whiteSpace: 'nowrap' }}>{v.shelf > 0 ? `${num(v.shelf, 3)} ${v.base_unit}` : '—'}</td>
      <td style={{ ...td, width: 100 }}><input type="number" min="0" step="any" aria-label={`Quantity of ${v.ingredient} ${v.name}`} data-col="quantity" data-row={idx} style={cell} disabled={readOnly} value={e?.quantity ?? ''} onChange={(ev) => onEdit(v.id, { quantity: ev.target.value })} onKeyDown={key('quantity')} /></td>
      <td style={{ ...td, width: 84 }}>
        <select aria-label={`Unit of ${v.ingredient} ${v.name}`} style={cell} disabled={readOnly || units.length === 1} value={unit} onChange={(ev) => onEdit(v.id, { unit: ev.target.value })}>{units.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </td>
      <td style={{ ...td, width: 110 }}><input type="number" min="0" step="any" aria-label={`Price of one ${unit === 'pack' ? 'pack' : units.find(([k]) => k === unit)?.[1] ?? 'unit'} of ${v.ingredient} ${v.name}`} data-col="rate" data-row={idx} style={cell} disabled={readOnly} value={e?.rate ?? ''} onChange={(ev) => onEdit(v.id, { rate: ev.target.value })} onKeyDown={key('rate')} /></td>
      <td style={{ ...td, width: 110 }}><input type="text" maxLength={60} aria-label={`Batch number of ${v.ingredient} ${v.name}`} data-col="batch_no" data-row={idx} style={cell} disabled={readOnly} value={e?.batch_no ?? ''} onChange={(ev) => onEdit(v.id, { batch_no: ev.target.value })} onKeyDown={key('batch_no')} /></td>
      <td style={{ ...td, width: 140 }}>
        {v.track_expiry
          ? <input type="date" aria-label={`Expiry date of ${v.ingredient} ${v.name}`} data-col="expiry_date" data-row={idx} style={cell} disabled={readOnly} value={e?.expiry_date ?? ''} onChange={(ev) => onEdit(v.id, { expiry_date: ev.target.value })} onKeyDown={key('expiry_date')} />
          : <span style={{ color: colors.textFaint, fontSize: '0.74rem' }}>does not expire</span>}
      </td>
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', width: 90 }}>{value > 0 ? num(value) : ''}</td>
      <td style={{ ...td, minWidth: 150, fontSize: '0.72rem', color: colors.danger }}>{error}</td>
    </tr>
  );
});

export default function OpeningStockGrid({ ingredients, kinds = [], currency, locationId, onSave, readOnly = false }) {
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

  const variants = useMemo(() => ingredients.filter((i) => i.is_active).flatMap((i) => i.variants.filter((v) => v.is_active).map((v) => ({
    id: v.id, ingredient: i.name, ingredientId: i.id, kindId: i.kind_id, name: v.name, pack_size_base: v.pack_size_base, track_expiry: v.track_expiry, base_unit: i.base_unit, alt_unit: i.alt_unit, alt_factor: i.alt_factor ?? 1, shelf: v.qty_base,
  }))), [ingredients]);
  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => variants.filter((v) => (!only || String(v.ingredientId) === only) && (!kind || String(v.kindId) === kind)
    && (!needle || `${v.ingredient} ${v.name}`.toLowerCase().includes(needle))
    && (show === 'all' || (show === 'touched') === touched(edits[v.id]))), [variants, only, kind, needle, show, edits]);
  const known = useMemo(() => new Set(variants.map((v) => String(v.id))), [variants]);
  const dirtyIds = useMemo(() => Object.keys(edits).filter((id) => known.has(id) && touched(edits[id])), [edits, known]);
  const total = useMemo(() => dirtyIds.reduce((s, id) => s + (Number(edits[id].quantity) || 0) * (Number(edits[id].rate) || 0), 0), [dirtyIds, edits]);

  const edit = useCallback((id, patch) => {
    setEdits((all) => {
      const next = { ...all, [id]: { ...(all[id] ?? {}), ...patch } };
      if (Object.keys(next[id]).every((k) => next[id][k] === '' || next[id][k] === undefined)) delete next[id];   // emptied again: nothing left on the row

      return next;
    });
    setErrors((x) => (x[id] ? { ...x, [id]: undefined } : x));
  }, []);
  const enter = useCallback((col, idx) => { document.querySelector(`[data-col="${col}"][data-row="${idx + 1}"]`)?.focus(); }, []);

  const discard = () => {
    if (!dirtyIds.length || !window.confirm(`Throw away what you typed in ${dirtyIds.length} row${dirtyIds.length === 1 ? '' : 's'}?`)) return;
    setEdits({}); setErrors({}); setMessage(null);
  };

  const saveAll = async () => {
    const found = {};
    const lines = dirtyIds.map((id) => ({ id, v: variants.find((x) => String(x.id) === id), e: edits[id] }));
    lines.forEach(({ id, v, e }) => {
      const unit = e.unit ?? defaultUnit(v);
      if (!(Number(e.quantity) > 0)) found[id] = 'Enter how much.';
      else if (e.rate === undefined || e.rate === '') found[id] = 'Enter what one costs (0 if free).';
      else if (v.track_expiry && !e.expiry_date) found[id] = 'Needs an expiry date.';
      else if (unit === 'pack' && !v.pack_size_base) found[id] = 'No pack size: pick another unit.';
    });
    if (Object.keys(found).length) {
      setErrors(found); setMessage(`${Object.keys(found).length} row${Object.keys(found).length === 1 ? ' needs' : 's need'} fixing before anything is saved.`);
      document.querySelector(`[data-row-variant="${Object.keys(found)[0]}"]`)?.scrollIntoView?.({ block: 'center' });
      return;
    }
    setBusy(true); setErrors({}); setMessage(null);
    try {
      await onSave(lines.map(({ v, e }) => ({ item_id: v.id, quantity: Number(e.quantity), unit: e.unit ?? defaultUnit(v), rate: Number(e.rate), batch_no: e.batch_no || null, expiry_date: v.track_expiry ? e.expiry_date || null : null })));
      setEdits({});
    } catch (x) {
      const text = x?.response?.data?.message ?? x?.message ?? 'Could not save the opening stock.';
      const line = /^Line (\d+):/.exec(text);
      if (line && lines[Number(line[1]) - 1]) setErrors({ [lines[Number(line[1]) - 1].id]: text.replace(/^Line \d+:\s*/, '') });
      setMessage(`Nothing was saved. ${text}`);
    } finally { setBusy(false); }
  };

  return (
    <div data-testid="opening-grid">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textFaint, pointerEvents: 'none' }} />
          <TextInput aria-label="Search items or variants" placeholder="Search items or variants…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <KindFilter kinds={kinds} value={kind} onChange={pickKind} />
        <SelectInput aria-label="Item" value={only} onChange={(e) => setOnly(e.target.value)} style={{ width: 'auto', maxWidth: 220 }}>
          <option value="">All items</option>
          {ingredients.filter((i) => i.is_active && (!kind || String(i.kind_id) === kind) && i.variants.some((v) => v.is_active)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </SelectInput>
        <div role="group" aria-label="Show" style={{ display: 'inline-flex' }}>
          {[['all', 'All'], ['touched', 'Touched'], ['untouched', 'Not touched']].map(([k, l], i, a) => <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} style={{ ...seg(show === k), borderRadius: i === 0 ? '8px 0 0 8px' : i === a.length - 1 ? '0 8px 8px 0' : 0, marginLeft: i ? -1 : 0 }}>{l}</button>)}
        </div>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '0.78rem', color: colors.textMuted }} data-testid="dirty-count">{dirtyIds.length ? `${dirtyIds.length} row${dirtyIds.length === 1 ? '' : 's'} changed · ${num(total)}${currency ? ` ${currency}` : ''} before tax` : `Nothing typed yet${currency ? ` · prices in ${currency}` : ''}`}</span>
        {!readOnly && <button type="button" style={btnGhost} disabled={!dirtyIds.length || busy} onClick={discard}>Discard changes</button>}
        {!readOnly && <button type="button" data-hotkey="Save" style={{ ...btnPrimary, opacity: !dirtyIds.length || busy ? 0.55 : 1 }} disabled={!dirtyIds.length || busy} onClick={saveAll}>{busy ? 'Saving…' : `Save all (${dirtyIds.length})`}</button>}
      </div>
      {message && <p role="alert" style={{ margin: '0 0 10px', padding: '8px 12px', borderRadius: 8, background: colors.dangerBg, color: colors.dangerText, fontSize: '0.82rem' }}>{message}</p>}
      {dirtyIds.length > 0 && <p role="status" style={{ margin: '0 0 8px', fontSize: '0.72rem', color: colors.textFaint }}>Kept on this computer until you save or discard, so a reload or a closed tab loses nothing.</p>}
      <div style={{ ...card, padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 330px)', minHeight: 220 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 980 }}>
          <thead><tr>
            <th style={th}>Item</th><th style={th}>Variant</th><th style={{ ...th, textAlign: 'right' }}>On the shelf now</th><th style={th}>Quantity</th><th style={th}>In</th><th style={th}>Price of one</th><th style={th}>Batch no</th><th style={th}>Expiry date</th><th style={{ ...th, textAlign: 'right' }}>Value</th><th style={th} />
          </tr></thead>
          <tbody>
            {rows.map((v, idx) => <Row key={v.id} v={v} e={edits[v.id]} idx={idx} error={errors[v.id]} onEdit={edit} onEnter={enter} readOnly={readOnly} />)}
            {rows.length === 0 && <tr><td colSpan={10} style={{ ...td, padding: 20, color: colors.textMuted }}>{variants.length === 0 ? 'Add items and their variants under Ingredients & Supplies first.' : 'Nothing matches these filters.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: colors.textFaint }}>Opening stock is added to what is on the shelf. Type quantities in packs where a variant has a pack size. Enter moves down to the next row.</p>
    </div>
  );
}
