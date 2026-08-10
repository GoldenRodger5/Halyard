import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

/**
 * Flat config, shared by every workspace package.
 *
 * Deliberately short. Formatting is not a debate worth having in a one-person
 * repo; the rules here are the ones that catch mistakes.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.render-output/**',
      '**/.screenshots/**',
      '**/types.gen.ts',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The codebase leans on `unknown` plus narrowing; `any` is the thing to
      // catch, and it is an error rather than a warning.
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
  {
    // Tests and scripts print, and construct values that are deliberately loose.
    files: ['**/*.test.ts', '**/*.test.tsx', 'scripts/**/*.ts', 'apps/worker/src/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Playwright's fixture API requires the object-destructuring form, so an
    // empty pattern is the correct way to declare a fixture that takes nothing.
    files: ['e2e/**/*.ts'],
    rules: { 'no-console': 'off', 'no-empty-pattern': 'off' },
  },
);
