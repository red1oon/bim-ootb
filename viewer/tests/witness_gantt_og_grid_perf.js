#!/usr/bin/env node
// witness_gantt_og_grid_perf.js — §OG_GRID_Z_BAND (2026-08-05) + §GANTT_REFOLD_HANG (2026-08-10).
// Proves two things about the §PHASE_OVERLAP_SUPPORT_GUARD pass (time_machine.js _ogSupportGuard):
//   1. CORRECTNESS: the Z-banded grid produces the EXACT same push decisions as a brute-force
//      O(n^2) reference with no grid at all — the Z-banding only prunes which cells get SCANNED,
//      the inner predicate is identical, so this proves the pruning drops nothing real.
//   2. PERFORMANCE: a ceiling on Terminal (the worst real fixture — small footprint, 22 stacked
//      storeys) so a future change can't silently reintroduce the multi-second block this fixed.
//      Measured pre-fix: 4636ms. Post-fix: ~2840ms.
//
// 2026-08-10 rewrite (§GANTT_REFOLD_HANG): the old version sliced the block by RAW TEXT MARKS and
// its end-mark had rotted silently — §4D_LAYER_TRUTH (2026-08-07) reworded the log line it
// anchored on, so this witness threw "end mark not found" on every run since, and nothing noticed
// (CI does not run it). The pass now lives in a NAMED function (_ogSupportGuard, async,
// chunk-yielding) — sliced by name + brace balance, stable against comment/log rewording. The
// brute-force reference is ALSO brought up to the block's CURRENT semantics, which the old
// reference predated: fixpoint sweeps (≤16), unbounded-above bearing (S.tz >= T.bz - GAP), and
// the hang branch (no bearing → carrier above). Reference stays deliberately independent code
// (not sliced) so a bug shared by both implementations cannot hide here.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
const SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));

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
assert(guardSrc.length > 1000, 'sliced _ogSupportGuard by NAME (brace-balanced, ' + guardSrc.length + ' chars — no more rotting text end-marks)');

function loadRules() {
  var txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  var start = txt.indexOf('var RATES = {');
  var defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  var end = txt.indexOf('};', defIdx) + 2;
  var slice = txt.slice(start, end);
  return (new Function(slice + '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT };'))();
}

function realScheduledFrom(rows, matchRule, rules) {
  return rows.map(function (row, i) {
    const cls = row[1], cx = row[2], cy = row[3], cz = row[4], bx = row[5], by = row[6], bz = row[7];
    const rule = matchRule(cls, rules.SEQUENCE_RULES, rules.SEQUENCE_DEFAULT);
    const t0 = i * 60000;
    return { guid: row[0], s: t0, e: t0 + 60000, cls: cls, seq: rule.sequence,
      bz: cz - bz / 2, tz: cz + bz / 2, x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2 };
  });
}

// Brute-force O(n^2) reference at the block's CURRENT semantics — fixpoint sweeps with the same
// in-place-mutate-as-you-go cascade (a candidate's .e may already reflect its own push from this
// sweep — that cascading is load-bearing), unbounded-above bearing, wall branch only for promoted
// slabs, hang branch (no bearing → structure carrier above T.tz). Independent code, not sliced.
function bruteForcePush(work) {
  const EPS = 0.05, GAP = 0.5;
  const xy = function (a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; };
  work.sort(function (a, b) { return a.bz - b.bz; });
  const pushed = {};
  work.forEach(function (e) { pushed[e.guid] = false; });
  for (let sweep = 0; sweep < 16; sweep++) {
    let moved = 0;
    work.forEach(function (T) {
      const promotedSlab = (T.cls === 'IfcSlab' && T.seq > 4);
      let lastEnd = 0, hasBearing = false;
      for (let i = 0; i < work.length; i++) {
        const S = work[i]; if (S.guid === T.guid) continue;
        const isStruct = S.seq <= 4;
        const isWall = S.cls.indexOf('IfcWall') === 0;
        if ((isStruct || (promotedSlab && isWall)) &&
            S.bz < T.bz - EPS && S.tz >= T.bz - GAP && xy(S, T)) {
          hasBearing = true; if (S.e > lastEnd) lastEnd = S.e;
        }
      }
      if (!hasBearing && T.seq > 4) {
        for (let i = 0; i < work.length; i++) {
          const H = work[i]; if (H.guid === T.guid || H.seq > 4) continue;
          if (H.bz >= T.tz - GAP && H.bz <= T.tz + GAP && H.tz > T.tz + EPS &&
              xy(H, T) && H.e > lastEnd) lastEnd = H.e;
        }
      }
      if (lastEnd && T.s < lastEnd) {
        const dur = Math.max(60000, T.e - T.s);
        T.s = lastEnd + 1; T.e = T.s + dur;
        pushed[T.guid] = true; moved++;
      }
    });
    if (!moved) break;
  }
  return pushed;
}

