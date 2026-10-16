#!/usr/bin/env node
// WITNESS — §R10 (bim-compiler prompts/CPE_4D_PERF_MEM_FINDINGS.md §7, extends R1's §MAXQ_STAGE_KEEP
// contract to the lens quad).
//
// ISSUE: the MaxQ bake tore down and rebuilt §GLOW_LENS_QUAD's InstancedMesh (rect+round) from
// scratch EVERY frame, even though the quad's geometry is built purely from fixture world data +
// the TM-visibility gate — never from A.camera — so an unchanged visible-fixture count means an
// unchanged quad. The fix skips the dispose+rebuild when keepStaging is true, something is already
// staged, and the TM-visible fixture count hasn't moved since the last stage.
//
// GATES (run with BASE=origin/main for the RED side, FIX=this worktree):
//   G-BAKE-COMPLETES   both bakes finish, zero page errors.
//   G-LENS-POPULATION  baseline actually stages the lens quad at least once — if this is 0 the
//                      whole witness is VACUOUS (§CRISIS-class per WITNESS_INTERFACE_FRAMEWORK.md
//                      §4) and every other gate below means nothing.
//   G-LENS-CHURN-RED   baseline (unpatched) stages the quad on close to EVERY frame — the RED case
//                      this fix targets must actually reproduce, or the A/B proves nothing.
//   G-LENS-SKIP-FIRES  fix logs at least one "§GLOW_LENS_QUAD skip (count unchanged N)" line, and
//                      its total staged-count is far below baseline's — the skip actually engages.
//   G-LENS-FINAL-EQ    the LAST "staged rect=R round=Rd" line on each side reports the identical
//                      rect/round counts — the skip changed the cost, not the final answer.
//   G-LENS-TEARDOWN    a real end-of-bake exit (keepStaging=false) still removes the quad on the
//                      fix side — "§GLOW_LENS_QUAD removed" appears after the last MAXQ_FRAME line,
//                      so still-only content still never survives into navigation.
//   G-PERF             informational: frames captured, wall ms/frame both sides.
//
// PRECONDITIONS: BASE_PORT serves shipped origin/main (bim-ootb main, up to date), FIX_PORT serves
// this worktree. Duplex_extracted.db symlinked into both buildings/ dirs.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const BLD = 'Duplex';
const FIX_PORT = process.env.FIX_PORT || 8561;
const BASE_PORT = process.env.BASE_PORT || 8399;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForLog(logs, re, timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    const hit = logs.find(l => re.test(l));
    if (hit) return hit;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(300);
  }
}

