import { useState } from 'react';

/** The way items are shown, remembered on this device: pictures (the image with the name over it, when there is one) or a plain list. */
export default function useItemView(key) {
  const [view, setView] = useState(() => { try { return localStorage.getItem(key) === 'list' ? 'list' : 'pictures'; } catch { return 'pictures'; } });
  const set = (v) => { setView(v); try { localStorage.setItem(key, v); } catch { /* the choice is just not remembered */ } };

  return [view, set];
}
