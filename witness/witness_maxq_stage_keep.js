#!/usr/bin/env node
// WITNESS — §MAXQ_STAGE_KEEP (R1, bim-compiler prompts/CPE_4D_PERF_MEM_FINDINGS.md §2c/§3-R1).
//
// ISSUE: the MaxQ bake tore down and rebuilt the ENTIRE photo staging (ground/puddles/HDRI/fog/
// sky) on EVERY captured frame — plus a 250ms SETTLE_MS sleep per frame guarding against capturing
// mid-restore values — the measured §BAKE_FAST_PATH_COST "~660ms/frame unaccounted staging churn"
// (~9 min of a 21.6-min Hospital bake). #1300's §SHADOW_FRONTIER_AT_CAPTURE additionally ran a
// full scene.traverse with linear batch-meta scans per frame. The fix keeps staging alive across
// frames (keepStaging), sleeps only when staging is actually down, and answers the frontier check
// from a per-_metaGen guid→object index.
//
// ISSUE EACH GATE PROVES OR DISPROVES (run with BASE=1 against unpatched code for the RED side):
//   G-STAGE-ONCE   §PHOTO_STAGING applied EXACTLY ONCE for an N-frame bake (fix). On unpatched
//                  code it applies ~N times — if this gate passes there too, it proves nothing;
//                  the A/B run is the witness, not this single count.
//   G-STAGE-KEPT   the per-frame stop logs "(staging kept)" — the keepStaging path actually ran
//                  (not just an accidental single staging via some other route).
//   G-SUN-ARC      §SUN_ARC_STEP elevation still CHANGES per frame with staging kept — the
//                  per-frame sun (the whole point of e313fc5) survived the optimization.
//   G-RESTORE      after the bake finishes, _photoStagingOn === false — the end-of-bake teardown
//                  still restores the scene (fog/sun/ground back).
//   G-FRONTIER-EQ  (editor+buildup path) §SHADOW_FRONTIER_AT_CAPTURE per-frame count lines are
//                  BYTE-IDENTICAL between baseline (port 8399, origin/main traverse) and fix
//                  (port 8517, indexed) — the refactor changed the cost, not one answer.
//   G-PERF         informational: frames captured, wall ms/frame both sides — the before/after.
//
// PRECONDITIONS: two static serves — 8399 = /tmp/wt-sandbox (origin/main baseline),
// 8517 = /tmp/wt-bake-stage (the fix). Duplex_extracted.db symlinked into both buildings/ dirs.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const BLD = 'Duplex';
const FIX_PORT = process.env.FIX_PORT || 8517;
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

// Drive the REAL user path: open editor → click OK → bake continues WITH buildup (default-on),
// run to §MAXQ_DONE/§MAXQ_WEBM. forceWebm skips mp4. fps=1 keeps the frame count small (plan
// duration in seconds ≈ frame count).
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
  const stagingOn = await page.evaluate(() => !!window.APP._photoStagingOn);
  await page.close();
  return { done, wallMs, stagingOn };
}

