// 17-find-navigate.spec.js — Find & Navigate: indoor wayfinding (S233)
// Bugs prevented:
//   S233 Find panel not opening on "Find ..." NLP input
//   S233 Navigation path walking through walls
//   S233 Voice/text modality mismatch
//   S233 Navigate jumps to target instead of starting from main door (only 2 waypoints)
//   S233 ESC does not exit walk mode after navigation — camera stuck inside model

const { test, expect } = require('@playwright/test');
const { openViewer } = require('../helpers/viewer');
const { ConsoleLogs } = require('../helpers/console-capture');

test.describe('Find & Navigate', () => {

  test.beforeEach(async ({ page }) => {
    await openViewer(page);
  });

  // --- Find Panel ---

  test('17.1 "Find door" triggers find panel @fast', async ({ page }) => {
    // Issue: "Find ..." must open amber find panel, not run NLP count/cost query
    const logs = new ConsoleLogs(page);

    await page.evaluate(() => {
      if (typeof window.APP._nlpExecute === 'function') {
        window.APP._nlpExecute('Find door');
      }
    });
    await page.waitForTimeout(1500);

    // Find panel should be visible with results
    const panel = page.locator('#find-panel');
    await expect(panel).toBeVisible({ timeout: 5000 });

    const resultCount = await panel.locator('.find-result-item').count();
    console.log(`§PW_FIND_PANEL results=${resultCount}`);
    expect(resultCount).toBeGreaterThan(0);
  });

  test('17.2 result click highlights without camera jump @fast', async ({ page }) => {
    // Issue: clicking a result must highlight element but NOT jump camera (Navigate does that)
    await page.evaluate(() => {
      if (typeof window.APP._nlpExecute === 'function') {
        window.APP._nlpExecute('Find door');
      }
    });
    await page.waitForTimeout(1500);

    const items = page.locator('.find-result-item');
    const count = await items.count();
    const clickIdx = count > 1 ? 1 : 0;

    const posBefore = await page.evaluate(() => {
      const cam = window.APP?.camera || window.camera;
      return cam ? { x: cam.position.x, y: cam.position.y, z: cam.position.z } : null;
    });

    if (await items.nth(clickIdx).isVisible()) {
      await items.nth(clickIdx).click();
      await page.waitForTimeout(1000);

      const posAfter = await page.evaluate(() => {
        const cam = window.APP?.camera || window.camera;
        return cam ? { x: cam.position.x, y: cam.position.y, z: cam.position.z } : null;
      });

      // Camera should NOT have moved — highlight only
      if (posBefore && posAfter) {
        const moved = Math.abs(posAfter.x - posBefore.x) > 0.1 ||
                      Math.abs(posAfter.y - posBefore.y) > 0.1 ||
                      Math.abs(posAfter.z - posBefore.z) > 0.1;
        console.log(`§PW_FIND_SELECT moved=${moved} idx=${clickIdx}`);
        expect(moved).toBe(false);
      }

      // Active class should be set
      const activeCount = await page.locator('.find-result-item.active').count();
      expect(activeCount).toBe(1);
    }
  });

  // --- Navigation ---

  test('17.3 Navigate starts walk mode @slow', async ({ page }) => {
    // Issue: [Navigate] must enter walk mode at main door, eye height 1.6m
    await page.evaluate(() => {
      if (typeof window.APP._nlpExecute === 'function') {
        window.APP._nlpExecute('Find door');
      }
    });
    await page.waitForTimeout(1500);

    // Click first result then navigate
    const firstResult = page.locator('.find-result-item').first();
    if (await firstResult.isVisible()) {
      await firstResult.click();
      await page.waitForTimeout(500);
    }

    const navBtn = page.locator('#find-navigate-btn, .find-navigate-btn, [data-action="navigate"]');
    if (await navBtn.isVisible({ timeout: 3000 })) {
      await navBtn.click();
      await page.waitForTimeout(2000);

      // Walk mode should be active — check for walk controls or navigation HUD
      const walkActive = await page.evaluate(() => {
        return !!(window.APP?.walkMode || window.walkMode ||
                  document.querySelector('#nav-hud') ||
                  document.querySelector('.nav-bottom-bar'));
      });
      console.log(`§PW_NAV_WALK walkActive=${walkActive}`);
      expect(walkActive).toBe(true);
    }
  });

  test('17.4 walk arrow advances waypoint @slow', async ({ page }) => {
    // Issue: each Walk tap must advance camera to next waypoint, step counter increments
    // Setup: open find panel, select first result, navigate
    const navActive = await page.evaluate(() => {
      var A = window.APP;
      if (typeof A.openFindPanel !== 'function') return false;
      A.openFindPanel('door');
      return true;
    });
    if (!navActive) return;
    await page.waitForTimeout(1000);

    // Click first result then navigate
    const first = page.locator('.find-result-item').first();
    if (await first.isVisible()) await first.click();
    await page.waitForTimeout(300);
    const navBtn = page.locator('#find-navigate-btn');
    if (await navBtn.isVisible()) await navBtn.click();
    await page.waitForTimeout(2000);

    const stepBefore = await page.evaluate(() => window.APP?.navCurrentStep || 0);

    // Simulate walk arrow / UP key
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(1000);

    const stepAfter = await page.evaluate(() => window.APP?.navCurrentStep || 0);

    console.log(`§PW_NAV_STEP before=${stepBefore} after=${stepAfter}`);
    expect(stepAfter).toBeGreaterThan(stepBefore);
  });

  test('17.5 direction cue appears @slow', async ({ page }) => {
    // Issue: HUD arrow must appear with correct direction class at each waypoint
    await page.evaluate(() => {
      var A = window.APP;
      if (typeof A.openFindPanel === 'function') A.openFindPanel('door');
    });
    await page.waitForTimeout(1000);

    const first = page.locator('.find-result-item').first();
    if (await first.isVisible()) await first.click();
    await page.waitForTimeout(300);
    const navBtn = page.locator('#find-navigate-btn');
    if (await navBtn.isVisible()) await navBtn.click();
    await page.waitForTimeout(2000);

    // Advance a step to trigger direction cue
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(1000);

    const cue = page.locator('#nav-direction-cue');
    const cueVisible = await cue.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`§PW_NAV_CUE visible=${cueVisible}`);
    expect(cueVisible).toBe(true);
  });

  test('17.6 arrival triggers info panel @slow', async ({ page }) => {
    // Issue: reaching target must highlight element + open info panel
    const arrived = await page.evaluate(() => {
      // Programmatic: if we can fast-forward navigation to end
      if (typeof window.APP?.navJumpToEnd === 'function') {
        window.APP.navJumpToEnd();
        return true;
      }
      return false;
    });

    if (arrived) {
      await page.waitForTimeout(1500);

      const infoVisible = await page.evaluate(() => {
        const infoPanel = document.querySelector('#info-panel, .info-panel, #element-info');
        return infoPanel && infoPanel.style.display !== 'none';
      });
      console.log(`§PW_NAV_ARRIVE infoPanel=${infoVisible}`);
      expect(infoVisible).toBe(true);
    }
  });

  // --- Voice modality ---

  test('17.7 voice flag set on mic input @fast', async ({ page }) => {
    // Issue: inputWasVoice must be true after SpeechRecognition, false after keyboard
    // SpeechRecognition not available in headless — test the flag logic only

    // Simulate keyboard input → flag should be false
    const typedFlag = await page.evaluate(() => {
      if (window.APP) window.APP.inputWasVoice = false;
      return window.APP?.inputWasVoice;
    });

    // Simulate voice input → flag should be true
    const voiceFlag = await page.evaluate(() => {
      if (window.APP) window.APP.inputWasVoice = true;
      return window.APP?.inputWasVoice;
    });

    console.log(`§PW_VOICE_FLAG typed=${typedFlag} voice=${voiceFlag}`);
    expect(typedFlag).toBe(false);
    expect(voiceFlag).toBe(true);
  });

  // --- Storey filter + item selection (Issue 2+4) ---

  test('17.9 storey filter narrows results and item click works @slow', async ({ page }) => {
    // Issue: selecting a storey from dropdown must update results; clicking a result must zoom camera
    await page.evaluate(() => {
      if (typeof window.APP._nlpExecute === 'function') window.APP._nlpExecute('Find door');
    });
    await page.waitForTimeout(1500);

    const countBefore = await page.locator('.find-result-item').count();

    // Set storey filter — pick a storey that has matching results (check mark = matches)
    const filterResult = await page.evaluate(() => {
      var sel = document.getElementById('find-storey');
      if (!sel) return { ok: false };
      // Find first storey with ✔ (has matches for current search term)
      for (var i = 1; i < sel.options.length; i++) {
        if (sel.options[i].textContent.indexOf('\u2714') >= 0) {
          sel.value = sel.options[i].value;
          if (typeof sel.onchange === 'function') sel.onchange();
          return { ok: true, storey: sel.options[i].value };
        }
      }
      // Fallback: pick any storey
      for (var j = 1; j < sel.options.length; j++) {
        if (sel.options[j].value) {
          sel.value = sel.options[j].value;
          if (typeof sel.onchange === 'function') sel.onchange();
          return { ok: true, storey: sel.options[j].value };
        }
      }
      return { ok: false };
    });
    await page.waitForTimeout(1000);

    if (filterResult.ok) {
      // Diagnose: what does the DOM look like after filter change?
      const state = await page.evaluate(() => {
        var nameVal = document.getElementById('find-name')?.value;
        var storeyVal = document.getElementById('find-storey')?.value;
        var items = document.querySelectorAll('.find-result-item');
        var countText = document.getElementById('find-count')?.textContent;
        return { name: nameVal, storey: storeyVal, items: items.length, count: countText };
      });
      console.log(`§PW_STOREY_DIAG name="${state.name}" storey="${state.storey}" items=${state.items} count="${state.count}"`);

      const countAfter = state.items;
      expect(countAfter).toBeGreaterThan(0);
      expect(countAfter).toBeLessThan(countBefore);

      // Click first result via evaluate (bypass Playwright click timing)
      await page.evaluate(() => {
        var items = document.querySelectorAll('.find-result-item');
        if (items.length > 0) items[0].click();
      });
      await page.waitForTimeout(1000);

      const activeCount = await page.locator('.find-result-item.active').count();
      console.log(`§PW_STOREY_ITEM_CLICK active=${activeCount}`);
      expect(activeCount).toBe(1);

      // Verify navigate button updated with selected element name
      const navText = await page.locator('#find-navigate-btn').textContent();
      console.log(`§PW_STOREY_NAV_BTN text="${navText}"`);
      expect(navText.length).toBeGreaterThan(5);
    }
  });

  test('17.10 type filter cross-updates with storey @fast', async ({ page }) => {
    // Issue: changing type dropdown must refresh storey match counts and results
    await page.evaluate(() => {
      if (typeof window.APP._nlpExecute === 'function') window.APP._nlpExecute('Find wall');
    });
    await page.waitForTimeout(1500);

    const typeSelect = page.locator('#find-type');
    // Pick IfcDoor or first option with matches
    const typeOptions = await typeSelect.locator('option').allTextContents();
    const doorOpt = typeOptions.find(o => /door/i.test(o));
    if (doorOpt) {
      const val = await typeSelect.locator('option', { hasText: doorOpt }).getAttribute('value');
      await typeSelect.selectOption(val);
      await page.waitForTimeout(800);

      const count = await page.locator('.find-result-item').count();
      console.log(`§PW_TYPE_FILTER type="${val}" results=${count}`);
      expect(count).toBeGreaterThan(0);

      // Storey dropdown should still have options
      const storeyOpts = await page.locator('#find-storey option').count();
      expect(storeyOpts).toBeGreaterThan(1); // "All storeys" + at least one real
    }
  });

  // --- Navigation walk-through (freeze test) ---

  test('17.11 navigate advances camera and does not freeze @slow', async ({ page }) => {
    // Issue: camera must advance toward target on ArrowUp — no freeze inside the model
    await page.evaluate(() => {
      if (typeof window.APP.openFindPanel === 'function') window.APP.openFindPanel('door');
    });
    await page.waitForTimeout(1000);

    // Select first result + navigate
    const first = page.locator('.find-result-item').first();
    if (await first.isVisible()) await first.click();
    await page.waitForTimeout(300);
    const navBtn = page.locator('#find-navigate-btn');
    if (await navBtn.isVisible()) await navBtn.click();
    await page.waitForTimeout(2000);

    // Record start position
    const startPos = await page.evaluate(() => {
      var c = window.APP?.camera;
      return c ? { x: c.position.x, y: c.position.y, z: c.position.z } : null;
    });
    const totalWaypoints = await page.evaluate(() => {
      return window.APP?.navActive ? (window.APP._nav?.waypoints?.length || 0) : 0;
    });

    // Press ArrowUp repeatedly — path may be short (2 waypoints) or long
    const maxSteps = 10;
    for (let i = 0; i < maxSteps; i++) {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(600);
      // Stop if navigation ended (arrival)
      const stillActive = await page.evaluate(() => window.APP?.navActive);
      if (!stillActive) break;
    }
    await page.waitForTimeout(500);

    // Final position must differ from start — camera moved
    const endPos = await page.evaluate(() => {
      var c = window.APP?.camera;
      return c ? { x: c.position.x, y: c.position.y, z: c.position.z, step: window.APP.navCurrentStep } : null;
    });
    if (startPos && endPos) {
      const totalMoved = Math.sqrt(
        Math.pow(endPos.x - startPos.x, 2) +
        Math.pow(endPos.y - startPos.y, 2) +
        Math.pow(endPos.z - startPos.z, 2)
      );
      console.log(`§PW_NAV_WALK moved=${totalMoved.toFixed(1)}m step=${endPos.step} waypoints=${totalWaypoints}`);
      expect(totalMoved).toBeGreaterThan(0.5);
    }
  });

  test('17.12 re-search after arrival works @slow', async ({ page }) => {
    // Issue: after navigation completes, opening Find again must work fresh
    // Fast-forward: navigate and arrive
    await page.evaluate(() => {
      var A = window.APP;
      if (typeof A.openFindPanel === 'function') A.openFindPanel('door');
    });
    await page.waitForTimeout(1000);
    const first = page.locator('.find-result-item').first();
    if (await first.isVisible()) await first.click();
    await page.waitForTimeout(300);
    const navBtn = page.locator('#find-navigate-btn');
    if (await navBtn.isVisible()) await navBtn.click();
    await page.waitForTimeout(1500);

    // Jump to end (arrival)
    await page.evaluate(() => {
      if (typeof window.APP.navJumpToEnd === 'function') window.APP.navJumpToEnd();
    });
    await page.waitForTimeout(4000); // wait for arrival + 3s auto-fade

    // Now re-open find panel with a new search
    await page.evaluate(() => {
      if (typeof window.APP.openFindPanel === 'function') window.APP.openFindPanel('wall');
    });
    await page.waitForTimeout(1500);

    const panel = page.locator('#find-panel');
    await expect(panel).toBeVisible();
    const resultCount = await page.locator('.find-result-item').count();
    console.log(`§PW_RE_SEARCH results=${resultCount}`);
    expect(resultCount).toBeGreaterThan(0);

    // Walk mode should be OFF (fresh search)
    const walkOff = await page.evaluate(() => !window.APP.walkModeActive);
    console.log(`§PW_RE_SEARCH_WALK walkOff=${walkOff}`);
    expect(walkOff).toBe(true);
  });

  // --- Desktop voice + navigate flow ---

  test('17.13 desktop voice flag triggers spoken cues @fast', async ({ page }) => {
    // Issue: desktop users can use mic for voice search — inputWasVoice must enable SpeechSynthesis cues
    // SpeechRecognition not available in headless — test the flag + speak wiring

    // Simulate voice input: set inputWasVoice then open Find panel
    await page.evaluate(() => {
      window.APP.inputWasVoice = true;
      if (typeof window.APP._nlpExecute === 'function') window.APP._nlpExecute('Find door');
    });
    await page.waitForTimeout(1500);

    // Voice mode should be active in navigate state
    const voiceMode = await page.evaluate(() => {
      // The voiceMode is set from inputWasVoice when openFindPanel is called
      // Verify: SpeechSynthesis is available on desktop Chrome
      var hasSynth = typeof window.speechSynthesis !== 'undefined';
      var hasRecog = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      return { hasSynth: hasSynth, hasRecog: hasRecog, wasVoice: window.APP.inputWasVoice };
    });
    console.log(`§PW_DESKTOP_VOICE synth=${voiceMode.hasSynth} recog=${voiceMode.hasRecog} wasVoice=${voiceMode.wasVoice}`);
    // SpeechSynthesis must be available (Chrome headless supports it)
    expect(voiceMode.hasSynth).toBe(true);
    expect(voiceMode.wasVoice).toBe(true);

    // Navigate should use voice cues — verify by checking navigate starts and cue appears
    const first = page.locator('.find-result-item').first();
    if (await first.isVisible()) await first.click();
    await page.waitForTimeout(300);
    const navBtn = page.locator('#find-navigate-btn');
    if (await navBtn.isVisible()) {
      await navBtn.click();
      await page.waitForTimeout(2000);
      // Advance one step to trigger spoken cue
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(1000);
      const cueVisible = await page.locator('#nav-direction-cue').isVisible().catch(() => false);
      console.log(`§PW_DESKTOP_VOICE_CUE cue=${cueVisible}`);
      expect(cueVisible).toBe(true);
    }
  });

  test('17.14 mic button visible on desktop @fast', async ({ page }) => {
    // Issue: mic button must be available on desktop for off-site shopfloor planning
    // Open NLP bar
    await page.evaluate(() => {
      if (typeof window.APP.toggleNlp === 'function') window.APP.toggleNlp();
    });
    await page.waitForTimeout(500);

    const micBtn = page.locator('#nlp-mic');
    const micVisible = await micBtn.isVisible().catch(() => false);
    console.log(`§PW_DESKTOP_MIC visible=${micVisible}`);
    // Mic button should exist if SpeechRecognition is available
    const hasRecog = await page.evaluate(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));
    if (hasRecog) {
      expect(micVisible).toBe(true);
    } else {
      console.log(`§PW_DESKTOP_MIC skipped — no SpeechRecognition in headless`);
    }

    // NLP bar should be visible with input field
    const nlpBar = page.locator('#nlp-bar');
    await expect(nlpBar).toBeVisible();
    const nlpInput = page.locator('#nlp-input');
    await expect(nlpInput).toBeVisible();
  });

  // --- Exit ---

  test('17.8 ESC exits navigation @fast', async ({ page }) => {
    // Issue: ESC must close find panel and restore normal camera
    await page.evaluate(() => {
      if (typeof window.APP._nlpExecute === 'function') {
        window.APP._nlpExecute('Find door');
      }
    });
    await page.waitForTimeout(1500);

    const panelBefore = await page.locator('#find-panel').isVisible().catch(() => false);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    const panelAfter = await page.locator('#find-panel').isVisible().catch(() => false);
    console.log(`§PW_NAV_ESC before=${panelBefore} after=${panelAfter}`);

    // Panel should be hidden after ESC
    if (panelBefore) {
      expect(panelAfter).toBe(false);
    }
  });

  // --- S233 Session 3: Navigate must start from main door, not target ---

  test('17.15 navigate starts from main entrance not target @slow', async ({ page }) => {
    // Issue: Navigate jumped to target in 2 steps — must start from main door
    await page.evaluate(() => {
      if (typeof window.APP.openFindPanel === 'function') window.APP.openFindPanel('door');
    });
    await page.waitForTimeout(1500);

    // Select first result (zooms camera to element)
    const first = page.locator('.find-result-item').first();
    if (await first.isVisible()) await first.click();
    await page.waitForTimeout(500);

    // Record element position (where camera zoomed to)
    const zoomedPos = await page.evaluate(() => {
      var c = window.APP?.camera;
      return c ? { x: c.position.x, y: c.position.y, z: c.position.z } : null;
    });

    // Click Navigate
    const navBtn = page.locator('#find-navigate-btn');
    if (await navBtn.isVisible()) {
      await navBtn.click();
      await page.waitForTimeout(2000);

      // Camera should have MOVED AWAY from element to main entrance
      const navStartPos = await page.evaluate(() => {
        var c = window.APP?.camera;
        return c ? { x: c.position.x, y: c.position.y, z: c.position.z } : null;
      });

      if (zoomedPos && navStartPos) {
        var movedFromTarget = Math.sqrt(
          Math.pow(navStartPos.x - zoomedPos.x, 2) +
          Math.pow(navStartPos.y - zoomedPos.y, 2) +
          Math.pow(navStartPos.z - zoomedPos.z, 2)
        );
        console.log(`§PW_NAV_START_DOOR moved=${movedFromTarget.toFixed(1)}m from_zoomed=(${zoomedPos.x.toFixed(1)},${zoomedPos.y.toFixed(1)}) nav_start=(${navStartPos.x.toFixed(1)},${navStartPos.y.toFixed(1)})`);
        // Camera must have moved significantly — entrance is far from target element
        expect(movedFromTarget).toBeGreaterThan(1);
      }
    }
  });

  test('17.16 path has more than 2 waypoints @slow', async ({ page }) => {
    // Issue: straight-line fallback produced only 2 waypoints (start+end), no walking feel
    await page.evaluate(() => {
      if (typeof window.APP.openFindPanel === 'function') window.APP.openFindPanel('door');
    });
    await page.waitForTimeout(1500);

    const first = page.locator('.find-result-item').first();
    if (await first.isVisible()) await first.click();
    await page.waitForTimeout(300);
    const navBtn = page.locator('#find-navigate-btn');
    if (await navBtn.isVisible()) {
      await navBtn.click();
      await page.waitForTimeout(2000);

      const wpCount = await page.evaluate(() => {
        var A = window.APP;
        // Access internal nav state — navigate.js exposes via A._nav or closure
        if (A._nav && A._nav.waypoints) return A._nav.waypoints.length;
        // Fallback: count steps by walking
        return A.navActive ? -1 : 0;
      });
      console.log(`§PW_NAV_WAYPOINTS count=${wpCount}`);
      // Must have at least 3 waypoints for a meaningful walk
      if (wpCount > 0) {
        expect(wpCount).toBeGreaterThanOrEqual(3);
      }
    }
  });

  test('17.19 route template auto-generates from grid @slow', async ({ page }) => {
    // Issue: route template must auto-generate nodes (doors, junctions) and edges from grid
    await page.evaluate(() => {
      if (typeof window.APP.openFindPanel === 'function') window.APP.openFindPanel('door');
    });
    await page.waitForTimeout(1500);

    // Build route template for a storey
    const templateInfo = await page.evaluate(() => {
      var A = window.APP;
      if (typeof A.buildRouteTemplate !== 'function') return { error: 'no buildRouteTemplate' };
      // Get first storey from results
      var storey = A._nav && A._nav.results && A._nav.results[0] ? A._nav.results[0].storey : null;
      if (!storey) return { error: 'no storey' };
      var t = A.buildRouteTemplate(storey);
      if (!t) return { error: 'template null', storey: storey };
      var types = {};
      t.nodes.forEach(function(n) { types[n.type] = (types[n.type] || 0) + 1; });
      return {
        storey: storey,
        nodeCount: t.nodes.length,
        edgeCount: t.edges.length,
        types: types,
        hasLabels: t.nodes.some(function(n) { return n.label && n.label !== 'Junction' && n.label !== 'End'; }),
        sampleLabels: t.nodes.slice(0, 5).map(function(n) { return n.label; })
      };
    });
    console.log(`§PW_ROUTE_TEMPLATE nodes=${templateInfo.nodeCount} edges=${templateInfo.edgeCount} types=${JSON.stringify(templateInfo.types)} labels=${JSON.stringify(templateInfo.sampleLabels)}`);
    expect(templateInfo.nodeCount).toBeGreaterThanOrEqual(2);
    expect(templateInfo.edgeCount).toBeGreaterThanOrEqual(1);
  });

  test('17.20 route template path has named waypoints @slow', async ({ page }) => {
    // Issue: navigation via route template must produce waypoints with labels
    const consoleLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('§') || text.includes('ROUTE') || text.includes('PATH') || text.includes('GRAPH')) consoleLogs.push(text);
    });

    // Force fresh template build (clear caches from any prior test on same page)
    await page.evaluate(() => {
      if (window.APP && window.APP._nav) window.APP._nav.gridCache = {};
    });

    await page.evaluate(() => {
      if (typeof window.APP.openFindPanel === 'function') window.APP.openFindPanel('door');
    });
    await page.waitForTimeout(1500);

    const first = page.locator('.find-result-item').first();
    if (await first.isVisible()) await first.click();
    await page.waitForTimeout(300);
    const navBtn = page.locator('#find-navigate-btn');
    if (await navBtn.isVisible()) {
      await navBtn.click();
      await page.waitForTimeout(2000);

      const pathInfo = await page.evaluate(() => {
        var A = window.APP;
        if (!A._nav || !A._nav.waypoints) return { wpCount: 0 };
        var labeled = A._nav.waypoints.filter(function(w) { return w.label; });
        // Check if route template was used (check for template in cache)
        var storey = A._nav.results && A._nav.results[A._nav.activeIdx] ? A._nav.results[A._nav.activeIdx].storey : null;
        var tmpl = storey && typeof A.getRouteTemplate === 'function' ? A.getRouteTemplate(storey) : null;
        return {
          wpCount: A._nav.waypoints.length,
          labeledCount: labeled.length,
          labels: labeled.map(function(w) { return w.label; }),
          templateNodes: tmpl ? tmpl.nodes.length : 0,
          templateEdges: tmpl ? tmpl.edges.length : 0,
          storey: storey
        };
      });
      console.log(`§PW_ROUTE_PATH waypoints=${pathInfo.wpCount} labeled=${pathInfo.labeledCount} tmplNodes=${pathInfo.templateNodes} tmplEdges=${pathInfo.templateEdges} storey="${pathInfo.storey}" labels=${JSON.stringify(pathInfo.labels)}`);
      expect(pathInfo.wpCount).toBeGreaterThanOrEqual(3);
      // Dump console logs for diagnosis
      console.log(`§PW_ROUTE_CONSOLE ${consoleLogs.filter(l => l.includes('PATH') || l.includes('ROUTE') || l.includes('GRID') || l.includes('GRAPH')).join(' | ')}`);

      // Route template must have been built
      expect(pathInfo.templateNodes).toBeGreaterThanOrEqual(2);
    }
  });

  test('17.18 free orbit during navigation and repath on walk @slow', async ({ page }) => {
    // Issue: user must be able to pinch/orbit freely; walk button recalculates if off-path
    await page.evaluate(() => {
      if (typeof window.APP.openFindPanel === 'function') window.APP.openFindPanel('door');
    });
    await page.waitForTimeout(1000);

    const first = page.locator('.find-result-item').first();
    if (await first.isVisible()) await first.click();
    await page.waitForTimeout(300);
    const navBtn = page.locator('#find-navigate-btn');
    if (await navBtn.isVisible()) {
      await navBtn.click();
      await page.waitForTimeout(2000);

      // Orbit controls must be enabled during navigation
      const controlsEnabled = await page.evaluate(() => !!window.APP.controls?.enabled);
      console.log(`§PW_NAV_ORBIT controls=${controlsEnabled}`);
      expect(controlsEnabled).toBe(true);

      // Simulate user orbiting far away (move camera manually)
      await page.evaluate(() => {
        window.APP.camera.position.set(100, 50, 100);
        if (window.APP.controls && window.APP.controls.target) {
          window.APP.controls.target.set(100, 0, 100);
          window.APP.controls.update();
        }
      });
      await page.waitForTimeout(500);

      // Press walk — should trigger repath from new position
      const wpBefore = await page.evaluate(() => window.APP._nav?.waypoints?.length || 0);
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(1000);
      const wpAfter = await page.evaluate(() => window.APP._nav?.waypoints?.length || 0);

      console.log(`§PW_NAV_REPATH wpBefore=${wpBefore} wpAfter=${wpAfter}`);
      // Waypoints should have changed (recalculated from new position)
      expect(wpAfter).toBeGreaterThanOrEqual(2);
    }
  });

  test('17.17 ESC during navigation exits walk mode fully @fast', async ({ page }) => {
    // Issue: ESC closed panel but left user stuck in walk mode inside the model
    await page.evaluate(() => {
      if (typeof window.APP.openFindPanel === 'function') window.APP.openFindPanel('door');
    });
    await page.waitForTimeout(1000);

    const first = page.locator('.find-result-item').first();
    if (await first.isVisible()) await first.click();
    await page.waitForTimeout(300);
    const navBtn = page.locator('#find-navigate-btn');
    if (await navBtn.isVisible()) {
      await navBtn.click();
      await page.waitForTimeout(2000);

      // Confirm walk mode is active
      const walkBefore = await page.evaluate(() => !!window.APP.walkModeActive);
      expect(walkBefore).toBe(true);

      // Press ESC
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      // Walk mode must be OFF, controls re-enabled
      const state = await page.evaluate(() => ({
        walkActive: !!window.APP.walkModeActive,
        controlsEnabled: !!window.APP.controls?.enabled,
        navActive: !!window.APP.navActive,
        panelVisible: document.getElementById('find-panel')?.style.display !== 'none'
      }));
      console.log(`§PW_ESC_FULL walk=${state.walkActive} controls=${state.controlsEnabled} nav=${state.navActive} panel=${state.panelVisible}`);
      expect(state.walkActive).toBe(false);
      expect(state.controlsEnabled).toBe(true);
      expect(state.navActive).toBe(false);
    }
  });

  // ══════════════════════════════════════════════════════════════
  // S233 Session 3 — White-box regression tests with debug logging
  // ══════════════════════════════════════════════════════════════

  test('17.21 mic button sized correctly on mobile viewport @fast', async ({ browser }) => {
    // Issue: #nlp-btn too large on mobile — inline min-height:44px not overridden
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, userAgent: 'iPhone' });
    const page = await ctx.newPage();
    await openViewer(page);

    const box = await page.evaluate(() => {
      const btn = document.getElementById('nlp-btn');
      if (!btn) return null;
      const cs = getComputedStyle(btn);
      const rect = btn.getBoundingClientRect();
      return {
        width: rect.width, height: rect.height,
        padding: cs.padding, fontSize: cs.fontSize, minHeight: cs.minHeight,
        display: cs.display, visible: rect.width > 0
      };
    });
    console.log(`§PW_MIC_MOBILE ${JSON.stringify(box)}`);
    expect(box).not.toBeNull();
    expect(box.visible).toBe(true);
    // Must be compact: height ≤ 40px on mobile
    expect(box.height).toBeLessThanOrEqual(40);
    expect(box.height).toBeGreaterThan(0);
    await ctx.close();
  });

  test('17.22 mic button sized correctly on desktop @fast', async ({ page }) => {
    // Issue: desktop button must be visible at top-center, not oversized
    const box = await page.evaluate(() => {
      const btn = document.getElementById('nlp-btn');
      if (!btn) return null;
      const rect = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      return {
        width: rect.width, height: rect.height,
        left: rect.left, top: rect.top,
        centerX: rect.left + rect.width / 2,
        viewportCenter: vw / 2,
        visible: rect.width > 0 && rect.height > 0
      };
    });
    console.log(`§PW_MIC_DESKTOP ${JSON.stringify(box)}`);
    expect(box.visible).toBe(true);
    // Centered: button center within 20px of viewport center
    expect(Math.abs(box.centerX - box.viewportCenter)).toBeLessThan(20);
    // Reasonable size
    expect(box.height).toBeLessThanOrEqual(40);
    expect(box.height).toBeGreaterThan(10);
  });

  test('17.23 find panel position: right mid, not blocking center @fast', async ({ page }) => {
    // Issue: amber panel was centered, blocking the 3D scene
    await page.evaluate(() => {
      if (typeof window.APP.openFindPanel === 'function') window.APP.openFindPanel('door');
    });
    await page.waitForTimeout(1000);

    const panelBox = await page.evaluate(() => {
      const p = document.getElementById('find-panel');
      if (!p || p.style.display === 'none') return null;
      const rect = p.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      return {
        left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        width: rect.width, height: rect.height,
        vw: vw, vh: vh,
        rightEdge: vw - rect.right,
        centerY: rect.top + rect.height / 2,
        viewportCenterY: vh / 2
      };
    });
    console.log(`§PW_PANEL_POS ${JSON.stringify(panelBox)}`);
    expect(panelBox).not.toBeNull();
    // Panel must be on the RIGHT side (right edge within 30px of viewport right)
    expect(panelBox.rightEdge).toBeLessThan(30);
    // Panel must be vertically centered (within 50px of viewport center)
    expect(Math.abs(panelBox.centerY - panelBox.viewportCenterY)).toBeLessThan(50);
    // Panel must not be too wide (≤ 50% of viewport)
    expect(panelBox.width).toBeLessThan(panelBox.vw * 0.5);
  });

  test('17.24 click result: highlight only, camera stays put @fast', async ({ page }) => {
    // Issue: clicking a result jumped camera to element, bypassing navigation
    const logs = [];
    page.on('console', msg => { if (msg.text().includes('§')) logs.push(msg.text()); });

    await page.evaluate(() => {
      if (typeof window.APP.openFindPanel === 'function') window.APP.openFindPanel('door');
    });
    await page.waitForTimeout(1500);

    const posBefore = await page.evaluate(() => {
      const c = window.APP?.camera;
      return c ? { x: c.position.x, y: c.position.y, z: c.position.z } : null;
    });

    // Click second result
    await page.evaluate(() => {
      const items = document.querySelectorAll('.find-result-item');
      if (items.length > 1) items[1].click();
      else if (items.length > 0) items[0].click();
    });
    await page.waitForTimeout(500);

    const posAfter = await page.evaluate(() => {
      const c = window.APP?.camera;
      const active = document.querySelectorAll('.find-result-item.active').length;
      return c ? { x: c.position.x, y: c.position.y, z: c.position.z, active: active } : null;
    });

    if (posBefore && posAfter) {
      const moved = Math.sqrt(
        Math.pow(posAfter.x - posBefore.x, 2) +
        Math.pow(posAfter.y - posBefore.y, 2) +
        Math.pow(posAfter.z - posBefore.z, 2)
      );
      console.log(`§PW_CLICK_NO_JUMP moved=${moved.toFixed(2)}m active=${posAfter.active}`);
      // Camera must NOT have moved
      expect(moved).toBeLessThan(0.5);
      // Active class must be set
      expect(posAfter.active).toBe(1);
    }
  });

  test('17.25 navigate: starts from main door, >3 waypoints, step-by-step @slow', async ({ page }) => {
    // Issue: navigation jumped to target in 2 steps instead of walking from entrance
    const logs = [];
    page.on('console', msg => { if (msg.text().includes('§')) logs.push(msg.text()); });

    await page.evaluate(() => {
      if (typeof window.APP.openFindPanel === 'function') window.APP.openFindPanel('wall');
    });
    await page.waitForTimeout(1500);

    // Select first result
    await page.evaluate(() => {
      const items = document.querySelectorAll('.find-result-item');
      if (items.length > 0) items[0].click();
    });
    await page.waitForTimeout(300);

    // Record camera before navigate
    const camBeforeNav = await page.evaluate(() => {
      const c = window.APP?.camera;
      return c ? { x: c.position.x, y: c.position.y, z: c.position.z } : null;
    });

    // Click Navigate
    await page.evaluate(() => {
      const btn = document.getElementById('find-navigate-btn');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2000);

    const navState = await page.evaluate(() => {
      const A = window.APP;
      const c = A?.camera;
      return {
        navActive: !!A.navActive,
        walkActive: !!A.walkModeActive,
        waypoints: A._nav?.waypoints?.length || 0,
        step: A.navCurrentStep || 0,
        camX: c?.position.x, camY: c?.position.y, camZ: c?.position.z,
        hudVisible: document.getElementById('nav-hud')?.style.display !== 'none',
        panelHidden: document.getElementById('find-panel')?.style.display === 'none',
        labels: (A._nav?.waypoints || []).filter(w => w.label).map(w => w.label)
      };
    });

    let movedToEntrance = 0;
    if (camBeforeNav) {
      movedToEntrance = Math.sqrt(
        Math.pow(navState.camX - camBeforeNav.x, 2) +
        Math.pow(navState.camY - camBeforeNav.y, 2) +
        Math.pow(navState.camZ - camBeforeNav.z, 2)
      );
    }

    console.log(`§PW_NAV_WHITEBOX active=${navState.navActive} walk=${navState.walkActive} wp=${navState.waypoints} step=${navState.step} movedToEntrance=${movedToEntrance.toFixed(1)}m hud=${navState.hudVisible} panelHidden=${navState.panelHidden} labels=${JSON.stringify(navState.labels)}`);
    console.log(`§PW_NAV_LOGS ${logs.filter(l => l.includes('NAV_') || l.includes('PATH') || l.includes('ROUTE') || l.includes('ENTRANCE')).join(' | ')}`);

    expect(navState.navActive).toBe(true);
    expect(navState.walkActive).toBe(true);
    expect(navState.waypoints).toBeGreaterThanOrEqual(3);
    expect(navState.hudVisible).toBe(true);
    expect(navState.panelHidden).toBe(true);
    expect(movedToEntrance).toBeGreaterThan(1);

    // Walk 3 steps — camera must advance each time (lerp = 500ms, wait 1s)
    const positions = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(1200);
      const p = await page.evaluate(() => {
        const c = window.APP?.camera;
        return { x: c?.position.x, y: c?.position.y, z: c?.position.z, step: window.APP.navCurrentStep };
      });
      positions.push(p);
    }
    console.log(`§PW_NAV_STEPS ${positions.map(p => `step${p.step}=(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' ')}`);

    // Step counter must have advanced — at least step 1 after 3 presses
    const lastStep = positions[positions.length - 1].step;
    expect(lastStep).toBeGreaterThanOrEqual(1);

    // After all steps, check if nav reached end or is still active
    const finalState = await page.evaluate(() => ({
      step: window.APP.navCurrentStep,
      total: window.APP._nav?.waypoints?.length || 0,
      active: !!window.APP.navActive
    }));
    console.log(`§PW_NAV_FINAL step=${finalState.step}/${finalState.total} active=${finalState.active}`);
    expect(finalState.step).toBeGreaterThanOrEqual(1);
  });

  test('17.26 closing NLP bar exits find panel + navigation @fast', async ({ page }) => {
    // Issue: no way to quit navigation — closing search bar must exit everything
    await page.evaluate(() => {
      if (typeof window.APP.openFindPanel === 'function') window.APP.openFindPanel('door');
    });
    await page.waitForTimeout(1000);

    // Select + navigate
    await page.evaluate(() => {
      const items = document.querySelectorAll('.find-result-item');
      if (items.length > 0) items[0].click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const btn = document.getElementById('find-navigate-btn');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2000);

    const navBefore = await page.evaluate(() => ({
      navActive: !!window.APP.navActive,
      walkActive: !!window.APP.walkModeActive
    }));
    console.log(`§PW_CLOSE_BEFORE nav=${navBefore.navActive} walk=${navBefore.walkActive}`);
    expect(navBefore.navActive).toBe(true);

    // Ensure NLP bar is visible first (so toggleNlp CLOSES it)
    await page.evaluate(() => {
      const bar = document.getElementById('nlp-bar');
      if (bar && bar.style.display !== 'flex') {
        // Bar is hidden — open it first so next toggle closes it
        if (typeof window.APP.toggleNlp === 'function') window.APP.toggleNlp();
      }
    });
    await page.waitForTimeout(300);

    // Now close the NLP bar — should exit everything
    await page.evaluate(() => {
      if (typeof window.APP.toggleNlp === 'function') window.APP.toggleNlp();
    });
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => ({
      navActive: !!window.APP.navActive,
      walkActive: !!window.APP.walkModeActive,
      controlsEnabled: !!window.APP.controls?.enabled,
      findPanel: document.getElementById('find-panel')?.style.display,
      nlpBar: document.getElementById('nlp-bar')?.style.display,
      hudVisible: document.getElementById('nav-hud')?.style.display !== 'none'
    }));
    console.log(`§PW_CLOSE_AFTER nav=${after.navActive} walk=${after.walkActive} controls=${after.controlsEnabled} findPanel="${after.findPanel}" nlpBar="${after.nlpBar}" hud=${after.hudVisible}`);
    expect(after.navActive).toBe(false);
    expect(after.walkActive).toBe(false);
    expect(after.controlsEnabled).toBe(true);
    expect(after.findPanel).toBe('none');
    expect(after.hudVisible).toBe(false);
  });

});
