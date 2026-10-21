import { useState, useEffect } from 'react';

export const GROUP_LABELS = { youth: 'Youth', women: 'Women', pwd: 'Persons with disabilities', sme: 'SMEs' };

/** True while the window is at most `px` wide. */
export function useNarrow(px = 720) {
  const q = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => { const m = window.matchMedia(q); const on = () => setNarrow(m.matches); m.addEventListener('change', on); return () => m.removeEventListener('change', on); }, [q]);
  return narrow;
}
