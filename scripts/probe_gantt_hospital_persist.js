#!/usr/bin/env node
// PROBE (§S76, gap 4 of §S72) — the live drag→persist→reload round trip proven by §S70 (W-PERS-4)
// has only ever been run on Duplex (9MB). This runs the SAME proof on Hospital (252MB, the largest
// building in the fleet) — the case §S72 flagged as "persistence proven on Duplex only... never run
// on a big building." Reports by §-log, gates on the round trip actually surviving.
//
//   SERVE_ROOT must be the REPO ROOT, not viewer/ — same §S72 lesson probe_gantt_gestures.js already
//   encodes: the page loads ../erp/bigdecimal.js and ../erp/ad_seed.db, and Hospital's own
//   _extracted.db/_geo.db/_meta.db must be present under SERVE_ROOT/buildings/.
'use strict';
const { spawn } = require('child_process');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer');
const PORT = Number(process.env.PORT || 8146);
const ROOT = process.env.SERVE_ROOT || process.cwd();
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Hospital_extracted.db`;
const fs = require('fs');
const os = require('os');
// Both browser launches MUST share this profile dir — that IS the IndexedDB the round trip proves
// survives. Two independent puppeteer.launch() calls with no userDataDir get two independent (empty)
// profiles, which would make "H5/H6 reload" pass or fail for the wrong reason entirely.
const PROFILE_DIR = fs.mkdtempSync(require('path').join(os.tmpdir(), 'hospital-persist-profile-'));

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  ' + detail : '')); }
};

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', ROOT], { stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const browser = await puppeteer.launch({ headless: 'new', userDataDir: PROFILE_DIR,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  let lines = [], errs = [];
  page.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) lines.push(t); });
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const since = n => lines.slice(n);
  const has = (n, re) => since(n).some(l => re.test(l));
  const grab = (n, re) => (since(n).filter(l => re.test(l)).pop() || '');

  console.log('── probe_gantt_hospital_persist (§S76) — Hospital 252MB drag → persist → reload ──');

  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.toggleTimeMachine === 'function', { timeout: 180000 });
  await page.waitForFunction(() => window.APP && window.APP.db, { timeout: 300000 }).catch(() => {});
  const loadMs = Date.now() - t0;
  check('H0 page loads with no JS error', errs.length === 0, errs.length ? errs[0] : '(0 page errors), loadMs=' + loadMs);

  await page.evaluate(() => window.toggleTimeMachine());
  // §S78 diagnostic: this environment's cold page-load already consumes ~180s (reproduced
  // identically on unmodified origin/main — not a fix regression); bars=0 with the original 15s
  // wait suggests the Gantt data (schedule/tasks) simply hadn't finished materializing yet.
  // Poll instead of a fixed sleep so we don't guess a magic number twice.
  let _barsSeen = 0;
  for (let _w = 0; _w < 24; _w++) {
    await new Promise(r => setTimeout(r, 5000));
    _barsSeen = await page.evaluate(() => (window.__tmGanttBars || []).filter(b => b.taskId).length).catch(() => 0);
    if (_barsSeen > 1) { console.log('§S78_BARS_POLL ready after ' + ((_w + 1) * 5) + 's bars=' + _barsSeen); break; }
  }
  await page.evaluate(() => { const g = document.getElementById('tm-gantt'); g && g.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await new Promise(r => setTimeout(r, 8000));
  await page.evaluate(() => { const l = document.getElementById('tm-gantt-editlock'); l && l.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await new Promise(r => setTimeout(r, 4000));
  const barCount = await page.evaluate(() => (window.__tmGanttBars || []).filter(b => b.taskId).length);
  check('H1 gantt drawer open, editable, bars present', barCount > 1, 'bars=' + barCount);

  // ── pick the first real task bar and read its schedule_start BEFORE the drag, straight from sql.js
  const before = await page.evaluate(() => {
    const b = (window.__tmGanttBars || []).find(x => x.taskId);
    if (!b) return null;
    const r = window.APP.db.exec("SELECT task_id, schedule_start FROM tasks WHERE task_id = '" + b.taskId.replace(/'/g, "''") + "'");
    return { taskId: b.taskId, x: b.x, y: b.y, w: b.w, h: b.h, row: r[0] ? r[0].values[0] : null };
  });
  check('H2 baseline task + schedule_start read from live sql.js', !!(before && before.row), JSON.stringify(before && before.row));

  // ── drag it 5 days' worth of pixels to the right ──────────────────────────────────────────────
  let mark = lines.length;
  const t1 = Date.now();
  await page.evaluate((b) => {
    const c = document.getElementById('tm-gantt-canvas'), r = c.getBoundingClientRect();
    const midY = b.y + b.h / 2, x0 = b.x + b.w / 2;
    const ev = (ty, x, y) => c.dispatchEvent(new PointerEvent(ty, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 1, isPrimary: true, button: 0, buttons: 1 }));
    ev('pointerdown', x0, midY);
    for (let dx = 20; dx <= 100; dx += 20) ev('pointermove', x0 + dx, midY);
    ev('pointerup', x0 + 100, midY);
  }, before);
  await new Promise(r => setTimeout(r, 4000));
  const dragMs = Date.now() - t1;

  const persistLine = grab(mark, /§(SCHED_PERSIST|GANTT_EDIT_PERSIST)/);
  check('H3 drag fires a persist call', /ok=true/.test(persistLine) || /§SCHED_PERSIST/.test(persistLine), persistLine || '(no persist line seen)');

  // §SCHED_PERSIST is debounced 1200ms per §S70 — wait past it, then read the size/key it reported.
  await new Promise(r => setTimeout(r, 2000));
  const t2 = Date.now();
  const schedLine = grab(mark, /§SCHED_PERSIST/);
  const sizeM = schedLine.match(/size=(\d+)KB/);
  const persistKB = sizeM ? Number(sizeM[1]) : null;

  const after = await page.evaluate((taskId) => {
    const r = window.APP.db.exec("SELECT task_id, schedule_start FROM tasks WHERE task_id = '" + taskId.replace(/'/g, "''") + "'");
    return r[0] ? r[0].values[0] : null;
  }, before ? before.taskId : '');
  const changed = before && before.row && after && String(after[1]) !== String(before.row[1]);
  check('H4 in-memory schedule_start actually changed after drag', changed,
    'before=' + (before && before.row && before.row[1]) + ' after=' + (after && after[1]));

  console.log('§HOSPITAL_PERSIST_COST loadMs=' + loadMs + ' dragToCommitMs=' + dragMs + ' persistKB=' + persistKB +
    ' schedLine="' + schedLine + '"');

  await browser.close();

  // ── RELOAD: fresh browser+page, same URL, force a real cache round trip, not an in-memory reuse ─
  const browser2 = await puppeteer.launch({ headless: 'new', userDataDir: PROFILE_DIR,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page2 = await browser2.newPage();
  lines = []; errs = [];
  page2.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) lines.push(t); });
  page2.on('pageerror', e => errs.push(String(e).slice(0, 200)));

  const t3 = Date.now();
  await page2.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page2.waitForFunction(() => typeof window.toggleTimeMachine === 'function', { timeout: 180000 });
  await page2.waitForFunction(() => window.APP && window.APP.db, { timeout: 300000 }).catch(() => {});
  const reloadMs = Date.now() - t3;

  const allCacheLines = lines.filter(l => /§CACHE_HIT/.test(l));
  // §S78 CORRECTION: this check originally asserted a hit on Hospital_extracted.db — but that was
  // never the right expectation. In split mode APP.db is loaded from meta.db BY DESIGN (that is not
  // the bug; extracted.db is bypassed entirely for split buildings, geo.db separately for geometry).
  // The actual invariant the fix must prove is that the RELOAD's cache lookup for the tasks-bearing
  // db (meta.db) is a HIT — i.e. the persist actually landed in the slot the loader reads, not a
  // miss that silently re-fetches a pristine copy from the network and masks data loss as "it loaded
  // fine." A miss here would mean H6 passing is not even testing what we think it's testing.
  const metaCacheLine = allCacheLines.find(l => /Hospital_meta/.test(l)) || '(none — meta.db not cache-hit)';
  check('H5 reload hits the IDB cache for meta.db (the db split mode actually loads tasks from)',
    /Hospital_meta/.test(metaCacheLine), 'all §CACHE_HIT lines: ' + JSON.stringify(allCacheLines));

  const schemaCheck = await page2.evaluate((taskId) => {
    try {
      const cols = window.APP.db.exec("PRAGMA table_info(tasks)");
      const colNames = cols[0] ? cols[0].values.map(v => v[1]) : [];
      const dbUrl = window.APP.DB_URL;
      const tableList = window.APP.db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0];
      return { colNames, dbUrl, tables: tableList ? tableList.values.map(v => v[0]) : [] };
    } catch (e) { return { error: e.message }; }
  }, before ? before.taskId : '');
  console.log('§HOSPITAL_RELOAD_SCHEMA ' + JSON.stringify(schemaCheck));

  const afterReload = await page2.evaluate((taskId) => {
    try {
      const r = window.APP.db.exec("SELECT task_id, schedule_start FROM tasks WHERE task_id = '" + taskId.replace(/'/g, "''") + "'");
      return r[0] ? r[0].values[0] : null;
    } catch (e) { return { error: e.message }; }
  }, before ? before.taskId : '');

  const survived = before && before.row && afterReload && String(afterReload[1]) === String(after && after[1]) && String(afterReload[1]) !== String(before.row[1]);
  check('H6 THE ROUND TRIP — the dragged date survived the reload (this is the proof)', survived,
    'preDrag=' + (before && before.row && before.row[1]) + ' postDrag=' + (after && after[1]) + ' postReload=' + (afterReload && afterReload[1]));

  console.log('§HOSPITAL_PERSIST_ROUNDTRIP loadMs=' + loadMs + ' reloadMs=' + reloadMs + ' total=' + (Date.now() - t0) + 'ms errs=' + errs.length);
  console.log('§HOSPITAL_PERSIST_SUMMARY pass=' + pass + ' fail=' + fail);

  await browser2.close();
  server.kill();
  try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('§HOSPITAL_PERSIST_FATAL ' + e.stack);
  try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
