// time_machine family — part `gantt_build` (original time_machine.js lines 4931–6330).
// GENERATED move-only by scripts/split_closure.js (config scripts/split_configs/time_machine.json). Below the `yield` every
// statement is the original text; the only edit is that a name owned by ANOTHER part is reached as TMS.name.
// Edit this file normally from now on; regenerate only to re-split a branch that still edits the old single file.
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts = (typeof window !== 'undefined' ? window : globalThis).__timeMachineParts || {};
(typeof window !== 'undefined' ? window : globalThis).__timeMachineParts.gantt_build = function* __split_time_machine_gantt_build(TMS) {
  'use strict';
  // phase 1 — publish this part's names that other parts use (same function objects; vars as live accessors)
  TMS.injectGantt = injectGantt;
  TMS.buildTaskIndex = buildTaskIndex;
  TMS.invalidateGanttModel = invalidateGanttModel;
  TMS._loadTwin = _loadTwin;
  TMS._loadShopfloor = _loadShopfloor;
  TMS._computeVariance = _computeVariance;
  TMS.drawVariance = drawVariance;
  Object.defineProperty(TMS, '_ganttTasksComputed', { get: function () { return _ganttTasksComputed; }, set: function (v) { _ganttTasksComputed = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttRebuildN', { get: function () { return _ganttRebuildN; }, set: function (v) { _ganttRebuildN = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttSpanFromTask', { get: function () { return _ganttSpanFromTask; }, set: function (v) { _ganttSpanFromTask = v; }, enumerable: true });
  Object.defineProperty(TMS, '_ganttSpanFromOps', { get: function () { return _ganttSpanFromOps; }, set: function (v) { _ganttSpanFromOps = v; }, enumerable: true });
  Object.defineProperty(TMS, '_taskIndex', { get: function () { return _taskIndex; }, set: function (v) { _taskIndex = v; }, enumerable: true });
  Object.defineProperty(TMS, 'PHASE_COLORS', { get: function () { return PHASE_COLORS; }, set: function (v) { PHASE_COLORS = v; }, enumerable: true });
  Object.defineProperty(TMS, 'PHASE_INK', { get: function () { return PHASE_INK; }, set: function (v) { PHASE_INK = v; }, enumerable: true });
  Object.defineProperty(TMS, 'PHASE_SHORT', { get: function () { return PHASE_SHORT; }, set: function (v) { PHASE_SHORT = v; }, enumerable: true });
  Object.defineProperty(TMS, '_twin', { get: function () { return _twin; }, set: function (v) { _twin = v; }, enumerable: true });
  yield;   // phase 2 resumes here, in this same scope: the original statements, in original order


  async function injectGantt() {
    var app = TMS.A();
    if (!app || !app.db) return false;
    var db = app.db;
    // §S4_ACTIVATION_TIMING (4D_GANTT_TM_REFACTOR.md §STAGES S4, measure-first per M4) — additive
    // profiling only, no behavior change. Bracket the phases inside the ~20s Hospital-63k activation
    // budget the diagnosis only partly itemized (§WRITE_LOOP_TIMING=7.19s + "computeSchedule+geo-
    // order ~1.5-2s", leaving ~11-12s unaccounted) so the real dominant cost can be MEASURED before
    // any call is skipped, per M4's own "measure per-chunk cost before touching" instruction.
    var _s4T0 = performance.now(), _s4Marks = [];
    function _s4Mark(label) { _s4Marks.push(label + '=' + (performance.now() - _s4T0).toFixed(0)); }

    db.run('CREATE TABLE IF NOT EXISTS kernel_ops (' +
      'id INTEGER PRIMARY KEY, timestamp INTEGER NOT NULL,' +
      'op_type TEXT NOT NULL, parameters TEXT NOT NULL,' +
      'input_guids TEXT, output_guid TEXT, undone INTEGER DEFAULT 0)');
    // §SE-7c: the T3 overlay pass below runs one UPDATE ... WHERE op_type=? AND output_guid=? PER
    // ELEMENT (up to 122K times on a large building) — with no index, each is a full table scan of
    // kernel_ops itself (also up to 122K rows), i.e. O(n^2). This index turns it into an indexed
    // lookup per UPDATE — the actual dominant cost behind "regenerate Time Machine after a schedule
    // change is slow" (materializeDefault's own writes were already fixed by §SE-5; this is a
    // DIFFERENT table/query, never indexed). IF NOT EXISTS — safe to re-run, no data change.
    db.run('CREATE INDEX IF NOT EXISTS idx_kernel_ops_guid ON kernel_ops(output_guid)');

    // ── T3 (§3.1): probe for a usable captured native IFC 4D schedule ──────────
    // If present + parseable, the generative timeline is rebased onto the real
    // project_start (baseMs below) and covered elements get their real task dates +
    // names (overlay at the end of this function). If absent/empty/unparseable,
    // _cap stays null → the generative path runs EXACTLY as before
    // (W-TM-FALLBACK regression guard — no behavioural change for no-4D buildings).
    var _cap = (function() {
      try {
        var tr = db.exec("SELECT task_id, name, schedule_start, schedule_finish FROM tasks " +
          "WHERE schedule_start IS NOT NULL AND schedule_finish IS NOT NULL " +
          "AND (is_summary IS NULL OR is_summary = 0)");
        if (!tr.length || !tr[0].values.length) return null;
        var win = {}, minS = Infinity, maxE = -Infinity, n = 0;
        tr[0].values.forEach(function(row) {
          var s = Date.parse(row[2]), e = Date.parse(row[3]);
          if (!isFinite(s) || !isFinite(e) || e < s) return;   // skip unparseable / inverted
          win[row[0]] = { s: s, e: e, name: row[1] || row[0] };
          if (s < minS) minS = s;
          if (e > maxE) maxE = e;
          n++;
        });
        if (!n) return null;                                    // no parseable dated leaf task
        // guid → task (earliest-starting task wins if an element links to several)
        var guidTask = {}, te = null;
        try { te = db.exec("SELECT task_id, guid FROM task_elements"); } catch(e) { te = null; }
        if (te && te.length && te[0].values.length) {
          te[0].values.forEach(function(row) {
            var tid = row[0], g = row[1];
            if (!win[tid]) return;                              // link points at summary/undated task
            if (!guidTask[g] || win[tid].s < win[guidTask[g]].s) guidTask[g] = tid;
          });
        }
        return { base: minS, projEnd: maxE, win: win, guidTask: guidTask, taskCount: n };
      } catch(e) { return null; }                               // no tasks table → fallback
    })();

    var SR = window.SEQUENCE_RULES || {};
    var LR = window.LABOR_RATES || {};
    var SD = window.SEQUENCE_DEFAULT || {phase:'Architecture',sequence:6,resource:null};
    var NO = window.SEQUENCE_NAME_OVERRIDES || [];  // §4D_FACADE_ORDER — see rates/sequence_rules.json

    // §4D_FACADE_ORDER: ifc_class alone cannot tell curtain-wall glazing/framing (IfcPlate/IfcMember)
    // from genuinely structural plates/members (e.g. Terminal's Metal Deck IfcPlate, seq 4 is correct
    // there) — name is the only extracted signal. Checked BEFORE the class lookup, never replacing it:
    // an element that matches no override keeps its plain class-default seq.
    // §SCHEDULE_CLASSIFY_DEDUP — same shared pair as _buildXrayElements above, see that comment.
    function matchNameOverride(cls, name) { return TMS._classifyNameOverride(cls, name, NO); }
    function matchRule(cls, name) { return TMS._classifyRule(cls, name, SR, SD, NO); }
    // §TM_DURATION_SYNC (viewer/schedule_author.js commit d35366a §LABOR_QUANTITY_WEIGHT): this used
    // to be a hand-duplicated copy of the per-unit-rate formula with NO fragmentation/area-weighting —
    // Terminal's 33,324 "Metal Deck" IfcPlate fragments (avg 0.074 m² each) each got a full per-element
    // labor charge, inflating the REAL-TIME PLAYBACK clock (via schedule_gate.js place()'s
    // installSecs*scaleFactor) even after schedule_author.js's WBS/Gantt dates were fixed to the
    // correct 111-day Superstructure. Now calls schedule_author.js's ScheduleAuthor._installSecs
    // (the SAME function materializeDefault/scheduleContiguous use) with the SAME realQty area-weight
    // (`_frag`, computed once per injectGantt() call below) — single source of truth, no second copy.
    var _frag = (function () {
      if (window.ScheduleAuthor && window.ScheduleAuthor._classFragmentation) {
        return window.ScheduleAuthor._classFragmentation(db, window.RATES || {});
      }
      console.warn('§TM_DURATION_SYNC_FALLBACK ScheduleAuthor not loaded — install-secs NOT area-weighted for fragmented classes');
      return { fragmented: {}, area: {} };
    })();
    // §HEAVY_MEMBER_SPEED_LIMIT sync (2026-08-04) — same gap as §TM_DURATION_SYNC above, found live:
    // this wrapper never passed the real-length weighting fix (schedule_author.js _installSecs 5th
    // arg) through, so the default/initial Time Machine timeline still charged every beam/column the
    // SAME flat duration regardless of real size, even though the "Generate first draft" wizard path
    // (schedule_author.js) already had it. Same single-source-of-truth call, just the missing param.
    var _lin = (function () {
      if (window.ScheduleAuthor && window.ScheduleAuthor._linearWeighting) {
        return window.ScheduleAuthor._linearWeighting(db, window.RATES || {});
      }
      return { avgLength: {}, length: {} };
    })();
    function getInstallSecs(cls, rule, guid, bx, by, bz) {
      rule = rule || matchRule(cls);
      var realQty = (_frag.fragmented[cls] && guid != null && _frag.area[guid] != null) ? _frag.area[guid] : null;
      var hasGeom = bx > 0 || by > 0 || bz > 0;
      var clsAvgLen = _lin.avgLength[cls];
      var lengthRatio = (realQty == null && hasGeom && clsAvgLen > 0) ? Math.max(bx, by, bz) / clsAvgLen : null;
      if (window.ScheduleAuthor && window.ScheduleAuthor._installSecs) {
        return window.ScheduleAuthor._installSecs(cls, rule, LR, realQty, lengthRatio);
      }
      // Fallback (ScheduleAuthor not loaded) — old per-element behavior, no area weighting.
      // §FUTURE-5A A1/B3 (applied 2026-09-02, queue item B-3): reads the SAME
      // LR._productivity_basis_secs / LR._zero_minute_floor_secs (sequence_rules.json) the primary
      // ScheduleAuthor._installSecs path above reads, literal-fallback identical to before this fix.
      var resource = rule.resource;
      var _floorSecs = LR._zero_minute_floor_secs || 120;
      if (!resource || !LR[resource]) return _floorSecs;
      var labor = LR[resource], bestPk = null, bestLen = 0;
      for (var pk in labor.productivity) {
        if (cls.indexOf(pk) >= 0 && pk.length > bestLen) { bestPk = pk; bestLen = pk.length; }
      }
      // §TPL_ZERO_MINUTE (§S65) — keep this fallback in step with ScheduleAuthor._installSecs'
      // default_productivity, or the two copies disagree the moment ScheduleAuthor fails to load.
      var prod = bestPk ? labor.productivity[bestPk] : (labor.default_productivity || 0);
      return prod > 0 ? Math.round((LR._productivity_basis_secs || 28800) / prod) : _floorSecs;
    }

    // Query elements with spatial Z
    var r;
    try {
      r = db.exec(
        'SELECT m.guid, m.ifc_class, m.element_name, m.storey, m.discipline, ' +
        'COALESCE(t.center_z, 0) as cz, COALESCE(t.bbox_z, 0) as bz, ' +
        'COALESCE(t.center_x, 0) as cx, COALESCE(t.center_y, 0) as cy, ' +
        'COALESCE(t.bbox_x, 0) as bx, COALESCE(t.bbox_y, 0) as by ' +
        'FROM elements_meta m ' +
        'LEFT JOIN element_transforms t ON t.guid = m.guid ' +
        "WHERE " + TMS._scheduledWhere('m') + " " +
        'ORDER BY cz, COALESCE(t.center_x, 0), COALESCE(t.center_y, 0)'
      );
    } catch(e) { console.log('§GANTT table error: ' + e.message); return false; }
    if (!r.length || !r[0].values.length) return false;
    _s4Mark('elemQuery');

    var totalDbElements = r[0].values.length;

    // ── Storey bands: group by storey name, rank by MEDIAN Z (bottom-up) ──
    // §S260c BUG5: Use median center_z per storey instead of min.
    // Min Z is unreliable — a column extending down from an upper storey gives it a low minZ,
    // causing upper elements to appear before lower storeys finish.
    // Median Z represents the typical floor level of that storey.
    // §ZONE_INDEX (2026-08-12) — was a second inline copy of the median-Z banding (see
    // _zoneIndexBuild). Same numbers, one owner, memoized across activations. The §GANTT
    // storey-bands line below is kept BYTE-IDENTICAL: it is part of W-ZONE's equivalence bar.
    var _zi = TMS._zoneIndex();
    var storeyMedianZ = _zi ? _zi.medianZ : {};
    var storeyNames = _zi ? _zi.names : [];
    var storeyBand = _zi ? _zi.band : {};

    console.log('§GANTT storey-bands: ' + storeyNames.length + ' bands from storey names (median Z): ' +
      storeyNames.map(function(s, i) { return i + '="' + s + '" medZ=' + storeyMedianZ[s].toFixed(1); }).join(', '));

    // §STOREY-Z (2026-07-18 — mirrors build/room_walker.js's proven storeyZAnchors/_assignByZ
    // pattern, "HHS: all 716 vertical curtain children carry storey 'Unknown'; their z clusters
    // match Level 1/2/3 exactly"): elements with no real storey containment — a literal "Unknown"
    // IFC storey label, confirmed general across every building checked (Hospital 14.9%, HHS
    // 30.8%, Terminal 69.9%, Duplex 87%) — all shared ONE storey key, so the mini-Gantt drawer's
    // storey|phase grouping merged them into ONE bar spanning nearly the whole project, masking
    // the genuinely-cascading per-Level bars next to it ("still all at once" per prompts/
    // HOSPITAL_4D_SUPERSTRUCTURE_DURATION_ANOMALY.md Item 6). Reassign to the nearest REAL storey
    // by median Z — deterministic, uses only already-extracted Z data, nothing invented — so the
    // Gantt grouping, the storey-band ranking above, and the roof-slab override below all see the
    // corrected storey with zero further code changes downstream.
    // §CHAINAGE_LEVELS (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md 2f/2g, user 2026-10-05: "make the buildup chainage";
    // industry: road works are planned on time-chainage / line-of-balance charts, not storeys). On a CIVIL model the build
    // ladder's LEVEL is the element's chainage section along the inferred route (tour.js app.civilRoutePath — the one owner,
    // the route Fly and Alt+C use), not a storey height. Road elements get storey "CH nn" (their section); building elements
    // (a merged bridge) keep their storeys, and every element carries lvlSec = its section, so the ladder owners
    // (schedule_gate.deriveBandRanks, cpm_schedule bandRank) order by section first, then height. Buildings: no civil
    // discipline → no route → no lvlSec → unchanged.
    var _chainPts = null;
    try {
      if (app.isCivilModel && app.isCivilModel() && typeof app.civilRoutePath === 'function') {
        // §CHAINAGE_V2: the film's DRIVE route (same points, drive direction) so the build runs the way the camera drives
        var _DR = typeof app.civilDriveRoute === 'function' ? app.civilDriveRoute() : null;
        if (_DR && _DR.length >= 2) _chainPts = _DR;
        else { var _CR = app.civilRoutePath(); if (_CR && _CR.path && _CR.path.length >= 2) _chainPts = _CR.path; }
      }
    } catch (eCR) { console.warn('§CHAINAGE_LEVELS route failed: ' + eCR.message); }
    function _nearIdx(x, z) {
      var bi = 0, bd = Infinity;
      for (var k = 0; k < _chainPts.length; k++) { var d = Math.hypot(_chainPts[k].x - x, _chainPts[k].z - z); if (d < bd) { bd = d; bi = k; } }
      return bi;
    }
    // §CHAINAGE_V2 (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §CHAINAGE_V2): an element's section = where it STARTS along
    // the drive — the lowest route index over the 4 plan corners of its REAL drawn box (owner: cpe_load_path.js
    // A._loadPathInstanceWorldBox). Filing by the vertex CENTROID put long drains / guardrails / curved road pieces in a later
    // section than what they touch: MEASURED 2,265 of 10,078 support edges ran backwards against the route (drain→pavement 995).
    // No drawn box (not streamed) → the centroid, counted in §CHAINAGE_LEVELS fromCentroid=.
    var _chainFromBox = 0, _chainFromCentroid = 0;
    function _secOf(guid, cx, cy, cz) {
      var wb = (typeof app._loadPathInstanceWorldBox === 'function') ? app._loadPathInstanceWorldBox(guid) : null;
      // a zero-size box at the origin is a lookup miss, not a position (MEASURED: 1,485 bridge pieces read (0,0,0)-(0,0,0) while the
      // DB places every one of them) → treat as no box, use the centroid
      if (wb && wb.maxX - wb.minX <= 0 && wb.maxZ - wb.minZ <= 0 && wb.maxY - wb.minY <= 0) wb = null;
      if (wb) {
        _chainFromBox++;
        return Math.min(_nearIdx(wb.minX, wb.minZ), _nearIdx(wb.minX, wb.maxZ), _nearIdx(wb.maxX, wb.minZ), _nearIdx(wb.maxX, wb.maxZ));
      }
      _chainFromCentroid++;
      var p = app.ifc2three(cx, cy, cz);
      return _nearIdx(p.x, p.z);
    }
    var _chainCivil = 0, _chainKept = 0;

    var unknownReassigned = 0;
    function assignStoreyByZ(storey, cz) {
      // §ZONE_INDEX: the reassignment itself now lives in the shared index; the counter stays here
      // because §GANTT_STOREY_Z below reports what THIS pass reassigned, not what the index holds.
      if (storey !== '_UNKNOWN' && !/^unknown$/i.test(storey)) return storey;
      if (!_zi || !storeyNames.length) return storey;
      unknownReassigned++;
      return _zi.assign(storey, cz);
    }

    // ── Build elements with storey-aware overrides ──
    var nameOverrides = 0;
    var elements = r[0].values.map(function(row) {
      var cls = row[1], elName = row[2] || '', rawStorey = row[3] || '_UNKNOWN', cz = row[5] || 0, bz = row[6] || 0;
      var cx = row[7] || 0, cy = row[8] || 0, bx = row[9] || 0, by = row[10] || 0;
      var _civ = TMS._civilRule(db, row[0]);
      var lvlSec;
      if (_chainPts) lvlSec = _secOf(row[0], cx, cy, cz);   // §CHAINAGE_LEVELS / §CHAINAGE_V2
      var storey = (_chainPts && _civ) ? ('CH ' + (lvlSec < 10 ? '0' : '') + lvlSec) : assignStoreyByZ(rawStorey, cz);  // §STOREY-Z
      if (_chainPts) { if (_civ) _chainCivil++; else _chainKept++; }
      var ov = _civ || matchNameOverride(cls, elName);   // §CIVIL_PHASE
      if (ov) nameOverrides++;
      var rule = ov || matchRule(cls);
      var seq = rule.sequence, phase = rule.phase;

      return {
        guid: row[0], cls: cls, name: elName, storey: storey,
        cz: cz, band: Math.floor(cz / 3),  // §S260e: Z-quantized band (3m = ~one floor)
        base_z: cz - bz / 2, top_z: cz + bz / 2,  // §gate: Z geometry (base = underside, top = where it tops out)
        x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2,  // §gate: XY footprint for the support gate
        seq: seq, phase: phase, lvlSec: lvlSec,   // §CHAINAGE_LEVELS (undefined on a building)
        civil: !!_civ, disc: row[4] || '',        // §CHAINAGE_E1 — same-discipline civil abutment is not support
        resource: rule.resource || '_DEFAULT',
        installSecs: getInstallSecs(cls, rule, row[0], bx, by, bz),
        // §4D_NOGEO (2026-08-07, 4D_SCHEDULE_PERFECTION.md §4D_LAYER_TRUTH): no transform row —
        // COALESCE lands it at origin with a zero bbox. It cannot bear, hang, or be witnessed, and
        // at z=0 (metres below the building) geoGate finds nothing under it, so it scheduled at
        // day 0 AND dragged its whole zone's start there (user-witnessed: "walls before the
        // foundations" — 233 such elements on Hospital, §GANTT band 0 z=[0.0,0.0] Architecture:233).
        noGeo: (bx === 0 && by === 0 && bz === 0 && cx === 0 && cy === 0 && cz === 0)
      };
    });
    if (_chainPts) console.log('§CHAINAGE_LEVELS sections=' + _chainPts.length + ' fromDrawnBox=' + _chainFromBox + ' fromCentroid=' + _chainFromCentroid + ' civilByChainage=' + _chainCivil +
      ' otherKeptStorey=' + _chainKept + ' (ladder = section first, then height — line of balance along the route)');
    if (unknownReassigned) console.log('§GANTT_STOREY_Z reassigned=' + unknownReassigned + ' no-storey elements to nearest real storey by median Z');
    if (nameOverrides) console.log('§NAME_OVERRIDE ' + nameOverrides + ' elements reclassified by name (' +
      NO.map(function(o){ return o.id; }).join(',') + ') — see rates/sequence_rules.json NAME_OVERRIDES');

    // §GROUNDWORK_SLAB (4D_GANTT_TM_REFACTOR.md §S9 / M5) — ONE shared definition
    // (ScheduleGate.groundworkSlabs), applied by BOTH element recipes (schedule_author's
    // _buildScheduleElements applies the same call) so authored zones/tasks and this movie recipe
    // reclassify the SAME slabs: a slab-on-grade (bears on grade/piles/footings only, in the
    // building's lowest Superstructure band) is Substructure work — E3's phase chain then orders
    // plate-before-steel at its level with zero solver changes. seq/resource unchanged.
    if (typeof ScheduleGate !== 'undefined' && ScheduleGate.groundworkSlabs) {
      var _gw = ScheduleGate.groundworkSlabs(elements), _gwN = 0, _gwLevels = {};
      elements.forEach(function (el) {
        if (_gw[el.guid]) { el.phase = 'Substructure'; _gwN++; _gwLevels[el.storey || '_'] = 1; }
      });
      if (_gwN) console.log('§GROUNDWORK_SLAB recipe=time_machine n=' + _gwN +
        ' levels=' + JSON.stringify(Object.keys(_gwLevels)) +
        ' — slab-on-grade reclassified Substructure (bears on grade/piles/footings only, lowest Superstructure band)');
    }

    // §4D_ROOF_LOAD_PATH M1 + §4D_WALLS_BEFORE_ROOF M4 — roof/load-path promotion, shared
    // classifier (full doctrine comments live on _promoteRoofLoadPath above, moved there verbatim
    // when the two inline copies were consolidated 2026-08-10).
    var _lp = TMS._promoteRoofLoadPath(elements);
    // §4D_ROOF_LOAD_PATH witness hook (double-underscore debug convention, same as __tmGanttShift):
    // witness_4d_roof_load_path G-RLP-2/3 read the promoted set here rather than from kernel_ops.
    // This hook was ADDED because the _cap path used to overwrite the ops' `phase` param with the
    // task NAME, hiding the promotion from kernel_ops; §GANTT_PHASE_CLOBBER (2026-08-12, ~:5238)
    // ends that clobber, so `phase` is honest in kernel_ops again — the hook stays because reading
    // the promoted set directly is still the cheaper, more direct assertion. Refreshed every run.
    window.__tmLoadPathPromoted = _lp.guids;
    if (_lp.total) console.log('§GANTT_OVERRIDE ' + _lp.total +
      ' slabs promoted to roof role (seq=8) by load path — base_z above the average midheight of their XY-overlapping walls' +
      ' (seed=' + _lp.seedCount + ' + M4 rooftop-appurtenance=' + _lp.m4Count + ')');

    // §S260e: Sort by actual Z (quantized to 3m bands) → seq → fine Z
    // Real construction: lower Z builds first regardless of storey name.
    // Within same Z band (~one floor height): seq order (columns→beams→slabs→walls→MEP).
    // This ensures pile caps at Z=-1 come before beams at Z=14, even if same storey name.
    elements.sort(function(a, b) {
      var aZband = Math.floor(a.cz / 3);
      var bZband = Math.floor(b.cz / 3);
      if (aZband !== bZband) return aZband - bZband;
      if (a.seq !== b.seq) return a.seq - b.seq;
      return a.cz - b.cz;
    });

    // Log band contents
    var bandCounts = {};
    elements.forEach(function(el) {
      if (!bandCounts[el.band]) bandCounts[el.band] = {n:0, minZ:el.cz, maxZ:el.cz, phases:{}};
      var bc = bandCounts[el.band];
      bc.n++;
      if (el.cz < bc.minZ) bc.minZ = el.cz;
      if (el.cz > bc.maxZ) bc.maxZ = el.cz;
      bc.phases[el.phase] = (bc.phases[el.phase] || 0) + 1;
    });
    for (var bk in bandCounts) {
      var bc = bandCounts[bk];
      var pp = [];
      for (var ph in bc.phases) pp.push(ph + ':' + bc.phases[ph]);
      console.log('§GANTT band ' + bk + ' z=[' + bc.minZ.toFixed(1) + ',' + bc.maxZ.toFixed(1) + '] ' +
        bc.n + ' elements: ' + pp.join(', '));
    }

    // ── Scale factor ──
    var totalSecs = 0;
    elements.forEach(function(el) { totalSecs += el.installSecs; });
    var rawMs = totalSecs * 1000;
    // Round the clock — 24/7 CALENDAR, no weekends, no holidays (unchanged ruling).
    // §ARCH_START_TEMPO / M1 (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md): the
    // 24/7 calendar never meant a 24-HOUR SHIFT, but this line assumed one — `rawDays` divided the
    // labour by a 24 h day while every second of it came from `28800/productivity`, i.e. an 8 h
    // crew-day (schedule_author.js _installSecs; its phase widths already divide by 28800*crews).
    // So the movie clock and the authored Gantt disagreed by exactly 24/8 on the same work.
    // schedule_gate.js now spends a crew's seconds inside an 8 h window per calendar day, so the
    // wall-clock day this project really needs is rawMs/SHIFT_MS — take the shift length FROM that
    // module (one owner, no second constant to drift).
    // COMPOSITION WITH scaleFactor, deliberately not compounding: scaleFactor exists only to inflate
    // a DEGENERATELY tiny project (<10 days) up to a watchable 10. Measuring rawDays on the capped
    // clock FIRST means the 3x the crew day already bought is counted before the <10 test — a
    // project that reaches 10 real days once its crews work 8 h/day gets scaleFactor 1, not a second
    // stretch on top. The 10-day floor is then in the same wall-clock unit as everything downstream.
    // §SHIFT_HOURS (2026-08-13, rates.js — user ruling: "24hr is our default, import and JSON
    // setting can import as we align to standard model"). schedule_gate.js's own default stays 8h
    // (so witnesses/probes that never pass shiftHours are untouched — see computeSchedule's header);
    // the REAL generation path reads rates.js's SHIFT_HOURS (default 24) and threads it through as
    // computeSchedule's 5th arg below, so the module actually runs the hours this project asked for.
    var fullDayMs = 24 * 3600000;
    var _shiftHours = (typeof window !== 'undefined' && window.SHIFT_HOURS > 0) ? window.SHIFT_HOURS : 24;
    var shiftMs = _shiftHours * 3600000;
    var rawDays = rawMs / shiftMs;
    var scaleFactor = rawDays < 10 ? (10 * shiftMs) / rawMs : 1;

    var projectDays = Math.max(10, Math.ceil(rawDays * scaleFactor));
    console.log('§CREW_DAY_CLOCK totalSecs=' + Math.round(totalSecs) + ' shiftH=' + (shiftMs / 3600000) +
      ' rawDays=' + rawDays.toFixed(1) + ' scale=' + scaleFactor.toFixed(2) + ' projectDays=' + projectDays +
      ' (was rawDays=' + (rawMs / fullDayMs).toFixed(1) + ' on the pre-M1 24h-shift clock)');
    var startDate = new Date();
    startDate.setDate(startDate.getDate() - projectDays);
    startDate.setHours(0, 0, 0, 0);
    // T3 §3.3: when a captured schedule exists, anchor the generated timeline onto the
    // REAL project_start so covered (real-date) and uncovered (generated) share one epoch.
    var baseMs = _cap ? _cap.base : startDate.getTime();

    // ── Schedule ──
    var resourceCursor = {};  // "resource|band" → next ms
    var count = 0;

    // §gate (2026-05-30): support-gate FALLBACK scheduler — REPLACES the old center-Z band gate
    // ("band N waits N-1") that floated beams over still-building tall columns (Hospital cols avg
    // 6.87m vs 3m bands → the band under a beam was often empty, so its gate found no support).
    // Each element is gated by the structure topping within ±TOL of its base_z. Pure logic lives in
    // schedule_gate.js (unit-tested: tests/test_schedule_gate.js → 0/1970 floating on real Hospital
    // geometry vs 1127/1970 before). Captured IFC 4D still OVERWRITES the covered subset VERBATIM in
    // the overlay pass below — this governs only the GENERATED fallback timing. No CPM/deps (planner's).
    // §CREW-CAP (2026-07-18): real-world crew count per trade — see schedule_gate.js header.
    // LABOR_RATES[resource].max_crews (rates.js / rates/sequence_rules.json), falls back to
    // schedule_gate.js's own MAX_CREWS_DEFAULT for any resource without an explicit value.
    // ── §CREW_DEMAND + §HR_COST (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
    // item 4 — Witness: viewer/tests/witness_crew_demand.js W-CREW) ───────────────────────────
    // User: "as each user imports own IFC set, the script gives them the max resource needed, and
    // when they edit it it can regenerate 4D anew" + "the 5D set per building will then reflect
    // the cost of HR used too."
    //
    // ⚠ WHAT THIS IS NOT: an auto-scaler. A first cut derived crews as
    // ceil(workDays(T)/projectDays) and MEASURED AS A NO-OP on all 7 buildings — projectDays is the
    // all-trade serial total (Hospital 1036, LTU 2329), so no single trade's work can exceed it and
    // the ceil is always 1, below every baseline. Worse, the premise behind wanting one was wrong:
    // MEP Rough-in's "130.8% occupancy" is a SINGLE-CREW-EQUIVALENT ratio (work-days ÷ window-days).
    // Exceeding 100% just means more than one crew is busy on average — which is the normal case.
    // The real check is capacity: MEP Rough-in draws on 3 trades x 2 crews over a 555-day window
    // = ~3,330 crew-days available against 725.9 needed. It is NOT crew-starved, and the shipped
    // table is not the small-job list it looked like. Reporting the numbers instead of "fixing"
    // something that measures fine.
    var _maxCrews = {};
    for (var _mcRes in LR) {
      if (LR[_mcRes].max_crews_fixed != null) _maxCrews[_mcRes] = LR[_mcRes].max_crews_fixed;
      else if (LR[_mcRes].max_crews) _maxCrews[_mcRes] = LR[_mcRes].max_crews;
    }
    // Per-trade labour content, straight from the installSecs the scheduler itself uses
    // (28800s = the 8h crew-day getInstallSecs divides by). §FUTURE-5A A1 (applied 2026-09-02,
    // queue item B-3): reads sequence_rules.json LR._productivity_basis_secs, same 28800 fallback.
    var _crewWorkDays = {};
    var _hrCostBasisSecs = LR._productivity_basis_secs || 28800;
    elements.forEach(function (el) {
      var _r = el.resource || '_DEFAULT';
      _crewWorkDays[_r] = (_crewWorkDays[_r] || 0) + (el.installSecs || 0) / _hrCostBasisSecs;
    });
    // §CREW_DEMAND — "the max resource needed", reported per trade so a user can see what to edit.
    // capacity = crews x projectDays crew-days; utilisation = demand / capacity. A trade over 100%
    // genuinely cannot fit and wants more crews; everything under is headroom.
    // §ARCH_START_TEMPO / M1: this ratio is only now dimensionally honest. demand is crew-days
    // (installSecs/28800 = 8 h each) while projectDays used to be counted on a 24-h clock, so ONE
    // calendar day was silently worth THREE crew-days of capacity and every utilisation printed here
    // was overstated ~3x. Same formula, same inputs — projectDays is now wall-clock days at the same
    // 8 h shift the demand is quoted in, so a trade's % is comparable to its real crew count.
    var _cdLog = [];
    for (var _cd in _crewWorkDays) {
      var _cdr = LR[_cd]; if (!_cdr) continue;
      var _crews = _maxCrews[_cd] || 1;
      // §CAP_SHADOW_FIX (2026-08-15, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
      // §HOSPITAL_LIGHTING_STILL_FLOATING): this used to be `var _cap = _crews * projectDays`. `var`
      // is function-scoped, and injectGantt() ALSO declares `_cap` (the captured-native-schedule
      // descriptor object) earlier at this function's top — same name, same scope, so this line
      // silently clobbered it with a number on every run. The overlay 250 lines below then threw
      // `_cap.guidTask[g]` on a NUMBER, on the FIRST covered guid, every time — caught by injectGantt's
      // own outer .catch (§GANTT_CACHE_ERR), invisible unless you read the log. Renamed so the two
      // never collide again.
      var _capacityCd = _crews * projectDays;
      _cdLog.push(_cd + ' demand=' + _crewWorkDays[_cd].toFixed(1) + 'cd crews=' + _crews +
        (_cdr.max_crews_fixed != null ? '(FIXED)' : '') +
        ' capacity=' + _capacityCd.toFixed(0) + 'cd util=' + (_capacityCd ? (100 * _crewWorkDays[_cd] / _capacityCd).toFixed(1) : '?') + '%');
    }
    console.log('§CREW_DEMAND projectDays=' + projectDays + ' — ' + _cdLog.join(' | ') +
      ' (util>100% = that trade cannot fit and wants more crews; set max_crews_fixed in ' +
      'rates/sequence_rules.json and regenerate to apply an edit)');

    // §HR_COST (5D) — the labour the schedule commits, per trade. personDays = crew-days x
    // crew_size (a 6-hand gang spends 6 person-days per crew-day); cost = personDays x rate_per_day.
    // ⚠ Reading note that matters for 5D: crew COUNT does not change this total — the same labour
    // content done by more hands in less time. Crews change WHEN the cost lands, not how much.
    // That time-phasing is what makes it 5D rather than a bill of quantities.
    var _hrTotal = 0, _hrPD = 0, _hrLog = [];
    for (var _hr in _crewWorkDays) {
      var _hrR = LR[_hr]; if (!_hrR || !_hrR.rate_per_day) continue;
      var _pd = _crewWorkDays[_hr] * (_hrR.crew_size || 1);
      var _cost = _pd * _hrR.rate_per_day;
      _hrTotal += _cost; _hrPD += _pd;
      _hrLog.push(_hr + ' personDays=' + _pd.toFixed(1) + ' @' + _hrR.rate_per_day + '/d = ' + Math.round(_cost));
    }
    // §HR_COST_EXPOSE (2026-08-30) — additive, read-only. §CPE_BIG_STATS wants the 5D headline for
    // a client-facing card, and the only honest source is the number this block already computed.
    // Re-deriving cost in the panel would be a second opinion about the schedule's own labour
    // content, which this file's header forbids.
    TMS.A()._hrCost = { total: Math.round(_hrTotal), personDays: +_hrPD.toFixed(1), trades: _hrLog.length };
    console.log('§HR_COST total=' + Math.round(_hrTotal) + ' personDays=' + _hrPD.toFixed(1) +
      ' across ' + _hrLog.length + ' trades — ' + _hrLog.join(' | ') +
      ' (crew count changes WHEN this lands, not the total)');

    // §4D_NOGEO: geometry-less elements are EXCLUDED from the support-gated schedule (they poison
    // it at day 0) and parked at the project end below — present in the movie's totals, never in
    // its physics.
    var _geoElements = elements.filter(function (el) { return !el.noGeo; });
    var _noGeoN = elements.length - _geoElements.length;
    // §S4_RAW_SCHEDULE_REUSE: if the materializeZones hook already computed this same element set's
    // raw schedule earlier in this generation cycle (cold-open ordering — §GANTT_PREMATERIALIZE
    // runs before injectGantt), reuse it instead of recomputing computeSchedule a second time.
    // Coverage-checked exactly like §CPM_DISPLAY_ONE_TRUTH's own reuse test (>=99.9% guid hit rate)
    // so a different building's stale cache can never be mistaken for a match. Falls through to a
    // real computeSchedule call, byte-identical to pre-S4 behavior, on any miss.
    var _sched = null, _rawHits = 0, _rawMisses = 0;
    if (TMS._rawScheduleRemember && TMS._rawScheduleRemember.n > 0) {
      for (var _rgi = 0; _rgi < _geoElements.length; _rgi++) {
        if (TMS._rawScheduleRemember.map[_geoElements[_rgi].guid]) _rawHits++; else _rawMisses++;
      }
      if (_rawHits > 0 && _rawHits >= 0.999 * (_rawHits + _rawMisses)) {
        _sched = TMS._rawScheduleRemember.map;
        // §S4_RAW_EPOCH (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §DAY_COUNTER_EPOCH): materializeZones anchors its raw schedule at
        // time 0; computeSchedule here anchors at baseMs. Reused verbatim, every element NOT re-dated by a task window kept a 1970
        // timestamp — measured on the road+bridge film: 5,674 uncovered road pieces at 1969-12-31 next to 4,739 task-dated bridge pieces
        // → the day counter read 20,791 days. Rigid shift onto baseMs when the map is epoch-relative: order and durations untouched.
        var _rMin = Infinity;
        for (var _rk in _sched) if (_sched[_rk] && _sched[_rk].start < _rMin) _rMin = _sched[_rk].start;
        if (isFinite(_rMin) && _rMin < 1e12 && baseMs > 1e12) {
          var _rShift = baseMs - _rMin, _rSh = {};
          for (var _rk2 in _sched) { var _rv = _sched[_rk2]; if (!_rv) continue; var _rc = {}; for (var _rf in _rv) _rc[_rf] = _rv[_rf]; _rc.start = _rv.start + _rShift; _rc.end = _rv.end + _rShift; _rSh[_rk2] = _rc; }
          _sched = _rSh;
          console.log('§S4_RAW_EPOCH shifted reused raw schedule onto baseMs by ' + (_rShift / 86400000).toFixed(1) + ' days (it was epoch-relative)');
        }
        console.log('§S4_RAW_SCHEDULE_REUSE hits=' + _rawHits + ' misses=' + _rawMisses +
          ' — skipped a second computeSchedule call (materializeZones already computed this raw schedule)');
      }
      TMS._rawScheduleRemember = null;   // one-shot, same discipline as _displayTimeline._last
    }
    if (!_sched) {
      _sched = (typeof ScheduleGate !== 'undefined' && ScheduleGate.computeSchedule)
        ? ScheduleGate.computeSchedule(_geoElements, baseMs, scaleFactor, _maxCrews, _shiftHours) : null;
    }
    if (!_sched) { console.warn('§SUPPORT_CHECK ScheduleGate.js not loaded — generated 4D aborted'); return false; }
    _s4Mark('computeSchedule');
    // §TIER_SERIAL (2026-08-11): the DISPLAYED timeline is the two-tier remap of computeSchedule's
    // output — backbone phases strictly serial, everything else one support-gated concurrent pool
    // (full doctrine on _twoTierRemap above). _sched itself stays RAW: §SUPPORT_CHECK/§ROOF_GATE
    // below keep auditing the generative layer's proven truth (floating baselines byte-identical);
    // the kernel_ops written from _disp are what the movie/Gantt/X-ray judge consume.
    var _twItems = _geoElements.map(function (el) {
      var _ts = _sched[el.guid];
      return { guid: el.guid, s: _ts ? _ts.start : baseMs, e: _ts ? _ts.end : baseMs + 60000,
        bz: el.base_z, tz: el.top_z, x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1,
        cls: el.cls, seq: el.seq, phase: el.phase,
        storey: el.storey, lvlSec: el.lvlSec, civil: el.civil, disc: el.disc,   // §TIER_SERIAL_BY_ZONE: the §ZONE_INDEX band, already median-Z repaired · §CHAINAGE_LEVELS
        resource: el.resource };   // §S6_CREW_PASS: the solve's in-pass crew pools key on this
    });
    var _twStats = TMS._displayTimeline(_twItems).stats;   // §CPM_DISPLAY (or legacy §TIER_SERIAL+§MIDAIR_REPAIR via ?cpm4d=0)
    _s4Mark('displayTimeline');
    var _disp = {};
    _twItems.forEach(function (it) { _disp[it.guid] = { start: it.s, end: it.e }; });
    var _schedEnd = baseMs;
    for (var _sg in _disp) if (_disp[_sg].end > _schedEnd) _schedEnd = _disp[_sg].end;
    if (_noGeoN) console.log('§4D_NOGEO parked=' + _noGeoN + ' at project end (no transform/zero bbox — cannot bear, hang, or be witnessed)');

    // §S51 item d — cell identity for the Gantt: stamped into each op so buildGanttTasks groups
    // bars by CELL on cell-path buildings (GRAPH-path authoring set _lastCell = null above, so
    // those buildings' ops carry no stamp and group exactly as before). Coverage-checked the same
    // way as _displayTimeline._last: a different building's guids miss and the stamp is skipped.
    var _cellMap = null;
    if (TMS._displayTimeline._lastCell && TMS._displayTimeline._lastCell.map) {
      var _chit = 0, _cmiss = 0, _cmap0 = TMS._displayTimeline._lastCell.map;
      _twItems.forEach(function (it) { if (_cmap0[it.guid]) _chit++; else _cmiss++; });
      if (_chit > 0 && _chit >= 0.999 * (_chit + _cmiss)) _cellMap = _cmap0;
      console.log('§S51_CELL_STAMP coverage=' + _chit + '/' + (_chit + _cmiss) +
        ' stamping=' + (_cellMap ? 'YES — bars group by cell' : 'NO — coverage below 99.9%, bars stay storey|phase this generation'));
    }
    // §TM_ELEMENT_WINDOW_BIND (2026-08-25, bim-compiler prompts/4D_GANTT_TM_REFACTOR.md "Two clocks"
    // recurring bug class) — `_disp[el.guid]` comes from CpmSchedule.run(), a pure relative CPM
    // solver with NO epoch concept anywhere in cpm_schedule.js. `_cap.win[taskId]` is the one thing
    // in this whole function already proven real (Date.parse() on the REAL tasks.schedule_start/
    // finish, verified on 5 buildings, WITNESS_INTERFACE_FRAMEWORK.md §3/§6/§9).
    //
    // §TM_ELEMENT_WINDOW_RESCALE (2026-08-25, same day, real regression found live and fixed within
    // the hour): the FIRST cut of this fix (a hard per-element Math.min/max clamp) fixed the epoch
    // but broke the DISTRIBUTION — every element's raw time was near-1970, so ALL 6880 clamped to the
    // exact same boundary instant, producing a NEW pile-up (§GANTT_OPS_FIRST20 showed 18 identical
    // "Level 1|seq=5|IfcBuildingElementProxy" entries in a row; §CROSSTASK_JUDGE_PARITY floating
    // jumped 14->89, all windowBlocked=89, because nothing had room to move). The witness that
    // shipped with the hard clamp (witness_tm_element_window_bind.js) only asserted "inside the
    // window" — true the whole time — and never checked spread, so it stayed green through the
    // regression. Real lesson, not just a code fix: a bounds check is not a distribution check.
    //
    // The fix: a per-task PROPORTIONAL RESCALE, not a per-element clamp. Group every element by its
    // real task, find that group's own RAW min/max (whatever CpmSchedule.run actually computed —
    // real order, wrong epoch), then affine-map that raw range onto the task's REAL window. Relative
    // order and spacing survive; only the epoch and scale change. Elements with no resolvable real
    // task keep prior behavior unchanged — nothing invented.
    var _winGroups = {};
    if (_cap) {
      elements.forEach(function(el) {
        var s = _disp[el.guid] || { start: _schedEnd, end: _schedEnd + 60000 };
        var taskId = _cap.guidTask[el.guid];
        if (taskId == null || !_cap.win[taskId]) return;
        var g = _winGroups[taskId] || (_winGroups[taskId] = { min: Infinity, max: -Infinity });
        if (s.start < g.min) g.min = s.start;
        if (s.end > g.max) g.max = s.end;
      });
    }
    // §TM_REVEAL_TILED — same DB flag §CAP_RESCALE_SKIP / §OG_SWEEP_SKIP key on (display_authored=1:
    // the windows are our own authored ones), read HERE because the tiling decides WHERE inside its
    // bar each element is written, i.e. before the write loop, not in the overlay pass after it.
    var _playDisplayAuthored = false;
    try {
      var _pdaR = db.exec('SELECT 1 FROM schedules WHERE display_authored=1 LIMIT 1');
      _playDisplayAuthored = !!(_pdaR.length && _pdaR[0].values.length);
    } catch (ePda) { /* legacy DB without the column — affine rescale stays */ }
    var _tiledPlay = TMS._tmTilePlayWithinTasks(_disp, _cap, _playDisplayAuthored);
    function _tmRescaleToTaskWindow(guid, s) {
      // §TM_REVEAL_TILED — the tiled interval wins when one exists (see _tmTilePlayWithinTasks).
      // Everything below is the affine fallback, byte-identical for every element and every
      // schedule the tiling does not cover (imported/captured/baselined windows, unmapped guids).
      if (_tiledPlay && _tiledPlay[guid]) {
        var _tp = _tiledPlay[guid];
        return { start: _tp.start, end: _tp.end, clamped: true, tiled: true };
      }
      if (!_cap) return s;
      var taskId = _cap.guidTask[guid];
      var win = (taskId != null) ? _cap.win[taskId] : null;
      if (!win) return s;
      var g = _winGroups[taskId];
      if (!g || !isFinite(g.min) || !isFinite(g.max)) return s;
      var rawSpan = Math.max(1, g.max - g.min);
      var realSpan = Math.max(1, win.e - win.s);
      var scale = realSpan / rawSpan;
      var st = win.s + (s.start - g.min) * scale;
      var en = win.s + (s.end - g.min) * scale;
      // Final safety clamp — the affine map lands inside [win.s, win.e] by construction except for
      // float rounding at the extremes; same degenerate-window guard as before if start/end collapse.
      st = Math.min(Math.max(st, win.s), win.e);
      en = Math.min(Math.max(en, win.s), win.e);
      if (en <= st) { st = Math.max(win.s, win.e - 60000); en = win.e; }
      if (st === s.start && en === s.end) return s;
      return { start: st, end: en, clamped: true };
    }
    // §S280h: ONE transaction + prepared statement (batched INSERTs — avoids the multi-second freeze).
    db.run('BEGIN');
    var _gStmt = db.prepare('INSERT INTO kernel_ops (timestamp,op_type,parameters,input_guids,output_guid,undone) VALUES(?,?,?,?,?,0)');
    var _projEnd = baseMs;
    var _windowClamped = 0, _windowUncovered = 0, _windowTiled = 0;   // §TM_REVEAL_TILED: tiled ⊂ clamped
    elements.forEach(function(el) {
      var s = _disp[el.guid] || { start: _schedEnd, end: _schedEnd + 60000 };   // §4D_NOGEO park at the DISPLAY end (§TIER_SERIAL), was baseMs (day 0)
      var bound = _tmRescaleToTaskWindow(el.guid, s);
      if (bound.clamped) _windowClamped++; else if (!_cap || _cap.guidTask[el.guid] == null) _windowUncovered++;
      if (bound.tiled) _windowTiled++;   // §TM_REVEAL_TILED
      s = bound;
      _gStmt.run([s.start, 'ELEMENT_PLACE',
         JSON.stringify({phase:el.phase, cls:el.cls, name:el.name, storey:el.storey,
           resource:el.resource, _end_ts:s.end, _genVersion:TMS._GANTT_CACHE_VERSION,
           _cell: _cellMap ? _cellMap[el.guid] : undefined}),
         JSON.stringify([el.guid]), el.guid]);
      count++;
      if (s.end > _projEnd) _projEnd = s.end;
    });
    _gStmt.free();
    console.log('§TM_ELEMENT_WINDOW_BIND total=' + elements.length + ' clamped=' + _windowClamped +
      ' tiled=' + _windowTiled + ' uncovered=' + _windowUncovered +
      ' (tiled = §TM_REVEAL_TILED laid it out inside its bar; clamped-not-tiled = affine fallback; uncovered = no resolvable real task window, prior behavior kept)');
    _s4Mark('insertLoop');
    db.run('COMMIT');
    resourceCursor['_end'] = _projEnd;   // feed the endDate computation below (Math.max over values)

    // §SUPPORT_CHECK: independent XY-aware audit — NOTHING may start before its physical support
    // (bearing-below OR the carrier it hangs from) finishes. 0 ⇒ nothing floats. Pre-fix (Hospital):
    // 84 beams + 765 members floated (Z-only) and 133 furniture + 1980 flow + 1156 walls (ε=0.5
    // skipped the slab they sit on). Two-pass + ε=0.05 → 0.
    // §DEQ_V1 (2026-08-07, 4D_SCHEDULE_PERFECTION.md §DEQ_V1_IMPL #5): filter is ALL classes now —
    // the old hand-picked list (Beam/Member/Slab/'Furni'/'Wall') silently excluded every MEP/flow
    // class, so this line printed floating=0 while fans hung mid-air unaudited.
    var _auditN = _geoElements.length;
    // §SUPPORT_UNCHECKED collector — 4D_SCHEDULE_PERFECTION.md §SPEC 2026-08-11 1a (warn-only):
    // big elements (bbox vol > ScheduleGate.BIG_ELEMENT_VOL, measured p95) that the audit found
    // ZERO support candidates for — previously silent false-pass. Floating count/gating unchanged.
    var _unchecked = [];
    var _float = ScheduleGate.auditFloating(_geoElements, _sched, null, null, _unchecked);
    _s4Mark('supportCheck');
    console.log('§SUPPORT_CHECK floating=' + _float + '/' + _auditN + ' (ALL classes, bearing-below + hang-carrier) gated=' + elements.length + ' (0=solved)');
    console.log('§SUPPORT_UNCHECKED_SUMMARY n=' + _unchecked.length + '/' + _auditN +
      ' bigVol>' + (ScheduleGate.BIG_ELEMENT_VOL || 1.556) + 'm³ zero-candidate' +
      ' buildingModelsSubstructure=' + (_unchecked.length ? _unchecked[0].buildingModelsSubstructure
        : _geoElements.some(function (e) { return e.seq === 1; })) +
      ' (warn-only — reported not gated, see §SPEC 2026-08-11 1a)');

    // §4D_WALLS_BEFORE_ROOF M6 (2026-08-01, prompts/GANTT_ACCURACY.md §4D_WALLS_BEFORE_ROOF) — stop
    // the instrument from lying. §SUPPORT_CHECK above offers its wall pool ONLY to slabs the load-
    // path rule already promoted (seq>4), so a roof it FAILED to promote reads floating=0 exactly as
    // if nothing were wrong — that is #1120's `⚠ LIMIT 1`, and it is why "roof before walls" survived
    // a merge that reported floating=0/10979 on the very run the user was complaining about (24 of
    // 35 Hospital slabs started ~290 days before the walls carrying them, and the only instrument
    // said solved). This line is ROLE-BLIND: it counts, for EVERY IfcSlab regardless of seq, whether
    // it starts before the XY-overlapping walls that carry it finish.
    //   roofSlabs half  = a GATE. Must be 0. A roof-role slab that starts before its carriers is the
    //                     defect this section exists to kill.
    //   otherSlabs half = a MEASUREMENT, NOT a gate. An ordinary intermediate floor legitimately
    //                     precedes the partitions beneath it in a frame-first concrete schedule —
    //                     gating on it is #1120's measured-and-rejected "attempt 2" (24 false
    //                     positives). Printing it is what makes LIMIT 1 auditable instead of hidden.
    try {
      // §I.5b (bim-compiler prompts/4D_MODEL_INTEGRITY.md, §FUTURE item 7 Stage 5, queue item B-2)
      // — EPS/GAP now read from the module they belong to, in the SAME defensive `||` shape CELL and
      // BIG_ELEMENT_VOL already use two lines apart. schedule_gate.js:1298-1300 exports them with an
      // explicit reason ("a second copy is a second thing to drift"); this statement obeyed it for
      // CELL and hand-typed the other two. Nothing changes today — all three literals equal their
      // source — but a one-line change to GAP now moves this site with the rest of them.
      var _rgCELL = (ScheduleGate.CELL || 4), _rgEPS = (ScheduleGate.EPS || 0.05), _rgGAP = (ScheduleGate.GAP || 0.5);
      // §SPEC 2026-08-11 1b (4D_SCHEDULE_PERFECTION.md, Witness: witness_big_element_support_
      // coverage.js): widen the audited pool beyond IfcSlab — EVERY element above the measured p95
      // bbox volume (ScheduleGate.BIG_ELEMENT_VOL = 1.556 m³, extracted 2026-08-11) is also audited
      // against the walls carrying it, independent of class or promotion status — the load-path
      // classifier's known depth-1 false negatives become visible here instead of reading clean.
      // REPORTED, NOT GATED (own counter pair; existing roofSlabs gate + otherSlabs measurement
      // byte-identical). 1c: Substructure (seq===1) exempt — rests on unmodeled soil.
      var _rgBIGVOL = (ScheduleGate.BIG_ELEMENT_VOL || 1.556);
      var _rgGrid = {}, _rgSlabs = [], _rgBig = [];
      for (var _rgi = 0; _rgi < elements.length; _rgi++) {
        var _e = elements[_rgi];
        if (_e.cls !== 'IfcSlab' && _e.seq !== 1 &&
            (_e.x1 - _e.x0) * (_e.y1 - _e.y0) * (_e.top_z - _e.base_z) > _rgBIGVOL) _rgBig.push(_e);
        if (_e.cls === 'IfcSlab') { _rgSlabs.push(_e); continue; }
        if (_e.cls.indexOf('IfcWall') !== 0) continue;
        for (var _gx = Math.floor(_e.x0 / _rgCELL); _gx <= Math.floor(_e.x1 / _rgCELL); _gx++)
          for (var _gy = Math.floor(_e.y0 / _rgCELL); _gy <= Math.floor(_e.y1 / _rgCELL); _gy++)
            (_rgGrid[_gx + ',' + _gy] = _rgGrid[_gx + ',' + _gy] || []).push(_e);
      }
      var _rgRoofN = 0, _rgRoofLate = 0, _rgOtherN = 0, _rgOtherLate = 0, _rgBigN = 0, _rgBigLate = 0;
      // shared wall-carrier scan — slabs and 1b's big elements are tested against the SAME physics
      var _rgLateVsWalls = function(S) {
        var sc = _sched[S.guid]; if (!sc) return null;
        var maxEnd = 0, seen = {};
        for (var gx = Math.floor(S.x0 / _rgCELL); gx <= Math.floor(S.x1 / _rgCELL); gx++)
          for (var gy = Math.floor(S.y0 / _rgCELL); gy <= Math.floor(S.y1 / _rgCELL); gy++) {
            var arr = _rgGrid[gx + ',' + gy]; if (!arr) continue;
            for (var wi = 0; wi < arr.length; wi++) {
              var W = arr[wi]; if (seen[W.guid]) continue; seen[W.guid] = 1;
              if (W.base_z < S.base_z - _rgEPS && W.top_z >= S.base_z - _rgGAP &&
                  S.x0 <= W.x1 && S.x1 >= W.x0 && S.y0 <= W.y1 && S.y1 >= W.y0) {
                var we = _sched[W.guid]; if (we && we.end > maxEnd) maxEnd = we.end;
              }
            }
          }
        return (maxEnd > 0 && sc.start < maxEnd - 1);
      };
      _rgSlabs.forEach(function(S) {
        var late = _rgLateVsWalls(S); if (late === null) return;
        if (S.seq > 4) { _rgRoofN++; if (late) _rgRoofLate++; }
        else { _rgOtherN++; if (late) _rgOtherLate++; }
      });
      _rgBig.forEach(function(S) {
        var late = _rgLateVsWalls(S); if (late === null) return;
        _rgBigN++; if (late) _rgBigLate++;
      });
      console.log('§ROOF_GATE roofSlabs=' + _rgRoofN + ' lateVsWallCarriers=' + _rgRoofLate +
        ' (0=required) | otherSlabs=' + _rgOtherN + ' lateVsWallCarriers=' + _rgOtherLate +
        ' (frame-first, expected — reported not gated, see GANTT_ACCURACY.md LIMIT 1)' +
        ' | bigElems=' + _rgBigN + ' lateVsWallCarriers=' + _rgBigLate +
        ' (>' + _rgBIGVOL + 'm³ p95, non-slab non-Substructure — reported not gated, §SPEC 2026-08-11 1b)');
    } catch (e) { console.log('§ROOF_GATE error: ' + e.message); }
    // §4D_ROOF_LOAD_PATH witness hook (2026-08-01) — same double-underscore debug convention as
    // __tmTrav/__forceFull/__tmStep above: read-only, lets witness_4d_roof_load_path.js compare the
    // OLD (seq<=4-only) and NEW (M3) audit definitions against the SAME elements+schedule.
    window.__tmScheduleDebug = { elements: elements, sched: _sched, disp: _disp, tier: _twStats, audit: null };  // §DEQ_V1: audit unfiltered; §TIER_SERIAL: disp = displayed two-tier map, sched stays RAW generative

    // §S260c BUG5: Log first 20 ops to verify bottom-up storey ordering
    // §GANTT_OPS_TIEBREAK (2026-08-04) — display-only fix, real timestamps unchanged. Many elements
    // genuinely tie at the same millisecond (each trade's crew queue starts independently at t=0 —
    // by design, real parallel trades, MEASURED: footings/proxies/walls/columns all start at exactly
    // 0ms on Hospital). ORDER BY timestamp alone leaves ties in arbitrary DB order, which read as
    // "wrong sequence" even though nothing about the real schedule/movie/support-check is wrong.
    // Fetch a wider window, stable-sort by (timestamp, seq) in JS, THEN take 20 — so ties display
    // Substructure-first without touching a single real computed date anywhere else in the app.
    var _first20 = [];
    try {
      var f20r = db.exec('SELECT timestamp, parameters FROM kernel_ops WHERE undone=0 ORDER BY timestamp LIMIT 500');
      if (f20r.length) {
        var _f20rows = f20r[0].values.map(function (row) {
          var p = JSON.parse(row[1]);
          return { ts: row[0], p: p, seq: matchRule(p.cls, p.name).sequence };
        });
        _f20rows.sort(function (a, b) { return (a.ts - b.ts) || (a.seq - b.seq); });
        _f20rows.slice(0, 20).forEach(function (r) {
          _first20.push(r.p.storey + '|band=' + storeyBand[r.p.storey || '_UNKNOWN'] + '|seq=' + r.seq + '|' + r.p.cls);
        });
      }
    } catch(e) {}
    console.log('§GANTT_OPS_FIRST20: ' + _first20.join(', '));

    var endDate = new Date(Math.max.apply(null, Object.values(resourceCursor)));
    var sceneGuids = 0;
    if (app.scene) {
      var seen = {};
      app.scene.traverse(function(obj) {
        if (obj.userData && obj.userData.guid && !seen[obj.userData.guid]) {
          seen[obj.userData.guid] = true; sceneGuids++;
        }
      });
    }
    _s4Mark('generativeBranchEnd');
    console.log('§S4_ACTIVATION_TIMING ' + _s4Marks.join(' '));
    console.log('§GANTT injected=' + count + ' dbElements=' + totalDbElements +
      ' sceneMeshGUIDs=' + sceneGuids +
      ', bands=' + storeyNames.length + ', serialClockDays=' + projectDays + ', scale=' + scaleFactor.toFixed(2) +
      ', anchor=' + new Date(baseMs).toLocaleDateString() + ' end=' + endDate.toLocaleDateString() +
      ' (anchor=real ops epoch; serialClockDays sizes the degenerate-project floor, not the axis)');

    // ── T3 §3.1/§3.3: overlay captured task names + the captured project window onto covered
    // elements. The generative pass above already laid every element on the real-start epoch
    // (baseMs) carrying the §TIER_SERIAL two-tier display timeline.
    //
    // §TIER_SERIAL Option A (2026-08-11, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §SPEC
    // 2026-08-11 evening — replaces §PLAYBACK-STAGGER/§STAGGER_SUPPORT_ORDER/§4D_LAYER_TRUTH's
    // independent per-task-bucket affine + §STAGGER_HOST + the in-branch guard invocation):
    // each task bucket used to be rescaled into its own §PHASE_OVERLAP_BAND window INDEPENDENTLY,
    // which un-did computeSchedule's cross-bucket support order (measured pre-guard: Terminal 447 /
    // Hospital 1,929 violations — the reason §PHASE_OVERLAP_SUPPORT_GUARD was born as a repair
    // pass). Now the covered set maps through ONE global monotone affine into the captured project
    // window [_cap.base, _cap.projEnd]: order — and therefore support order — is preserved BY
    // CONSTRUCTION, no per-bucket window can reorder across bucket boundaries anymore. Deliberate,
    // user-decided Option A cost: an individual task's dragged window no longer independently
    // rescales its own elements — task NAMES still overlay (mini-Gantt), and the overall captured
    // window anchors/scales the whole timeline. §STAGGER_HOST was already inert here (since
    // §4D_LAYER_TRUTH's ls-affine, element times derive from ls alone — its index reshuffle
    // changed nothing) — removed with the per-bucket map, not silently lost.
    TMS._capActive = false; TMS._coveredCount = 0; TMS._coveragePct = 0;
    if (_cap) {
      var _covered = 0;
      var _elByGuid = {};
      elements.forEach(function(el) { _elByGuid[el.guid] = el; });
      var _allScheduled = [];
      var _allOps = db.exec("SELECT output_guid, parameters, timestamp FROM kernel_ops WHERE op_type='ELEMENT_PLACE'");
      if (_allOps.length && _allOps[0].values.length) {
        _allOps[0].values.forEach(function(row) {
          var g = row[0], tid = _cap.guidTask[g];
          if (!tid) return;                         // uncovered → keeps the two-tier generated timing
          var w = _cap.win[tid];
          if (!w) return;                           // link points at summary/undated task
          var _el = _elByGuid[g];
          var p; try { p = JSON.parse(row[1]) || {}; } catch (e) { p = {}; }
          var _ls = row[2] || 0;
          var _le = p._end_ts || (_ls + 60000);
          // §GANTT_PHASE_CLOBBER (2026-08-12, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md —
          // Witness: W-PHASE-KEY / witness_gantt_phase_palette.js). This line used to be
          // `p.phase = w.name`, i.e. it wrote the TASK NAME into the field the whole drawer keys
          // on. Harmless while task names looked like phases; destructive since zone-level
          // authoring became the default, because materializeZones names its tasks
          // "<Phase> — <Storey>". Measured on the user's Hospital session, every op's phase became
          // "Architecture — Level 1" and three separate things broke at once:
          //   1. PHASE_COLORS[task.phase] || '#888'  -> all 35 bars grey (also PHASE_INK/PHASE_SHORT)
          //   2. _phaseRank() = _ROW_PHASE_ORDER.indexOf(phase) -> -1 for every row, so the sort
          //      falls through to alphabetical: §GANTT_ROW_ORDER printed Architecture … Substructure
          //      5th — §GANTT_ROW_ORDER (K1)'s ORIGINAL reported bug, back verbatim and silent.
          //   3. tm-dash-phases buckets by the same field and filters through PHASE_ORDER -> zero
          //      matches, no §DASH_PHASE line in the entire session, phase progress renders empty.
          // The name was never made visible by this line anyway: buildGanttTasks reads it from the
          // task index into `taskName` (~:5694) and the bar detail header renders
          // `bar.taskName || (bar.phase + ' — ' + bar.storey)` (~:6716). So keep the name, in its
          // own field, and leave the phase alone — the drawer needs BOTH, not one overwriting the other.
          p.taskName = w.name;                      // real task name → mini-Gantt detail header
          _allScheduled.push({ guid: g, s: _ls, e: _le, params: p, task: tid,
            bz: _el ? _el.base_z : 0, tz: _el ? _el.top_z : 0,
            x0: _el ? _el.x0 : 0, x1: _el ? _el.x1 : 0,
            y0: _el ? _el.y0 : 0, y1: _el ? _el.y1 : 0,
            cls: _el ? _el.cls : '', seq: _el ? _el.seq : 999 });
          _covered++;
        });
      }
      // §GANTT_TASK_WINDOW_FIDELITY (2026-08-15, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
      // §HOSPITAL_LIGHTING_STILL_FLOATING — user directive: "if it is not in that single source of
      // truth [the Gantt/task JSON], it does not happen, yet"). This REPLACES Option A's ONE GLOBAL
      // affine (2026-08-11, see the header above — kept verbatim for the history, now superseded).
      // Option A's own global rescale never actually used `w.s`/`w.e` (each task's OWN authored
      // schedule_start/schedule_finish) for placement at all — it only read them for the overall
      // min/max span and the task-name overlay. Every element was positioned by where its OLD
      // generative timestamp fell in a GLOBAL min→max compression, with no mechanical tie to its
      // own task's window — an element authored for "Superstructure — Level 3" could land anywhere
      // in the whole captured span. Measured live: this is exactly why the movie read as untied from
      // the Gantt chart. Fixed at the source: each element is now rescaled WITHIN its own task's
      // window only, preserving its pre-existing relative order among that task's own covered
      // elements (monotone per-task, same floor() reasoning Option A used globally).
      // Known, accepted cost — same one Option A was built to avoid, now scoped correctly instead of
      // hidden: a structural dependency that crosses two tasks with overlapping/conflicting authored
      // windows can still show a real violation. That is now an honest signal pointing at the task
      // AUTHORING (materializeZones' own CPM windows), not a display-layer artifact to paper over.
      // _ogSupportSweep (unchanged, runs next) still catches and reports what it can within its own
      // narrower carrier pool — its pushes now stay local to each task's own already-correct window
      // instead of a whole-timeline compression, so they can no longer manufacture the kind of
      // cross-window desync #1364's reverted bolt-on did.
      // §GANTT_GAP_CLAMP_SPREAD (2026-08-15, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md
      // §GANTT_WINDOW_FIDELITY_AND_SPREAD — user: "Are they correlating exactly to TM Gantt chart
      // timeline? and spread evenly within each bar?" → "It is a simple spread it evenly" → "U have
      // a denominator for a 4D time factor - divide by it! or shrink to it which is other way round").
      // The VALUE-preserving rescale below this comment used to divide EVERY gap by each task's own
      // real TIME SPAN (lsSpan) — so a genuine CPM gap in the raw schedule (elements waiting on a
      // cross-discipline dependency, e.g. curtain-wall framing waiting on MEP rough-in at the same
      // storey, §4D_BAND_MONOTONIC's `phaseTrade`) survived as a proportionally-compressed but still-
      // empty display gap. Measured: Hospital's TASK_Architecture_Level_4 showed a hard bimodal split
      // (1571 elements day 0-12, a real 120-day silent gap, 2779 elements day 133-135), aggregate
      // Hospital KS-vs-uniform=0.14. Rejected two other levers first (splitting into authored
      // sub-bars, loosening `phaseTrade`) as touching settled dependency-gating design.
      // Three earlier attempts tried and REJECTED with measured numbers — do not re-derive:
      // 1. Pure rank/count spread (every gap = tSpan/N by index). Fixed Q2 perfectly (KS
      //    0.14->0.0117) but broke Q1 hard (Hospital 99.97%->97.80%, 14.9d max overshoot) — a
      //    tiny per-element step compressed real, necessary minimum lead times between directly
      //    dependent elements, exactly the intra-task-precedence risk this fix was flagged to check.
      // 2. Clamp each gap to tSpan/N, then MULTIPLICATIVELY restretch the compressed timeline to
      //    refill the window. Converged to nearly the SAME Q1 regression as #1 (97.78-97.93%
      //    across every clamp threshold tried) — one common per-task stretch factor scales every
      //    gap, including safe tiny real ones, so it reintroduces the same compression risk by a
      //    different mechanism.
      // 3. Clamp+ADDITIVE pad (grow gaps by a constant instead of a multiplier — normal gaps only
      //    ever get LARGER, never compressed) fixed the mechanism, but an early version measured
      //    a padding bug: target was computed against `tSpan` (the whole window, including the
      //    structural gap between the last element's real START and the window's own end that
      //    exists even with ZERO clamping) instead of what the ORIGINAL unclamped formula actually
      //    produces — so pad barely moved across clamp thresholds 3..50, dominated by that
      //    structural gap, not by anything clamping had removed.
      // SHIPPED: additive redistribution, target computed as the exact sum the original per-gap
      // value-based formula would produce (so zero clamping ⇒ byte-identical to the pre-existing
      // rescale), clamp threshold = this TASK's OWN median real gap × 500 (a self-referential,
      // per-task statistic — not one shared magic constant across every task/building). Measured,
      // all 7 buildings, this exact configuration: Hospital/Duplex/HHS/Clinic/JKR — Q1 window
      // fidelity byte-identical to the pre-existing #1368/#1376 baseline (same violation count on
      // 4/5; JKR Q2 also improved) while Q2 (spread) measurably improves; Hospital's reported
      // TASK_Architecture_Level_4 case specifically goes from a hard 120-day dead gap to a
      // near-perfectly uniform histogram. Two real, bounded, NOT-hidden costs: LTU_AHouse Q1
      // fidelity 99.98%->99.94% (20->71 violations, still a small fraction of 122,330 elements) in
      // exchange for a large Q2 gain (KS 0.1107->0.0261); Terminal's violation COUNT is unchanged
      // (still exactly 436/48,428, zero new Q1 cost) but its in-window spread SHAPE got WORSE
      // (KS 0.0946->0.2823) — Terminal has several tasks whose real gap distribution is itself
      // multi-modal at genuinely different scales (not one dominant outlier + a dense remainder,
      // like Hospital's reported case), so a single task-wide median-based threshold isn't the
      // right lever there; named for a future session, not chased further this pass — Terminal was
      // already imperfectly spread pre-fix (KS 0.0946), this is a real but same-axis regression,
      // not a new correctness class.
      // §ZONE_DISPLAY_AUTHORING (2026-08-16): extracted into the named _capWindowRescale so
      // witnesses/probes can slice the SHIPPED rescale instead of maintaining copies — body verbatim.
      // §CAP_RESCALE_SKIP (2026-08-16, bim-compiler prompts/4D_SCHEDULE_ARCHITECTURE_REDESIGN.md
      // §ZONE_WINDOW_DAGWINS_CLIP follow-through): a display-authored schedule's windows are VIEWS
      // of these very element times — there is nothing to reconcile, and every reconciliation
      // attempt measurably damaged the contact order (gap-clamp: 4,712 manufactured violations;
      // even a rigid per-task shift: 537). Same DB flag §OG_SWEEP_SKIP already keys on, computed
      // once here for both. Bar EDITS are not lost: the Gantt edit machinery mutates element times
      // directly (witness_gantt_edit_lock / witness_gantt_group_move) — this load-path rescale was
      // only ever for imported/captured windows, which keep it below.
      var _capDisplayAuthored = false;
      try {
        var _daR0 = db.exec('SELECT 1 FROM schedules WHERE display_authored=1 LIMIT 1');
        _capDisplayAuthored = !!(_daR0.length && _daR0[0].values.length);
      } catch (e0) { /* legacy DB without the column — rescale stays */ }
      if (_capDisplayAuthored) {
        console.log('§CAP_RESCALE_SKIP display-authored windows are views of these element times — nothing to reconcile');
      } else {
        _capWindowRescale(_allScheduled, _cap.win);
      }
      // §S58: rescale physics in viewer/support_sweep.js; this wrapper owns the § line.
      function _capWindowRescale(_allScheduled, _win) {
        var r = SupportSweep.capWindowRescale(_allScheduled, _win);
        console.log('§CAP_RESCALE_IDENTITY tasks=' + r.skipped + '/' + (r.skipped + r.rescaled) + ' replayed verbatim (window==head of own span within day rounding); reSpaced=' + r.rescaled);
        return r;
      }
      // §ZONE_DISPLAY_AUTHORING (2026-08-16): when the task windows were authored FROM the display
      // timeline (schedules.display_authored=1, written by materializeZones' displayRemap path),
      // the strict end-bar sweep is SKIPPED. _ogSupportSweep enforces "start after the carrier
      // FINISHES" — a bar §MIDAIR_REPAIR's own header deliberately does NOT enforce on the display
      // timeline (a frontier-glowing half-built support reads as resting, not hanging) — and it
      // only existed here because windows and movie described two different schedules. Measured on
      // the browser-faithful probe (§EXP7 vs §EXP8, Hospital): keeping the sweep = 1781 elements
      // pushed OUT of their own bars (97.2% fidelity); skipping it = 31 out (99.95%), floating
      // 79 -> 63. Imported/legacy/edited-window schedules (flag absent or 0) keep the sweep —
      // their windows are not the display envelope, so the old repair still earns its keep there.
      var _cjpDisplayAuthored = false;
      try {
        var _daR = db.exec('SELECT 1 FROM schedules WHERE display_authored=1 LIMIT 1');
        _cjpDisplayAuthored = !!(_daR.length && _daR[0].values.length);
      } catch (e) { /* legacy DB without the column — sweep stays */ }
      if (_cjpDisplayAuthored) {
        console.log('§OG_SWEEP_SKIP display-authored windows — strict end-bar repair not applied (weak-bar parity below is the acceptance bar)');
      } else {
        TMS._ogSupportSweep(_allScheduled, _cap.win);
      }
      TMS._cjpJudgeParity(_allScheduled, _cap.win);   // §CROSSTASK_JUDGE_PARITY — judge/repair parity, window-bounded
      _s4Mark('capBranchPreWrite');
      // §GANTT_REFOLD_HANG (fix/gantt-refold-hang, synced 2026-08-12 — CPE_4D_PERF_MEM_FINDINGS.md
      // §3-R2): the inline BEGIN→per-row UPDATE→COMMIT loop was the measured §WRITE_LOOP_TIMING
      // ms=2044.9 synchronous freeze on LTU (live log 2026-08-10). _writeScheduledChunked writes the
      // IDENTICAL rows in the IDENTICAL order (same fields, same log line), committing and yielding
      // a macrotask every _TM_CHUNK=2500 rows so the tab stays responsive. Witness:
      // viewer/tests/witness_gantt_refold_yield.js (identity gate: chunked rows == sync rows).
      await TMS._writeScheduledChunked(db, _allScheduled);
      _s4Mark('capBranchWrite');
      console.log('§S4_ACTIVATION_TIMING_CAP ' + _s4Marks.join(' '));
      TMS._capActive = true;
      TMS._coveredCount = _covered;
      TMS._coveragePct = totalDbElements ? Math.round(_covered / totalDbElements * 100) : 0;
      console.log('§GANTT_SOURCE captured tasks=' + _cap.taskCount + ' covered=' + _covered +
        ' generated=' + (totalDbElements - _covered) + ' total=' + totalDbElements + ' pct=' + TMS._coveragePct);
      console.log('§4D_COVERAGE captured=' + _covered + ' generated=' + (totalDbElements - _covered) +
        ' total=' + totalDbElements + ' pct=' + TMS._coveragePct +
        ' window=' + new Date(_cap.base).toISOString().slice(0,10) + '..' + new Date(_cap.projEnd).toISOString().slice(0,10));
    } else {
      console.log('§GANTT_SOURCE generated');       // W-TM-FALLBACK: no native 4D, pure generative
    }
    return count > 0;
  }

  // ── Mini Gantt chart ──
  var _ganttTasksComputed = false; // §S58: no longer gates the log lines; "has ever built" only
  var _ganttRebuildN = 0;
  var _ganttSpanFromTask = 0, _ganttSpanFromOps = 0;   // §GANTT_BAR_IS_ITS_TASK (§S65)          // §S58: rebuild ordinal — N rebuilds per gesture is readable

  // ── §GANTT_BAR_IDENTITY (K0 — prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT) ──
  // The drawer used to derive its bars purely by grouping raw kernel_ops on storey|phase, yielding
  // bar objects with NO task_id — which is precisely why no bar was ever draggable: moveTask(db,
  // taskId, …) had nothing to be handed. schedule_author.js materializeZones() already writes the
  // SAME phase×floor decomposition into the real model (tasks + task_elements + task_sequences).
  // Two code paths derived one decomposition independently and were never connected. This joins them.
  //
  // The join is by GUID through task_elements, deliberately NOT by matching storey/phase strings:
  // deriveZones() keys a zone on collapsePhase(e.storey) while the drawer reads the raw p.storey off
  // the op params, so those two names legitimately differ and string-matching would silently
  // mis-associate bars. GUID identity is exact.
  //
  // Bars whose ops carry no task (a generated schedule with nothing authored) keep their old
  // storey|phase identity and simply stay non-editable — honest, and reported as a coverage ratio by
  // §GANTT_BAR_IDENTITY rather than hidden.
  var _taskIndex = null;      // { guidTask:{guid→tid}, tasks:{tid→{id,name,start,finish}}, scheduleId }
  var _taskIndexFor = null;   // building key the index was built for (invalidation)

  function buildTaskIndex() {
    var app = TMS.A();
    var key = (app && app.activeBuilding) || '';
    // §GANTT_AUTHOR_REPROBE (found by the browser wiring test, 2026-08-04): only a POSITIVE result is
    // cached. Caching the negative meant that once the drawer had been opened on an un-authored
    // building, authoring a schedule afterwards never took effect — the bars stayed non-editable
    // until a building change, because nothing invalidated the "no schedule" answer. Re-probing costs
    // one activeSchedule() query per rebuild, and rebuilds only happen when _ganttDirty is set.
    if (_taskIndex !== null && _taskIndex.ok && _taskIndexFor === key) return _taskIndex;
    _taskIndexFor = key;
    _taskIndex = { ok: false, guidTask: {}, tasks: {}, scheduleId: null, n: 0 };
    if (!app || !app.db) return null;
    var db = app.db, sched = null, SA = null;
    try {
      SA = (typeof window !== 'undefined') && window.ScheduleAuthor;
      if (SA && SA.activeSchedule) sched = SA.activeSchedule(db, { currentGenVersion: TMS._GANTT_CACHE_VERSION });
    } catch (e) { sched = null; }
    if (!sched || !sched.id) {
      console.log('§GANTT_BAR_IDENTITY schedule=none bars stay non-editable (no authored schedule)');
      return null;
    }
    // §GANTT_SCHEDULE_STALE (4D_SCHEDULE_PERFECTION.md §GANTT_SHIFT_HOURS_DESYNC follow-up): the
    // authored Gantt had no equivalent of kernel_ops's _genVersion self-heal — once materialized it
    // was frozen forever regardless of how much the scheduling code changed since. Re-materialize in
    // place, same real UI opts shape as _materializeNativeSchedule/generateGanttSchedule, BEFORE the
    // task index is built from it. sched.safeToRegen already excludes captured (imported) schedules
    // and anything with a baseline set (the user's committed, edited product) — see activeSchedule's
    // own header for the exact contract.
    // §TM_BAKE_LOCK (§S69) — the guard is on the REGEN, not on buildTaskIndex itself. This block
    // rewrites the whole schedule in place, so firing it mid-bake would swap the timeline out from
    // under the recorder; but refusing the whole function would leave the Gantt with no task index
    // and break the very display the film is recording. Skipping only the regen keeps the film on
    // the exact schedule it started with, and genVersion stays stale so the self-heal simply runs on
    // the next rebuild after the bake finishes. Found by W-TBL-5's derivation, not by hand.
    if (sched.safeToRegen && SA.materializeZones && !TMS._tmEditLocked('buildTaskIndex:staleRegen')) {
      console.log('§GANTT_SCHEDULE_STALE_REGEN id=' + sched.id + ' genVersion=' + sched.genVersion +
        ' current=' + TMS._GANTT_CACHE_VERSION + ' — re-materializing in place');
      try {
        var _SR = window.SEQUENCE_RULES || {}, _LR = window.LABOR_RATES || {}, _RT = window.RATES || {};
        var _shGantt = (window.SHIFT_HOURS > 0) ? window.SHIFT_HOURS : 24;
        // §FUTURE-5A B2 (applied 2026-09-02, queue item B-3): sourced from 4D_template.json
        // calendar.project_start (same literal, '2026-01-01', as before this fix).
        var _tplStart = (TMS._4dTemplate && TMS._4dTemplate.calendar && TMS._4dTemplate.calendar.project_start) || '2026-01-01';
        var rres = SA.materializeZones(db, _SR, { start: _tplStart, laborRates: _LR, rates: _RT,
          scheduleGate: window.ScheduleGate, shiftHours: _shGantt, genVersion: TMS._GANTT_CACHE_VERSION,
          displayRemap: TMS._tmDisplayRemap, template: TMS._4dTemplate });   // §ZONE_DISPLAY_AUTHORING + §TPL_WIRED
        if ((!rres || !rres.ok) && SA.materializeDefault) {
          rres = SA.materializeDefault(db, _SR, { start: _tplStart, laborRates: _LR, blank: false,
            genVersion: TMS._GANTT_CACHE_VERSION });
        }
        console.log('§GANTT_SCHEDULE_STALE_REGEN_RESULT ok=' + !!(rres && rres.ok));
      } catch (e) { console.log('§GANTT_SCHEDULE_STALE_REGEN_FAIL ' + e.message); }
    }
    try {
      var tr = db.exec('SELECT task_id, name, schedule_start, schedule_finish FROM tasks ' +
        'WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)', [sched.id]);
      if (tr.length) tr[0].values.forEach(function (row) {
        _taskIndex.tasks[row[0]] = { id: row[0], name: row[1], start: row[2], finish: row[3] };
        _taskIndex.n++;
      });
      var er = db.exec('SELECT te.guid, te.task_id FROM task_elements te ' +
        'JOIN tasks t ON t.task_id = te.task_id WHERE t.schedule_id=?', [sched.id]);
      if (er.length) er[0].values.forEach(function (row) { _taskIndex.guidTask[row[0]] = row[1]; });
    } catch (e) {
      console.log('§GANTT_BAR_IDENTITY schedule=' + sched.id + ' error=' + e.message);
      return null;
    }
    _taskIndex.scheduleId = sched.id;
    _taskIndex.ok = _taskIndex.n > 0;
    return _taskIndex.ok ? _taskIndex : null;
  }

  // Invalidate the cached index + bar rollup (call after any write that re-dates or re-authors).
  function invalidateGanttModel() { _taskIndex = null; _taskIndexFor = null; TMS._ganttDirty = true; }

  // §GANTT_PALETTE (2026-08-04, prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT VIS) — user report:
  // "not clear enough which is which". Three real collisions in the previous palette, not taste:
  //  1. Substructure #7a8a8e and Superstructure #5b7fa5 were both desaturated blue-greys — the least
  //     distinguishable pair sat on the two ADJACENT structural phases.
  //  2. Architecture #c07a4a (orange-brown) competed with two RESERVED STATUS colours: #ff8c00 is the
  //     active-bar outline + cursor hairline, #ffeb3b is the captured-IFC-4D frame. A phase fill must
  //     never occupy a status hue.
  //  3. The palette encoded no trade family: the two MEP phases (#8bc34a green / #ab47bc purple)
  //     looked unrelated, while MEP Rough-in and Finishes (#26a69a teal) looked related.
  // Now: three trade families by HUE (structure blue / MEP green / architecture purple), dark→light
  // WITHIN each family following build order, and orange+yellow left free for status only.
  //
  // MEASURED, not eyeballed (CIE76 dE + WCAG, scratchpad/palette_tune.js — the FUNDAMENTAL LAW
  // applies to colour too: numbers, not "looks better"):
  //   min pairwise dE      20.8 → 34.7   (worst old pair was Substructure/Superstructure, as reported)
  //   min dE to a status hue 42.5 → 60.9
  //   worst label contrast  2.10:1 → 5.92:1   (the OLD palette failed a 3.0 floor on every light bar —
  //                                            white-on-#8bc34a was 2.10:1, effectively unreadable)
  var PHASE_COLORS = {
    'Substructure':   '#37516b',   // structure, deep
    'Superstructure': '#79b4e8',   // structure, light
    'MEP Rough-in':   '#27714a',   // MEP, deep
    'MEP Final':      '#7ccb80',   // MEP, light
    'Architecture':   '#5e3f87',   // architecture, deep
    'Finishes':       '#c096e0'    // architecture, light
  };

  // Adaptive label ink — white on the deep family members, near-black on the light ones. Forcing
  // white onto every bar is what drove the old 2.10:1 contrast; picked per fill, all six clear 5.9:1.
  var PHASE_INK = {
    'Substructure':   '#ffffff',
    'Superstructure': '#10141a',
    'MEP Rough-in':   '#ffffff',
    'MEP Final':      '#10141a',
    'Architecture':   '#ffffff',
    'Finishes':       '#10141a'
  };

  // The in-bar text label used to be phase.substring(0,3), which collided on exactly the same pair
  // the colours did: "Sub" vs "Sup", one character apart at 9px. Explicit short codes instead.
  var PHASE_SHORT = {
    'Substructure': 'SUB', 'Superstructure': 'SUPER', 'MEP Rough-in': 'MEP-R',
    'MEP Final': 'MEP-F', 'Architecture': 'ARCH', 'Finishes': 'FIN'
  };

  // ── §TM-VARIANCE — budget-vs-actual from the STORED twin (TM_4D5D_VARIANCE_LANE §S1) ──
  // COST is READ, never recomputed: PlannedAmt → CommittedAmt straight off the iDempiere C_Project /
  // C_ProjectPhase records baked into erp/ad_seed.db (erp/tests/bake_gw_hospital_variance.js). The drawer
  // shows the SAME figure the ledger holds — §DOCTRINE 2/3 "variance = the PlannedAmt↔CommittedAmt pair,
  // read the twin, don't recompute". Phase TIME windows come from TM's own injected gantt (_ops) so the
  // cursor scrubs the same axis as the 3D scene. No LABOR_RATES×days, no hash variant — that only correlated.
  var _DAY_MS = 86400000;
  var _VAR_ORDER = ['Substructure', 'Superstructure', 'MEP Rough-in', 'Architecture', 'MEP Final', 'Finishes'];
  var _twin = null;          // { building, projectId, planned, committed, phases:[{name,seqno,start,end,planned,committed}] }
  var _twinLoading = false;
  // §PERF_NEG_CACHE: building names whose ERP load returned no rows. Without these, the per-tick
  // dashboard/variance guards re-fetch ad_seed.db (25.8MB) from IDB forever on a non-folded building.
  var _twinMiss = null, _shopfloorMiss = null;
  // Load the folded ERP twin once: fetch the seed db → sql.js → read the C_Project cost pair + its phases.
  // Same lazy-fetch idiom as navigate_find._ensureErpDb; read-only (db.close after extracting the figures).
  function _loadTwin() {
    var app = TMS.A();
    // §S54 (4D_GANTT_TM_REFACTOR.md §S54.2, item F2): this used to read
    // `(app && app.activeBuilding) || 'Hospital'` — with no active building it silently loaded
    // HOSPITAL's ERP twin and attached its cost/phase figures to whatever model was on screen.
    // No active building is a REAL state (an arbitrary IFC opened straight into the viewer) and
    // the honest answer there is the one both functions already give a building with no C_Project
    // row: no folded project. Skip, never guess — and skip BEFORE the 25.8MB ad_seed.db fetch.
    var building = app && app.activeBuilding;
    if (!building) { console.log('§TM_TWIN_NOBLD no active building — ERP twin skipped (never defaulted to another building\'s project)'); return Promise.resolve(null); }
    if (_twin && _twin.building === building) return Promise.resolve(_twin);   // cached for THIS building
    if (_twinMiss === building) return Promise.resolve(null);   // §PERF_NEG_CACHE — see _loadShopfloor
    if (_twinLoading) return Promise.resolve(null);                            // a load is in flight; caller retries
    var SQL = (app && app._SQL) || window.SQL || window._SQL_CACHED;
    if (!SQL) { console.log('§TM_TWIN_DEFER no sql.js factory'); return Promise.resolve(null); }
    _twinLoading = true;
    return APP.cachedFetch('../erp/ad_seed.db').then(function (buf) {
      var db = new SQL.Database(new Uint8Array(buf));
      var pr = db.exec("SELECT C_Project_ID,PlannedAmt,CommittedAmt FROM C_Project WHERE Value=?", [building]);
      if (!pr.length || !pr[0].values.length) { db.close(); _twinLoading = false; _twinMiss = building; console.log('§TM_TWIN_MISS building="' + building + '" — not a folded project (miss cached, no refetch)'); return null; }
      var pid = pr[0].values[0][0], planned = Number(pr[0].values[0][1] || 0), committed = Number(pr[0].values[0][2] || 0);
      var ph = db.exec("SELECT Name,SeqNo,StartDate,EndDate,PlannedAmt,CommittedAmt FROM C_ProjectPhase WHERE C_Project_ID=" + Number(pid) + " AND Name<>'Unsequenced' ORDER BY SeqNo");
      var phases = (ph.length ? ph[0].values : []).map(function (row) {
        return { name: row[0], seqno: Number(row[1] || 0), start: Date.parse(row[2]), end: Date.parse(row[3]),
                 planned: Number(row[4] || 0), committed: Number(row[5] || 0) };
      });
      db.close();
      _twin = { building: building, projectId: pid, planned: planned, committed: committed, phases: phases };
      _twinLoading = false;
      console.log('§TM_TWIN_LOADED building="' + building + '" planned=' + planned + ' committed=' + committed + ' phases=' + phases.length);
      return _twin;
    }).catch(function (e) { _twinLoading = false; console.log('§TM_TWIN_ERR ' + e.message); return null; });
  }
  // §E2b — load PP_Order + PP_Order_Cost from the ERP DB for the active building's project.
  // Builds _shopfloor.orders = [{start, end, elements:{Material,Labor,Burden,Overhead}}]
  // Same fetch/cache pattern as _loadTwin; closed over _shopfloor/_shopfloorLoading.
  function _loadShopfloor() {
    var app = TMS.A();
    var building = app && app.activeBuilding;   // §S54 (item F2) — see _loadTwin: skip, never guess a building
    if (!building) { console.log('§PERF_NEG_CACHE shopfloor no-building — skipped before the ad_seed.db fetch (not a cached miss: the miss cache is keyed by name and this state has none)'); return Promise.resolve(null); }
    if (TMS._shopfloor && TMS._shopfloor.building === building) return Promise.resolve(TMS._shopfloor);
    // §PERF_NEG_CACHE: remember a MISS too. drawDash() calls this every tick behind
    // `if (!_shopfloor && !_shopfloorLoading)`, and every failure path below cleared the
    // in-flight flag WITHOUT setting _shopfloor — so a building with no PP_Order rows re-fetched
    // ad_seed.db (25.8MB) from IndexedDB on EVERY playback tick. A cache that only remembers
    // successes is not a cache.
    if (_shopfloorMiss === building) return Promise.resolve(null);
    if (TMS._shopfloorLoading) return Promise.resolve(null);
    var SQL = (app && app._SQL) || window.SQL || window._SQL_CACHED;
    if (!SQL) return Promise.resolve(null);   // NOT a miss — sql.js may arrive later, retry is correct
    TMS._shopfloorLoading = true;
    return APP.cachedFetch('../erp/ad_seed.db').then(function (buf) {
      var db = new SQL.Database(new Uint8Array(buf));
      var pr = db.exec('SELECT C_Project_ID FROM C_Project WHERE Value=?', [building]);
      if (!pr.length || !pr[0].values.length) { db.close(); TMS._shopfloorLoading = false; _shopfloorMiss = building; console.log('§PERF_NEG_CACHE shopfloor miss cached building="' + building + '" — no further ad_seed.db refetch'); return null; }
      var pid = pr[0].values[0][0];
      var res = db.exec(
        'SELECT o.PP_Order_ID, o.DateStartSchedule, o.DateFinishSchedule,' +
        ' oc.M_CostElement_ID, ce.Name AS elem, oc.CumulatedAmt' +
        ' FROM PP_Order o' +
        ' JOIN PP_Order_Cost oc ON o.PP_Order_ID=oc.PP_Order_ID' +
        ' JOIN M_CostElement ce ON oc.M_CostElement_ID=ce.M_CostElement_ID' +
        ' WHERE o.C_Project_ID=' + Number(pid) + ' AND oc.CumulatedAmt>0' +
        ' ORDER BY o.DateFinishSchedule, oc.M_CostElement_ID'
      );
      db.close();
      var rows = res.length ? res[0].values : [];
      var orderMap = {};
      rows.forEach(function (r) {
        var oid = r[0], s = Date.parse(r[1]), e = Date.parse(r[2]), eName = r[4], amt = Number(r[5] || 0);
        if (!orderMap[oid]) orderMap[oid] = { start: s, end: e, elements: {} };
        orderMap[oid].elements[eName] = (orderMap[oid].elements[eName] || 0) + amt;
      });
      var orders = Object.keys(orderMap).map(function (k) { return orderMap[k]; });
      TMS._shopfloor = { building: building, orders: orders };
      TMS._shopfloorLoading = false;
      console.log('§TM_SHOPFLOOR_LOADED building=' + building + ' orders=' + orders.length + ' rows=' + rows.length);
      return TMS._shopfloor;
    }).catch(function (e) { TMS._shopfloorLoading = false; console.log('§TM_SHOPFLOOR_ERR ' + e.message); return null; });
  }
  function _money(n) { n = Math.round(n); var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e6) return s + 'RM' + (a / 1e6).toFixed(1) + 'M'; if (a >= 1e3) return s + 'RM' + Math.round(a / 1e3) + 'K'; return s + 'RM' + a; }
  // Join the STORED twin cost (READ) to TM's gantt phase windows (the scrub axis). The cost numbers are the
  // records verbatim — Σ phase PlannedAmt == C_Project.PlannedAmt and Σ CommittedAmt == C_Project.CommittedAmt
  // (verified: 64,719,479 → 87,372,995). The _ops aggregation only supplies each phase's TIME window so the
  // cursor + hairline land on the same axis as the 3D scene. Marquee = any phase ≥+50% over (Superstructure).
  function _computeVariance() {
    if (!_twin) return null;
    var src = TMS._opsPlanned || TMS._ops, win = {};
    for (var i = 0; i < src.length; i++) {
      var op = src[i], ph = (op.parameters || {}).phase || 'Architecture';
      if (!win[ph]) win[ph] = { start: op.start_ts, end: op.end_ts };
      else { if (op.start_ts < win[ph].start) win[ph].start = op.start_ts; if (op.end_ts > win[ph].end) win[ph].end = op.end_ts; }
    }
    var t0 = Infinity, t1 = -Infinity, pStart = Infinity, pEnd = -Infinity;
    var phases = _twin.phases.map(function (tp) {
      var w = win[tp.name], dCost = tp.committed - tp.planned;
      var ws = w ? w.start : tp.start, we = w ? w.end : tp.end;
      if (isFinite(ws) && ws < t0) t0 = ws;
      if (isFinite(we) && we > t1) t1 = we;
      if (isFinite(tp.start) && tp.start < pStart) pStart = tp.start;
      if (isFinite(tp.end) && tp.end > pEnd) pEnd = tp.end;
      return { phase: tp.name, pCost: tp.planned, aCost: tp.committed, dCost: dCost,
               pct: tp.planned > 0 ? Math.round(dCost / tp.planned * 100) : 0,
               winStart: ws, winEnd: we, startDate: tp.start, endDate: tp.end,
               marquee: tp.planned > 0 && dCost / tp.planned >= 0.5 };
    }).sort(function (x, y) { var ix = _VAR_ORDER.indexOf(x.phase), iy = _VAR_ORDER.indexOf(y.phase); return (ix < 0 ? 99 : ix) - (iy < 0 ? 99 : iy); });
    if (!isFinite(t0)) { t0 = TMS._projectStart; t1 = TMS._projectEnd; }
    return { phases: phases, tP: _twin.planned, tA: _twin.committed, dCost: _twin.committed - _twin.planned,
             pctOver: _twin.planned > 0 ? Math.round((_twin.committed - _twin.planned) / _twin.planned * 100) : 0,
             t0: t0, t1: t1, plannedStart: pStart, plannedEnd: pEnd };
  }
  function _recomputeBounds() {
    var s = Infinity, e = -Infinity;
    for (var i = 0; i < TMS._ops.length; i++) { if (TMS._ops[i].start_ts < s) s = TMS._ops[i].start_ts; if (TMS._ops[i].end_ts > e) e = TMS._ops[i].end_ts; }
    if (isFinite(s)) { TMS._projectStart = s; TMS._projectEnd = e; }
  }
  // map the scrub cursor to the phase whose gantt window contains it (for the hairline + row highlight).
  function _varPhaseUnderCursor(V) {
    if (!V) return -1;
    for (var i = 0; i < V.phases.length; i++) { var p = V.phases[i]; if (TMS._cursor >= p.winStart && TMS._cursor <= p.winEnd) return i; }
    return -1;
  }
  // E3 / W-SHOP-DATES — the 4D counterpart to the 5D cost Δ. DOCTRINE (TM_4D5D §S3/§4): there is NO actual-date
  // column to read (PP_Order.DateStart/DateFinish are NULL by design), so the schedule slip is a PROJECTION FROM
  // COST — never an invented actual date: slip = planned-duration × (r−1), r = CommittedAmt/PlannedAmt (the real
  // twin). Planned durations are REAL (C_ProjectPhase.StartDate/EndDate, per-order PP_Order.DateStartSchedule/
  // Finish). Honestly labelled "projected from cost". Ripple/dependency is S6 — phases project INDEPENDENTLY here.
  var _DAY = 86400000;
  function _computeScheduleProjection(V) {
    if (!V) return null;
    var phases = V.phases.map(function (p) {
      var durDays = (isFinite(p.startDate) && isFinite(p.endDate) && p.endDate > p.startDate)
        ? Math.round((p.endDate - p.startDate) / _DAY) : 0;
      var r = p.pCost > 0 ? p.aCost / p.pCost : 1;
      var slipDays = Math.round(durDays * (r - 1));            // +late / −early, mirrors the cost over/under sign
      return { phase: p.phase, durDays: durDays, r: r, slipDays: slipDays,
               projEnd: isFinite(p.endDate) ? p.endDate + slipDays * _DAY : NaN, marquee: p.marquee };
    });
    var projDurDays = (isFinite(V.plannedStart) && isFinite(V.plannedEnd) && V.plannedEnd > V.plannedStart)
      ? Math.round((V.plannedEnd - V.plannedStart) / _DAY) : 0;
    var rProj = V.tP > 0 ? V.tA / V.tP : 1;                    // project-level ratio (no phase compounding = no ripple)
    var projSlipDays = Math.round(projDurDays * (rProj - 1));
    return { phases: phases, projDurDays: projDurDays, rProj: rProj, projSlipDays: projSlipDays,
             projEnd: isFinite(V.plannedEnd) ? V.plannedEnd + projSlipDays * _DAY : NaN };
  }
  // S5(B) / W-PC-EVM — Earned-Value Management folded from the EXISTING twin (no generated C_ProjectIssue layer;
  // PC_EVM_SPEC). COST is real: at the cursor, each phase contributes its baseline progress fraction →
  // EV (budgeted value of work done) + AC (committed cost of work done) → CPI = EV/AC, and the at-completion
  // forecast EAC = BAC/CPI (at completion EV=BAC ⇒ EAC = AC = the real CommittedAmt, to the rupiah). SCHEDULE has
  // no independent actual on this twin (see §HONESTY FINDING) so we emit NO SPI — the schedule story is the E3
  // "projected finish". Label "cost · from records". Cursor-driven (drawVariance re-folds on scrub).
  function _computeEVM(V, cursor) {
    if (!V) return null;
    var EV = 0, AC = 0;
    V.phases.forEach(function (p) {
      var s = p.startDate, e = p.endDate;
      var frac = (isFinite(s) && isFinite(e) && e > s) ? Math.max(0, Math.min(1, (cursor - s) / (e - s)))
               : (isFinite(cursor) && isFinite(e) && cursor >= e ? 1 : 0);
      EV += p.pCost * frac;                                   // BCWP — budgeted value of completed work
      AC += p.aCost * frac;                                   // ACWP — committed cost of completed work
    });
    var BAC = V.tP;                                           // budget at completion = Σ PlannedAmt
    var CPI = AC > 0 ? EV / AC : 1;
    var EAC = CPI > 0 ? Math.round(BAC / CPI) : V.tA;         // forecast at completion (= committed once complete)
    return { EV: Math.round(EV), AC: Math.round(AC), CPI: CPI, CV: Math.round(EV - AC), BAC: BAC, EAC: EAC, VAC: BAC - EAC };
  }
  function drawVariance() {
    var _L = (typeof TMS._tmTrl === 'function') ? TMS._tmTrl : function (k, en, r) { var s = en; if (r) for (var q in r) s = s.replace('{' + q + '}', r[q]); return s; };   // S226 §R2b — sliced into vm sandboxes by witnesses
    if (!TMS._ops.length) return;
    if (!TMS._opsPlanned) TMS._opsPlanned = TMS._ops.slice();          // first open: snapshot the planned timeline (phase windows)
    var head = document.getElementById('tm-var-head');
    if (!_twin) {                                          // records not fetched yet → load, then redraw
      if (head) head.innerHTML = '<b style="color:#4fc3f7">' + _L('tm_budget_vs_actual', 'Budget vs Actual') + '</b><div style="margin-top:2px;color:#888">' + _L('tm_reading_records', 'Reading records…') + '</div>';
      _loadTwin().then(function (t) { if (t && TMS._varVisible) drawVariance(); });
      return;
    }
    var V = _computeVariance();
    if (!V) { if (head) head.innerHTML = '<b style="color:#4fc3f7">' + _L('tm_budget_vs_actual', 'Budget vs Actual') + '</b><div style="margin-top:2px;color:#888">' + _L('tm_no_project_records', 'No project records for this model') + '</div>'; return; }
    var fmtD = function (ms) { return isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : '—'; };
    var curIdx = _varPhaseUnderCursor(V);
    var SP = _computeScheduleProjection(V);                     // E3 — the projected-from-cost schedule slip (4D Δ)
    var EVM = _computeEVM(V, TMS._cursor);                          // S5(B) — cursor-driven cost EVM (CPI + EAC forecast)
    var slipColor = function (d) { return d >= 0 ? '#ff6b6b' : '#26a69a'; };
    var slipTxt = function (d) { return (d >= 0 ? '+' : '') + d + ' d'; };

    // header — the headline COST pair (READ from the twin) + the planned schedule span. Honest labels:
    // cost Δ is "from records"; the date span is the planned baseline (no actual-date column yet → §S3).
    if (head) {
      head.innerHTML =
        '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px">' +
          '<b style="color:#4fc3f7">' + _L('tm_budget_vs_actual', 'Budget vs Actual') + '</b>' +
          '<span style="font-size:9px;color:#888">' + _L('tm_from_records', 'from records') + ' · ' + _twin.building + '</span>' +
        '</div>' +
        '<div style="margin-top:2px">' + _L('tm_cost', 'Cost') + ' <b style="color:#9fd6ff" title="C_Project.PlannedAmt">' + _money(V.tP) + '</b> → ' +
          '<b style="color:#ff6b6b" title="C_Project.CommittedAmt">' + _money(V.tA) + '</b> ' +
          '<span style="color:' + (V.dCost >= 0 ? '#ff6b6b' : '#26a69a') + '">(' + (V.dCost >= 0 ? '+' : '') + V.pctOver + '%, ' +
          (V.dCost >= 0 ? '+' : '') + _money(V.dCost) + ')</span></div>' +
        '<div style="color:#9fd6ff">' + _L('tm_schedule', 'Schedule') + ' ' + fmtD(V.plannedStart) + ' → ' + fmtD(V.plannedEnd) +
          ' <span style="color:#888">' + _L('tm_planned_baseline', '(planned baseline)') + '</span></div>' +
        (SP ? '<div style="color:#ffb74d">' + _L('tm_projected_finish', 'Projected finish') + ' ' + fmtD(SP.projEnd) +
          ' <span style="color:' + slipColor(SP.projSlipDays) + '">(' + slipTxt(SP.projSlipDays) + ')</span>' +
          ' <span style="color:#888">' + _L('tm_projected_from_cost', 'projected from cost') + '</span></div>' : '') +
        // S5(B) EVM — cursor-driven earned value: EV/AC + CPI + the at-completion forecast (EAC). Cost only,
        // from records (no independent SPI on this twin — see §HONESTY FINDING; schedule = the line above).
        (EVM ? '<div style="margin-top:2px;color:#cfe8ff">EV <b>' + _money(EVM.EV) + '</b> / AC <b>' + _money(EVM.AC) + '</b>' +
          ' · CPI <b style="color:' + (EVM.CPI >= 1 ? '#26a69a' : '#ff6b6b') + '">' + EVM.CPI.toFixed(2) + '</b>' +
          ' · ' + _L('tm_forecast', 'forecast') + ' <b title="EAC = BAC/CPI">' + _money(EVM.EAC) + '</b>' +
          ' <span style="color:' + (EVM.VAC >= 0 ? '#26a69a' : '#ff6b6b') + '">(' + (EVM.VAC >= 0 ? '+' : '') + _money(EVM.VAC) + ')</span>' +
          ' <span style="font-size:9px;color:#888">' + _L('tm_cost_from_records', 'cost · from records') + '</span></div>' : '');
    }

    // canvas — one bar per phase on the SAME axis the cursor scrubs; bar color = phase, edge cap red/green by
    // COST over/under (from records). Phase under the cursor is outlined; a vertical hairline marks the cursor.
    var canvas = document.getElementById('tm-var-canvas');
    var box = document.getElementById('tm-var-box');
    if (canvas && box) {
      var phases = V.phases, n = phases.length;
      var barH = 9, gap = 5, rowH = barH + gap, marginL = 64;
      var cW = box.clientWidth, cH = n * rowH + 8, barW = cW - marginL - 6;
      var range = Math.max(1, V.t1 - V.t0);
      canvas.width = cW * (window.devicePixelRatio || 1);
      canvas.height = cH * (window.devicePixelRatio || 1);
      canvas.style.height = cH + 'px';
      var ctx = canvas.getContext('2d');
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      ctx.clearRect(0, 0, cW, cH);
      ctx.textBaseline = 'middle'; ctx.font = '9px sans-serif';
      for (var ti = 0; ti < n; ti++) {
        var p = phases[ti], color = PHASE_COLORS[p.phase] || '#888', y = ti * rowH + 4;
        var over = p.dCost > 0;
        // label
        ctx.fillStyle = (ti === curIdx) ? '#fff' : (p.marquee ? '#ff8c00' : '#bbb'); ctx.textAlign = 'right';
        ctx.fillText((p.marquee ? '⚠ ' : '') + p.phase.substring(0, 11), marginL - 4, y + barH / 2);
        // phase bar on the cursor axis
        var px = marginL + (p.winStart - V.t0) / range * barW, pw = Math.max(3, (p.winEnd - p.winStart) / range * barW);
        ctx.globalAlpha = (ti === curIdx) ? 1 : 0.78; ctx.fillStyle = color; ctx.fillRect(px, y, pw, barH);
        // cost over/under cap on the trailing edge (red over, green under) — the variance signal
        ctx.globalAlpha = 1; ctx.fillStyle = over ? '#e53935' : '#26a69a';
        ctx.fillRect(px + pw - 3, y, 3, barH);
        // row highlight outline for the phase under the cursor
        if (ti === curIdx) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(px - 0.5, y - 0.5, pw + 1, barH + 1); }
      }
      // cursor hairline
      var hx = marginL + (TMS._cursor - V.t0) / range * barW;
      if (hx >= marginL && hx <= marginL + barW) {
        ctx.strokeStyle = '#4fc3f7'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(hx, 0); ctx.lineTo(hx, cH); ctx.stroke();
      }
    }

    // compact per-phase variance list — committed vs planned, ΔCost from records.
    var list = document.getElementById('tm-var-list');
    if (list) {
      var html = '';
      V.phases.forEach(function (p, i) {
        var dc = (p.dCost >= 0 ? '+' : '') + _money(p.dCost);
        var col = p.dCost > 0 ? '#ff6b6b' : '#26a69a';
        var sp = SP ? SP.phases[i] : null;                      // E3 — the per-phase projected schedule slip
        var spTxt = sp ? ' <span style="color:' + slipColor(sp.slipDays) + '" title="' + _L('tm_projected_from_cost', 'projected from cost') + '">' + slipTxt(sp.slipDays) + '</span>' : '';
        html += '<div style="display:flex;justify-content:space-between;gap:6px' + (i === curIdx ? ';color:#fff;font-weight:bold' : '') + '">' +
          '<span>' + (p.marquee ? '⚠ ' : '') + p.phase + '</span>' +
          '<span style="color:' + col + '">' + dc + ' (' + (p.pct >= 0 ? '+' : '') + p.pct + '%)' + spTxt + '</span></div>';
      });
      list.innerHTML = html;
    }
    console.log('§TM_VARIANCE source=twin building="' + _twin.building + '" phases=' + V.phases.length +
      ' plannedCost=' + V.tP + ' committedCost=' + V.tA + ' over=' + V.pctOver + '% curPhase=' +
      (curIdx >= 0 ? V.phases[curIdx].phase : '-'));
    if (SP) console.log('§SCHED_PROJECT source=projected-from-cost building="' + _twin.building +
      '" projEnd=' + fmtD(SP.projEnd) + ' projSlipDays=' + SP.projSlipDays + ' rProj=' + SP.rProj.toFixed(3) +
      ' phases=' + SP.phases.map(function (x) { return x.phase + ':' + (x.slipDays >= 0 ? '+' : '') + x.slipDays + 'd'; }).join(','));
    if (EVM) console.log('§EVM_FOLD source=twin(cost) cursor=' + Math.round(TMS._cursor) + ' EV=' + EVM.EV +
      ' AC=' + EVM.AC + ' CPI=' + EVM.CPI.toFixed(3) + ' CV=' + EVM.CV + ' BAC=' + EVM.BAC + ' EAC=' + EVM.EAC + ' VAC=' + EVM.VAC);
  }
};
