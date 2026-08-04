// WITNESS — §CPE_HOSE_LENGTH_BLIND: the editor's clock must cost the curve that actually flies.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_REOPEN_PATHLEN.
//
// THE DEFECT THIS PROVES OR DISPROVES (found 2026-07-31 by reading the user's own saved record out
// of IndexedDB: `_pathLen` stored 107.5m, the same record re-opened as `pathLen` 173.5m, +61%, same
// 3 bands and same 7 hose ops with all anchors intact):
// `_flownLength()` measured `cinemaBandFlow(bands)` — the RAW band flow, hose never applied — while
// the bake measures the DEFORMED curve (effects.js:4936 -> :5004). Both numbers were correct
// measurements of DIFFERENT curves, and the editor was costing the one that is never flown.
// The number is the small half: `_naturalDuration()` divides that short length by the walk speed and
// `_buildOverride` stores it as `_total`, which the bake honours as an override — so the user's film
// ran `natural=145.0s ... override=true running=92.4s`, i.e. 1.57x faster than the 2.3 m/s walk it
// claims. Every hose pull silently bought SPEED instead of TIME.
//
//   G-HL-1  control: with NO hose ops, raw == hosed == the clock's length. Proves the instrument
//           reads zero when there is nothing to miss (a gate that cannot go green for the wrong
//           reason later).
//   G-HL-2  a real 20px pipe drag DEFORMS the curve: hosed > raw by a measurable margin. If this is
//           flat the rest of the run proves nothing — it is the precondition, not a product claim.
//   G-HL-3  RED on origin/main. After that drag the editor's clock costs the HOSED curve, not the
//           raw one: natural == hosed, not natural == raw.
//   G-HL-4  the claim that matters — editor and bake agree. The override the editor hands over is
//           planned here, and `plan.pathLen` must equal the editor's own `natural` length. This is
//           measured by planning the SAME object the bake gets, not by asking the editor twice.
//   G-HL-5  and the consequence: the stored `_total` must be the natural duration of the flown path,
//           so the bake does not have to speed the walk up to meet a duration costed on a shorter
//           curve. `_total` == plan-length / walk-speed, within the editor's own pacing tolerance.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8438;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HANDLE_CLEAR_PX = 26;

async function newPage(browser, BLD) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.APP && window.APP.cinemaPathEditor && window.APP.startMaxQualityOrbit && window.APP._composer,
    { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1, frames: 4, editor: true }); });
  await page.waitForSelector('#cpe-ok', { timeout: 300000 });
  await sleep(800);
  return { page, logs };
}

// See witness_cpe_click_slop.js for why both of these exist: the editor opens at the orbit pose
// where the whole walk projects inside the handles' GRAB_PX radius, so without them every gesture
// resolves to a handle drag and no hose op ever lands.
async function lookCloser(page) {
  await page.evaluate(() => {
    const A = window.APP, hs = A.cinemaPathEditor._probeHandles();
    if (!hs || !hs.length) return;
    const mid = hs[Math.floor(hs.length / 2)];
    A.controls.target.set(mid.x, mid.y, mid.z3);
    A.camera.position.set(mid.x + 7, mid.y + 6, mid.z3 + 7);
    A.controls.update();
    if (A.markDirty) A.markDirty();
  });
  await sleep(700);
}

async function findPipePixel(page) {
  for (let f = 0.02; f <= 0.98; f += 0.01) {
    const spot = await page.evaluate((f, clear) => {
      const cpe = window.APP.cinemaPathEditor;
      const p = cpe._pipePixel(f);
      if (!p || !cpe._probePipe(p.x, p.y)) return null;
      let near = 1e9;
      (cpe._probeHandles() || []).forEach(h => {
        if (h.px != null) near = Math.min(near, Math.hypot(h.px - p.x, h.py - p.y));
      });
      if (near < clear) return null;
      if (document.elementFromPoint(p.x, p.y) !== window.APP.canvas) return null;
      return { px: p.x, py: p.y, frac: f };
    }, f, HANDLE_CLEAR_PX);
    if (spot) return spot;
  }
  return null;
}

const lengths = page => page.evaluate(() => window.APP.cinemaPathEditor._probeLengths());

