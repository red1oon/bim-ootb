#!/usr/bin/env node
/* ⚠ WITNESS — W-ONE-KERNEL-OPS, §A3a "one kernel_ops, guards restored". READ THE LOG after every run.
 *
 * ISSUE IT PROVES OR DISPROVES: the live Viewer loads ONLY erp/kernel_ops.js, but five persist guards lived only in the
 * (never-loaded) viewer/kernel_ops.js: READONLY_OPS defer, §KRN_PERSIST_GUARD (foreign db), §TM_SPLITMODE_PERSIST_KEY,
 * §SCHED_PERSIST_KEY (IDB key = DbResolve.cacheKey), _cacheDisabled. They are now in erp/kernel_ops.js; viewer/kernel_ops.js is gone.
 *
 * METHOD: load the REAL kernel_ops.js in node (window/APP shims, the real viewer/db_resolve.js, a Map-backed fake IndexedDB, a
 * fake timer, a lock shim recording lock names), count db.export() calls, read what actually reached "IDB".
 * Targets: TARGET = erp/kernel_ops.js (must PASS every claim) · BASELINE = git 38fbb8fb:erp/kernel_ops.js (must FAIL, the
 * before-proof) · MUTANT = TARGET with the READONLY gate removed (must FAIL, else the witness cannot say NO).
 * Zero claims judged -> INCONCLUSIVE (exit 2). RUN: node viewer/tests/witness_one_kernel_ops.js
 */
'use strict';
var fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
var ROOT = path.join(__dirname, '..', '..');
var BASE_COMMIT = '38fbb8fb';
var SQLJS = [process.env.SQLJS_DIR, '/home/red1/bim-compiler/node_modules/sql.js/dist', path.join(ROOT, 'node_modules/sql.js/dist')].filter(Boolean)
  .find(function (d) { return fs.existsSync(path.join(d, 'sql-wasm.js')); });
if (!SQLJS) { console.log('§A3a_VERDICT INCONCLUSIVE — sql.js not found'); process.exit(2); }
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;

var DbResolve = require(path.join(ROOT, 'viewer', 'db_resolve.js'));
var SHIPPED = 'https://red1oon.github.io/bim-ootb/buildings/Duplex_extracted.db';
var SPLIT_META = 'https://red1oon.github.io/bim-ootb/buildings/Hospital_meta.db';
var PROD_BASE = 'https://red1oon.github.io/bim-ootb/';
var RO_TYPES = ['ELEMENT_PICK', 'BUILDING_OPEN', 'WING_PLANE', 'EXPORT_2D'];

var realSetTimeout = setTimeout;
var SQL;
var wait = function (ms) { return new Promise(function (r) { realSetTimeout(r, ms); }); };

// ── environment ──────────────────────────────────────────────────────────────────────────────
function makeEnv(koFile, appCfg) {          // appCfg === null -> no window.APP (an ERP page)
  var timers = [], tid = 0, logs = [], idbMap = new Map(), puts = [], locks = [], exports = { n: 0 };
  var idb = {
    objectStoreNames: { contains: function (n) { return n === 'dbs'; } },
    transaction: function () { return { objectStore: function () { return {
      get: function (k) { var rq = {}; Promise.resolve().then(function () { rq.result = idbMap.get(k); if (rq.onsuccess) rq.onsuccess(); }); return rq; },
      put: function (v, k) { idbMap.set(k, v); puts.push(k); } }; } }; }
  };
  var winObj = { DbResolve: DbResolve };
  global.window = winObj;
  if (appCfg) { winObj.APP = global.APP = Object.assign({ openCacheDB: function () { return Promise.resolve(idb); } }, appCfg); }
  else { delete global.APP; }
  global.setTimeout = function (fn, ms) { timers.push({ id: ++tid, fn: fn, at: ms }); return tid; };
  global.clearTimeout = function (id) { timers = timers.filter(function (t) { return t.id !== id; }); };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: { request: function (name, cb) { locks.push(name); return cb(); } } } });
  var origLog = console.log, origWarn = console.warn;
  console.log = function () { logs.push([].join.call(arguments, ' ')); };
  console.warn = function () { logs.push('WARN ' + [].join.call(arguments, ' ')); };
  delete require.cache[require.resolve(koFile)];
  require(koFile);
  var KO = winObj.KernelOps;
  return {
    KO: KO, APP: winObj.APP, idb: idbMap, puts: puts, locks: locks, logs: logs, exports: exports,
    mkdb: function () { var d = new SQL.Database(); var orig = d.export; d.export = function () { exports.n++; return orig.call(d); }; KO.ensureTable(d); return d; },
    fire: async function () { var due = timers.slice(); timers = []; due.forEach(function (t) { t.fn(); }); await wait(120); },   // the 2 s debounce elapses
    pending: function () { return timers.length; },
    restore: function () { console.log = origLog; console.warn = origWarn; global.setTimeout = realSetTimeout; global.clearTimeout = clearTimeout; delete global.APP; delete global.window; },
    has: function (s) { return logs.some(function (l) { return l.indexOf(s) >= 0; }); }
  };
}
function opRows(buf) { var d = new SQL.Database(new Uint8Array(buf)); var r = d.exec('SELECT op_type FROM kernel_ops ORDER BY id'); d.close(); return r.length ? r[0].values.map(function (v) { return v[0]; }) : []; }

