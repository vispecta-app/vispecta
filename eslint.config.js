// ESLint (#57): only rules that catch real mistakes – undefined names and unused variables. No style rules.
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'public/**', 'node_modules/**', 'scripts/samples/**'] },
  {
    files: ['src/**/*.js', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'vite.config.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.worker, __BUILD_INFO__: 'readonly' },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
    },
  },
  { files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'vite.config.js'], languageOptions: { globals: { ...globals.node } } },
];
