/** Opens a file (PDF or HTML in a new tab) or downloads it, from a URL the server made. */
export function goToFile(url, inline) {
  if (inline) {
    window.open(url, '_blank', 'noopener');
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