// ── claims: each returns [ {id, ok, detail} ] ────────────────────────────────────────────────
async function claims(koFile) {
  var out = [];
  function J(id, ok, detail) { out.push({ id: id, ok: !!ok, detail: detail }); }
  var e;

  // C1 — read-only ops defer; their rows ride the next mutating persist
  for (var i = 0; i < RO_TYPES.length; i++) {
    e = makeEnv(koFile, { DB_URL: SHIPPED, PROD_BASE: PROD_BASE }); e.APP.db = e.mkdb();
    try {
      e.KO.commitOp(e.APP.db, RO_TYPES[i], { x: 1 });
      await e.fire();
      var okRO = e.exports.n === 0 && e.puts.length === 0 && e.has('§KRN_PERSIST_DEFER type=' + RO_TYPES[i]);
      J('C1a ' + RO_TYPES[i] + ' commit -> 0 exports, 0 IDB puts, §KRN_PERSIST_DEFER', okRO, 'exports=' + e.exports.n + ' puts=' + e.puts.length + ' defer=' + e.has('§KRN_PERSIST_DEFER'));
    } finally { e.restore(); }
  }
  e = makeEnv(koFile, { DB_URL: SHIPPED, PROD_BASE: PROD_BASE }); e.APP.db = e.mkdb();
  try {
    RO_TYPES.forEach(function (t) { e.KO.commitOp(e.APP.db, t, { x: 1 }); });
    e.KO.commitOp(e.APP.db, 'GRID_MOVE', { dx: 1 });
    await e.fire();
    var k = DbResolve.cacheKey(SHIPPED, PROD_BASE), stored = e.idb.get(k) || e.idb.get(SHIPPED), rows = stored ? opRows(stored) : [];
    J('C1b RO rows present in the next mutating op\'s persisted bytes', RO_TYPES.every(function (t) { return rows.indexOf(t) >= 0; }) && rows.indexOf('GRID_MOVE') >= 0, 'rows=' + rows.join(','));
  } finally { e.restore(); }

  // C2 — mutating op: exactly 1 export, canonical key, tip follows the key, raw-url slot empty
  e = makeEnv(koFile, { DB_URL: SHIPPED, PROD_BASE: PROD_BASE }); e.APP.db = e.mkdb();
  try {
    e.KO.commitOp(e.APP.db, 'GRID_MOVE', { dx: 1 });
    await e.fire();
    var key = DbResolve.cacheKey(SHIPPED, PROD_BASE);
    J('C2a mutating op -> exactly 1 export', e.exports.n === 1, 'exports=' + e.exports.n);
    J('C2b shipped url key == DbResolve.cacheKey(url) ("buildings/Duplex_extracted.db"), tip key == key+"::tip"',
      key === 'buildings/Duplex_extracted.db' && e.idb.has(key) && e.idb.has(key + '::tip'), 'puts=' + e.puts.join('|') + ' expectKey=' + key);
    J('C2c raw-url slot NOT written (nothing reads it)', !e.idb.has(SHIPPED) && !e.idb.has(SHIPPED + '::tip'), 'rawSlot=' + e.idb.has(SHIPPED));
    J('C2d navigator.locks name follows the key', e.locks.indexOf('krn_persist:' + key) >= 0, 'locks=' + e.locks.join('|'));
  } finally { e.restore(); }

  // C3 — split mode
  e = makeEnv(koFile, { DB_URL: SHIPPED, _dbPersistUrl: SPLIT_META, PROD_BASE: PROD_BASE }); e.APP.db = e.mkdb();
  try {
    e.KO.commitOp(e.APP.db, 'GRID_MOVE', { dx: 1 });
    await e.fire();
    var sk = DbResolve.cacheKey(SPLIT_META, PROD_BASE);
    J('C3 split mode: key derived from APP._dbPersistUrl', e.idb.has(sk) && !e.idb.has(DbResolve.cacheKey(SHIPPED, PROD_BASE)), 'puts=' + e.puts.join('|') + ' expectKey=' + sk);
  } finally { e.restore(); }

  // C4 — foreign db: 0 writes, logged, pending legit persist NOT cancelled
  e = makeEnv(koFile, { DB_URL: SHIPPED, PROD_BASE: PROD_BASE }); e.APP.db = e.mkdb(); var foreign = e.mkdb();
  try {
    e.KO.commitOp(e.APP.db, 'GRID_MOVE', { dx: 1 });            // legit persist pending
    var pendBefore = e.pending();
    e.KO.commitOp(foreign, 'GRID_ADD', { lens: 1 });             // lens commit on its own op db
    J('C4a foreign commit logs §KRN_PERSIST_SKIP foreign db and arms no timer / cancels none', e.has('§KRN_PERSIST_SKIP foreign db') && e.pending() === pendBefore && pendBefore === 1, 'pending ' + pendBefore + '->' + e.pending());
    await e.fire();
    var bytes = e.idb.get(DbResolve.cacheKey(SHIPPED, PROD_BASE)) || e.idb.get(SHIPPED), r4 = bytes ? opRows(bytes) : [];
    J('C4b pending legit persist survived and holds the building ops only (no foreign GRID_ADD)', e.exports.n === 1 && r4.join() === 'GRID_MOVE', 'exports=' + e.exports.n + ' rows=' + r4.join(','));
    e.restore();
    e = makeEnv(koFile, { DB_URL: SHIPPED, PROD_BASE: PROD_BASE }); e.APP.db = e.mkdb(); foreign = e.mkdb();
    e.KO.commitOp(foreign, 'GRID_ADD', { lens: 1 }); await e.fire();
    J('C4c foreign commit alone -> 0 exports, 0 IDB writes', e.exports.n === 0 && e.puts.length === 0, 'exports=' + e.exports.n + ' puts=' + e.puts.length);
  } finally { e.restore(); }

  // C5 — no window.APP (an ERP page): no persist, exactly as before
  e = makeEnv(koFile, null); var d5 = e.mkdb();
  try {
    e.KO.commitOp(d5, 'GRID_MOVE', { dx: 1 }); await e.fire();
    J('C5 no window.APP -> 0 exports, 0 IDB writes (dbUrl null)', e.exports.n === 0 && e.puts.length === 0, 'exports=' + e.exports.n + ' puts=' + e.puts.length);
  } finally { e.restore(); }

  // C6 — T6 stale-tip refusal (negative control: a foreign stored tip must still block the write)
  e = makeEnv(koFile, { DB_URL: SHIPPED, PROD_BASE: PROD_BASE }); e.APP.db = e.mkdb();
  try {
    var kk = DbResolve.cacheKey(SHIPPED, PROD_BASE);
    [kk, SHIPPED].forEach(function (x) { e.idb.set(x + '::tip', 'f'.repeat(64)); e.idb.set(x, 'newer-tab-blob'); });
    e.KO.commitOp(e.APP.db, 'GRID_MOVE', { dx: 1 }); await e.fire();
    J('C6 T6: stored foreign tip -> write refused (§KRN_PERSIST_STALE), newer blob intact', e.has('§KRN_PERSIST_STALE') && e.puts.length === 0 && e.idb.get(kk) === 'newer-tab-blob', 'puts=' + e.puts.length + ' stale=' + e.has('§KRN_PERSIST_STALE'));
  } finally { e.restore(); }

  // C7 — commitGroup: READONLY-only defers, any mutating op persists
  e = makeEnv(koFile, { DB_URL: SHIPPED, PROD_BASE: PROD_BASE }); e.APP.db = e.mkdb();
  try {
    var g1 = await e.KO.commitGroup(e.APP.db, [{ op_type: 'ELEMENT_PICK', params: { a: 1 } }, { op_type: 'WING_PLANE', params: { b: 1 } }], {});
    await e.fire();
    J('C7a READONLY-only group -> committed, 0 exports, 0 puts', g1.committed === true && e.exports.n === 0 && e.puts.length === 0, 'committed=' + g1.committed + ' exports=' + e.exports.n);
    var g2 = await e.KO.commitGroup(e.APP.db, [{ op_type: 'ELEMENT_PICK', params: { a: 2 } }, { op_type: 'GRID_MOVE', params: { b: 2 } }], {});
    await e.fire();
    J('C7b mixed group -> committed, exactly 1 export', g2.committed === true && e.exports.n === 1, 'committed=' + g2.committed + ' exports=' + e.exports.n);
  } finally { e.restore(); }
  return out;
}

