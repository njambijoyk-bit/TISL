import { Sun, Moon, Monitor } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import useThemeStore from '../../store/themeStore';

export default function ThemeSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme } = useThemeStore();
  const dropdownRef = useRef(null);

  const themes = [
    { value: 'light',  label: 'Light',  icon: Sun },
    { value: 'dark',   label: 'Dark',   icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];

  const CurrentIcon = themes.find(t => t.value === theme)?.icon ?? Monitor;

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(o => !o)}
        style={{
          width: 36, height: 36, borderRadius: 9, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          background: 'none', border: 'none', cursor: 'pointer', color: '#374151',
          transition: 'background 150ms',
        }}
        className="dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
        aria-label="Toggle theme"
      >
        <CurrentIcon size={17} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          zIndex: 9999,                          /* above sticky header */
          width: 148, background: 'white', borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)', border: '1px solid #f3f4f6',
          animation: 'fadeInDown 150ms ease',
          overflow: 'hidden',
        }} className="dark:bg-gray-800 dark:border-gray-700">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => { setTheme(value); setIsOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '0.82rem', fontWeight: theme === value ? 700 : 500,
                color: theme === value ? '#a855f7' : '#374151',
                transition: 'background 120ms',
              }}
              className="hover:bg-purple-50 dark:hover:bg-gray-700 dark:text-gray-300"
            >
              <Icon size={15} style={{ color: theme === value ? '#a855f7' : '#9ca3af' }} />
              {label}
              {theme === value && (
                <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: '#a855f7' }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}