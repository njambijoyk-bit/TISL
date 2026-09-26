import { useState, useEffect } from 'react';

/**
 * Returns true when the OS/browser prefers dark mode.
 * Updates reactively when the user changes their system setting.
 */
export function useSystemDark() {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const [isDark, setIsDark] = useState(mq.matches);

  useEffect(() => {
    const handler = (e) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return isDark;
}
