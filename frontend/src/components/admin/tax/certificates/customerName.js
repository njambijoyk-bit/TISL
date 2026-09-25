/** Best display name for a customer payload (company first, then person). */
export const customerName = (c) => {
  if (!c) return '—';
  const person = [c.first_name, c.last_name].filter(Boolean).join(' ');
  return c.company_name || person || c.user?.name || c.email || `Customer #${c.id}`;
};
