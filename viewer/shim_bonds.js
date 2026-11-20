// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — shim_bonds.js. SCOPE: bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.37.2 (stage S1 of the shim-anchor model, §Q.33).
// The bond TABLE is report only (no schedule reads a host from it yet, §Q.37 S3c). ONE fact is read by the schedule since §Q.39: a covering
// bonded hangs-below is a ceiling (applyCeilings). Read the §SHIM_* / §CEILING_CLOSEUP lines after every run; exit code is not evidence.
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
  // §Q.44 — the declared types of the db being scheduled: { guid: PredefinedType }. One reader (readDeclaredTypes), replaced whole per db.
  var DECLARED = {}, DECLARED_SRC = 'none';
  function readDeclaredTypes(db, who) {
    var m = {}, n = 0, by = {}, why = '';
    try {
      var r = db.exec('SELECT guid, predefined_type FROM element_predefined_type');
      if (r.length) r[0].values.forEach(function (v) { if (v[1]) { m[v[0]] = v[1]; n++; by[v[1]] = (by[v[1]] || 0) + 1; } });
    } catch (e) { why = 'no element_predefined_type table'; }
    DECLARED = m; DECLARED_SRC = n ? 'element_predefined_type' : 'none';
    console.log('§COVERING_TYPE recipe=' + (who || '?') + ' declared=' + n + (n ? ' byType=' + JSON.stringify(by) + ' — a covering is what its file says (CEILING -> close-up, FLOORING -> floor finish, any other type: neither)'
      : ' — NONE (' + (why || 'table empty') + '): every covering keeps the bond rule of §Q.39 (hangs-below = ceiling)'));
    return n;
  }
  function declareTypes(map) { DECLARED = map || {}; DECLARED_SRC = map ? 'given' : 'none'; }
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
    if (c === 'IfcCovering') {
      // §Q.44 — what a covering IS comes from the file: IfcCovering.PredefinedType, carried by the patch table element_predefined_type and
      // read once per db (readDeclaredTypes). Undeclared -> 'covering' (both needs, the bond decides — the rule before §Q.44, unchanged).
      var pt = e.ptype || DECLARED[e.guid];
      if (!pt) return 'covering';
      return pt === 'CEILING' ? 'ceiling' : (pt === 'FLOORING' ? 'floor_finish' : 'covering_other');   // insulation, molding, cladding …: no row, offers nothing
    }
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
  var REL = { 'bears-on-top': 'below', 'hangs-below': 'above', 'fixes-on-side': 'spans', 'opening-accepts': 'spans', 'continues-same-kind': 'any', 'joins': 'touch' };
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
    ceiling:      [{ cap: 'hangs-below', hosts: ['slab', 'beam'], count: 'one', src: 'dry-run' }],          // §Q.44: declared CEILING
    floor_finish: [{ cap: 'bears-on-top', hosts: ['slab', 'ground_slab'], count: 'one', src: 'dry-run' }],   // §Q.44: declared FLOORING
    opening_fill: [{ cap: 'opening-accepts', hosts: ['bearing_wall', 'wall'], count: 'one', src: 'dry-run' }],
    fixture:      [{ cap: 'hangs-below', hosts: ['ceiling', 'covering'], count: 'one', src: 'mined' },
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
  // §Q.43 rule J — `joins` is a TOUCH: the two height ranges meet (GAP = the contact owner's own bearing constant, no new number). The contact
  // list holds everything above T in plan with no upper limit, so `any` let a façade plate "join" a slab 13 m over it (Hospital, measured).
  function relOk(want, S, T, EPS, GAP) {
    if (want === 'any') return true;
    if (want === 'touch') return S.bz <= T.tz + GAP && S.tz >= T.bz - GAP;
    return relsOf(S, T, EPS, GAP)[want] === true;
  }
  // §Q.43 rule N — THE FIRST OFFERER ABOVE. aboveFloor(...) = the two lowest TOPS among T's contacts that are above T and whose kind offers
  // `hangs-below` to T's kind in ANY row (anchored or not: it is in the way either way). A candidate j is occluded when another such offerer
  // lies wholly below it. Occlusion on the boxes the contact owner already holds; no distance constant.
  function aboveOfferers(row) {
    var o = {}, r, h;
    for (r = 0; r < row.length; r++) if (REL[row[r].cap] === 'above') for (h = 0; h < row[r].hosts.length; h++) o[row[r].hosts[h]] = 1;
    return o;
  }
  function aboveFloor(T, list, items, kind, off, EPS, GAP) {
    var m1 = Infinity, i1 = -1, m2 = Infinity;
    for (var c = 0; c < list.length; c++) {
      var j = list[c]; if (!off[kind[j]] || !relsOf(items[j], T, EPS, GAP).above) continue;
      var tz = items[j].tz;
      if (tz < m1) { m2 = m1; m1 = tz; i1 = j; } else if (tz < m2) m2 = tz;
    }
    return { m1: m1, i1: i1, m2: m2 };
  }
  function occluded(j, fl, items, EPS) { return (j === fl.i1 ? fl.m2 : fl.m1) <= items[j].bz + EPS; }
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
      var fl = null;
      for (var r = 0; r < row.length; r++) {
        var nd = row[r]; if (nd.cap === 'ground') continue;
        var want = REL[nd.cap], best = -1, bestTier = 99, bestArea = -1, all = [];
        if (want === 'above' && !fl) fl = aboveFloor(T, list, items, kind, aboveOfferers(row), EPS, GAP);
        for (var c = 0; c < list.length; c++) {
          var j = list[c]; if (wave[j] < 0 || wave[j] >= w) continue;
          var tier = nd.hosts.indexOf(kind[j]); if (tier < 0) continue;
          if (nd.sibling && !(parentOf[T.guid] && parentOf[T.guid] === parentOf[items[j].guid])) continue;
          if (!relOk(want, items[j], T, EPS, GAP)) continue;
          if (want === 'above' && occluded(j, fl, items, EPS)) continue;
          all.push(j);
          var area = planOverlap(items[j], T);
          if (tier < bestTier || (tier === bestTier && (area > bestArea || (area === bestArea && String(items[j].guid) < String(items[best].guid))))) { best = j; bestTier = tier; bestArea = area; }
        }
        if (best >= 0) { need[ti] = r; host[ti] = best; hosts[ti] = nd.count === 'all' ? all : [best]; return true; }
        // §Q.43.1 — WAIT FOR THE FIRST OFFERER ABOVE. If what T would hang from is there but not anchored yet, T does not fall through to a later
        // need (a relay from a neighbouring piece, which draws no order): it waits for that offerer's wave. Released after the waves run dry.
        if (want === 'above' && !noDefer) {
          for (var c2 = 0; c2 < list.length; c2++) {
            var j3 = list[c2];
            if (wave[j3] < 0 && nd.hosts.indexOf(kind[j3]) >= 0 && relOk(want, items[j3], T, EPS, GAP) && !occluded(j3, fl, items, EPS)) { if (!deferred[ti]) { deferred[ti] = 1; deferredN++; } return false; }
          }
        }
      }
      return false;
    }
    var w = 0, noDefer = false, deferred = new Uint8Array(n), deferredN = 0, released = 0;
    for (var pass = 0; pass < 2; pass++) {
      while (frontier.length) {
        w++;
        var cand = {}, next = [];
        for (q = 0; q < frontier.length; q++) { var d = dependants[frontier[q]]; if (d) for (k = 0; k < d.length; k++) if (wave[d[k]] < 0) cand[d[k]] = 1; }
        var ids = Object.keys(cand).map(Number).sort(function (a, b) { return a - b; });
        for (q = 0; q < ids.length; q++) if (tryBond(ids[q], w)) next.push(ids[q]);
        for (q = 0; q < next.length; q++) { wave[next[q]] = w; outcome[next[q]] = OUT.BONDED; }   // committed after the scan: a host qualifies only from an EARLIER wave
        frontier = next;
      }
      if (pass === 1 || !deferredN) break;
      // release: the offerer never anchored — the waiting elements take whatever later need an anchored contact meets, then the waves go on
      noDefer = true; w++;
      for (i = 0; i < n; i++) if (deferred[i] && wave[i] < 0 && tryBond(i, w)) frontier.push(i);
      for (q = 0; q < frontier.length; q++) { wave[frontier[q]] = w; outcome[frontier[q]] = OUT.BONDED; released++; }
    }
    // everything never anchored gets exactly one reason
    for (i = 0; i < n; i++) {
      if (wave[i] >= 0) continue;
      var row = kind[i] && table[kind[i]], li2 = G.contacts[i];
      if (!row) { outcome[i] = OUT.UNTABLED; continue; }
      if (!li2 || !li2.length) { outcome[i] = OUT.NOCONTACT; continue; }
      var rightKind = false, rightRel = false, fl2 = null;
      for (var r2 = 0; r2 < row.length && !rightRel; r2++) {
        var nd2 = row[r2]; if (nd2.cap === 'ground') continue;
        if (REL[nd2.cap] === 'above' && !fl2) fl2 = aboveFloor(items[i], li2, items, kind, aboveOfferers(row), EPS, GAP);
        for (k = 0; k < li2.length; k++) {
          var j2 = li2[k]; if (nd2.hosts.indexOf(kind[j2]) < 0) continue;
          if (nd2.sibling && !(parentOf[items[i].guid] && parentOf[items[i].guid] === parentOf[items[j2].guid])) continue;
          rightKind = true;
          if (relOk(REL[nd2.cap], items[j2], items[i], EPS, GAP) && !(REL[nd2.cap] === 'above' && occluded(j2, fl2, items, EPS))) { rightRel = true; break; }
        }
      }
      outcome[i] = rightRel ? OUT.UNANCHORED : rightKind ? OUT.MISPLACED : OUT.NOHOST;
    }
    var counts = {}; for (i = 0; i < n; i++) counts[outcome[i]] = (counts[outcome[i]] || 0) + 1;
    return { n: n, kind: kind, outcome: outcome, need: need, host: host, hosts: hosts, wave: wave, seeds: seeds, waves: w, counts: counts, table: table, waited: deferredN, released: released };
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

  // ── §CEILING_CLOSEUP (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.39; owner ruling 2026-11-20: standard practice, on every building) ──
  // Per level the trade order is rough-in -> close-up -> MEP final -> finishes: a suspended ceiling is closed BEFORE the fittings that hang
  // from it, a floor finish is laid last. The class rule files every IfcCovering as Finishes; the BOND says which it is — a covering bonded
  // hangs-below is a ceiling (-> Architecture Closeup, sequence 8), one bonded bears-on-top is a floor finish (unchanged), an unbonded one
  // keeps the class rule and is counted. Resource, rate and install time are NOT changed (pattern: ScheduleGate.applyBearingWalls).
  // ONE mutation, called by every element recipe through ScheduleGate.applyGeometryReclass. els carry base_z / top_z.
  function applyCeilings(els, who, deps) {
    deps = deps || {};
    var SG = deps.SG || global.ScheduleGate, CP = deps.CP || global.CpmSchedule, t0 = Date.now(), i, cov = 0, slabCand = 0;
    for (i = 0; i < els.length; i++) {
      if (els[i].cls === 'IfcCovering') cov++;
      else if (els[i].cls === 'IfcSlab' && els[i].phase !== 'Superstructure' && els[i].phase !== 'Substructure') slabCand++;   // §Q.46 candidates
    }
    if (!cov) console.log('§CEILING_CLOSEUP recipe=' + who + ' coverings=0 — nothing to judge (VACUOUS)');
    if (!slabCand) console.log('§CARRYING_SLAB recipe=' + who + ' promoted=0 — every slab is already filed as structure (VACUOUS)');
    if (!cov && !slabCand) return 0;
    if (!SG || !CP || !CP.contactGraph) { console.log('§CEILING_CLOSEUP recipe=' + who + ' INACTIVE — contact owner not loaded; coverings=' + cov + ' keep the class rule'); return 0; }
    var items = els.map(function (e) { return { guid: e.guid, cls: e.cls, seq: e.seq, phase: e.phase, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, bz: e.base_z, tz: e.top_z }; });
    var G = CP.contactGraph(items);
    if (!G.ok) { console.log('§CEILING_CLOSEUP recipe=' + who + ' INACTIVE — contact graph unavailable; coverings=' + cov + ' keep the class rule'); return 0; }
    var res = compute(items, G, { EPS: SG.EPS, GAP: SG.GAP }), ceil = 0, floor = 0, unb = 0, decl = 0, declCeil = 0, other = 0;
    // §CARRYING_SLAB (bim-compiler prompts/4D_MODEL_INTEGRITY.md §Q.46; rule B of §Q.33.2: a host whose phase comes later is moved up). A slab
    // filed outside structure (a roof deck named "Basic Roof" is envelope by name) that a column or a bearing wall BEARS ON is structure:
    // Superstructure, sequence 4, what any slab is. Measured: Clinic 1 slab carrying 65 bearing walls + 2 columns scheduled a task before it;
    // the other six buildings 0. Resource, rate and install time unchanged. Read from the same bond pass as the ceilings — no second graph.
    if (slabCand) {
      var carry = {}, carrying = 0, promoted = 0, was = {};
      for (i = 0; i < els.length; i++) {
        if ((res.kind[i] !== 'column' && res.kind[i] !== 'bearing_wall') || capOf(res, i) !== 'bears-on-top') continue;
        var hsC = res.hosts[i] || [];
        for (var hc = 0; hc < hsC.length; hc++) {
          var sj = hsC[hc], se = els[sj];
          if (se.cls !== 'IfcSlab' || se.phase === 'Superstructure' || se.phase === 'Substructure') continue;
          carry[sj] = (carry[sj] || 0) + 1; carrying++;
        }
      }
      for (var ck in carry) { var ce = els[ck]; was[ce.phase + '/seq' + ce.seq] = (was[ce.phase + '/seq' + ce.seq] || 0) + 1; ce.phase = 'Superstructure'; ce.seq = 4; promoted++; }
      console.log('§CARRYING_SLAB recipe=' + who + ' candidates(slabs filed outside structure)=' + slabCand + ' promoted=' + promoted + ' carrying=' + carrying +
        (promoted ? ' byWas=' + JSON.stringify(was) + ' — a slab a column or bearing wall bears on is Superstructure, sequence 4 (trade, rate, install time unchanged)'
                  : ' — NO-OP: no column or bearing wall bears on a slab filed outside structure'));
    }
    if (!cov) return 0;
    for (i = 0; i < els.length; i++) {
      var kd = res.kind[i];
      if (kd === 'ceiling') { els[i].phase = 'Architecture Closeup'; els[i].seq = 8; ceil++; decl++; declCeil++; continue; }   // §Q.44: declared — the fact, whatever its bond
      if (kd === 'floor_finish') { floor++; decl++; continue; }
      if (kd === 'covering_other') { other++; decl++; continue; }                                                               // insulation, molding, cladding: keeps the class rule
      if (kd !== 'covering') continue;
      var cap = capOf(res, i);
      if (cap === 'hangs-below') { els[i].phase = 'Architecture Closeup'; els[i].seq = 8; ceil++; }
      else if (cap === 'bears-on-top') floor++;
      else unb++;
    }
    console.log('§CEILING_CLOSEUP recipe=' + who + ' coverings=' + cov + ' ceilings=' + ceil + ' floorFinish=' + floor + ' unbonded=' + unb + ' ms=' + (Date.now() - t0) +
      ' declaredType=' + decl + ' (ceilingByDeclaration=' + declCeil + ' otherDeclared=' + other + ' source=' + DECLARED_SRC + ')' +
      (ceil ? ' — a ceiling (declared CEILING, or undeclared and bonded hangs-below) is close-up work, sequence 8, before the fittings that hang from it; trade, rate, install time unchanged'
            : ' — NO-OP: no covering is a ceiling'));
    return ceil;
  }

  var API = { readDeclaredTypes: readDeclaredTypes, declareTypes: declareTypes, kindOf: kindOf, TABLE: TABLE, REL: REL, OUT: OUT, relsOf: relsOf, compute: compute, capOf: capOf, srcOf: srcOf, applyCeilings: applyCeilings };
  global.ShimBonds = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
