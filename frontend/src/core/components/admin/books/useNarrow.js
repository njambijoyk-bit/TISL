import { useEffect, useState } from 'react';

/** True while the window is narrower than `px`. */
export default function useNarrow(px) {
  const q = `(max-width: ${px - 1}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return narrow;
}
