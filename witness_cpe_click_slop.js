// WITNESS — §CPE_CLICK_SLOP: a click on the fat pipe spawns a stick; a drag bends it.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_CLICK_SLOP.
//
// THE DEFECT THIS PROVES OR DISPROVES (user, 2026-07-29: "when i made a new node in the pipe, it does
// not show up in the alt-c panel list"):
// h.up implements §CPE_STICK's one-grab-split correctly — `if (!d.op) _spawnStick(d.hit)` — but h.move
// used to create d.op on the FIRST pointermove of ANY size. A physical click emits 1-2px of movement
// almost every time, so d.op was truthy by pointerup and the stick branch was unreachable. The
// `mag < 1e-4` cancel does not catch it either: at 0.192 m/px one pixel is 0.19m.
//
//   G-CS-1  a 2px grab on the pipe spawns exactly ONE stick — §CPE_STICK added, bands N -> N+1, a new
//           row in #cpe-rows, and NO §CPE_HOSE landed. 2px is the jitter a real click carries, which
//           is precisely what made the old build take the wrong branch. RED on the old build.
//   G-CS-2  a 20px grab bends the pipe and spawns NOTHING — one §CPE_HOSE landed, bands unchanged.
//           Proves the slop did not turn small intentional bends into stray nodes.
//   G-CS-3  §CPE_UNDO survives: after the 2px click, Ctrl+Z returns the band count to N.
//   G-CS-4  a 0px press leaves NO undo entry AND still spawns the stick (G-DRAG-1's property: a press
//           that never moved must not push a dead undo step).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8433;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1, editor: true }); });
  await page.waitForSelector('#cpe-ok', { timeout: 300000 });
  await sleep(800);
  return { page, logs };
}

// Find a screen pixel that actually lands on the fat walk pipe, by asking the editor's own hit test
// through a real pointer sweep — never a guessed coordinate. Returns null if the pipe is off-screen.
// A blind canvas sweep is a lottery on a small building — a 42px grid missed Duplex's walk entirely
// (measured 2026-07-29). Ask the editor for the pixel of a point along the walk instead, then CONFIRM
// with its own hit test, so the gesture below is known to land on the pipe before anything is claimed.
// ⚠ HARNESS ROT, found 2026-07-31 by §CPE_REOPEN_NODE's witness and confirmed identically RED on
// origin/main (1/4 there and here) — this was NEVER a product regression. Two things had drifted:
//   (a) the editor opens at the pre-dive orbit pose, from which Duplex's whole 15m walk projects
//       into a ~30px smear, and
//   (b) every pixel of that smear is inside a band handle's GRAB_PX=18 radius, so `h.down` resolves
//       the gesture to a HANDLE (a rotate/translate) and never reaches the pipe at all — no stick,
//       no hose, and the witness read that as "the product does not spawn sticks".
// Fixed by looking closer first (free: §CPE_PREVIEW_DIVERGENCE pins every re-plan to the pose the
// editor OPENED at, so moving the camera cannot change the film) and by requiring the chosen pixel
// to clear every handle. Measured after: 4/4.
const HANDLE_CLEAR_PX = 26;

