// 38-s254-strip-playback.spec.js — S254 §5: Verify 4D playback controls stripped from boq_charts
// Bugs prevented:
//   S254-1 Play/Stop/Speed buttons still present after strip — stale DOM
//   S254-2 Scrub line/handle/tooltip DOM elements remain — orphaned overlays
//   S254-3 Gantt chart 9 code removed by over-eager strip — source check
//   S254-4 4D_HIGHLIGHT click handler removed — needed for bar→viewer highlight
//   S254-5 Playback functions (applyScrub, startPlayTimer) still in source
//   S254-6 BroadcastChannel or ping/pong removed — needed for chart data relay

const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');
const fs = require('fs');
const path = require('path');

const BOQ_URL = '/bim-ootb/viewer/boq_charts.html?db=/buildings/Duplex_extracted.db&lib=/buildings/Duplex_library.db&bld=Ifc2x3_Duplex_Architecture';
const BOQ_SRC = fs.readFileSync(path.join(__dirname, '../../viewer/boq_charts.html'), 'utf8');

async function waitForCharts(page) {
  await page.waitForFunction(() => {
    const info = document.getElementById('info');
    return info && !info.textContent.includes('Loading') && info.textContent.length > 0;
  }, { timeout: 45000 });
}

test.describe('S254 §5 — Strip 4D Playback from boq_charts', () => {

  // ── DOM-level tests (browser) ──

  test('38.1 No Play/Stop buttons in DOM @slow', async ({ page }) => {
    await page.goto(BOQ_URL);
    await waitForCharts(page);

    const buttons = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      return btns.map(b => b.textContent.trim());
    });

    console.log(`§PW_S254_BUTTONS count=${buttons.length} labels=[${buttons.join(',')}]`);
    const hasPlay = buttons.some(b => b.includes('Play'));
    const hasStop = buttons.some(b => b.includes('Stop'));
    const hasPause = buttons.some(b => b.includes('Pause'));
    expect(hasPlay, 'Play button should be removed').toBe(false);
    expect(hasStop, 'Stop button should be removed').toBe(false);
    expect(hasPause, 'Pause button should be removed').toBe(false);
  });

  test('38.2 No scrub overlays (line/handle/tooltip) in DOM @slow', async ({ page }) => {
    await page.goto(BOQ_URL);
    await waitForCharts(page);

    const overlays = await page.evaluate(() => {
      const absDivs = [...document.querySelectorAll('div[style*="position:absolute"]')];
      const scrubLike = absDivs.filter(d => {
        const s = d.style.cssText;
        return s.includes('ew-resize') || s.includes('rgba(255,140,0') || s.includes('pointer-events:none');
      });
      return scrubLike.length;
    });

    console.log(`§PW_S254_OVERLAYS scrub_like_divs=${overlays}`);
    expect(overlays, 'Scrub overlays should be removed').toBe(0);
  });

  test('38.3 No speed selector in DOM @slow', async ({ page }) => {
    await page.goto(BOQ_URL);
    await waitForCharts(page);

    const selects = await page.evaluate(() => {
      const sels = [...document.querySelectorAll('select')];
      return sels.map(s => {
        const opts = [...s.options].map(o => o.textContent);
        return { opts };
      });
    });

    console.log(`§PW_S254_SELECTS count=${selects.length}`);
    const hasSpeed = selects.some(s => s.opts.some(o => /^\d+×$/.test(o)));
    expect(hasSpeed, 'Speed selector should be removed').toBe(false);
  });

  // ── Source-level tests (file content) — chart 9 deferred render can't trigger reliably in headless ──

  test('38.4 Source: playback functions removed @fast', async () => {
    const removed = ['applyScrub', 'startPlayTimer', 'updateResPanel', 'pixelToDay',
                     'dayToPixel', 'dayToTaskIndex', 'tasksAtDay', '_scrubActive',
                     '_playTimer', '_playing', '_playActivated'];

    const found = removed.filter(fn => BOQ_SRC.includes(fn));
    console.log(`§PW_S254_SRC_STRIP removed_check=${removed.length} still_found=${found.length} names=[${found.join(',')}]`);
    expect(found.length, 'Playback functions must be stripped: ' + found.join(', ')).toBe(0);
  });

  test('38.5 Source: Gantt chart 9 still present @fast', async () => {
    const hasChart9 = BOQ_SRC.includes("logChart(9,");
    const hasGanttTasks = BOQ_SRC.includes('ganttTasks');
    const hasChartBar = BOQ_SRC.includes("type:'bar'");

    console.log(`§PW_S254_SRC_GANTT chart9=${hasChart9} ganttTasks=${hasGanttTasks} bar=${hasChartBar}`);
    expect(hasChart9, 'logChart(9,...) must remain').toBe(true);
    expect(hasGanttTasks, 'ganttTasks array must remain').toBe(true);
  });

  test('38.6 Source: 4D_HIGHLIGHT click handler kept @fast', async () => {
    const hasHighlight = BOQ_SRC.includes("'4D_HIGHLIGHT'");
    const hasClickHandler = BOQ_SRC.includes("ganttCanvas.addEventListener('click'");

    console.log(`§PW_S254_SRC_HIGHLIGHT highlight=${hasHighlight} click=${hasClickHandler}`);
    expect(hasHighlight, '4D_HIGHLIGHT message must remain').toBe(true);
    expect(hasClickHandler, 'Gantt click handler must remain').toBe(true);
  });

  test('38.7 Source: BroadcastChannel + ping/pong kept @fast', async () => {
    const hasChannel = BOQ_SRC.includes("new BroadcastChannel('bim_4d')");
    const hasPing = BOQ_SRC.includes("'4D_PING'");
    const hasPong = BOQ_SRC.includes("'4D_PONG'");

    console.log(`§PW_S254_SRC_CHANNEL channel=${hasChannel} ping=${hasPing} pong=${hasPong}`);
    expect(hasChannel, 'BroadcastChannel must remain').toBe(true);
    expect(hasPing, '4D_PING must remain').toBe(true);
    expect(hasPong, '4D_PONG must remain').toBe(true);
  });

  test('38.8 Source: §S254_STRIP_DONE log present @fast', async () => {
    const hasStripLog = BOQ_SRC.includes('§S254_STRIP_DONE');
    const hasPlaybackRemoved = BOQ_SRC.includes('playback_removed=true');

    console.log(`§PW_S254_SRC_STRIPLOG tag=${hasStripLog} flag=${hasPlaybackRemoved}`);
    expect(hasStripLog, '§S254_STRIP_DONE log must be in source').toBe(true);
    expect(hasPlaybackRemoved, 'playback_removed=true must be in source').toBe(true);
  });

  test('38.9 Source: 4D_PLAY/SEEK/PAUSE messages removed @fast', async () => {
    // These playback-control messages should be gone
    // Note: 4D_PLAY as a string might still appear in comments — check for postMessage usage
    const has4DPlay = /postMessage\([^)]*4D_PLAY/.test(BOQ_SRC);
    const has4DSeek = /postMessage\([^)]*4D_SEEK/.test(BOQ_SRC);
    const has4DPause = /postMessage\([^)]*4D_PAUSE/.test(BOQ_SRC);
    const has4DResources = /postMessage\([^)]*4D_RESOURCES[^_]/.test(BOQ_SRC);

    console.log(`§PW_S254_SRC_MESSAGES play=${has4DPlay} seek=${has4DSeek} pause=${has4DPause} resources=${has4DResources}`);
    expect(has4DPlay, '4D_PLAY postMessage must be removed').toBe(false);
    expect(has4DSeek, '4D_SEEK postMessage must be removed').toBe(false);
    expect(has4DPause, '4D_PAUSE postMessage must be removed').toBe(false);
    expect(has4DResources, '4D_RESOURCES postMessage must be removed').toBe(false);
  });

});
