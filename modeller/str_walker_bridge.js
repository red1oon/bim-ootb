/**
 * BIM OOTB — STR Walker Bridge (engine → live modeller)
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * Connects the proven STR walker (str_walker.js) to the modeller's signed op-log + Outliner:
 *   building DB → walker base state → on GEOM_GRID_MOVE → swReWalk → kernel_ops commits → STR tab.
 * STR_ROUTEWALKING_SPEC.md §6 item (7). Flag-gated (?strwalk) in modeller.html; edits no existing file.
 *
 * Commit is DEPENDENCY-INJECTED: the browser passes KernelOps.commitOp bound to APP.db; the witness
 * passes the REAL kernel_ops.js commit against a sql.js DB (proves row compatibility). provenance is
 * folded INTO the stored params so traceability survives the persisted row. NON-INVENT throughout.
 */
'use strict';
(function () {
  var SW = (typeof require !== 'undefined') ? require('./str_walker.js') : (typeof window !== 'undefined' ? window : this);
  var WC = (typeof require !== 'undefined') ? require('./walker_confidence.js') : (typeof window !== 'undefined' ? window : this);

  var _state = null;  // { base: {grid,walked,girders}, columnCount }

  function _readColumns(db) {
    var res = db.exec("SELECT m.guid,t.center_x,t.center_y,t.center_z,t.bbox_x,t.bbox_y,t.bbox_z FROM elements_meta m " +
      "JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='STR' AND m.ifc_class='IfcColumn'");
    if (!res.length) return [];
    return res[0].values.map(function (r) {
      return { guid: r[0], x: r[1], y: r[2], z: r[3], bx: r[4], by: r[5], bz: r[6] };
    });
  }

  // MEASURED median helper (non-invent — never a hand-picked constant).
  function _median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); return s[(s.length - 1) >> 1]; }

  // §8E-1b — the girder cross-section = the MEASURED median of REAL source IfcBeam (the W-DW-PRIM doctrine: measure the
  // size, never invent it). A beam's bbox = (length, width, depth); length VARIES per beam (we use the derived span),
  // so the cross-section = the TWO SMALLER medians (Terminal: 0.500 × 0.750). null when the building carries no beams.
  function _readBeamSection(db) {
    var res = db.exec("SELECT t.bbox_x,t.bbox_y,t.bbox_z FROM elements_meta m " +
      "JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='STR' AND m.ifc_class='IfcBeam'");
    if (!res.length || !res[0].values.length) return null;
    var mx = _median(res[0].values.map(function (r) { return r[0]; }));
    var my = _median(res[0].values.map(function (r) { return r[1]; }));
    var mz = _median(res[0].values.map(function (r) { return r[2]; }));
    var dims = [mx, my, mz].sort(function (a, b) { return a - b; });   // drop the largest (= length)
    return { width: dims[0], depth: dims[1], n: res[0].values.length };
  }

  // ARC walls = the dropped substrate for a wall-bearing (ARC-only) building. cx/cy + bbox extents
  // (lx/ly) feed swDeriveSemiGrid; the long axis is the wall's run direction (non-invent, measured).
  function _readArcWalls(db) {
    var res = db.exec("SELECT t.center_x,t.center_y,t.bbox_x,t.bbox_y FROM elements_meta m " +
      "JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='ARC' AND " +
      "m.ifc_class IN ('IfcWall','IfcWallStandardCase')");
    if (!res.length) return [];
    return res[0].values.map(function (r) { return { cx: r[0], cy: r[1], lx: r[2], ly: r[3] }; });
  }

  // Init the walker state from the opened building. AUTO-PICK the grid source (the noted follow-up):
  //   • STR columns present  → column-framed: swWalkSkeleton (grid from columns, walk girders).
  //   • no STR columns       → wall-bearing (ARC-only drop): swDeriveSemiGrid from ARC walls = the
  //                            editing datum/handle; impose NO column frame (W-STR-GENERAL-SC: the walk
  //                            fabricates nothing). This is the user case — drop an ARC-only job, walk it.
  function swbInit(db, opts) {
    opts = opts || {};
    var cols = _readColumns(db);
    if (cols.length) {
      var base = SW.swWalkSkeleton(cols, opts);
      var colBbox = {}; cols.forEach(function (c) { colBbox[c.guid] = { bx: c.bx, by: c.by, bz: c.bz }; });
      var section = _readBeamSection(db);   // measured girder cross-section (null = no source beams)
      var colDz = _median(cols.map(function (c) { return c.bz; })) || 0;  // representative column height
      _state = { base: base, columnCount: cols.length, system: 'column-framed',
                 colBbox: colBbox, section: section, colDz: colDz };
      console.log('§STRWALK-INIT column-framed: columns=' + cols.length + ' grid=' + base.grid.xLines.length +
        '×' + base.grid.yLines.length + ' girders=' + base.girders.length +
        ' beamSection=' + (section ? section.width.toFixed(3) + '×' + section.depth.toFixed(3) + 'm (n=' + section.n + ')' : 'none'));
      return _state;
    }
    // ARC-only / wall-bearing: derive the SEMI-GRID from ARC walls, fabricate no column skeleton.
    var walls = _readArcWalls(db);
    if (!walls.length) { console.warn('§STRWALK-INIT no STR columns AND no ARC walls — nothing to walk'); _state = null; return null; }
    var grid = SW.swDeriveSemiGrid(walls, opts);
    _state = { base: { grid: { xLines: grid.xLines, yLines: grid.yLines }, walked: [], girders: [] },
               columnCount: 0, wallCount: walls.length, system: 'wall-bearing', gridSource: grid.source };
    console.log('§STRWALK-INIT wall-bearing: 0 STR columns, ' + walls.length + ' ARC walls → semi-grid ' +
      grid.xLines.length + '×' + grid.yLines.length + ' (' + grid.source + '; no column frame imposed)');
    return _state;
  }

  // React to a committed GEOM_GRID_MOVE: re-walk STR + commit the cascade as signed ops.
  //   gridMoveParams = { axis:'x'|'y', datum, delta } (bonsai_gridmove.js GEOM_GRID_MOVE)
  //   commit = function(opType, params, inputGuids, outputGuid)  (e.g. KernelOps.commitOp bound to db)
  function swbOnGridMove(gridMoveParams, commit, opts) {
    opts = opts || {};
    if (!_state) { console.warn('§STRWALK-REWALK no state — call swbInit first'); return null; }
    var edit = { axis: gridMoveParams.axis, datum: gridMoveParams.datum, delta: gridMoveParams.delta,
                 material: opts.material || 'STEEL' };
    // The live authoring-grid line position is not bit-identical to the walker's emergent datum →
    // snap it to the nearest walker gridline so the re-walk targets the right structural bay.
    var lines = edit.axis === 'x' ? _state.base.grid.xLines : _state.base.grid.yLines;
    if (lines && lines.length) {
      var snapped = SW.swNearest(edit.datum, lines).line;
      if (snapped !== edit.datum) console.log('§STRWALK-SNAP datum ' + edit.datum + ' → walker ' + snapped);
      edit.datum = snapped;
    }
    var rw = SW.swReWalk(_state.base, edit, opts);
    var committed = 0;
    rw.ops.forEach(function (op) {
      if (op.opType === 'GEOM_GRID_MOVE') return;          // the grid edit already committed by the modeller
      var inputGuids = op.params.srcGuid ? [op.params.srcGuid] : (op.params.guid ? [op.params.guid] : null);
      var params = Object.assign({}, op.params,            // fold provenance/source INTO params so the row keeps it
        { provenance: op.provenance }, op.source ? { source: op.source } : {});
      commit(op.opType, params, inputGuids, null);
      committed++;
    });
    _state.base = rw.after;                                 // FOLD: the re-walked state becomes current
    console.log('§STRWALK-REWALK Δ=' + edit.delta + 'm ' + edit.axis + '@' + edit.datum +
      ' → ' + committed + ' STR ops, ' + rw.exceptions.length + ' exception(s)');
    rw.exceptions.forEach(function (e) {
      console.log('§STRWALK-EXCEPTION ' + e.oldSignal + '→' + e.newSignal + ' @' + e.span.toFixed(1) + 'm: ' + e.message);
    });
    return { committed: committed, exceptions: rw.exceptions, ops: rw.ops };
  }

  // Replay recorded grid-move edits onto a FRESH walk (after swbInit) so reopening a building re-applies
  // its prior edits WITHOUT re-committing — the ops are ALREADY in the signed log; this just re-folds the
  // walker state to match. Deterministic: the SAME snap + swReWalk as the live edit path (swbOnGridMove),
  // so the replayed state is bit-for-bit the edited state. Drives the mo_<key> instance's visual restore.
  //   edits = [{ axis:'x'|'y', datum, delta }, …]  (in commit order, e.g. from STR_WALK_EDIT op rows)
  function swbReplay(edits, opts) {
    opts = opts || {};
    if (!_state) { console.warn('§STRWALK-REPLAY no state — call swbInit first'); return null; }
    if (!edits || !edits.length) return { applied: 0, exceptions: [] };
    var applied = 0, allEx = [];
    edits.forEach(function (e) {
      var edit = { axis: e.axis, datum: e.datum, delta: e.delta, material: opts.material || 'STEEL' };
      var lines = edit.axis === 'x' ? _state.base.grid.xLines : _state.base.grid.yLines;
      if (lines && lines.length) edit.datum = SW.swNearest(edit.datum, lines).line;   // same snap as live
      var rw = SW.swReWalk(_state.base, edit, opts);
      _state.base = rw.after;                              // FOLD (no commit — already signed in the log)
      allEx = allEx.concat(rw.exceptions);
      applied++;
    });
    console.log('§STRWALK-REPLAY applied ' + applied + ' recorded edit(s) → ' + allEx.length + ' exception(s) (no re-commit)');
    return { applied: applied, exceptions: allEx };
  }

  // ═══ §8E-1b RENDER — emit GEOM_INSERT op-specs for the walked STR skeleton (columns + girders) ═══
  // The walker already HOLDS the skeleton (_state.base.walked + .girders); this turns it into renderable signed ops
  // so production draws it into the laid ARC (mirror of _seedArcEditable for ARC). Pure data — the caller commits.
  // NON-INVENT: column size = its MEASURED bbox; girder LENGTH = the derived bay span; girder CROSS-SECTION = the
  // MEASURED median IfcBeam section (_state.section); elevation = mean column-top (single-level skeleton, logged).
  var STR_COLUMN_COLOR = 0xff8800;   // orange — distinct from ARC
  var STR_GIRDER_COLOR = 0xffc04d;   // lighter amber — the spanning skeleton

  function swbRenderOps(opts) {
    opts = opts || {};
    if (!_state) { console.warn('§STRWALK-RENDER no state — call swbInit first'); return null; }
    var w = _state.base.walked, gird = _state.base.girders, ops = [];
    // 1) columns — measured bbox, seated so its centre lands on the walked grid point (z − bz/2, as the witness proved)
    var colN = 0;
    w.forEach(function (c) {
      var bb = (_state.colBbox && _state.colBbox[c.srcGuid]) || { bx: 0.4, by: 0.4, bz: 3 };
      ops.push({ op_type: 'GEOM_INSERT', outputGuid: c.guid, params: {
        bbox: [-bb.bx / 2, bb.bx / 2, -bb.by / 2, bb.by / 2, -bb.bz / 2, bb.bz / 2],
        placement: { x: c.x, y: c.y, z: c.z - bb.bz / 2, rot: 0 },
        color: STR_COLUMN_COLOR, ifc_class: 'IfcColumn', provenance: 'derived:grid' } });
      colN++;
    });
    // girder elevation = mean walked-column z + half the median column height (top-of-column, single-level skeleton)
    var meanZ = w.length ? w.reduce(function (s, c) { return s + c.z; }, 0) / w.length : 0;
    var gz = meanZ + (_state.colDz || 0) / 2;
    // measured cross-section, or a thin line-proxy + honest log when the building carries no source beams
    var sec = _state.section, proxied = false;
    if (!sec) { sec = { width: 0.05, depth: 0.05 }; proxied = true;
      console.log('§STRWALK-RENDER no measured beam section — girders rendered as 0.05m line-proxy (non-invent)'); }
    // 2) girders — length = bay span; cross-section = measured beam median; axis-aligned along the gridline
    var girN = 0;
    gird.forEach(function (g, i) {
      var span = g.span, hw = sec.width / 2, hd = sec.depth / 2, hs = span / 2, cx, cy, bbox;
      var mid = (g.fromDatum + g.toDatum) / 2;
      if (g.axis === 'Xline@') {            // runs in Y at x = onDatum
        cx = g.onDatum; cy = mid; bbox = [-hw, hw, -hs, hs, -hd, hd];
      } else {                               // 'Yline@' — runs in X at y = onDatum
        cx = mid; cy = g.onDatum; bbox = [-hs, hs, -hw, hw, -hd, hd];
      }
      ops.push({ op_type: 'GEOM_INSERT', outputGuid: g.guid, params: {
        bbox: bbox, placement: { x: cx, y: cy, z: gz, rot: 0 },
        color: STR_GIRDER_COLOR, ifc_class: 'IfcBeam', provenance: 'derived:str-walk' } });
      girN++;
    });
    console.log('§STRWALK-RENDER columns=' + colN + ' girders=' + girN +
      ' section=' + sec.width.toFixed(3) + '×' + sec.depth.toFixed(3) + 'm' + (proxied ? ' (proxy)' : ' (measured)') +
      ' girderZ=' + gz.toFixed(2));
    return { ops: ops, columnN: colN, girderN: girN, section: sec, proxied: proxied, girderZ: gz };
  }

  // ═══ §8E-2a CANOPY — render the STR space-frame as a BOUNDED generative tessellation (instanced-by n) ═══
  // The roof = ONE measured unit repeated over a measured domain. swDeriveTessellation MEASURES the unit/domain/
  // density from the real plate cloud; swWalkTessellation reconstructs the distribution (count + cadence + coverage,
  // NEVER bit-exact positions). The RENDER is CAPPED (§DW-CAP) and strided across the FULL domain so a thinned but
  // representative canopy paints — the COUNT claim is proven NUMERICALLY (predictedN vs extractedN), never by drawing
  // 33K boxes; the verbatim mesh stays the deferred range-stream. NON-INVENT: unit/domain/density all measured; an
  // empty plate set → null tessellation → zero ops (fabricates nothing).
  //   plates: [{ x,y,z, bx,by,bz }] (the real cloud = oracle);  opts.cap (render ceiling, default 2500)
  var STR_CANOPY_COLOR = 0x66ccff;   // light blue — distinct from ARC (white) and the STR skeleton (orange/amber)

  function swbCanopyOps(plates, opts) {
    opts = opts || {};
    var tess = SW.swDeriveTessellation(plates, opts);
    if (!tess) { console.log('§STRWALK-CANOPY no plate cloud — no space-frame (fabricates nothing)'); return { ops: [], tess: null, generatedN: 0, renderedN: 0 }; }
    var n = opts.n != null ? opts.n : tess.predictedN;       // the generative count (measured areal predictor)
    var full = SW.swWalkTessellation(tess, n);               // full reconstructed distribution across the domain
    var cap = opts.cap != null ? opts.cap : 2500;
    var stride = Math.max(1, Math.ceil(full.length / cap));  // thin across the WHOLE domain, not just the first bands
    var u = tess.unit, hx = u.bx / 2, hy = u.by / 2, hz = u.bz / 2, ops = [];
    for (var i = 0; i < full.length; i += stride) {
      var p = full[i];
      ops.push({ op_type: 'GEOM_INSERT', outputGuid: p.guid, params: {
        bbox: [-hx, hx, -hy, hy, -hz, hz], placement: { x: p.x, y: p.y, z: p.z, rot: 0 },
        color: STR_CANOPY_COLOR, ifc_class: 'IfcPlate', provenance: 'derived:str-walk' } });
    }
    console.log('§STRWALK-CANOPY unit=' + u.bx.toFixed(2) + '×' + u.by.toFixed(2) + '×' + u.bz.toFixed(2) +
      'm modalShare=' + (tess.modalShare * 100).toFixed(1) + '% predictedN=' + tess.predictedN +
      ' extractedN=' + tess.extractedN + ' (count err ' + (Math.abs(tess.predictedN - tess.extractedN) / tess.extractedN * 100).toFixed(2) + '%)');
    console.log('§DW-CAP canopy placed=' + ops.length + ' of ' + full.length + ' generated (render bounded; count proven numerically, not drawn)');
    return { ops: ops, tess: tess, generatedN: full.length, renderedN: ops.length, stride: stride };
  }

  // Threshold below which a walked element is HIGHLIGHTED low-confidence in the Outliner Disc-tab.
  // 0.8 sits above the shipped map's low block (P≈0.67) and below its high block (P≈0.93) → it flags
  // exactly the elements the RosettaStone says are least trustworthy.
  var STRWALK_LOW_CONF = 0.8;

  // Data for the Outliner STR walker tab (the §VISION-LOCK Disc-tab follower view). Each girder carries
  // a CALIBRATED confidence (raw guard/rule margin → the SHIPPED Terminal isotonic map) — the EARNED,
  // RosettaStone-calibrated number, never the raw one (spec §4). Low-confidence girders are surfaced.
  function swbTabData() {
    if (!_state) return null;
    var g = _state.base, sig = { RED: 0, ORANGE: 0, GREEN: 0 };
    var maxSpan = SW.SW_SPAN_RULES.STEEL.maxBeamSpan;
    var elements = g.girders.map(function (gd) {
      var chk = SW.swCheckGirder(gd.span, {});
      sig[chk.signal]++;
      var ruleMargin = (maxSpan - gd.span) / maxSpan;     // code comfort (the spread)
      var raw = WC.wcRaw(1, ruleMargin);                  // guard margin ~1 (placed); rule margin varies
      var conf = WC.wcCalibrated(raw);                    // EARNED: shipped Terminal isotonic map
      return { guid: gd.guid, span: gd.span, signal: chk.signal,
               confidence: conf, lowConfidence: conf < STRWALK_LOW_CONF };
    });
    var lowConf = elements.filter(function (e) { return e.lowConfidence; }).length;
    return { columns: g.walked.length, girders: g.girders.length, system: _state.system || 'column-framed',
             grid: g.grid.xLines.length + '×' + g.grid.yLines.length, signals: sig,
             elements: elements, lowConfidence: lowConf, lowConfThreshold: STRWALK_LOW_CONF };
  }

  var api = { swbInit: swbInit, swbOnGridMove: swbOnGridMove, swbReplay: swbReplay, swbRenderOps: swbRenderOps, swbCanopyOps: swbCanopyOps, swbTabData: swbTabData };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') Object.keys(api).forEach(function (k) { window[k] = api[k]; });
})();
