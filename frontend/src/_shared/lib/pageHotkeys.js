// Function-key shortcuts that press a button the page already has, found by what it is called:
//   F12  a button, tab or link called "Configuration" (or "Loyalty configuration", "Programme configuration": one word, then configuration)
//   F7   a button, tab or link called "Recycle bin" or "Trash"
// A page needs no code for it: name the control that way and the key finds it. Buttons that do something with a configuration ("Save configuration",
// "Use shop-wide configuration") are not matched.
const MATCHERS = {
  F12: /^(?!(?:save|use|edit|reset|apply|cancel|open|add|new|set)\b)(?:[\p{L}'-]+ )?configuration$/iu,
  F7: /^(?:recycle bin|trash)(?: \d+)?$/i,   // a count after the name (Trash 3) is fine
};

const nameOf = (el) => (el.getAttribute('aria-label') || el.textContent?.trim() || el.title || '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
const usable = (el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.getClientRects().length > 0;

/** Is a dialog open? The page behind it is not the one being used. */
export const dialogOpen = () => !!document.querySelector('[role="dialog"]:not([data-shortcut-list]), dialog[open], [aria-modal="true"]');

/**
 * The control a function key should press on this page, or null when there is none or it cannot be told which (two different buttons by that name).
 * Buttons are preferred over links; several links that go to the same place count as one.
 */
export function pageHotkeyTarget(key, root = document.querySelector('main') || document) {
  const match = MATCHERS[key];
  if (!match || !root) return null;
  const found = [...root.querySelectorAll('button, a[href], [role="tab"]')].filter((el) => usable(el) && match.test(nameOf(el)));
  const buttons = found.filter((el) => el.tagName !== 'A');
  if (buttons.length) return buttons.length === 1 ? buttons[0] : null;
  const links = found.filter((el) => el.tagName === 'A');

  return links.length && new Set(links.map((a) => a.getAttribute('href'))).size === 1 ? links[0] : null;
}

export const HOTKEYS = Object.keys(MATCHERS);
