import { Plus, X } from 'lucide-react';
import { colors } from '../../../../_shared/theme/tokens';
import { money, filterStyle } from './booksFmt';

/** The debit and credit lines of a memorandum, with the running balance, so finance can convert it into a journal. */
export default function MemoLines({ lines, onChange, ledgers, compact = false }) {
  const set = (i, patch) => onChange(lines.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const add = (side = 'D') => onChange([...lines, { ledger_id: '', side, amount: '', narration: '' }]);
  const debit = lines.reduce((t, l) => t + (l.side === 'D' ? Number(l.amount) || 0 : 0), 0);
  const credit = lines.reduce((t, l) => t + (l.side === 'C' ? Number(l.amount) || 0 : 0), 0);
  const diff = Math.round((debit - credit) * 100) / 100;
  const balanced = lines.filter((l) => l.ledger_id).length >= 2 && Math.abs(diff) < 0.005;
  const cell = { ...filterStyle, width: '100%', boxSizing: 'border-box' };
  return (
    <div>
      <div style={{ display: 'grid', gap: 8 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '74px minmax(160px,1.6fr) 120px minmax(120px,1fr) 28px', gap: 6, alignItems: 'center' }}>
            <select value={l.side} onChange={(e) => set(i, { side: e.target.value })} style={{ ...cell, fontWeight: 700, color: l.side === 'D' ? '#10b981' : '#ef4444' }} aria-label="Debit or credit"><option value="D">Dr</option><option value="C">Cr</option></select>
            <select value={l.ledger_id} onChange={(e) => set(i, { ledger_id: e.target.value })} style={cell} aria-label="Ledger"><option value="">Choose a ledger…</option>{ledgers.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
            <input type="number" min="0" step="0.01" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} placeholder="Amount" style={{ ...cell, textAlign: 'right' }} aria-label="Amount" />
            {!compact && <input value={l.narration ?? ''} onChange={(e) => set(i, { narration: e.target.value })} placeholder="Note (optional)" style={cell} aria-label="Line note" />}
            <button type="button" onClick={() => onChange(lines.filter((_, k) => k !== i))} aria-label="Remove line" style={{ border: 'none', background: 'none', cursor: 'pointer', color: colors.textFaint }}><X size={15} /></button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
        <button type="button" onClick={() => add('D')} style={{ ...filterStyle, cursor: 'pointer', display: 'inline-flex', gap: 5, alignItems: 'center' }}><Plus size={13} /> Debit line</button>
        <button type="button" onClick={() => add('C')} style={{ ...filterStyle, cursor: 'pointer', display: 'inline-flex', gap: 5, alignItems: 'center' }}><Plus size={13} /> Credit line</button>
        <span style={{ marginLeft: 'auto', fontSize: '0.76rem', fontVariantNumeric: 'tabular-nums', color: balanced ? 'var(--status-success, #059669)' : colors.textMuted }}>
          Dr {money(debit)} · Cr {money(credit)} {lines.length > 0 && (balanced ? '· balanced ✓' : Math.abs(diff) > 0.004 ? `· ${money(Math.abs(diff))} ${diff > 0 ? 'more debit' : 'more credit'}` : '')}
        </span>
      </div>
    </div>
  );
}
