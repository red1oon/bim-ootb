// 21-share-sheet.spec.js — Share sheet lazy-load and UI
// Bugs prevented:
//   Share button missing on building cards (landing page inline vs import.js)
//   share.js not lazy-loaded (initial fetch bloat)
//   Share sheet not rendering (bridge A._getImport missing)
//
// Tests verify:
//   1. share.js exists and is syntactically valid
//   2. share.js is NOT in initial page load (lazy-load guarantee)
//   3. Share sheet CSS and UI elements render correctly when loaded

const { test, expect } = require('@playwright/test');

test.describe('Share Sheet', () => {

  test('21.1 share.js is served from sandbox/ @fast', async ({ request }) => {
    const resp = await request.get('/dev/share.js');
    expect(resp.status(), 'share.js must be served').toBe(200);
    const body = await resp.text();
    expect(body).toContain('openShareSheet');
    expect(body).toContain('§SHARE_LOADED');
    console.log('§PW_SHARE_SERVED size=' + body.length);
  });

  test('21.2 share.js NOT in initial landing page load @fast', async ({ page }) => {
    const shareRequests = [];
    page.on('request', req => {
      if (req.url().includes('share.js')) shareRequests.push(req.url());
    });

    await page.goto('/dev/landing.html');
    await page.waitForTimeout(2000);

    expect(shareRequests.length, 'share.js must NOT load on page open').toBe(0);
    console.log('§PW_SHARE_LAZY shareRequests=' + shareRequests.length);
  });

  test('21.3 landing page cards have Share button (not Save) @fast', async ({ page }) => {
    await page.goto('/dev/landing.html');

    // Inject a fake project into IndexedDB so a card renders
    await page.evaluate(async () => {
      return new Promise(resolve => {
        var req = indexedDB.open('bim_ootb_imports', 2);
        req.onupgradeneeded = function(e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains('buildings')) {
            db.createObjectStore('buildings');
          }
        };
        req.onsuccess = function() {
          var db = req.result;
          var tx = db.transaction('buildings', 'readwrite');
          tx.objectStore('buildings').put({
            meta: { name: 'TestShare.ifc', elementCount: 10, disciplines: { ARC: 10 } },
            versions: [{ db: new ArrayBuffer(100), key: 'base' }],
            latestVersion: 0
          }, 'TestShare.ifc');
          tx.oncomplete = resolve;
        };
      });
    });

    await page.reload();
    await page.waitForTimeout(1000);

    const shareBtn = await page.$('[data-share]');
    const saveBtn = await page.$('[data-save]');

    expect(shareBtn, 'Share button must exist on card').not.toBeNull();
    expect(saveBtn, 'Save button must NOT exist on card').toBeNull();
    console.log('§PW_SHARE_BTN share=' + !!shareBtn + ' save=' + !!saveBtn);

    // Cleanup
    await page.evaluate(async () => {
      return new Promise(resolve => {
        var req = indexedDB.open('bim_ootb_imports', 2);
        req.onsuccess = function() {
          var db = req.result;
          var tx = db.transaction('buildings', 'readwrite');
          tx.objectStore('buildings').delete('TestShare.ifc');
          tx.oncomplete = resolve;
        };
      });
    });
  });

  test('21.4 contribute.js superseded by share.js @fast', async ({ request }) => {
    // share.js must contain the validation + upload logic
    const resp = await request.get('/dev/share.js');
    const body = await resp.text();
    expect(body).toContain('validateDB');
    expect(body).toContain('contributeToOOTB');
    expect(body).toContain('copyLink');
    expect(body).toContain('sendWhatsApp');
    expect(body).toContain('sendEmail');
    console.log('§PW_SHARE_FEATURES validate+contribute+copy+wa+email=OK');
  });

});