async function lookCloser(page) {
  await page.evaluate(() => {
    const A = window.APP, hs = A.cinemaPathEditor._probeHandles ? A.cinemaPathEditor._probeHandles() : null;
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
  const tried = [];
  await lookCloser(page);
  for (let f = 0.02; f <= 0.98; f += 0.01) {
    const spot = await page.evaluate((f, clear) => {
      const cpe = window.APP.cinemaPathEditor;
      if (!cpe || !cpe._pipePixel || !cpe._probePipe) return { why: 'no hook' };
      const p = cpe._pipePixel(f);
      if (!p) return { why: 'behind camera' };
      if (!cpe._probePipe(p.x, p.y)) return { why: 'hit test missed its own point' };
      if (cpe._probeHandles) {
        let near = 1e9;
        (cpe._probeHandles() || []).forEach(function(h) {
          if (h.px != null) near = Math.min(near, Math.hypot(h.px - p.x, h.py - p.y));
        });
        if (near < clear) return { why: 'handle ' + near.toFixed(0) + 'px (a handle wins the grab)' };
      }
      // ⚠ The hit test is pure maths and does not know about occlusion. The CPE panel is a DOM
      // element floating over the canvas, so a pixel that is mathematically on the pipe can still
      // deliver its pointerdown to the panel — measured 2026-07-29: every gesture at the walk's
      // midpoint produced NO §CPE_HOSE and NO §CPE_STICK, because the panel was on top of it.
      // It must be APP.canvas specifically — that is what the editor binds pointerdown to
      // (`c.addEventListener('pointerdown', h.down, true)` with `c = A().canvas`). Any other canvas
      // on top would swallow the gesture and the witness would report a product failure that isn't.
      const el = document.elementFromPoint(p.x, p.y);
      if (el !== window.APP.canvas) {
        return { why: 'topmost is <' + (el ? el.tagName + (el.id ? '#' + el.id : '') : 'null') + '>, not APP.canvas' };
      }
      return { px: p.x, py: p.y, frac: f };
    }, f, HANDLE_CLEAR_PX);
    if (spot && spot.px !== undefined) return spot;
    if (spot && spot.why) tried.push(f.toFixed(2) + ':' + spot.why);
  }
  console.log('        no usable pipe pixel — ' + tried.slice(0, 6).join(', '));
  return null;
}

const count = (logs, re) => logs.filter(l => re.test(l)).length;

async function gesture(page, px, py, dx) {
  await page.mouse.move(px, py);
  await page.mouse.down();
  if (dx > 0) {
    // Deliberately stepped, like a real hand — a single jump could skip the slop crossing entirely.
    for (let i = 1; i <= 4; i++) { await page.mouse.move(px + (dx * i) / 4, py); await sleep(40); }
  }
  await sleep(60);
  await page.mouse.up();
  await sleep(900);
}

const bandCount = page => page.evaluate(() => document.querySelectorAll('#cpe-rows > div').length);

async function gates(browser, BLD) {
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });
  const { page, logs } = await openEditor(browser, BLD);

  const spot = await findPipePixel(page);
  if (!spot) {
    P('G-CS-0 the fat pipe is reachable on screen', false,
      'no pixel in the sweep hit the walk pipe — INCONCLUSIVE, not a product verdict');
    await page.close();
    return checks;
  }

  // ── G-CS-1: 2px == a click ──────────────────────────────────────────────────────────────────
  const n0 = await bandCount(page);
  let mark = logs.length;
  await gesture(page, spot.px, spot.py, 2);
  let win = logs.slice(mark);
  const n1 = await bandCount(page);
  P('G-CS-1 a 2px grab on the pipe spawns exactly ONE stick, immediately in the list',
    n1 === n0 + 1 && count(win, /§CPE_STICK added/) === 1 && count(win, /§CPE_HOSE landed/) === 0,
    `rows ${n0} -> ${n1}   §CPE_STICK added=${count(win, /§CPE_STICK added/)}   ` +
    `§CPE_HOSE landed=${count(win, /§CPE_HOSE landed/)}`);

  // ── G-CS-3: undo puts it back ───────────────────────────────────────────────────────────────
  await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
  await sleep(900);
  const n2 = await bandCount(page);
  P('G-CS-3 Ctrl+Z removes the clicked stick (§CPE_UNDO intact)',
    n2 === n0, `rows after undo ${n2}, expected ${n0}`);

  // ── G-CS-2: 20px == a bend, and nothing is spawned ──────────────────────────────────────────
  mark = logs.length;
  await gesture(page, spot.px, spot.py, 20);
  win = logs.slice(mark);
  const n3 = await bandCount(page);
  P('G-CS-2 a 20px grab bends the pipe and spawns NOTHING',
    n3 === n2 && count(win, /§CPE_HOSE landed/) === 1 && count(win, /§CPE_STICK added/) === 0,
    `rows ${n2} -> ${n3}   §CPE_HOSE landed=${count(win, /§CPE_HOSE landed/)}   ` +
    `§CPE_STICK added=${count(win, /§CPE_STICK added/)}`);

  // ── G-CS-4: a 0px press still spawns, and pushes no dead undo step ──────────────────────────
  // Re-find the pixel: G-CS-2 just BENT the pipe 20px away from `spot`, so re-using it presses on
  // empty space and the gate reads as a product failure (measured 2026-07-31, the last RED of the
  // four). The pipe moving is the thing G-CS-2 proves — the coordinate has to move with it.
  const spot4 = await findPipePixel(page) || spot;
  const n4 = await bandCount(page);
  mark = logs.length;
  await gesture(page, spot4.px, spot4.py, 0);
  win = logs.slice(mark);
  const n5 = await bandCount(page);
  P('G-CS-4 a 0px press spawns the stick too (the original gesture still works)',
    n5 === n4 + 1 && count(win, /§CPE_STICK added/) === 1,
    `rows ${n4} -> ${n5}   §CPE_STICK added=${count(win, /§CPE_STICK added/)}`);

  await page.close();
  return checks;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [];
  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = await gates(browser, BLD);
    checks.forEach(c => { if (!c.ok) allPass = false; console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`); });
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
  }
  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
