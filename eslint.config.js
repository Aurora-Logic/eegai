import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results', 'node_modules'],
  },

  // Generated file — its shape is not ours to lint.
  { ignores: ['src/lib/types.ts'] },

  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // PLAN.md §7: every status change goes through transition(). This makes a
      // stray `.update({ status })` visible in review rather than in production.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='update'] ObjectExpression > Property[key.name='status']",
          message:
            'Do not write donation.status directly. Route every status change through transition() in src/lib/state-machine.ts (PLAN.md §7).',
        },
      ],
    },
  },

  {
    files: ['**/*.config.{ts,js}', 'e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },

  // shadcn primitives are vendored — they export a component plus its cva
  // variants by design, which is exactly what react-refresh objects to. Not
  // ours to restructure (PLAN.md §4: "do not edit by hand beyond tokens").
  //
  // The session hook is the same shape: a provider component plus the hook and
  // constants that belong beside it. Splitting them to satisfy the rule would
  // make the code worse, not better.
  {
    files: ['src/components/ui/**/*.tsx', 'src/hooks/use-session.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },

  // Server code runs in Node, imports .ts extensions (Node's type stripping
  // requires them), and legitimately uses `any` at the pg boundary.
  {
    files: ['server/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