// Same real user path R1's witness_maxq_stage_keep.js drives: open editor -> click OK -> bake
// continues WITH buildup (default-on) -> run to §MAXQ_DONE/§MAXQ_WEBM. fps=1 keeps frame count small.
async function bake(browser, port, logs, errs) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => { errs.push(e.message); logs.push('PAGEERROR ' + e.message); });
  await page.goto(`http://localhost:${port}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.APP && window.APP.cinemaPathPlan && window.APP.cinemaPathEditor &&
          window.APP.startMaxQualityOrbit && window.APP._composer,
    { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1, editor: true, forceWebm: true }); });
  await page.waitForSelector('#cpe-ok', { timeout: 300000 });
  await sleep(1500);
  const t0 = Date.now();
  await page.evaluate(() => { document.getElementById('cpe-ok').click(); });
  const done = await waitForLog(logs, /§MAXQ_(DONE|WEBM|MP4)\b/, 1200000);
  const wallMs = Date.now() - t0;
  await page.close();
  return { done, wallMs };
}

function tally(logs) {
  const frames = logs.filter(l => /§MAXQ_FRAME i=/.test(l)).length;
  const staged = logs.filter(l => /§GLOW_LENS_QUAD staged rect=/.test(l));
  const removed = logs.filter(l => /§GLOW_LENS_QUAD removed/.test(l)).length;
  const skip = logs.filter(l => /§GLOW_LENS_QUAD skip \(count unchanged/.test(l)).length;
  const lastStaged = staged.length ? staged[staged.length - 1] : null;
  const lastStagedMatch = lastStaged ? lastStaged.match(/rect=(\d+) round=(\d+)/) : null;
  // Find the index of the LAST §MAXQ_FRAME line vs the LAST "removed" line, to confirm end-of-bake
  // teardown happens AFTER the frame loop, not mid-bake.
  const lastFrameIdx = logs.map((l, i) => /§MAXQ_FRAME i=/.test(l) ? i : -1).filter(i => i >= 0).pop();
  const lastRemovedIdx = logs.map((l, i) => /§GLOW_LENS_QUAD removed/.test(l) ? i : -1).filter(i => i >= 0).pop();
  return {
    frames, staged: staged.length, removed, skip,
    lastRectRound: lastStagedMatch ? { rect: +lastStagedMatch[1], round: +lastStagedMatch[2] } : null,
    teardownAfterLastFrame: lastFrameIdx !== undefined && lastRemovedIdx !== undefined && lastRemovedIdx > lastFrameIdx
  };
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 1200000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader']
  });
  const checks = [];
  const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log((ok ? 'PASS ' : 'FAIL ') + n + ' — ' + d); };
  try {
    const bLogs = [], bErrs = [];
    const b = await bake(browser, BASE_PORT, bLogs, bErrs);
    const bt = tally(bLogs);
    console.log('§WITNESS_BASELINE done=' + !!b.done + ' frames=' + bt.frames + ' wallMs=' + b.wallMs +
      ' lensStaged=' + bt.staged + ' lensRemoved=' + bt.removed + ' lensSkip=' + bt.skip);

    const fLogs = [], fErrs = [];
    const f = await bake(browser, FIX_PORT, fLogs, fErrs);
    const ft = tally(fLogs);
    console.log('§WITNESS_FIX done=' + !!f.done + ' frames=' + ft.frames + ' wallMs=' + f.wallMs +
      ' lensStaged=' + ft.staged + ' lensRemoved=' + ft.removed + ' lensSkip=' + ft.skip);

    P('G-BAKE-COMPLETES', !!b.done && !!f.done && bErrs.length === 0 && fErrs.length === 0,
      `baseline=${b.done ? 'done' : 'TIMEOUT'} fix=${f.done ? 'done' : 'TIMEOUT'} pageerrors=${bErrs.length}/${fErrs.length}`);
    P('G-LENS-POPULATION', bt.staged > 0,
      bt.staged > 0 ? `baseline staged ${bt.staged} times — real population, not vacuous`
                    : 'VACUOUS — baseline never staged the lens quad; Duplex may have no qualifying fixtures for this witness');
    P('G-LENS-CHURN-RED', bt.staged >= bt.frames - 2,
      `baseline lensStaged=${bt.staged} frames=${bt.frames} — the RED case (stage-every-frame) must actually reproduce`);
    P('G-LENS-SKIP-FIRES', ft.skip > 0 && ft.staged < bt.staged,
      `fix lensSkip=${ft.skip} lensStaged=${ft.staged} vs baseline lensStaged=${bt.staged}`);
    P('G-LENS-FINAL-EQ',
      !!bt.lastRectRound && !!ft.lastRectRound &&
      bt.lastRectRound.rect === ft.lastRectRound.rect && bt.lastRectRound.round === ft.lastRectRound.round,
      `baseline last=${JSON.stringify(bt.lastRectRound)} fix last=${JSON.stringify(ft.lastRectRound)}`);
    P('G-LENS-TEARDOWN', ft.teardownAfterLastFrame,
      `fix: last §GLOW_LENS_QUAD removed occurs after the last §MAXQ_FRAME line = ${ft.teardownAfterLastFrame}`);
    P('G-PERF', true,
      `informational: baseline ${Math.round(b.wallMs / Math.max(1, bt.frames))}ms/frame vs fix ${Math.round(f.wallMs / Math.max(1, ft.frames))}ms/frame (Duplex, swiftshader — direction only, GPU-blind)`);
  } catch (e) {
    P('G-INFRA', false, e.message);
  } finally {
    const pass = checks.filter(c => c.ok).length;
    console.log(`\n§GLOW_LENS_STAGE_KEEP WITNESS ${pass}/${checks.length} PASS`);
    await browser.close();
    process.exit(pass === checks.length ? 0 : 1);
  }
})();
