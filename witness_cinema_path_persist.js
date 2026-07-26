// WITNESS — §CINEMA_PATH_EDITOR persistence + lock release.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CINEMA_PATH_EDITOR_MODEL, guardrail 5, item 20.
//
// ISSUE EACH GATE PROVES OR DISPROVES:
//   G4  round-trip: edit → "Save this path" → _exportBuildingDb() → _openDbBytes() → the SAME edited
//       path is in force. Proven by SAMPLED POSES, never by the table merely existing — a table full
//       of rows nothing reads would pass a weaker test and ship a dead feature.
//   G4b ephemerality: edit → proceed WITHOUT saving → export/reopen → the plan is the unedited
//       derived one. If this fails, experimenting with waypoints silently mutates the building,
//       which is exactly what the explicit-save rule exists to prevent.
//   G11 lock release: while the editor is open, A._maxqActive is false (so dlod_nav.js does not
//       report 'cinema' and disengage DLOD) and the wake lock is released; both re-claimed on OK.
//       Proves defect (20) is fixed rather than merely described.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8402;
const BLD = process.env.BLD || 'Duplex';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  const url = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.cinemaPathPlan && window.APP._exportBuildingDb,
    { timeout: 90000 });
  await new Promise(r => setTimeout(r, 9000));
  await page.waitForFunction(() => {
    const A = window.APP;
    try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });

  console.log(`\n${'='.repeat(78)}\n${BLD} — persistence + locks\n${'='.repeat(78)}`);

  const checks = [];
  const P = (name, ok, detail) => { checks.push({ name, ok, detail }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n          ${detail}`); };

  // ══ G4 / G4b ══
  const res = await page.evaluate(async () => {
    const A = window.APP;
    if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
    if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
    const DUR = 24, N = 200;
    const sample = (p) => { const o = []; for (let i = 0; i <= N; i++) { const q = p.poseAt(i / N); o.push([q.x, q.y, q.z]); } return o; };
    const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(a[i][k] - b[i][k])); return m; };

    A._cinemaPathEdit = null;
    const derived = A.cinemaPathPlan(DUR);
    const derivedSample = sample(derived);
    const wp = derived.waypoints.map(w => ({ x: w.x, y: w.y, z: w.z }));

    // A clearly visible edit: shove waypoint 1 sideways 6m and raise the whole path 1m.
    const edited = wp.map((w, i) => ({ x: w.x + (i === 1 ? 6 : 0), y: w.y + 1, z: w.z }));
    const ov = { waypoints: edited, diveSec: derived.sec.dive, spinSec: derived.sec.spin,
                 outSec: derived.sec.out, riseSec: derived.sec.rise, _total: DUR };
    const editedSample = sample(A.cinemaPathPlan(DUR, ov));

    // ── G4b FIRST: adjust but do NOT save, then export. The table must not appear.
    A._cinemaPathEdit = null;
    const bytesNoSave = A._exportBuildingDb();
    const hasTableNoSave = (() => {
      try {
        const Database = A.db.constructor;
        const d = new Database(bytesNoSave);
        const r = d.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cinema_path'");
        const n = r.length ? r[0].values.length : 0;
        d.close();
        return n > 0;
      } catch (e) { return 'ERR:' + e.message; }
    })();

    // ── G4: stage via the same call the editor's "Save this path" button makes, then export.
    A.stageCinemaPath(ov);
    const bytesSaved = A._exportBuildingDb();
    let savedRows = -1;
    try {
      const Database = A.db.constructor;
      const d = new Database(bytesSaved);
      const r = d.exec("SELECT COUNT(*) FROM cinema_path");
      savedRows = r.length ? r[0].values[0][0] : 0;
      d.close();
    } catch (e) { savedRows = 'ERR:' + e.message; }

    return { derivedSample, editedSample, hasTableNoSave, savedRows,
             editedDelta: maxDiff(derivedSample, editedSample),
             bytesSaved: Array.from(bytesSaved.slice(0, 0)), // not transferred; reopened in-page below
             wpCount: wp.length };
  });

  P('G4b ephemeral: adjusting without saving writes NO cinema_path table',
    res.hasTableNoSave === false,
    `cinema_path present after export-without-save = ${res.hasTableNoSave}`);

  P('G4 pre-check: the edit actually changes the flown path',
    res.editedDelta > 0.5,
    `maxPoseDelta derived→edited = ${res.editedDelta.toFixed(2)}m over ${res.wpCount} waypoints`);

  P('G4 stage+export writes the table',
    res.savedRows === res.wpCount,
    `cinema_path rows=${res.savedRows} (expected ${res.wpCount})`);

  // ── The real G4. _openDbBytes caches the bytes and NAVIGATES (scene.js:696), so the round-trip
  // runs through a genuine page reload — the actual user path, not a same-page re-parse. Sample the
  // authored path first, hand it out to Node, reload, and compare after.
  const before = await page.evaluate(() => {
    const A = window.APP;
    const DUR = 24, N = 200;
    const o = [];
    const p = A.cinemaPathPlan(DUR);      // authored, still staged in memory
    for (let i = 0; i <= N; i++) { const q = p.poseAt(i / N); o.push([q.x, q.y, q.z]); }
    return o;
  });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
    page.evaluate(async () => {
      const A = window.APP;
      const bytes = A._exportBuildingDb();
      A._cinemaPathEdit = null;           // nothing may survive in memory — it must come from the file
      await A._openDbBytes('roundtrip.db', bytes);
    }),
  ]);

  await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.cinemaPathPlan, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 9000));
  await page.waitForFunction(() => {
    const A = window.APP;
    try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });

  const round = await page.evaluate(async (before) => {
    const A = window.APP;
    if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
    if (typeof A.ensureRooms === 'function') { try { await A.ensureRooms({}); } catch (e) {} }
    const DUR = 24, N = 200;
    const p = A.cinemaPathPlan(DUR);      // first plan on the reopened DB → lazy restore fires here
    let m = 0;
    for (let i = 0; i <= N; i++) {
      const q = p.poseAt(i / N);
      m = Math.max(m, Math.abs(q.x - before[i][0]), Math.abs(q.y - before[i][1]), Math.abs(q.z - before[i][2]));
    }
    return { restored: !!A._cinemaPathEdit,
             wpRestored: A._cinemaPathEdit ? A._cinemaPathEdit.waypoints.length : 0,
             authored: !!p.authored, poseDiff: m };
  }, before);

  P('G4 round-trip: reopened DB flies the SAME edited path (sampled poses, not table presence)',
    round.restored && round.authored && round.poseDiff < 0.05,
    `restored=${round.restored} authored=${round.authored} waypoints=${round.wpRestored} maxPoseDiff before→after reload = ${round.poseDiff.toFixed(4)}m`);

  const restoreLine = logs.filter(l => l.startsWith('§CINEMA_PATH_RESTORE')).pop();
  const saveLine = logs.filter(l => l.startsWith('§CINEMA_PATH_SAVE')).pop();
  console.log('  LOG   ' + (saveLine || 'no §CINEMA_PATH_SAVE line'));
  console.log('  LOG   ' + (restoreLine || 'no §CINEMA_PATH_RESTORE line'));

  // ══ G11 — lock release around the editor. Drive the REAL Alt+C entry with the preview skipped,
  // and stub the editor so we can observe the state WHILE it is open.
  const locks = await page.evaluate(async () => {
    const A = window.APP;
    A._cinemaPathEdit = null;
    const seen = {};
    const realOpen = A.cinemaPathEditor ? A.cinemaPathEditor.open : null;
    if (!realOpen) return { skipped: 'cinemaPathEditor not loaded' };
    A.cinemaPathEditor.open = function(ctx) {
      // Observed from INSIDE the open editor — the whole point of item 20.
      seen.duringMaxqActive = A._maxqActive;
      seen.duringWaypoints = ctx.plan.waypoints.length;
      return Promise.resolve({ action: 'cancel', override: null, durationSec: ctx.durationSec });
    };
    seen.beforeMaxqActive = A._maxqActive;
    await A.startMaxQualityOrbit({ preview: false, frames: 30, fps: 15 });
    seen.afterMaxqActive = A._maxqActive;
    A.cinemaPathEditor.open = realOpen;
    return seen;
  });

  if (locks.skipped) {
    P('G11 lock release around the editor', false, locks.skipped);
  } else {
    P('G11 DLOD is NOT held disengaged while the editor is open',
      locks.duringMaxqActive === false,
      `_maxqActive before=${locks.beforeMaxqActive} during=${locks.duringMaxqActive} after=${locks.afterMaxqActive} (waypoints seen by editor=${locks.duringWaypoints})`);
    const lockLines = logs.filter(l => l.startsWith('§CPE_LOCKS'));
    P('G11 locks released and re-claimed, both logged',
      lockLines.length >= 2,
      lockLines.join(' | ') || 'no §CPE_LOCKS lines');
    P('G11 Cancel from the editor bakes nothing',
      logs.some(l => l.indexOf('§MAXQ_CANCEL from path editor') >= 0),
      logs.filter(l => l.startsWith('§MAXQ_CANCEL')).pop() || 'no cancel line');
  }

  await browser.close();
  const allPass = checks.every(c => c.ok);
  console.log(`\n${allPass ? 'WITNESS PASS' : 'WITNESS FAIL'}  (${checks.filter(c => c.ok).length}/${checks.length})`);
  process.exit(allPass ? 0 : 1);
})();
