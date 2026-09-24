import React, { useState, useRef, useEffect } from 'react';
import { VAULT_THEMES, THEME_SWATCH } from './vaultThemes';
import useVaultStore from '../../../store/useVaultStore';

// ─── Icons ───────────────────────────────────────────────────────────────────

const PaletteIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
    <circle cx="7.5" cy="7.5" r="6" stroke="currentColor" strokeWidth="1.3" fill="none" opacity=".5"/>
    <circle cx="5"   cy="5.5" r="1.3" fill="currentColor"/>
    <circle cx="9.5" cy="4.5" r="1.3" fill="currentColor" opacity=".8"/>
    <circle cx="11"  cy="8.5" r="1.3" fill="currentColor" opacity=".6"/>
    <circle cx="8.5" cy="11" r="1.3"  fill="currentColor" opacity=".7"/>
    <circle cx="4.5" cy="9.5" r="1.3" fill="currentColor" opacity=".5"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M11.5 9.5a5.5 5.5 0 1 1-7-7 4.5 4.5 0 0 0 7 7z" stroke="currentColor" strokeWidth="1.3" fill="none"/>
  </svg>
);

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3" fill="none"/>
    <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.8 2.8l1.06 1.06M10.14 10.14l1.06 1.06M2.8 11.2l1.06-1.06M10.14 3.86l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

// ─── Component ───────────────────────────────────────────────────────────────

export function VaultThemeSwitcher() {
  const { theme, setTheme } = useVaultStore();
  const [open, setOpen] = useState(false);
  const btnRef  = useRef(null);
  const menuRef = useRef(null);

  const current = VAULT_THEMES.find(t => t.id === theme) ?? VAULT_THEMES[0];

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e) {
      if (
        menuRef.current && !menuRef.current.contains(e.target) &&
        btnRef.current  && !btnRef.current.contains(e.target)
      ) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handle(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open]);

  // Group themes by category
  const classicThemes = VAULT_THEMES.filter(t =>
    ['light','dark-plus','monokai','dracula','solarized-dark','tomorrow-night'].includes(t.id)
  );
  const exoticThemes = VAULT_THEMES.filter(t =>
    ['cyberpunk','aurora','midnight-forest','vaporwave','tokyo-night','obsidian','rose-pine','gruvbox','nord'].includes(t.id)
  );

  return (
    <div className="vault-theme-switcher" style={{ position: 'relative' }}>
      <button
        ref={btnRef}
        className={`vault-topnav__toggle ${open ? 'vault-topnav__toggle--active' : ''}`}
        onClick={() => setOpen(v => !v)}
        title="Switch vault theme"
        aria-label="Switch vault theme"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <PaletteIcon />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="vault-theme-menu"
          role="listbox"
          aria-label="Vault themes"
        >
          {/* Classic */}
          <div className="vault-theme-menu__group">
            <p className="vault-theme-menu__heading">Classic</p>
            {classicThemes.map(t => (
              <ThemeMenuItem
                key={t.id}
                theme={t}
                isActive={theme === t.id}
                onSelect={() => { setTheme(t.id); setOpen(false); }}
              />
            ))}
          </div>

          {/* Divider */}
          <div className="vault-theme-menu__divider" />

          {/* Exotic */}
          <div className="vault-theme-menu__group">
            <p className="vault-theme-menu__heading">Exotic</p>
            {exoticThemes.map(t => (
              <ThemeMenuItem
                key={t.id}
                theme={t}
                isActive={theme === t.id}
                onSelect={() => { setTheme(t.id); setOpen(false); }}
              />
            ))}
          </div>
        </div>
      )}

      <style>{switcherStyles}</style>
    </div>
  );
}

// ─── Theme Menu Item ─────────────────────────────────────────────────────────

function ThemeMenuItem({ theme, isActive, onSelect }) {
  return (
    <button
      className={`vault-theme-menu__item ${isActive ? 'vault-theme-menu__item--active' : ''}`}
      role="option"
      aria-selected={isActive}
      onClick={onSelect}
    >
      <span
        className="vault-theme-menu__swatch"
        style={{
          background: THEME_SWATCH[theme.id] || '#333',
          border: theme.id === 'light' || theme.id === 'gruvbox' ? '1px solid var(--D-border, #dee2e6)' : 'none',
        }}
        aria-hidden="true"
      />
      <span className="vault-theme-menu__label">{theme.label}</span>
      {theme.isDark ? (
        <span className="vault-theme-menu__mode-icon" aria-hidden="true" title="Dark mode">
          <MoonIcon />
        </span>
      ) : (
        <span className="vault-theme-menu__mode-icon" aria-hidden="true" title="Light mode">
          <SunIcon />
        </span>
      )}
      {isActive && (
        <span className="vault-theme-menu__check" aria-hidden="true">
          <CheckIcon />
        </span>
      )}
    </button>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const switcherStyles = `
  .vault-theme-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 100;
    min-width: 220px;
    max-height: 420px;
    overflow-y: auto;
    background: var(--D-surface, #ffffff);
    border: 1px solid var(--D-border, #e9ecef);
    border-radius: var(--D-radius, 8px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    animation: vault-theme-menu-in 120ms ease;
  }

  @keyframes vault-theme-menu-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .vault-theme-menu__group {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .vault-theme-menu__divider {
    height: 1px;
    background: var(--D-border, #e9ecef);
    margin: 4px 0;
  }

  .vault-theme-menu__heading {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--D-text-muted, #adb5bd);
    margin: 0 0 2px;
    padding: 2px 8px;
    user-select: none;
  }

  .vault-theme-menu__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 10px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 13px;
    color: var(--D-text-primary, #1a1a2e);
    cursor: pointer;
    text-align: left;
    transition: background 100ms;
    width: 100%;
  }

  .vault-theme-menu__item:hover {
    background: var(--D-hover, #f1f3f5);
  }

  .vault-theme-menu__item--active {
    background: var(--D-accent-soft, #e7f0ff);
    color: var(--D-accent, #2563eb);
    font-weight: 600;
  }

  .vault-theme-menu__item--active:hover {
    background: var(--D-accent-soft, #e7f0ff);
  }

  .vault-theme-menu__swatch {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08);
  }

  .vault-theme-menu__label {
    flex: 1;
  }

  .vault-theme-menu__mode-icon {
    display: flex;
    align-items: center;
    color: var(--D-text-muted, #adb5bd);
    flex-shrink: 0;
    opacity: 0.6;
  }

  .vault-theme-menu__check {
    display: flex;
    align-items: center;
    color: var(--D-accent, #2563eb);
    flex-shrink: 0;
  }
`;