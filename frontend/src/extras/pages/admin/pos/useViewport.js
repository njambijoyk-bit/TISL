import { useEffect, useState } from 'react';

/** The window width, kept current: `narrow` is a phone or a small tablet held upright, `tiny` is a phone. The two checkouts lay themselves out from it. */
export default function useViewport() {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => { window.removeEventListener('resize', on); window.removeEventListener('orientationchange', on); };
  }, []);

  return { width: w, narrow: w < 900, tiny: w < 560 };
}
