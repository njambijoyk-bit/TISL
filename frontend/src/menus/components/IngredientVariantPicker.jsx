import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { SelectInput, TextInput } from '../../core/components/admin/ui/Form';
import { colors } from '../../_shared/theme/tokens';

/**
 * Picks an ingredient variant (Exe 2 kg, Pembe 24 kg...) without a huge list. Two ways, switched with the small toggle (the choice is remembered on this device):
 *   One search      type part of an ingredient or a variant; the matches are grouped by ingredient with their variants under them. Click, or arrows and Enter.
 *   Two steps       search an ingredient, then choose its variant in a short list of its own.
 * `variants` are { id, name, ingredient }; `value` is a variant id (as text); `onChange(id)` gets the new id as text.
 */

const KEY = 'menus.variantPicker.mode';
const readMode = () => { try { return localStorage.getItem(KEY) === 'steps' ? 'steps' : 'search'; } catch { return 'search'; } };
const saveMode = (m) => { try { localStorage.setItem(KEY, m); } catch { /* private window: the choice just is not kept */ } };
const has = (text, q) => String(text).toLowerCase().includes(q);

/** Groups of { ingredient, variants } that match: an ingredient whose name matches shows all its variants, else only the variants that match. */
function groupsFor(variants, query) {
  const q = query.trim().toLowerCase();
  const by = new Map();
  variants.forEach((v) => { if (!by.has(v.ingredient)) by.set(v.ingredient, []); by.get(v.ingredient).push(v); });

  return [...by.entries()].map(([ingredient, vs]) => ({ ingredient, variants: !q || has(ingredient, q) ? vs : vs.filter((v) => has(v.name, q)) })).filter((g) => g.variants.length).sort((a, b) => a.ingredient.localeCompare(b.ingredient));
}

const panel = { position: 'absolute', zIndex: 30, left: 0, right: 0, top: 'calc(100% + 4px)', maxHeight: 260, overflowY: 'auto', background: colors.surface, border: `1px solid ${colors.tint(0.25)}`, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.16)', padding: 4 };
const toggleBtn = (on) => ({ padding: '2px 9px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', border: `1px solid ${on ? colors.primary : colors.tint(0.2)}`, background: on ? colors.tint(0.14) : 'transparent', color: on ? colors.primary : colors.textMuted });

function Results({ groups, active, onPick, ingredientsOnly, onPickIngredient, selected }) {
  if (!groups.length) return <div style={{ padding: '10px 12px', fontSize: '0.8rem', color: colors.textMuted }}>Nothing matches. Check the spelling, or add it under Ingredients & Supplies.</div>;
  let n = -1;

  return groups.map((g, gi) => (
    <div key={g.ingredient}>
      <div
        role={ingredientsOnly ? 'option' : undefined}
        aria-selected={ingredientsOnly ? g.ingredient === selected : undefined}
        ref={(el) => { if (el && ingredientsOnly && gi === active) el.scrollIntoView?.({ block: 'nearest' }); }}
        onMouseDown={ingredientsOnly ? (e) => { e.preventDefault(); onPickIngredient(g.ingredient); } : undefined}
        style={{ padding: ingredientsOnly ? '6px 10px' : '6px 10px 2px', fontSize: '0.78rem', fontWeight: 800, color: colors.text, cursor: ingredientsOnly ? 'pointer' : 'default', borderRadius: 6, background: ingredientsOnly && gi === active ? colors.tint(0.14) : 'transparent' }}
      >{g.ingredient}</div>
      {!ingredientsOnly && g.variants.map((v) => {
        n += 1;
        const on = n === active;

        return (
          <div
            key={v.id}
            role="option"
            aria-selected={on}
            data-variant-option={v.id}
            ref={(el) => { if (el && on) el.scrollIntoView?.({ block: 'nearest' }); }}
            onMouseDown={(e) => { e.preventDefault(); onPick(v); }}
            style={{ padding: '5px 10px 5px 24px', fontSize: '0.82rem', cursor: 'pointer', borderRadius: 6, background: on ? colors.tint(0.14) : 'transparent', color: colors.textBody }}
          >↳ {v.name}</div>
        );
      })}
    </div>
  ));
}

