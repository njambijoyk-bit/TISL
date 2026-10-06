/** How a customer's moodboard reads to them: its words and colour. */
export const stateLabel = (m) => {
  if (m.visibility === 'private') return ['Private', 'var(--text-tertiary)'];
  if (m.approval_status === 'pending') return ['Waiting for approval', 'var(--status-warning, #b45309)'];
  if (m.approval_status === 'rejected') return ['Not approved', 'var(--status-error, #b91c1c)'];
  if (m.status === 'hidden') return ['Hidden by staff', 'var(--status-error, #b91c1c)'];

  return ['Public', 'var(--status-success, #15803d)'];
};
