const TONES = {
  draft: ['var(--text-secondary)', 'var(--surface-hover, rgba(148,163,184,0.15))'],
  scheduled: ['#0369a1', 'rgba(14,165,233,0.14)'],
  teaser: ['#7c3aed', 'rgba(139,92,246,0.14)'],
  live: ['#15803d', 'rgba(34,197,94,0.16)'],
  paused: ['#b45309', 'rgba(245,158,11,0.16)'],
  ended: ['var(--text-secondary)', 'rgba(148,163,184,0.18)'],
  archived: ['var(--text-tertiary)', 'rgba(148,163,184,0.12)'],
};
const LABELS = { draft: 'Draft', scheduled: 'Scheduled', teaser: 'Teaser', live: 'Live', paused: 'Paused', ended: 'Ended', archived: 'Archived' };
const APPROVAL = { pending: ['Waiting for approval', '#b45309'], rejected: ['Not approved', '#b91c1c'] };

/** A campaign's status as a small coloured chip, with a note when it is waiting for approval or was not approved. */
export default function StatusChip({ status, approval }) {
  const [fg, bg] = TONES[status] ?? TONES.draft;
  const note = APPROVAL[approval];

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, color: fg, background: bg, whiteSpace: 'nowrap' }}>{LABELS[status] ?? status}</span>
      {status === 'draft' && note && <span style={{ fontSize: '0.68rem', fontWeight: 600, color: note[1] }}>{note[0]}</span>}
    </span>
  );
}
