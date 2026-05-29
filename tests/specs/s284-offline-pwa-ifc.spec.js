// s284-offline-pwa-ifc.spec.js — §S284c PWA offline IFC import
//
// Issue proven/disproven:
//   T_OFF_IFC: Can the deployed PWA import a local IFC while OFFLINE?
//     Before S284c, import_worker.js hard-fetched web-ifc + web-ifc.wasm from unpkg CDN;
//     offline that threw NetworkError and aborted parse. S284c makes web-ifc local
//     (viewer/lib/), precached by sw.js, and the worker loads it local-first.
//   This test populates the SW cache on the landing page, cuts the network, imports an
//   IFC, and asserts §IMPORT_SAVED fires + §WASM_LOCATE resolves to the local SW-cached
//   path (not unpkg). If this passes, offline IFC import works with zero internet.

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');
const path = require('path');

const IFC = path.resolve(__dirname, '..', 'fixtures', 'Vogel_Gesamt_upgraded.ifc');
const KEY = 'Vogel_Gesamt_upgraded.ifc';
const WEBIFC_JS = 'http://localhost:8080/bim-ootb/viewer/lib/web-ifc-api-iife.js';
const WEBIFC_WASM = 'http://localhost:8080/bim-ootb/viewer/lib/web-ifc.wasm';

test.describe('S284c — PWA offline IFC import', () => {

  test('T_OFF_IFC: import IFC offline via SW-cached web-ifc @slow', async ({ page, context }) => {
    test.setTimeout(180000);
    const logs = new ConsoleLogs(page);

    // ── Phase 1: Online — load landing, register SW, populate cache ──
    await page.goto('/bim-ootb/index.html', { waitUntil: 'load' });
    await page.waitForSelector('#import-zone', { timeout: 15000 });

    // SW registered from the landing page (§SW_REG_LANDING)
    await expect.poll(() => logs.entries.some(e => e.text.includes('§SW_REG_LANDING')),
      { timeout: 15000, message: '§SW_REG_LANDING not seen' }).toBe(true);

    // Wait for the SW to activate
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration('viewer/');
      if (!reg) throw new Error('no SW registration for viewer/ scope');
      if (reg.active && reg.active.state === 'activated') return;
      const sw = reg.installing || reg.waiting || reg.active;
      await new Promise((resolve) => {
        if (sw.state === 'activated') return resolve();
        sw.addEventListener('statechange', () => { if (sw.state === 'activated') resolve(); });
      });
    });

    // Poll the Cache Storage until web-ifc JS + WASM are both precached
    await expect.poll(async () => {
      return await page.evaluate(async ([js, wasm]) => {
        const cj = await caches.match(js);
        const cw = await caches.match(wasm);
        return !!(cj && cw);
      }, [WEBIFC_JS, WEBIFC_WASM]);
    }, { timeout: 120000, message: 'web-ifc JS+WASM not in SW cache' }).toBe(true);
    console.log('§OFF_IFC web-ifc JS+WASM confirmed in SW cache');

    // Clean any prior import of this key
    await page.evaluate(async (k) => {
      if (typeof deleteProject === 'function') { try { await deleteProject(k); } catch (e) {} }
    }, KEY);

    // ── Phase 2: Cut the network ──
    await context.setOffline(true);
    console.log('§OFF_IFC network set OFFLINE');

    // Prove the CDN is truly unreachable now (sanity: fetch should reject)
    const cdnReachable = await page.evaluate(async () => {
      try { await fetch('https://unpkg.com/web-ifc@0.0.77/web-ifc.wasm', { method: 'HEAD' }); return true; }
      catch (e) { return false; }
    });
    expect(cdnReachable, 'CDN must be unreachable while offline').toBe(false);

    // ── Phase 3: Import the IFC offline ──
    await page.locator('#import-file-input').setInputFiles(IFC);

    await expect.poll(() => logs.entries.some(e => e.text.includes('IMPORT_SAVED')),
      { timeout: 90000, message: 'IMPORT_SAVED not found while offline' }).toBe(true);

    // ── Assertions ──
    const saved = logs.entries.find(e => e.text.includes('IMPORT_SAVED'));
    console.log('§OFF_IFC ' + saved.text);
    expect(saved.text).toContain(KEY);

    // §S284d: web-ifc wasm must resolve from the offline-safe in-worker blob (bytes transferred
    // from the main thread) or the local SW-cached lib/ — never from CDN. emscripten no longer
    // fetches the wasm itself, which is what aborted offline imports.
    const locate = logs.entries.find(e => e.text.includes('§WASM_LOCATE'));
    expect(locate, '§WASM_LOCATE log expected').toBeTruthy();
    console.log('§OFF_IFC ' + locate.text);
    expect(locate.text).toMatch(/blob \(from main-thread bytes|local/);
    expect(locate.text).not.toContain('unpkg.com');
    // The cryptic abort must NOT appear.
    expect(logs.entries.some(e => /both async and sync|IMPORT_FATAL/.test(e.text)),
      'offline import must not hit the wasm-fetch abort').toBe(false);

    // worker source loaded from local lib/, not CDN
    const src = logs.entries.find(e => e.text.includes('§WORKER_SRC'));
    if (src) { console.log('§OFF_IFC ' + src.text); expect(src.text).toContain('local'); }

    await context.setOffline(false);
  });
});