function tally(logs) {
  const stagingApplied = logs.filter(l => /§PHOTO_STAGING on\b/.test(l)).length;
  const stagingSkipped = logs.filter(l => /§PHOTO_STAGING already on/.test(l)).length;
  const kept = logs.filter(l => /§STILL_REFINE .*\(staging kept\)/.test(l)).length;
  const arc = logs.filter(l => /§SUN_ARC_STEP/.test(l))
    .map(l => parseFloat((l.match(/elevation=([-\d.]+)/) || [])[1])).filter(Number.isFinite);
  const frontier = logs.filter(l => /§SHADOW_FRONTIER_AT_CAPTURE/.test(l))
    .map(l => l.replace(/^.*§SHADOW/, '§SHADOW').trim());
  const frames = logs.filter(l => /§MAXQ_FRAME i=/.test(l)).length;
  return { stagingApplied, stagingSkipped, kept, arc, frontier, frames };
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
    // ── baseline side (origin/main) ──
    const bLogs = [], bErrs = [];
    const b = await bake(browser, BASE_PORT, bLogs, bErrs);
    const bt = tally(bLogs);
    console.log('§WITNESS_BASELINE done=' + !!b.done + ' frames=' + bt.frames + ' wallMs=' + b.wallMs +
      ' stagingApplied=' + bt.stagingApplied + ' frontierLines=' + bt.frontier.length);
    // ── fix side ──
    const fLogs = [], fErrs = [];
    const f = await bake(browser, FIX_PORT, fLogs, fErrs);
    const ft = tally(fLogs);
    console.log('§WITNESS_FIX done=' + !!f.done + ' frames=' + ft.frames + ' wallMs=' + f.wallMs +
      ' stagingApplied=' + ft.stagingApplied + ' stagingSkipped=' + ft.stagingSkipped + ' kept=' + ft.kept);

    P('G-BAKE-COMPLETES', !!b.done && !!f.done && bErrs.length === 0 && fErrs.length === 0,
      `baseline=${b.done ? 'done' : 'TIMEOUT'} fix=${f.done ? 'done' : 'TIMEOUT'} pageerrors=${bErrs.length}/${fErrs.length}`);
    // First run of this witness (2026-08-12) FAILed here at fix=2: the pre-bake still-photo phase
    // (cinema_maxq.js:1131 startStillRefine → :1150 stopStillRefine(true), BEFORE the frame loop)
    // legitimately applies + fully tears down staging once — that phase is untouched by the fix.
    // The contract is "the FRAME LOOP applies staging once, not once per frame": pre-phase + loop
    // = ≤2 total, and the per-frame class (≈1 per frame on baseline) must be gone.
    P('G-STAGE-ONCE', ft.stagingApplied <= 2 && bt.stagingApplied >= ft.frames &&
      (bt.stagingApplied - ft.stagingApplied) >= ft.frames - 2,
      `fix stagingApplied=${ft.stagingApplied} (pre-phase + one per bake, want <=2), baseline=${bt.stagingApplied} (≈once per frame — the RED side)`);
    P('G-STAGE-KEPT', ft.kept >= Math.max(1, ft.frames - 2) && bt.kept === 0,
      `fix "(staging kept)" lines=${ft.kept} frames=${ft.frames}; baseline kept=${bt.kept}`);
    const arcSpread = a => a.length >= 2 ? Math.abs(a[a.length - 1] - a[0]) : 0;
    P('G-SUN-ARC', ft.arc.length >= 2 && arcSpread(ft.arc) > 0.5 &&
      Math.abs(arcSpread(ft.arc) - arcSpread(bt.arc)) < 0.11,
      `fix arc ${ft.arc[0]}→${ft.arc[ft.arc.length - 1]} (n=${ft.arc.length}), baseline spread=${arcSpread(bt.arc).toFixed(1)}`);
    P('G-RESTORE', f.stagingOn === false, `_photoStagingOn after bake=${f.stagingOn}`);
    const eq = bt.frontier.length === ft.frontier.length &&
      bt.frontier.every((l, i) => l === ft.frontier[i]);
    P('G-FRONTIER-EQ', bt.frontier.length > 0 && eq,
      `lines base=${bt.frontier.length} fix=${ft.frontier.length} identical=${eq}` +
      (eq ? '' : ' firstDiff=' + JSON.stringify([bt.frontier.find((l, i) => l !== ft.frontier[i]), ft.frontier.find((l, i) => l !== bt.frontier[i])])));
    P('G-PERF', true, `informational: baseline ${Math.round(b.wallMs / Math.max(1, bt.frames))}ms/frame vs fix ${Math.round(f.wallMs / Math.max(1, ft.frames))}ms/frame (Duplex, swiftshader — direction only, GPU-blind)`);
  } catch (e) {
    P('G-INFRA', false, e.message);
  } finally {
    const pass = checks.filter(c => c.ok).length;
    console.log(`\n§MAXQ_STAGE_KEEP WITNESS ${pass}/${checks.length} PASS`);
    await browser.close();
    process.exit(pass === checks.length ? 0 : 1);
  }
})();
