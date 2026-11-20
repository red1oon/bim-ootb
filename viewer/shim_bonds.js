// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — shim_bonds.js. SCOPE: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.37.2 (stage S1 of the shim-anchor model, §Q.33).
// REPORT ONLY: nothing in the viewer loads this file and no schedule reads it. Read the §SHIM_* lines after every run; exit code is not evidence.
//
// WHAT IT ANSWERS: "which thing(s) carries T, and by which NEED?" — a two-sided bond: T's need meets a host's offer.
// WHAT IT DOES NOT DO: test contact. Candidates are CpmSchedule.contactGraph(items).contacts (the one owner, §I row 1); this file only
// classifies and elects among them. The pair's relation is the election's own three-way split (cpm_schedule.js designatedSupport),
// restated ONCE in relsOf() and to be deleted from the election at stage S3.
//
// A class name appears in exactly one place: kindOf(). Every rule below speaks in kinds and capabilities.
(function (global) {
  'use strict';

  // ── KIND ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // IFC class -> kind, refined by extracted facts only: the rel_aggregates parent class (a member/plate under a curtain wall is façade,
  // anything under a stair is a stair part) and what the shipped classification already decided for this run (sequence 1 / Substructure
  // slab = ground slab, §GROUNDWORK_SLAB; a wall with sequence <= 4 = a bearing wall, §Q.6 D1 bearingWalls). No Pset is read.
  var FIXTURE_CEILING = { IfcAirTerminal: 1, IfcLightFixture: 1, IfcLamp: 1, IfcFireSuppressionTerminal: 1, IfcFlowTerminal: 1 };
  var FIXTURE_WALL = { IfcAlarm: 1, IfcElectricAppliance: 1 };
  var SEGMENT = { IfcFlowSegment: 1, IfcPipeSegment: 1, IfcDuctSegment: 1, IfcCableCarrierSegment: 1, IfcCableSegment: 1 };
  var FITTING = { IfcFlowFitting: 1, IfcPipeFitting: 1, IfcDuctFitting: 1, IfcCableCarrierFitting: 1, IfcCableFitting: 1 };
  var STAIR = { IfcStair: 1, IfcStairFlight: 1, IfcRamp: 1, IfcRampFlight: 1 };
  function kindOf(e, parentCls) {
    var c = e.cls || '';
    if (parentCls === 'IfcCurtainWall') return 'facade_part';
    if (parentCls && STAIR[parentCls]) return c === 'IfcSlab' ? 'landing' : (STAIR[c] ? 'stair' : 'stair_part');
    if (c === 'IfcFooting' || c === 'IfcPile') return 'footing';
    if (c === 'IfcColumn') return 'column';
    if (c === 'IfcBeam') return 'beam';
    if (c === 'IfcSlab') return (e.seq === 1 || e.phase === 'Substructure') ? 'ground_slab' : 'slab';
    if (c.indexOf('IfcWall') === 0) return (typeof e.seq === 'number' && e.seq <= 4) ? 'bearing_wall' : 'wall';
    if (STAIR[c]) return 'stair';
    if (c === 'IfcCovering') return 'covering';
    if (c === 'IfcWindow' || c === 'IfcDoor') return 'opening_fill';
    if (FIXTURE_CEILING[c]) return 'fixture';
    if (FIXTURE_WALL[c]) return 'fixture_wall';
    if (SEGMENT[c]) return 'segment';
    if (FITTING[c]) return 'fitting';
    return null;                                              // untabled: reported as lost(untabled), keeps its template time
  }

  // ── TABLE ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // One row per kind: ordered needs. A need = capability + the relation the host must be in + the host kinds that OFFER it, in TIER order
  // (§Q.33.6 item 2: footing/column -> beam -> slab -> bearing wall -> the rest) + count (one | all) + where the row comes from.
  // src: 'dry-run' = the owner's §Q.33.3 dry run, row for row · 'mined' = a rule_shim row (terminal_rules / duplex_rules, §SHIM-FACING)
  //      'proposed' = added by the S1 session so hosts can anchor at all; NOT signed off — counted separately on §SHIM_TABLE_SOURCE.
  var REL = { 'bears-on-top': 'below', 'hangs-below': 'above', 'fixes-on-side': 'spans', 'opening-accepts': 'spans', 'continues-same-kind': 'any', 'joins': 'any' };
  var BEARERS = ['footing', 'column', 'beam', 'slab', 'ground_slab', 'bearing_wall'];
  var TABLE = {
    footing:      [{ cap: 'ground', src: 'dry-run' }],
    ground_slab:  [{ cap: 'ground', src: 'dry-run' }],
    column:       [{ cap: 'bears-on-top', hosts: BEARERS, count: 'one', src: 'dry-run' }],
    bearing_wall: [{ cap: 'bears-on-top', hosts: BEARERS, count: 'one', src: 'proposed' }],          // D1's own words: "a vertical bearer, like a column"
    beam:         [{ cap: 'bears-on-top', hosts: ['footing', 'column', 'beam', 'bearing_wall'], count: 'all', src: 'dry-run' },
                   { cap: 'fixes-on-side', hosts: ['column', 'beam', 'bearing_wall'], count: 'all', src: 'dry-run' }],
    slab:         [{ cap: 'bears-on-top', hosts: ['column', 'beam', 'bearing_wall'], count: 'all', src: 'dry-run' },
                   { cap: 'continues-same-kind', hosts: ['slab'], count: 'one', src: 'dry-run' }],
    wall:         [{ cap: 'bears-on-top', hosts: ['footing', 'beam', 'slab', 'ground_slab', 'bearing_wall', 'wall'], count: 'one', src: 'proposed' }],
    stair:        [{ cap: 'bears-on-top', hosts: ['footing', 'beam', 'slab', 'ground_slab', 'landing'], count: 'one', src: 'proposed' },
                   { cap: 'joins', hosts: ['landing', 'stair', 'stair_part'], sibling: true, count: 'one', src: 'proposed' }],
    stair_part:   [{ cap: 'bears-on-top', hosts: ['footing', 'beam', 'slab', 'ground_slab', 'landing'], count: 'one', src: 'proposed' },
                   { cap: 'joins', hosts: ['landing', 'stair', 'stair_part'], sibling: true, count: 'one', src: 'proposed' }],
    landing:      [{ cap: 'joins', hosts: ['stair', 'stair_part', 'landing'], sibling: true, count: 'one', src: 'dry-run' },
                   { cap: 'fixes-on-side', hosts: ['bearing_wall', 'wall'], count: 'one', src: 'dry-run' }],
    facade_part:  [{ cap: 'joins', hosts: ['slab', 'ground_slab'], count: 'one', src: 'dry-run' },
                   { cap: 'continues-same-kind', hosts: ['facade_part'], count: 'one', src: 'dry-run' }],
    covering:     [{ cap: 'bears-on-top', hosts: ['slab', 'ground_slab'], count: 'one', src: 'dry-run' },
                   { cap: 'hangs-below', hosts: ['slab', 'beam'], count: 'one', src: 'dry-run' }],
    opening_fill: [{ cap: 'opening-accepts', hosts: ['bearing_wall', 'wall'], count: 'one', src: 'dry-run' }],
    fixture:      [{ cap: 'hangs-below', hosts: ['covering'], count: 'one', src: 'mined' },
                   { cap: 'hangs-below', hosts: ['slab', 'beam'], count: 'one', src: 'dry-run' },
                   { cap: 'fixes-on-side', hosts: ['bearing_wall', 'wall'], count: 'one', src: 'mined' }],
    fixture_wall: [{ cap: 'fixes-on-side', hosts: ['bearing_wall', 'wall'], count: 'one', src: 'mined' }],
    segment:      [{ cap: 'fixes-on-side', hosts: ['bearing_wall', 'wall'], count: 'one', src: 'mined' },
                   { cap: 'hangs-below', hosts: ['slab', 'beam'], count: 'one', src: 'dry-run' },
                   { cap: 'continues-same-kind', hosts: ['segment', 'fitting'], count: 'one', src: 'dry-run' }],
    fitting:      [{ cap: 'fixes-on-side', hosts: ['bearing_wall', 'wall'], count: 'one', src: 'mined' },
                   { cap: 'continues-same-kind', hosts: ['segment', 'fitting'], count: 'one', src: 'dry-run' }]
  };

  // ── RELATION of a candidate S to T — the election's own two tests (cpm_schedule.js designatedSupport), NOT made exclusive here. ──
  // The election asks them in order (below, else spans, else above), so a wall whose base is under a window's sill reads "below" there.
  // A need asks for the one it means: below = S starts under T and tops out at T's base or higher; spans = S covers T's whole height
  // (T sits in or against S); above = neither. A wall round a window is both below and spans.
  function relsOf(S, T, EPS, GAP) {
    var below = S.bz < T.bz - EPS && S.tz >= T.bz - GAP, spans = S.bz <= T.bz + EPS && S.tz >= T.tz - EPS;
    return { below: below, spans: spans, above: !below && !spans };
  }
  function relOk(want, S, T, EPS, GAP) { return want === 'any' || relsOf(S, T, EPS, GAP)[want] === true; }
  function planOverlap(S, T) {
    var dx = Math.min(S.x1, T.x1) - Math.max(S.x0, T.x0), dy = Math.min(S.y1, T.y1) - Math.max(S.y0, T.y0);
    return (dx > 0 ? dx : 0) * (dy > 0 ? dy : 0);
  }

  // ── COMPUTE ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  // items: [{guid, cls, seq, phase, x0,x1,y0,y1, bz, tz}]   G: CpmSchedule.contactGraph(items) (must be ok)
  // opts: { EPS, GAP, parentOf: {childGuid: parentGuid}, parentCls: {childGuid: parentIfcClass}, table (default TABLE) }
  // Returns { n, kind[], outcome[], need[] (index into the row, -1), host[] (primary index, -1), hosts[] (all, count 'all'), wave[] (-1 = never
  //           anchored), seeds, waves, counts{} }.  Outcome codes: OUT below.
  var OUT = { BONDED: 'bonded', UNTABLED: 'lost(untabled)', NOCONTACT: 'lost(no-contact)', NOHOST: 'lost(no-host)', UNANCHORED: 'lost(unanchored)', MISPLACED: 'misplaced' };
  function compute(items, G, opts) {
    opts = opts || {};
    var EPS = opts.EPS, GAP = opts.GAP, table = opts.table || TABLE, parentCls = opts.parentCls || {}, parentOf = opts.parentOf || {};
    var n = items.length, i, k, q;
    var kind = new Array(n), outcome = new Array(n), need = new Int16Array(n).fill(-1), host = new Int32Array(n).fill(-1),
        hosts = new Array(n), wave = new Int32Array(n).fill(-1);
    for (i = 0; i < n; i++) kind[i] = kindOf(items[i], parentCls[items[i].guid]);
    // who lists me as a candidate host (contacts are T -> its candidates, not symmetric)
    var dependants = new Array(n);
    for (i = 0; i < n; i++) { var li = G.contacts[i]; if (li) for (k = 0; k < li.length; k++) (dependants[li[k]] = dependants[li[k]] || []).push(i); }
    // wave 0: ground. The election's own seed test (designatedSupport isSeed) — sequence 1 / Substructure, or in ground-band mode a
    // structural element whose base is inside the band — minus façade parts (§Q.33.8 item 3), plus any kind whose first need is `ground`.
    var bandMode = G.groundSeedMode === 'ground-band' && typeof G.groundDatum === 'number', seeds = 0;
    var frontier = [];
    for (i = 0; i < n; i++) {
      var X = items[i], row0 = kind[i] && table[kind[i]];
      var seed = kind[i] !== 'facade_part' && ((row0 && row0[0].cap === 'ground') || X.seq === 1 || X.phase === 'Substructure' ||
        (bandMode && typeof X.seq === 'number' && X.seq <= 4 && X.bz <= G.groundDatum));
      if (seed) { wave[i] = 0; outcome[i] = OUT.BONDED; need[i] = (row0 && row0[0].cap === 'ground') ? 0 : -2; seeds++; frontier.push(i); }   // -2 = seeded by the run's own classification
    }
    // tryBond(i, w): the first need in row order met by a contact anchored in a wave < w. Best host = tier, then plan overlap, then guid.
    function tryBond(ti, w) {
      var T = items[ti], row = table[kind[ti]], list = G.contacts[ti]; if (!row || !list) return false;
      for (var r = 0; r < row.length; r++) {
        var nd = row[r]; if (nd.cap === 'ground') continue;
        var want = REL[nd.cap], best = -1, bestTier = 99, bestArea = -1, all = [];
        for (var c = 0; c < list.length; c++) {
          var j = list[c]; if (wave[j] < 0 || wave[j] >= w) continue;
          var tier = nd.hosts.indexOf(kind[j]); if (tier < 0) continue;
          if (nd.sibling && !(parentOf[T.guid] && parentOf[T.guid] === parentOf[items[j].guid])) continue;
          if (!relOk(want, items[j], T, EPS, GAP)) continue;
          all.push(j);
          var area = planOverlap(items[j], T);
          if (tier < bestTier || (tier === bestTier && (area > bestArea || (area === bestArea && String(items[j].guid) < String(items[best].guid))))) { best = j; bestTier = tier; bestArea = area; }
        }
        if (best >= 0) { need[ti] = r; host[ti] = best; hosts[ti] = nd.count === 'all' ? all : [best]; return true; }
      }
      return false;
    }
    var w = 0;
    while (frontier.length) {
      w++;
      var cand = {}, next = [];
      for (q = 0; q < frontier.length; q++) { var d = dependants[frontier[q]]; if (d) for (k = 0; k < d.length; k++) if (wave[d[k]] < 0) cand[d[k]] = 1; }
      var ids = Object.keys(cand).map(Number).sort(function (a, b) { return a - b; });
      for (q = 0; q < ids.length; q++) if (tryBond(ids[q], w)) next.push(ids[q]);
      for (q = 0; q < next.length; q++) { wave[next[q]] = w; outcome[next[q]] = OUT.BONDED; }   // committed after the scan: a host qualifies only from an EARLIER wave
      frontier = next;
    }
    // everything never anchored gets exactly one reason
    for (i = 0; i < n; i++) {
      if (wave[i] >= 0) continue;
      var row = kind[i] && table[kind[i]], li2 = G.contacts[i];
      if (!row) { outcome[i] = OUT.UNTABLED; continue; }
      if (!li2 || !li2.length) { outcome[i] = OUT.NOCONTACT; continue; }
      var rightKind = false, rightRel = false;
      for (var r2 = 0; r2 < row.length && !rightRel; r2++) {
        var nd2 = row[r2]; if (nd2.cap === 'ground') continue;
        for (k = 0; k < li2.length; k++) {
          var j2 = li2[k]; if (nd2.hosts.indexOf(kind[j2]) < 0) continue;
          if (nd2.sibling && !(parentOf[items[i].guid] && parentOf[items[i].guid] === parentOf[items[j2].guid])) continue;
          rightKind = true;
          if (relOk(REL[nd2.cap], items[j2], items[i], EPS, GAP)) { rightRel = true; break; }
        }
      }
      outcome[i] = rightRel ? OUT.UNANCHORED : rightKind ? OUT.MISPLACED : OUT.NOHOST;
    }
    var counts = {}; for (i = 0; i < n; i++) counts[outcome[i]] = (counts[outcome[i]] || 0) + 1;
    return { n: n, kind: kind, outcome: outcome, need: need, host: host, hosts: hosts, wave: wave, seeds: seeds, waves: w, counts: counts, table: table };
  }

  // capOf(res, i) — the capability an element bonded by ('ground' for a seed), or null.
  function capOf(res, i) {
    if (res.outcome[i] !== OUT.BONDED) return null;
    if (res.need[i] === -2) return 'ground';
    var row = res.table[res.kind[i]]; return row && row[res.need[i]] ? row[res.need[i]].cap : null;
  }
  function srcOf(res, i) {
    if (res.outcome[i] !== OUT.BONDED) return null;
    if (res.need[i] === -2) return 'run-classification';
    var row = res.table[res.kind[i]]; return row && row[res.need[i]] ? row[res.need[i]].src : null;
  }

  var API = { kindOf: kindOf, TABLE: TABLE, REL: REL, OUT: OUT, relsOf: relsOf, compute: compute, capOf: capOf, srcOf: srcOf };
  global.ShimBonds = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
