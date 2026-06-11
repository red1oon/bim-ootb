// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/**
 * wh_route.js — SPATIAL PICKING §S-2: the pick list → route verb.
 *   Spec: docs/SPATIAL_PICKING_SPEC.md §S-2 — Witness: W-WH-ROUTE (scripts/poc_wh_route.js).
 *
 * Separation contract (same as erp_engine.js): PURE logic only. No DB binding, no
 * Date.now / Math.random / DOM / network — deterministic (replay/dry-run safe).
 * The host injects the m_bom_line rows (from the compiled warehouse db, §S-1) and
 * the pick-list lines (from the drafted M_Movement / M_InOut doc); this module only
 * ORDERS the walk.
 *
 * Route = ORDER BY the recipe tree's walk sequence (aisle/rack/bin — the ROUTE verb's
 * order rides m_bom_line.ordinal, stamped by scripts/compile_warehouse.js), NOT by
 * line number. A line whose locator is OFF-MODEL surfaces as an explicit
 * `unroutable:true` step at the route tail — NEVER silently dropped (§FALSIFIER).
 */
'use strict';
// UMD (the erp_engine.js tail, verbatim discipline: the browser copy is a UMD of THIS file, no silent fork) —
// node: module.exports · browser: window.WHRoute (viewer/wh_walk.js consumes it, §S-3).
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.WHRoute = api;
})(typeof window !== 'undefined' ? window : null, function () {

  // ── treeFromBom(bomLines) — EXTRACT the walk tree from the compiled warehouse db ──
  // bomLines = m_bom_line rows [{bom_id, child_product_id, role, ordinal, element_ref}].
  // BIN lines carry the walk sequence: walk_seq = ordinal (compile_warehouse.js stamps it
  // aisle-by-aisle, rack-by-rack — W-WH-COMPILE), element_ref = JSON array of m_locator_id.
  // RACK lines recover each rack's aisle (bom_id of the line whose child is the rack).
  // Returns { order:[locatorId…], byLocator:{ locId:{walk_seq, rack, aisle} } }.
  function treeFromBom(bomLines) {
    var aisleOfRack = {};
    bomLines.forEach(function (l) {
      if (l.role === 'RACK') aisleOfRack[l.child_product_id] = l.bom_id;
    });
    var bins = [];
    bomLines.forEach(function (l) {
      if (l.role !== 'BIN' || !l.element_ref) return;
      var locs;
      try { locs = JSON.parse(l.element_ref); } catch (e) { return; }
      (locs || []).forEach(function (locId, idx) {
        bins.push({ locator: String(locId), walk_seq: l.ordinal, idx: idx,
                    rack: l.bom_id, aisle: aisleOfRack[l.bom_id] || null });
      });
    });
    // canonical visit order: (ordinal, in-ref index, locator) — total + deterministic.
    bins.sort(function (a, b) {
      return (a.walk_seq - b.walk_seq) || (a.idx - b.idx) ||
             (a.locator < b.locator ? -1 : a.locator > b.locator ? 1 : 0);
    });
    var byLocator = {}, order = [];
    bins.forEach(function (b, i) {
      if (byLocator[b.locator]) return;           // a locator appears once (W-WH-COMPILE bijection)
      byLocator[b.locator] = { walk_seq: b.walk_seq, walkIndex: i, rack: b.rack, aisle: b.aisle };
      order.push(b.locator);
    });
    return { order: order, byLocator: byLocator };
  }

  // ── route(lines, tree, opts) — §S-2 the pure route verb ──
  // lines: pick-list lines (drafted M_Movement / M_InOut lines). tree: treeFromBom output.
  // opts.locatorOf(line) -> the locator the picker must WALK TO (default line.m_locator_id —
  //   the pick source; put-away reverses via opts, §S-6, same verb).
  // opts.lineKey(line)   -> stable identity for the deterministic tiebreak (default
  //   line.m_movementline_id, else line.line).
  // Returns [step]: { step, of, m_locator_id, rack, aisle, walk_seq, unroutable, line } —
  // every input line EXACTLY once; same lines + same tree ⇒ same route (no clock, no RNG,
  // input ORDER does not matter — the tiebreak is the line's own key, not array position).
  function route(lines, tree, opts) {
    opts = opts || {};
    var locatorOf = opts.locatorOf || function (l) { return l.m_locator_id; };
    var lineKey = opts.lineKey || function (l) {
      return l.m_movementline_id != null ? l.m_movementline_id : l.line;
    };
    var routable = [], unroutable = [];
    lines.forEach(function (l) {
      var loc = String(locatorOf(l));
      var node = tree.byLocator[loc];
      if (node) routable.push({ line: l, loc: loc, node: node, key: lineKey(l) });
      else unroutable.push({ line: l, loc: loc, key: lineKey(l) });   // §FALSIFIER: surfaced, never dropped
    });
    function byKey(a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; }
    routable.sort(function (a, b) { return (a.node.walkIndex - b.node.walkIndex) || byKey(a, b); });
    unroutable.sort(byKey);
    var n = lines.length;
    var steps = routable.map(function (r, i) {
      return { step: i + 1, of: n, m_locator_id: r.loc, rack: r.node.rack, aisle: r.node.aisle,
               walk_seq: r.node.walk_seq, unroutable: false, line: r.line };
    });
    unroutable.forEach(function (u, j) {
      steps.push({ step: routable.length + j + 1, of: n, m_locator_id: u.loc, rack: null, aisle: null,
                   walk_seq: null, unroutable: true, line: u.line });
    });
    return steps;
  }

  // ── PICK_DOC_SPEC — the drafted pick movement, expressed as a buildDoc spec ──
  // §S-2 source docs: the GardenWorld seed carries NO drafted M_Movement (m_movement 100 is CO),
  // so the walk DRAFTS one via the existing engine archetype verb (ERPEngine.buildDoc — the SAME
  // recursion createShipment/createInvoice ride; no new engine verb, newVerbs=[]). Every id is a
  // REAL seed row: c_doctype 143 'Material Movement' (MMM), warehouse/locator/product ids from
  // m_locator / m_storageonhand. The buildDoc CREATE_LINE spine is then DECORATED with the line's
  // real locator pair (decoratePickOps) — buildDoc is table-parameterised, locators are movement
  // line columns it does not know about.
  var PICK_DOC_SPEC = {
    docTable: 'M_Movement', lineTable: 'M_MovementLine',
    parentId: 'm_warehouse_id', lineParentId: 'm_locator_id',
    qtyTo: 'movementqty', qtyFrom: 'qty',
    header: function (p) { return { c_doctype_id: p.c_doctype_id, docstatus: 'DR', m_warehouse_id: p.m_warehouse_id }; }
  };
  // decoratePickOps(ops, lines): stamp each CREATE_LINE with its line's from/to locator (EXTRACTed
  // from the pick rows; buildDoc emitted them in the same order). Returns the same ops array.
  function decoratePickOps(ops, lines) {
    var li = 0;
    ops.forEach(function (op) {
      if (op.op_type !== 'CREATE_LINE') return;
      var src = lines[li++];
      op.m_locator_id = src.m_locator_id;
      op.m_locatorto_id = src.m_locatorto_id;
    });
    return ops;
  }

  // ── enactOps(step, qtyConfirmed) — §S-4: the confirmed scan as ONE op group ──
  // The movement line enacted on the qty spine = the SAME M-out/M-in event pair the proven
  // qtyOnHand fold reconstructs (W-FOLD-QTYONHAND: polarity rides the movementtype trailing
  // char, never a pre-signed column). Two ops, ONE group: kernel commitGroup makes them
  // all-or-none. Short-pick = qtyConfirmed < line qty; the remainder stays open on the doc.
  function enactOps(step, qtyConfirmed) {
    var l = step.line;
    return [
      { op_type: 'ENACT_MOVE', table: 'M_MovementLine', movementtype: 'M-', m_product_id: l.m_product_id,
        movementqty: qtyConfirmed, m_locator_id: l.m_locator_id, source_line: step.m_locator_id },
      { op_type: 'ENACT_MOVE', table: 'M_MovementLine', movementtype: 'M+', m_product_id: l.m_product_id,
        movementqty: qtyConfirmed, m_locator_id: l.m_locatorto_id, source_line: step.m_locator_id }
    ];
  }

  return { treeFromBom: treeFromBom, route: route,
           PICK_DOC_SPEC: PICK_DOC_SPEC, decoratePickOps: decoratePickOps, enactOps: enactOps };
});
