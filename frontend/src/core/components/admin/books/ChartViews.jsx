import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

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

// ───────────────────────── Map ─────────────────────────
const LINE = 'var(--line)';

function MapGroup({ g, color, onOpen }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <p style={{ margin: '0 0 3px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>{g.name}</p>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <Items list={g.own} onOpen={onOpen} limit={5}
          render={(l, open) => <li key={l.id} style={{ padding: '1px 0' }}>{ledgerBtn(l, open, { padding: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'inline', width: 'auto' })}</li>} />
      </ul>
      {g.children.length > 0 && <div style={{ marginLeft: 12, marginTop: 6, paddingLeft: 10, borderLeft: `2px solid ${tint(color, 40)}` }}>
        {g.children.map((c) => <MapGroup key={c.id} g={c} color={color} onOpen={onOpen} />)}
      </div>}
    </div>
  );
}

export function MapView({ groups, ledgers, searching, onOpen }) {
  const kinds = prepare(groups, ledgers, searching);
  if (!kinds.length) return <Empty />;
  const box = (color, text) => (
    <span style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 6, background: tint(color, 16), border: `1.5px solid ${tint(color, 50)}`, fontSize: '0.8rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{text}</span>
  );
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'stretch', minWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingRight: 0 }}>
          <span style={{ display: 'inline-block', padding: '16px 20px', borderRadius: 8, background: 'color-mix(in srgb, var(--color-primary-500) 16%, transparent)', border: '2px solid color-mix(in srgb, var(--color-primary-500) 55%, transparent)', textAlign: 'center', fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
            Chart<br />of<br />accounts
          </span>
          <span aria-hidden="true" style={{ width: 28, height: 2, background: LINE }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, borderLeft: kinds.length > 1 ? `2px solid ${LINE}` : 'none', display: 'flex', flexDirection: 'column' }}>
          {kinds.map((k) => (
            <div key={k.key} style={{ display: 'flex', alignItems: 'flex-start', padding: '10px 0' }}>
              <span aria-hidden="true" style={{ width: 28, height: 2, background: LINE, marginTop: 22, flex: 'none' }} />
              <div style={{ flex: 'none', marginTop: 8 }}>{box(k.color, `${k.label} · ${k.total}`)}</div>
              <span aria-hidden="true" style={{ width: 24, height: 2, background: LINE, marginTop: 22, flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0, borderLeft: `2px solid ${tint(k.color, 45)}`, paddingLeft: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', columnGap: 18, alignItems: 'start' }}>
                {k.tops.map((g) => <MapGroup key={g.id} g={g} color={k.color} onOpen={onOpen} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
