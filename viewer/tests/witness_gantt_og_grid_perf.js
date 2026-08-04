#!/usr/bin/env node
// witness_gantt_og_grid_perf.js — §OG_GRID_Z_BAND (2026-08-05). Proves two things about
// §PHASE_OVERLAP_SUPPORT_GUARD's cell-bucket pass (time_machine.js, "var _ogCELL" block):
//   1. CORRECTNESS: the Z-banded grid produces the EXACT same push decisions as a brute-force
//      O(n^2) reference with no grid at all — the Z-banding only prunes which cells get SCANNED,
//      the inner predicate is byte-identical, so this proves the pruning drops nothing real.
//   2. PERFORMANCE: a ceiling on Terminal (the worst real fixture — small footprint, 22 stacked
//      storeys) so a future change can't silently reintroduce the multi-second block this fixed.
//      Measured pre-fix: 4636ms. Post-fix: ~2840ms. Ceiling set well above measured noise, tight
//      enough to catch a real regression back toward the old XY-only behavior.
// Sliced by raw text span (flat sequential statements, not a named function — brace-balance
// checked before running), same "never reimplement the block under test" convention this repo
// already uses for matchRule/commitGanttDrag/undoLastGanttEdit.
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
const startMark = 'var _ogCELL = ';
const endMark = "if (_ogPushed) console.log('§PHASE_OVERLAP_SUPPORT_GUARD pushed=' + _ogPushed + '/' + _allScheduled.length +\n        ' elements later than their §PHASE_OVERLAP_BAND window to stay after their real structural support');";
const si = tmSrc.indexOf(startMark);
if (si < 0) throw new Error('start mark not found — has the block been renamed/moved?');
const ei = tmSrc.indexOf(endMark, si);
if (ei < 0) throw new Error('end mark not found — has the block been renamed/moved?');
const block = tmSrc.slice(si, ei + endMark.length);
let depth = 0;
for (const ch of block) { if (ch === '{') depth++; else if (ch === '}') depth--; }
assert(depth === 0, 'sliced block is brace-balanced (a self-contained statement sequence, not a truncated fragment)');

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

// Brute-force O(n^2) reference — the SAME predicate AND the same in-place-mutate-as-you-go
// semantics as the shipped block (a carrier's own bz is always below what it carries, so
// processing in ascending bz order means a candidate's .e may already reflect ITS OWN push
// applied earlier in this same pass — that cascading is load-bearing, not incidental, so an
// honest reference has to replicate it). The only real difference from the shipped code is HOW
// candidates are found: no grid at all, scan every other element every time. Deliberately
// independent code (not sliced) so a bug shared by both implementations would not hide here.
function bruteForcePush(elements) {
  const EPS = 0.05, GAP = 0.5;
  const xy = function (a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; };
  const work = elements.map(function (e) { return { guid: e.guid, s: e.s, e: e.e, cls: e.cls, seq: e.seq, bz: e.bz, tz: e.tz, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1 }; });
  work.sort(function (a, b) { return a.bz - b.bz; });
  const pushed = {};
  work.forEach(function (T) {
    const promotedSlab = (T.cls === 'IfcSlab' && T.seq > 4);
    let lastEnd = 0;
    for (let i = 0; i < work.length; i++) {
      const S = work[i]; if (S.guid === T.guid) continue;
      if (S.seq <= 4 && S.bz < T.bz - EPS && Math.abs(S.tz - T.bz) <= GAP && xy(S, T) && S.e > lastEnd) lastEnd = S.e;
      if (promotedSlab && S.cls.indexOf('IfcWall') === 0 && S.bz < T.bz - EPS && Math.abs(S.tz - T.bz) <= GAP && xy(S, T) && S.e > lastEnd) lastEnd = S.e;
    }
    if (lastEnd && T.s < lastEnd) {
      const dur = Math.max(60000, T.e - T.s);
      T.s = lastEnd + 1; T.e = T.s + dur;
      pushed[T.guid] = true;
    } else {
      pushed[T.guid] = false;
    }
  });
  return pushed;
}

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const rules = loadRules();
  const matchRule = ScheduleAuthor.matchRule;

  // ── CORRECTNESS — small fixture, O(n^2) reference is cheap enough to be honest ──
  const smallPath = path.join(BLD_DIR, 'Duplex_extracted.db');
  if (fs.existsSync(smallPath)) {
    const db = new SQL.Database(fs.readFileSync(smallPath));
    const r = db.exec("SELECT m.guid, m.ifc_class, COALESCE(t.center_x,0), COALESCE(t.center_y,0), COALESCE(t.center_z,0), " +
      "COALESCE(t.bbox_x,0), COALESCE(t.bbox_y,0), COALESCE(t.bbox_z,0) FROM elements_meta m " +
      "LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'");
    db.close();
    const _allScheduled = realScheduledFrom(r[0].values, matchRule, rules);
    const refPushed = bruteForcePush(_allScheduled);
    const origS = {};
    _allScheduled.forEach(function (e) { origS[e.guid] = e.s; });   // capture BEFORE the block mutates in place (objects are shared by reference, not deep-cloned by .slice())

    const sandbox = { _allScheduled: _allScheduled, ScheduleGate: { CELL: 4 }, console: console, Math: Math };
    vm.createContext(sandbox);
    vm.runInContext(block, sandbox);
    const realPushedIds = {};
    sandbox._allScheduled.forEach(function (T) { if (T.s !== origS[T.guid]) realPushedIds[T.guid] = T.s; });
    // Compare by "was this guid identified as needing a push at all" — refPushed has a nonzero
    // lastEnd whenever the brute force found a real carrier constraint above baseMs.
    let mismatches = 0;
    for (const guid in refPushed) {
      const realSaysPush = !!realPushedIds[guid];
      if (refPushed[guid] !== realSaysPush) mismatches++;
    }
    assert(mismatches === 0, 'Duplex: grid-based push decisions match the O(n^2) brute-force reference exactly — mismatches=' + mismatches + '/' + Object.keys(refPushed).length);
  } else {
    console.log('§SKIP correctness check — Duplex fixture missing');
  }

  // ── PERFORMANCE — Terminal, the real reported-hang fixture ──
  const bigPath = path.join(BLD_DIR, 'Terminal_extracted.db');
  if (fs.existsSync(bigPath)) {
    const db = new SQL.Database(fs.readFileSync(bigPath));
    const r = db.exec("SELECT m.guid, m.ifc_class, COALESCE(t.center_x,0), COALESCE(t.center_y,0), COALESCE(t.center_z,0), " +
      "COALESCE(t.bbox_x,0), COALESCE(t.bbox_y,0), COALESCE(t.bbox_z,0) FROM elements_meta m " +
      "LEFT JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'");
    db.close();
    const _allScheduled = realScheduledFrom(r[0].values, matchRule, rules);
    const sandbox = { _allScheduled: _allScheduled, ScheduleGate: { CELL: 4 }, console: console, Math: Math };
    vm.createContext(sandbox);
    const t0 = process.hrtime.bigint();
    vm.runInContext(block, sandbox);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log('§OG_GRID_PERF Terminal n=' + _allScheduled.length + ' ms=' + ms.toFixed(1) + ' pushed=' + sandbox._ogPushed);
    assert(ms < 3500, 'Terminal (the real reported-hang fixture, 48,428 elements) completes under 3500ms — measured=' + ms.toFixed(1) + 'ms (pre-fix was 4636ms)');
  } else {
    console.log('§SKIP performance check — Terminal fixture missing');
  }

  console.log('\n§W-OG-GRID SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§OG_GRID_ERROR', e); process.exit(1); });
