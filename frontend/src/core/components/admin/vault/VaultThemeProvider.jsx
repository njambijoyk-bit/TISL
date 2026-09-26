import React from 'react';
import useVaultStore from '../../../../_shared/store/useVaultStore';
import { VAULT_THEME_CSS } from './vaultThemes';

/**
 * VaultThemeProvider
 * ─────────────────
 * Wraps the vault page root and applies the current vault theme via
 * data-vault-theme attribute. Also injects the scoped CSS variables.
 *
 * Usage:
 *   <VaultThemeProvider>
 *     <VaultPage />
 *   </VaultThemeProvider>
 */
export function VaultThemeProvider({ children }) {
  const theme = useVaultStore(state => state.theme);

  return (
    <div data-vault-theme={theme} className="vault-page">
      <style>{VAULT_THEME_CSS}</style>
      {children}
    </div>
  );
}