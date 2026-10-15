import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import useThemeStore from '../../store/themeStore';
import { useTheme } from '../../theme';

/** A sliding light/dark switch: sun on the left, moon on the right. It drives the appearance provider, so the whole page changes, not only the button. */
export default function ThemeSwitch() {
  const { setTheme } = useThemeStore();
  const { mode, setMode } = useTheme();
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark');
  useEffect(() => {
    const read = () => setDark(document.documentElement.getAttribute('data-theme') === 'dark');
    read();
    const o = new MutationObserver(read);
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    return () => o.disconnect();
  }, [mode]);
  const toggle = () => { const next = dark ? 'light' : 'dark'; setMode(next); setTheme(next); };

  return (
    <button type="button" role="switch" aria-checked={dark} onClick={toggle} aria-label="Dark theme" title={dark ? 'Dark theme on' : 'Light theme on'}
      style={{ position: 'relative', width: 64, height: 32, borderRadius: 999, border: '1.5px solid var(--line)', padding: 0, cursor: 'pointer', flexShrink: 0, background: dark ? 'var(--color-primary-500)' : 'var(--bg-tertiary, #f3f4f6)', transition: 'background 200ms ease' }}>
      <Sun size={14} aria-hidden="true" style={{ position: 'absolute', left: 9, top: 8, color: dark ? 'var(--text-inverse, #fff)' : 'var(--text-secondary)', opacity: dark ? 0.7 : 0 }} />
      <Moon size={14} aria-hidden="true" style={{ position: 'absolute', right: 9, top: 8, color: 'var(--text-secondary)', opacity: dark ? 0 : 0.8 }} />
      <span aria-hidden="true" style={{ position: 'absolute', top: 3, left: dark ? 35 : 3, width: 24, height: 24, borderRadius: '50%', background: 'var(--surface-card, #fff)', boxShadow: '0 1px 4px rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', transition: 'left 200ms ease' }}>
        {dark ? <Moon size={14} color="var(--color-primary-600)" /> : <Sun size={14} color="var(--color-primary-600)" />}
      </span>
    </button>
  );
}
