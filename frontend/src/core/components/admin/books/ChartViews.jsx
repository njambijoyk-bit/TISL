import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import useNarrow from './useNarrow';

/**
 * Three ways to look at the chart of accounts besides the table:
 *  Sheet  — one boxed list per kind of account (the printed chart-of-accounts sheet)
 *  Blocks — coloured panels, one per kind
 *  Map    — a tree: chart → kind → group → ledgers
 * All three take the group tree and the flat ledger list; `onOpen(ledger)` is what happens when a ledger is clicked.
 */

const NATURES = [
  { key: 'asset',     label: 'Assets',      color: '#10b981' },
  { key: 'liability', label: 'Liabilities', color: '#f59e0b' },
  { key: 'income',    label: 'Income',      color: '#3b82f6' },
  { key: 'expense',   label: 'Expenses',    color: '#ef4444' },
];

const tint = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;

/** Ledgers grouped by group id, and for each top-level group of a kind the tree below it (empty groups dropped while searching). */
function prepare(groups, ledgers, searching) {
  const byGroup = {};
  ledgers.forEach((l) => { (byGroup[l.group_id] = byGroup[l.group_id] || []).push(l); });
  const build = (g) => {
    const children = (g.children ?? []).map(build).filter(Boolean);
    const own = byGroup[g.id] ?? [];
    if (searching && !own.length && !children.length) return null;
    return { id: g.id, name: g.name, own, children, total: own.length + children.reduce((s, c) => s + c.total, 0) };
  };
  return NATURES.map((n) => {
    const tops = groups.filter((g) => g.nature === n.key).map(build).filter(Boolean);
    return { ...n, tops, total: tops.reduce((s, t) => s + t.total, 0) };
  }).filter((n) => n.tops.length);
}

/** Shows the first few ledgers and a “+N more” button for the rest, so one long list (every customer) doesn't bury the chart. */
function Items({ list, onOpen, limit = 8, render }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, limit);
  return (
    <>
      {shown.map((l) => render(l, () => onOpen(l)))}
      {list.length > limit && (
        <button type="button" onClick={() => setAll(!all)}
          style={{ background: 'none', border: 'none', padding: '3px 0', fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-primary-500)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {all ? 'Show fewer' : `+${list.length - limit} more`} <ChevronDown size={12} style={{ transform: all ? 'rotate(180deg)' : 'none' }} />
        </button>
      )}
    </>
  );
}

const ledgerBtn = (l, open, style) => (
  <button key={l.id} type="button" onClick={open} title={l.group?.name}
    style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text-primary)', opacity: l.is_active === false ? 0.5 : 1, ...style }}>
    {l.name}
  </button>
);

const Empty = () => <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem', margin: '24px 0', textAlign: 'center' }}>Nothing to show.</p>;

// ───────────────────────── Sheet ─────────────────────────
function SheetGroup({ g, depth, color, onOpen }) {
  return (
    <>
      <div style={{ padding: `7px 14px 7px ${14 + depth * 14}px`, fontSize: '0.74rem', fontWeight: 700, letterSpacing: '0.02em', color, background: tint(color, 7), borderTop: `1px solid ${tint(color, 28)}` }}>
        {g.name} <span style={{ fontWeight: 500, opacity: 0.7 }}>{g.total || ''}</span>
      </div>
      <Items list={g.own} onOpen={onOpen} limit={10}
        render={(l, open) => ledgerBtn(l, open, { padding: `7px 14px 7px ${14 + (depth + 1) * 14}px`, fontSize: '0.82rem', borderTop: `1px solid ${tint(color, 18)}` })} />
      {g.children.map((c) => <SheetGroup key={c.id} g={c} depth={depth + 1} color={color} onOpen={onOpen} />)}
    </>
  );
}

export function SheetView({ groups, ledgers, searching, onOpen }) {
  const kinds = prepare(groups, ledgers, searching);
  if (!kinds.length) return <Empty />;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, alignItems: 'start' }}>
      {kinds.map((k) => (
        <section key={k.key} aria-label={k.label} style={{ border: `1.5px solid ${tint(k.color, 55)}`, borderRadius: 4, overflow: 'hidden', background: 'var(--surface-card)' }}>
          <h3 style={{ margin: 0, padding: '9px 14px', background: k.color, color: '#fff', fontSize: '0.92rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
            {k.label}<span style={{ fontWeight: 600, opacity: 0.85 }}>{k.total}</span>
          </h3>
          {k.tops.map((g) => <SheetGroup key={g.id} g={g} depth={0} color={k.color} onOpen={onOpen} />)}
        </section>
      ))}
    </div>
  );
}

// ───────────────────────── Blocks ─────────────────────────
function BlockGroup({ g, depth, color, onOpen }) {
  return (
    <div style={{ marginTop: depth ? 6 : 12, paddingLeft: depth ? 12 : 0 }}>
      <p style={{ margin: '0 0 3px', fontSize: depth ? '0.74rem' : '0.8rem', fontWeight: 700, color }}>{g.name}</p>
      <div style={{ paddingLeft: 4 }}>
        <Items list={g.own} onOpen={onOpen} limit={8}
          render={(l, open) => ledgerBtn(l, open, { padding: '2px 0', fontSize: '0.84rem' })} />
      </div>
      {g.children.map((c) => <BlockGroup key={c.id} g={c} depth={depth + 1} color={color} onOpen={onOpen} />)}
    </div>
  );
}

