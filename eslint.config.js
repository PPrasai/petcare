import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'reports/**',
      'packages/contracts/src/generated/**',
      '.aeom/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  { languageOptions: { globals: { ...globals.node } } },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/test/**/*.ts', 'tests/**/*.ts', 'e2e/**/*.ts'],
    plugins: { vitest },
    rules: { 'vitest/no-disabled-tests': 'error', 'vitest/no-focused-tests': 'error' },
  },
);
