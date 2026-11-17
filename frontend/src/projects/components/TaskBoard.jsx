import { useState } from 'react';
import { day } from '../lib/format';
import { Chip, SelectInput } from './ui';

/**
 * The board (build 5.2): a column per status. Drag a card to another column, or use its "Move to" list, to change the status; the server makes
 * the same checks as the buttons in the task panel (asking why when it waits for something open, refusing to finish with open subtasks).
 */
export default function TaskBoard({ data, onMove, onOpen }) {
  const [over, setOver] = useState(null);
  const S = data.statuses;
  const may = (t) => data.can.manage || t.mine;
  return (
    <div style={{ overflowX: 'auto' }} data-board>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Object.keys(S).length}, minmax(190px, 1fr))`, gap: 10, minWidth: 980 }}>
        {Object.entries(S).map(([k, label]) => {
          const cards = data.tasks.filter((t) => t.status === k && t.matches !== false);
          return (
            <section key={k} data-column={k} aria-label={label}
              onDragOver={(e) => { e.preventDefault(); setOver(k); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = Number(e.dataTransfer.getData('text/plain')); const t = data.tasks.find((x) => x.id === id); if (t && t.status !== k) onMove(t, k); }}
              style={{ background: 'var(--surface-input)', borderRadius: 10, padding: 8, display: 'grid', gap: 8, alignContent: 'start', minHeight: 140, outline: over === k ? '2px dashed var(--color-primary-500)' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)' }}><span>{label}</span><span>{cards.length}</span></div>
              {cards.map((t) => (
                <article key={t.id} data-card={t.ref} draggable={may(t)} onDragStart={(e) => e.dataTransfer.setData('text/plain', String(t.id))}
                  style={{ background: 'var(--surface-card)', border: '1px solid var(--line)', borderRadius: 8, padding: 8, display: 'grid', gap: 6, cursor: may(t) ? 'grab' : 'default' }}>
                  <button type="button" onClick={() => onOpen(t.id)} style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>T{t.number}</span> <strong style={{ fontSize: 13.5 }}>{t.title}</strong>
                  </button>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {t.overdue && <Chip status="problem">Overdue</Chip>}
                    {!t.overdue && t.due_date && <Chip>{day(t.due_date)}</Chip>}
                    {t.waits_for.some((w) => w.open) && <Chip status="warning">waits</Chip>}
                    {t.checks.total > 0 && <Chip>{t.checks.done}/{t.checks.total}</Chip>}
                  </div>
                  {t.people.length > 0 && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.people.map((x) => x.name).join(', ')}</span>}
                  {may(t) && (
                    <SelectInput aria-label={`Move ${t.ref} to`} value="" onChange={(e) => e.target.value && onMove(t, e.target.value)} style={{ fontSize: 12, padding: '4px 6px' }}>
                      <option value="">Move to…</option>
                      {Object.entries(S).filter(([s]) => s !== k).map(([s, l]) => <option key={s} value={s}>{l}</option>)}
                    </SelectInput>
                  )}
                </article>
              ))}
              {cards.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Nothing here.</span>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
