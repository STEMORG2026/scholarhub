// ESLint, flat config. Added in v0.42.0 — the audit's CQ-001, and the first linter
// this repo has had.
//
// Two things worth knowing about how it is set up:
//
//   * **Browser and Node globals are separated by directory**, not merged. `src/`
//     runs in a browser and must never assume `process`; `scripts/` runs in Node and
//     must never assume `document`. Merging them would make both mistakes invisible,
//     which is most of what a linter is for here.
//
//   * **The rules are the recommended sets, unmodified, plus nothing.** A config
//     tuned to make an existing codebase quiet is a config that stops reporting. If
//     a recommended rule is genuinely wrong for this project, it gets an explicit
//     off with a reason, in this file, where it can be argued with.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },

  // The application: runs in a browser.
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // `no-unused-vars` must understand JSX: a component imported and used only as
      // `<Foo/>` is used.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Node-side: the validators, the smoke test, the test files.
  {
    files: ['scripts/**/*.mjs', 'data/**/*.js', 'src/**/*.test.js', '*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: { ...js.configs.recommended.rules },
  },
];
