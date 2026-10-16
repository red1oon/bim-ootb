#!/usr/bin/env node
// witness_gantt_og_grid_perf.js — §OG_GRID_Z_BAND + §OG_BEARING_BOUND (revived 2026-08-11).
//
// ISSUE this witness proves/disproves (two, both real):
//   1. CORRECTNESS: §PHASE_OVERLAP_SUPPORT_GUARD's cell-bucket pass (time_machine.js, "var _ogCELL"
//      block) must produce the EXACT same push decisions as a brute-force O(n^2) reference with no
//      grid at all — the Z-banding only prunes which cells get SCANNED; if the two ever disagree,
//      the grid is silently dropping real carriers (the §OG_GRID_Z_BAND claim, 2026-08-05).
//   2. PERFORMANCE: a ceiling on Terminal (the worst real fixture — small footprint, 22 stacked
//      storeys) so a future change can't silently reintroduce the multi-second block this fixed.
//      Measured pre-§OG_GRID_Z_BAND: 4636ms.
//
// ⚠ ROT HISTORY (why this file was rewritten 2026-08-11): the original end-mark text rotted when
// §4D_LAYER_TRUTH (2026-08-07) reworded the guard's log line — this witness THREW at load ("end
// mark not found") and was effectively DEAD on main from then until today, silently testing
// nothing. Its brute-force reference had also frozen at the pre-§4D_LAYER_TRUTH semantics (single
// pass, ±GAP band, no hang branch). This rewrite: (a) end-mark matches the current log line,
// (b) the reference implements the CURRENT shipped semantics — ≤16-sweep fixpoint, bearing
// detection unbounded-above with the §OG_BEARING_BOUND two-tier gating (in-extent carriers define
// the bearing plane; enveloping carriers gate only when no in-extent one exists), wall pool for
// promoted slabs only, hang-carrier fallback for bearingless seq>4 — so a drift in EITHER
// direction (grid pruning too hard, or predicate changing without this witness noticing) FAILS.
// Deliberately independent code (not sliced) so a bug shared by both implementations cannot hide.
//
// Command: BLD_DIR=~/bim-ootb/buildings node tests/witness_gantt_og_grid_perf.js  (from viewer/)
// Read the § log lines, not exit code alone.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
const SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

// §S58 (SCRIPT_LENGTH_REFACTOR_SEAMS.md): this witness used to slice the guard block out of
// time_machine.js by RAW TEXT MARKERS — 'var _ogCELL = ' through the exact bytes of the
// §PHASE_OVERLAP_SUPPORT_GUARD console.log INCLUDING its 8-space continuation indent. That coupling
// rotted once already (2026-08-07..11, killed by a log rewording) and is now retired: the physics is
// a real module, so this calls it. Nothing here depends on indentation or log wording any more.
// The brace-balance assert retires with the slice — a required module cannot be a truncated fragment.
require(path.join(__dirname, '..', 'schedule_gate.js'));   // sets globalThis.ScheduleGate for the module
const SupportSweep = require(path.join(__dirname, '..', 'support_sweep.js'));

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

