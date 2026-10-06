// time_machine family — part `sched_xray` (original time_machine.js lines 3736–4929).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/time_machine.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as TMS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts = (typeof window !== 'undefined' ? window : globalThis).__timeMachineParts || {};
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts.sched_xray = function* __split_time_machine_sched_xray(TMS) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  TMS._promoteRoofLoadPath = _promoteRoofLoadPath;
  TMS._classifyNameOverride = _classifyNameOverride;
  TMS._civilRule = _civilRule;
  TMS._classifyRule = _classifyRule;
  TMS._zoneIndex = _zoneIndex;
  TMS._xrayMemoGen = _xrayMemoGen;
  TMS._xrayElementsMemoized = _xrayElementsMemoized;
  TMS._tmRebuildXrayCache = _tmRebuildXrayCache;
  TMS._ogSupportSweep = _ogSupportSweep;
  TMS._cjpJudgeParity = _cjpJudgeParity;
  TMS._displayTimeline = _displayTimeline;
  TMS._hrCostEnsure = _hrCostEnsure;
  TMS._scheduledWhere = _scheduledWhere;
  TMS._load4DTemplate = _load4DTemplate;
  TMS._tmDisplayRemap = _tmDisplayRemap;
  TMS._tmTilePlayWithinTasks = _tmTilePlayWithinTasks;
  TMS.verifyGanttIntegrity = verifyGanttIntegrity;
  TMS.captureLockBaseline = captureLockBaseline;
  TMS._writeScheduledChunked = _writeScheduledChunked;
  Object.defineProperty(TMS, '_xrayElemMemo', { get: function () { return _xrayElemMemo; }, set: function (v) { _xrayElemMemo = v; }, enumerable: true });
  Object.defineProperty(TMS, '_xrayCacheMemo', { get: function () { return _xrayCacheMemo; }, set: function (v) { _xrayCacheMemo = v; }, enumerable: true });
  Object.defineProperty(TMS, '_rawScheduleRemember', { get: function () { return _rawScheduleRemember; }, set: function (v) { _rawScheduleRemember = v; }, enumerable: true });
  Object.defineProperty(TMS, '_4dTemplate', { get: function () { return _4dTemplate; }, set: function (v) { _4dTemplate = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order


  // ══════════════════════════════════════════════════════════════════
  // §4D_ROOF_LOAD_PATH — roof/load-path promotion classifier (ONE copy)
  // ══════════════════════════════════════════════════════════════════
  // ONE classifier, TWO callers: injectGantt() (the live scheduler build) and _buildXrayElements()
  // (the x-ray staging rebuild that verifyGanttIntegrity() — the schedule LOCK gate — also runs
  // on). Consolidated 2026-08-10 from two inline copies verified byte-identical in .seq output —
  // a future silent divergence would have made the lock gate verify against a different
  // classification than the one actually scheduled: a correctness bug, not a rendering glitch.
  //
  // §4D_ROOF_LOAD_PATH M1 (2026-08-01, prompts/GANTT_ACCURACY.md §4D_ROOF_LOAD_PATH) — a slab's
  // ROLE is a load-path fact, not a storey-name label. SUPERSEDES the deleted `/roof/i` override:
  // measured 2026-08-01, that regex fired ZERO times on Hospital ("Level 1..7A"/"Unknown")
  // and LTU_AHouse ("TAKPLAN", Swedish) — the two roof slabs it was meant to catch have storey
  // "Unknown". For each IfcSlab, take the IfcWall*/IfcWallStandardCase whose XY footprint overlaps
  // it ("those walls"). Two checks from the SAME paragraph of the spec, both epsilon-free:
  //   (a) the slab's base_z is above the average midheight of those walls — the walls are BELOW
  //       and physically carry it.
  //   (b) NONE of those walls stand ON it (no overlapping wall has base_z >= the slab's own
  //       top_z) — this is the spec's own stated definition of "the floor case" ("floor slab:
  //       walls stand ON it ... otherwise it stays a floor slab"), and it is NOT redundant with
  //       (a): measured on this exact DB, (a) alone is true for nearly every capped-wall slab in
  //       the building (35 slabs -> 23 "promoted"), including known mid-building intermediate
  //       floors (base_z 176.81, between Level 2 and Level 3, 5 more levels above) — a slab that
  //       caps the walls below it satisfies (a) whether or not it ALSO carries walls above, so (a)
  //       alone cannot tell "top of the load path" from "one more floor in the middle of it". (b)
  //       is the missing half of the spec's own description and brings Hospital down to the 2
  //       true roof slabs + a handful of isolated panels with no wall directly overlapping the
  //       next level up (open corridor/atrium bays) — reported, not silently forced to exactly 2.
  // Promoted -> roof role -> seq 8, phase 'Architecture'. Otherwise stays whatever seq matchRule
  // gave it (the floor case). No new numeric constant either way — both checks compare the slab
  // against its own extracted geometry and the walls' own extracted geometry.
  //
  // Pure two-phase pass over `elements` (order-independent — both original call sites ran it on
  // differently-sorted arrays with identical .seq results). Mutates promoted slabs' el.seq (and
  // el.phase — harmless bookkeeping on the x-ray path, whose elements never carried a phase field
  // and nothing downstream reads it). Returns { total, seedCount, m4Count } so each caller keeps
  // its own log wording — only injectGantt logs §GANTT_OVERRIDE, _buildXrayElements stays silent.
  function _promoteRoofLoadPath(elements) {
    var loadPathWalls = elements.filter(function(e) { return e.cls.indexOf('IfcWall') === 0; });
    var loadPathOverrides = 0;
    var lpGuids = [];  // promoted GUIDs — returned for the §4D_ROOF_LOAD_PATH witness hook (G-RLP-2/3)
    // §4D_WALLS_BEFORE_ROOF (2026-08-01) — pass 1 computes the SEED set exactly as #1120 shipped it
    // (clause a AND clause b), so the shipped count is reproduced unchanged before M4 widens it.
    var lpSlabs = [], lpSeed = [];
    elements.forEach(function(el) {
      if (el.cls !== 'IfcSlab') return;
      var carriers = loadPathWalls.filter(function(w) {
        return el.x0 <= w.x1 && el.x1 >= w.x0 && el.y0 <= w.y1 && el.y1 >= w.y0;
      });
      if (!carriers.length) return;
      var midSum = 0, above = [];
      for (var ci = 0; ci < carriers.length; ci++) {
        midSum += (carriers[ci].base_z + carriers[ci].top_z) / 2;
        if (carriers[ci].base_z >= el.top_z) above.push(carriers[ci]);
      }
      var wallMidheight = midSum / carriers.length;
      var clauseA = el.base_z > wallMidheight;
      lpSlabs.push({ el: el, clauseA: clauseA, above: above });
      if (clauseA && !above.length) {
        el.seq = 8; el.phase = 'Architecture';
        loadPathOverrides++;
        lpSeed.push(el);
        lpGuids.push(el.guid);
      }
    });

    // §4D_WALLS_BEFORE_ROOF M4 (2026-08-01, prompts/GANTT_ACCURACY.md §4D_WALLS_BEFORE_ROOF) —
    // user, live on a Hospital MaxQ bake: "The roof before the walls still happening on the roof
    // top". #1120's clause (b) disqualifies a roof if ANY XY-overlapping wall stands on it. On
    // Hospital that disqualifies the 2091.5 m² topmost deck (3Csn1z$1v5Q8DXdumWYJUE, base_z 199.66)
    // because the two helipad boxes — whose OWN roofs #1120 promoted — stand on it. MEASURED on
    // origin/main: it starts 2022-07-27 as Superstructure while its 14 wall carriers finish
    // 2023-04-30 — 277 days before its own walls, the identical error #1120 reported fixing for the
    // boxes. This is #1120's `⚠ LIMIT 2` arriving, and wider than LIMIT 2 predicted: these walls are
    // 3.05–3.47 m tall and DO carry something, so LIMIT 2's "parapet carries nothing" discriminator
    // would not have caught it.
    //   THE RULE: a wall standing on a slab is not "the next storey" if that wall is itself CAPPED
    //   by a slab already known to be a roof (a helipad box, a plant enclosure, a coped parapet —
    //   the load path tops out in a roof, it does not continue the building). Capped = a seed roof
    //   slab XY-overlapping the wall with its base_z between the wall's base_z and top_z + GAP. A
    //   wall capped by NOTHING does not qualify.
    //   DEPTH 1, ON THE FROZEN SEED SET, DELIBERATELY. Full recursion was measured and collapses:
    //   the box walls excuse the 199.66 deck -> the deck excuses 3064w0y0nDv9wdb1cWL_Gu -> Level 6
    //   promotes -> Level 5 -> Level 4 -> the whole building becomes "roof". Depth-1 terminates.
    //   MEASURED: Hospital 10 -> 11. The one addition is the user's slab. Level 6 (3 blockers),
    //   Level 5 (33), Level 4 (514) and #1120's own floor control 1OV06Y3c5D8vODNyxVnSVI (56) all
    //   stay blocked. A footprint-extent ratio was tried and REJECTED — it does not separate (roof
    //   0.040 vs intermediate panels 0.024/0.024/0.029/0.044, Level 6 0.170); no threshold exists,
    //   which is why this is a load-path rule and not an area rule.
    var LP_GAP = 0.5;  // m — same "tops out at this level" tolerance schedule_gate.js uses (GAP)
    var m4Promoted = 0;
    if (lpSeed.length) {
      lpSlabs.forEach(function(rec) {
        var el = rec.el;
        if (el.seq === 8 || !rec.clauseA || !rec.above.length) return;
        for (var ai = 0; ai < rec.above.length; ai++) {
          var w = rec.above[ai], capped = false;
          for (var si = 0; si < lpSeed.length; si++) {
            var C = lpSeed[si];
            if (C.x0 <= w.x1 && C.x1 >= w.x0 && C.y0 <= w.y1 && C.y1 >= w.y0 &&
                C.base_z >= w.base_z && C.base_z <= w.top_z + LP_GAP) { capped = true; break; }
          }
          if (!capped) return;             // a wall the building genuinely continues through
        }
        el.seq = 8; el.phase = 'Architecture';
        loadPathOverrides++; m4Promoted++;
        lpGuids.push(el.guid);
      });
    }
    return { total: loadPathOverrides, seedCount: lpSeed.length, m4Count: m4Promoted, guids: lpGuids };
  }

  // §SCHEDULE_CLASSIFY_DEDUP (2026-08-15, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
  // §SCHEDULE_CLASSIFY_DEDUP — Witness: witness_class_fallback_blackbox.js). Before this,
  // matchNameOverride/matchRule were two BYTE-IDENTICAL closures, one inside _buildXrayElements
  // and one inside injectGantt — on top of the canonical, already-exported implementation
  // schedule_author.js carries (window.ScheduleAuthor.matchNameOverride/matchRule), same pattern
  // the §TM_DURATION_SYNC comment above _installSecs already used for install-time. ONE shared
  // pair now, delegating to ScheduleAuthor when loaded (always true past initial page load — this
  // is only ever called from schedule generation, never at script-eval time) with the same
  // algorithm kept as a fallback for the ScheduleAuthor-not-loaded case, matching this file's own
  // established convention (see _installSecs's wrapper a few hundred lines below). Both call
  // sites keep their own local matchNameOverride(cls,name)/matchRule(cls,name) wrappers — same
  // names, same signatures — so this is a pure body-swap, not a call-site rewrite.
  function _classifyNameOverride(cls, name, nameOverrides) {
    if (window.ScheduleAuthor && window.ScheduleAuthor.matchNameOverride) {
      return window.ScheduleAuthor.matchNameOverride(cls, name, nameOverrides);
    }
    if (!name || !nameOverrides) return null;
    for (var i = 0; i < nameOverrides.length; i++) {
      var ov = nameOverrides[i];
      if (ov.classes && ov.classes.indexOf(cls) < 0) continue;
      if (!ov._re) { try { ov._re = new RegExp(ov.pattern, ov.flags || 'i'); } catch (e) { ov._re = null; } }
      if (ov._re && ov._re.test(name)) return ov;
    }
    return null;
  }
  // §CIVIL_PHASE (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §Q) — discipline-keyed phase for civil models,
  // delegated to the one owner (ScheduleAuthor.civilRuleFor). null for every building element (NON-IMPACT rule).
  function _civilRule(db, guid) {
    var SA = window.ScheduleAuthor;
    return (SA && SA.civilRuleFor) ? SA.civilRuleFor(db, guid) : null;
  }
  function _classifyRule(cls, name, rules, dflt, nameOverrides) {
    if (!cls) return dflt;
    var ov = _classifyNameOverride(cls, name, nameOverrides);
    if (ov) return ov;
    if (window.ScheduleAuthor && window.ScheduleAuthor.matchRule) {
      return window.ScheduleAuthor.matchRule(cls, rules, dflt);
    }
    var bestKey = null, bestLen = 0;
    for (var key in rules) {
      if (cls.indexOf(key) >= 0 && key.length > bestLen) { bestKey = key; bestLen = key.length; }
    }
    if (!bestKey) console.warn('§CLASS_UNMATCHED cls=' + cls + ' falling back to default phase=' + dflt.phase);
    return bestKey ? rules[bestKey] : dflt;
  }

  // ══════════════════════════════════════════════════════════════════
  // ── §ZONE_INDEX (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §ZONE_INDEX —
  // Witness: viewer/tests/witness_zone_index.js W-ZONE) ────────────────────────────────────────
  // ONE derived spatial-zone index, built once per (building, _metaGen) and reused by every
  // building op that needs a zone. Before this, the SAME median-Z storey banding was written out
  // TWICE — inside _buildXrayElements and again inside injectGantt — byte-identical algorithms
  // differing only in which column index their own SELECT put `cz` at, plus a counter. That is the
  // duplication pattern CPE_4D_PERF_MEM_FINDINGS.md §R7 already records for the support predicate
  // (4 copies) and the element build (a self-described "DELIBERATE COPY"); a third consumer (the
  // §TIER_SERIAL_BY_ZONE barrier) would have made it three, so it is consolidated FIRST.
  //
  // ⚠ THE ZONE IS A GEOMETRIC INFERENCE, NOT IFC TRUTH — say so wherever it is reported. Measured
  // share of elements whose elements_meta.storey is null/empty/"unknown": Duplex 86.0%, Terminal
  // 69.9%, Clinic 32.2%, Hospital 15.9%. A key read straight from the column would be absent for
  // most elements on most buildings, which is why the median-Z reassignment exists at all and why
  // it — not the column — is the primary key.
  //
  // FALLBACK CHAIN, finest available wins, each level an optional refinement over the one below,
  // never a prerequisite (user: "storey room space should all come into play amicably"):
  //     room/space  → storey → derived median-Z band → single zone
  // Measured reason it must be a chain and not a requirement: of the 7 shipped buildings, ONLY
  // Terminal carries the richer tables (spatial_structure n=59, rel_contained_in_space n=2,181).
  // A model extracted without them loses precision, never correctness; a single-storey model
  // degrades to one zone, which is exactly today's global behaviour.
  //
  // ⚠ SCOPE OF THIS CHANGE: consolidation + cache ONLY. `level` and `spaceOf` are BUILT and
  // REPORTED but nothing consumes them yet — turning the space level on changes zone granularity,
  // which is a scheduling behaviour change and belongs with §TIER_SERIAL_BY_ZONE's own witness,
  // not with a refactor that has to prove itself byte-identical.
  var _zoneMemo = [];   // 2-slot, most-recent first — same discipline as §XRAY_CACHE_MEMO

  // §S62: the builder moved VERBATIM to viewer/zone_index.js (pure: db in, index out). The memo,
  // the key and the §ZONE_INDEX log below stay here — state and reporting are the parent's job.
  // Name kept so every caller and the __tmZoneProbe hook read unchanged.
  function _zoneIndexBuild(db) { return ZoneIndex.build(db); }

  // Memoized accessor. Key mirrors §XRAY_CACHE_MEMO: over-invalidating on _metaGen is the safe
  // direction (a miss costs one rebuild; a false hit is a wrong-zone bug).
  function _zoneIndex() {
    var app = TMS.A();
    if (!app || !app.db) return null;
    // Read _metaGen directly rather than borrowing §XRAY_CACHE_MEMO's helper — two unrelated memos
    // should not be coupled through a shared accessor just because their keys happen to rhyme.
    var key = ((app.activeBuilding) || '?') + '|' + ((app._metaGen != null) ? (app._metaGen | 0) : -1);
    for (var i = 0; i < _zoneMemo.length; i++) {
      if (_zoneMemo[i].key === key) {
        var hit = _zoneMemo[i];
        if (_zoneMemo.length > 1 && i > 0) { _zoneMemo.splice(i, 1); _zoneMemo.unshift(hit); }
        return hit.idx;
      }
    }
    var idx = _zoneIndexBuild(app.db);
    if (!idx) return null;
    _zoneMemo.unshift({ key: key, idx: idx });
    if (_zoneMemo.length > 2) _zoneMemo.length = 2;
    console.log('§ZONE_INDEX built bands=' + idx.names.length + ' level=' + idx.level +
      ' elements=' + idx.totalN + ' noStorey=' + idx.unknownN +
      ' (' + (100 * idx.unknownN / Math.max(1, idx.totalN)).toFixed(1) + '% — zone is a median-Z' +
      ' INFERENCE, not IFC truth)' + ' medianTies=' + idx.tiesN +
      ' spaceRows=' + idx.spaceN + ' ms=' + idx.buildMs.toFixed(1));
    return idx;
  }
  // Test hook (diagnostic only, same contract as __tmXrayProbe) — lets W-ZONE compare the shared
  // index against a freshly-built one and read the memo depth.
  window.__tmZoneProbe = function (op) {
    if (op === 'clearMemo') { _zoneMemo = []; }
    var idx = _zoneIndex();
    if (!idx) return null;
    return { bands: idx.names.length, names: idx.names.slice(), band: idx.band,
             medianZ: idx.medianZ, level: idx.level, ties: idx.tiesN,
             unknownN: idx.unknownN, totalN: idx.totalN, spaceN: idx.spaceN,
             memoDepth: _zoneMemo.length };
  };

  // §Z_STACK_XRAY_STAGING — support-edge cache for x-ray staging
  // ══════════════════════════════════════════════════════════════════
  // Implementing prompts/GANTT_ACCURACY.md §Z_STACK_XRAY_STAGING — Witness: witness_zstack_xray_staging.js
  // An element revealed at its scheduled time whose support carriers are NOT all placed renders
  // X-RAY instead of solid, and flips solid the instant its last carrier places. This is a
  // RENDER-ONLY gate layered on the existing (correct, user-confirmed) reveal timing — it never
  // writes kernel_ops, never reorders anything (W-XRAY-2: computeSchedule's output is untouched by
  // this section, byte-identical with or without it).
  //
  // _buildXrayElements() is a DELIBERATE COPY of the geometry+seq build inside injectGantt()
  // (repo convention: audit_support_roleblind.js / witness_stagger_support_order.js both copy the
  // support predicate rather than importing it — see origin/feat/element-cpm:viewer/schedule_gate.js
  // §ELEMENT_CPM, parked; only the PREDICATE is reused here, not the reordering engine it lived
  // in). EXCEPTION (2026-08-10): the roof/load-path promotion is no longer a copy — both this
  // function and injectGantt call the shared _promoteRoofLoadPath() above, because
  // verifyGanttIntegrity() (the schedule LOCK gate) runs on THIS build and a silent classifier
  // divergence there would be a correctness bug, not a rendering glitch.
  // It is intentionally NEVER called by injectGantt and has no db.run/INSERT capability — it
  // exists so the xray cache can be (re)built on EVERY TM activation, including the cached-gantt
  // fast path (§GANTT_CACHE_HIT) where injectGantt() never runs at all.
  function _buildXrayElements() {
    var app = TMS.A();
    if (!app || !app.db) return null;
    var db = app.db;
    var SR = window.SEQUENCE_RULES || {};
    var SD = window.SEQUENCE_DEFAULT || { phase: 'Architecture', sequence: 6, resource: null };
    var NO = window.SEQUENCE_NAME_OVERRIDES || [];
    // §SCHEDULE_CLASSIFY_DEDUP — body delegates to the one shared pair above (_classifyNameOverride/
    // _classifyRule), which itself defers to schedule_author.js's canonical, already-exported
    // matchNameOverride/matchRule. Local name/signature unchanged so nothing below this line moves.
    function matchNameOverride(cls, name) { return _classifyNameOverride(cls, name, NO); }
    function matchRule(cls, name) { return _classifyRule(cls, name, SR, SD, NO); }
    var r;
    try {
      r = db.exec(
        'SELECT m.guid, m.ifc_class, m.element_name, m.storey, ' +
        'COALESCE(t.center_z, 0) as cz, COALESCE(t.bbox_z, 0) as bz, ' +
        'COALESCE(t.center_x, 0) as cx, COALESCE(t.center_y, 0) as cy, ' +
        'COALESCE(t.bbox_x, 0) as bx, COALESCE(t.bbox_y, 0) as by ' +
        'FROM elements_meta m ' +
        'LEFT JOIN element_transforms t ON t.guid = m.guid ' +
        "WHERE " + _scheduledWhere('m')
      );
    } catch (e) { return null; }
    if (!r.length || !r[0].values.length) return null;

    // §ZONE_INDEX (2026-08-12) — was an inline copy of the median-Z banding, byte-identical to
    // injectGantt's own except for the column index its SELECT put `cz` at. One shared index now;
    // see _zoneIndexBuild's header for why the zone is an inference and why it is memoized.
    var _zi = _zoneIndex();
    function assignStoreyByZ(storey, cz) { return _zi ? _zi.assign(storey, cz) : storey; }

    var elements = r[0].values.map(function(row) {
      var cls = row[1], elName = row[2] || '', rawStorey = row[3] || '_UNKNOWN', cz = row[4] || 0, bz = row[5] || 0;
      var cx = row[6] || 0, cy = row[7] || 0, bx = row[8] || 0, by = row[9] || 0;
      var storey = assignStoreyByZ(rawStorey, cz);
      var rule = _civilRule(db, row[0]) || matchRule(cls, elName);   // §CIVIL_PHASE
      return {
        guid: row[0], cls: cls, storey: storey,
        base_z: cz - bz / 2, top_z: cz + bz / 2,
        x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2,
        seq: rule.sequence
      };
    });

    // §4D_ROOF_LOAD_PATH M1/M4 — same load-path promotion the live scheduler applies, now SHARED
    // (one classifier, _promoteRoofLoadPath above — consolidated 2026-08-10 from an inline copy
    // verified byte-identical in .seq output) so a promoted roof slab's carrier predicate (the
    // looser wall-bears check) matches what actually got scheduled — the exact scenario this whole
    // feature exists for ("roof before its walls"). Counts unused here: only injectGantt logs
    // §GANTT_OVERRIDE.
    var _lp = _promoteRoofLoadPath(elements);
    return elements;
  }

  // Build _tmXraySolidifyTs from elements + schedMap = { guid: {end: ms}, ... } (derived from the
  // CURRENT _ops, whatever their source — generated fallback or captured IFC 4D — so captured-path
  // ghosting works unchanged, same pass, per §Z_STACK_XRAY_STAGING's own out-of-scope note).
  // Predicate copied verbatim from origin/feat/element-cpm:viewer/schedule_gate.js lines 216-256
  // (structGrid/wallGrid spatial index, EPS/GAP/CELL constants) — same numbers the shipped
  // schedule_gate.js's own auditFloating() already uses.
  function _buildXraySupportCache(elements, schedMap) {
    TMS._tmXraySolidifyTs = {}; TMS._tmXrayStagedTotal = 0; TMS._tmXraySolidifiedN = 0;
    if (!elements || !elements.length) return;
    var t0 = performance.now();
    var CELL = 4, EPS = 0.05, GAP = 0.5;
    function cellsOf(e) {
      var o = [], i, j;
      for (i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
        for (j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j);
      return o;
    }
    function overlap(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }
    var structGrid = {}, wallGrid = {}, i, c, cs, k, arr, S, T;
    for (i = 0; i < elements.length; i++) {
      var e = elements[i];
      // §PROMOTED_CARRIER_POOL (2026-08-11, §TIER_SERIAL finding A follow-on): pool aligned with
      // auditFloating's (schedule_gate.js) — seq<=4 ∪ load-path-PROMOTED slabs (seq>4 IfcSlab).
      // Promoted roof slabs are audit/DAG carriers (helipad boxes stand on the promoted deck;
      // Terminal's 24k wall-carried cone) but were INVISIBLE here, so their dependents were never
      // staged/gated against them — the guard (_ogSupportSweep) applies the IDENTICAL pool, the
      // pair stays one physics (witness_og_guard_bearing_bound W-OGB-3).
      if (e.seq <= 4 || (e.cls === 'IfcSlab' && e.seq > 4)) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (structGrid[cs[c]] = structGrid[cs[c]] || []).push(e); }
      else if (e.cls && e.cls.indexOf('IfcWall') === 0) { cs = cellsOf(e); for (c = 0; c < cs.length; c++) (wallGrid[cs[c]] = wallGrid[cs[c]] || []).push(e); }
    }
    var eCount = 0;
    for (i = 0; i < elements.length; i++) {
      T = elements[i];
      var sc = schedMap[T.guid]; if (!sc) continue;
      var promotedSlab = (T.cls === 'IfcSlab' && T.seq > 4);
      cs = cellsOf(T);
      // §OG_BEARING_BOUND (2026-08-11) — the judge half of the guard's two-tier bearing rule (see
      // §PHASE_OVERLAP_SUPPORT_GUARD below for the full ruling): carriers topping within T's own
      // extent (+GAP) define its bearing plane; ENVELOPING carriers (top above T.top_z+GAP, e.g. a
      // full-height column the element frames into mid-span) still count as detected support but
      // only judge T when no in-extent carrier exists. Guard and judge MUST apply the identical
      // rule or staged>0 comes back (the 2026-08-07 §4D_LAYER_TRUTH alignment, third asymmetry
      // fixed then; this change keeps the pair symmetric while removing the crown-wait).
      var topBound = T.top_z + GAP, maxEnvEnd = 0;
      var mark = {}, maxCarrierEnd = 0, hasCarrier = false;
      for (c = 0; c < cs.length; c++) {
        arr = structGrid[cs[c]];
        if (arr) for (k = 0; k < arr.length; k++) {
          S = arr[k]; if (S === T || mark[S.guid]) continue; mark[S.guid] = 1;
          if (S.base_z < T.base_z - EPS && S.top_z >= T.base_z - GAP && overlap(S, T)) {
            var sc1 = schedMap[S.guid]; eCount++;
            if (sc1) { hasCarrier = true;
              if (S.top_z <= topBound) { if (sc1.end > maxCarrierEnd) maxCarrierEnd = sc1.end; }
              else if (sc1.end > maxEnvEnd) maxEnvEnd = sc1.end; }
          }
        }
        // §XRAY_WALL_SCOPE (found 2026-08-04, 4D_SCHEDULE_PERFECTION.md "Z-stack" chase): a wall is
        // only EVER a real candidate carrier for a slab ITSELF promoted to the roof role (seq>4) —
        // schedule_gate.js's auditFloating() already restricts wallGrid this way (§4D_ROOF_LOAD_PATH
        // M3: "walls do not structurally carry beams/members/furniture in this DB", MEASURED 2026-08-01
        // — the unrestricted version false-"floated" 0->3421/10979 on Hospital). This sibling
        // implementation never got that same restriction, so wallGrid was checked for EVERY element,
        // not just promoted slabs — a beam/column/ordinary-slab sitting near a wall's top height (a
        // wall's top and a beam's base are naturally close at any floor-to-floor transition) got
        // flagged as "carried by" a wall it never structurally depends on. MEASURED: 1,217 false-
        // positive xray-staged elements on Hospital (93% of them beams/columns/ordinary-slabs vs.
        // walls), all cleared to 0 by adding the SAME `promotedSlab` guard auditFloating() already
        // uses. Only reachable for a promotedSlab T (see var promotedSlab above), never for beams/
        // columns/furniture/MEP.
        if (promotedSlab) {
        arr = wallGrid[cs[c]];
        if (arr) for (k = 0; k < arr.length; k++) {
          S = arr[k]; if (S === T || mark[S.guid]) continue; mark[S.guid] = 1;
          if (!(S.base_z < T.base_z - EPS) || !overlap(S, T)) continue;
          if (S.top_z >= T.base_z - GAP) {
            var sc2 = schedMap[S.guid]; eCount++;
            if (sc2) { hasCarrier = true;
              if (S.top_z <= topBound) { if (sc2.end > maxCarrierEnd) maxCarrierEnd = sc2.end; }
              else if (sc2.end > maxEnvEnd) maxEnvEnd = sc2.end; }
          }
        }
        }
      }
      if (!maxCarrierEnd && maxEnvEnd) maxCarrierEnd = maxEnvEnd;   // §OG_BEARING_BOUND tier-2 fallback
      if (hasCarrier && maxCarrierEnd > sc.end) {
        TMS._tmXraySolidifyTs[T.guid] = maxCarrierEnd;
        TMS._tmXrayStagedTotal++;
      }
    }
    var msBuild = performance.now() - t0;
    console.log('§XRAY_EDGES n=' + eCount + ' ms=' + msBuild.toFixed(1) +
      ' staged=' + TMS._tmXrayStagedTotal + '/' + elements.length +
      ' (elements whose last support carrier finishes after their own reveal)');
  }

  // ── §XRAY_CACHE_MEMO (2026-08-12, bim-compiler prompts/CPE_4D_PERF_MEM_FINDINGS.md §3c —
  // Implementing R4(b), user ruling "memoize on an input key, keep the reset" — Witness:
  // viewer/tests/witness_xray_cache_memo.js W-XRAY-MEMO) ────────────────────────────────────────
  // The rebuild below ran on EVERY activation (~0.7s / 74,942 edges on Hospital), including the
  // §GANTT_CACHE_HIT fast path. It is a PURE FUNCTION of (elements from the DB) + (_ops end_ts),
  // so an identical-input re-activation was recomputing a byte-identical map.
  //
  // What is memoized and what is NOT — this distinction IS the doctrine compliance:
  //   MEMOIZED: the derived map (guid → solidify ms) + its "staged total". Pure, input-keyed.
  //   NOT MEMOIZED (still reset on TM-off, unchanged at :deactivate): _tmXraySolidifiedN and the
  //   per-object _tm_xrayStaged flags — the RUNTIME STAGING STATE. §Z_STACK_XRAY_STAGING's
  //   "nothing may survive TM being switched off" is about that state, and it still doesn't.
  // A memo surviving is not the same as state surviving.
  //
  // Safe to alias rather than deep-copy: the ONLY writes to _tmXraySolidifyTs[...] are inside
  // _buildXraySupportCache (which rebuilds it wholesale); every other site REASSIGNS the var
  // (`= {}`), never mutates the object, so deactivate()'s reset cannot corrupt the memo.
  //
  // TWO SLOTS, not one — and the reason is the MAXQ/Alt-C round trip specifically. A single slot
  // makes tmApplyDerivedOrder → tmRestoreDerivedOrder miss in BOTH directions: the derived re-key
  // evicts the real-order map, then restoring evicts the derived one. Two slots (most-recent +
  // previous) make that alternation hit both ways, which is exactly the path the cinema bake walks.
  // Witnessed: with one slot, G-XM-KEY's restore leg came back MISS.
  var _xrayElemMemo = null;    // { key, elements }  — DB-derived, _ops-independent (warmable)
  var _xrayCacheMemo = [];     // [{ key, ts, staged }, ...] most-recent first, capped at 2

  function _xrayMemoFind(key) {
    for (var i = 0; i < _xrayCacheMemo.length; i++) if (_xrayCacheMemo[i].key === key) return _xrayCacheMemo[i];
    return null;
  }
  function _xrayMemoPut(key, ts, staged) {
    for (var i = 0; i < _xrayCacheMemo.length; i++) {
      if (_xrayCacheMemo[i].key === key) { _xrayCacheMemo.splice(i, 1); break; }
    }
    _xrayCacheMemo.unshift({ key: key, ts: ts, staged: staged });
    if (_xrayCacheMemo.length > 2) _xrayCacheMemo.length = 2;
  }

  // _metaGen is in both keys per the ruling. It OVER-invalidates for the elements half (it bumps on
  // streaming/eviction, which cannot change a DB SELECT) — that is the deliberately safe direction:
  // a miss costs a rebuild, a false hit is a wrong-render bug.
  function _xrayMemoGen() {
    var app = TMS.A();
    return (app && app._metaGen != null) ? (app._metaGen | 0) : -1;
  }

  // Build the elements list, or serve it from the memo. Shared by the rebuild and by §TM_WARM.
  function _xrayElementsMemoized() {
    var app = TMS.A();
    var key = ((app && app.activeBuilding) || '?') + '|' + _xrayMemoGen();
    if (_xrayElemMemo && _xrayElemMemo.key === key) return { elements: _xrayElemMemo.elements, hit: true };
    var els = _buildXrayElements();
    if (els) _xrayElemMemo = { key: key, elements: els };
    return { elements: els, hit: false };
  }

  // Shared entry point: rebuild the xray cache from whatever _ops currently holds. Called from
  // _finishActivate (every TM activation) AND from tmRestoreDerivedOrder (MAXQ → back to the real
  // construction order, where the cache IS valid again and must not stay cleared).
  function _tmRebuildXrayCache() {
    var _xt0 = performance.now();
    var _xrSched = {};
    // opsSig: rolling hash over (guid, end_ts), computed in the pass that already builds _xrSched —
    // no extra traversal. This is what makes every re-key path self-correcting WITHOUT a special
    // case: tmApplyDerivedOrder (camera-path re-key) and _tmResyncAfterRetime (drag/ruler/group/
    // undo) both move end_ts, so the sig changes and the memo is forced to miss.
    var _sigH = 0x811c9dc5, _sigN = 0;
    for (var _xi = 0; _xi < TMS._ops.length; _xi++) {
      var _xo = TMS._ops[_xi];
      var _xg = _xo.output_guid || (_xo.input_guids && _xo.input_guids.length && _xo.input_guids[0]);
      if (_xg) {
        _xrSched[_xg] = { end: _xo.end_ts };
        _sigN++;
        for (var _sc = 0; _sc < _xg.length; _sc++) {
          _sigH ^= _xg.charCodeAt(_sc); _sigH = (_sigH * 0x01000193) >>> 0;
        }
        _sigH ^= (_xo.end_ts | 0); _sigH = (_sigH * 0x01000193) >>> 0;
      }
    }
    var _opsSig = TMS._ops.length + ':' + _sigN + ':' + _sigH.toString(16);
    var _key = _xrayMemoGen() + '|' + _opsSig;

    var _memoHit = _xrayMemoFind(_key);
    if (_memoHit) {
      TMS._tmXraySolidifyTs = _memoHit.ts;
      TMS._tmXrayStagedTotal = _memoHit.staged;
      TMS._tmXraySolidifiedN = 0;   // runtime progress ALWAYS restarts — never memoized
      console.log('§XRAY_CACHE_BUILD elemMs=0.0 edgeMs=0.0 total_ms=' +
        (performance.now() - _xt0).toFixed(1) + ' elemMemo=hit edgeMemo=hit staged=' + TMS._tmXrayStagedTotal);
      return;
    }

    var _e0 = performance.now();
    var _em = _xrayElementsMemoized();
    var _elemMs = performance.now() - _e0;
    var _xrElements = _em.elements;
    var _g0 = performance.now();
    if (_xrElements) _buildXraySupportCache(_xrElements, _xrSched);
    else { TMS._tmXraySolidifyTs = {}; TMS._tmXrayStagedTotal = 0; TMS._tmXraySolidifiedN = 0; }
    var _edgeMs = performance.now() - _g0;
    if (_xrElements) _xrayMemoPut(_key, TMS._tmXraySolidifyTs, TMS._tmXrayStagedTotal);
    console.log('§XRAY_CACHE_BUILD elemMs=' + _elemMs.toFixed(1) + ' edgeMs=' + _edgeMs.toFixed(1) +
      ' total_ms=' + (performance.now() - _xt0).toFixed(1) +
      ' elemMemo=' + (_em.hit ? 'hit' : 'miss') + ' edgeMemo=miss staged=' + TMS._tmXrayStagedTotal);
  }

  // ── §TIER_SERIAL / §TIER_REGATE (retired §S20 Part B, 2026-08-17, 4D_GANTT_TM_REFACTOR.md) —
  // the two-tier Substructure/Superstructure/Architecture-serial + audit-physics-regate display
  // repair chain (_TIER1_ORDER, _zoneOf, _tier1Extents, _tier1Serialize, _tier1Protrusion,
  // _tierAuditRegate — all reachable only through each other and the deleted _twoTierRemap below,
  // zero external callers, verified by grep before deletion) is DELETED. Replaced fleet-wide by
  // §CPM_DISPLAY's one-DAG forward pass (viewer/cpm_schedule.js) — see _displayTimeline below.
  // Confirmed twice this lane never reached this chain live (§S13.8 by reading, §S14.0 and every
  // fleet run since by measurement) before deleting it. Net: -216 lines.

  // ── §PHASE_OVERLAP_SUPPORT_GUARD — the support-order sweep ───────────────────────────────────
  // §S58 (SCRIPT_LENGTH_REFACTOR_SEAMS.md): the physics moved VERBATIM to viewer/support_sweep.js.
  // This wrapper is the parent's half of the split — it owns the § log line, the module owns the
  // rule. Do NOT reword the log: the §PHASE_OVERLAP_BAND token is pinned by the extraction's
  // before/after normalized log diff, which is what proves the move changed no behaviour.
  // Slicing note, replacing the old one: witness_og_guard_bearing_bound.js now slices
  // support_sweep.js BY FUNCTION NAME (brace-counted), so indentation and log wording no longer
  // rot it — that coupling is retired, not preserved. witness_gantt_og_grid_perf.js calls the
  // module directly. Do not re-introduce raw text markers here.
  // _allScheduled: mutated in place (including a bz-ascending sort); s only ever moves LATER
  // (push after real support), duration preserved.
  function _ogSupportSweep(_allScheduled, taskWin) {
      var r = SupportSweep.ogSupportSweep(_allScheduled, taskWin);
      if (r.pushed) console.log('§PHASE_OVERLAP_SUPPORT_GUARD pushed=' + r.pushed + '/' + _allScheduled.length +
        ' (sweeps=' + r.sweeps + ', bearing+hang) elements later than their §PHASE_OVERLAP_BAND window to stay after their real support');
      return r;
  }

  // ══ §CROSSTASK_JUDGE_PARITY — judge/repair parity, window-bounded ════════════════════════════
  // §S58: physics in viewer/support_sweep.js; this wrapper owns the § line. maxShiftMs and ms come
  // back from the module so the printed numbers are identical to the pre-extraction line.
  function _cjpJudgeParity(items, taskWin) {
    var r = SupportSweep.cjpJudgeParity(items, taskWin);
    if (r.ok !== false) console.log('§CROSSTASK_JUDGE_PARITY pushed=' + r.pushed + ' sweeps=' + r.sweeps +
      ' maxShiftDays=' + (r.maxShiftMs / 86400000).toFixed(1) +
      ' floating=' + r.floating + '/' + items.length + ' windowBlocked=' + r.windowBlocked +
      ' ms=' + r.ms +
      ' — judge-rule floating repaired within each element\'s own task window');
    return r;
  }

  // ══ §CPM_DISPLAY (2026-08-16, bim-compiler prompts/4D_SCHEDULE_ARCHITECTURE_REDESIGN.md
  // §STAGE4_RETIREMENT_PROPOSAL step 1) — the display timeline is authored by ONE dependency-DAG
  // forward pass (viewer/cpm_schedule.js: contact-graph support edges + host/opening + discipline +
  // storey hammocks + crew lower bound, SCC-condensed Kahn), replacing the retired _twoTierRemap +
  // _midairRepair repair chain at BOTH consumers of this one function (kernel_ops write + the
  // materializeZones displayRemap hook), so the movie, the Gantt windows, and the progress needle
  // describe the SAME schedule by construction — floating impossible instead of chased.
  // Measured fleet-wide before wiring (probe_cpm_schedule.js, all 7 buildings): floating 0/7,
  // storey order improves-or-matches RAW everywhere.
  // §S20 Part B (2026-08-17, 4D_GANTT_TM_REFACTOR.md) — the legacy chain this branch used to fall
  // back to (_twoTierRemap/_midairRepair/_tier1Serialize/_tierAuditRegate + their _tier1Extents/
  // _tier1Protrusion/_zoneOf/_TIER1_ORDER helpers) is DELETED: confirmed twice over this lane's
  // entire measured history (§S13.8 by reading, §S14.0 and every fleet run since by measurement)
  // that `§CPM_DISPLAY_FALLBACK` never fired live — CpmSchedule.run always succeeds. `?cpm4d=0`'s
  // fallback target no longer exists, so the URL-param lever is RETIRED (a flag that silently did
  // nothing, or worse referenced deleted code, is worse than no flag). `_CPM_DISPLAY` stays a named
  // variable (not inlined) rather than deleted outright: every witness/probe in this lane injects
  // its own `var _CPM_DISPLAY = true;` ahead of a sliced copy of this function (the established
  // convention for forcing the live branch in a sandbox with no `location` global) — keeping the
  // name means none of them need editing for this. The one truly exceptional path left (CpmSchedule
  // missing, or CpmSchedule.run failing — never once measured live) is a minimal explicit no-op +
  // loud console.error, not a silent revert to a chain that no longer exists.
  var _CPM_DISPLAY = true;
  function _displayTimeline(items) {
    // §CPM_DISPLAY_ONE_TRUTH: on a cold open the materializeZones hook computes FIRST
    // (§GANTT_PREMATERIALIZE) and the kernel_ops seam runs SECOND — measured live on Terminal
    // (2026-08-16): the two consumers' element recipes (schedule_author's vs this file's) produce
    // timelines 151.2d vs 121.2d, 36/72 windows duration-mismatched, §CROSSTASK floating 9. So:
    // whichever consumer computes first is THE schedule; the partner call of the same generation
    // cycle CONSUMES it here (one-shot — the next cycle recomputes fresh, so a rates/shift edit is
    // never served stale). Coverage is the fingerprint: a different building's guids miss.
    var _cache = _displayTimeline._last;
    if (_cache) {
      var _rh = 0, _rm = 0, _ri;
      for (_ri = 0; _ri < items.length; _ri++) { if (_cache.map[items[_ri].guid]) _rh++; else _rm++; }
      if (_rh > 0 && _rh >= 0.999 * (_rh + _rm)) {
        // §CPM_DISPLAY_EPOCH: the two consumers anchor computeSchedule differently (the hook at 0,
        // the seam at baseMs/_cap.base) — a verbatim replay would land ops in the wrong epoch
        // (1970 for any uncovered element). Rigid-shift the cached timeline so its earliest start
        // lands on the requester's own earliest RAW start: relative structure (the schedule) is
        // untouched, only the calendar anchor moves.
        var _reqMin = Infinity;
        for (_ri = 0; _ri < items.length; _ri++) if (items[_ri].s < _reqMin) _reqMin = items[_ri].s;
        var _delta = (isFinite(_reqMin) && isFinite(_cache.minS)) ? (_reqMin - _cache.minS) : 0;
        var _rstrag = {};
        for (_ri = 0; _ri < items.length; _ri++) {
          var _rc = _cache.map[items[_ri].guid];
          if (_rc) {
            items[_ri].s = _rc.start + _delta; items[_ri].e = _rc.end + _delta;
            if (_rc.str) _rstrag[items[_ri].guid] = 1;
          }
        }
        _displayTimeline._last = null;
        var _raud = _midairAudit(items);
        console.log('§CPM_DISPLAY_REUSE hits=' + _rh + ' misses=' + _rm + ' midair=' + _raud.midair +
          ' epochShiftDays=' + (_delta / 86400000).toFixed(1) +
          ' — this consumer replays the SAME timeline its partner authored (one truth, no second recipe)');
        return { cpm: 'reuse', midair: _raud.midair, stats: null, strag: _rstrag };
      }
    }
    if (_CPM_DISPLAY && typeof CpmSchedule !== 'undefined' && CpmSchedule.run) {
      // §S6_CREW_PASS (4D_GANTT_TM_REFACTOR.md §S2_REVIEW_VERDICT S6): hand the solve the SAME
      // per-resource crew caps computeSchedule runs on (max_crews_fixed wins over max_crews —
      // injectGantt's own §CREW_DEMAND rule), so precedence-displaced work is re-paced by real
      // crew capacity in-pass instead of landing simultaneously at the schedule tail.
      var _dtLR = (typeof window !== 'undefined' && window.LABOR_RATES) || {};
      var _dtMaxCrews = {};
      for (var _dtR in _dtLR) {
        if (_dtLR[_dtR].max_crews_fixed != null) _dtMaxCrews[_dtR] = _dtLR[_dtR].max_crews_fixed;
        else if (_dtLR[_dtR].max_crews) _dtMaxCrews[_dtR] = _dtLR[_dtR].max_crews;
      }
      var r = CpmSchedule.run(items, { maxCrews: _dtMaxCrews });
      if (r && r.ok) {
        for (var i = 0; i < items.length; i++) { items[i].s = r.solution.times[i].s; items[i].e = r.solution.times[i].e; }
        var aud = _midairAudit(items);
        _displayTimelineRemember(items, r.graph.stragglerOf);
        // §S51 item d (4D_GANTT_TM_REFACTOR.md §S51): when the CELL path authored this timeline,
        // remember each element's cell identity so injectGantt stamps it into the ops and the
        // Gantt groups bars BY CELL — the display reads the schedule's own grain instead of
        // re-deriving a coarser one. NOT one-shot (the partner consumer of the same generation
        // cycle replays via the REUSE branch above and still needs it); overwritten on every
        // fresh authoring, and set NULL on a GRAPH-path authoring so a building switch can never
        // leak one building's cells onto another's bars.
        if (r.gate && r.gate.cellKeys) {
          var _cm = {};
          for (var _cki = 0; _cki < items.length; _cki++) {
            var _ckp = String(r.gate.cellKeys[_cki]).split('\u0001');
            _cm[items[_cki].guid] = 'L' + _ckp[0] + '\u00b7T' + _ckp[1] + '\u00b7' + _ckp[2];
          }
          _displayTimeline._lastCell = { map: _cm, n: items.length };
        } else {
          _displayTimeline._lastCell = null;
        }
        console.log('§CPM_DISPLAY on — one-DAG schedule authored the display timeline' +
          ' midair=' + aud.midair + ' orphans=' + aud.orphans +
          ' stragglers=' + r.graph.counts.stragglers + ' (0 midair = nothing appears before what it touches)');
        // §GROUND_CONNECTED (2026-09-12) — NAME the orphans. The aggregate above never named an
        // element; the HHS Stahlbalkon brackets were found by watching a bake. Capped at 20 here
        // (the lock breach's own cap); the full list is _midairAudit's orphanGuids.
        if (aud.orphans) console.log('§SUPPORT_ORPHAN_GUIDS n=' + aud.orphans + ' seedMode=' + aud.groundSeedMode +
          ' first20=' + JSON.stringify((aud.orphanGuids || []).slice(0, 20)) +
          ' — not ground-connected through any bearing/carrier/embedded support chain; reported, never moved');
        var _cstrag = {};
        for (var _ci = 0; _ci < items.length; _ci++) if (r.graph.stragglerOf[_ci]) _cstrag[items[_ci].guid] = 1;
        return { cpm: true, midair: aud.midair, stats: r, strag: _cstrag };
      }
      console.error('§CPM_DISPLAY_FALLBACK CpmSchedule.run failed or unavailable — the legacy ' +
        'display-repair chain was retired (§S20 Part B, 2026-08-17); items left at their RAW ' +
        'computeSchedule times, unauthored (may show real hangings — this path has never fired live)');
    }
    _displayTimelineRemember(items, null);
    return { cpm: false, stats: null };
  }
  // §CPM_DISPLAY_ONE_TRUTH: the LAST computed display timeline, guid-keyed. materializeZones'
  // displayRemap hook serves THIS map when it covers the request — the kernel_ops movie and the
  // authored task windows then describe literally the same schedule, instead of two near-identical
  // recipes (time_machine's element build vs schedule_author's) re-deriving it 30 days apart
  // (measured live on Terminal, 2026-08-16: makespan 151.2d vs 121.2d, 36/72 task windows
  // duration-mismatched, §CROSSTASK_JUDGE_PARITY floating 9). Coverage is the fingerprint — a
  // different building's guids simply miss and fall through to the compute path.
  function _displayTimelineRemember(items, stragglerOf) {
    var map = {}, minS = Infinity;
    for (var i = 0; i < items.length; i++) {
      map[items[i].guid] = { start: items[i].s, end: items[i].e, str: stragglerOf ? stragglerOf[i] : 0 };
      if (items[i].s < minS) minS = items[i].s;
    }
    _displayTimeline._last = { map: map, n: items.length, minS: minS };
  }

  // §ZONE_DISPLAY_AUTHORING (2026-08-16, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
  // §CHASE_TO_ZERO_WINDOW_AUTHORING) — the displayRemap hook handed to ScheduleAuthor.materializeZones
  // by every real UI call site in this file. The Gantt's task windows used to be derived from the RAW
  // computeSchedule output while the movie plays the TWO-TIER DISPLAY timeline (_twoTierRemap +
  // _midairRepair) — two different schedules; measured live 2026-08-16 on Hospital: display span 420d
  // vs authored windows 334d, and the captured overlay manufactured 2211 order violations out of a
  // 0-floating kernel_ops input. This hook maps the raw schedule through the SAME two functions the
  // kernel_ops write path runs — one physics, no copy — so authored windows and the movie describe
  // ONE schedule. Probe §EXP7/§EXP8 (probe_captured_floating.js, browser-faithful pipeline):
  // Hospital floating 664 -> 63, window fidelity 97.03% -> 99.95%.
  // §S4_RAW_SCHEDULE_REUSE (2026-08-16, 4D_GANTT_TM_REFACTOR.md §MODEL M4 + §STAGES S4) — mirrors
  // the EXISTING §CPM_DISPLAY_ONE_TRUTH display-timeline cache (_displayTimeline._last) one level
  // earlier: the RAW crew-leveled schedule itself. On a cold open, materializeZones
  // (schedule_author.js) computes its OWN ScheduleGate.computeSchedule call FIRST
  // (§GANTT_PREMATERIALIZE) and hands it to THIS hook as `schedule` — injectGantt's own later
  // computeSchedule call (needed only to feed _sched into §SUPPORT_CHECK's auditFloating) is
  // measured dead work when this covers the same elements (§S4_ACTIVATION_TIMING: ~1.6s on
  // Hospital-63k). A NEW, additive, ONE-SHOT cache (cleared on consumption, same one-shot
  // discipline as _displayTimeline._last so a rates/shift edit is never served stale) — does not
  // touch computeSchedule's own body or the existing display-timeline reuse contract.
  var _rawScheduleRemember = null;   // { map: {guid:{start,end}}, n }

  // ══ §HR_COST_PERSISTED (2026-09-21) — COST THE PROGRAMME THAT IS ALREADY SAVED ══════════════
  // red1: "isn't that injected and saved when user opens alt-c and save path and save in DB?" It
  // is, and nothing was missing from the save: every DB has schedules=1 with every element mapped
  // and all 122,330 LTU place-ops carry {"resource":"CONCRETE_GANG",...}.
  //
  // THE DEFECT. §CREW_DEMAND/§HR_COST are computed INSIDE injectGantt(), which is only reached from
  // the `!_placeOps.length` branch — the GENERATE path. MEASURED on three full 1080p bakes:
  //   Hospital  §GANTT injected=63415  §CREW_DEMAND x1   (ops judged STALE -> cleared -> regenerate)
  //   LTU       no §GANTT line          §CREW_DEMAND x0
  //   Terminal  no §GANTT line          §CREW_DEMAND x0
  // So a building was penalised for HAVING a saved programme, and Hospital only shows a cost
  // because its ops were thrown away.
  //
  // ⚠ I FIRST WITHDREW THIS FIX AND THAT WAS A MISTAKE. I checked ScheduleAuthor._installSecs,
  // saw it needs realQty/lengthRatio, and concluded a faithful recompute was impossible outside
  // injectGantt — without checking where those two come from. They come from
  // ScheduleAuthor._classFragmentation(db, RATES) and ._linearWeighting(db, RATES), both PUBLIC and
  // both taking nothing but the db. Every input is reachable, so the number is the same number.
  //
  // IDENTICAL BY CONSTRUCTION, not by intent: same fragmentation table, same linear weighting, same
  // matchNameOverride -> matchRule order, same _installSecs, same basis seconds, same LABOR_RATES.
  // Nothing is re-derived here; every step calls the one implementation injectGantt calls.
  //
  // IT WRITES NOTHING — no op, no task, no row. A saved programme stays exactly as authored.
  //
  // AND IT CHECKS ITSELF. On a building that regenerates (Hospital, HHS) BOTH paths run, so the two
  // numbers must agree; §HR_COST_AGREE reports the comparison and says WRONG if they differ by more
  // than a rounding step. That is the guard against this ever becoming the second-number defect
  // recorded as P4 in OCCUPANT_PATHFINDER.md §PATHING-DEFECTS.
  function _hrCostFromDb(app) {
    try {
      var db = app && app.db; if (!db) return null;
      var SA = window.ScheduleAuthor;
      if (!SA || !SA._installSecs || !SA._classFragmentation || !SA._linearWeighting || !SA.matchRule) {
        console.log('§HR_COST_PERSISTED INCONCLUSIVE — ScheduleAuthor helpers absent, so the only' +
          ' honest options were a DIFFERENT number or none; none is chosen');
        return null;
      }
      var RT = window.RATES || {}, LRx = window.LABOR_RATES || {};
      var SR = window.SEQUENCE_RULES || {};
      var SD = window.SEQUENCE_DEFAULT || { phase: 'Architecture', sequence: 6, resource: null };
      var NO = window.SEQUENCE_NAME_OVERRIDES || [];
      var frag = SA._classFragmentation(db, RT) || { fragmented: {}, area: {} };
      var lin = SA._linearWeighting(db, RT) || { avgLength: {} };
      var rr = db.exec(
        'SELECT m.guid, m.ifc_class, m.element_name, ' +
        'COALESCE(t.bbox_x, 0) as bx, COALESCE(t.bbox_y, 0) as by, COALESCE(t.bbox_z, 0) as bz ' +
        'FROM elements_meta m LEFT JOIN element_transforms t ON t.guid = m.guid ' +
        "WHERE " + _scheduledWhere('m'));
      if (!rr || !rr.length) return null;
      var basis = SR._productivity_basis_secs || 28800;
      var days = {}, n = 0, ovN = 0;
      rr[0].values.forEach(function (row) {
        var guid = row[0], cls = row[1], nm = row[2] || '';
        if (!cls) return;
        var ov = _civilRule(db, guid) || (SA.matchNameOverride ? SA.matchNameOverride(cls, nm, NO) : null);   // §CIVIL_PHASE
        if (ov) ovN++;
        var rule = ov || SA.matchRule(cls, SR, SD);
        var bx = row[3] || 0, by = row[4] || 0, bz = row[5] || 0;
        var realQty = (frag.fragmented[cls] && frag.area[guid] != null) ? frag.area[guid] : null;
        var hasGeom = bx > 0 || by > 0 || bz > 0;
        var avgLen = lin.avgLength[cls];
        var lengthRatio = (realQty == null && hasGeom && avgLen > 0) ? Math.max(bx, by, bz) / avgLen : null;
        var secs = SA._installSecs(cls, rule, LRx, realQty, lengthRatio) || 0;
        var res = (rule && rule.resource) || '_DEFAULT';
        days[res] = (days[res] || 0) + secs / basis; n++;
      });
      var total = 0, pd = 0, trades = 0, log = [];
      for (var k in days) {
        var rate = LRx[k]; if (!rate || !rate.rate_per_day) continue;
        var p = days[k] * (rate.crew_size || 1), c = p * rate.rate_per_day;
        total += c; pd += p; trades++;
        log.push(k + ' personDays=' + p.toFixed(1) + ' @' + rate.rate_per_day + '/d = ' + Math.round(c));
      }
      var out = { total: Math.round(total), personDays: +pd.toFixed(1), trades: trades };
      if (!(total > 0)) {
        console.log('§HR_COST_PERSISTED INCONCLUSIVE elements=' + n + ' resources=[' +
          Object.keys(days).join(' ') + '] — none matched a LABOR_RATES row, so no cost is claimed');
        return null;
      }
      console.log('§HR_COST_PERSISTED total=' + out.total + ' personDays=' + out.personDays +
        ' across ' + trades + ' trades over ' + n + ' elements (nameOverrides=' + ovN + ')' +
        ' — recomputed from the SAVED programme with the SAME helpers injectGantt uses. ' + log.join(' | '));
      return out;
    } catch (e) { console.log('§HR_COST_PERSISTED threw: ' + e.message); return null; }
  }
  // Always compute, so a building that regenerates can CHECK the recompute against the real thing.
  function _hrCostEnsure(app, placeOpsLen) {
    var already = app && app._hrCost && app._hrCost.total > 0 ? app._hrCost.total : null;
    var mine = _hrCostFromDb(app);
    if (already != null && mine) {
      var d = Math.abs(mine.total - already), pct = already ? (100 * d / already) : 0;
      console.log('§HR_COST_AGREE generate=' + already + ' recompute=' + mine.total +
        ' delta=' + d + ' (' + pct.toFixed(3) + '%) => ' + (pct <= 0.01 ? 'ok — the two paths agree' :
        'WRONG — the recompute is NOT the same number, which is the P4 defect and must be fixed, not shipped'));
      return;   // the generate path's own figure stands; the recompute was only the check
    }
    if (!already && mine && placeOpsLen) app._hrCost = mine;   // fill the gap a saved programme leaves
  }

  // §TPL_WIRED (2026-08-26, bim-compiler prompts/4D_BAR_MODEL.md §19/§20) — the 4D programme
  // template, loaded ONCE and handed to every materializeZones call site in this file.
  //
  // WHY THIS EXISTS. viewer/rates/4D_template.json shipped 2026-08-25 (PR #1531-#1534) and
  // schedule_author.js's instantiateTemplate() has read it since — but NO production call site
  // ever passed `opts.template`, so the whole template path was dead code while every live
  // schedule came from deriveZones grouping the geometry solve after the fact. Four schedule
  // witnesses pass `template:` THEMSELVES, so the path was green and unreached at the same time
  // (4D_BAR_MODEL.md line 693: "No witness exercises the LIVE call sites").
  //
  // ROUTED THROUGH loadJsonWithOverrides so a Settings edit (json_4d_template) applies, exactly
  // as grid_drag.js does for json_grid_rules — one convention, not a second loader.
  //
  // NULL IS THE SAFE FALLBACK, BY CONSTRUCTION: materializeZones ignores an absent opts.template
  // and runs the legacy zone path byte-identically, so a fetch failure degrades to today's
  // behaviour instead of breaking generation.
  var _4dTemplate = null, _4dTemplateTried = false;
  // §CIVIL_TEMPLATE (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §Q, §MIXED_PROGRAMME): when the open model carries ANY
  // civil discipline (SEQUENCE_CIVIL keys), the programme comes from rates/4D_template_civil.json — which also declares the
  // structure phases (a bridge merged into a road is built ALONGSIDE it, user ruling 2026-10-06). Was: EVERY element civil,
  // so a road + bridge got the building template and no civil order at all. No civil row → the building template, exactly
  // as before (NON-IMPACT rule: fleet DBs hold 0 civil rows). The choice is re-made per db so a later building reverts.
  var _4dTemplateBase = null, _4dTemplateCivil = null, _4dTemplateDb = null;
  // §SCHEDULE_POPULATION — the owner is ScheduleAuthor.scheduledWhere (schedule_author.js); this is its only caller-side
  // fallback, for a page where schedule_author.js failed to load (§LOAD_FAIL) — the pre-owner clause, unchanged.
  function _scheduledWhere(a) {
    if (window.ScheduleAuthor && window.ScheduleAuthor.scheduledWhere) return window.ScheduleAuthor.scheduledWhere(a);
    var p = a ? a + '.' : '';
    return p + "ifc_class != 'IfcOpeningElement' AND " + p + "ifc_class != 'IfcSpace'";
  }
  function _hasCivil(db) {
    var keys = Object.keys(window.SEQUENCE_CIVIL || {});
    if (!db || !keys.length) return false;
    try {
      var r = db.exec("SELECT COUNT(*), SUM(CASE WHEN discipline IN (" + keys.map(function () { return '?'; }).join(',') +
        ") THEN 1 ELSE 0 END) FROM elements_meta WHERE " + _scheduledWhere(''), keys);
      var n = r.length ? r[0].values[0][0] : 0, c = r.length ? (r[0].values[0][1] || 0) : 0;
      console.log('§CIVIL_TEMPLATE_GATE scheduled=' + n + ' civil=' + c + ' → ' + (c > 0 ? (c === n ? 'civil' : 'civil+structures') : 'building'));
      return c > 0;
    } catch (e) { return false; }
  }
  async function _civilSwap() {
    var app = TMS.A(), db = app && app.db;
    if (_4dTemplateDb === db) return _4dTemplate;
    _4dTemplateDb = db;
    if (!_hasCivil(db)) { _4dTemplate = _4dTemplateBase; try { window._4dTemplate = _4dTemplate; } catch (e) {} return _4dTemplate; }
    if (!_4dTemplateCivil) {
      try {
        _4dTemplateCivil = await fetch('rates/4D_template_civil.json').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
      } catch (e) { console.warn('§CIVIL_TEMPLATE_FAIL ' + e.message + ' — keeping the building template'); return _4dTemplate; }
    }
    _4dTemplate = _4dTemplateCivil;
    try { window._4dTemplate = _4dTemplate; } catch (e) {}
    console.log('§CIVIL_TEMPLATE loaded rates/4D_template_civil.json v' + ((_4dTemplate.meta && _4dTemplate.meta.version) || '?') +
      ' phases=' + (_4dTemplate.phases || []).length + ' — model carries civil disciplines (order: ' + ((_4dTemplate.meta && _4dTemplate.meta.order_source) || '').split(' — ')[0] + ')');
    return _4dTemplate;
  }
  async function _load4DTemplate() {
    if (_4dTemplateTried) return _civilSwap();
    _4dTemplateTried = true;
    var url = 'rates/4D_template.json';
    try {
      _4dTemplate = (typeof window.loadJsonWithOverrides === 'function')
        ? await window.loadJsonWithOverrides(url, 'json_4d_template')
        : await fetch(url).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
          });
      // published so schedule_author_ui.js's draft path uses the SAME template object — one
      // programme, not a second copy loaded on its own.
      try { window._4dTemplate = _4dTemplate; } catch (e) {}
      console.log('§TPL_WIRED loaded ' + url + ' v' +
        ((_4dTemplate && _4dTemplate.meta && _4dTemplate.meta.version) || '?') +
        ' phases=' + ((_4dTemplate && _4dTemplate.phases || []).length) +
        ' — the programme is AUTHORED; deriveZones no longer defines the phases');
    } catch (e) {
      _4dTemplate = null;
      console.warn('§TPL_WIRED_FAIL ' + e.message +
        ' — falling back to the legacy deriveZones path (byte-identical to pre-2026-08-26)');
    }
    _4dTemplateBase = _4dTemplate;
    return _civilSwap();
  }
  // §S7-INJECT (TM_4D5D_VARIANCE_LANE §S7-GRAIN/§S7-INJECT-WHERE) — the "Generate programme" pill
  // action needs the SAME template this function fetches, and §S7-INJECT is explicit: "reuse that,
  // do not load a second copy". The pill can fire before Time Machine has ever been opened (that is
  // the whole point — the user does not have to find ✎ Author first), so `window._4dTemplate` may
  // still be unset at that moment; a second fetch()/loadJsonWithOverrides call in a new module would
  // be exactly the duplicated loader this note forbids. Exposing THIS function (idempotent — its own
  // `_4dTemplateTried` guard makes a second call a no-op after the first real fetch) is the smallest
  // possible seam: one loader, two callers, both awaiting the one promise/cache.
  window.tm4DTemplate = _load4DTemplate;

  // §FUTURE-5A A7 (attempted 2026-09-02, queue item B-3, REVERTED same day) — rates.js's
  // `var SHIFT_HOURS = 24` is hand-copied as a literal `24` fallback at 4 separate sites in this
  // file ("the shape that produced §GANTT_SHIFT_HOURS_DESYNC — one copy missed", §FUTURE-5A's own
  // words). Consolidating all 4 into one `_shiftHoursOrDefault()` helper was tried and REVERTED in
  // the same session as B1's STRUCT_MAX_SEQ revert, same root cause: `witness_gantt_native_generate.js`
  // slices `generateGanttSchedule` out of this file as raw source text and evals it in a sandbox
  // that only also includes `_tmBusyRecording`/`_tmEditLocked` — a call to a shared helper declared
  // elsewhere in this file is undefined in that sandbox (masked by a SECOND ReferenceError inside
  // the catch, `_tmEditExceptionRecover is not defined`, since that's ALSO not in the slice — the
  // real cause only surfaces by removing the outer catch and looking directly). Left as 4 literal
  // `(window.SHIFT_HOURS > 0) ? window.SHIFT_HOURS : 24` copies, unchanged. Before retrying this
  // consolidation, audit every `sliceFn`/`new Function` witness in `viewer/tests/` that slices ANY
  // of the 4 enclosing functions (grep for the pattern first, not just for SHIFT_HOURS).

  // §TUKEY_BOUND (4D_GANTT_TM_REFACTOR.md stage 2, 2026-08-17) — hoisted out of _tmDisplayRemap
  // (was a nested closure there) so buildGanttTasks() can share the SAME envelope math instead of
  // re-deriving its own. This is the proven, already-shipped, already-measured rule (Hospital
  // floating 664->63, window fidelity 97.03%->99.95% when this landed for §ZONE_WINDOW_DAGWINS_CLIP)
  // — uniform at every group size, no group-size branch, no cliff. Percentile convention matches
  // storeyOrderReport/§GANTT_GAP_CLAMP: sorted[Math.floor(n*p)], no interpolation.
  // §S53 (F3): the formula itself now lives in gantt_model.js — ONE envelope shared by the drawer's
  // bar spans, the display axis, and witness_midair_zero.js (which used to slice this function out
  // of this file BY SOURCE TEXT). This delegate keeps the in-file callers reading unchanged.
  function _tukeyBound(arr, lowSide) {
    return window.GanttModel.tukeyBound(arr, lowSide);
  }
  function _tmDisplayRemap(elements, schedule) {
    (function () {
      var map = {}, n = 0;
      elements.forEach(function (el) {
        var st = schedule[el.guid];
        if (st) { map[el.guid] = { start: st.start, end: st.end }; n++; }
      });
      _rawScheduleRemember = { map: map, n: n };
    })();
    var items = [];
    elements.forEach(function (el) {
      var st = schedule[el.guid]; if (!st) return;
      items.push({ guid: el.guid, s: st.start, e: st.end, bz: el.base_z, tz: el.top_z,
        x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1,
        cls: el.cls, seq: el.seq, phase: el.phase, storey: el.storey, lvlSec: el.lvlSec, civil: el.civil, disc: el.disc,   // §CHAINAGE_LEVELS
        resource: el.resource });   // §S6_CREW_PASS: the solve's in-pass crew pools key on this
    });
    if (!items.length) return null;
    _displayTimeline(items);   // §CPM_DISPLAY: same single source as the kernel_ops write path (times only)
    var out = {};
    // §ZONE_WINDOW_DAGWINS_CLIP (2026-08-16, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §MODEL M2 —
    // superseded the min/max-over-non-stragglers formula this tag originally shipped with; tag kept,
    // formula changed per M2's own instruction). A TASK BAR is the ROBUST ENVELOPE of ALL its
    // members' true times — Tukey fences (Q1-1.5*IQR .. Q3+1.5*IQR, clamped to actual min/max) over
    // member starts (low fence) and ends (high fence), the same outlier-statistic family as the
    // shipped per-task median-based §GANTT_GAP_CLAMP. CLASSIFICATION-FREE (no straggler graph lookup
    // needed) — right on BOTH Hospital-shaped (late-tail) and Terminal-shaped (straggler-mass)
    // buildings, where a fixed classification undercounted/overcounted depending on shape. For WINDOW
    // AUTHORING ONLY, every member's time is clamped into its group's fence so the bar shows the
    // group's own coherent mass; a genuine outlier still rides outside the resulting bar (never
    // hidden — §TIER_DAG_WINS doctrine unchanged) — deriveZones takes a plain min(start)/max(end)
    // over what this function returns, so clamping IS the mechanism that shapes the bar. The
    // movie/ops keep TRUE physics times (this map is window-authoring-only, per §ZONE_DISPLAY_AUTHORING
    // above — never fed back into `items`). Percentile convention matches storeyOrderReport /
    // §GANTT_GAP_CLAMP: sorted[Math.floor(n*p)], no interpolation.
    var _SGw = (typeof ScheduleGate !== 'undefined') ? ScheduleGate : null;
    var _gkOf = function (it) {
      return (it.phase || '_UNPHASED') + '||' + (_SGw && _SGw.collapsePhase ? _SGw.collapsePhase(it.storey) : (it.storey || ''));
    };
    var _groups = {};
    items.forEach(function (it) {
      var k = _gkOf(it), g = _groups[k] || (_groups[k] = { starts: [], ends: [] });
      g.starts.push(it.s); g.ends.push(it.e);
    });
    // §TUKEY_BOUND — hoisted to module scope (2026-08-17, 4D_GANTT_TM_REFACTOR.md stage 2) so
    // buildGanttTasks() shares this exact function instead of re-deriving it a third time.
    var _bar = {};
    Object.keys(_groups).forEach(function (k) {
      var g = _groups[k], lo = _tukeyBound(g.starts, true), hi = _tukeyBound(g.ends, false);
      _bar[k] = { lo: lo, hi: Math.max(hi, lo) };   // degenerate-group safety (n=1, zero IQR)
    });
    var _clamped = 0;
    items.forEach(function (it) {
      var b = _bar[_gkOf(it)], st = it.s, en = it.e;
      if (b) {
        var nst = Math.min(Math.max(st, b.lo), b.hi), nen = Math.min(Math.max(en, b.lo), b.hi);
        if (nen <= nst) { nst = Math.max(b.lo, b.hi - 60000); nen = b.hi; }
        if (nst !== st || nen !== en) _clamped++;
        st = nst; en = nen;
      }
      out[it.guid] = { start: st, end: en };
    });
    console.log('§ZONE_WINDOW_DAGWINS_CLIP clamped=' + _clamped +
      ' (Tukey-fenced group envelope, classification-free, for WINDOW AUTHORING ONLY — ops/movie keep true physics times)');
    return out;
  }

  // ══ §TM_REVEAL_TILED (2026-09-02, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §FUTURE item 2,
  // §TM_REVEAL_SHIPPED) — WHERE inside its bar each element PLAYS. ════════════════════════════
  // Witness: viewer/tests/witness_tm_reveal_within_bar.js (W-RWB). Probe: scripts/probe_tm_reveal_shipped.js.
  //
  // THE FINDING. materializeZones returns `displaySchedule` (= ScheduleAuthor.remapSolveToTasks:
  // support-layer bands, duration-weighted tiling — §TPL_MOVIE_BINDS_BARS "every element now plays
  // inside the bar that claims it") and this file never read it. The kernel_ops timestamps the
  // scrubber and the film actually play were written by injectGantt's _tmRescaleToTaskWindow: a
  // per-task AFFINE of the CPM group's raw [min,max] onto the template window. CpmSchedule's GLOBAL
  // per-resource crew pools give a task's members a raw span of up to 434 d for a 35-day bar
  // (Hospital TASK_MEP_Rough_in_Level_1), so the affine squashed the group's core into a sliver and
  // left the rest of the bar empty. Measured on the shipped chain (sliced live functions, no
  // browser): dead air (bar lit, NOTHING in progress) mean 44/63/63/71% of every bar on Duplex/HHS/
  // Hospital/Terminal, worst 99.9%; Hospital TASK_MEP_Final_Level_5 n=564 days=3 reveal deciles
  // [3.5,0,0,0,0,0,0,0,0,96.5]; 553 Hospital footings on 200 distinct instants inside the first
  // half of an 11-day bar, days 6-11 empty. User, 2026-09-02: "the sub structure and floor slabs
  // are appearing all one shot instead of nicer progressive animation."
  //
  // THE FIX. Call the verb the codebase already owns for this question (4D_MODEL_INTEGRITY.md §I
  // "where inside its task?") instead of re-deriving a layout here: remapSolveToTasks with the CPM
  // display times as the solve and NO layer map — one band per task, members in CPM start order
  // (ties on guid), each element's width its own CPM-duration share, tiled edge-to-edge across the
  // task's real window. Monotone, so every ordering CPM established survives — the exact property
  // the affine was chosen for (measured: 0 order violations over 119k adjacent pairs, 4 buildings);
  // no dead air by construction (measured 0.0% on all four); no number invented (widths are the
  // durations the solve computed, windows are the template's). §S50's cell order stays the live
  // precedence carrier — this changes SPACING, never order. Gated on schedules.display_authored=1
  // (our own authored windows — the same flag §CAP_RESCALE_SKIP/§OG_SWEEP_SKIP key on); imported/
  // captured/baselined schedules keep the affine byte-identically, as does any element this map
  // misses. Task windows, dates, crews, cost and the film cursor are untouched.
  //
  // WHAT IT DOES NOT DO, ON PURPOSE: a superstructure level's slab SET stays compact — _installSecs
  // prices every IfcSlab at a flat 823 s (0.8% of Hospital L3's labour) and the cell order lays a
  // level out trade-by-trade — both rulings, neither this function's to change (spec §D).
  function _tmTilePlayWithinTasks(disp, cap, displayAuthored) {
    if (!cap || !cap.win || !cap.guidTask) {
      console.log('§TM_REVEAL_TILED skip reason=no dated task windows (_cap null) — affine rescale kept');
      return null;
    }
    if (!displayAuthored) {
      console.log('§TM_REVEAL_TILED skip reason=schedule not display-authored (imported/captured/baselined windows) — affine rescale kept');
      return null;
    }
    // Resolved through `window` only — the same seam every real UI call site in this file uses for
    // ScheduleAuthor (buildTaskIndex, generateGanttSchedule); a witness sandbox supplies window.ScheduleAuthor.
    var SA = (typeof window !== 'undefined' && window.ScheduleAuthor) || null;
    if (!SA || typeof SA.remapSolveToTasks !== 'function') {
      console.log('§TM_REVEAL_TILED skip reason=ScheduleAuthor.remapSolveToTasks unavailable — affine rescale kept');
      return null;
    }
    var base = cap.base;
    if (!isFinite(base)) { base = Infinity; for (var k0 in cap.win) if (cap.win[k0].s < base) base = cap.win[k0].s; }
    var tasks = [], byTid = {}, skipped = 0;
    for (var g in cap.guidTask) {
      var tid = cap.guidTask[g], w = cap.win[tid];
      if (!w || !disp[g]) { skipped++; continue; }
      var t = byTid[tid];
      if (!t) { t = byTid[tid] = { id: tid, sDays: (w.s - base) / 86400000, eDays: (w.e - base) / 86400000, guids: [] }; tasks.push(t); }
      t.guids.push(g);
    }
    if (!tasks.length) {
      console.log('§TM_REVEAL_TILED skip reason=no element resolves to a dated task — affine rescale kept');
      return null;
    }
    var r = SA.remapSolveToTasks(disp, tasks, new Date(base).toISOString(), null);
    console.log('§TM_REVEAL_TILED tasks=' + tasks.length + ' mapped=' + r.mapped + ' skipped=' + skipped +
      ' degenerate=' + r.degenerateTasks +
      ' — each element plays its own CPM-duration share of its bar, CPM order kept, no dead air (was: per-task affine, §TM_ELEMENT_WINDOW_RESCALE)');
    return r.schedule;
  }

  // _twoTierRemap (retired §S20 Part B, 2026-08-17, 4D_GANTT_TM_REFACTOR.md) — the legacy
  // two-tier (Substructure/Superstructure/Architecture-serial, then audit-physics-regate) display
  // orchestrator. Reachable ONLY via _displayTimeline's now-deleted fallback branch — confirmed
  // twice this lane never reached it live (§S13.8 by reading, §S14.0 and every fleet run since by
  // measurement) before deleting it. Replaced fleet-wide by §CPM_DISPLAY's one-DAG forward pass
  // (viewer/cpm_schedule.js) — see _displayTimeline above.

  // ══ §MIDAIR_REPAIR — the one place the physical world is derived ═════════════════════════════
  // §S58: _contactGraph / _designatedSupport / _midairAudit moved VERBATIM to support_sweep.js,
  // with their full doctrine comments. These three wrappers are bare delegates — no log exists on
  // this path today and none was added. The names are FROZEN: witness_gantt_lock_integrity.js
  // gates on `function _midairAudit(` being present in this file, and _displayTimeline /
  // verifyGanttIntegrity resolve them as bare identifiers at run time.
  function _contactGraph(items) { return SupportSweep.contactGraph(items); }

  // _designatedSupport(items, G) — see support_sweep.js. PRECONDITION: G.ok === true.
  function _designatedSupport(items, G) { return SupportSweep.designatedSupport(items, G); }

  // _midairAudit(items) — the JUDGE. See support_sweep.js.
  function _midairAudit(items) { return SupportSweep.midairAudit(items); }

  // _midairRepair (retired §S20 Part B, 2026-08-17, 4D_GANTT_TM_REFACTOR.md) — the legacy
  // display-repair pass that used to run after _twoTierRemap. Replaced fleet-wide by §CPM_DISPLAY's
  // one-DAG forward pass (viewer/cpm_schedule.js), which guarantees 0 midair BY CONSTRUCTION
  // instead of chasing it after the fact — see _displayTimeline above. The doctrine this repair
  // enforced (the acceptance bar, contact definition, why-it-was-safe reasoning) is unchanged and
  // still documented once, above _contactGraph/_midairAudit (both KEPT — _midairAudit is still the
  // 🔓→🔒 lock-gate's judge, verifyGanttIntegrity).

  // §GANTT_LOCK_INTEGRITY (2026-08-07, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md) — the
  // lock-back verification core. Pure READ: rebuilds geometry via _buildXrayElements() (works on
  // the §GANTT_CACHE_HIT path too) and audits the CURRENT op times — the post-edit truth, whatever
  // the user dragged — with ScheduleGate.auditFloating, ALL classes, no filter (the §DEQ_V1 bar).
  // The check IS auditFloating: when §GEOMETRIC_SUPPORT_ORDER-class upgrades land in the gate
  // module, this hook strengthens automatically, no separate integration.
  // Returns { ok, floating, total, guids, ms, skipped? }. A state with nothing auditable (no
  // geometry / gate not loaded) verifies ok WITH the skip named — logged by the caller, never a
  // silent false pass.
  function verifyGanttIntegrity() {
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    function ms() { return Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0); }
    if (typeof ScheduleGate === 'undefined' || !ScheduleGate.auditFloating)
      return { ok: true, skipped: 'no_schedule_gate', floating: 0, total: 0, guids: [], ms: ms() };
    var els = _buildXrayElements();
    if (!els || !els.length) return { ok: true, skipped: 'no_geometry', floating: 0, total: 0, guids: [], ms: ms() };
    var sched = {};
    for (var i = 0; i < TMS._ops.length; i++) {
      var o = TMS._ops[i];
      var g = o.output_guid || (o.input_guids && o.input_guids.length && o.input_guids[0]);
      if (g) sched[g] = { start: o.timestamp, end: o.end_ts || o.timestamp };
    }
    // audit only elements that are scheduled AND have real geometry — §4D_NOGEO parked elements
    // (zero bbox at origin) can neither bear nor hang and sit at project end by design
    var audited = [];
    for (var j = 0; j < els.length; j++) {
      var e = els[j];
      if (!sched[e.guid]) continue;
      if (e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z) continue;
      audited.push(e);
    }
    if (!audited.length) return { ok: true, skipped: 'no_scheduled_geometry', floating: 0, midair: 0, total: 0, guids: [], ms: ms() };
    var guids = [];
    var n = ScheduleGate.auditFloating(audited, sched, null, guids);
    // §MIDAIR_REPAIR (2026-08-12) — the lock gate must judge by the SAME rule the generator
    // enforces, or a planner's drag can re-create exactly the hangings the generated film has none
    // of and the lock would still be granted: auditFloating's support pools (seq<=4 + promoted
    // slabs + walls) cannot see an element whose real neighbours are outside them, nor any
    // structure-pool member at all. Same _contactGraph, no mutation — REFUSING the lock is right
    // here, where a human made the change and can undo it, whereas the generator repairs silently.
    var mrItems = audited.map(function (e) {
      var t = sched[e.guid];
      return { guid: e.guid, s: t.start, e: t.end, bz: e.base_z, tz: e.top_z,
        x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1 };
    });
    var ma = _midairAudit(mrItems);
    // §S73 — the breach must name WHAT THE EDIT BROKE, not the first 20 offenders it happens to scan.
    // Two defects lived in the one line this replaces (`if (ma.midair && guids.length < 20) guids =
    // guids.concat(...)`):
    //   1. whenever auditFloating's own collector alone reached 20 — documented as normal on 4 of 7
    //      shipped buildings (Terminal 8, Clinic 1, JKR 81, LTU_AHouse 334) — the midair offenders
    //      were SILENTLY dropped, so a midair-caused breach listed only floating elements;
    //   2. even with room, the sample was scan-ordered, so it was dominated by the PRE-EXISTING tail
    //      the baseline already knew about, and the element the planner just dragged was usually
    //      absent. That is the operator-facing failure: "your edit broke physics — here are twenty
    //      guids you did not touch."
    // Fix: rank NEW offenders (absent from the lock baseline's own offender set) ahead of known ones,
    // keep floating-then-midair order inside each rank, then cap at the same 20. The full list is
    // returned as allGuids so captureLockBaseline can remember the set instead of just the counts.
    var allGuids = guids.concat(ma.guids || []);
    var baseSet = (_lockBaseline && _lockBaseline.guidSet) || null;
    var ranked = allGuids;
    if (baseSet) {
      var fresh = [], known = [];
      for (var ai = 0; ai < allGuids.length; ai++) (baseSet[allGuids[ai]] ? known : fresh).push(allGuids[ai]);
      ranked = fresh.concat(known);
    }
    guids = ranked.slice(0, 20);
    // §GANTT_LOCK_DELTA (2026-08-12) — the gate asks "did YOUR EDIT break physics", not "is the
    // generator perfect". Absolute zero was the wrong test and was already wrong before
    // §MIDAIR_REPAIR: measured pre-repair auditFloating on the shipped buildings was Terminal 8,
    // Clinic 1, JKR 81, LTU_AHouse 334 (the documented warn-only tails — co-planar framing, mutual
    // bearing, the §SUPPORT_CYCLE population), so `ok: n === 0` refused the lock on 4 of 7
    // buildings on a FRESHLY GENERATED, UNEDITED schedule. A planner could never re-lock there.
    // The reference is now the state captured when editing began (_lockBaseline, set on unlock):
    // a breach is an INCREASE in either measure. Both counts are still reported absolutely, so the
    // known tails stay visible instead of being defined away.
    var base = _lockBaseline || { floating: n, midair: ma.midair };
    return { ok: n <= base.floating && ma.midair <= base.midair,
      floating: n, midair: ma.midair, baseFloating: base.floating, baseMidair: base.midair,
      dFloating: n - base.floating, dMidair: ma.midair - base.midair,
      total: audited.length, guids: guids, allGuids: allGuids, ms: ms() };
  }

  // §GANTT_LOCK_DELTA — the physics state at the moment editing STARTED. Captured on 🔒→🔓 so the
  // lock-back comparison is against what the planner inherited, never against an ideal the shipped
  // generator does not reach on every building. Null ⇒ verifyGanttIntegrity self-references (any
  // first call is its own baseline), which is the safe direction: it can only refuse a WORSENING.
  var _lockBaseline = null;
  function captureLockBaseline() {
    var v = verifyGanttIntegrity();
    // §S73: remember WHICH elements were already offending, not just how many. That set is what lets
    // a later breach rank the newly-broken elements first — the ones the planner's edit is
    // responsible for — instead of burying them under the tail that was there all along.
    var gset = {};
    (v.allGuids || v.guids || []).forEach(function (g) { gset[g] = 1; });
    _lockBaseline = { floating: v.floating, midair: v.midair, guidSet: gset };
    console.log('§GANTT_LOCK_BASELINE floating=' + v.floating + ' midair=' + v.midair +
      ' total=' + v.total + ' ms=' + v.ms + ' (edit start — a lock is refused only on an INCREASE)');
    return _lockBaseline;
  }

  // ══════════════════════════════════════════════════════════════════
  // Z-DRIVEN CONSTRUCTION SCHEDULE
  // ══════════════════════════════════════════════════════════════════
  //
  // One abstract rule: lower Z finishes before higher Z starts.
  // Within same Z-band (storey): seq from SEQUENCE_RULES for phase order.
  // Same resource on same storey = sequential. Different resource = parallel.
  // Always re-inject on activate — never use stale cached ops.

  // §GANTT_REFOLD_HANG (2026-08-10, 4D_SCHEDULE_PERFECTION.md §GANTT_REFOLD_HANG handoff):
  // injectGantt()'s two hot loops froze the tab on Hospital (63,415 elements — live-confirmed:
  // the console stream stopped dead between §PHASE_OVERLAP_SUPPORT_GUARD's log and
  // §WRITE_LOOP_TIMING's, which never printed). Both loops are order-dependent (shared object
  // refs mutate .s/.e read by later elements) so they cannot be parallelized or reordered — but
  // chunking PRESERVES order: slicing them into _TM_CHUNK-sized batches with a macrotask yield
  // between batches changes nothing about the output, only returns control to the browser.
  // setTimeout(0), not rAF — must keep draining while the tab is backgrounded.
  var _TM_CHUNK = 2500;
  function _tmYield() { return new Promise(function (r) { setTimeout(r, 0); }); }

  // §GANTT_REFOLD_HANG sync note (2026-08-12): the branch's extracted _ogSupportGuard was
  // superseded during the 26-commit drift by main's own _ogSupportSweep (witness-locked physics —
  // see §OG sections above); this sync keeps main's sweep untouched and lands ONLY the chunked
  // kernel_ops writer below (the measured §WRITE_LOOP_TIMING freeze) + the async call-site plumbing.
  async function _writeScheduledChunked(db, _allScheduled, _yieldFn) {
    if (_yieldFn === undefined) _yieldFn = _tmYield;
    var _wlT0 = performance.now();
    db.run('BEGIN');
    var _upd = db.prepare("UPDATE kernel_ops SET timestamp = ?, parameters = ? " +
      "WHERE op_type = 'ELEMENT_PLACE' AND output_guid = ?");
    for (var _wi = 0; _wi < _allScheduled.length; _wi++) {
      var item = _allScheduled[_wi];
      item.params._end_ts = item.e;
      item.params._captured = 1;
      item.params._task = item.task;
      _upd.run([item.s, JSON.stringify(item.params), item.guid]);
      if (_yieldFn && ((_wi + 1) % _TM_CHUNK === 0) && (_wi + 1) < _allScheduled.length) {
        db.run('COMMIT'); await _yieldFn(); db.run('BEGIN');
      }
    }
    _upd.free();
    console.log('§WRITE_LOOP_TIMING rows=' + _allScheduled.length + ' ms=' + (performance.now() - _wlT0).toFixed(1));
    db.run('COMMIT');
  }
};
