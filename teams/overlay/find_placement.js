// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS FIND-PANEL PLACEMENT (RESUME_TEAMS_UI_CONSISTENCY §R6 + §1a).
//   ONE Role×Spine matrix, rendered TWO ways — the SAME dot_layer engine, only `anchorOf` differs:
//     • DESIGN (the HOME spine, §1a anti-drift): Role × Project→Element on the Modeller Outliner
//       (anchorOf = element/task id; parent = project/task).
//     • OPERATE (the handover end, R6 pivot): Role × Zone Storey→Rooms on the Viewer Find Panel
//       (anchorOf = room guid; parent = storey). WHO-dots append to the SAME result rows AFTER the
//       state chip; the storey rolls up to a `+N` density cluster — HR's density-dot grammar.
//   Both partitioned by ROLE (the People dimension is grouped by role). Every dot/role/count is a fold
//   of the signed op-log — NON-INVENT; ops whose anchor has NO spine node are reported as `unplaced`,
//   never invented onto a row. REUSES dot_layer (colorOf · dotLayerModel · clusterByAnchor) — no fork.
//
//   HARD RULE (§9): opts.on falsy ⇒ empty model ⇒ the renderer draws nothing (pixel-identical).
//   Witness: teams/tests/poc_teams_find_placement.js (W-FIND-PLACEMENT — design==operate engine, storey
//   rollup +N, by-role partition, off=empty, order-invariant, unplaced honesty).
'use strict';

var D = (typeof require === 'function')
  ? require('./dot_layer.js')
  : (typeof self !== 'undefined' ? self : this).TeamsDotLayer;

// ═══ Half 1 — PURE placement model (no DOM, deterministic, NON-INVENT) ════════

// placementModel(ops, spine, opts) — fold the op-log onto a spine (a parent→leaf tree).
//   spine  = { mode?, leaves: [ { id, parent, label } ] }  (or an array of those leaves)
//            `id` is the anchor key `anchorOf` returns (element id for design, room guid for operate).
//   opts   = { on, mode?, anchorOf, roleOf, classes?, maxVisible? }
//     anchorOf(op) → leaf id (default op.target).  roleOf(op) → role (default op.role || 'unknown').
//   Returns { on, mode, leaves:[…], parents:[…], unplaced } — leaves carry their person/post-it clusters
//   + a by-role partition; parents carry the rolled-up `+N` density cluster + merged by-role.
function placementModel(ops, spine, opts) {
  opts = opts || {};
  var mode = opts.mode || (spine && spine.mode) || 'operate';
  if (!opts.on) return { on: false, mode: mode, leaves: [], parents: [], unplaced: 0 };

  var leavesIn = (spine && (spine.leaves || (Array.isArray(spine) ? spine : null))) || [];
  var anchorOf = opts.anchorOf || function (op) { return op.target; };
  var roleOf = opts.roleOf || function (op) { return op.role || 'unknown'; };
  var maxVisible = opts.maxVisible != null ? opts.maxVisible : 2;
  var leafById = {}; leavesIn.forEach(function (l) { leafById[l.id] = l; });

  // (a) reuse the UNIVERSAL engine for per-anchor person/post-it clusters (only anchorOf differs).
  var dm = D.dotLayerModel(ops, { on: true, anchorOf: anchorOf, maxVisible: maxVisible, classes: opts.classes || null });
  var clByAnchor = {};
  dm.clusters.forEach(function (c) { (clByAnchor[c.anchor] = clByAnchor[c.anchor] || {})[c.kind] = c; });

  // (b) by-role partition per leaf: distinct persons per role on that anchor (data touches only, NON-INVENT).
  var rolePersons = {};   // anchor → role → { person: true }
  var unplaced = 0, placedPersons = {};   // anchor → person → true (to count unplaced data-touch dots)
  (ops || []).forEach(function (op) {
    if (op.cls === 'annot') return;                              // a post-it is not a role data-touch
    if (opts.classes && opts.classes.indexOf(op.cls) < 0) return;
    var a = anchorOf(op); if (a == null) return;
    var r = roleOf(op);
    if (!leafById[a]) {                                          // anchor not on the spine → don't invent a row
      var k = a + '' + op.author;
      if (!placedPersons[k]) { placedPersons[k] = true; unplaced++; }
      return;
    }
    ((rolePersons[a] = rolePersons[a] || {})[r] = rolePersons[a][r] || {})[op.author] = true;
  });
  function byRoleOf(anchor) {
    var rp = rolePersons[anchor] || {}, out = {};
    Object.keys(rp).sort().forEach(function (r) { out[r] = Object.keys(rp[r]).sort(); });
    return out;
  }

  // (c) leaves — each spine leaf with its clusters + by-role partition + density count.
  var leaves = leavesIn.slice().sort(function (x, y) { return x.id < y.id ? -1 : x.id > y.id ? 1 : 0; })
    .map(function (l) {
      var cb = clByAnchor[l.id] || {};
      return { id: l.id, parent: l.parent != null ? l.parent : null, label: l.label != null ? l.label : l.id,
        mode: mode, person: cb.person || null, postit: cb.postit || null,
        byRole: byRoleOf(l.id), count: cb.person ? cb.person.count : 0 };
    });

  // (d) parents — roll child person-dots up to the parent anchor, then APPLY THE SAME fan-out grammar
  //     (clusterByAnchor) → one `+N` density cluster per storey/project. HR's density-dot grammar, reused.
  var childDots = [], parentRolePersons = {};
  leaves.forEach(function (lf) {
    if (lf.parent == null) return;
    if (lf.person) lf.person.dots.forEach(function (d) {
      var nd = {}; for (var k in d) nd[k] = d[k]; nd.anchor = lf.parent; childDots.push(nd);
    });
    var br = lf.byRole;
    Object.keys(br).forEach(function (r) {
      var set = (parentRolePersons[lf.parent] = parentRolePersons[lf.parent] || {})[r] = parentRolePersons[lf.parent][r] || {};
      br[r].forEach(function (p) { set[p] = true; });
    });
  });
  var parentClusters = D.clusterByAnchor(childDots, { maxVisible: maxVisible });
  var parents = parentClusters.map(function (cl) {
    var rp = parentRolePersons[cl.anchor] || {}, byRole = {}, people = {};
    Object.keys(rp).sort().forEach(function (r) { byRole[r] = Object.keys(rp[r]).sort(); byRole[r].forEach(function (p) { people[p] = true; }); });
    return { id: cl.anchor, count: cl.count, people: Object.keys(people).length,
      visible: cl.visible, overflow: cl.overflow, badge: cl.badge, byRole: byRole };
  });

  return { on: true, mode: mode, leaves: leaves, parents: parents, unplaced: unplaced };
}

