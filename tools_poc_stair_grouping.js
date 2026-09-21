#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — §STAIR-GROUP POC GATE
 *   (bim-compiler prompts/Modeller/DISC_Walker/OCCUPANT_PATHFINDER.md §PATHING-DEFECTS-2026-09-20 P1)
 *
 * CALCULATION ONLY. Touches no engine, changes no behaviour, writes nothing. §GRAPH-FOUNDATION's
 * own rule: "POC-gate FIRST (calculation-only Node script on real DBs, log the numbers) before
 * touching the engine." This is that script.
 *
 * QUESTION: `stairBaseKey()` groups stair flights into physical stairs by NAME, stripping a
 * trailing /:\d+$/. On a model that names stairs by TYPE with an element-ID suffix — Revit's
 * default — that key is the same string for every stair in the building. How many physically
 * separate stairs does that merge, per building, and what would a geometry-based key give instead?
 *
 * The candidate is deliberately dumb: single-link clustering on PLAN position. Stairs in one shaft
 * share an (x,y) footprint across storeys; separate shafts do not. No name is read at all.
 *
 * RUN:  node tools_poc_stair_grouping.js [radius_m]
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT
 */
'use strict';
const fs = require('fs'), path = require('path');

const RADIUS = +(process.argv[2] || 4);        // metres, plan distance for "same shaft"
const DIRS = ['/home/red1/Downloads', '/home/red1/bim-ootb/buildings'];

// VERBATIM from common/room_graph.js:139-146 — copied, not re-derived, so the POC measures the
// SHIPPING rule and not an approximation of it.
const RUN_SUFFIX_RE = /\s+Run\s+\d+$/;
const INDEX_SUFFIX_RE = /:\d+$/;
function stairBaseKey(name) {
  const n = String(name || '');
  if (RUN_SUFFIX_RE.test(n)) return n.replace(RUN_SUFFIX_RE, '');
  return n.replace(INDEX_SUFFIX_RE, '');
}

// CANDIDATE: single-link clustering on plan position. Two rows join when their centres are within
// RADIUS in plan. Transitive, so a tall shaft whose flights drift slightly still forms one cluster.
function clusterByPlan(rows, radius) {
  const parent = rows.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a; };
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++)
      if (Math.hypot(rows[i].x - rows[j].x, rows[i].y - rows[j].y) <= radius) union(i, j);
  const g = {};
  rows.forEach((_, i) => { const r = find(i); (g[r] = g[r] || []).push(i); });
  return Object.values(g);
}

function spanOf(rows, idxs, key) {
  const v = idxs.map((i) => rows[i][key]);
  return Math.max(...v) - Math.min(...v);
}

(async () => {
  let initSqlJs;
  try { initSqlJs = require('./tests/_sqljs.js').requireSqlJs(); }
  catch (e) { console.log('§STAIR_POC INCONCLUSIVE — sql.js unavailable: ' + e.message); process.exit(2); }
  const SQL = await initSqlJs();

  const files = [];
  DIRS.forEach((d) => { try { fs.readdirSync(d).filter((f) => f.endsWith('.db')).forEach((f) => files.push(path.join(d, f))); } catch (e) {} });
  if (!files.length) { console.log('§STAIR_POC INCONCLUSIVE — no .db found'); process.exit(2); }

  console.log('§STAIR_POC radius=' + RADIUS + 'm  (plan-distance single-link clustering, no name read)');
  console.log('  ' + 'building'.padEnd(34) + 'rows  nameKeys  planClust  nameThenSplit   worst name-merge (rows, plan span)');
  let anyCollapse = 0, judged = 0;
  const violations = [];
  for (const f of files) {
    let db;
    try { db = new SQL.Database(new Uint8Array(fs.readFileSync(f))); } catch (e) { continue; }
    let rows = [];
    try {
      const r = db.exec("select m.element_name, t.center_x, t.center_y, t.center_z from elements_meta m join element_transforms t on t.guid=m.guid where (m.ifc_class like 'IfcStair%' or m.ifc_class like 'IfcRamp%') and t.center_z is not null");
      if (r.length) rows = r[0].values.map((v) => ({ name: v[0], x: +v[1], y: +v[2], z: +v[3] }));
    } catch (e) { db.close(); continue; }
    db.close();
    if (rows.length < 2) continue;
    judged++;
    const byName = {};
    rows.forEach((r, i) => { const k = stairBaseKey(r.name); (byName[k] = byName[k] || []).push(i); });
    const nameKeys = Object.keys(byName).length;
    const clusters = clusterByPlan(rows, RADIUS);
    // THE SHIPPABLE CANDIDATE: name key FIRST, then SPLIT each name-group by plan distance.
    // Split-only is strictly safer than clustering outright — it can never merge two stairs the
    // current rule keeps apart, so no building can get FEWER groups than it has today. It only
    // undoes the specific failure measured here: one name covering shafts tens of metres apart.
    let splitGroups = 0;
    Object.values(byName).forEach((idxs) => {
      const sub = rows.filter((_, i) => idxs.indexOf(i) >= 0);
      splitGroups += clusterByPlan(sub, RADIUS).length;
    });
    // the worst thing the NAME key does: the group whose members are furthest apart in plan
    let worst = null;
    Object.entries(byName).forEach(([k, idxs]) => {
      if (idxs.length < 2) return;
      const span = Math.max(spanOf(rows, idxs, 'x'), spanOf(rows, idxs, 'y'));
      if (!worst || span > worst.span) worst = { k, n: idxs.length, span };
    });
    const collapsed = worst && worst.span > 2 * RADIUS;
    if (collapsed) anyCollapse++;
    if (splitGroups < nameKeys) violations.push(path.basename(f) + ': nameKeys=' + nameKeys + ' -> nameThenSplit=' + splitGroups);
    console.log('  ' + path.basename(f).padEnd(34) +
      String(rows.length).padStart(4) + String(nameKeys).padStart(10) + String(clusters.length).padStart(11) +
      String(splitGroups).padStart(15) +
      '   ' + (worst ? worst.n + ' rows, ' + worst.span.toFixed(1) + ' m' + (collapsed ? '  <== MERGES SEPARATE SHAFTS' : '') : '-'));
  }
  // THE INVARIANT THE SHIPPED RULE RESTS ON. Split-only means a building can never come out with
  // FEWER stair groups than the name key alone gave it. If that ever fails, a model the old rule
  // handled correctly has just been made worse, and that is the one regression this change could
  // cause. Asserted across the whole fleet, not argued.
  if (violations.length) {
    violations.forEach(function (v) { console.log('  §STAIR_POC WRONG ' + v); });
    console.log('§STAIR_POC FAIL — split-only invariant broken on ' + violations.length + ' building(s)');
    process.exit(1);
  }
  console.log('  §STAIR_POC ok    split-only holds on every judged building: no model loses a group');
  console.log('§STAIR_POC judged=' + judged + ' buildings, ' + anyCollapse +
    ' where the NAME key merges rows more than ' + (2 * RADIUS) + ' m apart in plan.' +
    (anyCollapse ? '  A plan-distance key separates them without reading a name.' : ''));
})();
