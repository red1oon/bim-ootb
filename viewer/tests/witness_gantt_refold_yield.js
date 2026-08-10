#!/usr/bin/env node
// witness_gantt_refold_yield.js — §GANTT_REFOLD_HANG (2026-08-10, 4D_SCHEDULE_PERFECTION.md
// handoff 2026-08-06). Issue it proves/disproves: injectGantt()'s two hot loops (the
// §PHASE_OVERLAP_SUPPORT_GUARD sweep pass and the §WRITE_LOOP_TIMING per-row UPDATE pass) froze
// the browser tab on Hospital (63,415 elements — live console paste: the stream stopped dead
// between the guard's log and §WRITE_LOOP_TIMING's, which never printed). Fix under test:
// both passes run chunked (_TM_CHUNK batches) yielding to the event loop between batches, and
// the write pass commits ONE txn PER CHUNK (never holds BEGIN across a yield).
//
// Per the handoff spec, this witness proves BOTH halves — a wall-clock ceiling alone would only
// prove fast, not non-blocking:
//   (a) IDENTITY — chunk-yielding changes NOTHING about the output: the guard pass produces
//       byte-identical (s,e) per element with yields vs fully-sync, on real Terminal geometry;
//       the chunked writer produces byte-identical kernel_ops rows vs the pre-fix single-txn
//       reference loop (copied verbatim below from the pre-change source).
//   (b) YIELDING — on Hospital-scale real data the passes actually yield (count > 0) and no
//       single synchronous span between yields exceeds SPAN_MS (200ms).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
const SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));

const SPAN_MS = 200;
let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');
function sliceFn(src, header) {
  const idx = src.indexOf(header);
  if (idx < 0) throw new Error(header + ' not found — renamed/moved?');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + header);
}
const guardSrc = sliceFn(tmSrc, 'async function _ogSupportGuard(');
const writerSrc = sliceFn(tmSrc, 'async function _writeScheduledChunked(');

