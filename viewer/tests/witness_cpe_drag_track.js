// WITNESS — §CPE_DRAG_TRACK: does the handle stay under the cursor?
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_DRAG_SCALE / §CPE_DRAG_TRACK.
//
// THE ISSUE THIS PROVES OR DISPROVES (user, live on origin/main AFTER the merge, 2026-07-27):
//   "i checked the last session solving the jumping waypoints, it is much better, as it delays the
//    path but the wpts still jumpy but its more intuitive to handle"
// §CPE_DRAG_LAND_FIRST landed ("it delays the path") and §CPE_BASIS_HALF_PIN landed, yet the drag
// still does not feel exact. Both of those removed a re-plan running under the gesture; NEITHER
// touched the pixels->metres mapping. §CPE_DRAG_SCALE replaced the old perspective mapping
// (ray x plane-through-the-handle, world-m/px = handle depth / focal length) with a building-derived
// constant:
//       m/px = envelope / canvasHeightPx
// That bought identical gearing across buildings, which is what it was asked for. But a constant
// rate equals the perspective rate at exactly ONE depth. At any other depth the handle CANNOT stay
// under the cursor — it lags or races — and cinema_path_editor.js's own §CPE_DRAG_REACH note states
// the invariant it must not break: "Direct manipulation has ONE invariant: the thing you grabbed
// stays under the cursor."
//
// So this witness measures the two properties against each other, in numbers, and does NOT assume
// which one should win — that is the user's call and needs the numbers first:
//
//   G-TRACK-1  CURSOR LOCK — REPORT, NOT A GATE. Drag a band's middle by a known pixel delta, then
//              re-project the band's landed centre to screen. Residual px = |projected - cursor|.
//              Measured 2026-07-27: Duplex 102px behind a 194px gesture, Terminal 108px — 0.44-0.47x
//              on both. Shown those numbers the user RULED it is not a defect:
//                "I think it is fine.. the slight jump is no longer exagerated, it is in small
//                 measures so the user able to hold and see it coming back quicker than before. I see
//                 the effect is the path only follows after releasing the wypt which may still jump
//                 but in small leap which is more of a feature as user need not drag further on fear
//                 of losing to big jump."
//              So this asserts only that the ratio stays in the band that ruling describes: drift to
//              1.00x means §CPE_DRAG_TELEPORT's frightening leaps are back, drift to 0 means the drag
//              has died. The app logs the same quantity live as §CPE_DRAG_TRACK, derived
//              independently (gesture pixels + camera frustum), so the two can disagree.
//   G-TRACK-2  OUT-AND-BACK. Drag out, drag back to the same pixel. The centre must return EXACTLY
//              (the pure-delta invariant §CPE_DRAG_TELEPORT established). Independent of G-TRACK-1:
//              a wrong-but-linear rate still returns exactly.
//   G-TRACK-3  LANDING JUMP. The centre §CPE_DRAG logs on release (before _replanFilm) vs the centre
//              the rows show after it. Any difference means the re-plan wrote back into the authored
//              bands — the "jump after you let go" §CPE_HOLDER_INTEGRITY says cannot happen.
//   G-TRACK-4  GEARING CONSISTENCY. m/px as a fraction of the building envelope, across buildings.
//              Equal = what §CPE_DRAG_SCALE bought. Reported for the trade, not gated.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8402;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal').split(',');
const BAND = parseInt(process.env.BAND || '1', 10);   // 1 = the walk band (the one the user drags)
const sleep = ms => new Promise(r => setTimeout(r, ms));

const num = (l, re) => { const m = l && l.match(re); return m ? parseFloat(m[1]) : null; };
const last = (logs, re) => { const h = logs.filter(l => re.test(l)); return h.length ? h[h.length - 1] : null; };

async function openEditor(browser, BLD) {
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
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1 }); });
  await page.waitForSelector('#cpe-ok', { timeout: 300000 });
  await sleep(500);
  return { page, logs };
}