export function BlocksView({ groups, ledgers, searching, onOpen }) {
  const kinds = prepare(groups, ledgers, searching);
  if (!kinds.length) return <Empty />;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
      {kinds.map((k) => (
        <section key={k.key} aria-label={k.label} style={{ background: tint(k.color, 11), border: `1px solid ${tint(k.color, 25)}`, borderRadius: 14, padding: '16px 18px 18px' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            {k.label}
            <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: tint(k.color, 22), color: 'var(--text-primary)' }}>{k.total}</span>
          </h3>
          {k.tops.map((g) => <BlockGroup key={g.id} g={g} depth={0} color={k.color} onOpen={onOpen} />)}
        </section>
      ))}
    </div>
  );
}

// ───────────────────────── Map (radial) ─────────────────────────
const LINE = 'var(--line)';

function MapGroup({ g, color, onOpen, side }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ margin: '0 0 3px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', textAlign: side === 'left' ? 'right' : 'left' }}>{g.name}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: side === 'left' ? 'right' : 'left' }}>
        <Items list={g.own} onOpen={onOpen} limit={4}
          render={(l, open) => <li key={l.id} style={{ padding: '1px 0' }}><span aria-hidden="true" style={{ color }}>{side === 'left' ? '' : '• '}</span>{ledgerBtn(l, open, { padding: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'inline', width: 'auto' })}<span aria-hidden="true" style={{ color }}>{side === 'left' ? ' •' : ''}</span></li>} />
      </ul>
      {g.children.length > 0 && (
        <div style={{ marginTop: 6, [side === 'left' ? 'marginRight' : 'marginLeft']: 10, [side === 'left' ? 'paddingRight' : 'paddingLeft']: 10, [side === 'left' ? 'borderRight' : 'borderLeft']: `2px solid ${tint(color, 40)}` }}>
          {g.children.map((c) => <MapGroup key={c.id} g={c} color={color} onOpen={onOpen} side={side} />)}
        </div>
      )}
    </div>
  );
}

/** One branch: kind box on the spine side, a bracket, and its groups and ledgers fanning outwards. */
function Branch({ k, side, onOpen }) {
  const left = side === 'left';
  const label = (
    <span style={{ flex: 'none', padding: '10px 16px', borderRadius: 6, background: tint(k.color, 18), border: `1.5px solid ${tint(k.color, 55)}`, fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)', whiteSpace: 'nowrap', textAlign: 'center' }}>
      {k.label}<br /><span style={{ fontWeight: 600, letterSpacing: 0, opacity: 0.7 }}>{k.total} ledgers</span>
    </span>
  );
  const list = (
    <div style={{ flex: 1, minWidth: 0, padding: '4px 14px', [left ? 'borderRight' : 'borderLeft']: `2px solid ${tint(k.color, 55)}` }}>
      {k.tops.map((g) => <MapGroup key={g.id} g={g} color={k.color} onOpen={onOpen} side={side} />)}
    </div>
  );
  const arm = (w) => <span aria-hidden="true" style={{ flex: 'none', width: w, height: 2, background: LINE }} />;
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {left ? <>{list}{arm(16)}{label}{arm(36)}</> : <>{arm(36)}{label}{arm(16)}{list}</>}
    </div>
  );
}

export function MapView({ groups, ledgers, searching, onOpen }) {
  const kinds = prepare(groups, ledgers, searching);
  const narrow = useNarrow(820);
  if (!kinds.length) return <Empty />;
  if (narrow) {
    // a small screen: the centre on top, each kind stacked below it on a single trunk line
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ padding: '12px 20px', borderRadius: 8, background: 'color-mix(in srgb, var(--color-primary-500) 18%, var(--surface-card))', border: '2px solid color-mix(in srgb, var(--color-primary-500) 60%, transparent)', fontSize: '0.9rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>Chart of accounts</span>
        <div style={{ width: '100%', marginTop: 0, paddingLeft: 12, borderLeft: `2px solid ${LINE}`, marginLeft: 0 }}>
          {kinds.map((k) => (
            <div key={k.key} style={{ paddingTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span aria-hidden="true" style={{ width: 14, height: 2, background: LINE, marginLeft: -12 }} />
                <span style={{ marginLeft: 12, padding: '7px 12px', borderRadius: 6, background: tint(k.color, 18), border: `1.5px solid ${tint(k.color, 55)}`, fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{k.label} · {k.total}</span>
              </div>
              <div style={{ marginLeft: 12, marginTop: 8, paddingLeft: 12, borderLeft: `2px solid ${tint(k.color, 50)}` }}>
                {k.tops.map((g) => <MapGroup key={g.id} g={g} color={k.color} onOpen={onOpen} side="right" />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  // quadrants: top-left, top-right, bottom-left, bottom-right
  const leftKinds = kinds.filter((_, i) => i % 2 === 0);
  const rightKinds = kinds.filter((_, i) => i % 2 === 1);
  const col = (list, side) => (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 130 }}>
      {list.map((k) => <Branch key={k.key} k={k} side={side} onOpen={onOpen} />)}
    </div>
  );
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'stretch', minWidth: 980, position: 'relative', padding: '8px 0' }}>
        {col(leftKinds, 'left')}
        <div aria-hidden="true" style={{ flex: 'none', width: 2, background: LINE, position: 'relative' }} />
        {col(rightKinds, 'right')}
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', padding: '18px 22px', borderRadius: 8, background: 'color-mix(in srgb, var(--color-primary-500) 18%, var(--surface-card))', border: '2px solid color-mix(in srgb, var(--color-primary-500) 60%, transparent)', textAlign: 'center', fontSize: '1rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-primary)', lineHeight: 1.25, zIndex: 1 }}>
          Chart<br />of<br />accounts
        </div>
      </div>
    </div>
  );
}
