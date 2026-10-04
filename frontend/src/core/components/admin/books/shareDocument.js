import booksAPI from '../../../../_shared/api/books';

/** Hand a blob to the browser as a download. */
export const downloadBlob = (blob, name) => {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
};

/** Open the customer copy in a new tab, where the browser's own viewer can print it. */
export const printCustomerCopy = async (id) => {
  const win = window.open('', '_blank');   // opened inside the click so it is not blocked
  try {
    const { blob } = await booksAPI.customerCopyFile(id);
    const url = URL.createObjectURL(blob);
    if (win) win.location.href = url; else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { win?.close(); throw e; }
};

/**
 * WhatsApp cannot be handed a file from a web page. So: on a phone (or any browser that can share files) the share sheet opens with the
 * PDF attached; anywhere else the PDF is saved to this computer and the chat opens with the message, ready for the file to be attached.
 * Returns 'shared' or 'downloaded'.
 */
export const whatsappDocument = async ({ id, digits, text, to }) => {
  const win = window.open('', '_blank');
  try {
    const { blob, name } = await booksAPI.customerCopyFile(id);
    booksAPI.logWhatsapp(id, to).catch(() => {});
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        win?.close();
        return 'shared';
      } catch (e) {
        if (e?.name === 'AbortError') { win?.close(); return 'cancelled'; }
        // the browser refused (it wants a fresher click): fall back to download + chat
      }
    }
    downloadBlob(blob, name);
    const url = `https://wa.me/${digits || ''}?text=${encodeURIComponent(text)}`;
    if (win) win.location.href = url; else window.open(url, '_blank');
    return 'downloaded';
  } catch (e) { win?.close(); throw e; }
};
