// 38-offline-pwa.spec.js — S243: Offline PWA — SW installs, precaches, serves offline
// Issue proven/disproven:
//   T_3801: Service Worker registers and activates — SW lifecycle works
//   T_3802: Precached JS files served from cache offline — viewer loads without network
//   T_3803: IndexedDB DB cache hit offline — building DB survives offline reload
//   T_3804: OFFLINE badge appears when network drops — user feedback present
//   T_3805: OFFLINE badge disappears when network returns — badge lifecycle correct

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');

const VIEWER_URL = '/dev/index.html?db=/buildings/Duplex_extracted.db&bld=Duplex';

// Wait for viewer to finish streaming
function waitForViewer(page) {
  return page.waitForFunction(() => {
    const s = document.getElementById('status');
    return s && (s.textContent.includes('DONE') || s.textContent.includes('ready') ||
                 s.textContent.includes('complete') || s.textContent.includes('loaded'));
  }, { timeout: 60000 });
}

test.describe('S243 — Offline PWA', () => {

  test('T_3801: Service Worker registers and activates', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);

    // Check SW registered via §SW_REG log
    const swReg = logs.all().find(l => l.includes('§SW_REG'));
    expect(swReg, '§SW_REG log line should appear').toBeTruthy();

    // Verify SW is active via browser API
    const swState = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg && reg.active ? reg.active.state : null;
    });
    expect(swState).toBe('activated');
    console.log('§PW_SW_REG PASS — SW registered and activated');
  });

  test('T_3802: Precached JS served from cache offline — viewer loads', async ({ page, context }) => {
    test.setTimeout(120000);
    const logs = new ConsoleLogs(page);

    // Phase 1: Load online to populate SW cache + IndexedDB
    await page.goto(VIEWER_URL);
    await waitForViewer(page);

    // Wait for SW to be active AND controlling this page
    await page.evaluate(async () => {
      var reg = await navigator.serviceWorker.getRegistration();
      if (!reg) throw new Error('No SW registration');
      // Wait for SW to activate
      if (reg.installing || reg.waiting) {
        await new Promise(resolve => {
          var sw = reg.installing || reg.waiting;
          sw.addEventListener('statechange', function() {
            if (sw.state === 'activated') resolve();
          });
          if (sw.state === 'activated') resolve();
        });
      }
      // Ensure SW is controlling by reloading if needed
      if (!navigator.serviceWorker.controller) {
        await new Promise(resolve => {
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
          setTimeout(resolve, 8000);
        });
      }
    });

    // Phase 1b: Reload ONLINE to let SW serve and cache everything via fetch handler
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForViewer(page);
    // SW is now controlling and has cached all fetched resources
    await page.waitForTimeout(1000);

    // Phase 2: Go offline and reload
    await context.setOffline(true);
    await page.waitForTimeout(500);

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for viewer to initialise (libs load from cache, then initViewer runs)
    await page.waitForFunction(() => {
      return window.APP !== undefined || document.querySelector('#status')?.textContent?.includes('Error');
    }, { timeout: 45000 });

    const globals = await page.evaluate(() => ({
      APP: typeof window.APP !== 'undefined',
      THREE: typeof window.THREE !== 'undefined',
      status: document.getElementById('status')?.textContent || '',
    }));

    expect(globals.APP, 'APP global should exist offline (status: ' + globals.status + ')').toBeTruthy();
    expect(globals.THREE, 'THREE global should exist offline').toBeTruthy();

    await context.setOffline(false);
    console.log('§PW_OFFLINE_JS PASS — core JS loaded from SW cache while offline');
  });

  test('T_3803: IndexedDB DB cache hit offline — building loads', async ({ page, context }) => {
    test.setTimeout(120000);
    const logs = new ConsoleLogs(page);

    // Phase 1: Load online — DB gets cached in IndexedDB + SW activates
    await page.goto(VIEWER_URL);
    await waitForViewer(page);

    // Confirm DB was loaded
    const dbLog = logs.all().find(l => l.includes('§CACHE_HIT') || l.includes('§CACHE_MISS'));
    expect(dbLog, 'DB should be fetched via cachedFetch').toBeTruthy();

    // Wait for SW to control, then reload online to populate SW cache
    await page.evaluate(async () => {
      var reg = await navigator.serviceWorker.getRegistration();
      if (reg && (reg.installing || reg.waiting)) {
        await new Promise(resolve => {
          var sw = reg.installing || reg.waiting;
          sw.addEventListener('statechange', function() { if (sw.state === 'activated') resolve(); });
          if (sw.state === 'activated') resolve();
        });
      }
      if (!navigator.serviceWorker.controller) {
        await new Promise(resolve => {
          navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
          setTimeout(resolve, 8000);
        });
      }
    });
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForViewer(page);
    await page.waitForTimeout(1000);

    // Phase 2: Go offline, reload
    await context.setOffline(true);
    await page.waitForTimeout(500);

    const logs2 = new ConsoleLogs(page);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for DB to load from IndexedDB cache
    await page.waitForFunction(() => {
      return window.APP && window.APP.db;
    }, { timeout: 45000 });

    const cacheHit = logs2.all().find(l => l.includes('§CACHE_HIT'));
    expect(cacheHit, 'DB should load from IndexedDB cache offline').toBeTruthy();

    await context.setOffline(false);
    console.log('§PW_OFFLINE_DB PASS — DB loaded from IndexedDB while offline');
  });

  test('T_3804: OFFLINE badge appears when network drops', async ({ page, context }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(VIEWER_URL);
    await waitForViewer(page);

    // No badge when online
    let badge = await page.$('#offline-badge');
    expect(badge, 'No offline badge when online').toBeNull();

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(1000);

    // Badge should appear
    badge = await page.$('#offline-badge');
    expect(badge, 'OFFLINE badge should appear').toBeTruthy();
    const text = await badge.textContent();
    expect(text).toBe('OFFLINE');

    await context.setOffline(false);
    console.log('§PW_OFFLINE_BADGE PASS — red OFFLINE badge appears on network drop');
  });

  test('T_3805: OFFLINE badge disappears when network returns', async ({ page, context }) => {
    await page.goto(VIEWER_URL);
    await waitForViewer(page);

    // Go offline → badge appears
    await context.setOffline(true);
    await page.waitForTimeout(1000);
    let badge = await page.$('#offline-badge');
    expect(badge, 'Badge should exist while offline').toBeTruthy();

    // Go online → badge disappears
    await context.setOffline(false);
    await page.waitForTimeout(1000);
    badge = await page.$('#offline-badge');
    expect(badge, 'Badge should be removed when back online').toBeNull();

    console.log('§PW_OFFLINE_BADGE_CLEAR PASS — badge removed on reconnect');
  });

});
