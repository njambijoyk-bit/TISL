import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // Roles are made in the role builder, so code never names one. Ask for a permission (hasPermission) or for the kind of
      // account (isDriver, isCustomer, accountType): see src/_shared/lib/roles.js. The server decides either way; these only show or hide.
      'no-restricted-syntax': ['error',
        {
          selector: "BinaryExpression:has(MemberExpression[property.name=/^(role|userRole)$/]):has(Literal[value=/^(super_admin|admin|manager|finance|logistics|sales_rep|driver|customer|vendor|senior_accountant|cashier|chef)$/])",
          message: 'Do not compare a role name. Use hasPermission(user, "<permission>") or isDriver / isCustomer / accountType from _shared/lib/roles.',
        },
        {
          selector: "Literal[value=/^(super_admin|sales_rep|logistics|senior_accountant)$/]",
          message: 'Do not name a role in code. Roles are data: ask for a permission instead (see _shared/lib/roles.js).',
        },
        {
          selector: "Identifier[name=/^(hasAnyRole|effectiveRoles)$/]",
          message: 'Role-name checks were removed. Use hasPermission(user, "<permission>").',
        },
      ],
    },
  },
])
