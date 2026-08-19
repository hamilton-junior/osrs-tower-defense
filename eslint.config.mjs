import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * ESLint flat config.
 *
 * `eslint-config-next` is deliberately NOT used: it loads through
 * `@rushstack/eslint-patch`, which refuses to run under ESLint 10 ("Failed to
 * patch ESLint because the calling module was not recognized") and takes the
 * whole run down with it — which is why `npm run lint` did nothing at all for a
 * long stretch. The two rule sets this project actually wants are wired straight
 * to their plugins, which speak flat config natively:
 *
 *  - `typescript-eslint` for unused code (the reason lint exists here),
 *  - `react-hooks` for the dependency arrays in `GameRoot.tsx`, where a stale
 *    closure over engine state is a real, repeated failure mode.
 *
 * Lint is advice, not a gate: `next.config.ts` sets `eslint.ignoreDuringBuilds`,
 * and the hard gates stay `tsc --noEmit` + `npm run test`.
 */
export default [
  {
    ignores: [
      '.next/**',
      'out/**',
      'node_modules/**',
      'public/**',
      'docs/**',
      '.superpowers/**',
      'lib/game/data/*.data.ts', // generated sprite/animation tables
    ],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': reactHooks },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unreachable': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  {
    // Node asset/build scripts: plain ESM, no React, no TypeScript.
    files: ['scripts/**/*.mjs', '*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-unreachable': 'error',
    },
  },
];