// ── main ─────────────────────────────────────────────────────────────────────────────────────
(async function () {
  SQL = await require(path.join(SQLJS, 'sql-wasm.js'))({ locateFile: function (f) { return path.join(SQLJS, f); } });
  var TARGET = path.join(ROOT, 'erp', 'kernel_ops.js');
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'a3a-'));
  var BASELINE = path.join(tmp, 'kernel_ops_base.js'), MUTANT = path.join(tmp, 'kernel_ops_mutant.js');
  var haveBase = true;
  try { fs.writeFileSync(BASELINE, cp.execFileSync('git', ['-C', ROOT, 'show', BASE_COMMIT + ':erp/kernel_ops.js'], { maxBuffer: 1 << 26 })); } catch (err) { haveBase = false; }
  var tsrc = fs.readFileSync(TARGET, 'utf8'), gate = 'if (READONLY_OPS[opType]) {';
  var gateOk = tsrc.indexOf(gate) >= 0;
  fs.writeFileSync(MUTANT, tsrc.replace(gate, 'if (false) {'));

  function report(label, res) {
    res.forEach(function (r) { process.stdout.write('§A3a ' + label + ' ' + (r.ok ? 'PASS' : 'FAIL') + ' ' + r.id + ' — ' + r.detail + '\n'); });
    return { judged: res.length, failed: res.filter(function (r) { return !r.ok; }).length };
  }
  var rT = report('TARGET', await claims(TARGET));
  var rB = haveBase ? report('BASELINE@' + BASE_COMMIT, await claims(BASELINE)) : null;
  var rM = gateOk ? report('MUTANT(no READONLY gate)', await claims(MUTANT)) : null;
  fs.rmSync(tmp, { recursive: true, force: true });

  var summary = 'target judged=' + rT.judged + ' failed=' + rT.failed + ' | baseline ' + (rB ? 'judged=' + rB.judged + ' failed=' + rB.failed : 'UNAVAILABLE') +
                ' | mutant ' + (rM ? 'judged=' + rM.judged + ' failed=' + rM.failed : 'UNAVAILABLE(gate text not found)');
  var verdict;
  if (rT.judged === 0 || !rB || !rM) verdict = 'INCONCLUSIVE';
  else if (rT.failed === 0 && rB.failed > 0 && rM.failed > 0) verdict = 'PASS';
  else verdict = 'FAIL';
  console.log('§A3a_VERDICT ' + verdict + ' — ' + summary);
  process.exit(verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 1 : 2);
})().catch(function (err) { console.log('§A3a_VERDICT FAIL — harness error: ' + (err && err.stack || err)); process.exit(1); });