export default function IngredientVariantPicker({ variants, value, onChange, label = 'Item variant' }) {
  const [mode, setMode] = useState(readMode);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [stepIngredient, setStepIngredient] = useState(null);
  const box = useRef(null);
  const selected = useMemo(() => variants.find((v) => String(v.id) === String(value)) ?? null, [variants, value]);
  const groups = useMemo(() => groupsFor(variants, query), [variants, query]);
  const flat = useMemo(() => groups.flatMap((g) => g.variants), [groups]);
  const ingredient = stepIngredient ?? selected?.ingredient ?? null;
  const ofIngredient = useMemo(() => variants.filter((v) => v.ingredient === ingredient), [variants, ingredient]);

  useEffect(() => { setActive(0); }, [query, mode]);
  useEffect(() => { if (selected) setStepIngredient(null); }, [selected]);

  const switchTo = (m) => { setMode(m); saveMode(m); setOpen(false); setQuery(''); };
  const pick = (v) => { onChange(String(v.id)); setOpen(false); setQuery(''); };
  const pickIngredient = (name) => {
    setStepIngredient(name); setOpen(false); setQuery('');
    const vs = variants.filter((v) => v.ingredient === name);
    if (vs.length === 1) onChange(String(vs[0].id)); else if (!vs.some((v) => String(v.id) === String(value))) onChange('');
  };
  const keys = (e) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); return; }   // closes the list, not the dialog behind it
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(0, (mode === 'search' ? flat.length : groups.length) - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (mode === 'search' && flat[active]) pick(flat[active]);
      else if (mode === 'steps' && groups[active]) pickIngredient(groups[active].ingredient);
    }
  };

  return (
    <div ref={box} style={{ position: 'relative' }} data-testid="variant-picker">
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 3 }} role="group" aria-label="How to choose">
        <button type="button" style={toggleBtn(mode === 'search')} aria-pressed={mode === 'search'} onClick={() => switchTo('search')} title="One search box: item and variant together">One search</button>
        <button type="button" style={toggleBtn(mode === 'steps')} aria-pressed={mode === 'steps'} onClick={() => switchTo('steps')} title="Pick the item first, then its variant">Item, then variant</button>
      </div>

      {mode === 'search' ? (
        <>
          <div style={{ position: 'relative' }}>
            <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textFaint, pointerEvents: 'none' }} />
            <TextInput
              aria-label={label} role="combobox" aria-expanded={open} aria-autocomplete="list" autoComplete="off"
              placeholder={selected ? '' : 'Search an item or a variant…'}
              value={open ? query : ''} style={{ paddingLeft: 30 }}
              onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onKeyDown={keys}
            />
            {selected && !open && <span style={{ position: 'absolute', left: 30, right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.84rem', color: colors.text, pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><strong>{selected.ingredient}</strong> ↳ {selected.name}</span>}
          </div>
          {open && <div role="listbox" style={panel}><Results groups={groups} active={active} onPick={pick} /></div>}
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ position: 'relative' }}>
            <ChevronDown size={14} aria-hidden="true" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textFaint, pointerEvents: 'none' }} />
            <TextInput
              aria-label="Item" role="combobox" aria-expanded={open} autoComplete="off" placeholder={ingredient ? '' : 'Search an item…'}
              value={open ? query : ''} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onKeyDown={keys}
            />
            {ingredient && !open && <span style={{ position: 'absolute', left: 10, right: 28, top: '50%', transform: 'translateY(-50%)', fontSize: '0.84rem', color: colors.text, pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ingredient}</span>}
            {open && <div role="listbox" style={panel}><Results groups={groups} active={active} ingredientsOnly onPickIngredient={pickIngredient} selected={ingredient} /></div>}
          </div>
          <SelectInput aria-label={label} value={value} disabled={!ingredient} onChange={(e) => onChange(e.target.value)}>
            <option value="">{ingredient ? 'Choose the variant…' : 'Variant'}</option>
            {ofIngredient.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </SelectInput>
        </div>
      )}
    </div>
  );
}
