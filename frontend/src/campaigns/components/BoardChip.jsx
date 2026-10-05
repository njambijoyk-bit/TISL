const TONES = {
  approved: ['#15803d', 'rgba(34,197,94,0.16)', 'Approved'],
  pending: ['#b45309', 'rgba(245,158,11,0.16)', 'Waiting for approval'],
  rejected: ['#b91c1c', 'rgba(239,68,68,0.14)', 'Not approved'],
  draft: ['var(--text-secondary)', 'rgba(148,163,184,0.18)', 'Draft'],
};

/** A board's state as a small chip: approved, waiting, not approved or draft; hidden boards say so. */
export default function BoardChip({ board }) {
  const [fg, bg, text] = TONES[board.approval_status] ?? TONES.draft;
  const chip = (t, c, b) => <span style={{ padding: '2px 9px', borderRadius: 999, fontSize: '0.68rem', fontWeight: 700, color: c, background: b, whiteSpace: 'nowrap' }}>{t}</span>;

  return (
    <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {chip(text, fg, bg)}
      {board.visibility === 'private' && chip('Private', '#0369a1', 'rgba(14,165,233,0.14)')}
      {board.status === 'hidden' && chip('Hidden', '#b91c1c', 'rgba(239,68,68,0.14)')}
    </span>
  );
}
