// WITNESS — §CPE_OK_CRASH: the path editor's OK must reach the bake.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_OK_CRASH.
//
// WHY THIS FILE EXISTS AT ALL: every other cinema witness drives `A.cinemaPathPlan(dur, override)`
// directly — the PLAN seam. The user's path is editor → OK → `cinema_maxq.start()` CONTINUES → bake,
// and the one line of code between the plan and the bake is where a live defect sat undetected
// through two merged PRs (`override.waypoints.length`, a field §CPE_BANDS deleted). This witness
// walks that path with the real editor DOM and the real `startMaxQualityOrbit`.
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   K1 the reported crash: after a REAL band edit (keyed `y`, the same state a drag mutates) and a
//      REAL click on #cpe-ok, the run reaches the bake with zero page errors. RED on origin/main by
//      construction — a green K1 on unpatched code means the gate is not exercising the defect.
//   K2 the log tells the truth: §CPE_APPLIED's waypoint count EQUALS the count in the
//      §CINEMA_PATH_EDIT the plan itself printed. Not-crashing is not the claim; a hardcoded 0 would
//      also not crash, and would lie in every bug report from then on.
//   K3 guardrail 2 unbroken: OK with NO edit still reaches the bake and still logs
//      "§CPE_APPLIED none". Proves the fix did not just move the crash to the other branch.
//
// "Reached the bake" == §MAXQ_IDB_READY, the first line past the crash site. The run is then
// cancelled (re-entering startMaxQualityOrbit sets _cancel) so the gate costs seconds, not the cook.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8402;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal').split(',');
const EDIT_DY = 1.5;          // metres of camera-height edit — enough that _isEdited() is unambiguous
const BAKE_TIMEOUT_MS = 90000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForLog(logs, re, timeoutMs, label) {
  const t0 = Date.now();
  for (;;) {
    const hit = logs.find(l => re.test(l));
    if (hit) return hit;
    if (Date.now() - t0 > timeoutMs) return null;
    await sleep(200);
  }
}

async function openViewer(browser, BLD) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  const errs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => { errs.push(e.message); logs.push('PAGEERROR ' + e.message); });

  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
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
  return { page, logs, errs };
}

// One editor round-trip. `edit` true → key a real change into band 0's camera height first.
async function runOnce(browser, BLD, edit) {
  const { page, logs, errs } = await openViewer(browser, BLD);
  const out = { errs, logs, opened: false, edited: null, applied: null, pathEdit: null, reachedBake: false };

  // fps:1 keeps any frame the cancel misses cheap; preview:false skips the 10s rehearsal (it is not
  // what this gate is about — the editor placement after the preview is unchanged either way).
  await page.evaluate(dy => { window.__cpeDy = dy; window.APP.startMaxQualityOrbit({ preview: false, fps: 1 }); }, EDIT_DY);

  try { await page.waitForSelector('#cpe-ok', { timeout: 120000 }); out.opened = true; }
  catch (e) { await page.close(); return out; }

  if (edit) {
    out.edited = await page.evaluate(dy => {
      // Band rows: [x, z, y, len] number inputs. `y` is index 2 — the camera height, the field the
      // §CPE_LIVE report was about. A keyed change and a dragged one mutate the SAME _state.bands.
      const row = document.querySelectorAll('#cpe-rows > div')[0];
      const inputs = row.querySelectorAll('input');
      const yIn = inputs[2];
      const was = parseFloat(yIn.value);
      yIn.value = (was + dy).toFixed(2);
      yIn.dispatchEvent(new Event('change', { bubbles: true }));
      return { was, now: parseFloat(yIn.value) };
    }, EDIT_DY);
    await sleep(600);   // let the debounced replan settle before OK
  }

  await page.evaluate(() => document.getElementById('cpe-ok').click());

  out.applied = await waitForLog(logs, /§CPE_APPLIED/, 30000);
  const ready = await waitForLog(logs, /§MAXQ_IDB_READY|§MAXQ_FAIL|§MAXQ_CANCEL/, BAKE_TIMEOUT_MS);
  out.reachedBake = !!(ready && /§MAXQ_IDB_READY/.test(ready));
  // The §CINEMA_PATH_EDIT printed by the plan built AFTER the editor closed (last one wins).
  const pe = logs.filter(l => /§CINEMA_PATH_EDIT authored waypoints=/.test(l));
  out.pathEdit = pe.length ? pe[pe.length - 1] : null;

  try { await page.evaluate(() => window.APP.startMaxQualityOrbit()); } catch (e) {}   // sets _cancel
  await sleep(500);
  await page.close();
  return out;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [];

  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); if (!ok) allPass = false; };

    const edited = await runOnce(browser, BLD, true);
    const plain = await runOnce(browser, BLD, false);

    const crashErrs = edited.errs.filter(e => /Cannot read properties of undefined/.test(e));
    P('K1 edited path: OK reaches the bake with zero page errors',
      edited.opened && edited.reachedBake && edited.errs.length === 0,
      `editorOpened=${edited.opened} edit=${edited.edited ? edited.edited.was.toFixed(2) + '→' + edited.edited.now.toFixed(2) + 'm' : 'none'} ` +
      `reachedBake=${edited.reachedBake} pageErrors=${edited.errs.length}` +
      (crashErrs.length ? ` ← THE REPORTED CRASH: ${crashErrs[0]}` : '') +
      (edited.errs.length && !crashErrs.length ? ` ← ${edited.errs[0]}` : '') +
      `\n          applied: ${edited.applied || '(§CPE_APPLIED never printed)'}`);

    const mA = edited.applied && edited.applied.match(/waypoints=(\d+|\?)/);
    const mP = edited.pathEdit && edited.pathEdit.match(/authored waypoints=(\d+)/);
    P('K2 §CPE_APPLIED waypoint count equals what the plan actually flew',
      !!(mA && mP && mA[1] === mP[1]),
      `§CPE_APPLIED waypoints=${mA ? mA[1] : 'n/a'} vs §CINEMA_PATH_EDIT authored waypoints=${mP ? mP[1] : 'n/a'}` +
      `\n          plan line: ${edited.pathEdit || '(none — no authored route was flown!)'}`);

    P('K3 guardrail 2: untouched OK still reaches the bake, still a no-op',
      plain.opened && plain.reachedBake && plain.errs.length === 0 &&
        !!(plain.applied && /§CPE_APPLIED none/.test(plain.applied)),
      `editorOpened=${plain.opened} reachedBake=${plain.reachedBake} pageErrors=${plain.errs.length}` +
      `\n          applied: ${plain.applied || '(§CPE_APPLIED never printed)'}`);

    checks.forEach(c => console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`));
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
  }

  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
