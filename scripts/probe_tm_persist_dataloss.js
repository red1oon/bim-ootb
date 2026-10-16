#!/usr/bin/env node
// PROBE — root-cause + witness for the TM persist DATA-LOSS (bim-compiler 4D_GANTT_TM_REFACTOR.md §5b).
//
// SYMPTOM: persistDb() returns ok=true, logs §SCHED_PERSIST, emits no §SCHED_PERSIST_ERR — and the
// IndexedDB 'dbs' store ends up EMPTY, the user's edit silently replaced by the pristine network copy
// on a later reload.
//
// MEASURED CAUSE (this probe's own log, run 1): scene.js cachedFetch's quota-retry ladder calls
// A._evictOldest(cacheDb, 4) on ANY transaction abort. With only 2 entries in the store, "drop the 4
// oldest" drops EVERYTHING — including buildings/<B>_meta.db, the slot persistDb just wrote the user's
// edit into. The abort came from the 239MB Hospital_geo.db write, and the code asserts "quota too
// small" without ever reading tx.error (quota was 10.2GB, usage 24MB).
//
// This probe reproduces the loss END TO END, the way a user meets it:
//   PHASE A  load -> activate -> edit -> persistDb        (store holds the 55MB edited blob)
//   PHASE B  reload (same profile)                        (meta read from cache, THEN geo aborts -> evict)
//   PHASE C  reload again                                 (store empty -> pristine refetch -> EDIT GONE)
//
//   node scripts/probe_tm_persist_dataloss.js <BuildingName>
//   PUPPETEER=/abs/path/to/puppeteer  SERVE_ROOT=<repo root>  PORT=<a FREE port>
'use strict';
const { spawn } = require('child_process');
const puppeteer = require(process.env.PUPPETEER || 'puppeteer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PORT = Number(process.env.PORT || 8271);
const ROOT = process.env.SERVE_ROOT || process.cwd();
const BUILDING = process.argv[2] || 'Hospital';
const REPEATS = Number(process.env.REPEATS || 3);
const SETTLE = Number(process.env.SETTLE || 20000);
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BUILDING}_extracted.db`;
const PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-persist-dataloss-'));
const CHROME = process.env.CHROME || '/home/red1/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome';

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  PASS ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  ' + detail : '')); }
};
const MB = n => (n / 1024 / 1024).toFixed(2) + 'MB';

// ── IDB mutation spy, installed before any app script runs ──────────────────────────────────────
function installSpy() {
  window.__IDBSPY = [];
  const rec = (o) => { try { window.__IDBSPY.push(o); } catch (e) {} };
  const site = () => {
    try {
      return (new Error()).stack.split('\n').slice(3, 6)
        .map(l => l.trim().replace(/^at\s+/, '').replace(/https?:\/\/[^/]+\//, '')).join(' <- ');
    } catch (e) { return '?'; }
  };
  const sizeOf = v => (v && typeof v.byteLength === 'number') ? v.byteLength : -1;
  const OSp = IDBObjectStore.prototype;
  const oPut = OSp.put, oDel = OSp.delete, oClr = OSp.clear;
  OSp.put = function (v, k) {
    rec({ op: 'put', store: this.name, key: String(k), size: sizeOf(v), at: site() });
    const r = oPut.apply(this, arguments);
    try { r.addEventListener('error', () => rec({ op: 'put:ERR', store: this.name, key: String(k), err: (r.error && r.error.name + ':' + r.error.message) || '?' })); } catch (e) {}
    return r;
  };
  OSp.delete = function (k) { rec({ op: 'DELETE', store: this.name, key: String(k), at: site() }); return oDel.apply(this, arguments); };
  OSp.clear = function () { rec({ op: 'CLEAR', store: this.name, at: site() }); return oClr.apply(this, arguments); };
  const DBp = IDBDatabase.prototype, oTx = DBp.transaction;
  DBp.transaction = function (stores, mode) {
    const tx = oTx.apply(this, arguments);
    const at = site();
    try {
      tx.addEventListener('abort', () => rec({ op: 'tx:ABORT', store: String(stores), err: (tx.error && tx.error.name + ':' + tx.error.message) || '(tx.error is null)', at }));
      tx.addEventListener('error', () => rec({ op: 'tx:ERROR', store: String(stores), err: (tx.error && tx.error.name + ':' + tx.error.message) || '?', at }));
    } catch (e) {}
    return tx;
  };
  const oDD = indexedDB.deleteDatabase.bind(indexedDB);
  indexedDB.deleteDatabase = function (n) { rec({ op: 'DELETE_DB', store: String(n), at: site() }); return oDD(n); };
}

const snapshotFn = async () => {
  const idb = await window.APP.openCacheDB();
  if (!idb) return { err: 'openCacheDB null' };
  const names = Array.from(idb.objectStoreNames);
  const out = { version: idb.version, stores: names, dbs: [], timestamps: [] };
  const readKeys = s => new Promise(res => { try { const tx = idb.transaction(s, 'readonly'); const rq = tx.objectStore(s).getAllKeys(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => res([]); } catch (e) { res([]); } });
  const readSize = (s, k) => new Promise(res => { try { const tx = idb.transaction(s, 'readonly'); const rq = tx.objectStore(s).get(k); rq.onsuccess = () => { const v = rq.result; res(v && typeof v.byteLength === 'number' ? v.byteLength : -1); }; rq.onerror = () => res(-3); } catch (e) { res(-4); } });
  for (const k of await readKeys('dbs')) out.dbs.push({ key: String(k), size: await readSize('dbs', k) });
  if (names.indexOf('timestamps') >= 0) out.timestamps = (await readKeys('timestamps')).map(String);
  try { const e = await navigator.storage.estimate(); out.quota = e.quota; out.usage = e.usage; } catch (e) {}
  try { out.persisted = await navigator.storage.persisted(); } catch (e) {}
  return out;
};

(async () => {
  // PREFLIGHT — prove the server on PORT is OURS (concurrent sessions collide on ports; a silent
  // bind failure once cost 300s of waiting on a window.APP.db from someone else's tree).
  const NONCE = 'probe-' + Math.random().toString(36).slice(2) + '-' + Date.now();
  const MARKER = path.join(ROOT, '__probe_marker.txt');
  fs.writeFileSync(MARKER, NONCE);
  const server = spawn('node', [__dirname + '/_fast_static_server.js', String(PORT), ROOT], { stdio: ['ignore', 'ignore', 'pipe'] });
  let serverErr = ''; server.stderr.on('data', d => { serverErr += String(d); });
  await new Promise(r => setTimeout(r, 1500));
  const got = await new Promise(res => { require('http').get(`http://localhost:${PORT}/__probe_marker.txt`, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res(b)); }).on('error', e => res('ERR:' + e.message)); });
  if (got !== NONCE) {
    fs.rmSync(MARKER, { force: true }); server.kill();
    console.error(`§FATAL preflight — port ${PORT} is NOT serving ${ROOT}. got=${JSON.stringify(got.slice(0, 120))}`);
    console.error(serverErr.split('\n').slice(0, 4).join('\n') + '\n  → another session owns this port. Re-run with a free PORT=.');
    process.exit(2);
  }
  console.log(`§PREFLIGHT_OK port=${PORT} root=${ROOT}`);
  console.log(`── probe_tm_persist_dataloss — ${BUILDING} — repeats=${REPEATS} ──`);

  const launch = () => puppeteer.launch({ headless: 'new', userDataDir: PROFILE_DIR, protocolTimeout: 600000, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const openPage = async (browser, lines, errs) => {
    const p = await browser.newPage();
    await p.evaluateOnNewDocument(installSpy);
    p.on('console', m => { const t = m.text(); if (t.indexOf('§') >= 0) lines.push(t); });
    p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
    return p;
  };
  const showSnap = (tag, s) => {
    console.log(`§IDBSNAP ${tag} v=${s.version} dbsEntries=${(s.dbs || []).length} quota=${s.quota ? MB(s.quota) : '?'} usage=${s.usage ? MB(s.usage) : '?'} persisted=${s.persisted}`);
    (s.dbs || []).forEach(e => console.log(`         dbs["${e.key}"] = ${e.size >= 0 ? MB(e.size) : 'MISSING'}`));
    console.log(`         timestamps = [${(s.timestamps || []).join(', ')}]`);
  };
  const dumpSpy = (tag, spy) => {
    const interesting = spy.filter(e => /DELETE|CLEAR|ABORT|ERR/.test(e.op) || (e.op === 'put' && e.size > 1e6));
    console.log(`§IDBSPY ${tag} total=${spy.length} interesting=${interesting.length}`);
    interesting.forEach(e => console.log('     ' + JSON.stringify(e)));
  };

  // ══ PHASE A — load, activate, edit, persist ═══════════════════════════════════════════════════
  let linesA = [], errsA = [];
  const b1 = await launch();
  const page = await openPage(b1, linesA, errsA);
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.db, { timeout: 300000 });
  console.log('§DATA_READY ms=' + (Date.now() - t0));
  await new Promise(r => setTimeout(r, SETTLE));   // let the geo phase run inside the observation window
  check('P0 no JS page error', errsA.length === 0, errsA.length ? errsA[0] : '(0)');

  const spyLoad = await page.evaluate(() => window.__IDBSPY.slice());
  dumpSpy('PHASE-A-load', spyLoad);
  const snapT0 = await page.evaluate(snapshotFn); showSnap('A0-afterLoad', snapT0);

  const actT0 = Date.now();
  await page.evaluate(() => window.toggleTimeMachine());
  await page.waitForFunction(() => { try { const r = window.APP.db.exec('SELECT COUNT(*) FROM tasks'); return r[0] && r[0].values[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 500 });
  console.log('§ACTIVATE ms=' + (Date.now() - actT0));

  const exp = await page.evaluate(() => { const u8 = window.APP.db.export(); return { arrLen: u8.byteLength, bufLen: u8.buffer.byteLength, offset: u8.byteOffset }; });
  console.log('§EXPORT_SHAPE ' + JSON.stringify(exp) + ' arr=' + MB(exp.arrLen));
  check('P1 db.export().buffer is exactly the db bytes (no wasm-heap over-read)', exp.bufLen === exp.arrLen && exp.offset === 0, JSON.stringify(exp));

  const dateCol = await page.evaluate(() => { const c = (window.APP.db.exec('PRAGMA table_info(tasks)')[0] || { values: [] }).values.map(v => v[1]); return c.indexOf('schedule_start') >= 0 ? 'schedule_start' : (c.indexOf('start_date') >= 0 ? 'start_date' : null); });
  const before = await page.evaluate(c => { const r = window.APP.db.exec('SELECT task_id, ' + c + ' FROM tasks LIMIT 1'); return r[0] ? r[0].values[0] : null; }, dateCol);
  console.log('§TASK_BASELINE col=' + dateCol + ' row=' + JSON.stringify(before));

  let lastDate = null, persistKey = null;
  for (let i = 1; i <= REPEATS; i++) {
    lastDate = '2026-12-' + String(10 + i).padStart(2, '0');
    await page.evaluate((id, nd, c) => window.APP.db.run('UPDATE tasks SET ' + c + ' = ? WHERE task_id = ?', [nd, id]), before[0], lastDate, dateCol);
    const mark = await page.evaluate(() => window.__IDBSPY.length);
    const r = await page.evaluate(() => { const SA = window.ScheduleAuthor; const url = window.APP._dbPersistUrl || window.APP.DB_URL; return SA.persistDb(window.APP.db, url, { immediate: true }).then(ok => ({ ok, url, key: SA._cacheKeyFor(url) })); });
    persistKey = r.key;
    await new Promise(rr => setTimeout(rr, 1500));
    const snap = await page.evaluate(snapshotFn);
    const entry = (snap.dbs || []).find(e => e.key === r.key);
    console.log(`\n§PERSIST_ROUND ${i}/${REPEATS} ok=${r.ok} key=${r.key}`);
    showSnap('A1-afterPersist#' + i, snap);
    dumpSpy('persist#' + i, await page.evaluate(m => window.__IDBSPY.slice(m), mark));
    check(`P2.${i} persistDb reported ok`, r.ok === true, JSON.stringify(r));
    check(`P3.${i} store HAS the key it just wrote, at the NEW size`, !!entry && entry.size === exp.arrLen, entry ? MB(entry.size) + ' vs export ' + MB(exp.arrLen) : 'ENTRY ABSENT');
    check(`P4.${i} the edited slot carries a FRESH LRU timestamp (else it is evicted first)`, (snap.timestamps || []).indexOf(r.key) >= 0, 'timestamps=[' + (snap.timestamps || []).join(',') + ']');
  }

  const readback = await page.evaluate(async (key, id, col, want) => {
    const SQL = window.APP._SQL || window.SQL || window._SQL_CACHED;
    if (!SQL) return { err: 'no sql.js factory on window' };
    const idb = await window.APP.openCacheDB();
    const buf = await new Promise(res => { const tx = idb.transaction('dbs', 'readonly'); const rq = tx.objectStore('dbs').get(key); rq.onsuccess = () => res(rq.result); rq.onerror = () => res(null); });
    if (!buf) return { err: 'no entry under key', key };
    try { const d = new SQL.Database(new Uint8Array(buf)); const r = d.exec('SELECT ' + col + " FROM tasks WHERE task_id = '" + id.replace(/'/g, "''") + "'"); const g = r[0] ? String(r[0].values[0][0]) : null; d.close(); return { size: buf.byteLength, got: g, want, match: g === want }; }
    catch (e) { return { err: String(e), size: buf.byteLength }; }
  }, persistKey, before[0], dateCol, lastDate);
  console.log('\n§READBACK ' + JSON.stringify(readback));
  check('P5 READ-BACK — persisted blob really contains the newest edit', readback.match === true, JSON.stringify(readback));
  await b1.close();

  // ══ PHASE B — reload. meta is read from cache, THEN the geo write aborts and force-evicts. ═════
  const runReload = async (tag) => {
    const lines = [], errs = [];
    const b = await launch();
    const p = await openPage(b, lines, errs);
    await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => window.APP && window.APP.db, { timeout: 300000 });
    await new Promise(r => setTimeout(r, SETTLE));
    const live = await p.evaluate((id, col) => { try { const r = window.APP.db.exec('SELECT ' + col + " FROM tasks WHERE task_id = '" + id.replace(/'/g, "''") + "'"); return r[0] ? String(r[0].values[0][0]) : '(no row)'; } catch (e) { return '(no tasks table)'; } }, before[0], dateCol);
    const snap = await p.evaluate(snapshotFn);
    const spy = await p.evaluate(() => window.__IDBSPY.slice());
    console.log(`\n§RELOAD ${tag} liveEditValue=${live}`);
    showSnap(tag, snap);
    dumpSpy(tag, spy);
    const cl = lines.filter(l => /§CACHE_|§QUOTA|§SCHED_PERSIST|§IDB_|§PERSIST/.test(l));
    cl.forEach(l => console.log('     ' + l));
    await b.close();
    return { live, snap, spy };
  };

  const B = await runReload('PHASE-B-reload1');
  const entryB = (B.snap.dbs || []).find(e => e.key === persistKey);
  check('P6 after ONE reload the edited slot still exists in IDB', !!entryB && entryB.size > 0,
    entryB ? MB(entryB.size) : 'EVICTED — DATA LOSS (this is the bug)');

  const C = await runReload('PHASE-C-reload2');
  check('P7 THE USER-VISIBLE TRUTH — the edit is still there after a second reload',
    C.live === lastDate, 'want=' + lastDate + ' got=' + C.live);

  console.log('\n§SUMMARY building=' + BUILDING + ' pass=' + pass + ' fail=' + fail);
  fs.rmSync(MARKER, { force: true });
  server.kill();
  try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch(e => {
  console.error('§FATAL ' + e.stack);
  try { fs.rmSync(PROFILE_DIR, { recursive: true, force: true }); } catch (e2) {}
  process.exit(1);
});
