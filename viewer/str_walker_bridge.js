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

  var _state = null;  // { base: {grid,walked,girders}, columnCount }

  function _readColumns(db) {
    var res = db.exec("SELECT m.guid,t.center_x,t.center_y,t.center_z FROM elements_meta m " +
      "JOIN element_transforms t ON t.guid=m.guid WHERE m.discipline='STR' AND m.ifc_class='IfcColumn'");
    if (!res.length) return [];
    return res[0].values.map(function (r) { return { guid: r[0], x: r[1], y: r[2], z: r[3] }; });
  }

  // Init the walker state from the opened building (the ARC twin's STR columns = the walk anchors).
  function swbInit(db, opts) {
    var cols = _readColumns(db);
    if (!cols.length) { console.warn('§STRWALK-INIT no STR columns in this building'); _state = null; return null; }
    var base = SW.swWalkSkeleton(cols, opts || {});
    _state = { base: base, columnCount: cols.length };
    console.log('§STRWALK-INIT columns=' + cols.length + ' grid=' + base.grid.xLines.length + '×' +
      base.grid.yLines.length + ' girders=' + base.girders.length);
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

  // Data for the Outliner STR walker tab (the §VISION-LOCK Disc-tab follower view).
  function swbTabData() {
    if (!_state) return null;
    var g = _state.base, sig = { RED: 0, ORANGE: 0, GREEN: 0 };
    g.girders.forEach(function (gd) { sig[SW.swCheckGirder(gd.span, {}).signal]++; });
    return { columns: g.walked.length, girders: g.girders.length,
             grid: g.grid.xLines.length + '×' + g.grid.yLines.length, signals: sig };
  }

  var api = { swbInit: swbInit, swbOnGridMove: swbOnGridMove, swbTabData: swbTabData };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') Object.keys(api).forEach(function (k) { window[k] = api[k]; });
})();
