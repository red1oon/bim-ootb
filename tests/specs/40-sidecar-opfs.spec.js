// 40-sidecar-opfs.spec.js — ANALYSIS_SIDECAR.md §T5 — W-OPFS-ROUNDTRIP
// Proves the OPFS lazy-bake round-trip IN A REAL BROWSER (OPFS does not exist in
// node, so this is the authoritative T5 witness — §-log proves the logic; this
// proves the persistence actually engages):
//   First open  → sidecar MISS → compute + persist  (§5D/§4D_SIDECAR source=computed baked=true)
//   Reload      → sidecar HIT  → read from OPFS      (§5D/§4D_SIDECAR source=opfs)
const { test, expect } = require('@playwright/test');
const { ConsoleLogs } = require('../helpers/console-capture');

const BOQ_URL = '/dev/boq_charts.html?db=/buildings/Duplex_extracted.db&lib=/buildings/Duplex_library.db&bld=Ifc2x3_Duplex_Architecture';

async function waitLoaded(page) {
  await page.waitForFunction(() => {
    const i = document.getElementById('info');
    return i && !i.textContent.includes('Loading') && i.textContent.length > 0;
  }, { timeout: 45000 });
  // get5D/get4D are awaited during init; allow the OPFS write to settle.
  await page.waitForTimeout(500);
}

test.describe('Analysis Sidecar OPFS round-trip (T5)', () => {

  test('40.1 first open computes+bakes, reload reads OPFS @slow', async ({ page }) => {
    // Guarantee a cold start: wipe the OPFS analysis dir first.
    await page.goto('/dev/boq_charts.html');
    await page.evaluate(async () => {
      try {
        const root = await navigator.storage.getDirectory();
        await root.removeEntry('bim_analysis', { recursive: true });
      } catch (e) { /* absent → already cold */ }
    });

    // ── First open: MISS → compute + persist ──
    const logs1 = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitLoaded(page);
    const first5d = logs1.tagged('§5D_SIDECAR').map(e => e.text).join(' | ');
    const first4d = logs1.tagged('§4D_SIDECAR').map(e => e.text).join(' | ');
    console.log('§PW_SIDECAR_FIRST 5d="' + first5d + '" 4d="' + first4d + '"');
    expect(first5d).toMatch(/source=computed.*baked=true/);
    expect(first4d).toMatch(/source=computed.*baked=true/);

    // ── Reload: HIT → read OPFS ──
    const logs2 = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitLoaded(page);
    const second5d = logs2.tagged('§5D_SIDECAR').map(e => e.text).join(' | ');
    const second4d = logs2.tagged('§4D_SIDECAR').map(e => e.text).join(' | ');
    console.log('§PW_SIDECAR_RELOAD 5d="' + second5d + '" 4d="' + second4d + '"');
    expect(second5d).toMatch(/source=opfs/);
    expect(second4d).toMatch(/source=opfs/);
  });

  test('40.2 Gantt renders from CPM default with no kernel_ops (regression guard) @slow', async ({ page }) => {
    // Duplex has no kernel_ops + no native tasks → schedule MUST come from the CPM
    // default (source=generated), never a broken/empty Gantt (the T4 decouple).
    const logs = new ConsoleLogs(page);
    await page.goto(BOQ_URL);
    await waitLoaded(page);
    const src = logs.tagged('§4D_SCHEDULE_SOURCE').map(e => e.text).join(' | ');
    console.log('§PW_4D_SOURCE "' + src + '"');
    expect(src).toMatch(/generated|captured/);   // a valid default, never an empty break
    logs.assertNoErrors();
  });
});
