/** Scroll the box that holds `el` (a modal's body, or the page) back to its top, so a new screen is read from the start. */
export default function scrollTop(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const y = getComputedStyle(node).overflowY;
    if ((y === 'auto' || y === 'scroll') && node.scrollHeight > node.clientHeight) { node.scrollTop = 0; return; }
    node = node.parentElement;
  }
  window.scrollTo?.({ top: 0 });
}
