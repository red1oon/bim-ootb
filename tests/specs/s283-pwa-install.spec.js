// s283-pwa-install.spec.js — PWA install badge, manifest, service worker
// Bugs prevented:
//   beforeinstallprompt captured too late (inside async setupScene)
//   index.html 404 in precache (actual file is viewer.html)
//   Badge disappears after first install prompt consumed

const { test, expect } = require('@playwright/test');

// PWA tests need a real origin with manifest + SW — use localhost:8080
const VIEWER_URL = '/bim-ootb/viewer/viewer.html';
const MANIFEST_URL = '/bim-ootb/viewer/manifest.webmanifest';
const SW_URL = '/bim-ootb/viewer/sw.js';

test.describe('S283 PWA Install', () => {

  test('S283.1 Manifest is valid and installable', async ({ page }) => {
    const resp = await page.goto(MANIFEST_URL);
    expect(resp.status()).toBe(200);
    const manifest = await resp.json();
    console.log('§PW_S283 manifest name=' + manifest.name + ' start=' + manifest.start_url);

    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('viewer.html');
    expect(manifest.name).toBeTruthy();
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(2);

    // Icons are reachable
    for (const icon of manifest.icons) {
      const iconResp = await page.goto('/bim-ootb/viewer/' + icon.src);
      expect(iconResp.status()).toBe(200);
      console.log('§PW_S283 icon=' + icon.src + ' size=' + icon.sizes + ' status=200');
    }
  });

  test('S283.2 SW registers and responds to GET_PRECACHE', async ({ page }) => {
    // Load viewer so SW registers
    await page.goto(VIEWER_URL);
    // Wait for SW registration
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 15000 });
    console.log('§PW_S283 sw registered');

    // Send GET_PRECACHE message via page context
    const result = await page.evaluate(() => {
      return new Promise((resolve, reject) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (ev) => resolve(ev.data);
        setTimeout(() => reject(new Error('GET_PRECACHE timeout')), 5000);
        navigator.serviceWorker.controller.postMessage({ type: 'GET_PRECACHE' }, [ch.port2]);
      });
    });

    console.log('§PW_S283 precache assets=' + result.assets.length + ' libs=' + result.libs.length + ' version=' + result.version);
    expect(result.assets.length).toBeGreaterThan(50);
    expect(result.libs.length).toBeGreaterThan(5);
    expect(result.version).toMatch(/^v\d+$/);
  });

  test('S283.3 All precache assets return 200', async ({ page }) => {
    // Load viewer so SW registers
    await page.goto(VIEWER_URL);
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 15000 });

    // Get precache list
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = (ev) => resolve(ev.data);
        navigator.serviceWorker.controller.postMessage({ type: 'GET_PRECACHE' }, [ch.port2]);
      });
    });

    // Check each asset is reachable via fetch (not page.goto — .wasm fails navigation)
    const allAssets = [...result.assets, ...result.libs];
    const failures = await page.evaluate(async (assets) => {
      const fails = [];
      for (const url of assets) {
        try {
          const r = await fetch(url, { method: 'HEAD' });
          if (!r.ok) fails.push(url + ' → ' + r.status);
        } catch(e) {
          fails.push(url + ' → ' + e.message);
        }
      }
      return fails;
    }, allAssets);
    console.log('§PW_S283 precache_check total=' + allAssets.length + ' fail=' + failures.length);
    if (failures.length > 0) console.log('§PW_S283 MISSING: ' + failures.join(', '));
    expect(failures.length).toBe(0);
  });

  test('S283.4 beforeinstallprompt listener wired early', async ({ page }) => {
    // Navigate to viewer
    await page.goto(VIEWER_URL);

    // Check that window._installPrompt is initialized (null = listener wired, just no event yet)
    const hasListener = await page.evaluate(() => {
      return '_installPrompt' in window;
    });
    console.log('§PW_S283 beforeinstallprompt listener=' + hasListener);
    expect(hasListener).toBe(true);
  });

  test('S283.5 Help panel shows blue badge', async ({ page }) => {
    await page.goto(VIEWER_URL);
    // Wait for pill to be ready
    await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 });

    // Open Help palette (F1 or ? key)
    await page.keyboard.press('F1');
    await page.waitForSelector('#cmd-palette', { timeout: 5000 });

    // Badge should be visible
    const badge = await page.$('#cmd-install-badge');
    expect(badge).toBeTruthy();
    console.log('§PW_S283 badge visible=true');

    // Check badge color is blue (#4fc3f7) — not green
    const borderColor = await badge.evaluate(el => el.style.borderColor);
    expect(borderColor).toContain('rgb(79, 195, 247)');  // #4fc3f7
    console.log('§PW_S283 badge color=blue');

    // Check tooltip
    const title = await badge.getAttribute('title');
    expect(title).toContain('Download');
    console.log('§PW_S283 badge title=' + title);
  });

  test('S283.6 Badge click triggers download overlay', async ({ page }) => {
    await page.goto(VIEWER_URL);
    await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 });

    // Wait for SW controller to be ready (needed for GET_PRECACHE)
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 15000 });

    // Open Help
    await page.keyboard.press('F1');
    await page.waitForSelector('#cmd-install-badge', { timeout: 5000 });

    // Click badge
    await page.click('#cmd-install-badge');

    // Help palette should close, progress overlay should appear
    const palette = await page.$('#cmd-palette');
    expect(palette).toBeFalsy();

    // Wait for progress overlay
    await page.waitForSelector('#pwa-overlay', { timeout: 5000 });
    const overlay = await page.$('#pwa-overlay');
    expect(overlay).toBeTruthy();
    console.log('§PW_S283 download overlay visible=true');

    // Progress bar should exist
    const bar = await page.$('#pwa-bar');
    expect(bar).toBeTruthy();

    // Status text should show progress
    await page.waitForFunction(() => {
      const el = document.getElementById('pwa-status');
      return el && el.textContent && el.textContent !== 'Preparing...';
    }, { timeout: 10000 });
    const status = await page.$eval('#pwa-status', el => el.textContent);
    console.log('§PW_S283 download status="' + status + '"');
  });

  test('S283.7 Badge still shows on second Help open', async ({ page }) => {
    await page.goto(VIEWER_URL);
    await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 });

    // First open
    await page.keyboard.press('F1');
    await page.waitForSelector('#cmd-install-badge', { timeout: 5000 });
    // Close
    await page.keyboard.press('Escape');
    await page.waitForSelector('#cmd-palette', { state: 'detached', timeout: 3000 });

    // Second open — badge must still be there
    await page.keyboard.press('F1');
    await page.waitForSelector('#cmd-palette', { timeout: 5000 });
    const badge = await page.$('#cmd-install-badge');
    expect(badge).toBeTruthy();
    console.log('§PW_S283 badge second_open=true');
  });

  test('S283.8 CDP installability check', async ({ page, context }) => {
    // Use Chrome DevTools Protocol to check manifest installability
    await page.goto(VIEWER_URL);
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, { timeout: 15000 });

    const client = await context.newCDPSession(page);
    const result = await client.send('Page.getInstallabilityErrors');
    const errors = result.installabilityErrors || result.errors || [];
    console.log('§PW_S283 installability errors=' + errors.length);
    if (errors.length > 0) {
      errors.forEach(e => console.log('§PW_S283 installability_error: ' + (e.errorId || JSON.stringify(e))));
    }
    // Allow warnings — only block on hard errors
    const blocking = errors.filter(e => e.errorId && !e.errorId.startsWith('warn-'));
    expect(blocking.length).toBe(0);
  });

  test('S283.9 Manifest detected via CDP', async ({ page, context }) => {
    await page.goto(VIEWER_URL);
    await page.waitForTimeout(3000);  // give browser time to parse manifest

    const client = await context.newCDPSession(page);
    const { url } = await client.send('Page.getAppManifest');
    console.log('§PW_S283 manifest_url=' + url);
    expect(url).toContain('manifest.webmanifest');
  });
});
