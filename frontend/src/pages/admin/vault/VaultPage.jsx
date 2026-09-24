import React, { useEffect, Suspense, lazy } from 'react';
import useVaultStore from '../../../store/useVaultStore';
import { VAULT_THEME_CSS } from '../../../components/admin/vault/vaultThemes';
import VaultTopNav   from '../../../components/admin/vault/layout/VaultTopNav';

// ── Lazy-load heavy views ─────────────────────────────────────────────────────
const VaultBrowserView  = lazy(() => import('../../../components/admin/vault/layout/VaultBrowserView'));
const VaultArchiverView = lazy(() => import('./VaultArchiverView'));
const VaultPoliciesView = lazy(() => import('./VaultPoliciesView'));
const VaultLogsView     = lazy(() => import('./VaultLogsView'));
const VaultSettingsView = lazy(() => import('./VaultSettingsView'));

// ── Per-view skeleton placeholders ────────────────────────────────────────────
function ViewSkeleton() {
  return (
    <div className="vault-view-skeleton">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="vault-skeleton-card" style={{ animationDelay: `${i * 60}ms` }} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VaultPage — route target: /admin/vault
// ─────────────────────────────────────────────────────────────────────────────
export default function VaultPage() {
  const { activeTab, resetSession, theme } = useVaultStore();

  // Clean up session state when unmounting (navigating away from vault)
  useEffect(() => {
    return () => resetSession();
  }, []); // eslint-disable-line

  return (
    <div data-vault-theme={theme} className="vault-page">
      {/* Inject scoped vault theme CSS */}
      <style>{VAULT_THEME_CSS}</style>

      <VaultTopNav />

      <div className="vault-content">
        <Suspense fallback={<ViewSkeleton />}>
          {activeTab === 'browser'  && <VaultBrowserView  />}
          {activeTab === 'archiver' && <VaultArchiverView />}
          {activeTab === 'policies' && <VaultPoliciesView />}
          {activeTab === 'logs'     && <VaultLogsView     />}
          {activeTab === 'settings' && <VaultSettingsView />}
        </Suspense>
      </div>

      <style>{styles}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = `
  .vault-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--D-bg, #f8f9fa);
  }

  .vault-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Skeleton loader */
  .vault-view-skeleton {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
    padding: 24px;
  }

  .vault-skeleton-card {
    height: 140px;
    border-radius: var(--D-radius, 8px);
    background: linear-gradient(
      90deg,
      var(--D-skeleton-base, #e9ecef) 25%,
      var(--D-skeleton-shine, #f1f3f5) 50%,
      var(--D-skeleton-base, #e9ecef) 75%
    );
    background-size: 200% 100%;
    animation: vault-shimmer 1.4s ease-in-out infinite;
  }

  @keyframes vault-shimmer {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
`;