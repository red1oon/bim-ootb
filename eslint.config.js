// CI gate: catch undefined-identifier references in viewer scripts before deploy.
// These are browser global-scope <script> files (NOT ES modules) that share a
// large vocabulary of cross-file globals. no-undef is the ONLY active rule —
// it catches bugs like S282b's `isMobile` (valid syntax, undefined at runtime,
// invisible to `node --check`). The PROJECT_GLOBALS list is the known shared
// vocabulary on main; keep it green so the gate only fires on NEW refs.
const globals = require('globals');

// Known shared cross-file globals + intentional UMD pseudo-globals on main,
// curated so `eslint viewer` is GREEN on main (see header). Generated from the
// baseline; add a name here when you intentionally introduce a new shared
// global. The gate fires on any reference NOT in this list.
const PROJECT_GLOBALS = require('./eslint.globals.json');

module.exports = [
  // Global ignores (no `files` key = applies repo-wide).
  // viewer/lib/** = third-party bundles. viewer/ad_*.js = ERP module surface,
  // excluded while ERP phases are actively in flight (re-include later).
  {
    ignores: [
      'viewer/lib/**',          // third-party bundles
      'viewer/ad_*.js',         // ERP module surface — phases in flight
      'viewer/*_test.js',       // node CLI test harnesses (shebang + require)
      'viewer/test_*.js',       // node CLI test runner
      'viewer/mep_qto_populate.js', // node CLI populate utility
    ],
  },
  {
    files: ['viewer/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.worker,
        ...globals.serviceworker,
        // --- third-party libs loaded via <script>/importmap ---
        THREE: 'readonly',
        Chart: 'readonly',
        ExcelJS: 'readonly',
        saveAs: 'readonly',
        initSqlJs: 'readonly',
        ...PROJECT_GLOBALS,
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
];