// ═══ Half 2 — DOM render helper (browser-only; strict no-op in node OR when off) ═══
// paintFindPlacement(container, model, opts) — for the OPERATE Storey→Rooms Find-panel rows: append a
// WHO-dot cluster AFTER each row's state chip, and a `+N` density badge on each storey header. Pure DOM
// API; emits the SAME `.tcluster/.tdot/.tbadge` classes as dot_layer (one visual grammar). Selectors via
// opts: rowSel (default '.find-row'), rowKey(rowEl)→leaf id, stateSel (chip to insert after), headerSel
// + headerKey(headerEl)→parent id. Clears only our own `.row-dots`/`.storey-density` nodes first.
function paintFindPlacement(container, model, opts) {
  if (typeof document === 'undefined' || !container) return;     // node: no-op
  opts = opts || {};
  Array.prototype.slice.call(container.querySelectorAll('.row-dots,.storey-density'))
    .forEach(function (n) { n.remove(); });                      // zero footprint when re-painting / off
  if (!model || !model.on) return;                               // off = draw NOTHING

  var leafByAnchor = {}; (model.leaves || []).forEach(function (l) { leafByAnchor[l.id] = l; });
  var parentByAnchor = {}; (model.parents || []).forEach(function (p) { parentByAnchor[p.id] = p; });
  var rowKey = opts.rowKey || function (r) { return r.getAttribute('data-guid'); };
  var headerKey = opts.headerKey || function (h) { return h.getAttribute('data-storey'); };

  Array.prototype.slice.call(container.querySelectorAll(opts.rowSel || '.find-row')).forEach(function (row) {
    var leaf = leafByAnchor[rowKey(row)]; if (!leaf || !leaf.person) return;
    var wrap = document.createElement('span'); wrap.className = 'tcluster person row-dots';
    leaf.person.visible.forEach(function (d) {
      var dot = document.createElement('span'); dot.className = 'tdot person';
      dot.style.setProperty('--c', d.color); dot.textContent = d.initials; dot.title = d.blurb; wrap.appendChild(dot);
    });
    if (leaf.person.badge) { var b = document.createElement('span'); b.className = 'tbadge'; b.textContent = leaf.person.badge; wrap.appendChild(b); }
    var chip = opts.stateSel ? row.querySelector(opts.stateSel) : null;   // insert AFTER the state chip
    if (chip && chip.nextSibling) row.insertBefore(wrap, chip.nextSibling);
    else if (chip) row.appendChild(wrap);
    else row.appendChild(wrap);
  });

  if (opts.headerSel) Array.prototype.slice.call(container.querySelectorAll(opts.headerSel)).forEach(function (h) {
    var par = parentByAnchor[headerKey(h)]; if (!par || !par.count) return;
    var b = document.createElement('span'); b.className = 'tbadge storey-density';
    b.textContent = '+' + par.count; b.title = par.count + ' active · ' + par.people + ' people';
    h.appendChild(b);
  });
}

var FP = { placementModel: placementModel, paintFindPlacement: paintFindPlacement };
if (typeof module === 'object' && module.exports) module.exports = FP;
else (typeof self !== 'undefined' ? self : this).TeamsFindPlacement = FP;