function makeSandbox(scheduled) {
  const sandbox = { _allScheduled: scheduled, ScheduleGate: { CELL: 4 }, console: console, Math: Math,
    _TM_CHUNK: 2500, _tmYield: function () { return Promise.resolve(); } };
  vm.createContext(sandbox);
  vm.runInContext(guardSrc + '\nthis.__guard = _ogSupportGuard;', sandbox);
  return sandbox;
}

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const rules = loadRules();
  const matchRule = ScheduleAuthor.matchRule;
  const Q = "SELECT m.guid, m.ifc_class, COALESCE(t.center_x,0), COALESCE(t.center_y,0), COALESCE(t.center_z,0), " +
    "COALESCE(t.bbox_x,0), COALESCE(t.bbox_y,0), COALESCE(t.bbox_z,0) FROM elements_meta m " +
    "LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'";

  // ── CORRECTNESS — small fixture, O(n^2) fixpoint reference is cheap enough to be honest ──
  const smallPath = path.join(BLD_DIR, 'Duplex_extracted.db');
  if (fs.existsSync(smallPath)) {
    const db = new SQL.Database(fs.readFileSync(smallPath));
    const rows = db.exec(Q)[0].values;
    db.close();
    const refPushed = bruteForcePush(realScheduledFrom(rows, matchRule, rules));
    const scheduled = realScheduledFrom(rows, matchRule, rules);
    const origS = {};
    scheduled.forEach(function (e) { origS[e.guid] = e.s; });
    const sb = makeSandbox(scheduled);
    await sb.__guard(sb._allScheduled, null);   // null yieldFn = fully synchronous
    let mismatches = 0, total = 0;
    for (const guid in refPushed) {
      total++;
      const realSaysPush = sb._allScheduled.find(function (e) { return e.guid === guid; }).s !== origS[guid];
      if (refPushed[guid] !== realSaysPush) mismatches++;
    }
    assert(mismatches === 0, 'Duplex: grid-based push decisions match the O(n^2) fixpoint brute-force reference exactly — mismatches=' + mismatches + '/' + total);
  } else {
    console.log('§SKIP correctness check — Duplex fixture missing');
  }

  // ── PERFORMANCE — Terminal, the worst real fixture for this pass ──
  const bigPath = path.join(BLD_DIR, 'Terminal_extracted.db');
  if (fs.existsSync(bigPath)) {
    const db = new SQL.Database(fs.readFileSync(bigPath));
    const rows = db.exec(Q)[0].values;
    db.close();
    const scheduled = realScheduledFrom(rows, matchRule, rules);
    const sb = makeSandbox(scheduled);
    const t0 = process.hrtime.bigint();
    const pushedN = await sb.__guard(sb._allScheduled, null);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log('§OG_GRID_PERF Terminal n=' + scheduled.length + ' ms=' + ms.toFixed(1) + ' pushed=' + pushedN);
    assert(ms < 3500, 'Terminal (48,428 elements) completes under 3500ms — measured=' + ms.toFixed(1) + 'ms (pre-§OG_GRID_Z_BAND was 4636ms)');
  } else {
    console.log('§SKIP performance check — Terminal fixture missing');
  }

  console.log('\n§W-OG-GRID SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§OG_GRID_ERROR', e); process.exit(1); });
