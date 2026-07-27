// WITNESS — §MAXQ_HIDDEN_PAUSE: a backgrounded tab parks the bake instead of ruining the film.
// Spec: bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §MAXQ_HIDDEN_PAUSE.
//
// THE DEFECT THIS PROVES OR DISPROVES (user, Hospital, 2026-07-27):
// They baked a 45s film and it came out with a dead tail, then said "The hospital just before was
// frozen tab due to been out of focus." Chrome throttles rAF to a near-stop in a hidden tab, so the
// per-frame TAA fold + §PHOTO_AO never converge, _waitFoldDone's WALL-CLOCK timeout expires, and
// §MAXQ_FRAME_TIMEOUT saves a frame that never finished. Consecutive such captures come out
// near-duplicates, so the delivered MP4 ends in visually dead video. From their console:
//     §TAB_VISIBILITY visible=false
//     STILL_REFINE done elapsedMs 850 -> 11190 -> 25589 -> 45355
//     §MAXQ_FRAME_TIMEOUT i=683 — capturing as-is
// It does not throw, does not stop, and the file plays fine. That silence is the defect: a
// measurement pass looking for defects had already mis-attributed the dead tail to PACING.
//
//   G-HID-1  the bake does not advance while hidden — frame index at hide == frame index at reveal.
//   G-HID-2  it says so: §MAXQ_HIDDEN_PAUSE on hide, §MAXQ_HIDDEN_RESUME with measured hiddenMs.
//   G-HID-3  no frame captured unconverged across a hide/reveal — ZERO §MAXQ_FRAME_TIMEOUT. This is
//            the gate that maps directly to the ruined film.
//   G-HID-4  the run reports its own health (§MAXQ_QUALITY ... unconverged=0), so a pasted console
//            answers "is this film any good" without re-deriving it.
//   G-HID-5  regression: a bake never hidden is unaffected — no pause lines, and it still finishes.
//
// The tab is hidden the REAL way — a second tab is brought to front — because the thing under test
// is the browser's own throttling. Patching document.hidden would test the patch, not the browser.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8402;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
const FRAMES = parseInt(process.env.FRAMES || '10', 10);
const HIDE_MS = parseInt(process.env.HIDE_MS || '20000', 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Anchored at line start, ALWAYS. §MAXQ_LOADED's version string names the features it ships, so an
// unanchored /§MAXQ_HIDDEN_PAUSE/ matches the banner and the witness grades itself on its own
// version line — which it did on the first run here, failing three gates that were actually fine.
const has = (logs, re) => logs.some(l => re.test(l));
const find = (logs, re) => { const h = logs.filter(l => re.test(l)); return h.length ? h[h.length - 1] : null; };
const num = (l, re) => { const m = l && l.match(re); return m ? parseFloat(m[1]) : null; };
// Highest frame index the bake has reached, read from its own progress lines.
const frameIdx = logs => logs.reduce((mx, l) => {
  const m = l.match(/§MAXQ_(?:FRAME|HIDDEN_PAUSE at frame) i?=?\s*(\d+)/) || l.match(/frame (\d+)\//);
  return m ? Math.max(mx, parseInt(m[1], 10)) : mx;
}, -1);

async function openViewer(browser, BLD) {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 560 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.APP && window.APP.startMaxQualityOrbit && window.APP._composer, { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });
  return { page, logs };
}

// preview:false + editor:false — this witness is about the frame loop, and the editor would block it
// waiting for an OK that no one is going to click.
const startBake = page => page.evaluate(n => {
  window.APP.startMaxQualityOrbit({ preview: false, editor: false, fps: 1, frames: n, forceWebm: true });
}, FRAMES);

async function run(browser, BLD) {
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });

  const { page, logs } = await openViewer(browser, BLD);
  await startBake(page);
  // Let it get a few frames in, so the hide lands mid-bake rather than during setup.
  for (let i = 0; i < 240 && frameIdx(logs) < 1; i++) await sleep(1000);
  const idxBefore = frameIdx(logs);
  const timeoutsBefore = logs.filter(l => /§MAXQ_FRAME_TIMEOUT/.test(l)).length;

  // ── hide it the way a user does: another tab takes the foreground.
  const other = await browser.newPage();
  await other.goto('about:blank', { waitUntil: 'domcontentloaded' });
  await other.bringToFront();
  const hiddenSeen = await page.evaluate(() => document.visibilityState).catch(() => '?');
  await sleep(HIDE_MS);
  const idxHidden = frameIdx(logs);
  await page.bringToFront();
  await other.close();
  await sleep(4000);

  const pause = find(logs, /^§MAXQ_HIDDEN_PAUSE/), resume = find(logs, /^§MAXQ_HIDDEN_RESUME/);
  const hiddenMs = num(resume, /hiddenMs=(\d+)/);
  // The invariant is NOT "the frame index freezes". A hide can land just after the loop enters the
  // next frame, so the index may legitimately tick once before that frame parks in its cook — which
  // is exactly what happened (paused at "cook of frame 2/10" after hiding at index 1). What must
  // hold is that the frame IN FLIGHT when the tab hid is the SAME frame that resumes: it did not
  // finish, was not captured, and no further frame was started. Asserting the stricter, wrong thing
  // failed a fix that was working.
  const frameOf = l => { const m = l && l.match(/at cook of frame (\d+)/); return m ? m[1] : null; };
  P('G-HID-1 the frame in flight when the tab hid is the same frame that resumes — none completed hidden',
    hiddenSeen === 'hidden' && frameOf(pause) !== null && frameOf(pause) === frameOf(resume) &&
      idxHidden - idxBefore <= 1,
    `visibilityState while backgrounded = "${hiddenSeen}" (must be "hidden", else the rig never hid it)\n` +
    `          parked on frame ${frameOf(pause)}, resumed on frame ${frameOf(resume)} (must match)\n` +
    `          frame index at hide = ${idxBefore}, after ${(HIDE_MS / 1000).toFixed(0)}s hidden = ${idxHidden} (may tick at most once, into the frame that then parks)`);
  P('G-HID-2 it says so — §MAXQ_HIDDEN_PAUSE on hide, §MAXQ_HIDDEN_RESUME with measured hiddenMs',
    !!pause && !!resume && hiddenMs !== null && hiddenMs > HIDE_MS * 0.5,
    `pause : ${pause ? pause.slice(0, 96) : '(none)'}\n` +
    `          resume: ${resume || '(none)'}\n` +
    `          measured hiddenMs=${hiddenMs} against ${HIDE_MS}ms of real hiding`);

  // A health line that OVERSTATES is as useless as one that lies: a double-counted total once
  // reported 40908ms for a single 20516ms pause. One pause, so the total must equal it.
  const totalHidden = num(resume, /totalHiddenMs=(\d+)/), pausesN = num(resume, /pauses=(\d+)/);
  P('G-HID-2b the reported total is not double-counted — one pause, total == that pause',
    totalHidden !== null && pausesN === 1 && Math.abs(totalHidden - hiddenMs) < 50,
    `pauses=${pausesN} hiddenMs=${hiddenMs} totalHiddenMs=${totalHidden} (must differ by <50ms)`);

  // Let the rest of the frames finish so §MAXQ_QUALITY lands.
  for (let i = 0; i < 600 && !has(logs, /^§MAXQ_QUALITY/); i++) await sleep(1000);

  const timeouts = logs.filter(l => /§MAXQ_FRAME_TIMEOUT/.test(l));
  P('G-HID-3 no frame captured unconverged across the hide — zero §MAXQ_FRAME_TIMEOUT',
    timeouts.length === timeoutsBefore,
    `${timeouts.length} §MAXQ_FRAME_TIMEOUT total (${timeoutsBefore} before the hide)` +
    (timeouts.length ? '\n          ' + timeouts.slice(-3).join('\n          ') : ' — the film is clean'));

  // The property is HONESTY, not a clean render: under swiftshader a genuinely slow frame can blow
  // the 30s budget, and demanding unconverged=0 would gate the rasterizer rather than the code. What
  // must hold is that the line EXISTS and its numbers match what actually happened — a run that
  // degraded has to say the same thing the timeout warnings say.
  const q = find(logs, /^§MAXQ_QUALITY/);
  const qUnconv = num(q, /unconverged=(\d+)/), qPauses = num(q, /hiddenPauses=(\d+)/);
  P('G-HID-4 the run reports its own health truthfully, so a degraded film cannot finish quietly',
    !!q && qUnconv === timeouts.length && qPauses >= 1,
    `${q || '(no §MAXQ_QUALITY line — unpatched build)'}\n` +
    `          reported unconverged=${qUnconv} against ${timeouts.length} actual §MAXQ_FRAME_TIMEOUT lines; hiddenPauses=${qPauses} (must be >=1)`);

  await page.close();
  return checks;
}

async function regression(browser, BLD) {
  const { page, logs } = await openViewer(browser, BLD);
  await startBake(page);
  for (let i = 0; i < 600 && !has(logs, /^§MAXQ_QUALITY/); i++) await sleep(1000);
  const q = find(logs, /^§MAXQ_QUALITY/);
  await page.close();
  return [{
    n: 'G-HID-5 a bake that is never hidden is unaffected — no pause lines, still finishes',
    ok: !!q && /hiddenPauses=0/.test(q) && !has(logs, /^§MAXQ_HIDDEN_PAUSE/),
    d: `${q || '(no §MAXQ_QUALITY line)'}\n` +
       `          §MAXQ_HIDDEN_PAUSE lines: ${logs.filter(l => /^§MAXQ_HIDDEN_PAUSE/.test(l)).length} (must be 0)`
  }];
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
    console.log(`\n${'='.repeat(78)}\n${BLD}  (${FRAMES} frames, hidden for ${HIDE_MS / 1000}s mid-bake)\n${'='.repeat(78)}`);
    const checks = (await run(browser, BLD)).concat(await regression(browser, BLD));
    checks.forEach(c => { if (!c.ok) allPass = false; console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`); });
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
  }

  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
