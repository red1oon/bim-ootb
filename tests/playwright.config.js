// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

// Serve deploy/ on localhost:8080 — matches real deployment (static files)
const DEPLOY_ROOT = path.resolve(__dirname, '..', '..');

module.exports = defineConfig({
  testDir: './specs',
  fullyParallel: false,         // sequential within each spec (shared beforeEach)
  retries: 0,                   // no retries — a fail is a fail
  workers: 3,                   // S233: 3 workers, more causes server contention
  // Speed: npx playwright test --grep @fast    → <60s structural tests
  //        npx playwright test                 → full suite (~5min, nightly)
  // See PlaywrightAnalysis.md §Anti-Drift Rules + §Suite Speed
  timeout: 60000,               // 60s per test (streaming can be slow)
  expect: { timeout: 15000 },   // 15s for assertions (wait for stream)

  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: '../test-results' }],
  ],

  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // WebGL rendering in headless Chromium
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader'],
    },
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
      testMatch: /09-mobile/,   // only run mobile spec
    },
    {
      name: 'landscape',
      use: {
        ...devices['iPhone 13 landscape'],
      },
      testMatch: /09-mobile/,
    },
  ],

  webServer: {
    command: `python3 -m http.server 8080 --directory "${DEPLOY_ROOT}"`,
    port: 8080,
    reuseExistingServer: true,
    timeout: 10000,
  },
});