function loadRules() {
  var txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  var start = txt.indexOf('var RATES = {');
  var defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  var end = txt.indexOf('};', defIdx) + 2;
  return (new Function(txt.slice(start, end) + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT };'))();
}
function realScheduledFrom(rows, matchRule, rules) {
  return rows.map(function (row, i) {
    const cls = row[1], cx = row[2], cy = row[3], cz = row[4], bx = row[5], by = row[6], bz = row[7];
    const rule = matchRule(cls, rules.SEQUENCE_RULES, rules.SEQUENCE_DEFAULT);
    const t0 = i * 60000;
    return { guid: row[0], s: t0, e: t0 + 60000, cls: cls, seq: rule.sequence,
      bz: cz - bz / 2, tz: cz + bz / 2, x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2,
      params: {}, task: 't1' };
  });
}
function makeSandbox(extra) {
  const sandbox = Object.assign({ ScheduleGate: { CELL: 4 }, console: console, Math: Math, JSON: JSON,
    performance: { now: () => Date.now() }, _TM_CHUNK: 2500,
    _tmYield: function () { return Promise.resolve(); } }, extra || {});
  vm.createContext(sandbox);
  vm.runInContext(guardSrc + '\n' + writerSrc + '\nthis.__guard = _ogSupportGuard; this.__writer = _writeScheduledChunked;', sandbox);
  return sandbox;
}
// Instrumented yield: counts calls + records the synchronous span (ms) since the previous yield
// (or since start). THIS is the non-blocking proof — max span bounds the longest time the browser
// main thread would be held.
function spanYield() {
  const state = { count: 0, spans: [], last: Date.now(), start() { this.last = Date.now(); } };
  state.fn = function () { const now = Date.now(); state.spans.push(now - state.last); state.count++;
    return new Promise(function (r) { setImmediate(function () { state.last = Date.now(); r(); }); }); };
  state.finish = function () { state.spans.push(Date.now() - state.last); };
  return state;
}
const Q = "SELECT m.guid, m.ifc_class, COALESCE(t.center_x,0), COALESCE(t.center_y,0), COALESCE(t.center_z,0), " +
  "COALESCE(t.bbox_x,0), COALESCE(t.bbox_y,0), COALESCE(t.bbox_z,0) FROM elements_meta m " +
  "LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'";
const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const rules = loadRules();
  const matchRule = ScheduleAuthor.matchRule;

  for (const bld of ['Terminal_extracted.db', 'Hospital_extracted.db']) {
    const dbPath = path.join(BLD_DIR, bld);
    if (!fs.existsSync(dbPath)) { console.log('§SKIP ' + bld + ' — fixture missing'); continue; }
    const src = new SQL.Database(fs.readFileSync(dbPath));
    const rows = src.exec(Q)[0].values;
    src.close();

    // ── (a1) GUARD IDENTITY: yielding vs fully-sync on identical inputs ──
    const sbSync = makeSandbox({ _allScheduled: realScheduledFrom(rows, matchRule, rules) });
    await sbSync.__guard(sbSync._allScheduled, null);
    const sbY = makeSandbox({ _allScheduled: realScheduledFrom(rows, matchRule, rules) });
    const ySt = spanYield(); ySt.start();
    await sbY.__guard(sbY._allScheduled, ySt.fn);
    ySt.finish();
    const mapSync = {}; sbSync._allScheduled.forEach(e => { mapSync[e.guid] = e.s + '|' + e.e; });
    let diff = 0; sbY._allScheduled.forEach(e => { if (mapSync[e.guid] !== e.s + '|' + e.e) diff++; });
    const gMax = Math.max.apply(null, ySt.spans);
    console.log('§REFOLD_YIELD_GUARD bld=' + bld + ' n=' + rows.length + ' yields=' + ySt.count + ' maxSpanMs=' + gMax);
    assert(diff === 0, 'W-RFY-1 ' + bld + ' guard: chunk-yield output IDENTICAL to fully-sync (diff=' + diff + '/' + rows.length + ')');
    assert(ySt.count > 0, 'W-RFY-2 ' + bld + ' guard actually yields (count=' + ySt.count + ')');
    assert(gMax < SPAN_MS, 'W-RFY-3 ' + bld + ' guard: no sync span >= ' + SPAN_MS + 'ms (max=' + gMax + 'ms) — non-blocking, not just fast');

    // ── (a2) WRITER IDENTITY: chunked per-chunk-txn vs the pre-fix single-txn loop, byte-equal rows ──
    function freshOpsDb(scheduled) {
      const db = new SQL.Database();
      db.run('CREATE TABLE kernel_ops (id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL, op_type TEXT NOT NULL, parameters TEXT NOT NULL, input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0)');
      const ins = db.prepare("INSERT INTO kernel_ops (timestamp,op_type,parameters,input_guids,output_guid,undone) VALUES (0,'ELEMENT_PLACE','{}','[]',?,0)");
      scheduled.forEach(e => ins.run([e.guid]));
      ins.free();
      return db;
    }
    const schedA = realScheduledFrom(rows, matchRule, rules);
    const schedB = realScheduledFrom(rows, matchRule, rules);
    const dbA = freshOpsDb(schedA), dbB = freshOpsDb(schedB);
    // reference = the pre-§GANTT_REFOLD_HANG write loop, copied VERBATIM from the pre-change
    // source (one BEGIN, one COMMIT, one txn for everything) — the behavior being preserved.
    (function referenceLoop(db, _allScheduled) {
      db.run('BEGIN');
      var _upd = db.prepare("UPDATE kernel_ops SET timestamp = ?, parameters = ? WHERE op_type = 'ELEMENT_PLACE' AND output_guid = ?");
      _allScheduled.forEach(function (item) {
        item.params._end_ts = item.e;
        item.params._captured = 1;
        item.params._task = item.task;
        _upd.run([item.s, JSON.stringify(item.params), item.guid]);
      });
      _upd.free();
      db.run('COMMIT');
    })(dbA, schedA);
    const wSt = spanYield(); wSt.start();
    const sbW = makeSandbox({});
    await sbW.__writer(dbB, schedB, wSt.fn);
    wSt.finish();
    const dumpQ = "SELECT timestamp, parameters, output_guid FROM kernel_ops ORDER BY output_guid";
    const dumpA = JSON.stringify(dbA.exec(dumpQ));
    const dumpB = JSON.stringify(dbB.exec(dumpQ));
    dbA.close(); dbB.close();
    const wMax = Math.max.apply(null, wSt.spans);
    console.log('§REFOLD_YIELD_WRITER bld=' + bld + ' rows=' + rows.length + ' yields=' + wSt.count + ' maxSpanMs=' + wMax);
    assert(dumpA === dumpB, 'W-RFY-4 ' + bld + ' writer: chunked per-chunk-txn kernel_ops rows byte-identical to the pre-fix single-txn loop');
    assert(wSt.count > 0, 'W-RFY-5 ' + bld + ' writer actually yields (count=' + wSt.count + ')');
    assert(wMax < SPAN_MS, 'W-RFY-6 ' + bld + ' writer: no sync span >= ' + SPAN_MS + 'ms (max=' + wMax + 'ms) — the Hospital freeze class is structurally gone');
  }

  console.log('\n§GANTT_REFOLD_YIELD SUMMARY pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL'); process.exit(1); }
  console.log('PASS — chunk-yield output identical, spans bounded: the tab is never held longer than one chunk');
})().catch(function (e) { console.error('§REFOLD_YIELD_ERROR', e); process.exit(1); });
