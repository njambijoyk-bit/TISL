// Keys that press a button the page already has, found by what it is called. A page needs no code for them: name the control that way and the key finds it.
//   F12      Configuration (or "Loyalty configuration", "Programme configuration": one word, then configuration)
//   F7       Recycle bin or Trash
//   F2       New / Add / Create something (admin pages)
//   F8       Filters
//   F9       Export / Download
//   Save     Save, Save changes         (Ctrl+S / Cmd+S)
//   Close    Close, or the X of the open dialog    (Esc)
//   Previous / Next / Refresh   (Shift+Left / Shift+Right / Shift+R)
// Buttons that do something else with the word ("Save configuration", "Use shop-wide configuration", "Save and close") are not matched. When two different buttons carry
// the name, nothing is pressed: the key never guesses.
const MATCHERS = {
  F12: /^(?!(?:save|use|edit|reset|apply|cancel|open|add|new|set)\b)(?:[\p{L}'-]+ )?configuration$/iu,
  F7: /^(?:recycle bin|trash)(?: \d+)?$/i,   // a count after the name (Trash 3) is fine
  F2: /^(?:(?:new|add|create)(?: [\p{L}'-]+){1,3}|add|create)$/iu,   // "New" alone is a status, not an action
  F8: /^(?:show |hide )?filters?(?: \d+)?$/i,
  F9: /^(?:export|download)(?: (?:csv|pdf|excel|xlsx|report|list|data))?$/i,
  Save: /^save(?: changes)?$/i,
  Close: /^close$/i,
  Previous: /^(?:previous|prev)(?: page)?$/i,
  Next: /^next(?: page)?$/i,
  Refresh: /^refresh$/i,
};

const DIALOGS = '[role="dialog"]:not([data-shortcut-list]), dialog[open], [aria-modal="true"]';
const shown = (el) => el.getClientRects().length > 0;
const rawName = (el) => el.getAttribute('aria-label') || el.textContent?.trim() || el.title || '';
const nameOf = (el) => rawName(el).replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
const usable = (el) => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && shown(el);
/** A button that is only an X (an icon, or the letter) and says nothing else. */
const isXIcon = (el) => !el.getAttribute('aria-label') && !el.title && (/^[×✕✖xX]$/.test(el.textContent?.trim() ?? '') || (!el.textContent?.trim() && !!el.querySelector('svg.lucide-x')));

/** The dialogs open now, the last one being the one on top. */
const openDialogs = () => [...document.querySelectorAll(DIALOGS)].filter(shown);
export const dialogOpen = () => openDialogs().length > 0;
export const topDialog = () => openDialogs().pop() ?? null;
const pageRoot = () => document.querySelector('main') || document;

/**
 * The control a key should press, or null when there is none or it cannot be told which (two different buttons by that name).
 * Buttons are preferred over links; several links that go to the same place count as one.
 */
export function pageHotkeyTarget(key, root = pageRoot()) {
  const match = MATCHERS[key];
  if (!match || !root) return null;
  const found = [...root.querySelectorAll('button, a[href], [role="tab"]')].filter((el) => usable(el) && match.test(nameOf(el)));
  const buttons = found.filter((el) => el.tagName !== 'A');
  if (buttons.length) return buttons.length === 1 ? buttons[0] : null;
  const links = found.filter((el) => el.tagName === 'A');

  return links.length && new Set(links.map((a) => a.getAttribute('href'))).size === 1 ? links[0] : null;
}

/** Where Save looks: the open dialog, else the page. */
export const saveTarget = () => pageHotkeyTarget('Save', topDialog() ?? pageRoot());

/**
 * What Esc closes: in the dialog on top, its button called Close, else its X; with no dialog open, the one Close button on the page
 * (an X outside a dialog is not taken: it may remove a tag or a line).
 */
export function closeTarget() {
  const dialog = topDialog();
  if (!dialog) return pageHotkeyTarget('Close');
  const buttons = [...dialog.querySelectorAll('button, [role="button"]')].filter(usable);

  return buttons.find((el) => MATCHERS.Close.test(nameOf(el))) ?? buttons.find(isXIcon) ?? null;
}

/** The search box of the page, for "/": a search field in the page, else one in the header. */
export function searchBox() {
  const isSearch = (i) => usable(i) && ['text', 'search', ''].includes(i.type) && (i.type === 'search' || /search|find/i.test(`${i.placeholder} ${i.getAttribute('aria-label') ?? ''} ${i.name}`));
  const inMain = [...pageRoot().querySelectorAll('input')].find(isSearch);

  return inMain ?? [...document.querySelectorAll('input')].find(isSearch) ?? null;
}
