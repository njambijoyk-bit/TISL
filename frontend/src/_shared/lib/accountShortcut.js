// Alt+A opens the account dropdown. A page that has one (the storefront header) registers it here; a page without one (the admin) gets the shortcut host's own.
const openers = new Set();

/** A page's account dropdown says how to toggle it. Returns the way to take it away again. */
export const registerAccountMenu = (toggle) => {
  openers.add(toggle);
  return () => openers.delete(toggle);
};

/** Toggle the page's own account dropdown. False when the page has none. */
export const toggleAccountMenu = () => {
  const first = [...openers].pop();
  if (!first) return false;
  first();

  return true;
};