async function gates(browser, BLD) {
  const checks = [];
  const P = (n, ok, d) => { checks.push({ n, ok, d }); console.log(`  ${ok ? '✅' : '❌'} ${n}\n        ${d}`); };
  const { page, logs } = await newPage(browser, BLD);
  await lookCloser(page);

  // ── G-HL-1: control, nothing pulled yet ───────────────────────────────────────────────────
  const L0 = await lengths(page);
  P('G-HL-1 control: with no hose ops the two curves are the same and the clock costs it',
    L0.ops === 0 && Math.abs(L0.raw - L0.hosed) < 1e-6 && Math.abs(L0.natural - L0.raw) < 1e-6,
    `ops=${L0.ops} raw=${L0.raw.toFixed(2)}m hosed=${L0.hosed.toFixed(2)}m clock=${L0.natural.toFixed(2)}m`);

  const spot = await findPipePixel(page);
  if (!spot) { P('G-HL-0 the pipe is reachable', false, 'no usable pipe pixel — INCONCLUSIVE'); await page.close(); return checks; }

  // ── a real 20px drag == a hose bend (§CPE_CLICK_SLOP: >4px is a drag, not a click) ─────────
  await page.mouse.move(spot.px, spot.py);
  await page.mouse.down();
  for (let i = 1; i <= 4; i++) { await page.mouse.move(spot.px + (20 * i) / 4, spot.py); await sleep(40); }
  await sleep(60);
  await page.mouse.up();
  await sleep(1200);

  const L1 = await lengths(page);
  P('G-HL-2 precondition: the drag actually deformed the curve',
    L1.ops === 1 && L1.hosed > L1.raw + 0.05,
    `ops=${L1.ops} raw=${L1.raw.toFixed(2)}m hosed=${L1.hosed.toFixed(2)}m (+${(L1.hosed - L1.raw).toFixed(2)}m)`);

  const dRaw = Math.abs(L1.natural - L1.raw), dHosed = Math.abs(L1.natural - L1.hosed);
  P('G-HL-3 the clock costs the FLOWN curve, not the undeformed one',
    dHosed < 1e-6 && dRaw > 0.05,
    `clock=${L1.natural.toFixed(2)}m  |clock-hosed|=${dHosed.toFixed(4)}m  |clock-raw|=${dRaw.toFixed(2)}m ` +
    `(RED on origin/main: clock tracks raw, off by ${dRaw.toFixed(2)}m here)`);

  // ── G-HL-4: plan the SAME override the bake gets, and compare ──────────────────────────────
  const cmp = await page.evaluate(() => {
    const A = window.APP, ov = A.cinemaPathEditor._probeOverride();
    const plan = A.cinemaPathPlan(ov._total, ov);
    return { planLen: plan.pathLen, total: ov._total, route: plan.route,
             walkMps: plan.pathLen / (plan.sec.out || 1) };
  });
  // Tolerance is TIGHT on purpose: at 0.5m absolute this gate passed on the RED build too (Duplex's
  // 20px drag only deforms 0.48m), which would have made it a decoration. Both sides measure the
  // same polyline when correct, so anything above float noise is a real disagreement.
  const TOL4 = Math.max(0.01, 0.0005 * cmp.planLen);
  P('G-HL-4 editor and bake agree on how long the path is',
    Math.abs(cmp.planLen - L1.natural) < TOL4,
    `editor clock=${L1.natural.toFixed(2)}m  bake plan.pathLen=${cmp.planLen.toFixed(2)}m  ` +
    `diff=${Math.abs(cmp.planLen - L1.natural).toFixed(4)}m (tol ${TOL4.toFixed(4)}m)  route=${cmp.route}`);

  // The duration the bake honours as an override. It must be derived from the FLOWN length —
  // `total = baseTotal - baseOutSec + len/speed` — or the walk is squeezed into a duration costed
  // on a shorter curve, which is exactly what made the user's 145.0s path run in 92.4s.
  const wantHosed = L1.baseTotal - L1.baseOutSec + L1.hosed / L1.speed;
  const wantRaw = L1.baseTotal - L1.baseOutSec + L1.raw / L1.speed;
  P('G-HL-5 the stored duration is costed on the flown curve (this is what squeezed the walk)',
    Math.abs(cmp.total - wantHosed) < 0.05 && Math.abs(wantHosed - wantRaw) > 0.05,
    `_total=${cmp.total.toFixed(2)}s  from-hosed=${wantHosed.toFixed(2)}s  from-raw=${wantRaw.toFixed(2)}s  ` +
    `(costing the raw curve would have asked for ${(wantRaw / wantHosed * 100).toFixed(1)}% of the time the flown path needs)`);

  await page.close();
  return checks;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = await gates(browser, BLD);
    const pass = checks.filter(c => c.ok).length;
    console.log(`\n  ${BLD}: ${pass}/${checks.length}`);
    if (pass !== checks.length || !checks.length) allPass = false;
  }
  await browser.close();
  console.log(allPass ? '\nALL GREEN' : '\nRED');
  process.exit(allPass ? 0 : 1);
})();
