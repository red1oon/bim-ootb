// 11-wizard.spec.js — S229 Guided Classification Wizard tests
// Issue: verify wizard panel lifecycle, step navigation, DB updates, dismiss
// Bugs prevented:
//   S229 Wizard panel not rendering after mesh import
//   S229 Orientation flip not updating transforms
//   S229 Wizard not dismissing after Done
//   S229 Storey rename not propagating to DB

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');

const TEST_URL = '/dev/test/test_wizard.html';

test.describe('S229 Classification Wizard', () => {

  test('11.1 Wizard pure-function tests all PASS @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(TEST_URL);

    // Wait for all async tests to finish — summary element gets a class
    await page.waitForFunction(() => {
      const summary = document.getElementById('summary');
      return summary && (summary.className === 'all-pass' || summary.className === 'has-fail');
    }, { timeout: 30000 });

    const stats = await page.evaluate(() => {
      const allDivs = [...document.querySelectorAll('.section')];
      const passDivs = allDivs.filter(d => d.classList.contains('pass'));
      const failDivs = allDivs.filter(d => d.classList.contains('fail'));
      const failTexts = failDivs.map(d => d.textContent.trim());
      return {
        pass: passDivs.length,
        fail: failDivs.length,
        total: passDivs.length + failDivs.length,
        summary: document.getElementById('summary').textContent,
        allPass: document.getElementById('summary').className === 'all-pass',
        failDetails: failTexts,
      };
    });

    console.log(`§PW_WIZARD_PURE pass=${stats.pass} fail=${stats.fail} total=${stats.total} summary="${stats.summary}"`);
    if (stats.fail > 0) {
      console.log(`  FAIL details: ${stats.failDetails.join(' | ')}`);
    }

    // Expect at least 15 assertions to pass (API + render + navigation + dismiss)
    expect(stats.pass).toBeGreaterThanOrEqual(15);
    expect(stats.fail).toBe(0);
  });

  test('11.2 Wizard step sequence is correct @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    await page.goto(TEST_URL);

    await page.waitForFunction(() => {
      const summary = document.getElementById('summary');
      return summary && (summary.className === 'all-pass' || summary.className === 'has-fail');
    }, { timeout: 30000 });

    // Extract step sequence from info lines
    const stepInfo = await page.evaluate(() => {
      const infoDivs = [...document.querySelectorAll('.section.info')];
      return infoDivs.map(d => d.textContent.trim());
    });

    console.log('§PW_WIZARD_STEPS');
    for (const line of stepInfo) {
      console.log(`  ${line}`);
    }

    // Verify step sequence: orientation → storeys → summary (classify skipped for IFC-like DB)
    // S234: No picker step — classify only for >50% proxy imports
    const stepTexts = stepInfo.join(' | ');
    expect(stepTexts).toContain('upright');           // Step 0: orientation
    expect(stepTexts).toContain('storey');            // Step 1: storeys
  });

  test('11.3 Wizard CSS is injected @slow', async ({ page }) => {
    await page.goto(TEST_URL);

    await page.waitForFunction(() => {
      const summary = document.getElementById('summary');
      return summary && (summary.className === 'all-pass' || summary.className === 'has-fail');
    }, { timeout: 30000 });

    // Verify wizard CSS was injected into the page
    const hasWizardStyles = await page.evaluate(() => {
      const styles = [...document.querySelectorAll('style')];
      return styles.some(s => s.textContent.includes('wizard-panel'));
    });

    expect(hasWizardStyles).toBe(true);
    console.log('§PW_WIZARD_CSS injected=true');
  });

  test('11.4 Wizard panel appears in viewer with ?wizard=1 @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    // Load viewer with wizard param and a real DB
    const dbPath = '/buildings/Duplex_extracted.db';
    const viewerUrl = `/sandbox/index.html?db=${dbPath}&lib=${dbPath}&wizard=1&wizardKey=test_duplex`;

    // Track console for wizard lifecycle logs
    const wizardLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('WIZARD') || text.includes('wizard')) {
        wizardLogs.push(text);
      }
    });

    await page.goto(viewerUrl);

    // Wait for wizard panel to appear (wizard loads after APP.init resolves)
    try {
      await page.waitForSelector('#wizard-panel', { timeout: 30000 });
    } catch(e) {
      console.log('§PW_WIZARD_VIEWER wizard_logs:', wizardLogs.join(' | '));
      throw e;
    }

    // Verify panel is visible and has content
    const panelInfo = await page.evaluate(() => {
      const panel = document.getElementById('wizard-panel');
      if (!panel) return { exists: false };
      return {
        exists: true,
        question: panel.querySelector('#wizard-question')?.textContent || '',
        evidence: panel.querySelector('#wizard-evidence')?.textContent || '',
        hasDots: panel.querySelectorAll('#wizard-progress .dot').length,
        hasButtons: panel.querySelectorAll('#wizard-buttons button').length,
      };
    });

    console.log(`§PW_WIZARD_VIEWER exists=${panelInfo.exists} question="${panelInfo.question}" dots=${panelInfo.hasDots} buttons=${panelInfo.hasButtons}`);
    console.log(`  wizard_logs: ${wizardLogs.join(' | ')}`);

    expect(panelInfo.exists).toBe(true);
    expect(panelInfo.question).toContain('upright');  // Step 0: orientation
    expect(panelInfo.hasDots).toBeGreaterThanOrEqual(2);
    expect(panelInfo.hasButtons).toBeGreaterThanOrEqual(2);

    // Click "Yes" on orientation and verify step advances
    await page.click('.wizard-yes');
    await page.waitForTimeout(300);

    const step1 = await page.evaluate(() => {
      const q = document.getElementById('wizard-question');
      return q ? q.textContent : '';
    });

    console.log(`§PW_WIZARD_VIEWER_STEP1 question="${step1}"`);
    expect(step1).not.toContain('upright');
  });

  test('11.5 Wizard saves wizard_complete flag and skips on re-entry @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    // Load viewer with wizard
    const dbPath = '/buildings/Duplex_extracted.db';
    const viewerUrl = `/sandbox/index.html?db=${dbPath}&lib=${dbPath}&wizard=1&wizardKey=test_persist`;

    await page.goto(viewerUrl);
    await page.waitForSelector('#wizard-panel', { timeout: 30000 });

    // S234: Walk through all steps: Yes → Yes → Done (classify skipped for IFC)
    await page.click('.wizard-yes');  // orientation: Yes
    await page.waitForTimeout(200);
    await page.click('.wizard-yes');  // storeys: Yes
    await page.waitForTimeout(200);
    await page.click('.wizard-yes');  // summary: Done → finishWizard
    await page.waitForTimeout(500);  // wait for saves to complete

    // Verify panel is dismissed
    const panelGone = await page.evaluate(() => !document.getElementById('wizard-panel'));
    expect(panelGone).toBe(true);

    // Verify wizard_complete log lines
    const logText = logs.all().join(' ');
    expect(logText).toContain('§WIZARD_MARK_COMPLETE');
    expect(logText).toContain('§WIZARD_COMPLETE');
    console.log('§PW_WIZARD_PERSIST wizard_complete flag written');

    // Now reload the same viewer with wizard=1 — wizard should SKIP
    const logs2 = new ConsoleLogs(page);
    await page.goto(viewerUrl);

    // Wait for wizard.js to load and check
    await page.waitForTimeout(5000);

    // Wizard panel should NOT appear (skipped due to wizard_complete in DB)
    const panelExists = await page.evaluate(() => !!document.getElementById('wizard-panel'));
    const log2Text = logs2.all().join(' ');

    console.log(`§PW_WIZARD_REENTRY panelExists=${panelExists} logs="${log2Text.substring(log2Text.lastIndexOf('WIZARD'), log2Text.lastIndexOf('WIZARD') + 80)}"`);

    // The wizard should skip — but note: the viewer cache may or may not have
    // the wizard_complete DB depending on save timing. Accept either:
    // - panel does not appear (wizard_complete in cached DB), OR
    // - §WIZARD_SKIP_COMPLETE in logs
    const skipped = !panelExists || log2Text.includes('§WIZARD_SKIP_COMPLETE');
    expect(skipped).toBe(true);
  });

  test('11.6 Wizard storey step shows colored legend @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    const dbPath = '/buildings/Duplex_extracted.db';
    const viewerUrl = `/sandbox/index.html?db=${dbPath}&lib=${dbPath}&wizard=1&wizardKey=test_storey_color`;

    await page.goto(viewerUrl);
    await page.waitForSelector('#wizard-panel', { timeout: 30000 });

    // Click Yes on orientation to advance to storeys step
    await page.click('.wizard-yes');
    await page.waitForTimeout(200);

    // Verify storey step has colored dots in evidence
    const storeyInfo = await page.evaluate(() => {
      const evidence = document.getElementById('wizard-evidence');
      if (!evidence) return { exists: false };
      const dots = evidence.querySelectorAll('span[style*="border-radius"]');
      return {
        exists: true,
        text: evidence.textContent,
        colorDots: dots.length,
        hasElevation: evidence.textContent.includes('m'),
      };
    });

    console.log(`§PW_WIZARD_STOREY_LEGEND dots=${storeyInfo.colorDots} hasElev=${storeyInfo.hasElevation} text="${storeyInfo.text}"`);

    expect(storeyInfo.colorDots).toBeGreaterThan(0);
    expect(storeyInfo.hasElevation).toBe(true);
  });

  test('11.7 Wizard flip changes scene rotation and reframes camera @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);

    const dbPath = '/buildings/Duplex_extracted.db';
    const viewerUrl = `/sandbox/index.html?db=${dbPath}&lib=${dbPath}&wizard=1&wizardKey=test_flip`;

    await page.goto(viewerUrl);
    await page.waitForSelector('#wizard-panel', { timeout: 30000 });

    // Get initial state
    const before = await page.evaluate(() => {
      if (!window.APP || !APP.scene) return null;
      return {
        rx: APP.scene.rotation.x,
        camX: APP.camera.position.x,
        camY: APP.camera.position.y,
        camZ: APP.camera.position.z,
      };
    });

    // Click Flip
    await page.click('.wizard-no');
    await page.waitForTimeout(300);

    // Get post-flip state + bbox diagnostics (matches reframe: reset rotation → bbox → restore)
    const after = await page.evaluate(() => {
      if (!window.APP || !APP.scene) return null;
      var savedRx = APP.scene.rotation.x;
      APP.scene.rotation.x = 0;
      APP.scene.updateMatrixWorld(true);
      var box = new THREE.Box3();
      APP.scene.traverse(function(o) { if (o.isMesh) box.expandByObject(o); });
      APP.scene.rotation.x = savedRx;
      APP.scene.updateMatrixWorld(true);
      var size = new THREE.Vector3(); box.getSize(size);
      var center = new THREE.Vector3(); box.getCenter(center);
      // Transform center through current scene matrix for world-space
      var worldCenter = center.clone().applyMatrix4(APP.scene.matrixWorld);
      var camPos = APP.camera.position;
      var dist = camPos.distanceTo(worldCenter);
      var maxDim = Math.max(size.x, size.y, size.z, 1);
      return {
        rx: APP.scene.rotation.x,
        camX: camPos.x, camY: camPos.y, camZ: camPos.z,
        bboxSize: { x: size.x, y: size.y, z: size.z },
        bboxCenter: { x: worldCenter.x, y: worldCenter.y, z: worldCenter.z },
        camDist: dist,
        maxDim: maxDim,
        near: APP.camera.near,
        far: APP.camera.far,
      };
    });

    if (before && after) {
      console.log(`§PW_WIZARD_FLIP before.rx=${before.rx.toFixed(3)} after.rx=${after.rx.toFixed(3)}`);
      console.log(`  cam: (${before.camX.toFixed(1)},${before.camY.toFixed(1)},${before.camZ.toFixed(1)}) → (${after.camX.toFixed(1)},${after.camY.toFixed(1)},${after.camZ.toFixed(1)})`);
      console.log(`  bbox: size=(${after.bboxSize.x.toFixed(1)},${after.bboxSize.y.toFixed(1)},${after.bboxSize.z.toFixed(1)}) center=(${after.bboxCenter.x.toFixed(1)},${after.bboxCenter.y.toFixed(1)},${after.bboxCenter.z.toFixed(1)})`);
      console.log(`  camDist=${after.camDist.toFixed(1)} maxDim=${after.maxDim.toFixed(1)} ratio=${(after.camDist / after.maxDim).toFixed(1)}`);

      // Scene rotation should have changed
      expect(Math.abs(after.rx - before.rx)).toBeGreaterThan(0.1);

      // S230b: Camera should be within reasonable distance (< 3× building size)
      expect(after.camDist / after.maxDim).toBeLessThan(3);

      // S230b: Near/far clipping should be adjusted (not default 0.5/50000)
      expect(after.near).toBeGreaterThan(0);
      expect(after.far).toBeLessThan(50000);
      expect(after.far / after.near).toBeLessThan(10000);  // reasonable depth buffer ratio
      console.log(`  clip: near=${after.near.toFixed(2)} far=${after.far.toFixed(0)} ratio=${(after.far/after.near).toFixed(0)}`);
    }

    // Verify reframe log
    const logText = logs.all().join(' ');
    expect(logText).toContain('§WIZARD_FLIP_3D');
  });

  test('11.8 Camera clipping adjusted on initial wizard load @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    const dbPath = '/buildings/Duplex_extracted.db';
    const viewerUrl = `/sandbox/index.html?db=${dbPath}&lib=${dbPath}&wizard=1&wizardKey=test_clip_init`;

    await page.goto(viewerUrl);
    await page.waitForSelector('#wizard-panel', { timeout: 30000 });

    // Wait for meshes to stream and wizard to apply visuals (polls every 500ms)
    await page.waitForFunction(() => {
      if (!window.APP || !APP.scene) return false;
      var meshCount = 0;
      APP.scene.traverse(function(o) { if (o.isMesh && o.userData.guid) meshCount++; });
      return meshCount > 10;
    }, { timeout: 30000 });

    // Give wizard time to apply reframe after meshes appear
    await page.waitForTimeout(500);

    const clip = await page.evaluate(() => ({
      near: APP.camera.near,
      far: APP.camera.far,
    }));

    console.log(`§PW_WIZARD_CLIP_INIT near=${clip.near.toFixed(3)} far=${clip.far.toFixed(0)} ratio=${(clip.far/clip.near).toFixed(0)}`);

    // Should not be default 0.5/50000
    expect(clip.far).toBeLessThan(50000);
    expect(clip.far / clip.near).toBeLessThan(10000);
  });

  test('11.9 Classify step skipped for IFC-like DB (low proxy count) @slow', async ({ page }) => {
    // S234: Classify step only appears when >50% elements are IfcBuildingElementProxy.
    // Duplex is IFC — all elements pre-classified → no classify step.
    const logs = new ConsoleLogs(page);
    const dbPath = '/buildings/Duplex_extracted.db';
    const viewerUrl = `/sandbox/index.html?db=${dbPath}&lib=${dbPath}&wizard=1&wizardKey=test_no_classify`;

    await page.goto(viewerUrl);
    await page.waitForSelector('#wizard-panel', { timeout: 30000 });

    // Navigate: Yes (orient) → Yes (storeys) → should be on summary (no classify)
    await page.click('.wizard-yes');  // orientation
    await page.waitForTimeout(200);
    await page.click('.wizard-yes');  // storeys
    await page.waitForTimeout(200);

    // Should be on summary step (not classify/picker)
    const summaryQ = await page.evaluate(() =>
      document.getElementById('wizard-question')?.textContent || '');

    console.log(`§PW_WIZARD_NO_CLASSIFY question="${summaryQ}"`);
    expect(summaryQ).toContain('complete');  // Summary step says "Classification complete"
    expect(summaryQ).not.toContain('unclassified');  // Not a classify step
  });

  test('11.10 IFC wizard has 3 progress dots (no classify step) @slow', async ({ page }) => {
    // S234: IFC imports skip the classify step → orient + storeys + summary = 3 dots
    const logs = new ConsoleLogs(page);
    const dbPath = '/buildings/Duplex_extracted.db';
    const viewerUrl = `/sandbox/index.html?db=${dbPath}&lib=${dbPath}&wizard=1&wizardKey=test_3dots`;

    await page.goto(viewerUrl);
    await page.waitForSelector('#wizard-panel', { timeout: 30000 });

    const dotCount = await page.evaluate(() => {
      return document.querySelectorAll('#wizard-progress .dot').length;
    });

    console.log(`§PW_WIZARD_DOTS count=${dotCount}`);
    expect(dotCount).toBe(3);
  });

  test('11.11 Storey edit: user corrects storey count @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    const dbPath = '/buildings/Duplex_extracted.db';
    const viewerUrl = `/sandbox/index.html?db=${dbPath}&lib=${dbPath}&wizard=1&wizardKey=test_storey_edit`;

    await page.goto(viewerUrl);
    await page.waitForSelector('#wizard-panel', { timeout: 30000 });

    // Advance to storeys step
    await page.click('.wizard-yes');  // orientation: Yes
    await page.waitForTimeout(200);

    // Verify storeys step has Edit button
    const hasEdit = await page.evaluate(() => {
      const btns = document.querySelectorAll('#wizard-buttons button');
      return [...btns].some(b => b.textContent.trim() === 'Edit');
    });
    expect(hasEdit).toBe(true);

    // Get initial storey count
    const beforeQ = await page.evaluate(() =>
      document.getElementById('wizard-question')?.textContent || '');
    const beforeCount = parseInt(beforeQ.match(/(\d+)/)?.[1] || '0');
    console.log(`§PW_WIZARD_STOREY_EDIT before="${beforeQ}" count=${beforeCount}`);

    // Click Edit (second .wizard-alt — first is Walk)
    await page.click('#wizard-buttons button:has-text("Edit")');
    await page.waitForTimeout(200);

    // Verify edit UI appeared with input
    const hasInput = await page.evaluate(() => !!document.getElementById('wiz-storey-count'));
    expect(hasInput).toBe(true);

    // Change to 2 storeys
    await page.fill('#wiz-storey-count', '2');
    await page.click('.wizard-yes');  // Apply
    await page.waitForTimeout(300);

    // Verify storeys were re-banded
    const afterQ = await page.evaluate(() =>
      document.getElementById('wizard-question')?.textContent || '');
    const afterCount = parseInt(afterQ.match(/(\d+)/)?.[1] || '0');
    console.log(`§PW_WIZARD_STOREY_EDIT after="${afterQ}" count=${afterCount}`);
    expect(afterCount).toBe(2);

    // Verify log
    const logText = logs.all().join(' ');
    expect(logText).toContain('§WIZARD_STOREY_REBAND');
  });

  test('11.12 Storey toggle: cycle naming scheme and verify DB updated @slow', async ({ page }) => {
    // S233: Toggle button cycles "Ground Floor" label up one band per press.
    // Below ground → Basement, above → Level 1,2,3. Color coding updates each press.
    const logs = new ConsoleLogs(page);
    const dbPath = '/buildings/Duplex_extracted.db';
    const viewerUrl = `/sandbox/index.html?db=${dbPath}&lib=${dbPath}&wizard=1&wizardKey=test_storey_toggle`;

    await page.goto(viewerUrl);
    await page.waitForSelector('#wizard-panel', { timeout: 30000 });

    // Advance to storeys step
    await page.click('.wizard-yes');  // orientation: Yes
    await page.waitForTimeout(200);

    // Verify Toggle button exists
    const hasToggle = await page.evaluate(() => {
      const btns = document.querySelectorAll('#wizard-buttons button');
      return [...btns].some(b => b.textContent.trim() === 'Toggle');
    });
    expect(hasToggle).toBe(true);

    // Get storey names before toggle
    const before = await page.evaluate(() =>
      document.getElementById('wizard-evidence')?.textContent || '');
    console.log(`§PW_WIZARD_TOGGLE_BEFORE "${before.substring(0, 80)}"`);

    // Click Toggle — shifts Ground Floor label up one band
    await page.click('#wizard-buttons button:has-text("Toggle")');
    await page.waitForTimeout(300);

    // Get storey names after toggle — should have "Basement" now
    const after = await page.evaluate(() =>
      document.getElementById('wizard-evidence')?.textContent || '');
    console.log(`§PW_WIZARD_TOGGLE_AFTER "${after.substring(0, 80)}"`);
    expect(after).toContain('Basement');
    expect(after).toContain('Ground Floor');

    // Verify toggle log
    const logText = logs.all().join(' ');
    expect(logText).toContain('§WIZARD_STOREY_TOGGLE');
  });

  test('11.13 Storey walk: isolate floors one at a time @slow', async ({ page }) => {
    const logs = new ConsoleLogs(page);
    const dbPath = '/buildings/Duplex_extracted.db';
    const viewerUrl = `/sandbox/index.html?db=${dbPath}&lib=${dbPath}&wizard=1&wizardKey=test_storey_walk`;

    await page.goto(viewerUrl);
    await page.waitForSelector('#wizard-panel', { timeout: 30000 });

    // Advance to storeys step
    await page.click('.wizard-yes');  // orientation: Yes
    await page.waitForTimeout(200);

    // Verify Walk button exists
    const hasWalk = await page.evaluate(() => {
      const btns = document.querySelectorAll('#wizard-buttons button');
      return [...btns].some(b => b.textContent.trim() === 'Walk');
    });
    expect(hasWalk).toBe(true);

    // Click Walk
    await page.click('#wizard-buttons button:has-text("Walk")');
    await page.waitForTimeout(200);

    // Verify walk mode: question shows "Floor 1/N"
    const walkQ = await page.evaluate(() =>
      document.getElementById('wizard-question')?.textContent || '');
    console.log(`§PW_WIZARD_WALK_START q="${walkQ}"`);
    expect(walkQ).toContain('Floor 1/');

    // Click Next
    await page.click('#wizard-buttons button:has-text("Next")');
    await page.waitForTimeout(200);

    const walkQ2 = await page.evaluate(() =>
      document.getElementById('wizard-question')?.textContent || '');
    console.log(`§PW_WIZARD_WALK_NEXT q="${walkQ2}"`);
    expect(walkQ2).toContain('Floor 2/');

    // Click Prev
    await page.click('#wizard-buttons button:has-text("Prev")');
    await page.waitForTimeout(200);

    const walkQ3 = await page.evaluate(() =>
      document.getElementById('wizard-question')?.textContent || '');
    expect(walkQ3).toContain('Floor 1/');

    // Navigate to last floor and click Done
    // Get total floors from question text
    const totalFloors = parseInt(walkQ.match(/\/(\d+)/)?.[1] || '2');
    for (let i = 1; i < totalFloors; i++) {
      await page.click('#wizard-buttons button:has-text("Next")');
      await page.waitForTimeout(300);
    }
    // On last floor, "Done" button replaces "Next"
    await page.click('#wizard-buttons button:has-text("Done")');
    await page.waitForTimeout(200);

    // After walk done, should be back on storeys step (normal panel)
    const afterQ = await page.evaluate(() =>
      document.getElementById('wizard-question')?.textContent || '');
    console.log(`§PW_WIZARD_WALK_DONE q="${afterQ}"`);
    expect(afterQ).toContain('storey');

    // Verify walk logs
    const logText = logs.all().join(' ');
    expect(logText).toContain('§WIZARD_STOREY_WALK_START');
    expect(logText).toContain('§WIZARD_STOREY_WALK_DONE');
  });

});
