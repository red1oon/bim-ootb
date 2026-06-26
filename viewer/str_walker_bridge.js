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
    var res = db.exec("SELECT m.guid,t.center_x,t.center_y,t.center_z FROM elements_meta m " +
      "JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='STR' AND m.ifc_class='IfcColumn'");
    if (!res.length) return [];
    return res[0].values.map(function (r) { return { guid: r[0], x: r[1], y: r[2], z: r[3] }; });
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
      _state = { base: base, columnCount: cols.length, system: 'column-framed' };
      console.log('§STRWALK-INIT column-framed: columns=' + cols.length + ' grid=' + base.grid.xLines.length +
        '×' + base.grid.yLines.length + ' girders=' + base.girders.length);
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

  var api = { swbInit: swbInit, swbOnGridMove: swbOnGridMove, swbReplay: swbReplay, swbTabData: swbTabData };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') Object.keys(api).forEach(function (k) { window[k] = api[k]; });
})();
