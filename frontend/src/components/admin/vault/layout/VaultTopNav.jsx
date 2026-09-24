import React from 'react';
import useVaultStore from '../../../../store/useVaultStore';
import useAuthStore from '../../../../store/authStore';
import { VaultThemeSwitcher } from '../VaultThemeSwitcher'; 

// ── Icons (inline SVG — no extra dep) ────────────────────────────────────────
const Icons = {
  browser: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".9"/>
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" opacity=".6"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".6"/>
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" opacity=".3"/>
    </svg>
  ),
  archiver: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="2" width="14" height="3" rx="1" fill="currentColor" opacity=".9"/>
      <rect x="1" y="7" width="14" height="7" rx="1" fill="currentColor" opacity=".3"/>
      <path d="M6 10.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  policies: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1L2 3.5V8c0 3 2.5 5.5 6 6.5 3.5-1 6-3.5 6-6.5V3.5L8 1z" fill="currentColor" opacity=".3"/>
      <path d="M8 1L2 3.5V8c0 3 2.5 5.5 6 6.5 3.5-1 6-3.5 6-6.5V3.5L8 1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  logs: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'browser',  label: 'Files',    icon: Icons.browser  },
  { id: 'archiver', label: 'Archiver', icon: Icons.archiver  },
  { id: 'policies', label: 'Policies', icon: Icons.policies  },
  { id: 'logs',     label: 'Logs',     icon: Icons.logs      },
  { id: 'settings', label: 'Settings', icon: Icons.settings, superAdminOnly: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// VaultTopNav
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultTopNav() {
  const { activeTab, setActiveTab, layout, setLayout, viewMode, setViewMode } = useVaultStore();
  const { user } = useAuthStore(); 

  const isSuperAdmin = user?.role === 'super_admin';
  const visibleTabs = TABS.filter(t => !t.superAdminOnly || isSuperAdmin);

  return (
    <nav className="vault-topnav" role="navigation" aria-label="Vault navigation">

      {/* Left — vault wordmark + tabs */}
      <div className="vault-topnav__left">
        <span className="vault-topnav__wordmark" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="1" y="1" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" opacity=".4"/>
            <rect x="4" y="4" width="10" height="10" rx="1.5" fill="currentColor" opacity=".15"/>
            <path d="M6 9h6M9 6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Vault
        </span>

        <div className="vault-topnav__tabs" role="tablist">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`vault-topnav__tab ${activeTab === tab.id ? 'vault-topnav__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="vault-topnav__tab-icon" aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Right — layout + view toggles + theme switcher */}
      <div className="vault-topnav__right">
        {/* Theme switcher */}
        <VaultThemeSwitcher />

        {/* Divider */}
        <div className="vault-topnav__divider" aria-hidden="true" />

        {/* Layout toggle (only in browser tab) */}
        {activeTab === 'browser' && (
          <>
            <div className="vault-topnav__toggle-group" role="group" aria-label="Layout">
              <button
                className={`vault-topnav__toggle ${layout === 'sidebar' ? 'vault-topnav__toggle--active' : ''}`}
                onClick={() => setLayout('sidebar')}
                title="Sidebar layout"
                aria-pressed={layout === 'sidebar'}
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <rect x="1" y="1" width="4" height="13" rx="1" fill="currentColor" opacity=".8"/>
                  <rect x="7" y="1" width="7" height="13" rx="1" fill="currentColor" opacity=".35"/>
                </svg>
              </button>
              <button
                className={`vault-topnav__toggle ${layout === 'breadcrumb' ? 'vault-topnav__toggle--active' : ''}`}
                onClick={() => setLayout('breadcrumb')}
                title="Full-width layout"
                aria-pressed={layout === 'breadcrumb'}
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <rect x="1" y="1" width="13" height="13" rx="1" fill="currentColor" opacity=".35"/>
                  <rect x="1" y="1" width="13" height="3.5" rx="1" fill="currentColor" opacity=".8"/>
                </svg>
              </button>
            </div>

            <div className="vault-topnav__divider" aria-hidden="true" />

            {/* View mode toggle */}
            <div className="vault-topnav__toggle-group" role="group" aria-label="View mode">
              <button
                className={`vault-topnav__toggle ${viewMode === 'card' ? 'vault-topnav__toggle--active' : ''}`}
                onClick={() => setViewMode('card')}
                title="Card view"
                aria-pressed={viewMode === 'card'}
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <rect x="1" y="1" width="5.5" height="5.5" rx="1" fill="currentColor" opacity=".8"/>
                  <rect x="8.5" y="1" width="5.5" height="5.5" rx="1" fill="currentColor" opacity=".8"/>
                  <rect x="1" y="8.5" width="5.5" height="5.5" rx="1" fill="currentColor" opacity=".8"/>
                  <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" fill="currentColor" opacity=".8"/>
                </svg>
              </button>
              <button
                className={`vault-topnav__toggle ${viewMode === 'table' ? 'vault-topnav__toggle--active' : ''}`}
                onClick={() => setViewMode('table')}
                title="Table view"
                aria-pressed={viewMode === 'table'}
              >
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <rect x="1" y="1" width="13" height="3" rx="1" fill="currentColor" opacity=".8"/>
                  <rect x="1" y="6" width="13" height="3" rx="1" fill="currentColor" opacity=".5"/>
                  <rect x="1" y="11" width="13" height="3" rx="1" fill="currentColor" opacity=".5"/>
                </svg>
              </button>
            </div>

        {/* Exit vault */}
        <button
            className="vault-topnav__exit-btn"
            onClick={() => window.location.href = '/admin'}
            title="Exit Vault"
        >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 2H2.5A1.5 1.5 0 001 3.5v7A1.5 1.5 0 002.5 12H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M9 4.5L12 7l-3 2.5M12 7H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Exit
        </button>

        <div className="vault-topnav__divider" aria-hidden="true" />
          </>
        )}

      </div>

      <style>{styles}</style>
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  .vault-topnav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 48px;
    padding: 0 16px;
    background: var(--D-surface, #ffffff);
    border-bottom: 1px solid var(--D-border, #e9ecef);
    flex-shrink: 0;
    gap: 12px;
    position: relative;
    z-index: 10;
  }

  .vault-topnav__left {
    display: flex;
    align-items: center;
    gap: 20px;
    min-width: 0;
  }

  .vault-topnav__wordmark {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 13px;
    font-weight: 600;
    color: var(--D-text-primary, #1a1a2e);
    letter-spacing: 0.01em;
    flex-shrink: 0;
    user-select: none;
  }

  .vault-topnav__tabs {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .vault-topnav__tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: var(--D-radius-sm, 6px);
    border: none;
    background: transparent;
    color: var(--D-text-secondary, #6c757d);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 120ms, color 120ms;
    white-space: nowrap;
    height: 32px;
  }

  .vault-topnav__tab:hover {
    background: var(--D-hover, #f1f3f5);
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-topnav__tab--active {
    background: var(--D-accent-soft, #e7f0ff);
    color: var(--D-accent, #2563eb);
    font-weight: 600;
  }

  .vault-topnav__tab--active:hover {
    background: var(--D-accent-soft, #e7f0ff);
  }

  .vault-topnav__tab-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  /* Right controls */
  .vault-topnav__right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .vault-topnav__divider {
    width: 1px;
    height: 20px;
    background: var(--D-border, #e9ecef);
  }

  .vault-topnav__toggle-group {
    display: flex;
    align-items: center;
    gap: 2px;
    background: var(--D-hover, #f1f3f5);
    border-radius: var(--D-radius-sm, 6px);
    padding: 3px;
  }

  .vault-topnav__toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--D-text-secondary, #6c757d);
    cursor: pointer;
    transition: background 100ms, color 100ms;
  }

  .vault-topnav__toggle:hover {
    background: var(--D-surface, #ffffff);
    color: var(--D-text-primary, #1a1a2e);
  }

  .vault-topnav__toggle--active {
    background: var(--D-surface, #ffffff);
    color: var(--D-accent, #2563eb);
    box-shadow: 0 1px 3px rgba(0,0,0,0.08);
  }

  /* Mobile — hide labels, keep icons */
  @media (max-width: 600px) {
    .vault-topnav__wordmark {
      display: none;
    }
    .vault-topnav__tab {
      padding: 5px 8px;
      font-size: 0; /* hide label text */
    }
    .vault-topnav__tab-icon {
      font-size: initial;
    }
  }
`;