// The rows are the editor's own read-out of the authored band centres — [x, z, y, len].
const readBand = (page, i) => page.evaluate(b => {
  const ins = document.querySelectorAll('#cpe-rows > div')[b].querySelectorAll('input');
  return { x: parseFloat(ins[0].value), z: parseFloat(ins[1].value), y: parseFloat(ins[2].value),
           len: parseFloat(ins[3].value) };
}, i);

// Where a world point lands on screen, using the viewer's own camera and canvas rect — the same
// projection cinema_path_editor.js's _screenOf uses to decide what the cursor grabbed.
const screenOf = (page, p) => page.evaluate(pt => {
  const A = window.APP, V3 = A.camera.position.constructor;
  const v = new V3(pt.x, pt.y, pt.z).project(A.camera);
  const r = A.canvas.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height,
           behind: v.z > 1, depth: Math.hypot(pt.x - A.camera.position.x, pt.y - A.camera.position.y,
                                              pt.z - A.camera.position.z) };
}, p);

// A real gesture on the canvas: pointerdown on the handle, N intermediate moves, pointerup. Driven
// through the page's own event path (the listeners are on canvas/window, capture phase), so this is
// the user's path, not a call into a private function.
async function drag(page, from, steps) {
  await page.evaluate(p => {
    const c = window.APP.canvas;
    c.dispatchEvent(new PointerEvent('pointerdown', { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
  }, from);
  await sleep(60);
  for (const s of steps) {
    await page.evaluate(p => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y, bubbles: true, cancelable: true }));
    }, s);
    await sleep(30);
  }
  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
  });
  await sleep(900);      // the ONE re-plan §CPE_DRAG_LAND_FIRST defers to here
}

// A straight gesture from `from` to `to`, in `n` steps — how a hand actually moves, not one teleport.
const lerpSteps = (from, to, n) => Array.from({ length: n }, (_, i) => ({
  x: from.x + (to.x - from.x) * (i + 1) / n,
  y: from.y + (to.y - from.y) * (i + 1) / n,
}));

