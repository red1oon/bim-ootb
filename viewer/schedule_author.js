// schedule_author.js — §AUTHOR-1 (FUSED_4D5D_WEDGE_LANE) — the FIRST authoring slice.
// Build the 4D schedule UP from a blank model: rule-group elements into ORGANIZED phases
// (WBS) written into the IFC-native 4D tables, then craft (reassign) elements between phases.
//
// Implementing FUSED_4D5D_WEDGE_LANE.md §AUTHOR-1 — Witness: W-AUTHOR-4D-BLANK
// SOURCE OF TRUTH = the IFC-native tables `schedules`/`tasks`/`task_elements` ONLY
// (per §AUTHOR-1 "NOT a new kernel_ops op; corrected 2026-06-23"). kernel_ops mirroring deferred.
//
// Pure, DOM-free, node-testable. `materializeDefault` writes EXACTLY the substrate that
// injectGantt's `_cap` overlay (time_machine.js ~2405) reads: dated, non-summary leaf tasks +
// task_elements assignments. The task->guid row IS the P2 identity-link (survives rename).
(function (global) {
  'use strict';

  // matchRule — REPLICATES time_machine.js matchRule EXACTLY (longest-substring containment),
  // so authored phases are identical to what injectGantt would group elements into.
  function matchRule(cls, rules, dflt) {
    rules = rules || {};
    dflt = dflt || { phase: 'Architecture', sequence: 6, resource: null };
    if (!cls) return dflt;
    var bestKey = null, bestLen = 0;
    for (var key in rules) {
      if (cls.indexOf(key) >= 0 && key.length > bestLen) { bestKey = key; bestLen = key.length; }
    }
    // §CLASS_UNMATCHED_FALLBACK (2026-08-04): a class with no SEQUENCE_RULES key at all used to
    // land on `dflt` silently — found live on real Hospital data (861 IfcDistributionControlElement,
    // 113 IfcSwitchingDevice). Loud, not silent: whoever imports a new IFC set with a genuinely
    // unclassified class sees it in the log instead of it vanishing into the generic default.
    if (!bestKey) console.warn('§CLASS_UNMATCHED cls=' + cls + ' falling back to default phase=' + dflt.phase);
    return bestKey ? rules[bestKey] : dflt;
  }

  // matchNameOverride — REPLICATES time_machine.js matchNameOverride EXACTLY. §4D_FACADE_ORDER:
  // ifc_class alone cannot tell curtain-wall glazing/framing (IfcPlate/IfcMember) from genuinely
  // structural plates/members. Checked BEFORE matchRule, never replacing it — see rates/sequence_rules.json.
  function matchNameOverride(cls, name, nameOverrides) {
    if (!name || !nameOverrides) return null;
    for (var i = 0; i < nameOverrides.length; i++) {
      var ov = nameOverrides[i];
      if (ov.classes && ov.classes.indexOf(cls) < 0) continue;
      if (!ov._re) { try { ov._re = new RegExp(ov.pattern, ov.flags || 'i'); } catch (e) { ov._re = null; } }
      if (ov._re && ov._re.test(name)) return ov;
    }
    return null;
  }

  function _slug(name) {
    return String(name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  // _installSecs — REPLICATES time_machine.js getInstallSecs EXACTLY (same 28800s/day, same 120s
  // no-data default, same longest-substring productivity match), parameterized instead of reading
  // window globals so it is node-testable. `rule` is the phase rule already resolved for this
  // element (matchNameOverride/matchRule) — not re-derived, to keep the classification a single pass.
  // `realQty` (optional) — §LABOR_QUANTITY_WEIGHT below: when a class is geometrically
  // over-fragmented, the caller passes this element's REAL bbox area instead of leaving it null,
  // and the same per-unit rate (28800/prod) is charged per m² instead of once per element.
  // `lengthRatio` (optional) — §HEAVY_MEMBER_SPEED_LIMIT below: this element's real length divided
  // by its class's real average length. A flat per-unit rate assumes every element is "typical
  // sized" (e.g. a 5.7m beam); this element's own real size scales the flat rate instead, so a 60m
  // beam and a 0.9m beam charge differently even though both are counted as "1 IfcBeam".
  // §TPL_ZERO_MINUTE (2026-08-25, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S65) — the 120s
  // returns below are a FLOOR, not a real duration: on a 45-day axis a 120-second element draws a
  // zero-width Gantt bar, and every floored element starts at the same instant, so they stack. That
  // is the user-reported "zero minute stacking", and it survived weeks of downstream fixes because
  // this function reached the floor SILENTLY — no §-log, at any of its sites, ever.
  // Now reported, but AGGREGATED PER CLASS and once only: §CLASS_UNMATCHED already warns once per
  // ELEMENT and that alone overflowed run_witness_suite.js's 1MB spawnSync maxBuffer on Hospital
  // (WITNESS_INTERFACE_FRAMEWORK.md §6). A per-element line here would be strictly worse.
  var _floorSeen = {};
  function _reportFloor(cls, resource, why) {
    var k = cls + '|' + resource + '|' + why;
    if (_floorSeen[k]) return;
    _floorSeen[k] = 1;
    console.warn('§TPL_ZERO_MINUTE cls=' + cls + ' resource=' + resource + ' reason=' + why +
      ' — 120s floor, this class draws a zero-width bar (first occurrence only)');
  }
  function _installSecs(cls, rule, laborRates, realQty, lengthRatio) {
    var resource = rule && rule.resource;
    if (!resource || !laborRates[resource]) { _reportFloor(cls, resource, 'no-resource'); return 120; }
    var labor = laborRates[resource], bestPk = null, bestLen = 0;
    for (var pk in labor.productivity) {
      if (cls.indexOf(pk) >= 0 && pk.length > bestLen) { bestPk = pk; bestLen = pk.length; }
    }
    // §S65: the class-key lookup above is a SUBSTRING match, so a class the table does not name can
    // never resolve ANY key — which is why SEQUENCE_DEFAULT floored no matter which resource it
    // pointed at. default_productivity is the resource's own declared figure for that case; absent,
    // this is 0 and the floor still applies exactly as before (backward-compatible).
    var prod = bestPk ? labor.productivity[bestPk] : (labor.default_productivity || 0);
    if (prod <= 0) { _reportFloor(cls, resource, bestPk ? 'productivity<=0' : 'no-productivity-key'); return 120; }
    var secsPerUnit = 28800 / prod;
    if (realQty != null) return Math.round(secsPerUnit * realQty);
    if (lengthRatio != null) return Math.round(secsPerUnit * lengthRatio);
    return Math.round(secsPerUnit);
  }

  // _classFragmentation(db, rates) — §LABOR_QUANTITY_WEIGHT (GANTT_ACCURACY.md "RESUME 2026-08-04,
  // root cause found"): 33,324 Terminal "Metal Deck" IfcPlate fragments average 0.074 m² each —
  // smaller than a floor tile — so charging LABOR_RATES.STEEL_ERECTOR.productivity.IfcPlate=12/day
  // once PER FRAGMENT (33,324 "elements") inflated Superstructure to 968 days. The formula itself
  // was never wrong; its INPUT (element count as a proxy for real installable quantity) was wrong
  // for this one over-fragmented class.
  //
  // The fix is NOT "always use RATES[cls].unit='M2' as area" — measured on Terminal, every OTHER
  // M2-priced class already has a normal, real-panel-sized average (IfcSlab 22.7 m², IfcWall 40.6
  // m², IfcCovering 65.6 m², IfcRoof 91.4 m²) — their per-element counts already ARE real
  // installable units, and area-weighting them anyway would invent a NEW regression with zero
  // evidence behind it (measured: IfcWall would jump from ~14 days to 563 days). So this is a
  // DATA-DRIVEN per-class test, not a per-unit-type blanket rule: an M2-priced class is
  // fragmented only when its OWN measured average bbox area is smaller than a floor tile
  // (FRAGMENT_M2_FLOOR) — the same yardstick this file's own investigation already used in
  // prose ("0.074 m² is smaller than a floor tile"), now the actual test. Any building where some
  // OTHER M2 class is the fragmented one (curtain-wall glazing, brick coursing) is caught the same
  // way, generically — nothing here names "Metal Deck" or "IfcPlate".
  //
  // Non-invented: uses RATES[cls].unit (already shipped, rates.js) to find candidate classes, and
  // the EXACT analysis_sidecar.js compute5D dominant-face-area SQL expression (already shipped) to
  // measure them. No conversion factor, no assumed "real plate size" — the measured average IS the
  // test, and the real per-element area IS the weight.
  var FRAGMENT_M2_FLOOR = 1.0;   // m² — "smaller than a floor tile"
  var _AREA_EXPR = "MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE " +
    "WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) " +
    "WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) " +
    "ELSE MAX(t.bbox_x,t.bbox_y) END";
  function _classFragmentation(db, qsRates) {
    var out = { fragmented: {}, area: {} };
    qsRates = qsRates || {};
    var m2Classes = [];
    for (var cls in qsRates) if (qsRates[cls] && qsRates[cls].unit === 'M2') m2Classes.push(cls);
    if (!m2Classes.length) return out;
    var q = function (list) { return list.map(function (c) { return "'" + c.replace(/'/g, "''") + "'"; }).join(','); };
    var r;
    try {
      r = db.exec("SELECT m.ifc_class, COUNT(*), SUM(" + _AREA_EXPR + ") FROM elements_meta m " +
        "JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x IS NOT NULL AND t.bbox_x>0 " +
        "AND m.ifc_class IN (" + q(m2Classes) + ") GROUP BY m.ifc_class");
    } catch (e) {   // no element_transforms table (e.g. a stripped test DB) — degrade to count-based
      // §S58 (§S58.2): this catch fires on ANY throw, not just the commented stripped-DB case, and
      // silently reverts durations to count-based — the §LABOR_QUANTITY_WEIGHT fix just doesn't
      // happen, with no trace. Behaviour unchanged; it is now VISIBLE.
      console.warn('§LABOR_QUANTITY_WEIGHT_SKIP no area weighting — ' + (e && e.message) +
        ' (durations fall back to count-based; not necessarily a stripped DB)');
      return out;
    }
    var fragClasses = [];
    if (r.length && r[0].values.length) {
      r[0].values.forEach(function (row) {
        var cls = row[0], cnt = row[1], total = row[2] || 0;
        var avg = cnt > 0 ? total / cnt : 0;
        if (avg > 0 && avg < FRAGMENT_M2_FLOOR) { out.fragmented[cls] = { avg: avg, total: total, count: cnt }; fragClasses.push(cls); }
      });
    }
    if (!fragClasses.length) return out;
    var ar = db.exec("SELECT m.guid, " + _AREA_EXPR + " FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
      "WHERE t.bbox_x IS NOT NULL AND t.bbox_x>0 AND m.ifc_class IN (" + q(fragClasses) + ")");
    if (ar.length && ar[0].values.length) ar[0].values.forEach(function (row) { out.area[row[0]] = row[1] || 0; });
    fragClasses.forEach(function (cls) {
      var f = out.fragmented[cls];
      console.log('§LABOR_QUANTITY_WEIGHT class=' + cls + ' count=' + f.count + ' avgArea=' + f.avg.toFixed(4) +
        'm2 (<' + FRAGMENT_M2_FLOOR + 'm2 floor) totalRealArea=' + f.total.toFixed(1) +
        'm2 — real AREA used as labor quantity, not element count');
    });
    return out;
  }

  // _linearWeighting(db, rates) — §HEAVY_MEMBER_SPEED_LIMIT (found 2026-08-04, 4D_SCHEDULE_PERFECTION.md
  // "20 piling beams erected right away" complaint). Root cause, MEASURED: a flat per-unit labor rate
  // (28800/prod) charges every element of a class the SAME install time regardless of its real size —
  // fine when a class IS uniform, wrong when it isn't. Terminal IfcBeam: 0.91m to 60.00m (8.2x spread).
  // LTU_AHouse IfcBeam: 0.09m to 118.20m (17.4x spread). A 60m span truss and a 0.9m stub both took the
  // identical "1 crew-hour" — no size-based speed limit for heavy/long members, so many same-day
  // placements read as an "impossible" bunched Gantt regardless of real size.
  // Same shape as §LABOR_QUANTITY_WEIGHT (_classFragmentation) above, generalized from AREA (M2) to
  // LENGTH (M) — every RATES class already priced per linear metre (IfcBeam, IfcColumn, IfcMember,
  // IfcDuct/IfcPipe/IfcCableCarrier runs, …) is a candidate, non-invented: RATES[cls].unit==='M' is
  // already-shipped data, real length is the same MAX(bbox_x,bbox_y,bbox_z) expression used
  // elsewhere in this file. UNLIKE the M2 fix, this does not gate on a "fragmented" threshold and
  // does not change the class's TOTAL labor-time — it REDISTRIBUTES the existing flat total
  // proportionally to each element's real length vs. its class's real average length (ratio≈1 when a
  // class is already uniform, e.g. Clinic's IfcBeam at 1.5x spread — no distortion there; ratio grows
  // exactly where the spread is real, e.g. LTU_AHouse). Generic: applies to any 'M'-unit class on any
  // building, nothing named here.
  function _linearWeighting(db, qsRates) {
    var out = { avgLength: {}, length: {} };
    qsRates = qsRates || {};
    var mClasses = [];
    for (var cls in qsRates) if (qsRates[cls] && qsRates[cls].unit === 'M') mClasses.push(cls);
    if (!mClasses.length) return out;
    var q = function (list) { return list.map(function (c) { return "'" + c.replace(/'/g, "''") + "'"; }).join(','); };
    var LEN_EXPR = 'MAX(t.bbox_x,t.bbox_y,t.bbox_z)';
    var r;
    try {
      r = db.exec("SELECT m.ifc_class, COUNT(*), SUM(" + LEN_EXPR + ") FROM elements_meta m " +
        "JOIN element_transforms t ON m.guid=t.guid WHERE t.bbox_x IS NOT NULL AND t.bbox_x>0 " +
        "AND m.ifc_class IN (" + q(mClasses) + ") GROUP BY m.ifc_class");
    } catch (e) {   // no element_transforms table — degrade to flat (no weighting)
      // §S58 (§S58.2): same silent-revert as above — §HEAVY_MEMBER_SPEED_LIMIT stops firing and
      // per-element speed stops scaling with real size, invisibly. Behaviour unchanged, now visible.
      console.warn('§HEAVY_MEMBER_SPEED_LIMIT_SKIP no length weighting — ' + (e && e.message) +
        ' (durations fall back to flat per-class totals)');
      return out;
    }
    var haveClasses = [];
    if (r.length && r[0].values.length) {
      r[0].values.forEach(function (row) {
        var cls = row[0], cnt = row[1], total = row[2] || 0;
        var avg = cnt > 0 ? total / cnt : 0;
        if (avg > 0) { out.avgLength[cls] = avg; haveClasses.push(cls); }
      });
    }
    if (!haveClasses.length) return out;
    var lr = db.exec("SELECT m.guid, " + LEN_EXPR + " FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid " +
      "WHERE t.bbox_x IS NOT NULL AND t.bbox_x>0 AND m.ifc_class IN (" + q(haveClasses) + ")");
    if (lr.length && lr[0].values.length) lr[0].values.forEach(function (row) { out.length[row[0]] = row[1] || 0; });
    console.log('§HEAVY_MEMBER_SPEED_LIMIT classes=' + haveClasses.length + ' [' +
      haveClasses.map(function (c) { return c + ':avg=' + out.avgLength[c].toFixed(2) + 'm'; }).join(', ') +
      '] — real LENGTH redistributes each class\'s existing flat total, per-element speed now scales with real size');
    return out;
  }

  // YYYY-MM-DD a given number of whole days after a base date string. Pure UTC arithmetic so
  // it is deterministic regardless of host timezone (no Date.now / locale dependence).
  function _addDays(baseStr, days) {
    var b = Date.parse(baseStr + 'T00:00:00Z');
    var d = new Date(b + days * 86400000);
    return d.toISOString().slice(0, 10);
  }

  function _cols(db, table) {
    var out = [];
    try {
      var r = db.exec('PRAGMA table_info(' + table + ')');
      if (r.length && r[0].values.length) r[0].values.forEach(function (c) { out.push(c[1]); });
    } catch (e) {}
    return out;
  }

  // §GANTT_SCHEDULE_STALE (4D_SCHEDULE_PERFECTION.md §GANTT_SHIFT_HOURS_DESYNC follow-up): the
  // authored `schedules` table had NO staleness signal at all, unlike kernel_ops (canvas), which
  // self-heals via _genVersion/_GANTT_CACHE_VERSION. Once a Gantt schedule was materialized it was
  // NEVER re-derived, however much the underlying scheduling code (computeSchedule's gates, the
  // display remap) changed since — a building's Gantt panel could be showing a schedule authored
  // weeks ago under different code while canvas plays fresh, current placements. gen_version closes
  // that gap the same way _GANTT_CACHE_VERSION already does for kernel_ops. Safe no-op if present.
  function _ensureSchedulesGenVersion(db) {
    db.run('CREATE TABLE IF NOT EXISTS schedules (schedule_id TEXT PRIMARY KEY, name TEXT, status TEXT, created_date TEXT)');
    if (_cols(db, 'schedules').indexOf('gen_version') >= 0) return;
    try { db.run('ALTER TABLE schedules ADD COLUMN gen_version INTEGER'); } catch (e) {}
  }

  // §ZONE_DISPLAY_AUTHORING (2026-08-16, 4D_SCHEDULE_PERFECTION.md §CHASE_TO_ZERO_WINDOW_AUTHORING):
  // marks a schedule whose task windows were derived from the DISPLAY timeline (opts.displayRemap
  // below) rather than the raw generative schedule. The captured overlay reads this to skip the
  // strict end-bar repair (_ogSupportSweep) that only existed because windows and movie described
  // two different schedules. Guarded ALTER, same shape as gen_version above.
  function _ensureSchedulesDisplayAuthored(db) {
    if (_cols(db, 'schedules').indexOf('display_authored') >= 0) return;
    try { db.run('ALTER TABLE schedules ADD COLUMN display_authored INTEGER'); } catch (e) {}
  }

  // Some shipped building DBs carry a LEGACY-thin `tasks` table
  // (task_id, schedule_id, name, start_date, finish_date, duration_days, status) that the read-path
  // `_cap` cannot consume (its query selects schedule_start/is_summary → errors → generative
  // fallback). Migrate it to the widened import_db_builder DDL so authored rows are readable.
  // Safe: maps the thin columns forward (no data loss), then drops + recreates.
  function _ensureWideTasks(db) {
    db.run('CREATE TABLE IF NOT EXISTS tasks (task_id TEXT PRIMARY KEY, schedule_id TEXT, wbs_parent TEXT, name TEXT, predefined_type TEXT, is_summary INTEGER, schedule_start TEXT, schedule_finish TEXT, schedule_duration TEXT, early_start TEXT, early_finish TEXT, late_start TEXT, late_finish TEXT, free_float TEXT, total_float TEXT, is_critical INTEGER, resource TEXT, status TEXT)');
    var cols = _cols(db, 'tasks');
    if (cols.indexOf('wbs_parent') >= 0) return false;        // already widened
    // Carry forward any legacy rows (start_date/finish_date/duration_days → schedule_*).
    var legacy = [];
    var hasStart = cols.indexOf('start_date') >= 0;
    var r = db.exec('SELECT * FROM tasks');
    if (r.length && r[0].values.length) {
      var c = r[0].columns;
      r[0].values.forEach(function (row) {
        var o = {}; for (var i = 0; i < c.length; i++) o[c[i]] = row[i];
        legacy.push(o);
      });
    }
    db.run('DROP TABLE tasks');
    db.run('CREATE TABLE tasks (task_id TEXT PRIMARY KEY, schedule_id TEXT, wbs_parent TEXT, name TEXT, predefined_type TEXT, is_summary INTEGER, schedule_start TEXT, schedule_finish TEXT, schedule_duration TEXT, early_start TEXT, early_finish TEXT, late_start TEXT, late_finish TEXT, free_float TEXT, total_float TEXT, is_critical INTEGER, resource TEXT, status TEXT)');
    if (legacy.length) {
      var st = db.prepare('INSERT OR IGNORE INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
      legacy.forEach(function (o) {
        st.run([o.task_id, o.schedule_id, null, o.name, null, 0,
          hasStart ? o.start_date : null, hasStart ? o.finish_date : null,
          (o.duration_days != null ? 'P' + o.duration_days + 'D' : null), null, o.status]);
      });
      st.free();
    }
    console.log('§AUTHOR_MIGRATE tasks→widened legacyRows=' + legacy.length);
    return true;
  }

  // _buildScheduleElements(db, rules, opts) — REPLICATES time_machine.js's element-building recipe
  // EXACTLY (storey-Z reassignment for elements with no real storey + matchRule/matchNameOverride +
  // installSecs), off the DB directly so materializeZones is node-testable and can feed
  // ScheduleGate.computeSchedule the SAME element shape the live movie already uses. The one piece
  // not already replicated elsewhere in this file is the §STOREY-Z reassignment (time_machine.js
  // assignStoreyByZ) — ported verbatim, same reasoning: an element with no real storey containment
  // (a literal "Unknown" IFC storey label — 69.9% of Terminal) is reassigned to the nearest REAL
  // storey by median center-Z, deterministic, nothing invented.
  function _buildScheduleElements(db, rules, opts) {
    opts = opts || {};
    var dflt = opts.defaultRule || (global.SEQUENCE_DEFAULT) || { phase: 'Architecture', sequence: 6, resource: null };
    var laborRates = opts.laborRates || (global.LABOR_RATES) || {};
    var qsRates = opts.rates || (global.RATES) || {};
    var nameOverrides = opts.nameOverrides || (global.SEQUENCE_NAME_OVERRIDES) || [];
    var _frag = _classFragmentation(db, qsRates);
    var _lin = _linearWeighting(db, qsRates);

    // §OPENING_EXCLUDE (found 2026-08-04, 4D_SCHEDULE_PERFECTION.md fool-proofing pass): this query
    // must match time_machine.js's own live-movie element-building query EXACTLY (this function's own
    // header says "REPLICATES ... EXACTLY") — that query excludes IfcOpeningElement (time_machine.js
    // WHERE m.ifc_class != 'IfcOpeningElement', 3x). This one didn't, so materializeDefault/
    // materializeZones scheduled wall/window VOIDS as if they were physical installable work — up to
    // 4.5% of elements on a real building (JKR: 425/9410). Silent: doesn't break DAG/support-order
    // (openings rarely collide with anything), just inflates phase/zone element+crew-time counts and
    // breaks the "movie-coherent, can never tell a different story" guarantee those functions claim.
    // §CLASS_UNMATCHED_FALLBACK (found 2026-08-04, witness_class_fallback_blackbox.js): IfcSpace is a
    // spatial-zone entity, not a physical installable element — same non-physical category as
    // IfcOpeningElement, excluded the same way (never invented labor for a room volume).
    var r = db.exec("SELECT m.guid, m.ifc_class, COALESCE(m.element_name,''), COALESCE(m.storey,'_UNKNOWN'), " +
      "COALESCE(t.center_x,0), COALESCE(t.center_y,0), COALESCE(t.center_z,0), " +
      "COALESCE(t.bbox_x,0), COALESCE(t.bbox_y,0), COALESCE(t.bbox_z,0) " +
      "FROM elements_meta m LEFT JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE m.ifc_class != 'IfcOpeningElement' AND m.ifc_class != 'IfcSpace'");
    if (!r.length || !r[0].values.length) return [];

    var storeyZs = {};
    r[0].values.forEach(function (row) {
      var storey = row[3], cz = row[6];
      if (storey === '_UNKNOWN' || /^unknown$/i.test(storey)) return;
      (storeyZs[storey] = storeyZs[storey] || []).push(cz);
    });
    var storeyNames = Object.keys(storeyZs), storeyMedianZ = {};
    storeyNames.forEach(function (s) {
      var zs = storeyZs[s].slice().sort(function (a, b) { return a - b; });
      storeyMedianZ[s] = zs[Math.floor(zs.length / 2)];
    });
    function assignStoreyByZ(storey, cz) {
      if (storey !== '_UNKNOWN' && !/^unknown$/i.test(storey)) return storey;
      if (!storeyNames.length) return storey;
      var best = storeyNames[0], bd = Infinity;
      for (var i = 0; i < storeyNames.length; i++) {
        var d = Math.abs(cz - storeyMedianZ[storeyNames[i]]);
        if (d < bd) { bd = d; best = storeyNames[i]; }
      }
      return best;
    }

    var _bseList = r[0].values.map(function (row) {
      var guid = row[0], cls = row[1], name = row[2], rawStorey = row[3];
      var cx = row[4], cy = row[5], cz = row[6], bx = row[7], by = row[8], bz = row[9];
      var storey = assignStoreyByZ(rawStorey, cz);
      var ov = matchNameOverride(cls, name, nameOverrides);
      var rule = ov || matchRule(cls, rules, dflt);
      var realQty = (_frag.fragmented[cls] && _frag.area[guid] != null) ? _frag.area[guid] : null;
      // §HEAVY_MEMBER_SPEED_LIMIT: only when this element has real geometry (bx/by/bz not all the
      // LEFT JOIN's COALESCE(...,0) default) and its class has a real measured average — else null,
      // same honest-degrade as realQty above (never divide by a fabricated average).
      var hasGeom = bx > 0 || by > 0 || bz > 0;
      var clsAvgLen = _lin.avgLength[cls];
      var lengthRatio = (realQty == null && hasGeom && clsAvgLen > 0)
        ? Math.max(bx, by, bz) / clsAvgLen : null;
      return {
        guid: guid, cls: cls, name: name, storey: storey,
        base_z: cz - bz / 2, top_z: cz + bz / 2,
        x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2,
        seq: rule.sequence, phase: rule.phase, resource: rule.resource || '_DEFAULT',
        installSecs: _installSecs(cls, rule, laborRates, realQty, lengthRatio),
        // §4D_NOGEO (2026-08-07, mirrors time_machine.js's own pool — this function's header says
        // "REPLICATES ... EXACTLY"): no transform row → COALESCE parks it at origin/zero-bbox. At
        // z=0 it has no support, schedules at day 0, and its zone's MIN start follows it there —
        // that day-0 zone window is what spread walls from day 1 in the live movie.
        noGeo: (bx === 0 && by === 0 && bz === 0 && cx === 0 && cy === 0 && cz === 0)
      };
    }).filter(function (e) { return !e.noGeo; });
    _reclassGroundworkSlabs(_bseList, 'schedule_author');
    return _bseList;
  }

  // §GROUNDWORK_SLAB (4D_GANTT_TM_REFACTOR.md §S9 / M5) — ONE shared definition
  // (ScheduleGate.groundworkSlabs), applied identically by both element recipes (this one and
  // time_machine.js's inline builder) so authored zones/tasks and the movie reclassify the SAME
  // slabs. Mutates phase in place; seq/resource unchanged (CONCRETE_GANG already).
  function _reclassGroundworkSlabs(list, who) {
    // schedule_gate.js self-registers on its own wrapper global (globalThis in node, window in the
    // browser) — this module's IIFE param is self||this, which in node is NOT globalThis, so check both.
    var SG = (global && global.ScheduleGate) ||
             (typeof globalThis !== 'undefined' && globalThis.ScheduleGate) ||
             (typeof window !== 'undefined' && window.ScheduleGate) || null;
    if (!SG || !SG.groundworkSlabs) return;
    var gw = SG.groundworkSlabs(list), n = 0, levels = {};
    for (var i = 0; i < list.length; i++) {
      if (gw[list[i].guid]) { list[i].phase = 'Substructure'; n++; levels[list[i].storey || '_'] = 1; }
    }
    if (n) console.log('§GROUNDWORK_SLAB recipe=' + who + ' n=' + n +
      ' levels=' + JSON.stringify(Object.keys(levels)) +
      ' — slab-on-grade reclassified Substructure (bears on grade/piles/footings only, lowest Superstructure band)');
  }

  // ══ §TEMPLATE_INSTANTIATE (2026-08-25, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S69) ══
  // THE INVERSION. Until now the chain ran elements -> phases: computeSchedule placed elements, and
  // deriveZones CREATED phases afterwards by grouping the placed elements and taking each group's
  // min-start/max-end. A phase bar was an ENVELOPE over what the elements did, and an envelope
  // cannot constrain what drew it — which is why phase stacking could never be reined in (§S68: the
  // solver has no phase in it at all; `phaseTrade` is keyed by collapsePhase(el.STOREY)).
  //
  // This function runs phases -> elements. It reads viewer/rates/4D_template.json and EMITS the
  // task grid: one task per (phase x real level) the template declares, each priced by
  // duration_rule (per-trade work content, never the solve's span) and placed by dependencies
  // (FS+0 within a level, plus the §4D_BAND_MONOTONIC ladder across levels). Elements are then
  // ASSIGNED to tasks; they no longer define them.
  //
  // PURE + node-testable: no DB, no globals, no console side effects beyond the reports it returns.
  // `collapse` is passed in (ScheduleGate.collapsePhase composed with the §S18 merge map) so the
  // storey names here and the ones materializeZones writes can never diverge.
  //
  // Returns { tasks, edges, reports, totalDays } where a task is
  //   { id, phase, storey, level, sDays, eDays, days, guids, crewDays, bottleneck }
  // and an edge is { predId, succId, type, lagDays, kind } — kind 'within_level' | 'across_levels'.
  // EVERY edge's lag comes from the TEMPLATE, never from the dates it constrains.
  // §TPL_LEVEL_AXIS (2026-08-27) — `levelAxis` is the OPT-IN vertical-axis override. Omit it and
  // this function behaves EXACTLY as before: the level key is collapse(e.storey) and the level order
  // is `bandRank`. Supply { keyOf, rankOf } and the grid is keyed/ordered by that instead.
  // WHY IT EXISTS: e.storey reaching this function has already been rewritten by
  // _buildScheduleElements's assignStoreyByZ (line ~342), which replaces EVERY '_UNKNOWN' storey
  // with the nearest real storey NAME by median centre-Z — so deriveBandRanks's own '_UNKNOWN'
  // exclusion (schedule_gate.js:350) can never fire on this path: the bucket it guards is empty by
  // the time it looks. LevelDeriver (viewer/lib/level_deriver.js) answers the same question from the
  // FROZEN DB instead and is not exposed to that rewrite (see _deriverLevelAxis's header for the
  // read-path proof). Default stays the old path until the swap is deliberately flipped.
  function instantiateTemplate(elements, T, laborRates, shiftHours, bandRank, collapse, levelAxis) {
    laborRates = laborRates || {};
    var shiftSecs = (shiftHours > 0 ? shiftHours : (T.calendar && T.calendar.hours_per_shift) || 24) * 3600;
    var minDays = (T.duration_rule && T.duration_rule.min_days) || 1;
    collapse = collapse || function (x) { return x; };
    // Resolved ONCE. With levelAxis absent both of these are literally the expressions that were
    // inline here before, so the flag-off path is unchanged by construction, not by inspection.
    var keyOf = (levelAxis && levelAxis.keyOf) || function (el) { return collapse(el.storey); };
    var rankOf = (levelAxis && levelAxis.rankOf) || function (k) {
      return (bandRank && bandRank[k] != null) ? bandRank[k] : 1e9;
    };

    // (phase, storey) -> { secs per trade, guids }
    var cell = {}, storeySeen = {};
    for (var i = 0; i < elements.length; i++) {
      var e = elements[i], st = keyOf(e), ph = e.phase || '_UNPHASED';
      storeySeen[st] = 1;
      var k = ph + '||' + st, c = cell[k] || (cell[k] = { secs: {}, guids: [] });
      var tr = (e.resource && e.resource !== '_DEFAULT') ? e.resource : '_DEFAULT';
      c.secs[tr] = (c.secs[tr] || 0) + (e.installSecs || 0);
      c.guids.push(e.guid);
    }
    // levels bottom-up. bandRank is the SAME rank deriveBandRanks gives the movie, so "the level
    // below" means the same thing here as it does in the solver's own band gate.
    var levels = Object.keys(storeySeen).sort(function (a, b) {
      var ra = rankOf(a), rb = rankOf(b);
      return ra - rb || (a < b ? -1 : a > b ? 1 : 0);
    });

    // duration_rule: days = ceil( MAX over trades t of ( secs[t] / (shift * max_crews[t]) ) )
    function priceCell(c) {
      var d = 0, bott = null, any = 0;
      for (var t in c.secs) {
        if (t === '_DEFAULT') continue;
        any = 1;
        var cap = (laborRates[t] && laborRates[t].max_crews) || 1;
        var td = c.secs[t] / (shiftSecs * cap);
        if (td > d) { d = td; bott = t + '(' + cap + ')'; }
      }
      if (!any) { d = (c.secs._DEFAULT || 0) / shiftSecs; bott = '_DEFAULT(1)'; }
      return { crewDays: d, days: Math.max(minDays, Math.ceil(d)), bottleneck: bott };
    }

    // dependencies._ladder_rule — which phases chain to themselves one level down.
    var ladder = {};
    (T.dependencies.across_levels || []).forEach(function (ed) {
      if (ed.pred === ed.succ && ed.level_offset === 1) ladder[ed.pred] = ed;
    });
    var byId = {};
    T.phases.forEach(function (p) { byId[p.id] = p; });

    var tasks = [], edges = [], reports = [], taskAt = {}, totalDays = 0;
    levels.forEach(function (lv, li) {
      var prevOnLevel = null;   // for the BRIDGED within-level chain (_empty_phase_rule)
      var cursor = 0;
      T.phases.forEach(function (p) {
        // _edge_scope_rule: a building-scope phase instantiates ONCE, on the lowest level. But its
        // ELEMENTS must all come with it — an element of a building-scope phase that happens to sit
        // on an upper storey belongs to that single task, it is not dropped. Silently losing it is
        // exactly the failure class this lane exists to kill: MEASURED on Hospital before this
        // guard, 1 of 63,182 elements reached no task at all (a Substructure element above the
        // lowest level — §GROUNDWORK_SLAB reclassifies slab-on-grade by geometry, not by storey).
        var k, c;
        if (p.scope === 'building') {
          if (li > 0) return;                       // emitted once, on the lowest level
          c = { secs: {}, guids: [] };
          levels.forEach(function (anyLv) {
            var cc = cell[p.name + '||' + anyLv];
            if (!cc) return;
            for (var tr in cc.secs) c.secs[tr] = (c.secs[tr] || 0) + cc.secs[tr];
            c.guids = c.guids.concat(cc.guids);
          });
          k = p.name + '||' + lv;
          cell[k] = c;                              // so the levelling pass prices the merged cell
        } else {
          k = p.name + '||' + lv; c = cell[k];
        }
        if (!c || !c.guids.length) {
          reports.push({ kind: 'phase_absent_on_level', phase: p.name, level: lv, why: 'no elements classify here' });
          return;                                   // chain BRIDGES: prevOnLevel is left untouched
        }
        var pr = priceCell(c);
        var start = cursor;
        // across_levels: the §4D_BAND_MONOTONIC ladder — this phase on the level below.
        if (ladder[p.id] && li > 0) {
          var below = taskAt[p.name + '||' + levels[li - 1]];
          if (below) {
            var need = below.eDays + (ladder[p.id].lag_days || 0);
            if (need > start) start = need;
          }
        }
        var t = {
          id: 'TASK_' + _slug(p.name) + '_' + _slug(lv),
          phase: p.name, storey: lv, level: li, phaseId: p.id,
          sDays: start, eDays: start + pr.days, days: pr.days,
          crewDays: pr.crewDays, bottleneck: pr.bottleneck, guids: c.guids
        };
        tasks.push(t); taskAt[k] = t;
        if (t.eDays > totalDays) totalDays = t.eDays;
        cursor = t.eDays;
        // within_level edge, from the last phase that ACTUALLY instantiated on this level.
        if (prevOnLevel) {
          var wl = (T.dependencies.within_level || []).filter(function (ed) { return ed.succ === p.id; })[0];
          edges.push({ predId: prevOnLevel.id, succId: t.id, type: (wl && wl.type) || 'FS',
                       lagDays: wl ? (wl.lag_days || 0) : 0, kind: 'within_level' });
        }
        if (ladder[p.id] && li > 0) {
          var b2 = taskAt[p.name + '||' + levels[li - 1]];
          if (b2) edges.push({ predId: b2.id, succId: t.id, type: ladder[p.id].type || 'FS',
                               lagDays: ladder[p.id].lag_days || 0, kind: 'across_levels' });
        }
        prevOnLevel = t;
      });
    });
    // ── capacity_rule LEVELLING ────────────────────────────────────────────────────────────
    // The ladder forbids a phase overtaking ITSELF up the building. It does NOT stop two DIFFERENT
    // phases that share a crew pool from running at once on different levels: MEP Rough-in on
    // level 5 and MEP Final on level 2 both consume PLUMBER. MEASURED on Hospital (63,182 elements,
    // 8 levels, 2026-08-25): logic dates alone give PLUMBER peak 3.26 crews against a cap of 2
    // (1.63x). HHS and Duplex are clean at 3-4 levels; it takes a tall building to expose it.
    //
    // So the template's own capacity_rule ("at no instant may more than max_crews[t] elements of
    // trade t be in progress") is applied here as ordinary resource levelling: walk the tasks in
    // topological order, delay each to the earliest day its whole span fits inside every trade's
    // remaining capacity, then push its successors out by the declared lag. Delay-only, so the
    // graph stays acyclic and every dependency the logic pass established still holds.
    //
    // A task's demand for trade t is its own seconds of t spread over its own duration:
    // secs_t / (shift * days) crews, held for every day of the span. That is the same average-crew
    // model duration_rule prices with, not a second one.
    var succOf = {}, indeg = {};
    tasks.forEach(function (t) { indeg[t.id] = 0; });
    edges.forEach(function (e) {
      (succOf[e.predId] = succOf[e.predId] || []).push(e);
      indeg[e.succId] = (indeg[e.succId] || 0) + 1;
    });
    var byIdT = {}; tasks.forEach(function (t) { byIdT[t.id] = t; });
    // Kahn order; ties by (logic start, level, template phase order) so the result is deterministic.
    var phaseOrder = {}; T.phases.forEach(function (p, i) { phaseOrder[p.name] = i; });
    function rank(t) { return [t.sDays, t.level, phaseOrder[t.phase] != null ? phaseOrder[t.phase] : 99]; }
    var ready = tasks.filter(function (t) { return !indeg[t.id]; });
    var topo = [], deg = {};
    for (var ti in indeg) deg[ti] = indeg[ti];
    while (ready.length) {
      ready.sort(function (a, b) {
        var ra = rank(a), rb = rank(b);
        return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2] || (a.id < b.id ? -1 : 1);
      });
      var cur = ready.shift();
      topo.push(cur);
      (succOf[cur.id] || []).forEach(function (e) {
        if (--deg[e.succId] === 0) ready.push(byIdT[e.succId]);
      });
    }
    if (topo.length !== tasks.length) topo = tasks.slice().sort(function (a, b) { return a.sDays - b.sDays; });

    var demand = {};                       // trade -> day -> crews committed
    function taskTradeCrews(t) {
      var c = cell[t.phase + '||' + t.storey], out = {};
      if (!c) return out;
      for (var tr in c.secs) {
        if (tr === '_DEFAULT') continue;
        out[tr] = c.secs[tr] / (shiftSecs * Math.max(1, t.days));
      }
      return out;
    }
    function fits(t, at) {
      var need = taskTradeCrews(t);
      for (var tr in need) {
        var cap = (laborRates[tr] && laborRates[tr].max_crews) || 1;
        for (var d = at; d < at + t.days; d++)
          if (((demand[tr] && demand[tr][d]) || 0) + need[tr] > cap + 1e-9) return false;
      }
      return true;
    }
    var levelled = 0, levelledDays = 0, LEVEL_SCAN_MAX = 100000;
    topo.forEach(function (t) {
      var at = t.sDays, guard = 0;
      while (!fits(t, at) && guard++ < LEVEL_SCAN_MAX) at++;
      if (at > t.sDays) { levelled++; levelledDays += at - t.sDays; }
      var shift = at - t.sDays;
      t.sDays = at; t.eDays = at + t.days;
      var need = taskTradeCrews(t);
      for (var tr in need) {
        var dd = demand[tr] || (demand[tr] = {});
        for (var d = t.sDays; d < t.eDays; d++) dd[d] = (dd[d] || 0) + need[tr];
      }
      if (t.eDays > totalDays) totalDays = t.eDays;
      // push successors out so every declared edge still holds after the delay
      (succOf[t.id] || []).forEach(function (e) {
        var st = byIdT[e.succId];
        var min = t.eDays + (e.lagDays || 0);
        if (st && st.sDays < min) { st.eDays = min + st.days; st.sDays = min; }
      });
    });
    if (levelled) reports.push({ kind: 'capacity_levelled', tasksDelayed: levelled, totalDaysAdded: levelledDays });

    // ORPHANS — an element whose phase the template does not declare lands in NO task and would
    // vanish from the Gantt silently. That is the exact failure class this whole lane exists to
    // kill, so it is counted and named, never dropped. MEASURED on Hospital: 1 of 63,182.
    var declared = {}; T.phases.forEach(function (p) { declared[p.name] = 1; });
    var orphanBy = {}, orphanN = 0;
    for (var oi = 0; oi < elements.length; oi++) {
      var oe = elements[oi], oph = oe.phase || '_UNPHASED';
      if (declared[oph]) continue;
      orphanN++;
      var ok2 = oph + '|' + oe.cls;
      orphanBy[ok2] = (orphanBy[ok2] || 0) + 1;
    }
    if (orphanN) reports.push({ kind: 'elements_orphaned', count: orphanN, byPhaseClass: orphanBy });

    // A phase the template declares that never instantiated ANYWHERE is reported once, loudly —
    // 4D_template.json's own instantiation rule: "REPORTS (never silently drops)".
    T.phases.forEach(function (p) {
      if (!tasks.some(function (t) { return t.phase === p.name; }))
        reports.push({ kind: 'phase_absent_everywhere', phase: p.name, level: null,
                       why: p._empty_ok ? 'declared _empty_ok' : 'NOT marked _empty_ok' });
    });
    return { tasks: tasks, edges: edges, reports: reports, totalDays: totalDays, levels: levels };
  }

  // materializeZones(db, rules, opts) — CPM_FLOAT_GAP.md Gap 1 (element-level, rolled up): the
  // DETAIL-granularity sibling of materializeDefault. Where materializeDefault gives 5 coarse phase
  // tasks, this persists one task per (phase × real floor) ZONE — built from
  // ScheduleGate.computeSchedule's already-proven per-element real start/end times (the SAME numbers
  // the live Time Machine movie plays, so the detail Gantt/CPM view and the movie can never tell a
  // different story) and ScheduleGate.deriveZones' structurally-DAG-safe edges (see that function's
  // header — every edge traces to an OBSERVED pair of real start times, nothing re-simulated or
  // invented). Writes to the SAME SCH_AUTHORED schedule_id as materializeDefault (idempotent
  // rebuild) — this is an ALTERNATIVE detail view of the one generated schedule, not a second,
  // competing one. Movie stays instant/zero-friction (schedule_gate.js's live fallback, untouched);
  // this is the on-demand "for the minority who want to drill in" detail path.
  function materializeZones(db, rules, opts) {
    opts = opts || {};
    var schedId = opts.scheduleId || 'SCH_AUTHORED';
    var start = opts.start || '2026-01-01';
    var SG = opts.scheduleGate || global.ScheduleGate;
    if (!SG || !SG.computeSchedule || !SG.deriveZones) {
      console.log('§AUTHOR_ZONES_FAIL reason=ScheduleGate_not_loaded');
      return { ok: false, reason: 'no_schedule_gate' };
    }
    var elements = _buildScheduleElements(db, rules, opts);
    if (!elements.length) { console.log('§AUTHOR_ZONES_FAIL reason=no_elements'); return { ok: false, reason: 'no_elements' }; }

    var laborRates = opts.laborRates || (global.LABOR_RATES) || {};
    var maxCrews = {};
    for (var res in laborRates) if (laborRates[res].max_crews) maxCrews[res] = laborRates[res].max_crews;
    // §GANTT_SHIFT_HOURS_DESYNC (4D_SCHEDULE_PERFECTION.md) — this call used to omit shiftHours,
    // silently taking computeSchedule's internal 8h/day default while the real canvas movie
    // (time_machine.js injectGantt) runs at rates.js SHIFT_HOURS (default 24). Gantt bars were
    // authored 3x slower than the canvas actually plays, so elements visibly appear before their
    // own bar starts. opts.shiftHours undefined leaves computeSchedule's own 8h default untouched
    // (witnesses/probes that never pass it stay byte-identical) — only callers that pass it (the
    // real UI paths, below) change.
    var schedule = SG.computeSchedule(elements, 0, 1, maxCrews, opts.shiftHours);
    // §ZONE_DISPLAY_AUTHORING (2026-08-16, 4D_SCHEDULE_PERFECTION.md §CHASE_TO_ZERO_WINDOW_AUTHORING):
    // the movie plays the DISPLAY timeline (time_machine's two-tier remap + midair repair over this
    // raw schedule), but task windows were authored from the RAW schedule — two different schedules,
    // measured live 2026-08-16 (Hospital: display span 420d vs windows 334d; the captured overlay
    // then manufactured 2211 violations from a 0-floating input). opts.displayRemap — supplied by
    // time_machine at the real UI call sites, so the remap physics stays single-source there — maps
    // (elements, rawSchedule) -> the display schedule; windows derived from it describe the SAME
    // timeline the movie plays. Callers that omit it (probes/witnesses/legacy) stay byte-identical.
    var _displayAuthored = 0;
    if (typeof opts.displayRemap === 'function') {
      try {
        var _dr = opts.displayRemap(elements, schedule);
        if (_dr) {
          schedule = _dr; _displayAuthored = 1;
          console.log('§ZONE_DISPLAY_AUTHORING task windows derived from the DISPLAY timeline (n=' + Object.keys(_dr).length + ')');
        }
      } catch (e) { console.log('§ZONE_DISPLAY_AUTHORING_FAIL ' + e.message + ' — raw-schedule windows kept'); }
    }
    // §S18 (2026-08-17, prompts/4D_GANTT_TM_REFACTOR.md Part B): storey-band merge, sourced from
    // spatial_structure's EXTRACTED IfcBuildingStorey.Elevation when the loaded DB carries it (older
    // shipped DBs, not yet regenerated with the fixed extractor, simply lack the `elevation` column —
    // the query throws, storeyMergeMap stays null, deriveZones falls back to its pre-§S18 behavior
    // byte-identically; no building regresses for not having been regenerated yet).
    var storeyMergeMap = null;
    if (SG.deriveStoreyMergeMap) {
      try {
        var _ssRes = db.exec("SELECT type,name,elevation FROM spatial_structure WHERE type='IfcBuildingStorey' AND elevation IS NOT NULL");
        if (_ssRes.length) {
          var _ssCols = _ssRes[0].columns, _tI = _ssCols.indexOf('type'), _nI = _ssCols.indexOf('name'), _eI = _ssCols.indexOf('elevation');
          var _ssRows = _ssRes[0].values.map(function (v) { return { type: v[_tI], name: v[_nI], elevation: v[_eI] }; });
          storeyMergeMap = SG.deriveStoreyMergeMap(_ssRows);
          var _mergedN = 0;
          for (var _mk in storeyMergeMap) if (storeyMergeMap[_mk] !== _mk) _mergedN++;
          console.log('§S18_STOREY_MERGE names=' + Object.keys(storeyMergeMap).length + ' merged=' + _mergedN);
        }
      } catch (e) { console.log('§S18_STOREY_MERGE_FAIL ' + e.message + ' — no elevation data, bands unmerged'); }
    }
    // §TEMPLATE_INSTANTIATE — when a template is supplied, the TASK GRID comes from it and the
    // solve is no longer what defines the phases (see instantiateTemplate's header). The legacy
    // grouping path below is left byte-identical for every caller that passes no template.
    //
    // §TPL_MODEL (2026-08-27, bim-compiler prompts/4D_MODEL_INTEGRITY.md §L) — NAME WHICH OF THE
    // TWO MODELS RAN, on BOTH branches. The 2026-08-27 user ruling makes the template path the
    // CANONICAL model and deriveZones dead code, so this fork is no longer a graceful degrade: it
    // is the difference between the model of record and a model nobody stands behind. It used to
    // be SILENT, which is the exact defect class this lane keeps paying for — every downstream
    // number was unattributable to a construct, and `witness_gantt_edit_coherence` passed 10/0
    // while judging the legacy path (its materializeZones call passes no `template:`).
    // PRIMAL LAW clause 4: a pass that cannot report that it took the dead branch is not a pass.
    //
    // ⚠ BOTH BRANCHES LOG ON console.log, AND THAT IS LOAD-BEARING (§I.5j(b), fixed 2026-08-27).
    // The dead branch used to emit on console.warn while the canonical one used console.log. Every
    // §-collecting witness in this repo filters the LOG stream, and
    // witness_4d_template_instantiation.js additionally installed `console.warn = () => {}` — so
    // the one line that says "the dead model ran" was emitted and then deleted before any collector
    // saw it. MEASURED before the fix (viewer/tests/probe_tpl_model_stream.js, Duplex):
    // canonical-branch-visible=YES, legacy-branch-visible=NO, on a run where the legacy branch
    // provably executed. A §-tag was not enough: which STREAM a line used decided whether the
    // witness could see it. Do not "restore" the warn stream for emphasis — emphasis that a witness
    // cannot read is not observability, it is decoration (PRIMAL LAW clause 3).
    if (opts.template) {
      var _tv = (opts.template.meta && opts.template.meta.version) || '?';
      console.log('§TPL_MODEL model=template v=' + _tv +
        ' — CANONICAL: the task grid is DECLARED by 4D_template.json');
      return _writeTemplateSchedule(db, elements, schedule, opts, SG,
        storeyMergeMap, laborRates, schedId, start, _displayAuthored);
    }
    console.log('§TPL_MODEL model=legacy-deriveZones — ⛔ the CANONICAL template path did NOT ' +
      'run (opts.template absent). Phases become an ENVELOPE over what the elements did, and an ' +
      'envelope cannot constrain what drew it. Every number from this schedule is off-model.');

    var rolled = SG.deriveZones(elements, schedule, storeyMergeMap);
    if (!rolled.zones.length) { console.log('§AUTHOR_ZONES_FAIL reason=no_zones'); return { ok: false, reason: 'no_zones' }; }

    _ensureSchedulesGenVersion(db);
    _ensureSchedulesDisplayAuthored(db);
    _ensureWideTasks(db);
    db.run('CREATE TABLE IF NOT EXISTS task_elements (task_id TEXT, guid TEXT, PRIMARY KEY (task_id, guid))');
    db.run('CREATE TABLE IF NOT EXISTS task_sequences (predecessor_id TEXT, successor_id TEXT, sequence_type TEXT, lag_days REAL DEFAULT 0, PRIMARY KEY (predecessor_id, successor_id))');

    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM task_elements WHERE task_id IN (SELECT task_id FROM tasks WHERE schedule_id=?)', [schedId]);
    db.run('DELETE FROM task_sequences WHERE predecessor_id IN (SELECT task_id FROM tasks WHERE schedule_id=?) OR successor_id IN (SELECT task_id FROM tasks WHERE schedule_id=?)', [schedId, schedId]);
    db.run('DELETE FROM tasks WHERE schedule_id=?', [schedId]);
    db.run('DELETE FROM schedules WHERE schedule_id=?', [schedId]);
    db.run('INSERT INTO schedules (schedule_id,name,status,created_date,gen_version,display_authored) VALUES (?,?,?,?,?,?)',
      [schedId, 'Authored Schedule (zone detail)', 'PLANNED', start, opts.genVersion != null ? opts.genVersion : null, _displayAuthored]);

    var rootId = 'TASK_ROOT';
    var minStart = Math.min.apply(null, rolled.zones.map(function (z) { return z.start; }));
    var maxEnd = Math.max.apply(null, rolled.zones.map(function (z) { return z.end; }));
    var totalDays = Math.max(1, Math.round((maxEnd - minStart) / 86400000));
    db.run('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [rootId, schedId, null, 'Project', 'CONSTRUCTION', 1, start, _addDays(start, totalDays), 'P' + totalDays + 'D', null, 'PLANNED']);

    var stmtTk = db.prepare('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    var stmtTe = db.prepare('INSERT OR IGNORE INTO task_elements VALUES (?,?)');
    // §ZONE_WINDOW_COVERS_WORK — lookup + shift length for the per-zone work-content floor below.
    // opts.shiftHours mirrors computeSchedule's own default (8) when a caller omits it, so probes
    // and legacy callers stay byte-identical.
    var _elByGuid = {};
    for (var _ei = 0; _ei < elements.length; _ei++) _elByGuid[elements[_ei].guid] = elements[_ei];
    var _shiftMs = (opts.shiftHours > 0 ? opts.shiftHours : 8) * 3600 * 1000;
    var _workWidened = 0, _workWidenedDays = 0;

    var zoneTaskId = {}, zoneDays = {};
    rolled.zones.forEach(function (z) {
      var tid = 'TASK_' + _slug(z.phase) + '_' + _slug(z.storey);
      zoneTaskId[z.id] = tid;
      // §ZONE_ENVELOPE_DAYS (2026-08-16, bim-compiler prompts/4D_SCHEDULE_ARCHITECTURE_REDESIGN.md
      // §STAGE4 step 1): a display-authored window is the day-grid ENVELOPE of its own display
      // times (floor start, ceil end) — the bar then BOUNDS what plays, so the Gantt needle is the
      // truth of appearance with no sub-day protrusion. Raw-authored schedules keep Math.round
      // (byte-identical legacy behavior).
      var sDays, eDays;
      if (_displayAuthored) {
        sDays = Math.floor((z.start - minStart) / 86400000);
        eDays = Math.ceil((z.end - minStart) / 86400000);
      } else {
        sDays = Math.round((z.start - minStart) / 86400000);
        eDays = Math.round((z.end - minStart) / 86400000);
      }
      if (eDays <= sDays) eDays = sDays + 1;
      // §ZONE_WINDOW_COVERS_WORK (2026-08-25, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S65
      // STAGE 3 follow-up — Witness: witness_gantt_bar_is_its_task.js G-BAR-WORK).
      // The rounding above derives a window from the SOLVE'S SPAN alone, so a zone whose elements
      // happen to be solved into a tight cluster gets a window shorter than its own members' work
      // — and the Gantt then draws a bar that cannot physically contain what it represents.
      // MEASURED across Duplex/Clinic/JKR/HHS_Office_Federated (135 zone tasks): 5 were
      // over-committed, worst JKR "MEP Final — 02 1st Floor Level" at 1.744 crew-days inside a
      // 1.00-day window (74% over), then Clinic "Finishes — Level 1" 1.333 (33%), JKR "MEP Rough-in
      // — 03 Water Tank Floor Level" 3.405 in 3.00 (14%), Clinic "Substructure — TOF Footing" 1.074
      // (7%), HHS "MEP Rough-in — Level 2" 9.508 in 9.00 (6%).
      //
      // NOT a blanket widening, and NOT a new duration model: crew-days come from the elements'
      // OWN already-computed installSecs (set by _installSecs in _buildScheduleElements) over the
      // same per-trade max_crews the solve itself used. A zone whose window already covers its work
      // is untouched — 130 of the 135 above. Nothing is invented; this only refuses to author a
      // window that its own contents cannot fit in.
      //
      // Deliberately a FLOOR, not a re-derivation: the solve's span still sets the window whenever
      // it is the larger of the two, so dead-air/gap behaviour and every zone that was already
      // honest stay byte-identical. Replacing the span rule outright is the separate, larger
      // §CPM_GENERATOR_UPSTREAM_SPEC item.
      var _wSecs = 0, _wTrades = {};
      for (var _gi = 0; _gi < z.guids.length; _gi++) {
        var _we = _elByGuid[z.guids[_gi]];
        if (!_we) continue;
        _wSecs += _we.installSecs || 0;
        // per-trade seconds, not a presence marker — the divisor is per trade now (see below).
        if (_we.resource && _we.resource !== '_DEFAULT')
          _wTrades[_we.resource] = (_wTrades[_we.resource] || 0) + (_we.installSecs || 0);
      }
      // §CREW_DIVISOR_PER_TRADE (2026-08-25, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S67 —
      // viewer/rates/4D_template.json duration_rule.divisor_scope, gated by
      // witness_4d_template.js `duration-divisor-is-per-trade`).
      // This used to divide the zone's TOTAL seconds by the SUM of its trades' max_crews, which
      // treats trades as FUNGIBLE — an electrician's seconds worked off by a plumber's crew. A zone
      // is as long as its SLOWEST TRADE. MEASURED on HHS_Office_Federated (2026-08-25, 24h shift):
      // whole-programme sum-of-crews 40.1d vs correct per-trade 69.8d (1.74x), and 3.00x on MEP
      // Rough-in alone (3 trades, Sum(max_crews)=6, no single trade above 2). The sum form let a
      // window pass this floor while still being shorter than the work one trade actually has to do
      // in it. Still a FLOOR and still per-trade only over the trades this zone's OWN elements use.
      var _crewDays = 0, _wAnyTrade = 0;
      for (var _wt in _wTrades) {
        _wAnyTrade = 1;
        var _wCap = (laborRates[_wt] && laborRates[_wt].max_crews) || 1;
        var _wd = (_wTrades[_wt] * 1000) / (_shiftMs * _wCap);
        if (_wd > _crewDays) _crewDays = _wd;
      }
      // A zone whose elements are ALL '_DEFAULT' (no named trade) names no crew to divide by. The
      // sum form fell back to _wCrews=1 there; keep that exact behaviour rather than silently
      // dropping the floor to zero for those zones.
      if (!_wAnyTrade) _crewDays = (_wSecs * 1000) / _shiftMs;
      var _needDays = Math.ceil(_crewDays);
      if (eDays - sDays < _needDays) {
        _workWidened++;
        _workWidenedDays += _needDays - (eDays - sDays);
        eDays = sDays + _needDays;
      }
      // §ZONE_EDGE_LEAD: remember the ROUNDED day numbers actually written. The edge lags below are
      // derived from these, not re-rounded independently from raw ms — rounding dates and lags
      // separately let the two disagree by a day, which showed up as 53 self-violated edges on
      // Terminal even once the negative-lag fix was in.
      zoneDays[z.id] = { s: sDays, e: eDays };
      var s = _addDays(start, sDays), f = _addDays(start, eDays);
      stmtTk.run([tid, schedId, rootId, z.phase + ' — ' + z.storey, 'CONSTRUCTION', 0, s, f, 'P' + (eDays - sDays) + 'D', null, 'PLANNED']);
      z.guids.forEach(function (g) { stmtTe.run([tid, g]); });
    });
    stmtTk.free(); stmtTe.free();
    console.log('§ZONE_WINDOW_COVERS_WORK zones=' + rolled.zones.length + ' widened=' + _workWidened +
      ' addedDays=' + _workWidenedDays + ' (a widened zone had a window shorter than its own ' +
      'members\' crew-days; 0 = every zone window already covered its work)');

    var stmtSeq = db.prepare('INSERT OR IGNORE INTO task_sequences VALUES (?,?,?,?)');
    var edgeN = 0;
    rolled.edges.forEach(function (e) {
      var p = zoneTaskId[e.predId], s = zoneTaskId[e.succId]; if (!p || !s || p === s) return;
      // FS lag straight off the persisted day numbers → succ.start = pred.finish + lag EXACTLY.
      // Negative values are real leads (P6's "FS-5d"), not errors: overlapping zones are how real
      // crews work, and clamping them to 0 is what made the graph contradict its own dates.
      var pd = zoneDays[e.predId], sd = zoneDays[e.succId];
      var lagDays = (pd && sd) ? (sd.s - pd.e) : Math.round(e.lagMs / 86400000);
      stmtSeq.run([p, s, 'FS', lagDays]);
      edgeN++;
    });
    stmtSeq.free();
    db.run('COMMIT');

    console.log('§AUTHOR_ZONES schedule=' + schedId + ' zones=' + rolled.zones.length + ' edges=' + edgeN +
      ' elements=' + elements.length + ' totalDays=' + totalDays);
    return { ok: true, scheduleId: schedId, zoneCount: rolled.zones.length, edgeCount: edgeN, totalDays: totalDays };
  }

  // ══ §TPL_MOVIE_BINDS_BARS (2026-08-25, bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S70) ══
  // THE SECOND HALF OF THE INVERSION, and without it the first half is a REGRESSION.
  //
  // The legacy bars were ENVELOPES over the element solve, so an element was inside its own bar by
  // construction: MEASURED 98.9% Hospital / 95.2% Terminal / 86.8% Duplex, worst offset 0.5 days
  // (pure day-rounding). Emitting bars from the template instead makes the bar an INDEPENDENT
  // statement — and the two timelines then disagree wildly: 54.5% / 35.4% / 18.8% inside, worst
  // offset 274.3 days on Hospital, 81.1% of Duplex's elements appearing BEFORE their own bar.
  // That is the user's reported hell — things appearing when no bar says they should — made worse,
  // not better. So the movie must be bound to the bars.
  //
  // THE MAP: per task, an order-preserving affine map of that task's own solve envelope
  // [minStart, maxEnd] onto its authored window [s, e]. Monotone, so EVERY ordering the solve
  // established survives it — support-before-supported, host-before-hosted, band monotonicity are
  // all preserved exactly, because a monotone map cannot swap two times. Relative widths survive
  // too (uniform scale within a task), so nothing collapses to zero that was not already tiny.
  // A degenerate task (every element solved at the same instant — the "zero minute stacking"
  // shape) is spread EVENLY across its window instead, which is the one case an affine map cannot
  // handle and the one case the user reported by name.
  //
  // This is the same seam §ZONE_DISPLAY_AUTHORING used, run the other way: that authored windows
  // FROM the display timeline; this authors the display timeline FROM the windows. Only one of the
  // two can be the source, and after §S68 it is the template.
  // §TPL_LAYER_ORDER (2026-08-26) — inside a task, lay elements out in SUPPORT ORDER, not in the
  // order the geometry solve happened to place them. Measured cause: at DAY 0 the Superstructure
  // task spread its members by solve time, so a beam could be laid before the column carrying it —
  // Duplex 4 unsupported at HR 3, Terminal 61. The task WINDOW is already priced by duration_rule;
  // what was missing was order WITHIN it. layerOf[guid] is the topological layer of the bearing
  // relation, computed once from the SHIPPED contact graph (never re-derived — 4D_BAR_MODEL.md
  // §10.1 rule 1). Layer 0 is everything resting on ground or on nothing; layer n rests on layer
  // n-1. Ties break on guid so the result is deterministic.
  function remapSolveToTasks(solve, tasks, startISO, layerOf) {
    var base = Date.parse(startISO || '2026-01-01');
    var out = {}, degenerate = 0, mapped = 0;
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i], g, st;
      var wS = base + t.sDays * 86400000, wE = base + t.eDays * 86400000;
      var lo = Infinity, hi = -Infinity, have = 0;
      for (var j = 0; j < t.guids.length; j++) {
        st = solve[t.guids[j]]; if (!st) continue;
        have++;
        if (st.start < lo) lo = st.start;
        if (st.end > hi) hi = st.end;
      }
      if (!have) continue;
      var span = hi - lo;
      // ONE RULE for every task, degenerate or not (§TPL_LAYER_ORDER). The old code had two: an
      // even spread when the solve collapsed to an instant, and an affine replay of solve times
      // otherwise. The affine branch is what carried solve-order — and therefore support-order
      // violations — into the window. Support order is the only order a task's contents have.
      // Bucket the task's own members by support layer, then give each layer a CONTIGUOUS,
      // NON-OVERLAPPING band of the window sized by its member count. Inside a band the solve's
      // relative order is preserved (affine, as before) — the crew-leveling the solve did is real
      // and is kept. What changes is that layer n+1 cannot begin before layer n's band ends, so a
      // beam can never precede the column carrying it. Replacing the solve outright was tried and
      // measured WORSE (Hospital 0 -> 2 unsupported at DAY 0 HR 3): the even spread discarded the
      // crew-leveling. Clamp, do not replace.
      var mine = t.guids.filter(function (x) { return solve[x]; });
      if (span <= 0) degenerate++;
      var byLayer = {}, layers = [];
      for (var k = 0; k < mine.length; k++) {
        var lk = (layerOf && layerOf[mine[k]] != null) ? layerOf[mine[k]] : 0;
        if (!byLayer[lk]) { byLayer[lk] = []; layers.push(lk); }
        byLayer[lk].push(mine[k]);
      }
      layers.sort(function (a, b) { return a - b; });
      var cursor = wS, total = mine.length;
      for (var li = 0; li < layers.length; li++) {
        var grp = byLayer[layers[li]];
        var bandW = (wE - wS) * (grp.length / Math.max(1, total));
        var bS = cursor, bE = (li === layers.length - 1) ? wE : Math.min(wE, cursor + bandW);
        if (bE <= bS) bE = bS + 1;
        var glo = Infinity, ghi = -Infinity;
        for (var q2 = 0; q2 < grp.length; q2++) {
          var stq = solve[grp[q2]];
          if (stq.start < glo) glo = stq.start;
          if (stq.end > ghi) ghi = stq.end;
        }
        var gspan = ghi - glo, gscale = gspan > 0 ? (bE - bS) / gspan : 0;
        var gstep = (bE - bS) / Math.max(1, grp.length);
        for (var q3 = 0; q3 < grp.length; q3++) {
          var gg = grp[q3], sq = solve[gg], ns2, ne2;
          if (gspan > 0) {
            ns2 = Math.round(bS + (sq.start - glo) * gscale);
            ne2 = Math.round(bS + (sq.end - glo) * gscale);
          } else {                                  // degenerate layer: deterministic even spread
            ns2 = Math.round(bS + q3 * gstep); ne2 = Math.round(bS + (q3 + 1) * gstep);
          }
          if (ne2 <= ns2) ne2 = ns2 + 1;            // never a zero-width element
          if (ne2 > bE) ne2 = Math.round(bE);
          out[gg] = { start: ns2, end: ne2 };
          mapped++;
        }
        cursor = bE;
      }
    }
    return { schedule: out, mapped: mapped, degenerateTasks: degenerate };
  }

  // ══ §TPL_LEVEL_AXIS — the LevelDeriver vertical axis for the task grid (2026-08-27) ═══════════
  // Implementing bim-compiler prompts/4D_MODEL_INTEGRITY.md §I.3 — Witness: §TPL_LEVEL_DISAGREE
  //
  // THE READ-PATH PROOF (verified 2026-08-27, the reason this swap REMOVES the defect instead of
  // relocating it). assignStoreyByZ (line ~342) is a PURE LOCAL function: it returns a string that
  // is stored only into the in-memory element literal's `storey:` field (line ~368). It issues no
  // db.run and no UPDATE — `elements_meta.storey` on disk is never touched by it (the only writers
  // of that column repo-wide are wizard_storeys.js, i.e. a deliberate user authoring act, and the
  // importers). LevelDeriver.readLookups reads `SELECT guid, storey FROM elements_meta` STRAIGHT
  // FROM THE FROZEN DB (level_deriver.js:67) and LevelDeriver.levelFor consumes only guid/base_z/
  // top_z off the element object — it never reads el.storey. So the '_UNKNOWN' guard at
  // level_deriver.js:178 sees the UNREWRITTEN value and actually fires, where the structurally
  // identical guard in deriveBandRanks (schedule_gate.js:350) is dead code on this path.
  //
  // Returns { keyOf, rankOf, stats } for instantiateTemplate, or null (caller keeps the OLD path —
  // never a silent half-swap).
  function _deriverLevelAxis(db, elements, collapse, storeyMergeMap, label) {
    var LD = (global && global.LevelDeriver) ||
             (typeof globalThis !== 'undefined' && globalThis.LevelDeriver) ||
             (typeof window !== 'undefined' && window.LevelDeriver) || null;
    // NODE ONLY: the browser already loads lib/level_deriver.js via a <script> tag (viewer.html
    // ~line 940) so LD is on window there. Under node a witness/probe that never required it would
    // otherwise get a SILENT fallback to the old axis — which is exactly how the first flag-on run
    // of the shipped witnesses came back byte-identical and looked like "no change" (2026-08-27).
    // Resolving it here makes the module self-sufficient instead of trusting every caller to know.
    if ((!LD || !LD.readLookups) && typeof require === 'function' && typeof __dirname !== 'undefined') {
      try { LD = require(__dirname + '/lib/level_deriver.js'); } catch (e) {
        console.log('§TPL_LEVEL_AXIS_REQUIRE_FAIL ' + ((e && e.message) || e));
      }
    }
    if (!LD || !LD.readLookups) {
      console.log('§TPL_LEVEL_AXIS_UNAVAILABLE label=' + label + ' — LevelDeriver not loaded; the task ' +
        'grid STAYS on collapse(e.storey). Reported, not silently degraded (§S32.4 stop-and-report).');
      return null;
    }
    var L = LD.readLookups(db);
    var G = LD.buildGrid(L, elements);
    G.medGap = LD.medianGap(G.grid);

    // grid index -> a REAL declared storey name where that grid line carries one (so the Gantt keeps
    // human floor names), else 'L<idx>' — location_axis.js's own convention for a derived level.
    // Names are collapse()'d and merge-mapped exactly like the old axis, so a level the two axes
    // AGREE on carries byte-identical text and the disagreement count below measures real
    // disagreement, not a renaming.
    var nameAt = {}, taken = {}, keyAt = {};
    Object.keys(L.storeyNameCenterZ).forEach(function (nm) {
      var z = L.storeyNameCenterZ[nm];
      if (!isFinite(z) || !G.grid.length) return;
      var i = LD.nearestIdx(G.grid, z);
      if (Math.abs(G.grid[i] - z) > 1e-6) return;          // that name is not on this grid line
      var c = collapse(nm);
      if (storeyMergeMap && storeyMergeMap[c]) c = storeyMergeMap[c];
      (nameAt[i] = nameAt[i] || []).push(c);
    });
    var collided = [];
    Object.keys(nameAt).map(Number).sort(function (a, b) { return a - b; }).forEach(function (i) {
      var cands = nameAt[i].slice().sort();
      for (var q = 0; q < cands.length; q++) {
        if (taken[cands[q]] == null) { keyAt[i] = cands[q]; taken[cands[q]] = i; break; }
      }
      // Every candidate name already belongs to a LOWER grid line — an ambiguous storey NAME sitting
      // at two elevations (LevelDeriver reports these as ambiguousNames; measured 0 on this fleet).
      // Keep the two levels DISTINCT rather than silently folding two floors into one task row.
      if (keyAt[i] == null) { keyAt[i] = 'L' + i; collided.push(i + '<-' + cands.join('/')); }
    });
    function keyForIdx(idx) {
      if (idx == null || idx < 0) return '_UNKNOWN';
      return keyAt[idx] != null ? keyAt[idx] : 'L' + idx;
    }

    var idxOf = {}, keyByGuid = {}, tier = { T1: 0, T2: 0, T3: 0, T4: 0 }, overridden = 0;
    var votes = {};
    for (var i2 = 0; i2 < elements.length; i2++) {
      var el = elements[i2];
      var r = LD.levelFor(el, L.rawStorey[el.guid], L, G);
      tier[r.tier] = (tier[r.tier] || 0) + 1;
      if (r.overridden) overridden++;
      var ix = (r.idx == null ? -1 : r.idx);
      idxOf[el.guid] = ix;
      // NAME VOTE (only used for grid lines that spatial_structure did not name — below). The vote
      // is cast from the RAW DB storey, never e.storey, so a name assignStoreyByZ invented cannot
      // win it. An element with no declared storey abstains; it has no name to contribute.
      var rs0 = L.rawStorey[el.guid];
      if (ix >= 0 && rs0 && rs0 !== '_UNKNOWN' && !/^unknown$/i.test(String(rs0))) {
        var cn = collapse(rs0);
        if (storeyMergeMap && storeyMergeMap[cn]) cn = storeyMergeMap[cn];
        (votes[ix] = votes[ix] || {})[cn] = ((votes[ix] || {})[cn] || 0) + 1;
      }
    }
    // §S34.1 measured: some buildings (Duplex, LTU_AHouse) carry storey NAMES on elements but no
    // IfcBuildingStorey.Elevation at all, so buildGrid falls back to a uniform grid and the loop
    // above named nothing. Rather than show the user "L0/L1/L2/L3" where the model plainly says
    // "T/FDN / Level 1 / Level 2 / Roof", label each unnamed grid line with the MOST COMMON declared
    // name among the elements that geometrically land on it. The level's IDENTITY stays geometric —
    // this only supplies its LABEL, and the label is extracted from the data, never invented.
    var voted = [];
    Object.keys(votes).map(Number).sort(function (a, b) { return a - b; }).forEach(function (ix2) {
      if (keyAt[ix2] != null) return;                       // spatial_structure already named it
      var v = votes[ix2];
      var best = Object.keys(v).sort(function (a, b) { return v[b] - v[a] || (a < b ? -1 : 1); })
        .filter(function (nm) { return taken[nm] == null; })[0];
      if (best == null) return;                             // every candidate belongs to a lower line
      keyAt[ix2] = best; taken[best] = ix2;
      voted.push(ix2 + '="' + best + '"(' + v[best] + '/' + Object.keys(v).reduce(function (s, k) { return s + v[k]; }, 0) + ')');
    });
    if (voted.length) console.log('§TPL_LEVEL_AXIS_NAMEVOTE label=' + label +
      ' gridLines spatial_structure did not name, labelled by plurality of the RAW declared storey of ' +
      'the elements on them: ' + voted.join(' '));
    // re-key now that late names exist
    for (var i4 = 0; i4 < elements.length; i4++) keyByGuid[elements[i4].guid] = keyForIdx(idxOf[elements[i4].guid]);
    // rank = the grid index itself. The grid is the DECLARED floor lines in ascending order, so the
    // index IS the floor order — no median-of-element-z election is needed to recover it (that
    // election is what §BIMEYES measured as manufacturing band inversions).
    var rank = {};
    Object.keys(keyAt).forEach(function (i3) { rank[keyAt[i3]] = Number(i3); });

    console.log('§TPL_LEVEL_AXIS label=' + label + ' source=LevelDeriver gridSource=' + G.source +
      ' k=' + G.grid.length + ' levels=' + JSON.stringify(Object.keys(rank).sort(function (a, b) { return rank[a] - rank[b]; })) +
      ' T1=' + tier.T1 + ' T2=' + tier.T2 + ' T3=' + tier.T3 + ' T4=' + tier.T4 +
      ' geometryOverrides=' + overridden +
      ' ambiguousNames=' + L.ambiguousNames.length +
      ' nameCollisions=' + (collided.length ? JSON.stringify(collided) : '0'));
    if (tier.T4) console.log('§TPL_LEVEL_AXIS_T4 label=' + label + ' n=' + tier.T4 +
      ' elements have non-finite geometry and NO declared storey — they key to _UNKNOWN and sort LAST. ' +
      'Counted, never defaulted onto a real floor (that defaulting is the defect this swap removes).');

    return {
      keyOf: function (el) { var k = keyByGuid[el.guid]; return k != null ? k : '_UNKNOWN'; },
      rankOf: function (k) { return rank[k] != null ? rank[k] : 1e9; },
      stats: { grid: G.grid, gridSource: G.source, tier: tier, overridden: overridden,
               rank: rank, keyByGuid: keyByGuid, rawStorey: L.rawStorey }
    };
  }

  // §TPL_LEVEL_DISAGREE — measure the two axes SIDE BY SIDE before trusting either (step 3 of the
  // 2026-08-27 task; the §STATUS instrument rule: a swap that is not measured is a guess). Prints
  // every element whose OLD key (collapse(assignStoreyByZ(...))) differs from the NEW one, bucketed,
  // plus the share of those whose RAW db storey was absent/_UNKNOWN — i.e. the ones assignStoreyByZ
  // FABRICATED a floor for. That last number is the direct tie to the measured fabrication rates.
  function _logLevelDisagreement(elements, collapse, axis, label) {
    if (!axis) return null;
    var raw = axis.stats.rawStorey || {};
    var n = elements.length, dis = 0, fabricated = 0, fabAndDisagree = 0;
    var pairs = {}, samples = [];
    for (var i = 0; i < n; i++) {
      var e = elements[i];
      var oldK = collapse(e.storey), newK = axis.keyOf(e);
      var rs = raw[e.guid];
      var wasFab = !rs || rs === '_UNKNOWN' || /^unknown$/i.test(String(rs));
      if (wasFab) fabricated++;
      if (oldK === newK) continue;
      dis++;
      if (wasFab) fabAndDisagree++;
      var pk = oldK + ' -> ' + newK;
      pairs[pk] = (pairs[pk] || 0) + 1;
      if (samples.length < 12) samples.push({ guid: e.guid, cls: e.cls, rawStorey: rs == null ? null : rs,
        old: oldK, 'new': newK, base_z: Number((e.base_z).toFixed(3)) });
    }
    // ⚠ THE RAW `disagree` COUNT OVERSTATES THE CHANGE AND MUST NOT BE THE HEADLINE. When a building
    // has no IfcBuildingStorey.Elevation the derived grid lines get their labels from a plurality
    // vote, so a level can come out correctly grouped but differently NAMED — and then every element
    // on it counts as "disagreeing" purely because the text changed. Measured on Duplex before this
    // split existed: 100.00% raw, of which only 9.56% was a real regrouping.
    // STRUCTURAL disagreement is the honest number: map each OLD level to the NEW level that most of
    // its elements went to, then count only the elements that did NOT follow their own level's
    // plurality. That is invariant under relabeling and is what actually changes the task grid.
    var domOf = {}, byOld = {};
    for (var i5 = 0; i5 < n; i5++) {
      var e5 = elements[i5], o5 = collapse(e5.storey), n5 = axis.keyOf(e5);
      (byOld[o5] = byOld[o5] || {})[n5] = ((byOld[o5] || {})[n5] || 0) + 1;
    }
    Object.keys(byOld).forEach(function (o) {
      var v = byOld[o];
      domOf[o] = Object.keys(v).sort(function (a, b) { return v[b] - v[a] || (a < b ? -1 : 1); })[0];
    });
    var structural = 0, structFab = 0;
    for (var i6 = 0; i6 < n; i6++) {
      var e6 = elements[i6], o6 = collapse(e6.storey);
      if (axis.keyOf(e6) === domOf[o6]) continue;
      structural++;
      var rs6 = raw[e6.guid];
      if (!rs6 || rs6 === '_UNKNOWN' || /^unknown$/i.test(String(rs6))) structFab++;
    }
    var relabelOnly = dis - structural;

    var pct = function (a) { return (100 * a / (n || 1)).toFixed(2) + '%'; };
    var top = Object.keys(pairs).sort(function (a, b) { return pairs[b] - pairs[a]; }).slice(0, 12)
      .reduce(function (o, k) { o[k] = pairs[k]; return o; }, {});
    console.log('§TPL_LEVEL_DISAGREE label=' + label + ' n=' + n +
      ' STRUCTURAL=' + structural + ' (' + pct(structural) + ' — elements that actually change level GROUP; this is the headline)' +
      ' relabelOnly=' + relabelOnly + ' (' + pct(relabelOnly) + ' — same group, different level NAME)' +
      ' rawKeyDiff=' + dis + ' (' + pct(dis) + ')' +
      ' rawStoreyMissing=' + fabricated + ' (' + pct(fabricated) + ' — assignStoreyByZ INVENTED a floor name for these)' +
      ' structuralAmongFabricated=' + structFab + '/' + fabricated +
      ' structuralAmongDeclared=' + (structural - structFab) + '/' + (n - fabricated) +
      ' distinctPairs=' + Object.keys(pairs).length);
    console.log('§TPL_LEVEL_DISAGREE_MAP label=' + label + ' dominantOldToNew=' + JSON.stringify(domOf));
    console.log('§TPL_LEVEL_DISAGREE_PAIRS label=' + label + ' ' + JSON.stringify(top));
    samples.forEach(function (s) {
      console.log('§TPL_LEVEL_DISAGREE_EG label=' + label + ' guid=' + s.guid + ' cls=' + s.cls +
        ' rawDbStorey=' + JSON.stringify(s.rawStorey) + ' old="' + s.old + '" new="' + s['new'] + '" base_z=' + s.base_z);
    });
    if (structural === 0) console.log('§TPL_LEVEL_DISAGREE_VACUOUS label=' + label +
      ' — no element changes level GROUP on this building (relabelOnly=' + relabelOnly + '). It cannot ' +
      'tell the swap apart structurally; a 0 here is NOT evidence the swap is correct elsewhere (§S32.4 vacuity rule).');
    return { n: n, disagree: dis, structural: structural, relabelOnly: relabelOnly,
             fabricated: fabricated, fabAndDisagree: fabAndDisagree, structFab: structFab, pairs: pairs };
  }

  // _writeTemplateSchedule — the §TEMPLATE_INSTANTIATE write path. Same tables, same schedule_id,
  // same idempotent rebuild as the legacy grouping path; the difference is WHERE the numbers come
  // from: task windows from 4D_template.json's duration_rule, task_sequences from its dependencies.
  // Nothing here reads a date to produce an edge, which is the whole point — the persisted lag used
  // to be `sd.s - pd.e`, i.e. the answer restated as its own constraint (§S67 HOP 5 measured 25/25).
  function _writeTemplateSchedule(db, elements, schedule, opts, SG, storeyMergeMap, laborRates, schedId, start, displayAuthored) {
    var T = opts.template;
    var bandRank = (SG.deriveBandRanks ? SG.deriveBandRanks(elements, storeyMergeMap).bandRank : {}) || {};
    function collapse(st) {
      var c = SG.collapsePhase(st);
      return (storeyMergeMap && storeyMergeMap[c]) || c;
    }
    // §TPL_LEVEL_AXIS opt-in. `opts.levelSource === 'deriver'` swaps the task grid's vertical axis
    // to LevelDeriver; anything else (including absent) keeps the proven collapse(e.storey)/bandRank
    // path byte-for-byte. `opts.levelProbe` measures the two axes against each other WITHOUT
    // swapping — so the disagreement rate can be read off a shipped-behaviour run.
    // TPL_LEVEL_SOURCE / TPL_LEVEL_PROBE env overrides exist so the SHIPPED witnesses can be run
    // flag-on without forking them (node harness only — `process` is absent in the browser, so the
    // live viewer can only ever be switched by an explicit opts.levelSource).
    var _env = (typeof process !== 'undefined' && process && process.env) ? process.env : {};
    var _srcOpt = opts.levelSource || _env.TPL_LEVEL_SOURCE || null;
    var _wantAxis = (_srcOpt === 'deriver');
    var _wantProbe = _wantAxis || !!opts.levelProbe || _env.TPL_LEVEL_PROBE === '1';
    var _axis = null;
    if (_wantProbe) {
      _axis = _deriverLevelAxis(db, elements, collapse, storeyMergeMap, opts.label || 'building');
      _logLevelDisagreement(elements, collapse, _axis, opts.label || 'building');
    }
    if (_wantAxis && !_axis) {
      // Asked for the new axis, could not build it. Do NOT quietly serve the old one under the new
      // name — say so, then fall back to the proven path.
      console.log('§TPL_LEVEL_SOURCE requested=deriver effective=storey — FELL BACK (axis unavailable)');
    }
    var _useAxis = _wantAxis ? _axis : null;
    // Emitted only when something was actually asked for, so a default run's §-log stays byte-for-byte
    // what it was before this change (the flag-off identity the witnesses check).
    if (_wantProbe) console.log('§TPL_LEVEL_SOURCE requested=' + (_srcOpt || 'storey') +
      ' effective=' + (_useAxis ? 'deriver' : 'storey') + ' probe=on');
    var inst = instantiateTemplate(elements, T, laborRates, opts.shiftHours, bandRank, collapse, _useAxis);
    if (!inst.tasks.length) { console.log('§AUTHOR_TPL_FAIL reason=no_tasks'); return { ok: false, reason: 'no_tasks' }; }

    // Absence is REPORTED, never silent — 4D_template.json's own instantiation rule, and the
    // defect §S67 HOP 1/HOP 3 found (Substructure simply vanished from HHS with nothing said).
    var _absLevel = inst.reports.filter(function (r) { return r.kind === 'phase_absent_on_level'; });
    var _absAll = inst.reports.filter(function (r) { return r.kind === 'phase_absent_everywhere'; });
    var _orph = inst.reports.filter(function (r) { return r.kind === 'elements_orphaned'; })[0];
    if (_orph) console.log('§TPL_ELEMENT_ORPHAN n=' + _orph.count + ' — element(s) whose phase the template does not declare, so they land in NO task: ' +
      JSON.stringify(_orph.byPhaseClass));
    else console.log('§TPL_ELEMENT_ORPHAN n=0 — every element landed in a declared phase');
    var _lev = inst.reports.filter(function (r) { return r.kind === 'capacity_levelled'; })[0];
    console.log('§TPL_CAPACITY_LEVEL tasksDelayed=' + (_lev ? _lev.tasksDelayed : 0) +
      ' daysAdded=' + (_lev ? _lev.totalDaysAdded : 0) +
      ' (a task was pushed later because its trade had no free crew at its logic date; 0 = the' +
      ' declared logic was already crew-legal on its own)');
    console.log('§TPL_PHASE_COVERAGE declared=' + T.phases.length + ' levels=' + inst.levels.length +
      ' tasksEmitted=' + inst.tasks.length + ' absentPhaseLevels=' + _absLevel.length +
      ' absentPhasesEntirely=' + _absAll.length);
    _absAll.forEach(function (r) {
      console.log('§TPL_PHASE_ABSENT phase="' + r.phase + '" on NO level of this building — ' + r.why);
    });
    _absLevel.forEach(function (r) {
      console.log('§TPL_PHASE_GAP phase="' + r.phase + '" level="' + r.level + '" — ' + r.why + ' (chain bridged)');
    });

    _ensureSchedulesGenVersion(db);
    _ensureSchedulesDisplayAuthored(db);
    _ensureWideTasks(db);
    db.run('CREATE TABLE IF NOT EXISTS task_elements (task_id TEXT, guid TEXT, PRIMARY KEY (task_id, guid))');
    db.run('CREATE TABLE IF NOT EXISTS task_sequences (predecessor_id TEXT, successor_id TEXT, sequence_type TEXT, lag_days REAL DEFAULT 0, PRIMARY KEY (predecessor_id, successor_id))');

    db.run('BEGIN TRANSACTION');
    db.run('DELETE FROM task_elements WHERE task_id IN (SELECT task_id FROM tasks WHERE schedule_id=?)', [schedId]);
    db.run('DELETE FROM task_sequences WHERE predecessor_id IN (SELECT task_id FROM tasks WHERE schedule_id=?) OR successor_id IN (SELECT task_id FROM tasks WHERE schedule_id=?)', [schedId, schedId]);
    db.run('DELETE FROM tasks WHERE schedule_id=?', [schedId]);
    db.run('DELETE FROM schedules WHERE schedule_id=?', [schedId]);
    db.run('INSERT INTO schedules (schedule_id,name,status,created_date,gen_version,display_authored) VALUES (?,?,?,?,?,?)',
      [schedId, 'Authored Schedule (4D template)', 'PLANNED', start, opts.genVersion != null ? opts.genVersion : null, displayAuthored || 0]);

    var rootId = 'TASK_ROOT';
    db.run('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [rootId, schedId, null, 'Project', 'CONSTRUCTION', 1, start, _addDays(start, inst.totalDays), 'P' + inst.totalDays + 'D', null, 'PLANNED']);

    var stmtTk = db.prepare('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    var stmtTe = db.prepare('INSERT OR IGNORE INTO task_elements VALUES (?,?)');
    inst.tasks.forEach(function (t) {
      stmtTk.run([t.id, schedId, rootId, t.phase + ' — ' + t.storey, 'CONSTRUCTION', 0,
        _addDays(start, t.sDays), _addDays(start, t.eDays), 'P' + t.days + 'D', null, 'PLANNED']);
      for (var i = 0; i < t.guids.length; i++) stmtTe.run([t.id, t.guids[i]]);
    });
    stmtTk.free(); stmtTe.free();

    var stmtSeq = db.prepare('INSERT OR IGNORE INTO task_sequences VALUES (?,?,?,?)');
    var wl = 0, al = 0;
    inst.edges.forEach(function (e) {
      stmtSeq.run([e.predId, e.succId, e.type, e.lagDays]);
      if (e.kind === 'across_levels') al++; else wl++;
    });
    stmtSeq.free();
    db.run('COMMIT');

    console.log('§AUTHOR_TPL schedule=' + schedId + ' v=' + T.meta.version + ' tasks=' + inst.tasks.length +
      ' edges=' + inst.edges.length + ' (withinLevel=' + wl + ' acrossLevels=' + al + ')' +
      ' elements=' + elements.length + ' totalDays=' + inst.totalDays +
      ' — every lag is the TEMPLATE\'s, none derived from the dates it constrains');
    // §TPL_MOVIE_BINDS_BARS — bind the movie to the bars we just authored, from the SAME task
    // objects, so the two can never be computed off different grids.
    // §TPL_LAYER_ORDER — topological layers of the SHIPPED contact graph's bearing relation.
    // Kahn over "who rests on whom": an element is in layer 0 when nothing it rests on is still
    // unplaced. Cycles (a data defect) fall out in one block and are laid out after everything
    // acyclic, never looped on.
    var _layerOf = (function () {
      try {
        // This module's IIFE parameter is named `global` and is `self||this` — in node that is
        // NOT globalThis, so a bare `global.SupportSweep` MISSES a module that registered itself
        // properly. Exactly the trap _writeBarSchedule's _reg() and _reclassGroundworkSlabs both
        // already document; check all three. (I hit it: the layer block returned null silently and
        // the whole pass was a no-op, with identical numbers hiding it.)
        var SSw = (global && global.SupportSweep) ||
                  (typeof globalThis !== 'undefined' && globalThis.SupportSweep) ||
                  (typeof window !== 'undefined' && window.SupportSweep) || null;
        if (!SSw || !SSw.contactGraph) { console.log('§TPL_LAYER_ORDER_FAIL SupportSweep not loaded — task interiors stay in solve order'); return null; }
        var items = elements.map(function (e) {
          return { guid: e.guid, cls: e.cls, seq: e.seq, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1,
                   bz: e.base_z, tz: e.top_z };
        });
        var Gc = SSw.contactGraph(items);
        if (!Gc.ok) return null;
        var EPSl = SG.EPS, GAPl = SG.GAP;
        var below = new Array(items.length);
        for (var i2 = 0; i2 < items.length; i2++) {
          var lst = Gc.contacts[i2], b2 = [];
          if (lst) for (var q = 0; q < lst.length; q++) {
            var S2 = items[lst[q]], T2 = items[i2];
            if (S2.bz < T2.bz - EPSl && S2.tz >= T2.bz - GAPl && S2.tz <= T2.bz + GAPl) b2.push(lst[q]);
          }
          below[i2] = b2;
        }
        // No artificial layer cap. A real cycle is caught by the no-progress break below; a
        // fixed 64 silently dumped 1322 Hospital elements into one 'cyclic' bucket and cost
        // 968 inversions that read as a cycle problem when it was my own constant.
        var lay = new Int32Array(items.length).fill(-1), left = items.length, cur = 0;
        while (left > 0) {
          var progressed = false;
          for (var i3 = 0; i3 < items.length; i3++) {
            if (lay[i3] >= 0) continue;
            var ready = true;
            for (var r = 0; r < below[i3].length; r++) if (lay[below[i3][r]] < 0) { ready = false; break; }
            if (ready) { lay[i3] = cur; left--; progressed = true; }
          }
          if (!progressed) break;                  // cycle: everything remaining shares one layer
          cur++;
        }
        var map = {}, unresolved = 0;
        for (var i4 = 0; i4 < items.length; i4++) {
          map[items[i4].guid] = lay[i4] >= 0 ? lay[i4] : cur;
          if (lay[i4] < 0) unresolved++;
        }
        console.log('§TPL_LAYER_ORDER layers=' + cur + ' cyclic=' + unresolved +
          ' — elements are laid out inside their task in SUPPORT order, not solve order');
        return map;
      } catch (e) { console.log('§TPL_LAYER_ORDER_FAIL ' + e.message); return null; }
    })();
    var _rm = remapSolveToTasks(schedule, inst.tasks, start, _layerOf);
    // §TPL_LAYER_SELFCHECK — A PASS MUST PROVE IT DID SOMETHING AND THAT IT WORKED.
    // Written because the layer pass above shipped BROKEN and silent: it returned null on a
    // shadowed `global`, changed nothing, and emitted numbers IDENTICAL to the previous run. A
    // no-op is indistinguishable from a working pass unless the pass counts its own effect.
    //   applied     = did the layer map exist at all. 0 => the pass did not run.
    //   moved       = elements whose interval differs from the solve-order layout. 0 => no-op.
    //   stillInverted = bearing pairs INSIDE one task where the supported element still starts
    //                   before its support ends. This is the thing the pass exists to remove; it
    //                   must be 0, and if it is not the pass is not doing its job.
    try {
      var _no = remapSolveToTasks(schedule, inst.tasks, start, null).schedule;
      var _mv = 0;
      for (var _g in _rm.schedule) if (!_no[_g] || _no[_g].start !== _rm.schedule[_g].start) _mv++;
      var _taskOf = {};
      inst.tasks.forEach(function (tk) { tk.guids.forEach(function (g) { _taskOf[g] = tk.id || tk.taskId || tk.name; }); });
      var _inv = 0, _byG = {};
      elements.forEach(function (e) { _byG[e.guid] = e; });
      var _SSc = (global && global.SupportSweep) ||
                 (typeof globalThis !== 'undefined' && globalThis.SupportSweep) || null;
      if (_SSc && _SSc.contactGraph) {
        var _it = elements.map(function (e) {
          return { guid: e.guid, cls: e.cls, seq: e.seq, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1,
                   bz: e.base_z, tz: e.top_z };
        });
        var _Gc = _SSc.contactGraph(_it);
        if (_Gc.ok) for (var _i = 0; _i < _it.length; _i++) {
          var _l2 = _Gc.contacts[_i]; if (!_l2) continue;
          var _T = _it[_i], _ts = _rm.schedule[_T.guid]; if (!_ts) continue;
          for (var _q = 0; _q < _l2.length; _q++) {
            var _S = _it[_l2[_q]], _ss = _rm.schedule[_S.guid]; if (!_ss) continue;
            if (_taskOf[_S.guid] !== _taskOf[_T.guid]) continue;          // same task only
            if (!(_S.bz < _T.bz - SG.EPS && _S.tz >= _T.bz - SG.GAP && _S.tz <= _T.bz + SG.GAP)) continue;
            if (_ts.start < _ss.end - 1) _inv++;
          }
        }
      }
      console.log('§TPL_LAYER_SELFCHECK applied=' + (_layerOf ? 1 : 0) + ' moved=' + _mv + '/' + _rm.mapped +
        ' stillInverted=' + _inv + ' ' +
        (!_layerOf ? 'FAIL pass did not run'
         : _mv === 0 ? 'FAIL pass ran but moved nothing — a no-op that looks like a success'
         : _inv === 0 ? 'PASS' : 'FAIL support order still violated inside a task'));
    } catch (e) { console.log('§TPL_LAYER_SELFCHECK_ERROR ' + e.message); }
    console.log('§TPL_MOVIE_BINDS_BARS remapped=' + _rm.mapped + '/' + elements.length +
      ' degenerateTasksSpreadEvenly=' + _rm.degenerateTasks +
      ' — every element now plays inside the bar that claims it');
    return { ok: true, scheduleId: schedId, zoneCount: inst.tasks.length, edgeCount: inst.edges.length,
             totalDays: inst.totalDays, templateVersion: T.meta.version, reports: inst.reports,
             tasks: inst.tasks, displaySchedule: _rm.schedule };
  }

  // materializeDefault(db, rules, opts) — originate the smart-default schedule on a blank model.
  // db: a sql.js Database with `elements_meta`. rules: SEQUENCE_RULES map. opts: {start, phaseDays,
  // scheduleId, defaultRule}. Idempotent — rebuilds the SCH_AUTHORED schedule from scratch.
  function materializeDefault(db, rules, opts) {
    opts = opts || {};
    var start = opts.start || '2026-01-01';
    var phaseDays = opts.phaseDays || 30;
    var schedId = opts.scheduleId || 'SCH_AUTHORED';
    var dflt = opts.defaultRule || (global.SEQUENCE_DEFAULT) || { phase: 'Architecture', sequence: 6, resource: null };
    var blank = !!opts.blank;   // §MI-FLOW true-blank start: organize phases+assignments but leave
                                // them UNDATED so the user originates the schedule (nothing shows in
                                // the TM until dated → _cap skips NULL-dated tasks).
    rules = rules || (global.SEQUENCE_RULES) || {};
    var nameOverrides = opts.nameOverrides || (global.SEQUENCE_NAME_OVERRIDES) || [];
    // §PHASE_DURATION: labor rates for workload-proportional phase width (see below). Falls back to
    // {} when unavailable (blank-model bootstrap, older tests) — every element then gets the SAME
    // 120s default weight, which degrades gracefully to plain element-count proportionality, never
    // to the old flat-phaseDays-per-phase behaviour.
    var laborRates = opts.laborRates || (global.LABOR_RATES) || {};
    // §LABOR_QUANTITY_WEIGHT: RATES (rates.js, the QS/BOQ cost table — separate from LABOR_RATES)
    // gives each class's real physical measure via `unit`. Used ONLY to detect and re-weight
    // classes whose geometry is over-fragmented relative to real installable units — see
    // _classFragmentation's header for why this cannot be a blanket per-unit-type rule.
    var qsRates = opts.rates || (global.RATES) || {};

    // Ensure the IFC-native 4D tables exist (mirror import_db_builder.js DDL exactly).
    _ensureSchedulesGenVersion(db);
    _ensureWideTasks(db);   // migrate any legacy-thin tasks table → the widened DDL `_cap` reads
    db.run('CREATE TABLE IF NOT EXISTS task_elements (task_id TEXT, guid TEXT, PRIMARY KEY (task_id, guid))');
    var _frag = _classFragmentation(db, qsRates);

    // §SE-5a: one transaction around the whole rebuild (delete + insert). Without this, sql.js pays
    // per-statement implicit-commit overhead on EVERY row — for a large building (tens of thousands of
    // elements) that is a multi-second, unbroken main-thread block (measured 4.3s/63k els, 10.4s/123k
    // els pre-fix) long enough to trip Chrome's "Page Unresponsive" prompt. Batching is the standard
    // SQLite bulk-write fix, not a new algorithm. Same rows, same order, same output — write cost only.
    db.run('BEGIN TRANSACTION');

    // Idempotent rebuild: drop any prior authored rows for this schedule.
    var oldIds = [];
    var pr = db.exec("SELECT task_id FROM tasks WHERE schedule_id='" + schedId + "'");
    if (pr.length && pr[0].values.length) pr[0].values.forEach(function (r) { oldIds.push(r[0]); });
    oldIds.forEach(function (tid) { db.run('DELETE FROM task_elements WHERE task_id=?', [tid]); });
    db.run("DELETE FROM tasks WHERE schedule_id='" + schedId + "'");
    db.run("DELETE FROM schedules WHERE schedule_id='" + schedId + "'");

    // Read the raw material: every element + its class + name (name feeds matchNameOverride) +
    // storey (§PHASE_OVERLAP_BAND below — real band count for the overlap fix).
    var elems = [];
    // §CLASS_UNMATCHED_FALLBACK follow-up (2026-08-05, named in 4D_SCHEDULE_PERFECTION.md): the
    // _buildScheduleElements/materializeZones path already excludes IfcOpeningElement (ghost/position-
    // only, never real work) and IfcSpace (spatial zone, not physical work) — this query was the one
    // materialize path that still read every row unfiltered. Same exclusion, same two classes, so a
    // blank-model default schedule can't invent labor for a room volume or a doorway either.
    var er = db.exec("SELECT guid, ifc_class, COALESCE(element_name,''), COALESCE(storey,'') FROM elements_meta " +
      "WHERE ifc_class != 'IfcOpeningElement' AND ifc_class != 'IfcSpace'");
    if (er.length && er[0].values.length) {
      er[0].values.forEach(function (r) { elems.push({ guid: r[0], cls: r[1], name: r[2], storey: r[3] }); });
    }

    // Group into phases via the SAME rule the read-path uses.
    var phases = {};   // phaseName -> { name, seq, guids:[] }
    var nameOverridden = 0;
    elems.forEach(function (e) {
      var ov = matchNameOverride(e.cls, e.name, nameOverrides);
      if (ov) nameOverridden++;
      var rule = ov || matchRule(e.cls, rules, dflt);
      var p = phases[rule.phase];
      if (!p) { p = phases[rule.phase] = { name: rule.phase, seq: rule.sequence, guids: [], resourceSecs: {}, storeys: {} }; }
      if (rule.sequence < p.seq) p.seq = rule.sequence;   // phase ordered by its earliest rule
      p.guids.push(e.guid);
      p.storeys[e.storey] = true;   // §PHASE_OVERLAP_BAND below — real storey count, not invented
      // Bucket by resource (trade), not summed flat — see the width computation below: different
      // trades within a phase run in PARALLEL (this file's own "true parallel trades" principle,
      // §Current Problems item 3 / resourceCursor in time_machine.js), so a phase's duration is set
      // by its slowest trade, not the sum of all trades' work.
      var resKey = rule.resource || '__NONE__';
      var realQty = (_frag.fragmented[e.cls] && _frag.area[e.guid] != null) ? _frag.area[e.guid] : null;
      p.resourceSecs[resKey] = (p.resourceSecs[resKey] || 0) + _installSecs(e.cls, rule, laborRates, realQty);
    });
    if (nameOverridden) console.log('§NAME_OVERRIDE ' + nameOverridden + ' elements reclassified by name (' +
      nameOverrides.map(function (o) { return o.id; }).join(',') + ') — see rates/sequence_rules.json NAME_OVERRIDES');

    // Order phases by sequence (then name, stable) → contiguous WBS leaves.
    var ordered = Object.keys(phases).map(function (k) { return phases[k]; });
    ordered.sort(function (a, b) { return (a.seq - b.seq) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });

    // §PHASE_DURATION (GANTT_ACCURACY.md "RESUME 2026-08-04+"): each phase's calendar-window width
    // is workload-proportional, NOT the old flat `phaseDays` constant — that made Superstructure's
    // 72.4%-of-building bucket occupy the SAME width as Finishes' smallest bucket, so the building
    // looked visually complete within the first hours of a 4D film (workInFirst10%=51.7%, measured).
    // Per-trade labor-seconds (Σ getInstallSecs, already-extracted LABOR_RATES productivity) is
    // divided by that trade's `max_crews` (also already-extracted, not invented — how many
    // independent crews of a trade work the site simultaneously) to get realistic elapsed days, and
    // a phase's duration is the SLOWEST trade (max, not sum) — trades within a phase already run in
    // parallel per this file's own principle, so the bottleneck trade sets the phase's real length.
    // User-confirmed 2026-08-04: max_crews applied, bottleneck (not summed) — plain Σ-seconds/1-crew
    // gave Terminal a 10.2y total (Superstructure alone 2,922d); this gives ~3.5y, Superstructure
    // ~968d (still ~75% of the project, correctly dominant, but no longer absurd).
    // §PHASE_OVERLAP_BAND (GANTT_ACCURACY.md "GENERIC RULE" item 3, conventional construction
    // scheduling — Line of Balance / flowline): `materializeDefault` used to place phase i+1 only
    // after phase i was 100% done PROJECT-WIDE (plain Σ cursor below), so a phase that legitimately
    // dominates the workload (e.g. Superstructure) pushed every later phase's start out to nearly
    // the project's end — measured on Terminal pre-fix: Architecture started at day 1,189 of 1,264
    // (94%). Real construction does not wait for a trade to leave the WHOLE building before the
    // next trade starts — it follows the leading trade band-by-band (floor-by-floor), starting once
    // the leading trade has cleared ONE band, same as any flowline/repetitive-work schedule.
    //
    // `p.storeys` (built above from `elements_meta.storey`, real extracted data, no name-matching)
    // gives each phase's real band count. lagDays = the time to clear ONE band (widthDays/numBands)
    // — not an invented overlap fraction (contrast §CPE_PHASE_STAGGER's fixed 20%, a FILM-layer
    // hack, now removed). A phase touching only 1 band (numBands=1, e.g. a single-storey building)
    // degrades to the old fully-contiguous behaviour automatically — no special-casing needed.
    var totalDays = 0, _cursor = 0;
    ordered.forEach(function (p) {
      var maxTradeDays = 0, laborSecsTotal = 0;
      for (var resKey in p.resourceSecs) {
        var secs = p.resourceSecs[resKey];
        laborSecsTotal += secs;
        var maxCrews = (laborRates[resKey] && laborRates[resKey].max_crews) || 1;
        var tradeDays = secs / (28800 * maxCrews);
        if (tradeDays > maxTradeDays) maxTradeDays = tradeDays;
      }
      p.widthDays = Math.max(1, Math.ceil(maxTradeDays));
      p.laborSecs = laborSecsTotal;   // kept for the log line only
      var numBands = Math.max(1, Object.keys(p.storeys).length);
      p.lagDays = Math.max(1, Math.ceil(p.widthDays / numBands));
      p.startCursor = _cursor;
      _cursor += p.lagDays;
      totalDays = Math.max(totalDays, p.startCursor + p.widthDays);
      console.log('§PHASE_DURATION phase=' + p.name + ' elements=' + p.guids.length +
        ' laborSecs=' + p.laborSecs + ' trades=' + Object.keys(p.resourceSecs).length + ' days=' + p.widthDays);
      console.log('§PHASE_OVERLAP_BAND phase=' + p.name + ' bands=' + numBands +
        ' lagDays=' + p.lagDays + ' startsAtDay=' + p.startCursor +
        ' (overlaps ' + Math.max(0, p.widthDays - p.lagDays) + 'd of the PREVIOUS phase\'s tail)');
    });

    db.run('INSERT INTO schedules (schedule_id,name,status,created_date,gen_version) VALUES (?,?,?,?,?)',
      [schedId, 'Authored Schedule', 'PLANNED', start, opts.genVersion != null ? opts.genVersion : null]);

    // ROOT summary task (is_summary=1 → excluded from _cap leaf window; spans the whole project).
    // In blank mode dates are NULL (the user originates them via scheduleDefault/the wizard).
    var rootId = 'TASK_ROOT';
    var rootStart = blank ? null : start;
    var rootFinish = blank ? null : _addDays(start, totalDays);
    db.run('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [rootId, schedId, null, 'Project', 'CONSTRUCTION', 1, rootStart, rootFinish, blank ? null : 'P' + totalDays + 'D', null, 'PLANNED']);

    var stmtTk = db.prepare('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    var stmtTe = db.prepare('INSERT OR IGNORE INTO task_elements VALUES (?,?)');
    var outPhases = [], assignN = 0;
    ordered.forEach(function (p) {
      var tid = 'TASK_' + _slug(p.name);
      p.taskId = tid;   // CPM_FLOAT_GAP.md Gap 1 — kept on p so the task_sequences pass below can use it
      var s = blank ? null : _addDays(start, p.startCursor);
      var f = blank ? null : _addDays(start, p.startCursor + p.widthDays);
      // Leaf, is_summary=0. Dated → _cap.win picks it up; blank/undated → _cap skips it (the user
      // originates the dates, then it appears in the timeline). Assignments are made either way.
      stmtTk.run([tid, schedId, rootId, p.name, 'CONSTRUCTION', 0, s, f, blank ? null : 'P' + p.widthDays + 'D', null, 'PLANNED']);
      p.guids.forEach(function (g) { stmtTe.run([tid, g]); assignN++; });
      outPhases.push({ taskId: tid, name: p.name, sequence: p.seq, start: s, finish: f, count: p.guids.length, durationDays: p.widthDays });
    });
    stmtTk.free();
    stmtTe.free();

    // CPM_FLOAT_GAP.md Gap 1 (phase-level) — §PHASE_OVERLAP_BAND already computed the real
    // leading-trade/follow-on-trade relationship between consecutive phases (p.lagDays = days for
    // the leading phase to clear one band before the next phase can start behind it) but only ever
    // wrote it into schedule_start/schedule_finish, never into task_sequences — so computeCpm was
    // blind to a generated (no-plan) schedule: zero predecessor/successor rows, every phase trivially
    // ES=0, float meaningless. This exposes the SAME already-derived number as an explicit
    // CPM-solvable SS edge — not a new/invented relationship, just the one already computed above,
    // made readable by computeCpm/listDependencies/the Gantt dependency view.
    db.run('CREATE TABLE IF NOT EXISTS task_sequences (predecessor_id TEXT, successor_id TEXT, sequence_type TEXT, lag_days REAL DEFAULT 0, PRIMARY KEY (predecessor_id, successor_id))');
    db.run("DELETE FROM task_sequences WHERE predecessor_id IN (SELECT task_id FROM tasks WHERE schedule_id=?) OR successor_id IN (SELECT task_id FROM tasks WHERE schedule_id=?)", [schedId, schedId]);
    var stmtSeq = db.prepare('INSERT OR IGNORE INTO task_sequences VALUES (?,?,?,?)');
    var seqN = 0;
    for (var i = 1; i < ordered.length; i++) {
      var pred = ordered[i - 1], succ = ordered[i];
      stmtSeq.run([pred.taskId, succ.taskId, 'SS', pred.lagDays]);
      seqN++;
    }
    stmtSeq.free();
    if (seqN) console.log('§AUTHOR_SEQUENCES schedule=' + schedId + ' edges=' + seqN + ' (SS, lag=leading-phase band-clear days)');

    db.run('COMMIT');   // §SE-5a — single commit for the whole rebuild

    console.log('§AUTHOR_MATERIALIZE schedule=' + schedId + ' mode=' + (blank ? 'blank' : 'dated') +
      ' phases=' + outPhases.length + ' leafTasks=' + outPhases.length +
      ' assignments=' + assignN + ' elements=' + elems.length + ' totalDays=' + totalDays);
    return { scheduleId: schedId, rootId: rootId, phases: outPhases, taskCount: outPhases.length, assignmentCount: assignN, blank: blank, totalDays: totalDays };
  }

  // assignElement(db, guid, taskId) — the CRAFT verb. Re-home one element to a different phase task.
  // The reassignment IS the user override; the task->guid row is the P2 identity-link.
  function assignElement(db, guid, taskId) {
    var tk = db.exec('SELECT task_id FROM tasks WHERE task_id=?', [taskId]);
    if (!tk.length || !tk[0].values.length) {
      console.log('§AUTHOR_ASSIGN_FAIL guid=' + guid + ' taskId=' + taskId + ' reason=no_such_task');
      return { ok: false, guid: guid, taskId: taskId, reason: 'no_such_task' };
    }
    db.run('DELETE FROM task_elements WHERE guid=?', [guid]);
    db.run('INSERT OR IGNORE INTO task_elements VALUES (?,?)', [taskId, guid]);
    console.log('§AUTHOR_ASSIGN guid=' + guid + ' -> task=' + taskId);
    return { ok: true, guid: guid, taskId: taskId };
  }

  // activeSchedule(db, opts) — detect the schedule the wizard should EDIT. A model dropped from
  // Bonsai/Revit arrives WITH a native IFC schedule (import_worker captures IfcWorkSchedule/IfcTask
  // into these same tables, keyed by IFC GlobalId — NOT 'SCH_AUTHORED'). So the wizard must recognize
  // an imported (captured) schedule and edit IT, never rule-generate a competing one (_cap reads ALL
  // schedule_ids → two schedules = a doubled timeline). Priority: the user's own SCH_AUTHORED draft,
  // else the imported schedule. Returns {id, name, taskCount, authored, captured, stale, hasBaseline,
  // safeToRegen} or null when no dated schedule.
  //
  // §GANTT_SCHEDULE_STALE — opts.currentGenVersion (optional): when passed, flags whether a
  // non-captured schedule was materialized under an older scheduling-code version than the caller's
  // current one (gen_version missing entirely counts as stale — it predates this tracking, which
  // itself means real fixes since have never reached it). A captured (imported) schedule is NEVER
  // flagged stale — it must not be auto-touched, full stop, same rule this function already enforced
  // via `captured`. safeToRegen additionally requires no baseline (`task_baseline`) has been set for
  // it — once the user has committed to a schedule as their real plan (⚑ Set Baseline), it is their
  // edited product and must not be silently discarded merely because the code moved on. Callers that
  // omit opts.currentGenVersion get stale=false/safeToRegen=false always — fully backward compatible.
  function activeSchedule(db, opts) {
    opts = opts || {};
    var r;
    try {
      r = db.exec("SELECT schedule_id, COUNT(*) AS n FROM tasks " +
        "WHERE schedule_start IS NOT NULL AND (is_summary IS NULL OR is_summary=0) AND schedule_id IS NOT NULL " +
        "GROUP BY schedule_id");
    } catch (e) { return null; }
    if (!r.length || !r[0].values.length) return null;
    var list = r[0].values.map(function (row) {
      return { id: row[0], taskCount: row[1], authored: row[0] === 'SCH_AUTHORED' };
    });
    try {
      var nr = db.exec("SELECT schedule_id, name, gen_version FROM schedules");
      if (nr.length && nr[0].values.length) {
        var nm = {}, gv = {};
        nr[0].values.forEach(function (x) { nm[x[0]] = x[1]; gv[x[0]] = x[2]; });
        list.forEach(function (s) { s.name = nm[s.id] || s.id; s.genVersion = gv[s.id] != null ? gv[s.id] : null; });
      }
    } catch (e) {
      // Pre-§GANTT_SCHEDULE_STALE building: schedules table predates the gen_version column.
      list.forEach(function (s) { s.genVersion = null; });
    }
    list.forEach(function (s) { if (!s.name) s.name = s.id; });
    var authored = list.filter(function (s) { return s.authored; })[0];
    var pick = authored || list[0];
    pick.captured = !pick.authored;
    if (!pick.captured && opts.currentGenVersion != null) {
      pick.stale = (pick.genVersion == null) || (pick.genVersion < opts.currentGenVersion);
    } else {
      pick.stale = false;
    }
    pick.hasBaseline = false;
    if (pick.stale) {
      try {
        var br = db.exec('SELECT COUNT(*) AS n FROM task_baseline WHERE schedule_id=?', [pick.id]);
        pick.hasBaseline = !!(br.length && br[0].values.length && br[0].values[0][0] > 0);
      } catch (e) {}
    }
    pick.safeToRegen = pick.stale && !pick.hasBaseline;
    console.log('§AUTHOR_DETECT schedules=' + list.length + ' active=' + pick.id +
      ' captured=' + pick.captured + ' tasks=' + pick.taskCount +
      (opts.currentGenVersion != null ? ' genVersion=' + pick.genVersion + ' current=' + opts.currentGenVersion +
        ' stale=' + pick.stale + ' hasBaseline=' + pick.hasBaseline + ' safeToRegen=' + pick.safeToRegen : ''));
    return pick;
  }

  // scheduleContiguous(db, scheduleId, opts) — §MI-FLOW: the user's deliberate "originate the dates"
  // act (the optional "suggest a start"). Lays the leaf phases out contiguously from opts.start so
  // a blank-materialized (undated) schedule becomes datable on demand. Orders by rowid = insert
  // order = the sequence order materializeDefault used (NULL dates can't be ORDER BY'd).
  function scheduleContiguous(db, scheduleId, opts) {
    scheduleId = scheduleId || 'SCH_AUTHORED';
    opts = opts || {};
    var start = opts.start || '2026-01-01';
    var phaseDays = opts.phaseDays || 30;   // still the floor/no-data fallback width (see below)
    var rules = opts.rules || (global.SEQUENCE_RULES) || {};
    var dflt = opts.defaultRule || (global.SEQUENCE_DEFAULT) || { phase: 'Architecture', sequence: 6, resource: null };
    var laborRates = opts.laborRates || (global.LABOR_RATES) || {};
    var qsRates = opts.rates || (global.RATES) || {};   // §LABOR_QUANTITY_WEIGHT — see materializeDefault
    var lr = db.exec("SELECT task_id FROM tasks WHERE schedule_id='" + scheduleId +
      "' AND (is_summary IS NULL OR is_summary=0) ORDER BY rowid");
    var ids = (lr.length && lr[0].values.length) ? lr[0].values.map(function (r) { return r[0]; }) : [];
    var _frag = _classFragmentation(db, qsRates);

    // §PHASE_DURATION — same bug, same fix as materializeDefault (GANTT_ACCURACY.md "RESUME
    // 2026-08-04+"): a blank-materialized schedule reaches this function with dates not yet
    // assigned, so `phaseDays` was the ONLY width ever used here too. Re-derive each task's
    // workload from task_elements/elements_meta (materializeDefault's own phase objects aren't
    // persisted) and apply the identical bottleneck-trade, max_crews-adjusted width. A task with
    // no resolvable elements/labor data falls back to opts.phaseDays (matches materializeDefault's
    // own no-laborRates degrade-to-count behaviour when there's nothing to weight by).
    // §PHASE_OVERLAP_BAND — same fix, same reasoning as materializeDefault (see its header comment):
    // real storey count per task (from elements_meta.storey) instead of a project-wide contiguous cursor.
    var widthDays = {}, bandCount = {};
    ids.forEach(function (tid) {
      var er = db.exec("SELECT m.guid, m.ifc_class, COALESCE(m.storey,'') FROM task_elements te JOIN elements_meta m ON m.guid=te.guid WHERE te.task_id=?", [tid]);
      var resourceSecs = {}, storeys = {};
      if (er.length && er[0].values.length) {
        er[0].values.forEach(function (row) {
          var guid = row[0], cls = row[1], storey = row[2];
          var rule = matchRule(cls, rules, dflt);
          var resKey = rule.resource || '__NONE__';
          var realQty = (_frag.fragmented[cls] && _frag.area[guid] != null) ? _frag.area[guid] : null;
          resourceSecs[resKey] = (resourceSecs[resKey] || 0) + _installSecs(cls, rule, laborRates, realQty);
          storeys[storey] = true;
        });
      }
      var maxTradeDays = 0;
      for (var resKey2 in resourceSecs) {
        var maxCrews = (laborRates[resKey2] && laborRates[resKey2].max_crews) || 1;
        var d = resourceSecs[resKey2] / (28800 * maxCrews);
        if (d > maxTradeDays) maxTradeDays = d;
      }
      widthDays[tid] = maxTradeDays > 0 ? Math.max(1, Math.ceil(maxTradeDays)) : phaseDays;
      bandCount[tid] = Math.max(1, Object.keys(storeys).length);
    });

    var cursor = 0, totalDays = 0, lagByTid = {};
    db.run('BEGIN TRANSACTION');   // §SE-5a — same per-statement-overhead fix as materializeDefault
    ids.forEach(function (tid) {
      var w = widthDays[tid];
      var lag = Math.max(1, Math.ceil(w / bandCount[tid]));
      lagByTid[tid] = lag;
      var s = _addDays(start, cursor), f = _addDays(start, cursor + w);
      db.run("UPDATE tasks SET schedule_start=?, schedule_finish=?, schedule_duration=? WHERE task_id=?",
        [s, f, 'P' + w + 'D', tid]);
      console.log('§PHASE_OVERLAP_BAND task=' + tid + ' bands=' + bandCount[tid] + ' lagDays=' + lag + ' startsAtDay=' + cursor);
      totalDays = Math.max(totalDays, cursor + w);
      cursor += lag;
    });
    db.run("UPDATE tasks SET schedule_start=?, schedule_finish=? WHERE schedule_id=? AND is_summary=1",
      [start, _addDays(start, totalDays), scheduleId]);

    // CPM_FLOAT_GAP.md Gap 1 (phase-level) — same edge-exposure as materializeDefault (see its
    // comment above the identical block): this function re-dates a previously-blank schedule, so it
    // must (re)write the SAME SS edges here too, using the just-recomputed per-task lag — otherwise a
    // schedule authored blank-then-dated would keep the STALE edges (or none) from before dating.
    db.run('CREATE TABLE IF NOT EXISTS task_sequences (predecessor_id TEXT, successor_id TEXT, sequence_type TEXT, lag_days REAL DEFAULT 0, PRIMARY KEY (predecessor_id, successor_id))');
    db.run("DELETE FROM task_sequences WHERE predecessor_id IN (SELECT task_id FROM tasks WHERE schedule_id=?) OR successor_id IN (SELECT task_id FROM tasks WHERE schedule_id=?)", [scheduleId, scheduleId]);
    var stmtSeq = db.prepare('INSERT OR IGNORE INTO task_sequences VALUES (?,?,?,?)');
    var seqN = 0;
    for (var i = 1; i < ids.length; i++) {
      stmtSeq.run([ids[i - 1], ids[i], 'SS', lagByTid[ids[i - 1]]]);
      seqN++;
    }
    stmtSeq.free();
    if (seqN) console.log('§AUTHOR_SEQUENCES schedule=' + scheduleId + ' edges=' + seqN + ' (SS, lag=leading-phase band-clear days)');

    db.run('COMMIT');
    console.log('§AUTHOR_SCHEDULE schedule=' + scheduleId + ' phases=' + ids.length + ' from=' + start + ' span=' + totalDays + 'd');
    return { scheduled: ids.length, start: start, span: totalDays };
  }

  // foldCost(db, scheduleId, RATES, ratesDefault, currency) — §AUTHOR-1 step ④ (5D).
  // The cost breakdown is a FOLD, not hand-entry: each leaf phase's cost = Σ of its assigned
  // elements' 5D cost (quantity × rate). NON-INVENT — reuses the shipped 5D model verbatim
  // (analysis_sidecar.js compute5D quantity expressions + rates.js RATES/RATES_DEFAULT). Because
  // cost rolls up FROM task_elements, reassigning an element (assignElement) moves its cost between
  // phases — the authored WBS organizes the cost. Returns per-phase cost + project total.
  function foldCost(db, scheduleId, RATES, ratesDefault, currency) {
    scheduleId = scheduleId || 'SCH_AUTHORED';
    RATES = RATES || {};
    ratesDefault = ratesDefault || { rate: 0, unit: 'EA', desc: 'unmapped' };
    // dominant-face area = longest × second-longest bbox edge (same expr as compute5D).
    var areaExpr =
      "MAX(t.bbox_x,t.bbox_y,t.bbox_z) * CASE " +
      "WHEN t.bbox_x>=t.bbox_y AND t.bbox_x>=t.bbox_z THEN MAX(t.bbox_y,t.bbox_z) " +
      "WHEN t.bbox_y>=t.bbox_x AND t.bbox_y>=t.bbox_z THEN MAX(t.bbox_x,t.bbox_z) " +
      "ELSE MAX(t.bbox_x,t.bbox_y) END";

    // Seed every leaf phase (so a phase whose elements lack bbox still appears, cost 0).
    var phaseOf = {}, order = [];
    var pr = db.exec("SELECT task_id, name FROM tasks WHERE schedule_id='" + scheduleId +
      "' AND (is_summary IS NULL OR is_summary=0) ORDER BY schedule_start, task_id");
    if (pr.length && pr[0].values.length) pr[0].values.forEach(function (r) {
      phaseOf[r[0]] = { taskId: r[0], name: r[1] || r[0], cost: 0, elements: 0 };
      order.push(r[0]);
    });

    var unmapped = {};
    var q = "SELECT te.task_id, m.ifc_class, " +
      "MAX(t.bbox_x,t.bbox_y,t.bbox_z) AS lng, " + areaExpr + " AS area, " +
      "t.bbox_x*t.bbox_y*t.bbox_z AS vol " +
      "FROM task_elements te " +
      "JOIN tasks tk ON tk.task_id=te.task_id AND tk.schedule_id='" + scheduleId +
      "' AND (tk.is_summary IS NULL OR tk.is_summary=0) " +
      "JOIN elements_meta m ON m.guid=te.guid " +
      "JOIN element_transforms t ON t.guid=te.guid " +
      "WHERE t.bbox_x IS NOT NULL AND t.bbox_x>0";
    var er = db.exec(q);
    var total = 0;
    if (er.length && er[0].values.length) {
      er[0].values.forEach(function (row) {
        var tid = row[0], cls = row[1], lng = row[2] || 0, area = row[3] || 0, vol = row[4] || 0;
        var rt = RATES[cls]; if (!rt) { rt = ratesDefault; unmapped[cls] = (unmapped[cls] || 0) + 1; }
        var unit = rt.unit || 'EA';
        var qty = unit === 'M' ? lng : unit === 'M2' ? area : unit === 'M3' ? vol : 1;
        var cost = Math.round((rt.rate || 0) * qty);
        var p = phaseOf[tid]; if (!p) return;   // element on a summary/foreign task — skip
        p.cost += cost; p.elements++; total += cost;
      });
    }
    var phases = order.map(function (tid) { return phaseOf[tid]; });
    var unmappedClasses = Object.keys(unmapped);
    console.log('§AUTHOR_COST schedule=' + scheduleId + ' total=' + total +
      ' phases=' + phases.length + ' unmappedClasses=' + unmappedClasses.length +
      (unmappedClasses.length ? ' [' + unmappedClasses.join(',') + ']' : ''));
    return { currency: currency || '', total: total, phases: phases, unmappedClasses: unmappedClasses };
  }

  // ── §SE-1 — WBS outline + dependency CRUD (the MSP-grade Gantt arc, step 1+2) ──────────────
  // Pure, DOM-free reads/writes over the IFC-native tables. Rendered by the TM panel's Gantt
  // drawer + P6/MSP section (time_machine.js — the old Editor-tab surface was folded in,
  // §TM_P6_FOLD 2026-08-24); the engine stays node-testable (W-SCHED-EDIT). Writes go
  // STRAIGHT to task_sequences — the IFC-native dependency truth — exactly as assignElement writes
  // task_elements (kernel_ops signing still deferred; §SE-D signed broadcast is a later slice).

  var SEQ_TYPES = ['FS', 'SS', 'FF', 'SF'];   // IfcSequenceEnum: FINISH_START/START_START/FINISH_FINISH/START_FINISH

  // wbsTree(db, scheduleId) — fold tasks.wbs_parent/is_summary into a nested tree. Roots = rows whose
  // wbs_parent is null OR points outside this schedule's id set. Returns [{id,name,isSummary,start,
  // finish,guidCount,children[]}] depth-first. Pure read; the collapsible outline renders this.
  function wbsTree(db, scheduleId) {
    var r;
    try {
      r = db.exec('SELECT task_id, wbs_parent, name, is_summary, schedule_start, schedule_finish, ' +
        'is_critical, total_float, free_float, schedule_duration, status FROM tasks WHERE schedule_id=? ', [scheduleId]);
    } catch (e) { return []; }
    if (!r.length || !r[0].values.length) return [];
    var nodes = {}, ids = {};
    // §XER/PMXML writer (prompts/XER_PMXML_WRITER_LANE.md §3.3): freeFloat/durDays/status are ADDITIVE
    // fields — already stored in the wide `tasks` table by adoptIntoDb, just not read here before this.
    // No schema change, no new columns; existing callers never destructured these and are unaffected.
    r[0].values.forEach(function (row) {
      ids[row[0]] = true;
      var durM = /^P(-?\d+(?:\.\d+)?)D$/.exec(row[9] || '');
      nodes[row[0]] = { id: row[0], parent: row[1], name: row[2] || row[0],
        isSummary: !!row[3], start: row[4] || null, finish: row[5] || null,
        critical: row[6] === 1, totalFloat: (row[7] != null ? row[7] : null),
        freeFloat: (row[8] != null ? row[8] : null),
        durDays: (durM ? parseFloat(durM[1]) : null),
        status: row[10] || null,
        guidCount: 0, children: [] };
    });
    // Element counts per task (the "N elements" badge on a leaf).
    try {
      var cr = db.exec('SELECT te.task_id, COUNT(*) FROM task_elements te ' +
        'JOIN tasks t ON t.task_id=te.task_id WHERE t.schedule_id=? GROUP BY te.task_id', [scheduleId]);
      if (cr.length && cr[0].values.length) cr[0].values.forEach(function (row) {
        if (nodes[row[0]]) nodes[row[0]].guidCount = row[1];
      });
    } catch (e) {}
    var roots = [];
    Object.keys(nodes).forEach(function (id) {
      var n = nodes[id];
      if (n.parent && ids[n.parent] && n.parent !== id) nodes[n.parent].children.push(n);
      else roots.push(n);
    });
    console.log('§SE_WBS schedule=' + scheduleId + ' nodes=' + Object.keys(nodes).length +
      ' roots=' + roots.length);
    return roots;
  }

  // listDependencies(db, scheduleId) — read task_sequences (pred→succ, type, lag), joined to task
  // names, scoped to the schedule via the predecessor's schedule_id. Returns
  // [{predId,predName,succId,succName,type,lag}].
  function listDependencies(db, scheduleId) {
    var r;
    try {
      r = db.exec('SELECT s.predecessor_id, p.name, s.successor_id, c.name, s.sequence_type, s.lag_days ' +
        'FROM task_sequences s ' +
        'JOIN tasks p ON p.task_id=s.predecessor_id ' +
        'JOIN tasks c ON c.task_id=s.successor_id ' +
        'WHERE p.schedule_id=? ORDER BY p.name, c.name', [scheduleId]);
    } catch (e) { return []; }
    if (!r.length || !r[0].values.length) return [];
    return r[0].values.map(function (row) {
      return { predId: row[0], predName: row[1] || row[0], succId: row[2], succName: row[3] || row[2],
        type: row[4] || 'FS', lag: (row[5] != null ? row[5] : 0) };
    });
  }

  // wouldCycle(db, predId, succId) — would adding pred→succ create a directed cycle? DFS forward from
  // succ over existing edges; if we reach pred, the new edge closes a loop. Deterministic graph-integrity
  // guard (a cyclic schedule is INVALID) — NOT resource optimisation (§SE-B: forbid the cycle, DO IT).
  function wouldCycle(db, predId, succId) {
    if (predId === succId) return true;
    var adj = {};
    try {
      var r = db.exec('SELECT predecessor_id, successor_id FROM task_sequences');
      if (r.length && r[0].values.length) r[0].values.forEach(function (row) {
        (adj[row[0]] = adj[row[0]] || []).push(row[1]);
      });
    } catch (e) {
      // §S58 (§S58.2): this guard FAILS OPEN. With adj={} the DFS below finds nothing and
      // wouldCycle() returns false for EVERY check — the sole guard against a cyclic (invalid)
      // schedule is blind, and silently. The fail-open behaviour is NOT changed here (that is a
      // separate decision with its own witness); this makes the blindness loud.
      console.warn('§WOULD_CYCLE_BLIND task_sequences unreadable — ' + (e && e.message) +
        ' — cycle detection is DISABLED for this call, every edge will be reported acyclic');
    }
    var stack = [succId], seen = {};
    while (stack.length) {
      var cur = stack.pop();
      if (cur === predId) return true;
      if (seen[cur]) continue;
      seen[cur] = true;
      (adj[cur] || []).forEach(function (n) { if (!seen[n]) stack.push(n); });
    }
    return false;
  }

  // addDependency(db, predId, succId, type, lag) — author one IfcRelSequence edge. Refuses self-loop,
  // unknown task, duplicate, and any cycle. Returns {ok, reason}.
  function addDependency(db, predId, succId, type, lag) {
    type = (type || 'FS').toUpperCase();
    if (SEQ_TYPES.indexOf(type) < 0) type = 'FS';
    lag = (lag == null || isNaN(parseFloat(lag))) ? 0 : parseFloat(lag);
    function fail(reason) {
      console.log('§SE_DEP_FAIL ' + predId + '->' + succId + ' reason=' + reason);
      return { ok: false, predId: predId, succId: succId, reason: reason };
    }
    if (!predId || !succId) return fail('missing_id');
    if (predId === succId) return fail('self_loop');
    function exists(id) { var t = db.exec('SELECT 1 FROM tasks WHERE task_id=?', [id]); return t.length && t[0].values.length; }
    if (!exists(predId) || !exists(succId)) return fail('no_such_task');
    var dup = db.exec('SELECT 1 FROM task_sequences WHERE predecessor_id=? AND successor_id=?', [predId, succId]);
    if (dup.length && dup[0].values.length) return fail('duplicate');
    if (wouldCycle(db, predId, succId)) return fail('cycle');
    db.run('INSERT INTO task_sequences VALUES (?,?,?,?)', [predId, succId, type, lag]);
    console.log('§SE_DEP_ADD ' + predId + '->' + succId + ' type=' + type + ' lag=' + lag);
    return { ok: true, predId: predId, succId: succId, type: type, lag: lag };
  }

  // removeDependency(db, predId, succId) — drop one edge. Returns {ok, removed}.
  function removeDependency(db, predId, succId) {
    var before = db.exec('SELECT COUNT(*) FROM task_sequences')[0].values[0][0];
    db.run('DELETE FROM task_sequences WHERE predecessor_id=? AND successor_id=?', [predId, succId]);
    var after = db.exec('SELECT COUNT(*) FROM task_sequences')[0].values[0][0];
    console.log('§SE_DEP_DEL ' + predId + '->' + succId + ' removed=' + (before - after));
    return { ok: before - after > 0, removed: before - after };
  }

  // updateDependency(db, predId, succId, patch) — retype (FS/SS/FF/SF) and/or set lag on an edge.
  function updateDependency(db, predId, succId, patch) {
    patch = patch || {};
    var row = db.exec('SELECT sequence_type, lag_days FROM task_sequences WHERE predecessor_id=? AND successor_id=?', [predId, succId]);
    if (!row.length || !row[0].values.length) {
      console.log('§SE_DEP_UPD_FAIL ' + predId + '->' + succId + ' reason=no_such_edge');
      return { ok: false, reason: 'no_such_edge' };
    }
    var type = row[0].values[0][0], lag = row[0].values[0][1];
    if (patch.type != null) { var t = String(patch.type).toUpperCase(); if (SEQ_TYPES.indexOf(t) >= 0) type = t; }
    if (patch.lag != null && !isNaN(parseFloat(patch.lag))) lag = parseFloat(patch.lag);
    db.run('UPDATE task_sequences SET sequence_type=?, lag_days=? WHERE predecessor_id=? AND successor_id=?',
      [type, lag, predId, succId]);
    console.log('§SE_DEP_UPD ' + predId + '->' + succId + ' type=' + type + ' lag=' + lag);
    return { ok: true, type: type, lag: lag };
  }

  // ── §SE-2 — bounded CPM forward/backward pass (step 3; the deterministic compute, NOT leveling) ──
  // Exact critical-path method over the authored task_sequences DAG, honouring FS/SS/FF/SF + lag.
  // This is the §SE-B "DO IT" half; it STOPS before resource leveling / auto-optimisation (the refuse).

  // duration in whole days: parse ISO P{n}D / P{n}W, else (finish-start), else 1.
  function _durDays(durStr, startStr, finishStr) {
    if (durStr) {
      var d = /P(?:(\d+)W)?(?:(\d+)D)?/.exec(durStr);
      if (d && (d[1] || d[2])) return (parseInt(d[1] || 0, 10) * 7) + parseInt(d[2] || 0, 10);
    }
    if (startStr && finishStr) {
      var ms = Date.parse(finishStr + 'T00:00:00Z') - Date.parse(startStr + 'T00:00:00Z');
      if (!isNaN(ms)) return Math.max(0, Math.round(ms / 86400000));
    }
    return 1;
  }

  // candidate EARLY START a predecessor imposes on a successor (forward pass + free-float reuse).
  function _fwdES(pred, lag, type, succDur) {
    switch (type) {
      case 'SS': return pred.es + lag;
      case 'FF': return pred.ef + lag - succDur;
      case 'SF': return pred.es + lag - succDur;
      default:   return pred.ef + lag;                 // FS
    }
  }
  // candidate LATE FINISH a successor imposes on a predecessor (backward pass).
  function _bwdLF(succ, lag, type, predDur) {
    var succLS = succ.lf - succ.dur;
    switch (type) {
      case 'SS': return succLS - lag + predDur;
      case 'FF': return succ.lf - lag;
      case 'SF': return succ.lf - lag + predDur;
      default:   return succLS - lag;                  // FS
    }
  }

  // moveTask(db, taskId, newStart) — §SE-3 drag-to-reschedule verb. Move one LEAF task so it starts on
  // newStart (YYYY-MM-DD), PRESERVING its duration (parsed from schedule_duration, else old finish−start,
  // else 1). Writes schedule_start/finish only — the baseline; CPM invalidation is the caller's concern
  // (mirrors the dependency-edit flow). Refuses unknown/summary tasks. Returns {ok, start, finish, days}.
  function moveTask(db, taskId, newStart) {
    var r = db.exec('SELECT is_summary, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE task_id=?', [taskId]);
    if (!r.length || !r[0].values.length) {
      console.log('§SE_MOVE_FAIL task=' + taskId + ' reason=no_such_task');
      return { ok: false, reason: 'no_such_task' };
    }
    var row = r[0].values[0];
    if (row[0] === 1) {
      console.log('§SE_MOVE_FAIL task=' + taskId + ' reason=is_summary');
      return { ok: false, reason: 'is_summary' };
    }
    var days = _durDays(row[3], row[1], row[2]);
    var finish = _addDays(newStart, days);
    db.run('UPDATE tasks SET schedule_start=?, schedule_finish=? WHERE task_id=?', [newStart, finish, taskId]);
    console.log('§SE_MOVE task=' + taskId + ' start=' + newStart + ' finish=' + finish + ' days=' + days);
    return { ok: true, start: newStart, finish: finish, days: days };
  }

  // Shared core: translate an explicit list of task rows by a constant number of days. No
  // constraint checking — a uniform translation of a fixed row set can never create or resolve a
  // task_sequences violation, by construction. duration is untouched.
  function _shiftRows(db, rows, deltaDays) {
    var upd = db.prepare('UPDATE tasks SET schedule_start=?, schedule_finish=? WHERE task_id=?');
    var moved = [];
    db.run('BEGIN');
    rows.forEach(function (row) {
      var taskId = row[0], newStart = _addDays(row[1], deltaDays), newFinish = _addDays(row[2], deltaDays);
      upd.run([newStart, newFinish, taskId]);
      moved.push({ id: taskId, start: newStart, finish: newFinish });
    });
    upd.free();
    db.run('COMMIT');
    return moved;
  }

  // §TM_RULER_SHIFT (2026-08-05, user ruling: dragging the Gantt drawer's day ruler adjusts the
  // whole project's start/finish, "updated of course along with any other edit"). Translate EVERY
  // task in the schedule — leaf AND summary alike.
  function shiftSchedule(db, scheduleId, deltaDays) {
    var r = db.exec('SELECT task_id, schedule_start, schedule_finish FROM tasks WHERE schedule_id=?', [scheduleId]);
    if (!r.length || !r[0].values.length) {
      console.log('§SE_SHIFT_FAIL schedule=' + scheduleId + ' reason=no_tasks');
      return { ok: false, reason: 'no_tasks' };
    }
    var moved = _shiftRows(db, r[0].values, deltaDays);
    console.log('§SE_SHIFT schedule=' + scheduleId + ' deltaDays=' + deltaDays + ' tasks=' + moved.length);
    return { ok: true, moved: moved, deltaDays: deltaDays };
  }

  // §GANTT_GROUP_MOVE (2026-08-05, user ruling: marquee-select a cluster of bars, MS-Word-style —
  // "when dragging a bar, it drags along its group"). Same uniform-translate primitive as
  // shiftSchedule, scoped to an explicit task_id list (the marquee selection) instead of a whole
  // schedule. The selection itself is ephemeral UI state, never persisted — only the resulting date
  // change is a real edit.
  function shiftTasks(db, taskIds, deltaDays) {
    if (!taskIds || !taskIds.length) return { ok: false, reason: 'no_tasks' };
    var placeholders = taskIds.map(function () { return '?'; }).join(',');
    var r = db.exec('SELECT task_id, schedule_start, schedule_finish FROM tasks WHERE task_id IN (' + placeholders + ')', taskIds);
    if (!r.length || !r[0].values.length) {
      console.log('§SE_GROUP_SHIFT_FAIL reason=no_matching_tasks');
      return { ok: false, reason: 'no_tasks' };
    }
    var moved = _shiftRows(db, r[0].values, deltaDays);
    console.log('§SE_GROUP_SHIFT tasks=' + moved.length + ' deltaDays=' + deltaDays);
    return { ok: true, moved: moved, deltaDays: deltaDays };
  }

  // ── §GANTT_EDIT C1/C2 — constraint-aware move (prompts/4D_SCHEDULE_PERFECTION.md §GANTT_EDIT) ──
  // moveTask() above deliberately writes dates and nothing else ("CPM invalidation is the caller's
  // concern"). That is the right primitive but the WRONG thing to put under a user's finger: a drag
  // with no constraint checking lets a user "fix" a real schedule violation by dragging it out of
  // sight instead of fixing its cause — directly against the Prime Rule. This is the caller that
  // supplies the missing half: clamp on the way back, cascade on the way forward.
  //
  // SEMANTICS — push-only, deliberately:
  //   C2 CLAMP   a move EARLIER than the task's predecessors permit is refused and clamped to the
  //              earliest legal date, reporting which predecessor bound it. Never silently accepted.
  //   C1 CASCADE a move LATER drags every real task_sequences successor that would otherwise start
  //              before its constraint, transitively.
  //   Successors are only ever pushed LATER, never pulled earlier. This follows the idiom this file
  //   and time_machine.js already use everywhere (§4D_HOST_BEFORE_HOSTED, §PHASE_OVERLAP_SUPPORT_GUARD
  //   — "push after, never re-key"), and it avoids silently re-optimising a schedule the user did not
  //   ask us to touch: they moved ONE bar. Pulling successors earlier could also violate their OTHER
  //   predecessors, turning one drag into an unbounded re-solve.
  function _dayNum(s) { var t = Date.parse(s + 'T00:00:00Z'); return isNaN(t) ? null : Math.round(t / 86400000); }
  function _dayStr(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }

  // Earliest legal start (in day numbers) for `id` given its predecessors' CURRENT dates.
  // IfcSequenceEnum semantics, the same four this file's computeCpm already solves.
  function _earliestStart(id, T, preds) {
    var list = preds[id]; if (!list || !list.length) return null;
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var e = list[i], P = T[e.pred]; if (!P) continue;
      var dur = T[id] ? T[id].dur : 1, lag = e.lag || 0, c;
      switch (e.type) {
        case 'SS': c = P.start + lag; break;
        case 'FF': c = P.finish + lag - dur; break;
        case 'SF': c = P.start + lag - dur; break;
        default:   c = P.finish + lag;          // FS
      }
      if (best === null || c > best) { best = c; e._binding = true; }
    }
    return best;
  }

  function _bindingPred(id, T, preds, at) {
    var list = preds[id] || [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i], P = T[e.pred]; if (!P) continue;
      var dur = T[id] ? T[id].dur : 1, lag = e.lag || 0, c;
      switch (e.type) {
        case 'SS': c = P.start + lag; break;
        case 'FF': c = P.finish + lag - dur; break;
        case 'SF': c = P.start + lag - dur; break;
        default:   c = P.finish + lag;
      }
      if (c === at) return e.pred + '(' + e.type + (lag ? (lag > 0 ? '+' : '') + lag + 'd' : '') + ')';
    }
    return null;
  }

  // moveTaskCascade(db, scheduleId, taskId, newStart, opts) →
  //   { ok, start, finish, clamped, clampedFrom, blockedBy, moved:[{id,start,finish}], cascaded }
  // opts.dryRun — compute and report without writing (used by the drag preview and by the witness).
  function moveTaskCascade(db, scheduleId, taskId, newStart, opts) {
    opts = opts || {};
    var T = {}, ids = [], preds = {}, succs = {};
    var tr;
    try {
      tr = db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration, is_summary ' +
        'FROM tasks WHERE schedule_id=?', [scheduleId]);
    } catch (e) { return { ok: false, reason: 'no_tasks' }; }
    if (!tr.length || !tr[0].values.length) return { ok: false, reason: 'no_tasks' };
    tr[0].values.forEach(function (row) {
      if (row[4] === 1) return;                       // summaries are rolled up, never moved directly
      var s = _dayNum(row[1]); if (s === null) return;
      var dur = _durDays(row[3], row[1], row[2]);
      T[row[0]] = { id: row[0], start: s, finish: s + dur, dur: dur };
      ids.push(row[0]);
    });
    if (!T[taskId]) { console.log('§GANTT_EDIT_MOVE_FAIL task=' + taskId + ' reason=no_such_task'); return { ok: false, reason: 'no_such_task' }; }
    try {
      var er = db.exec('SELECT predecessor_id, successor_id, sequence_type, lag_days FROM task_sequences');
      if (er.length && er[0].values.length) er[0].values.forEach(function (row) {
        if (!T[row[0]] || !T[row[1]]) return;          // edge leaving this schedule's leaf set
        var e = { pred: row[0], succ: row[1], type: row[2] || 'FS', lag: row[3] != null ? row[3] : 0 };
        (preds[row[1]] = preds[row[1]] || []).push(e);
        (succs[row[0]] = succs[row[0]] || []).push(e);
      });
    } catch (e) {
      // §S58 (§S58.2): on a throw, preds/succs stay empty and the cascade computes a move with NO
      // predecessor clamp and NO successor cascade — indistinguishable in the log from "this task
      // genuinely has no dependencies." Behaviour unchanged; the difference is now stated.
      console.warn('§CASCADE_BLIND task_sequences unreadable — ' + (e && e.message) +
        ' — this move runs with no predecessor clamp and no successor cascade');
    }

    // ---- C2: clamp against this task's own predecessors.
    var want = _dayNum(newStart);
    if (want === null) return { ok: false, reason: 'bad_date' };
    var floor = _earliestStart(taskId, T, preds);
    var clamped = false, clampedFrom = null, blockedBy = null;
    if (floor !== null && want < floor) {
      clamped = true; clampedFrom = newStart;
      blockedBy = _bindingPred(taskId, T, preds, floor);
      want = floor;
      console.log('§GANTT_EDIT_CLAMP task=' + taskId + ' requested=' + clampedFrom +
        ' clampedTo=' + _dayStr(want) + ' blockedBy=' + blockedBy);
    }

    // ---- Apply to the in-memory model, then C1: cascade forward, push-only.
    T[taskId].start = want; T[taskId].finish = want + T[taskId].dur;
    var moved = {}; moved[taskId] = true;
    var queue = [taskId], guard = 0, limit = ids.length * 4 + 16;
    while (queue.length) {
      if (++guard > limit) { console.log('§GANTT_EDIT_CASCADE_ABORT task=' + taskId + ' reason=iteration_limit'); break; }
      var cur = queue.shift(), out = succs[cur] || [];
      for (var i = 0; i < out.length; i++) {
        var sid = out[i].succ, S = T[sid]; if (!S) continue;
        var es = _earliestStart(sid, T, preds);
        if (es !== null && S.start < es) {           // push-only: never pull a successor earlier
          S.start = es; S.finish = es + S.dur;
          moved[sid] = true;
          queue.push(sid);
        }
      }
    }

    var movedList = Object.keys(moved).map(function (id) {
      return { id: id, start: _dayStr(T[id].start), finish: _dayStr(T[id].finish), days: T[id].dur };
    });
    if (!opts.dryRun) {
      db.run('BEGIN');
      var st = db.prepare('UPDATE tasks SET schedule_start=?, schedule_finish=?, schedule_duration=? WHERE task_id=?');
      movedList.forEach(function (m) { st.run([m.start, m.finish, 'P' + m.days + 'D', m.id]); });
      st.free();
      db.run('COMMIT');
    }
    console.log('§GANTT_EDIT_MOVE task=' + taskId + ' start=' + _dayStr(T[taskId].start) +
      ' finish=' + _dayStr(T[taskId].finish) + ' clamped=' + clamped +
      ' cascaded=' + (movedList.length - 1) + (opts.dryRun ? ' (dryRun)' : ''));
    return { ok: true, start: _dayStr(T[taskId].start), finish: _dayStr(T[taskId].finish),
      clamped: clamped, clampedFrom: clampedFrom, blockedBy: blockedBy,
      moved: movedList, cascaded: movedList.length - 1 };
  }

  // resizeTask(db, scheduleId, taskId, newStart, newFinish, opts) — §GANTT_EDIT E2, the edge-pull.
  // moveTask/moveTaskCascade preserve duration by design, so resize needs its own verb rather than
  // overloading them. Writes the new duration, then re-runs the SAME clamp+cascade so a lengthened
  // bar pushes its successors exactly as a moved one does.
  function resizeTask(db, scheduleId, taskId, newStart, newFinish, opts) {
    opts = opts || {};
    var s = _dayNum(newStart), f = _dayNum(newFinish);
    if (s === null || f === null) return { ok: false, reason: 'bad_date' };
    if (f <= s) f = s + 1;                              // never zero/negative duration
    var r = db.exec('SELECT is_summary FROM tasks WHERE task_id=?', [taskId]);
    if (!r.length || !r[0].values.length) return { ok: false, reason: 'no_such_task' };
    if (r[0].values[0][0] === 1) return { ok: false, reason: 'is_summary' };
    db.run('UPDATE tasks SET schedule_start=?, schedule_finish=?, schedule_duration=? WHERE task_id=?',
      [_dayStr(s), _dayStr(f), 'P' + (f - s) + 'D', taskId]);
    console.log('§GANTT_EDIT_RESIZE task=' + taskId + ' start=' + _dayStr(s) + ' finish=' + _dayStr(f) +
      ' days=' + (f - s));
    return moveTaskCascade(db, scheduleId, taskId, _dayStr(s), opts);
  }

  // rescheduleAsap(db, scheduleId, opts) — §GANTT_RESCHEDULE_ASAP, the EXPLICIT pull-back verb.
  // moveTaskCascade above is push-only BY DESIGN (its own header: "Successors are only ever pushed
  // LATER, never pulled earlier") — an ordinary drag must never silently re-optimise the schedule.
  // The product decision (4D_GANTT_TM_REFACTOR.md lane, user-decided) is that "reschedule as early
  // as possible" ships as a deliberate, user-triggered action instead — THIS verb — so the
  // annotate-only drag contract (§S68) stays intact.
  //
  // SEMANTICS — compression only:
  //   · Forward topological pass over task_sequences, the same Kahn sort + IfcSequenceEnum ES math
  //     computeCpm's non-fixedDates forward pass runs (_fwdES semantics, re-expressed over the
  //     tasks' REAL current day positions rather than a zero-anchored es/ef frame).
  //   · A task with NO predecessors (in this schedule's leaf set) keeps its CURRENT start — roots
  //     anchor the project; this closes gaps CPM can prove are pure float, it does not re-baseline
  //     the whole programme to day zero.
  //   · A task is NEVER moved later: if its derived ES is >= its current start (including a task
  //     already sitting ahead of a violated constraint), it is left byte-identical.
  //   · Summaries (is_summary=1) are skipped — they roll up, same as moveTaskCascade.
  //   · Duration preserved; same BEGIN/prepare/run/free/COMMIT write shape as moveTaskCascade.
  // opts.dryRun — compute and report without writing (witness convention, same as moveTaskCascade).
  // → { ok, moved:[{id,start,finish,days,daysPulled}], projectDurationBefore, projectDurationAfter,
  //     daysCompressed, finishBefore, finishAfter }  |  { ok:false, reason }
  function rescheduleAsap(db, scheduleId, opts) {
    opts = opts || {};
    var tr;
    try {
      tr = db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration, is_summary ' +
        'FROM tasks WHERE schedule_id=?', [scheduleId]);
    } catch (e) { console.log('§GANTT_RESCHEDULE_ASAP_FAIL schedule=' + scheduleId + ' reason=no_tasks'); return { ok: false, reason: 'no_tasks' }; }
    if (!tr.length || !tr[0].values.length) { console.log('§GANTT_RESCHEDULE_ASAP_FAIL schedule=' + scheduleId + ' reason=no_tasks'); return { ok: false, reason: 'no_tasks' }; }
    var T = {}, ids = [];
    tr[0].values.forEach(function (row) {
      if (row[4] === 1) return;                       // summaries are rolled up, never moved directly
      var s = _dayNum(row[1]); if (s === null) return;
      var dur = _durDays(row[3], row[1], row[2]);
      T[row[0]] = { id: row[0], start: s, finish: s + dur, dur: dur, preds: [], succs: [] };
      ids.push(row[0]);
    });
    if (!ids.length) { console.log('§GANTT_RESCHEDULE_ASAP_FAIL schedule=' + scheduleId + ' reason=no_tasks'); return { ok: false, reason: 'no_tasks' }; }
    try {
      var er = db.exec('SELECT predecessor_id, successor_id, sequence_type, lag_days FROM task_sequences');
      if (er.length && er[0].values.length) er[0].values.forEach(function (row) {
        if (!T[row[0]] || !T[row[1]]) return;          // edge leaving this schedule's leaf set
        var e = { pred: row[0], succ: row[1], type: (row[2] || 'FS').toUpperCase(), lag: row[3] != null ? row[3] : 0 };
        T[row[1]].preds.push(e); T[row[0]].succs.push(e);
      });
    } catch (e) {
      // Unlike moveTaskCascade's §CASCADE_BLIND (where a blind move is still the user's own explicit
      // one-bar edit), a blind PULL-BACK would compress every task onto its own start — a no-op — so
      // refuse loudly instead of "succeeding" at nothing.
      console.log('§GANTT_RESCHEDULE_ASAP_FAIL schedule=' + scheduleId + ' reason=no_sequences — ' + (e && e.message));
      return { ok: false, reason: 'no_sequences' };
    }
    // Kahn topo sort — same cycle/orphan bail computeCpm runs (§SE-1 guards authored edges, but a
    // captured import can carry anything; never iterate a cyclic graph).
    var indeg = {}, queue = [], topo = [];
    ids.forEach(function (id) { indeg[id] = T[id].preds.length; if (indeg[id] === 0) queue.push(id); });
    while (queue.length) {
      var cur = queue.shift(); topo.push(cur);
      T[cur].succs.forEach(function (e) { if (--indeg[e.succ] === 0) queue.push(e.succ); });
    }
    if (topo.length !== ids.length) {
      console.log('§GANTT_RESCHEDULE_ASAP_FAIL schedule=' + scheduleId + ' reason=cycle topo=' + topo.length + ' tasks=' + ids.length);
      return { ok: false, reason: 'cycle' };
    }
    var minStartBefore = Infinity, finishBefore = -Infinity;
    ids.forEach(function (id) {
      if (T[id].start < minStartBefore) minStartBefore = T[id].start;
      if (T[id].finish > finishBefore) finishBefore = T[id].finish;
    });
    // FORWARD pass in topo order, over the working (already-compressed-upstream) positions.
    // newStart[id] is the task's post-compression start; a root keeps its current start, a task with
    // predecessors takes max(candidate ES over preds) capped at its own current start (never later).
    var newStart = {};
    topo.forEach(function (id) {
      var t = T[id];
      if (!t.preds.length) { newStart[id] = t.start; return; }
      var es = null;
      t.preds.forEach(function (e) {
        var P = T[e.pred];
        var pS = newStart[e.pred] != null ? newStart[e.pred] : P.start;
        var pF = pS + P.dur, c;
        switch (e.type) {                              // same four IfcSequenceEnum cases as _fwdES
          case 'SS': c = pS + e.lag; break;
          case 'FF': c = pF + e.lag - t.dur; break;
          case 'SF': c = pS + e.lag - t.dur; break;
          default:   c = pF + e.lag;                   // FS
        }
        if (es === null || c > es) es = c;
      });
      newStart[id] = (es !== null && es < t.start) ? es : t.start;   // compression only, never later
    });
    var moved = [];
    topo.forEach(function (id) {
      var t = T[id];
      if (newStart[id] >= t.start) return;             // untouched (roots, tight tasks, ES>=current)
      var daysPulled = t.start - newStart[id];
      t.start = newStart[id]; t.finish = t.start + t.dur;
      moved.push({ id: id, start: _dayStr(t.start), finish: _dayStr(t.finish), days: t.dur, daysPulled: daysPulled });
    });
    var minStartAfter = Infinity, finishAfter = -Infinity;
    ids.forEach(function (id) {
      if (T[id].start < minStartAfter) minStartAfter = T[id].start;
      if (T[id].finish > finishAfter) finishAfter = T[id].finish;
    });
    if (moved.length && !opts.dryRun) {
      db.run('BEGIN');
      var st = db.prepare('UPDATE tasks SET schedule_start=?, schedule_finish=?, schedule_duration=? WHERE task_id=?');
      moved.forEach(function (m) { st.run([m.start, m.finish, 'P' + m.days + 'D', m.id]); });
      st.free();
      db.run('COMMIT');
    }
    var daysCompressed = finishBefore - finishAfter;
    console.log('§GANTT_RESCHEDULE_ASAP schedule=' + scheduleId + ' moved=' + moved.length +
      ' finishBefore=' + _dayStr(finishBefore) + ' finishAfter=' + _dayStr(finishAfter) +
      ' daysCompressed=' + daysCompressed + (opts.dryRun ? ' (dryRun)' : ''));
    return { ok: true, moved: moved,
      projectDurationBefore: finishBefore - minStartBefore,
      projectDurationAfter: finishAfter - minStartAfter,
      daysCompressed: daysCompressed,
      finishBefore: _dayStr(finishBefore), finishAfter: _dayStr(finishAfter) };
  }

  // setBaseline(db, scheduleId) — §GANTT_EDIT_UNDO's transport-row sibling, ⚑ Set Baseline
  // (4D_SCHEDULE_PERFECTION.md "the transport row's two buttons"). P6 baseline = a frozen snapshot
  // of every task's dates, taken at a deliberate moment, compared against the live (possibly
  // since-edited) schedule — SCHEDULE variance, a different axis from §TM-VARIANCE's existing
  // C_Project PlannedAmt/CommittedAmt COST variance, which this does not touch.
  // Single baseline (not P6's multi-baseline numbering) — MVP scope, matches the definition the
  // user confirmed 2026-08-05: re-running this OVERWRITES the prior baseline, it does not version it.
  // Snapshots EVERY task row for the schedule (including summaries) so project-level rollup variance
  // is available too, not just leaf tasks.
  function setBaseline(db, scheduleId) {
    db.run('CREATE TABLE IF NOT EXISTS task_baseline (task_id TEXT PRIMARY KEY, schedule_id TEXT, ' +
      'baseline_start TEXT, baseline_finish TEXT, baseline_duration TEXT, set_at TEXT)');
    var tr = db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE schedule_id=?', [scheduleId]);
    if (!tr.length || !tr[0].values.length) { console.log('§GANTT_SET_BASELINE_FAIL reason=no_tasks'); return { ok: false, reason: 'no_tasks' }; }
    var setAt = new Date().toISOString();
    db.run('BEGIN');
    db.run('DELETE FROM task_baseline WHERE schedule_id=?', [scheduleId]);
    var st = db.prepare('INSERT INTO task_baseline VALUES (?,?,?,?,?,?)');
    tr[0].values.forEach(function (row) { st.run([row[0], scheduleId, row[1], row[2], row[3], setAt]); });
    st.free();
    db.run('COMMIT');
    console.log('§GANTT_SET_BASELINE schedule=' + scheduleId + ' tasks=' + tr[0].values.length + ' setAt=' + setAt);
    return { ok: true, taskCount: tr[0].values.length, setAt: setAt };
  }

  // getBaselineVariance(db, scheduleId) — reads BOTH tables, computes nothing that isn't a direct
  // date subtraction of two already-real, already-persisted values. varianceDays > 0 = the task now
  // finishes LATER than its baseline (slip); < 0 = earlier. `projectVarianceDays` is TASK_ROOT's own
  // row if present (its schedule_finish is already the whole project's real end, same convention
  // moveTaskCascade/materializeZones use elsewhere in this file — never re-derived by scanning leaves).
  function getBaselineVariance(db, scheduleId) {
    var br;
    try { br = db.exec('SELECT task_id, baseline_start, baseline_finish FROM task_baseline WHERE schedule_id=?', [scheduleId]); }
    catch (e) { return { ok: false, reason: 'no_baseline' }; }
    if (!br.length || !br[0].values.length) return { ok: false, reason: 'no_baseline' };
    var baseline = {};
    br[0].values.forEach(function (row) { baseline[row[0]] = { start: row[1], finish: row[2] }; });
    var tr = db.exec('SELECT task_id, name, schedule_start, schedule_finish, is_summary FROM tasks WHERE schedule_id=?', [scheduleId]);
    var tasks = [], projectVarianceDays = null;
    (tr.length ? tr[0].values : []).forEach(function (row) {
      var tid = row[0], b = baseline[tid]; if (!b) return;   // a task added after baseline was set — no variance to report
      var varianceDays = _dayNum(row[3]) - _dayNum(b.finish);
      tasks.push({ taskId: tid, name: row[1], baselineStart: b.start, baselineFinish: b.finish,
        currentStart: row[2], currentFinish: row[3], varianceDays: varianceDays });
      if (tid === 'TASK_ROOT') projectVarianceDays = varianceDays;
    });
    return { ok: true, tasks: tasks, projectVarianceDays: projectVarianceDays };
  }

  // computeCpm(db, scheduleId, opts) — write early/late dates, float, is_critical onto the leaf tasks.
  // fixedDates opt (§ZONE_CPM_COHERENCE): computeCpm's forward pass normally DERIVES each task's
  // early start from the graph (max over predecessors' EF+lag) — correct when the dates themselves
  // are the thing being solved for (a captured P6 schedule re-solving after an edit, or the
  // phase-level chain, which is a simple ≤1-parent-per-node list where derivation and the real dates
  // always agree). It stops being correct once a node can have MULTIPLE real parents, as
  // materializeZones' zone graph does (a zone can be gated by both its own-phase floor-below AND a
  // same-floor earlier trade): each incoming edge's lag was computed independently from ONE real
  // observed pair, so taking the graph max over several independently-derived lags can compound past
  // what the real, jointly-crew-constrained computation (ScheduleGate.computeSchedule — the same
  // engine driving the live movie) actually produced. MEASURED on Terminal's 71-zone graph: derived
  // PF=138d vs the real movie's 93d (+48%, CPM_FLOAT_GAP.md session note, 2026-08-03).
  // Fix: when opts.fixedDates is set, es/ef come DIRECTLY from the already-real, already-movie-
  // coherent schedule_start/schedule_finish this task was persisted with — never re-derived through
  // the graph. The backward pass (LS/LF/float/critical) is UNCHANGED and still runs over real edges,
  // so float/criticality stay meaningful; only the (previously-compounding) forward derivation is
  // skipped. Opt-in, not the default — existing callers (phase-level, captured P6) get byte-identical
  // behavior; only a caller that already trusts its own persisted dates as ground truth sets this.
  function computeCpm(db, scheduleId, opts) {
    opts = opts || {};
    var tr;
    try {
      tr = db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks ' +
        'WHERE schedule_id=? AND (is_summary IS NULL OR is_summary=0)', [scheduleId]);
    } catch (e) { return { error: 'no_tasks' }; }
    if (!tr.length || !tr[0].values.length) return { error: 'no_tasks', tasks: [], projectDuration: 0, criticalIds: [] };
    var minStart = null;
    tr[0].values.forEach(function (row) { var s = row[1]; if (s && (!minStart || s < minStart)) minStart = s; });
    var projStart = opts.start || minStart || '2026-01-01';
    var T = {}, ids = [];
    tr[0].values.forEach(function (row) {
      var id = row[0], s = row[1], f = row[2];
      var dur = _durDays(row[3], s, f);
      var fixedEs = opts.fixedDates && s ? _durDays(null, projStart, s) : 0;
      T[id] = { id: id, dur: dur, es: fixedEs, ef: fixedEs + dur, ls: 0, lf: 0, preds: [], succs: [] };
      ids.push(id);
    });
    // edges among these leaf tasks only
    var er = db.exec('SELECT predecessor_id, successor_id, sequence_type, lag_days FROM task_sequences');
    if (er.length && er[0].values.length) er[0].values.forEach(function (row) {
      var p = row[0], s = row[1];
      if (!T[p] || !T[s]) return;                      // skip edges touching summary/foreign tasks
      var edge = { pred: p, succ: s, type: (row[2] || 'FS').toUpperCase(), lag: (row[3] != null ? row[3] : 0) };
      T[s].preds.push(edge); T[p].succs.push(edge);
    });
    // Kahn topo sort (DAG guaranteed by the §SE-1 cycle guard; bail defensively if not) — still run
    // under fixedDates too: it's the cycle/orphan integrity check, independent of the ES derivation.
    var indeg = {}, queue = [], topo = [];
    ids.forEach(function (id) { indeg[id] = T[id].preds.length; if (indeg[id] === 0) queue.push(id); });
    while (queue.length) {
      var id = queue.shift(); topo.push(id);
      T[id].succs.forEach(function (e) { if (--indeg[e.succ] === 0) queue.push(e.succ); });
    }
    if (topo.length !== ids.length) {
      console.log('§SE_CPM_BAIL cycle-or-orphan topo=' + topo.length + ' tasks=' + ids.length);
      return { error: 'cycle', tasks: [], projectDuration: 0, criticalIds: [] };
    }
    // FORWARD: ES/EF in topo order — SKIPPED under fixedDates (see header); es/ef already set above
    // from the real persisted dates.
    if (!opts.fixedDates) {
      topo.forEach(function (id) {
        var t = T[id], es = 0;
        t.preds.forEach(function (e) { es = Math.max(es, _fwdES(T[e.pred], e.lag, e.type, t.dur)); });
        t.es = Math.max(0, es); t.ef = t.es + t.dur;
      });
    }
    var PF = 0; ids.forEach(function (id) { PF = Math.max(PF, T[id].ef); });
    // BACKWARD: LF/LS in reverse topo order. A task's late finish can never legitimately exceed the
    // project's own finish PF — that IS the definition of "project finish." The un-clamped succs-loop
    // result can overshoot PF for a task whose only successor edge is SS/SF (constrains the
    // SUCCESSOR's START, never THIS task's finish) — e.g. a §PHASE_OVERLAP_BAND-style SS chain where
    // an early, long-duration phase (its EF ends up defining PF itself) is followed by a short-lag
    // successor: nothing in the graph consumes that predecessor's FINISH, so the naive backward pass
    // (mirroring only its successor's late START) can compute an LF hundreds of days past PF — a
    // provably-impossible float that silently zeroed the critical path on any SS-only chain (this
    // was never exercised before task_sequences carried real SS edges — CPM_FLOAT_GAP.md Gap 1).
    for (var i = topo.length - 1; i >= 0; i--) {
      var t = T[topo[i]];
      if (!t.succs.length) t.lf = PF;
      else { var lf = Infinity; t.succs.forEach(function (e) { lf = Math.min(lf, _bwdLF(T[e.succ], e.lag, e.type, t.dur)); }); t.lf = Math.min(lf, PF); }
      t.ls = t.lf - t.dur;
    }
    // float + critical + free float + write-back
    var projStart = opts.start || minStart || '2026-01-01';
    var critical = [];
    var stmt = db.prepare('UPDATE tasks SET early_start=?, early_finish=?, late_start=?, late_finish=?, ' +
      'free_float=?, total_float=?, is_critical=? WHERE task_id=?');
    var out = topo.map(function (id) {
      var t = T[id];
      var total = t.ls - t.es;
      var free = Infinity;
      t.succs.forEach(function (e) { free = Math.min(free, T[e.succ].es - _fwdES(t, e.lag, e.type, T[e.succ].dur)); });
      if (!isFinite(free)) free = total;
      free = Math.max(0, free);
      var isCrit = total <= 0 ? 1 : 0;
      if (isCrit) critical.push(id);
      stmt.run([_addDays(projStart, t.es), _addDays(projStart, t.ef),
        _addDays(projStart, t.ls), _addDays(projStart, t.lf),
        String(free), String(total), isCrit, id]);
      return { id: id, es: t.es, ef: t.ef, ls: t.ls, lf: t.lf, dur: t.dur,
        totalFloat: total, freeFloat: free, critical: !!isCrit };
    });
    stmt.free();
    console.log('§SE_CPM schedule=' + scheduleId + ' tasks=' + out.length + ' projectDuration=' + PF +
      ' critical=' + critical.length + ' [' + critical.join(',') + ']');
    return { projectDuration: PF, projectStart: projStart, tasks: out, criticalIds: critical };
  }

  // ── §SE-WBS: deepen the WBS — add a task, or break a phase down by an element attribute ──────────────
  // addTask(db, scheduleId, opts) — the Editor's "＋ sub-task" / "＋ sibling". opts: { taskId?, name?,
  // wbsParent? }. A new task is a LEAF (is_summary=0) and INHERITS its parent's date window so it shows in
  // the TM at once. The parent is NOT forced to a summary — it keeps its own elements + _cap coverage (only
  // breakdown, which empties the parent, marks it summary). Pass taskId for cross-tab replay determinism;
  // else TASK_<slug(name)> with a numeric suffix on collision. Returns { ok, taskId, parent }.
  function addTask(db, scheduleId, opts) {
    opts = opts || {};
    _ensureWideTasks(db);
    var parent = opts.wbsParent || null;
    var ps = null, pf = null, pdur = null;
    if (parent) {
      var pr = db.exec('SELECT schedule_start, schedule_finish, schedule_duration FROM tasks WHERE task_id=? AND schedule_id=?', [parent, scheduleId]);
      if (!pr.length || !pr[0].values.length) { console.log('§SE_ADDTASK_FAIL parent=' + parent + ' reason=no_such_parent'); return { ok: false, reason: 'no_such_parent' }; }
      ps = pr[0].values[0][0]; pf = pr[0].values[0][1]; pdur = pr[0].values[0][2];
    }
    var name = opts.name || 'New Task';
    var tid = opts.taskId;
    if (!tid) {
      var base = 'TASK_' + (_slug(name) || 'X'); tid = base; var k = 1;
      while (true) { var ex = db.exec('SELECT 1 FROM tasks WHERE task_id=?', [tid]); if (!ex.length || !ex[0].values.length) break; tid = base + '_' + (++k); }
    }
    db.run('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,0,?,?,?,?,?)',
      [tid, scheduleId, parent, name, 'CONSTRUCTION', ps, pf, pdur, null, 'PLANNED']);
    console.log('§SE_ADDTASK id=' + tid + ' parent=' + (parent || '(root)') + ' name="' + name + '"');
    return { ok: true, taskId: tid, parent: parent };
  }

  // reparentTask(db, scheduleId, taskId, newParentId) — §SE-5b Indent/Outdent: move one WBS node under a
  // different parent (or to root when newParentId is null). Refuses self, unknown task/parent, and any
  // move that would create a cycle (newParentId is taskId or one of its own descendants). A newly-indented
  // leaf inherits nothing (it keeps its own dates/assignments — only its position in the tree changes);
  // the caller (UI) is responsible for picking a sensible newParentId (indent = previous sibling, outdent =
  // current grandparent). Returns { ok, taskId, wbsParent } or { ok:false, reason }.
  function reparentTask(db, scheduleId, taskId, newParentId) {
    function fail(reason) { console.log('§SE_REPARENT_FAIL task=' + taskId + ' newParent=' + newParentId + ' reason=' + reason); return { ok: false, reason: reason }; }
    if (!taskId) return fail('missing_id');
    if (newParentId && newParentId === taskId) return fail('self_parent');
    var tr = db.exec('SELECT wbs_parent FROM tasks WHERE task_id=? AND schedule_id=?', [taskId, scheduleId]);
    if (!tr.length || !tr[0].values.length) return fail('no_such_task');
    if (newParentId) {
      var pr = db.exec('SELECT 1 FROM tasks WHERE task_id=? AND schedule_id=?', [newParentId, scheduleId]);
      if (!pr.length || !pr[0].values.length) return fail('no_such_parent');
      // cycle guard: walk newParentId's ancestor chain; if it reaches taskId, the move would loop.
      var cur = newParentId, seen = {}, guard = 0;
      while (cur && !seen[cur] && guard++ < 10000) {
        if (cur === taskId) return fail('cycle');
        seen[cur] = true;
        var ar = db.exec('SELECT wbs_parent FROM tasks WHERE task_id=?', [cur]);
        cur = (ar.length && ar[0].values.length) ? ar[0].values[0][0] : null;
      }
    }
    db.run('UPDATE tasks SET wbs_parent=? WHERE task_id=?', [newParentId || null, taskId]);
    console.log('§SE_REPARENT task=' + taskId + ' -> parent=' + (newParentId || '(root)'));
    return { ok: true, taskId: taskId, wbsParent: newParentId || null };
  }

  // breakdownByAttribute(db, scheduleId, taskId, attr) — auto-split a leaf phase's assigned elements into
  // child sub-tasks grouped by an elements_meta attribute (storey | ifc_class/type | discipline). Each
  // distinct value → child "<parent> · <value>" (DETERMINISTIC id parentId__<slug(value)> so a peer replay
  // converges), the parent's elements move to the matching child, and the parent becomes a summary roll-up
  // (is_summary=1 → dropped from _cap; children inherit its window so coverage is preserved). Returns
  // { ok, parent, attr, groups:[{taskId,value,count}], created }.
  var _BREAKDOWN_ATTRS = { storey: 'storey', ifc_class: 'ifc_class', class: 'ifc_class', type: 'ifc_class', discipline: 'discipline' };
  function breakdownByAttribute(db, scheduleId, taskId, attr) {
    _ensureWideTasks(db);
    var col = _BREAKDOWN_ATTRS[String(attr || '').toLowerCase()];
    if (!col) { console.log('§SE_BREAKDOWN_FAIL reason=bad_attr attr=' + attr); return { ok: false, reason: 'bad_attr' }; }
    var pr = db.exec('SELECT name, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE task_id=? AND schedule_id=?', [taskId, scheduleId]);
    if (!pr.length || !pr[0].values.length) { console.log('§SE_BREAKDOWN_FAIL reason=no_such_task task=' + taskId); return { ok: false, reason: 'no_such_task' }; }
    var pName = pr[0].values[0][0] || taskId, ps = pr[0].values[0][1], pf = pr[0].values[0][2], pdur = pr[0].values[0][3];
    var gr = db.exec("SELECT COALESCE(NULLIF(m." + col + ",''),'(none)') v, te.guid FROM task_elements te " +
      "JOIN elements_meta m ON m.guid=te.guid WHERE te.task_id=? ORDER BY v", [taskId]);
    if (!gr.length || !gr[0].values.length) { console.log('§SE_BREAKDOWN_FAIL reason=no_elements task=' + taskId); return { ok: false, reason: 'no_elements' }; }
    var groups = {};
    gr[0].values.forEach(function (row) { (groups[row[0]] || (groups[row[0]] = [])).push(row[1]); });
    var vals = Object.keys(groups).sort();
    if (vals.length < 2) { console.log('§SE_BREAKDOWN_SKIP task=' + taskId + ' attr=' + col + ' reason=single_group'); return { ok: false, reason: 'single_group', groups: vals }; }
    var out = [], created = 0;
    vals.forEach(function (v) {
      var cid = taskId + '__' + (_slug(v) || 'none');
      var ex = db.exec('SELECT 1 FROM tasks WHERE task_id=?', [cid]);
      if (!ex.length || !ex[0].values.length) {
        db.run('INSERT INTO tasks (task_id,schedule_id,wbs_parent,name,predefined_type,is_summary,schedule_start,schedule_finish,schedule_duration,resource,status) VALUES (?,?,?,?,?,0,?,?,?,?,?)',
          [cid, scheduleId, taskId, pName + ' · ' + v, 'CONSTRUCTION', ps, pf, pdur, null, 'PLANNED']);
        created++;
      }
      groups[v].forEach(function (g) { db.run('DELETE FROM task_elements WHERE guid=?', [g]); db.run('INSERT OR IGNORE INTO task_elements VALUES (?,?)', [cid, g]); });
      out.push({ taskId: cid, value: v, count: groups[v].length });
    });
    db.run('UPDATE tasks SET is_summary=1 WHERE task_id=? AND schedule_id=?', [taskId, scheduleId]);
    console.log('§SE_BREAKDOWN parent=' + taskId + ' attr=' + col + ' groups=' + vals.length + ' created=' + created);
    return { ok: true, parent: taskId, attr: col, groups: out, created: created };
  }

  // ── §SE-6: persist authored schedule edits back to the shared IndexedDB building cache ──────────
  // GAP THIS CLOSES: materializeDefault/assignElement/addDependency/moveTask/reparentTask/etc. all
  // write straight to the in-memory sql.js `db` — but NOTHING saved that db back anywhere. Neither
  // the ✎ Author wizard (which edits the SAME db as the main viewer, `APP.db`) nor the ↗ Editor tab
  // (its OWN separate in-memory copy) survived a tab close: kernel_ops.js's own IDB persistence
  // (`§KRN_PERSIST`) only fires on a signed `commitOp()` — schedule-table writes never go through it
  // (kernel_ops mirroring is explicitly deferred, per the module header above). So a closed tab lost
  // every authored phase/dependency/date — a "professional" editor that silently discards work.
  // Fix: ONE shared debounced-persist helper (both UIs call this, not divergent copies), reusing the
  // EXACT IDB-open pattern kernel_ops.js already proved correct — prefer `APP.openCacheDB()` (the
  // app's single opener; kernel_ops.js's own comment documents a past bug where a raw
  // `indexedDB.open('bim_ootb_cache', 1)` drifted behind scene.js's real version and silently never
  // fired). Same cache store ('dbs'), same key (the building URL) `cachedFetch`/`_idbGetDb` already
  // read from — so a reopened tab (Editor OR a fresh viewer load) picks up the edited bytes for free,
  // no new read-path needed.
  // openBuildingCache() — the ONE opener for 'bim_ootb_cache', usable from ANY surface. Prefers
  // `APP.openCacheDB()` (scene.js's opener) when present so we share its exact handle/version. But the
  // ↗ Editor tab is a standalone page that NEVER loads scene.js — if it's the FIRST surface to ever
  // touch this IndexedDB in a fresh profile, a bare unversioned `indexedDB.open('bim_ootb_cache')`
  // creates an empty v1 database with NO object stores (this was caught live: W-SCHED-PERSIST's first
  // run FAILED with "no cache store" for exactly this reason). Fix: version-open at 2 with the SAME
  // onupgradeneeded schema as scene.js A.openCacheDB (`dbs` + `timestamps` stores) so whichever
  // surface opens it FIRST creates a schema fully compatible with the other.
  function openBuildingCache() {
    var g = (typeof window !== 'undefined') ? window : global;
    if (g.APP && g.APP.openCacheDB) return g.APP.openCacheDB();
    return new Promise(function (resolve) {
      var idbFactory = (typeof indexedDB !== 'undefined') ? indexedDB : g.indexedDB;
      if (!idbFactory) { resolve(null); return; }
      try {
        var rq = idbFactory.open('bim_ootb_cache', 2);   // matches scene.js A.openCacheDB exactly
        rq.onupgradeneeded = function () {
          var idb = rq.result;
          if (!idb.objectStoreNames.contains('dbs')) idb.createObjectStore('dbs');
          if (!idb.objectStoreNames.contains('timestamps')) idb.createObjectStore('timestamps');
        };
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { resolve(null); };
        rq.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  var _persistTimers = {};   // url -> timer, so rapid edits on the SAME db coalesce into one write
  // §SCHED_PERSIST_KEY (4D_GANTT_TM_REFACTOR.md §S70) — key the write the way the READER keys it.
  // MEASURED live before this fix: a Gantt drag persisted fine (§SCHED_PERSIST ok=true, 15264KB),
  // the reload hit the cache (§CACHE_HIT Duplex_extracted.db 14.3MB), and the edit was GONE — two
  // different slots. scene.js's cachedFetch looks blobs up under DbResolve.cacheKey(url) (W-DB-CACHE-KEY:
  // '/buildings/X.db' and 'buildings/X.db?v=2' both fold to 'buildings/X.db'), while every persist path
  // wrote under the RAW url. cachedFetch treats the raw url as the LEGACY slot and only reads it when
  // the canonical key MISSES — so on any profile that has ever loaded the building normally, every
  // persisted edit was written somewhere nothing reads. That silently broke the old Editor tab's
  // §SE-6 ("edits vanish on tab close" — schedule_editor_ui.js, since folded into the TM panel,
  // §TM_P6_FOLD) and kernel_ops.js's "survive refresh" too, not just this path.
  function _cacheKeyFor(url) {
    var DR = (typeof window !== 'undefined') && window.DbResolve;
    var A = (typeof window !== 'undefined') && (window.APP || window.A);
    return (DR && DR.cacheKey) ? DR.cacheKey(url, A && A.PROD_BASE) : url;
  }

  function persistDb(db, url, opts) {
    opts = opts || {};
    if (!db || !url) return Promise.resolve(false);
    var key = _cacheKeyFor(url);
    var delay = opts.immediate ? 0 : (opts.delay != null ? opts.delay : 1200);
    if (_persistTimers[url]) { clearTimeout(_persistTimers[url]); }
    return new Promise(function (resolve) {
      _persistTimers[url] = setTimeout(function () {
        delete _persistTimers[url];
        try {
          var buf = db.export().buffer;
          openBuildingCache().then(function (idb) {
            if (!idb || !idb.objectStoreNames.contains('dbs')) {
              console.warn('§SCHED_PERSIST_ERR no cache store url=' + url); resolve(false); return;
            }
            // §SCHED_PERSIST_LRU_TOUCH (bim-compiler 4D_GANTT_TM_REFACTOR.md §5b): stamp 'timestamps'
            // in the SAME transaction as the blob. Until this, persistDb wrote 'dbs' ONLY, so an
            // edited slot kept whatever timestamp cachedFetch left on it at first download — making
            // the ONE entry that holds unsaved user work the OLDEST entry in the store, i.e. the
            // FIRST thing scene.js's LRU evictor throws away. Editing your schedule literally moved
            // your data to the front of the deletion queue (MEASURED: after three persists the
            // Hospital meta slot still had no timestamp of its own at all).
            var _hasTs = idb.objectStoreNames.contains('timestamps');
            var tx = idb.transaction(_hasTs ? ['dbs', 'timestamps'] : ['dbs'], 'readwrite');
            tx.objectStore('dbs').put(buf, key);
            if (_hasTs) tx.objectStore('timestamps').put(Date.now(), key);
            tx.oncomplete = function () {
              console.log('§SCHED_PERSIST url=' + url + ' key=' + key + ' size=' + (buf.byteLength / 1024).toFixed(0) + 'KB');
              resolve(true);
            };
            tx.onerror = function () { console.warn('§SCHED_PERSIST_ERR tx ' + (tx.error && tx.error.message)); resolve(false); };
            // §SCHED_PERSIST_ABORT — a tx that ABORTS fires neither oncomplete nor (always) onerror.
            // Without this handler the promise never settled: _tmPersistEdit's .then() never ran, so
            // a failed save logged NOTHING and told the user NOTHING. Chrome aborts here for real
            // reasons — a single IDB value over ~127MiB (a big building's meta.db can reach it) or a
            // genuine QuotaExceededError — and each one silently discarded the user's edit.
            tx.onabort = function () {
              var e = tx.error;
              console.warn('§SCHED_PERSIST_ERR abort key=' + key + ' size=' + (buf.byteLength / 1024).toFixed(0) + 'KB' +
                ' err=' + (e ? (e.name + ': ' + e.message) : '(tx.error was null)'));
              resolve(false);
            };
          }).catch(function (e) { console.warn('§SCHED_PERSIST_ERR open ' + (e && e.message)); resolve(false); });
        } catch (e) { console.warn('§SCHED_PERSIST_ERR', e); resolve(false); }
      }, delay);
    });
  }

  var API = {
    _cacheKeyFor: _cacheKeyFor,   // §S70: read and write MUST derive the slot the same way
    matchRule: matchRule,
    matchNameOverride: matchNameOverride,
    // §TM_DURATION_SYNC — exported so time_machine.js's playback-clock duration engine
    // (getInstallSecs, viewer/time_machine.js ~3478) can call the SAME fragmentation-aware
    // install-seconds formula the WBS/Gantt authoring path uses, instead of carrying its own
    // hand-duplicated copy that silently lost the §LABOR_QUANTITY_WEIGHT area-weighting fix
    // (commit d35366a). Single source of truth — do not fork these again.
    _installSecs: _installSecs,
    _classFragmentation: _classFragmentation,
    _linearWeighting: _linearWeighting,
    FRAGMENT_M2_FLOOR: FRAGMENT_M2_FLOOR,
    materializeDefault: materializeDefault,
    materializeZones: materializeZones,
    _buildScheduleElements: _buildScheduleElements,
    instantiateTemplate: instantiateTemplate,
    // §TPL_LEVEL_AXIS — exported so the axis and its disagreement measurement are testable on their
    // own, without having to drive a whole materializeZones write to see them.
    _deriverLevelAxis: _deriverLevelAxis,
    _logLevelDisagreement: _logLevelDisagreement,
    remapSolveToTasks: remapSolveToTasks,
    scheduleContiguous: scheduleContiguous,
    activeSchedule: activeSchedule,
    assignElement: assignElement,
    foldCost: foldCost,
    SEQ_TYPES: SEQ_TYPES,
    wbsTree: wbsTree,
    listDependencies: listDependencies,
    wouldCycle: wouldCycle,
    addDependency: addDependency,
    removeDependency: removeDependency,
    updateDependency: updateDependency,
    computeCpm: computeCpm,
    moveTask: moveTask,
    moveTaskCascade: moveTaskCascade,   // §GANTT_EDIT C1/C2 — the constraint-aware move
    shiftSchedule: shiftSchedule,       // §TM_RULER_SHIFT — uniform whole-project date shift
    shiftTasks: shiftTasks,             // §GANTT_GROUP_MOVE — uniform date shift over an explicit task_id list
    resizeTask: resizeTask,             // §GANTT_EDIT E2 — edge-pull, duration changes
    rescheduleAsap: rescheduleAsap,     // §GANTT_RESCHEDULE_ASAP — explicit pull-back, compression only
    setBaseline: setBaseline,           // ⚑ Set Baseline — schedule variance snapshot, single baseline
    getBaselineVariance: getBaselineVariance,
    addTask: addTask,
    reparentTask: reparentTask,
    breakdownByAttribute: breakdownByAttribute,
    persistDb: persistDb,
    openBuildingCache: openBuildingCache
  };
  if (typeof window !== 'undefined') window.ScheduleAuthor = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.ScheduleAuthor = API;

  console.log('§SCHEDULE_AUTHOR_LOADED v8');
})(typeof self !== 'undefined' ? self : this);
