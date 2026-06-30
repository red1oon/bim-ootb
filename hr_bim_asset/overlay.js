// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET SPATIAL OVERLAY (§SPATIAL-VIEW / §7D). The 7D cockpit: color the model
//   by HBA state. ZERO-IMPACT by design — touches the viewer ONLY through the MeshPort seam (no edits to
//   scene/picking/streaming). ZERO-CLUTTER by design — tints only linked guids, ghosts the rest, ONE mode
//   at a time, state-as-color (detail on hover). Pure + deterministic. Read log after run.
'use strict';
var M = require('./models');
var B = require('./binding');

// color ladder — state-encoding (no labels needed). green/amber/red/grey + ghost.
var COLORS = { occupied: '#2e7d32', vacant: '#9e9e9e', expiring: '#f9a825',
               ok: '#2e7d32', due: '#f9a825', overdue: '#c62828', ghost: '#dddddd' };

function monthDiff(from, to) { var a = from.split('-'), b = to.split('-'); return (b[0] - a[0]) * 12 + (b[1] - a[1]); }

// compute the overlay PLAN for ONE mode — LINKED guids only (sparse by construction).
// opts.knownGuids (optional) = the building's real guid set (room fixture / APP.guidMap). When supplied it
// is the NON-INVENT GATE: a record tints a unit ONLY when its guid resolves to a real mesh; non-matching
// guids are collected in `unlinked` (honest — never tinted, never fabricated). Absent → no gate (legacy path).
function computeOverlay(mode, period, opts) {
  opts = opts || {}; var horizon = opts.expiringMonths || 2, tints = {}, unlinked = [], legend;
  var gate = opts.knownGuids ? B.knownGuidSet(opts.knownGuids) : null;
  function place(guid, entry) {
    if (gate && !gate.has(guid)) { unlinked.push(guid); return; }   // honest un-linked: no tint
    tints[guid] = entry;
  }
  if (mode === 'tenancy') {
    M.records('Tenancy').forEach(function (r) {
      var state = !r.tenant ? 'vacant' : (monthDiff(period, r.term_end) <= horizon ? 'expiring' : 'occupied');
      place(r.unit_guid, { state: state, color: COLORS[state], detail: 'Lease ' + r.lease_no + ' · ' + (r.tenant || 'VACANT') + ' · ends ' + r.term_end });
    });
    legend = ['occupied', 'vacant', 'expiring'];
  } else if (mode === 'maintenance') {
    M.records('Asset').forEach(function (r) {
      var d = monthDiff(period, r.next_due), state = d > 0 ? 'ok' : d === 0 ? 'due' : 'overdue';
      place(r.bim_guid, { state: state, color: COLORS[state], detail: r.asset + ' · ' + r.category + ' · due ' + r.next_due + ' · ' + r.personnel });
    });
    legend = ['ok', 'due', 'overdue'];
  } else throw new Error('unknown overlay mode: ' + mode);
  return { mode: mode, period: period, tints: tints, linked: Object.keys(tints), unlinked: unlinked,
           legend: legend.map(function (s) { return { state: s, color: COLORS[s] }; }) };
}

// apply via the MeshPort SEAM only. port = { allGuids(), setTint(guid,color), setGhost(guid), restoreAll() }.
function applyOverlay(port, plan) {
  port.restoreAll();                                    // clear any prior mode FIRST (no stacked colors)
  var linked = {}; plan.linked.forEach(function (g) { linked[g] = true; });
  port.allGuids().forEach(function (g) {
    if (linked[g]) port.setTint(g, plan.tints[g].color); // tint the few that are linked
    else port.setGhost(g);                               // ghost the rest → focus by contrast, not marks
  });
  return plan.linked.length;
}
function clearOverlay(port) { port.restoreAll(); }       // toggle OFF = full restore, zero residue

var O = { COLORS: COLORS, computeOverlay: computeOverlay, applyOverlay: applyOverlay, clearOverlay: clearOverlay };
if (typeof module === 'object' && module.exports) module.exports = O;
else (typeof self !== 'undefined' ? self : this).HbaOverlay = O;
