#!/usr/bin/env node
// PROBE (§S78) — direct data-level proof of the split-mode persist-key fix, bypassing the Gantt
// canvas UI and the full 3D render pipeline entirely. §S76's own probe (probe_gantt_hospital_persist.js)
// drives the drawer via toggleTimeMachine()+canvas pointer events, which on THIS machine never
// becomes ready inside any reasonable budget for Hospital's element count — reproduced identically
// on UNMODIFIED origin/main (git stash test, 3 runs, loadMs=180327-180446 every time, bars=0 every
// time even after 120s of extra polling), matching this project's own prior documented finding that
// Hospital/LTU-scale headless swiftshader rendering does not complete on this machine
// (TM_INCREMENTAL_RENDER_PERF.md, "Hospital cannot be witnessed headless on this machine at all").
//
// The actual bug and fix are about DATA (which IDB slot app.db gets read from / written to), not
// rendering — so this probe never calls toggleTimeMachine() or touches the canvas. It waits only for
// window.APP.db + window.APP._dbPersistUrl (set right after streaming.js's Phase 1 meta.db load,
// which happens BEFORE the slow geo.db/geometry phase), then exercises persistDb DIRECTLY the same
// way _tmPersistEdit does, and proves the write key and the reload's read key are the SAME slot.
//
//   node scripts/probe_splitmode_persist_direct.js <BuildingName>
//   SERVE_ROOT must be the repo root (viewer/ needs its erp/ sibling for other scripts to resolve,
//   same §S72 lesson every other probe in this lane already encodes).
'use strict';
const { spawn } = require('child_process');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer');
const PORT = Number(process.env.PORT || 8147);
const ROOT = process.env.SERVE_ROOT || process.cwd();
const BUILDING = process.argv[2] || 'Hospital';
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BUILDING}_extracted.db`;
const fs = require('fs');
const os = require('os');
const PROFILE_DIR = fs.mkdtempSync(require('path').join(os.tmpdir(), 'splitmode-persist-direct-'));

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  ' + detail : '')); }
};

(async () => {
  const server = spawn('node', [__dirname + '/_fast_static_server.js', String(PORT), ROOT], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: PROFILE_DIR, protocolTimeout: 480000, executablePath: '/home/red1/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  let lines = [], errs = [];
  page.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) lines.push(t); });
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const since = n => lines.slice(n);
  const grab = (n, re) => (since(n).filter(l => re.test(l)).pop() || '');

  console.log(`── probe_splitmode_persist_direct (§S78) — ${BUILDING}, data-level only, no UI/render ──`);

  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Wait only for the DATA to be ready — Phase 1 (meta.db) completes well before Phase 2 (geo.db).
  await page.waitForFunction(() => window.APP && window.APP.db, { timeout: 240000 });
  const dataReadyMs = Date.now() - t0;
  check('D0 page loads with no JS error', errs.length === 0, errs.length ? errs[0] : '(0 page errors)');

  const state = await page.evaluate(() => ({
    dbUrl: window.APP.DB_URL,
    persistUrl: window.APP._dbPersistUrl,
    splitHasMeta: window.APP._splitHasMeta,
    tables: (window.APP.db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0] || { values: [] }).values.map(v => v[0])
  }));
  console.log('§S78_STATE dataReadyMs=' + dataReadyMs + ' ' + JSON.stringify(state));

  const isSplit = !!(state.persistUrl && state.persistUrl !== state.dbUrl);
  check('D1 A._dbPersistUrl is set (the fix — was undefined before this change)', !!state.persistUrl, JSON.stringify(state));
  check('D2 has a tasks table to prove against', state.tables.indexOf('tasks') >= 0, JSON.stringify(state.tables));

  // ── activate() materializes the tasks table (schedule generation) — tasks is empty until this
  // runs. Calling it directly, but everything AFTER this is still direct SQL, never the canvas/DOM.
  const activateT0 = Date.now();
  await page.evaluate(() => window.toggleTimeMachine());
  await page.waitForFunction(() => {
    try { const r = window.APP.db.exec('SELECT COUNT(*) FROM tasks'); return r[0] && r[0].values[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 500 });
  console.log('§S78_ACTIVATE ms=' + (Date.now() - activateT0));

  // ── mutate a task's start-date column directly (same effect a drag has, no canvas needed).
  // Schema-agnostic on purpose: meta.db's independently-generated tasks table uses start_date/
  // finish_date, not the schedule_start/schedule_finish shape the whole-db path uses (§S76) — the
  // fix under test is about which CACHE KEY gets used, not the column shape, so detect whichever
  // date column is actually present rather than assuming one.
  const dateCol = await page.evaluate(() => {
    const cols = (window.APP.db.exec("PRAGMA table_info(tasks)")[0] || { values: [] }).values.map(v => v[1]);
    return cols.indexOf('schedule_start') >= 0 ? 'schedule_start' : (cols.indexOf('start_date') >= 0 ? 'start_date' : null);
  });
  check('D2b date column found on tasks', !!dateCol, 'dateCol=' + dateCol);
  const before = await page.evaluate((col) => {
    const r = window.APP.db.exec('SELECT task_id, ' + col + ' FROM tasks LIMIT 1');
    return r[0] ? r[0].values[0] : null;
  }, dateCol);
  check('D3 baseline task row read', !!before, JSON.stringify(before));
  if (!before) { throw new Error('no task row — cannot proceed'); }

  const NEW_DATE = '2026-12-25';
  await page.evaluate((taskId, newDate, col) => {
    window.APP.db.run('UPDATE tasks SET ' + col + ' = ? WHERE task_id = ?', [newDate, taskId]);
  }, before[0], NEW_DATE, dateCol);

  // ── persist exactly the way _tmPersistEdit does: SA.persistDb(app.db, app._dbPersistUrl||app.DB_URL, {}) ──
  let mark = lines.length;
  const persistResult = await page.evaluate(() => {
    const SA = window.ScheduleAuthor;
    const url = window.APP._dbPersistUrl || window.APP.DB_URL;
    return SA.persistDb(window.APP.db, url, { immediate: true }).then(ok => ({ ok, url }));
  });
  await new Promise(r => setTimeout(r, 500));
  const persistLine = grab(mark, /§SCHED_PERSIST/);
  check('D4 persistDb wrote successfully', persistResult.ok === true, JSON.stringify(persistResult) + ' | ' + persistLine);

  // ── compute what the RELOAD path will look up: DbResolve.cacheKey(metaUrl or DB_URL, PROD_BASE),
  //    the exact same derivation streaming.js's split-mode detection + A.cachedFetch both use ──
  const keyCheck = await page.evaluate(() => {
    const DR = window.DbResolve;
    const writeKey = DR.cacheKey(window.APP._dbPersistUrl || window.APP.DB_URL, window.APP.PROD_BASE);
    // reproduce streaming.js's own metaUrl derivation verbatim (the read side re-derives this
    // from DB_URL on every load — it is not stored, so re-derive it the same way to compute the
    // key the RELOAD will actually look up under)
    let metaUrl = window.APP.DB_URL.replace('_extracted.db', '_meta.db');
    if (metaUrl === window.APP.DB_URL) metaUrl = window.APP.DB_URL.replace(/\.db$/, '_meta.db');
    const readKeySplit = DR.cacheKey(metaUrl, window.APP.PROD_BASE);
    const readKeyWhole = DR.cacheKey(window.APP.DB_URL, window.APP.PROD_BASE);
    return { writeKey, readKeySplit, readKeyWhole, splitHasMeta: window.APP._splitHasMeta };
  });
  console.log('§S78_KEYS ' + JSON.stringify(keyCheck));
  const expectedReadKey = isSplit ? keyCheck.readKeySplit : keyCheck.readKeyWhole;
  check('D5 THE FIX — write key matches the key the reload will actually read (' + (isSplit ? 'split' : 'whole-db') + ' mode)',
    keyCheck.writeKey === expectedReadKey, 'write=' + keyCheck.writeKey + ' expectedRead=' + expectedReadKey);

  await browser.close();

  // ── RELOAD: fresh browser, same profile, confirm the cache actually holds it under that key + the edit reads back ──
  const browser2 = await puppeteer.launch({ headless: 'new', userDataDir: PROFILE_DIR, protocolTimeout: 480000, executablePath: '/home/red1/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page2 = await browser2.newPage();
  lines = []; errs = [];
  page2.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) lines.push(t); });
  page2.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page2.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page2.waitForFunction(() => window.APP && window.APP.db, { timeout: 240000 });

  const afterReload = await page2.evaluate((taskId, col) => {
    const r = window.APP.db.exec("SELECT task_id, " + col + " FROM tasks WHERE task_id = '" + taskId.replace(/'/g, "''") + "'");
    return r[0] ? r[0].values[0] : null;
  }, before[0], dateCol);
  const cacheHitLines = lines.filter(l => /§CACHE_HIT/.test(l));
  console.log('§S78_RELOAD_CACHE ' + JSON.stringify(cacheHitLines));

  const survived = afterReload && String(afterReload[1]) === NEW_DATE;
  check('D6 THE ROUND TRIP — edit survives a real reload (this is the proof)', survived,
    'expected=' + NEW_DATE + ' got=' + (afterReload && afterReload[1]));

  console.log('§S78_SUMMARY building=' + BUILDING + ' isSplit=' + isSplit + ' pass=' + pass + ' fail=' + fail);
  await browser2.close();
  server.kill();
  try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('§S78_FATAL ' + e.stack);
  try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
