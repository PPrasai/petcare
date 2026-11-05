import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';

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
    files: ['**/*.test.ts', '**/*.test.tsx', '**/test/**/*.ts', 'tests/**/*.ts', 'e2e/**/*.ts'],
    plugins: { vitest },
    rules: { 'vitest/no-disabled-tests': 'error', 'vitest/no-focused-tests': 'error' },
  },
);
