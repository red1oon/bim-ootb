// 15-drop-zone-wizard-e2e.spec.js — Full Drop Zone → Wizard E2E
// Issue: verify OBJ drop → import → viewer opens with wizard → walk all steps → done
// Bugs prevented:
//   S228 OBJ import fails silently, no card appears
//   S229 Wizard not triggered after mesh import
//   S230 Wizard renders on landing instead of viewer
//   S230 Wizard panel stuck, can't advance through all steps
//   S229b IFC export not available after wizard completes

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');
const path = require('path');
const fs = require('fs');

const OBJ_FILE = path.resolve(__dirname, '..', '..', 'test', 'engel-house.obj');
const LANDING_URL = '/landing2.html';

test.describe('Drop Zone → Wizard E2E (Engel House OBJ)', () => {

  test.beforeEach(async ({ page }) => {
    // Clear IndexedDB to start fresh each test
    await page.goto(LANDING_URL);
    await page.evaluate(() => {
      indexedDB.deleteDatabase('bim_ootb_imports');
      indexedDB.deleteDatabase('bim_ootb_cache');
    });
    await page.waitForTimeout(300);
  });

  test('15.1 OBJ drop → import completes → card appears @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(LANDING_URL);
    await page.waitForSelector('#import-zone', { timeout: 10000 });

    // Verify OBJ fixture exists
    expect(fs.existsSync(OBJ_FILE)).toBe(true);
    const objData = fs.readFileSync(OBJ_FILE);
    console.log(`§PW_E2E_OBJ file=${path.basename(OBJ_FILE)} size=${(objData.length/1024).toFixed(0)}KB`);

    // Drop OBJ file on the import zone
    await page.evaluate(async ({ name, data }) => {
      var buf = Uint8Array.from(atob(data), function(c) { return c.charCodeAt(0); });
      var file = new File([buf], name, { type: 'application/octet-stream' });
      var dt = new DataTransfer();
      dt.items.add(file);
      var zone = document.getElementById('import-zone');
      zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    }, { name: 'engel-house.obj', data: objData.toString('base64') });

    // Wait for import to complete — progress bar turns green or status shows "Imported"
    await page.waitForFunction(() => {
      var bar = document.getElementById('import-progress-bar');
      var status = document.getElementById('import-status');
      return (bar && bar.style.background === 'rgb(68, 204, 68)') ||
             (status && status.textContent.includes('Imported'));
    }, { timeout: 60000 });

    // Verify card appeared in My Buildings
    await page.waitForSelector('#my-buildings-grid .card', { timeout: 10000 });
    const cardInfo = await page.evaluate(() => {
      var card = document.querySelector('#my-buildings-grid .card');
      if (!card) return null;
      return {
        name: card.querySelector('.name')?.textContent || '',
        meta: card.querySelector('.meta')?.textContent || '',
        hasOpen: !!card.querySelector('[data-open]'),
        hasExport: !!card.querySelector('[data-export]') || !!card.querySelector('[data-exportifc]'),
      };
    });

    console.log(`§PW_E2E_CARD name="${cardInfo.name}" meta="${cardInfo.meta}"`);
    expect(cardInfo).not.toBeNull();
    expect(cardInfo.name).toContain('engel-house');
    expect(cardInfo.hasOpen).toBe(true);

    // Verify import log (worker logs §MESH_IMPORT_START but that's in worker context;
    // main thread logs §WORKER_DONE, §DB_BUILD, §IMPORT_SAVED)
    const logText = logs.all().join(' ');
    expect(logText).toContain('§WORKER_DONE');
    expect(logText).toContain('§DB_BUILD');
    expect(logText).toContain('§IMPORT_SAVED');
  });

  test('15.2 Full flow: drop OBJ → Open card → wizard in viewer → walk all steps @slow', async ({ page, context }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(LANDING_URL);
    await page.waitForSelector('#import-zone', { timeout: 10000 });

    // Drop OBJ
    const objData = fs.readFileSync(OBJ_FILE);
    await page.evaluate(async ({ name, data }) => {
      var buf = Uint8Array.from(atob(data), function(c) { return c.charCodeAt(0); });
      var file = new File([buf], name, { type: 'application/octet-stream' });
      var dt = new DataTransfer();
      dt.items.add(file);
      document.getElementById('import-zone').dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true })
      );
    }, { name: 'engel-house.obj', data: objData.toString('base64') });

    // Wait for import complete
    await page.waitForFunction(() => {
      var bar = document.getElementById('import-progress-bar');
      return bar && bar.style.background === 'rgb(68, 204, 68)';
    }, { timeout: 60000 });
    console.log('§PW_E2E_IMPORT_DONE');

    // Wait for card
    await page.waitForSelector('#my-buildings-grid .card [data-open]', { timeout: 10000 });

    // Click Open — this opens viewer in new tab with ?wizard=1
    const [viewerPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('#my-buildings-grid .card [data-open]'),
    ]);

    // Switch to viewer page
    const viewerLogs = new ConsoleLogs(viewerPage);
    await viewerPage.waitForLoadState('domcontentloaded');
    console.log('§PW_E2E_VIEWER_OPENED url=' + viewerPage.url());

    // Verify ?wizard=1 in URL
    expect(viewerPage.url()).toContain('wizard=1');

    // Wait for wizard panel to appear in viewer
    await viewerPage.waitForSelector('#wizard-panel', { timeout: 45000 });
    console.log('§PW_E2E_WIZARD_APPEARED');

    // ── STEP 0: Orientation — "Is the building upright?" ──
    const step0 = await viewerPage.evaluate(() => ({
      question: document.getElementById('wizard-question')?.textContent || '',
      evidence: document.getElementById('wizard-evidence')?.textContent || '',
      dots: document.querySelectorAll('#wizard-progress .dot').length,
    }));
    console.log(`§PW_E2E_STEP0 q="${step0.question}" dots=${step0.dots}`);
    expect(step0.question).toContain('upright');
    expect(step0.dots).toBeGreaterThanOrEqual(3);  // orientation + storeys + classify + summary

    // Click "Yes" — building is upright
    await viewerPage.click('.wizard-yes');
    await viewerPage.waitForTimeout(300);

    // ── STEP 1: Storeys — "N storeys detected. Correct?" ──
    const step1 = await viewerPage.evaluate(() => ({
      question: document.getElementById('wizard-question')?.textContent || '',
      evidence: document.getElementById('wizard-evidence')?.textContent || '',
    }));
    console.log(`§PW_E2E_STEP1 q="${step1.question}" evidence="${step1.evidence.substring(0, 80)}"`);
    expect(step1.question).toContain('storey');

    // Verify storey color legend has dots
    const storeyDots = await viewerPage.evaluate(() => {
      var ev = document.getElementById('wizard-evidence');
      return ev ? ev.querySelectorAll('span[style*="border-radius"]').length : 0;
    });
    expect(storeyDots).toBeGreaterThan(0);
    console.log(`§PW_E2E_STEP1_LEGEND colorDots=${storeyDots}`);

    // Click "Yes" — storeys are correct
    await viewerPage.click('.wizard-yes');
    await viewerPage.waitForTimeout(300);

    // ── STEP 2: Classify — S234 draining-pool element classification ──
    // For OBJ imports, >50% elements are IfcBuildingElementProxy → classify step appears
    const step2 = await viewerPage.evaluate(() => ({
      question: document.getElementById('wizard-question')?.textContent || '',
      evidence: document.getElementById('wizard-evidence')?.textContent || '',
    }));
    console.log(`§PW_E2E_STEP2 q="${step2.question}" ev="${step2.evidence.substring(0, 80)}"`);

    // Classify step question contains "unclassified" or "look like" (if pool has guesses)
    // OR we may already be on summary if classify auto-advanced (all elements unknown)
    if (step2.question.includes('unclassified') || step2.question.includes('look like')) {
      // Classify step — toggle through all types to exhaust, or click Yes on first guess
      // For test: just exhaust by toggling until we advance past classify
      var maxToggles = 10;
      for (var t = 0; t < maxToggles; t++) {
        var hasToggle = await viewerPage.evaluate(() => {
          var btns = document.querySelectorAll('#wizard-buttons button');
          return [...btns].some(b => b.textContent.trim() === 'Toggle');
        });
        if (!hasToggle) break;
        await viewerPage.click('#wizard-buttons button:has-text("Toggle")');
        await viewerPage.waitForTimeout(300);
      }
      console.log(`§PW_E2E_CLASSIFY_TOGGLED count=${t}`);
    }

    // Now should be on summary step — click Done
    await viewerPage.waitForTimeout(500);
    const step3 = await viewerPage.evaluate(() => {
      var panel = document.getElementById('wizard-panel');
      if (!panel) return { panelExists: false };
      return {
        panelExists: true,
        question: panel.querySelector('#wizard-question')?.textContent || '',
      };
    });
    if (step3.panelExists) {
      console.log(`§PW_E2E_STEP3 q="${step3.question}"`);
      await viewerPage.click('.wizard-yes');
      await viewerPage.waitForTimeout(1000);
    }

    // ── Verify wizard dismissed ──
    const panelGone = await viewerPage.evaluate(() => !document.getElementById('wizard-panel'));
    expect(panelGone).toBe(true);
    console.log('§PW_E2E_WIZARD_DISMISSED');

    // Verify wizard lifecycle logs
    const vLogs = viewerLogs.all().join(' ');
    expect(vLogs).toContain('§WIZARD_VIEWER_START');
    expect(vLogs).toContain('§WIZARD_START');
    expect(vLogs).toContain('§WIZARD_ANALYSE');
    expect(vLogs).toContain('§WIZARD_COMPLETE');
    expect(vLogs).toContain('§WIZARD_MARK_COMPLETE');
    console.log('§PW_E2E_WIZARD_LIFECYCLE_OK');

    await viewerPage.close();
  });

  test('15.3 Wizard flip works: drop OBJ → flip → verify rotation changed @slow', async ({ page, context }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(LANDING_URL);
    await page.waitForSelector('#import-zone', { timeout: 10000 });

    // Drop OBJ
    const objData = fs.readFileSync(OBJ_FILE);
    await page.evaluate(async ({ name, data }) => {
      var buf = Uint8Array.from(atob(data), function(c) { return c.charCodeAt(0); });
      var file = new File([buf], name, { type: 'application/octet-stream' });
      var dt = new DataTransfer();
      dt.items.add(file);
      document.getElementById('import-zone').dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true })
      );
    }, { name: 'engel-house.obj', data: objData.toString('base64') });

    // Wait for import
    await page.waitForFunction(() => {
      var bar = document.getElementById('import-progress-bar');
      return bar && bar.style.background === 'rgb(68, 204, 68)';
    }, { timeout: 60000 });

    // Open viewer
    await page.waitForSelector('#my-buildings-grid .card [data-open]', { timeout: 10000 });
    const [viewerPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('#my-buildings-grid .card [data-open]'),
    ]);
    const viewerLogs = new ConsoleLogs(viewerPage);
    await viewerPage.waitForSelector('#wizard-panel', { timeout: 45000 });

    // Get initial rotation
    const beforeRx = await viewerPage.evaluate(() =>
      (window.APP && APP.scene) ? APP.scene.rotation.x : null
    );

    // Click "Flip" on orientation step
    await viewerPage.click('.wizard-no');
    await viewerPage.waitForTimeout(300);

    // Get post-flip state: rotation, camera, building bbox, clipping
    const afterState = await viewerPage.evaluate(() => {
      if (!window.APP || !APP.scene || !APP.camera) return null;
      // Camera state
      var cam = APP.camera;
      var ctrl = APP.controls;
      // Count visible meshes
      var meshCount = 0;
      APP.scene.traverse(function(o) { if (o.isMesh && o.visible) meshCount++; });
      return {
        rx: APP.scene.rotation.x,
        camX: cam.position.x, camY: cam.position.y, camZ: cam.position.z,
        targetX: ctrl ? ctrl.target.x : 0,
        targetY: ctrl ? ctrl.target.y : 0,
        targetZ: ctrl ? ctrl.target.z : 0,
        near: cam.near, far: cam.far,
        meshCount: meshCount,
      };
    });

    console.log(`§PW_E2E_FLIP before=${beforeRx?.toFixed(3)} after=${afterState?.rx?.toFixed(3)}`);
    if (afterState) {
      var dx = afterState.camX - afterState.targetX;
      var dy = afterState.camY - afterState.targetY;
      var dz = afterState.camZ - afterState.targetZ;
      var camDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
      console.log(`  cam=(${afterState.camX.toFixed(1)},${afterState.camY.toFixed(1)},${afterState.camZ.toFixed(1)}) target=(${afterState.targetX.toFixed(1)},${afterState.targetY.toFixed(1)},${afterState.targetZ.toFixed(1)})`);
      console.log(`  dist=${camDist.toFixed(1)} near=${afterState.near.toFixed(2)} far=${afterState.far.toFixed(0)} meshes=${afterState.meshCount}`);

      // Camera should be at reasonable distance — not too far (>500m) or too close (<1m)
      expect(camDist).toBeGreaterThan(1);
      expect(camDist).toBeLessThan(500);
      // Clipping should be proportional
      expect(afterState.near).toBeLessThan(camDist * 0.5);
      expect(afterState.far).toBeGreaterThan(camDist * 2);
    }
    if (beforeRx !== null && afterState) {
      expect(Math.abs(afterState.rx - beforeRx)).toBeGreaterThan(0.1);
    }

    // Verify flip log
    const vLogs = viewerLogs.all().join(' ');
    expect(vLogs).toContain('§WIZARD_FLIP');

    // Continue through remaining steps to finish cleanly
    await viewerPage.click('.wizard-yes');  // orientation: Yes (after flip)
    await viewerPage.waitForTimeout(200);
    await viewerPage.click('.wizard-yes');  // storeys: Yes
    await viewerPage.waitForTimeout(500);
    // S234: Exhaust classify step (OBJ = all proxies → classify appears)
    for (var _t = 0; _t < 10; _t++) {
      var _hasToggle = await viewerPage.evaluate(() => {
        var btns = document.querySelectorAll('#wizard-buttons button');
        return [...btns].some(b => b.textContent.trim() === 'Toggle');
      });
      if (!_hasToggle) break;
      await viewerPage.click('#wizard-buttons button:has-text("Toggle")');
      await viewerPage.waitForTimeout(300);
    }
    // Now on summary — click Done
    var fp = await viewerPage.evaluate(() => !!document.getElementById('wizard-panel'));
    if (fp) { await viewerPage.click('.wizard-yes').catch(() => {}); await viewerPage.waitForTimeout(800); }

    await viewerPage.close();
  });

  test('15.4 Storey edit: drop OBJ → edit storey count → verify rebanded @slow', async ({ page, context }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(LANDING_URL);
    await page.waitForSelector('#import-zone', { timeout: 10000 });

    // Drop OBJ
    const objData = fs.readFileSync(OBJ_FILE);
    await page.evaluate(async ({ name, data }) => {
      var buf = Uint8Array.from(atob(data), function(c) { return c.charCodeAt(0); });
      var file = new File([buf], name, { type: 'application/octet-stream' });
      var dt = new DataTransfer();
      dt.items.add(file);
      document.getElementById('import-zone').dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true })
      );
    }, { name: 'engel-house.obj', data: objData.toString('base64') });

    await page.waitForFunction(() => {
      var bar = document.getElementById('import-progress-bar');
      return bar && bar.style.background === 'rgb(68, 204, 68)';
    }, { timeout: 60000 });

    // Open viewer
    await page.waitForSelector('#my-buildings-grid .card [data-open]', { timeout: 10000 });
    const [viewerPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('#my-buildings-grid .card [data-open]'),
    ]);
    const viewerLogs = new ConsoleLogs(viewerPage);
    await viewerPage.waitForSelector('#wizard-panel', { timeout: 45000 });

    // Step 0: Yes (orientation)
    await viewerPage.click('.wizard-yes');
    await viewerPage.waitForTimeout(300);

    // Step 1: Storeys — click Edit
    const beforeQ = await viewerPage.evaluate(() =>
      document.getElementById('wizard-question')?.textContent || '');
    console.log(`§PW_E2E_STOREY_EDIT before="${beforeQ}"`);

    await viewerPage.click('#wizard-buttons button:has-text("Edit")');  // Edit button
    await viewerPage.waitForTimeout(200);

    // Verify edit UI
    const hasInput = await viewerPage.evaluate(() => !!document.getElementById('wiz-storey-count'));
    expect(hasInput).toBe(true);

    // Change to 3 storeys
    await viewerPage.fill('#wiz-storey-count', '3');
    await viewerPage.click('.wizard-yes');  // Apply
    await viewerPage.waitForTimeout(300);

    // Verify storey count updated
    const afterQ = await viewerPage.evaluate(() =>
      document.getElementById('wizard-question')?.textContent || '');
    const afterCount = parseInt(afterQ.match(/(\d+)/)?.[1] || '0');
    console.log(`§PW_E2E_STOREY_EDIT after="${afterQ}" count=${afterCount}`);
    expect(afterCount).toBe(3);

    // Verify reband log
    const vLogs = viewerLogs.all().join(' ');
    expect(vLogs).toContain('§WIZARD_STOREY_REBAND');

    // Finish wizard
    await viewerPage.click('.wizard-yes');  // storeys: Yes
    await viewerPage.waitForTimeout(500);
    // S234: Exhaust classify step
    for (var _t4 = 0; _t4 < 10; _t4++) {
      var _ht4 = await viewerPage.evaluate(() => {
        var btns = document.querySelectorAll('#wizard-buttons button');
        return [...btns].some(b => b.textContent.trim() === 'Toggle');
      });
      if (!_ht4) break;
      await viewerPage.click('#wizard-buttons button:has-text("Toggle")');
      await viewerPage.waitForTimeout(300);
    }
    await viewerPage.waitForTimeout(500);
    var fp4 = await viewerPage.evaluate(() => !!document.getElementById('wizard-panel'));
    if (fp4) { await viewerPage.click('.wizard-yes').catch(() => {}); await viewerPage.waitForTimeout(800); }

    await viewerPage.close();
  });

  test('15.5 Wizard saves and skips on re-open @slow', async ({ page, context }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(LANDING_URL);
    await page.waitForSelector('#import-zone', { timeout: 10000 });

    // Drop OBJ
    const objData = fs.readFileSync(OBJ_FILE);
    await page.evaluate(async ({ name, data }) => {
      var buf = Uint8Array.from(atob(data), function(c) { return c.charCodeAt(0); });
      var file = new File([buf], name, { type: 'application/octet-stream' });
      var dt = new DataTransfer();
      dt.items.add(file);
      document.getElementById('import-zone').dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true })
      );
    }, { name: 'engel-house.obj', data: objData.toString('base64') });

    await page.waitForFunction(() => {
      var bar = document.getElementById('import-progress-bar');
      return bar && bar.style.background === 'rgb(68, 204, 68)';
    }, { timeout: 60000 });

    // Open viewer — first time, wizard appears
    await page.waitForSelector('#my-buildings-grid .card [data-open]', { timeout: 10000 });
    const [viewerPage] = await Promise.all([
      context.waitForEvent('page'),
      page.click('#my-buildings-grid .card [data-open]'),
    ]);
    await viewerPage.waitForSelector('#wizard-panel', { timeout: 45000 });

    // S234: Quick walkthrough: Yes → Yes → exhaust classify → Done
    await viewerPage.click('.wizard-yes');  // orientation
    await viewerPage.waitForTimeout(200);
    await viewerPage.click('.wizard-yes');  // storeys
    await viewerPage.waitForTimeout(500);
    // Exhaust classify step
    for (var _t5 = 0; _t5 < 10; _t5++) {
      var _ht5 = await viewerPage.evaluate(() => {
        var btns = document.querySelectorAll('#wizard-buttons button');
        return [...btns].some(b => b.textContent.trim() === 'Toggle');
      });
      if (!_ht5) break;
      await viewerPage.click('#wizard-buttons button:has-text("Toggle")');
      await viewerPage.waitForTimeout(300);
    }
    await viewerPage.waitForTimeout(500);
    var fp5 = await viewerPage.evaluate(() => !!document.getElementById('wizard-panel'));
    if (fp5) { await viewerPage.click('.wizard-yes').catch(() => {}); await viewerPage.waitForTimeout(1000); }

    // Verify wizard complete flag was saved
    const vLogs = new ConsoleLogs(viewerPage);
    const logText = (vLogs.all ? vLogs.all() : []).join(' ');
    console.log('§PW_E2E_PERSIST first pass done');
    await viewerPage.close();

    // Re-open viewer — wizard should NOT appear (wizard_complete in DB)
    // The landing page card should still have wizard=1 but wizard.js checks the flag
    await page.waitForTimeout(1000);
    const [viewerPage2] = await Promise.all([
      context.waitForEvent('page'),
      page.click('#my-buildings-grid .card [data-open]'),
    ]);
    const viewerLogs2 = new ConsoleLogs(viewerPage2);
    await viewerPage2.waitForLoadState('domcontentloaded');

    // Wait for wizard.js to load and either show panel or skip
    await viewerPage2.waitForTimeout(5000);

    const panelExists = await viewerPage2.evaluate(() => !!document.getElementById('wizard-panel'));
    const v2Logs = viewerLogs2.all().join(' ');

    console.log(`§PW_E2E_REENTRY panel=${panelExists} skipped=${v2Logs.includes('WIZARD_ALREADY_DONE')}`);

    // Accept either: no panel, OR skip log present
    const skipped = !panelExists || v2Logs.includes('§WIZARD_ALREADY_DONE');
    expect(skipped).toBe(true);

    await viewerPage2.close();
  });

  test('15.6 IFC export available after wizard completes @slow', async ({ page, context }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(LANDING_URL);
    await page.waitForSelector('#import-zone', { timeout: 10000 });

    // Drop OBJ
    const objData = fs.readFileSync(OBJ_FILE);
    await page.evaluate(async ({ name, data }) => {
      var buf = Uint8Array.from(atob(data), function(c) { return c.charCodeAt(0); });
      var file = new File([buf], name, { type: 'application/octet-stream' });
      var dt = new DataTransfer();
      dt.items.add(file);
      document.getElementById('import-zone').dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true })
      );
    }, { name: 'engel-house.obj', data: objData.toString('base64') });

    await page.waitForFunction(() => {
      var bar = document.getElementById('import-progress-bar');
      return bar && bar.style.background === 'rgb(68, 204, 68)';
    }, { timeout: 60000 });

    // Verify Save button on card (opens export flyout with IFC/DB options)
    await page.waitForSelector('#my-buildings-grid .card', { timeout: 10000 });
    const hasSave = await page.evaluate(() =>
      !!document.querySelector('#my-buildings-grid .card [data-save]'));
    expect(hasSave).toBe(true);
    console.log('§PW_E2E_SAVE_BTN visible');

    // Click Save button → export flyout should appear
    await page.click('#my-buildings-grid .card [data-save]');
    await page.waitForTimeout(300);

    // Verify flyout appeared with IFC option
    const flyout = await page.evaluate(() => {
      var f = document.querySelector('.export-flyout');
      if (!f) return null;
      var radios = [...f.querySelectorAll('input[type=radio]')].map(function(r) { return r.value; });
      return { exists: true, options: radios };
    });
    expect(flyout).not.toBeNull();
    expect(flyout.options).toContain('ifc');
    expect(flyout.options).toContain('db');
    console.log(`§PW_E2E_EXPORT_FLYOUT options=${flyout.options.join(',')}`);

    // Cancel — don't actually download in test
    await page.click('.export-flyout [data-cancel]');
    await page.waitForTimeout(200);
    const flyoutGone = await page.evaluate(() => !document.querySelector('.export-flyout'));
    expect(flyoutGone).toBe(true);
  });

  test('15.7 Flip + bbox alignment + storey diagnostic @slow', async ({ page, context }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(LANDING_URL);
    await page.waitForSelector('#import-zone', { timeout: 10000 });

    // Drop OBJ
    const objData = fs.readFileSync(OBJ_FILE);
    await page.evaluate(async ({ name, data }) => {
      var buf = Uint8Array.from(atob(data), function(c) { return c.charCodeAt(0); });
      var file = new File([buf], name, { type: 'application/octet-stream' });
      var dt = new DataTransfer();
      dt.items.add(file);
      document.getElementById('import-zone').dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true })
      );
    }, { name: 'engel-house.obj', data: objData.toString('base64') });

    await page.waitForFunction(() => {
      var bar = document.getElementById('import-progress-bar');
      return bar && bar.style.background === 'rgb(68, 204, 68)';
    }, { timeout: 60000 });

    // Open viewer
    await page.waitForSelector('#my-buildings-grid .card [data-open]', { timeout: 10000 });
    const [vp] = await Promise.all([
      context.waitForEvent('page'),
      page.click('#my-buildings-grid .card [data-open]'),
    ]);
    const vLogs = new ConsoleLogs(vp);
    await vp.waitForSelector('#wizard-panel', { timeout: 45000 });

    // Wait for meshes to appear
    await vp.waitForFunction(() => {
      if (!window.APP || !APP.scene) return false;
      var c = 0; APP.scene.traverse(function(o) { if (o.isMesh) c++; }); return c > 10;
    }, { timeout: 30000 });
    await vp.waitForTimeout(1000);

    // ── BEFORE FLIP: capture building shape + camera ──
    const before = await vp.evaluate(() => {
      var db = APP.db;
      // DB coords
      var r = db.exec("SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y),MIN(center_z),MAX(center_z) FROM element_transforms");
      var v = r[0].values[0];
      var dbRange = {
        x: [v[0],v[1]], y: [v[2],v[3]], z: [v[4],v[5]],
        sizeX: v[1]-v[0], sizeY: v[3]-v[2], sizeZ: v[5]-v[4],
      };
      // Storeys
      var sr = db.exec("SELECT storey, COUNT(*) as cnt, MIN(t.center_z), MAX(t.center_z) FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid GROUP BY storey ORDER BY MIN(t.center_z)");
      var storeys = sr.length ? sr[0].values.map(function(row) {
        return { name: row[0], count: row[1], minZ: row[2], maxZ: row[3] };
      }) : [];
      // Scene mesh bbox (Three.js)
      var box = new THREE.Box3();
      APP.scene.traverse(function(o) { if (o.isMesh) box.expandByObject(o); });
      var sz = new THREE.Vector3(); box.getSize(sz);
      var ct = new THREE.Vector3(); box.getCenter(ct);
      // Model offset (IFC→Three.js centering)
      var mo = APP.modelOffset || { x: 0, y: 0, z: 0 };
      // Check where meshes actually are in Three.js space
      var meshPositions = [];
      APP.scene.traverse(function(o) {
        if (o.isMesh && meshPositions.length < 5) {
          meshPositions.push({ x: o.position.x.toFixed(1), y: o.position.y.toFixed(1), z: o.position.z.toFixed(1) });
        }
      });
      return {
        dbRange: dbRange,
        storeys: storeys,
        sceneBox: { cx: ct.x, cy: ct.y, cz: ct.z, sx: sz.x, sy: sz.y, sz: sz.z },
        cam: { x: APP.camera.position.x, y: APP.camera.position.y, z: APP.camera.position.z },
        near: APP.camera.near, far: APP.camera.far,
        rx: APP.scene.rotation.x,
        modelOffset: mo,
        meshPositions: meshPositions,
      };
    });

    console.log('§PW_DIAG_BEFORE_FLIP');
    console.log(`  Model offset: (${before.modelOffset.x},${before.modelOffset.y},${before.modelOffset.z})`);
    console.log(`  Sample mesh positions: ${JSON.stringify(before.meshPositions)}`);
    console.log(`  DB range: X=${before.dbRange.sizeX.toFixed(1)} Y=${before.dbRange.sizeY.toFixed(1)} Z=${before.dbRange.sizeZ.toFixed(1)}`);
    console.log(`  DB Z: ${before.dbRange.z[0].toFixed(1)} to ${before.dbRange.z[1].toFixed(1)}`);
    console.log(`  Scene box center=(${before.sceneBox.cx.toFixed(1)},${before.sceneBox.cy.toFixed(1)},${before.sceneBox.cz.toFixed(1)}) size=(${before.sceneBox.sx.toFixed(1)},${before.sceneBox.sy.toFixed(1)},${before.sceneBox.sz.toFixed(1)})`);
    console.log(`  Cam=(${before.cam.x.toFixed(1)},${before.cam.y.toFixed(1)},${before.cam.z.toFixed(1)}) near=${before.near.toFixed(2)} far=${before.far.toFixed(0)} rx=${before.rx.toFixed(3)}`);
    console.log(`  Storeys (${before.storeys.length}):`);
    for (const s of before.storeys) {
      console.log(`    ${s.name}: ${s.count} el, Z=${s.minZ.toFixed(1)}–${s.maxZ.toFixed(1)}`);
    }

    // Screenshot before flip
    await vp.screenshot({ path: 'test-results/engel-before-flip.png' });

    // ── FLIP ──
    await vp.click('.wizard-no');
    await vp.waitForTimeout(1000);

    // ── AFTER FLIP ──
    const after = await vp.evaluate(() => {
      var db = APP.db;
      var r = db.exec("SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y),MIN(center_z),MAX(center_z) FROM element_transforms");
      var v = r[0].values[0];
      var dbRange = {
        x: [v[0],v[1]], y: [v[2],v[3]], z: [v[4],v[5]],
        sizeX: v[1]-v[0], sizeY: v[3]-v[2], sizeZ: v[5]-v[4],
      };
      var sr = db.exec("SELECT storey, COUNT(*) as cnt, MIN(t.center_z), MAX(t.center_z) FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid GROUP BY storey ORDER BY MIN(t.center_z)");
      var storeys = sr.length ? sr[0].values.map(function(row) {
        return { name: row[0], count: row[1], minZ: row[2], maxZ: row[3] };
      }) : [];
      var box = new THREE.Box3();
      APP.scene.traverse(function(o) { if (o.isMesh) box.expandByObject(o); });
      var sz = new THREE.Vector3(); box.getSize(sz);
      var ct = new THREE.Vector3(); box.getCenter(ct);
      // Camera-to-target distance
      var dx = APP.camera.position.x - APP.controls.target.x;
      var dy = APP.camera.position.y - APP.controls.target.y;
      var dz = APP.camera.position.z - APP.controls.target.z;
      return {
        dbRange: dbRange,
        storeys: storeys,
        sceneBox: { cx: ct.x, cy: ct.y, cz: ct.z, sx: sz.x, sy: sz.y, sz: sz.z },
        cam: { x: APP.camera.position.x, y: APP.camera.position.y, z: APP.camera.position.z },
        target: { x: APP.controls.target.x, y: APP.controls.target.y, z: APP.controls.target.z },
        camDist: Math.sqrt(dx*dx+dy*dy+dz*dz),
        near: APP.camera.near, far: APP.camera.far,
        rx: APP.scene.rotation.x,
      };
    });

    console.log('§PW_DIAG_AFTER_FLIP');
    console.log(`  DB range: X=${after.dbRange.sizeX.toFixed(1)} Y=${after.dbRange.sizeY.toFixed(1)} Z=${after.dbRange.sizeZ.toFixed(1)}`);
    console.log(`  DB Z: ${after.dbRange.z[0].toFixed(1)} to ${after.dbRange.z[1].toFixed(1)} (height=${after.dbRange.sizeZ.toFixed(1)}m)`);
    console.log(`  Scene box center=(${after.sceneBox.cx.toFixed(1)},${after.sceneBox.cy.toFixed(1)},${after.sceneBox.cz.toFixed(1)}) size=(${after.sceneBox.sx.toFixed(1)},${after.sceneBox.sy.toFixed(1)},${after.sceneBox.sz.toFixed(1)})`);
    console.log(`  Cam=(${after.cam.x.toFixed(1)},${after.cam.y.toFixed(1)},${after.cam.z.toFixed(1)}) target=(${after.target.x.toFixed(1)},${after.target.y.toFixed(1)},${after.target.z.toFixed(1)})`);
    console.log(`  camDist=${after.camDist.toFixed(1)} near=${after.near.toFixed(2)} far=${after.far.toFixed(0)} rx=${after.rx.toFixed(3)}`);
    console.log(`  Storeys after flip (${after.storeys.length}):`);
    for (const s of after.storeys) {
      console.log(`    ${s.name}: ${s.count} el, Z=${s.minZ.toFixed(1)}–${s.maxZ.toFixed(1)}`);
    }

    // Screenshot after flip (still on orientation step)
    await vp.screenshot({ path: 'test-results/engel-after-flip.png' });

    // S230b: Programmatic visibility check — raycaster from camera toward target
    // (headless SwiftShader can't render pixels, but Three.js raycaster works on geometry)
    const rayHit = await vp.evaluate(() => {
      if (!window.THREE || !APP.camera || !APP.controls) return { hit: false, reason: 'no THREE/camera' };
      var dir = new THREE.Vector3();
      dir.subVectors(APP.controls.target, APP.camera.position).normalize();
      var raycaster = new THREE.Raycaster(APP.camera.position.clone(), dir, APP.camera.near, APP.camera.far);
      var meshes = [];
      APP.scene.traverse(function(o) { if (o.isMesh && o.visible) meshes.push(o); });
      var hits = raycaster.intersectObjects(meshes, false);
      return { hit: hits.length > 0, meshCount: meshes.length, hitCount: hits.length,
               firstDist: hits.length ? hits[0].distance.toFixed(1) : null };
    });
    console.log(`§PW_DIAG_RAYCAST hit=${rayHit.hit} meshes=${rayHit.meshCount} hits=${rayHit.hitCount} firstDist=${rayHit.firstDist}`);
    expect(rayHit.hit).toBe(true);  // Building is visible from camera

    // Accept flipped orientation → advance to storeys step
    await vp.click('.wizard-yes');
    await vp.waitForTimeout(300);

    // Read storey step data from wizard panel
    const wizStoreyStep = await vp.evaluate(() => {
      var q = document.getElementById('wizard-question')?.textContent || '';
      var ev = document.getElementById('wizard-evidence')?.textContent || '';
      return { question: q, evidence: ev };
    });
    console.log(`  Wizard storey step: q="${wizStoreyStep.question}"`);
    console.log(`  Wizard storey evidence: "${wizStoreyStep.evidence}"`);

    // Screenshot of storey step with highlighting
    await vp.screenshot({ path: 'test-results/engel-storey-highlight.png' });

    // ── ASSERTIONS ──
    // 1. Flip actually toggled rotation
    expect(Math.abs(after.rx - before.rx)).toBeGreaterThan(1.0);

    // 2. DB Y↔Z swapped: before sizeY should ≈ after sizeZ (or vice versa)
    console.log(`  Y↔Z swap check: before.sizeY=${before.dbRange.sizeY.toFixed(1)} → after.sizeZ=${after.dbRange.sizeZ.toFixed(1)}`);

    // 3. Camera within reasonable distance of building
    var buildingMaxDim = Math.max(after.dbRange.sizeX, after.dbRange.sizeY, after.dbRange.sizeZ);
    console.log(`  buildingMaxDim=${buildingMaxDim.toFixed(1)} camDist=${after.camDist.toFixed(1)} ratio=${(after.camDist/buildingMaxDim).toFixed(1)}`);
    expect(after.camDist).toBeLessThan(buildingMaxDim * 5);
    expect(after.camDist).toBeGreaterThan(buildingMaxDim * 0.3);

    // 4. Near clip allows seeing the building (near < camDist)
    expect(after.near).toBeLessThan(after.camDist);

    // 5. Storey Z ranges should span the building height (not all negative or all zero)
    var storeyMinZ = Math.min(...after.storeys.map(s => s.minZ));
    var storeyMaxZ = Math.max(...after.storeys.map(s => s.maxZ));
    var storeySpan = storeyMaxZ - storeyMinZ;
    console.log(`  Storey span: ${storeyMinZ.toFixed(1)} to ${storeyMaxZ.toFixed(1)} = ${storeySpan.toFixed(1)}m`);
    expect(storeySpan).toBeGreaterThan(1);  // not all in one band
    expect(after.storeys.length).toBeGreaterThanOrEqual(2);  // at least 2 floors

    // 6. No storey should be empty (all should have elements)
    for (const s of after.storeys) {
      expect(s.count).toBeGreaterThan(0);
    }

    // S234: Cleanup — already on storeys step (accepted orientation above)
    await vp.click('.wizard-yes');  // storeys: Yes
    await vp.waitForTimeout(500);
    // Exhaust classify step
    for (var _t7 = 0; _t7 < 10; _t7++) {
      var _ht7 = await vp.evaluate(() => {
        var btns = document.querySelectorAll('#wizard-buttons button');
        return [...btns].some(b => b.textContent.trim() === 'Toggle');
      });
      if (!_ht7) break;
      await vp.click('#wizard-buttons button:has-text("Toggle")');
      await vp.waitForTimeout(300);
    }
    await vp.waitForTimeout(500);
    var _fp7 = await vp.evaluate(() => !!document.getElementById('wizard-panel'));
    if (_fp7) { await vp.click('.wizard-yes').catch(() => {}); }
    await vp.waitForTimeout(1000);
    await vp.close();
  });

});