// Brute-force O(n^2) reference — CURRENT shipped semantics, grid-free:
//   ≤16 sweeps to fixpoint over an ascending-bz sort (pushes cascade — a carrier's own push earlier
//   in the same sweep is visible to its dependents; that in-place mutate-as-you-go is load-bearing);
//   bearing DETECTION unbounded above (S.tz >= T.bz-GAP, tall framed-into carriers still count);
//   §OG_BEARING_BOUND two-tier GATING (in-extent carriers — S.tz <= T.tz+GAP — define the bearing
//   plane; enveloping carriers gate only when no in-extent carrier exists);
//   wall pool offered to promoted slabs only; hang-carrier fallback for bearingless seq>4.
function bruteForcePush(elements) {
  const EPS = 0.05, GAP = 0.5;
  // §OG_HANG_BAND (2026-08-15, time_machine.js _ogSupportSweep): the hang/carrier-above search
  // (bearingless seq>4 fallback) widened from GAP=0.5 to 9.5 — reused, not re-guessed, the same
  // measured band this codebase already cited once (§HANG_NEAREST, 0.5-9.5m). Bearing stays at GAP.
  const HANG_GAP = 9.5;
  const xy = function (a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; };
  const work = elements.map(function (e) { return { guid: e.guid, s: e.s, e: e.e, cls: e.cls, seq: e.seq, bz: e.bz, tz: e.tz, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1 }; });
  work.sort(function (a, b) { return a.bz - b.bz; });
  const orig = {};
  work.forEach(function (e) { orig[e.guid] = e.s; });
  for (let sweep = 0; sweep < 16; sweep++) {
    let moved = 0;
    work.forEach(function (T) {
      const promotedSlab = (T.cls === 'IfcSlab' && T.seq > 4);
      const topBound = T.tz + GAP;
      let lastEnd = 0, envEnd = 0, hasBearing = false;
      for (let i = 0; i < work.length; i++) {
        const S = work[i]; if (S.guid === T.guid) continue;
        // §PROMOTED_CARRIER_POOL (2026-08-11): struct pool = seq<=4 ∪ promoted slabs, aligned with
        // auditFloating — mirrors the shipped guard's finding-A fix (see time_machine.js).
        const isStruct = S.seq <= 4 || (S.cls === 'IfcSlab' && S.seq > 4);
        const isWall = S.seq > 4 && S.cls.indexOf('IfcWall') === 0;
        if (!isStruct && !(promotedSlab && isWall)) continue;
        if (S.bz < T.bz - EPS && S.tz >= T.bz - GAP && xy(S, T)) {
          hasBearing = true;
          if (S.tz <= topBound) { if (S.e > lastEnd) lastEnd = S.e; }
          else if (S.e > envEnd) envEnd = S.e;
        }
      }
      if (!lastEnd && envEnd) lastEnd = envEnd;
      if (!hasBearing && T.seq > 4) {
        for (let i = 0; i < work.length; i++) {
          const H = work[i]; if (H.guid === T.guid || !(H.seq <= 4 || (H.cls === 'IfcSlab' && H.seq > 4))) continue;   // §PROMOTED_CARRIER_POOL: hang pool == struct pool (audit parity)
          if (H.bz >= T.tz - HANG_GAP && H.bz <= T.tz + HANG_GAP && H.tz > T.tz + EPS && xy(H, T) && H.e > lastEnd) lastEnd = H.e;
        }
      }
      if (lastEnd && T.s < lastEnd) {
        const dur = Math.max(60000, T.e - T.s);
        T.s = lastEnd + 1; T.e = T.s + dur;
        moved++;
      }
    });
    if (!moved) break;
  }
  const pushed = {};
  work.forEach(function (e) { pushed[e.guid] = e.s !== orig[e.guid]; });
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
    _allScheduled.forEach(function (e) { origS[e.guid] = e.s; });   // capture BEFORE the block mutates in place

    globalThis.ScheduleGate = { CELL: 4 };   // §S58: same synthetic gate the vm sandbox used to inject
    const sandbox = { _allScheduled: _allScheduled };
    SupportSweep.ogSupportSweep(sandbox._allScheduled, undefined);
    const realPushedIds = {};
    sandbox._allScheduled.forEach(function (T) { if (T.s !== origS[T.guid]) realPushedIds[T.guid] = T.s; });
    let mismatches = 0;
    for (const guid in refPushed) {
      const realSaysPush = !!realPushedIds[guid];
      if (refPushed[guid] !== realSaysPush) mismatches++;
    }
    assert(mismatches === 0, 'Duplex: grid-based push decisions match the O(n^2) brute-force reference (current sweep+hang+two-tier semantics) exactly — mismatches=' + mismatches + '/' + Object.keys(refPushed).length);
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
    globalThis.ScheduleGate = { CELL: 4 };   // §S58
    const sandbox = { _allScheduled: _allScheduled };
    let _ogRes = null;
    const t0 = process.hrtime.bigint();
    _ogRes = SupportSweep.ogSupportSweep(sandbox._allScheduled, undefined);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log('§OG_GRID_PERF Terminal n=' + _allScheduled.length + ' ms=' + ms.toFixed(1) + ' pushed=' + _ogRes.pushed + ' sweeps=' + _ogRes.sweeps);
    assert(ms < 15000, 'Terminal (the real reported-hang fixture, 48,428 elements) completes under 15s across the ≤16-sweep fixpoint — measured=' + ms.toFixed(1) + 'ms (measured 7806ms/2 sweeps 2026-08-11; single-sweep pre-§OG_GRID_Z_BAND was 4636ms — ceiling ~2× measured, tight enough to catch a real regression back to XY-only bucketing)');
  } else {
    console.log('§SKIP performance check — Terminal fixture missing');
  }

  console.log('\n§W-OG-GRID SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error('§OG_GRID_ERROR', e); process.exit(1); });