async function run(browser, BLD) {
  const { page, logs } = await openEditor(browser, BLD);
  const checks = [];
  const R = {};

  const c0 = await readBand(page, BAND);
  const s0 = await screenOf(page, c0);
  R.depth = s0.depth;

  // ── G-TRACK-1: drag the middle by a known pixel delta, then see where the handle ended up.
  const PIX = { dx: 160, dy: -110 };
  const target = { x: s0.x + PIX.dx, y: s0.y + PIX.dy };
  await drag(page, { x: s0.x, y: s0.y }, lerpSteps({ x: s0.x, y: s0.y }, target, 8));

  const c1 = await readBand(page, BAND);
  const landed = await screenOf(page, c1);
  R.residualPx = Math.hypot(landed.x - target.x, landed.y - target.y);
  R.pixLen = Math.hypot(PIX.dx, PIX.dy);
  R.worldLen = Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z);
  R.mpp = R.worldLen / R.pixLen;

  const grab = last(logs, /§CPE_DRAG_SCALE grab/);
  R.env = num(grab, /envelope ([\d.]+)m/);
  R.rateLogged = num(grab, /rate=([\d.]+) m\/px/);
  // What the perspective mapping would have given: the rate that keeps the handle under the cursor.
  // m/px at depth D for a vertical FOV f over H pixels = 2·D·tan(f/2) / H.
  R.mppPerspective = await page.evaluate(d => {
    const A = window.APP, r = A.canvas.getBoundingClientRect();
    return 2 * d * Math.tan(A.camera.fov * Math.PI / 180 / 2) / r.height;
  }, s0.depth);

  // G-TRACK-1 is a REPORT, not a gate — see the ruling in the header. What it watches for is DRIFT:
  // back toward 1.00x means the big leaps have returned, toward 0 means the drag has stopped
  // responding. Both ends are bounded generously; the middle is where the user asked it to sit.
  R.ratio = R.rateLogged / R.mppPerspective;
  checks.push({ n: 'G-TRACK-1 the drag stays under-geared, in the band the user ruled for (report)',
    ok: R.ratio > 0.20 && R.ratio < 0.85,
    d: `gesture ${R.pixLen.toFixed(0)}px -> ${R.worldLen.toFixed(2)}m at ${R.mpp.toFixed(4)} m/px\n` +
       `          handle landed ${R.residualPx.toFixed(1)}px from the cursor ` +
       `(${(R.residualPx / R.pixLen * 100).toFixed(0)}% of the gesture) — the small, recoverable leap, by design\n` +
       `          rate in force ${R.rateLogged} m/px (envelope ${R.env}m / 700px) vs ` +
       `${R.mppPerspective.toFixed(4)} m/px needed at this handle's depth ${s0.depth.toFixed(0)}m ` +
       `— ratio ${R.ratio.toFixed(2)}x (must stay in 0.20-0.85; 1.00x = the big leaps are back)\n` +
       `          in-app: ${last(logs, /§CPE_DRAG_TRACK/) || '(no §CPE_DRAG_TRACK line — unpatched build)'}` });

  // ── G-TRACK-3: what the release logged vs what the rows show after the re-plan ran.
  const landedLog = last(logs, /§CPE_DRAG landed/);
  const lc = landedLog && landedLog.match(/centre=\(([-\d.]+),([-\d.]+),([-\d.]+)\)/);
  R.jump = lc ? Math.hypot(parseFloat(lc[1]) - c1.x, parseFloat(lc[2]) - c1.y, parseFloat(lc[3]) - c1.z) : null;
  checks.push({ n: 'G-TRACK-3 the re-plan on release does not move the band you just placed',
    ok: R.jump !== null && R.jump < 0.005,
    d: `on release §CPE_DRAG logged centre=(${lc ? lc.slice(1, 4).join(',') : 'n/a'}), ` +
       `after the re-plan the rows read (${c1.x},${c1.y},${c1.z}) — moved ${R.jump === null ? 'n/a' : R.jump.toFixed(4) + 'm'}` });

  // ── G-TRACK-2: out and back to the very same pixel must return the band exactly.
  const s1 = await screenOf(page, c1);
  const away = { x: s1.x - 130, y: s1.y + 90 };
  await drag(page, { x: s1.x, y: s1.y },
    lerpSteps({ x: s1.x, y: s1.y }, away, 6).concat(lerpSteps(away, { x: s1.x, y: s1.y }, 6)));
  const c2 = await readBand(page, BAND);
  R.residue = Math.hypot(c2.x - c1.x, c2.y - c1.y, c2.z - c1.z);
  checks.push({ n: 'G-TRACK-2 out-and-back to the same pixel leaves no residue',
    ok: R.residue < 0.01,
    d: `before (${c1.x},${c1.y},${c1.z}) -> after (${c2.x},${c2.y},${c2.z}) = ${R.residue.toFixed(4)}m residue`});

  await page.close();
  return { checks, R };
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    // Hospital blocks the JS thread far longer than puppeteer's 180s default while it plans, and a
    // blown protocolTimeout aborts the run mid-gate — which reads as a product failure and is not one.
    protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [], rates = [];

  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}  (band ${BAND})\n${'='.repeat(78)}`);
    const { checks, R } = await run(browser, BLD);
    checks.forEach(c => { if (!c.ok) allPass = false; console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`); });
    rates.push({ BLD, R });
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
  }

  // G-TRACK-4 is a REPORT, not a gate: it is the thing the current mapping bought, stated next to
  // what G-TRACK-1 says it cost, so the trade can be decided on numbers.
  console.log(`\n${'='.repeat(78)}\nG-TRACK-4 gearing across buildings (report, not a gate)`);
  rates.forEach(({ BLD, R }) => console.log(
    `  ${BLD.padEnd(10)} envelope ${String(R.env).padStart(6)}m  rate ${R.rateLogged} m/px  ` +
    `= ${(R.rateLogged / R.env * 700 * 100).toFixed(1)}% of envelope per screen-height  ` +
    `| perspective rate here ${R.mppPerspective.toFixed(4)} m/px (depth ${R.depth.toFixed(0)}m)  ` +
    `| cursor residual ${R.residualPx.toFixed(1)}px`));

  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
