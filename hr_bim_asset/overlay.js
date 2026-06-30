// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET SPATIAL OVERLAY (§SPATIAL-VIEW / §7D). The 7D cockpit: color the model
//   by HBA state. ZERO-IMPACT by design — touches the viewer ONLY through the MeshPort seam (no edits to
//   scene/picking/streaming). ZERO-CLUTTER by design — tints only linked guids, ghosts the rest, ONE mode
//   at a time, state-as-color (detail on hover). Pure + deterministic. Read log after run.
'use strict';
// browser-safe imports (see models.js): node → require; browser <script> → self.Hba* globals.
var _r = (typeof require !== 'undefined'), _g = (typeof self !== 'undefined' ? self : this);
var M = _r ? require('./models') : _g.HbaModels;
var B = _r ? require('./binding') : _g.HbaBinding;

// color ladder — state-encoding (no labels needed). green/amber/red/grey + ghost.
var COLORS = { occupied: '#2e7d32', vacant: '#9e9e9e', expiring: '#f9a825', unavailable: '#8e24aa',
               ok: '#2e7d32', due: '#f9a825', overdue: '#c62828', ghost: '#dddddd' };

// PRESENCE density ramp (§T&A SLICE-2) — headcount INTENSITY (blue, the HBA presence band). The live
// "density-dots" become a headcount-by-zone heat: 1 → low, 2–4 → med, 5+ → high. Display mapping only;
// the headcount itself is a REAL distinct-employee count from the signed log (never fabricated).
var PRESENCE = { low: '#90caf9', med: '#1976d2', high: '#0d47a1' };
function presenceBucket(n) { return n >= 5 ? 'high' : n >= 2 ? 'med' : 'low'; }

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

// PRESENCE overlay plan (§T&A SLICE-2) from attendance.presenceByZone rows ([{zone, headcount}]). SAME plan
// shape as computeOverlay → applyOverlay reuses the EXISTING MeshPort/density seam (zero new viewer-core).
// NON-INVENT: opts.knownGuids GATES — a zone tints ONLY when it resolves to a real mesh; un-located zones go
// to `unlinked`, never tinted, never fabricated. Zero/empty headcount shows nothing. Pure + deterministic.
function computePresence(rows, opts) {
  opts = opts || {}; var gate = opts.knownGuids ? B.knownGuidSet(opts.knownGuids) : null;
  var tints = {}, unlinked = [];
  (rows || []).forEach(function (r) {
    if (!r || !r.zone || !r.headcount) return;                     // nothing present → nothing to show
    if (gate && !gate.has(r.zone)) { unlinked.push(r.zone); return; }  // honest un-linked: no tint
    var b = presenceBucket(r.headcount);
    tints[r.zone] = { state: 'presence_' + b, color: PRESENCE[b], headcount: r.headcount,
                      detail: 'Zone ' + r.zone + ' · ' + r.headcount + ' present' };
  });
  return { mode: 'presence', period: opts.period || null, tints: tints, linked: Object.keys(tints),
           unlinked: unlinked, legend: [ { state: '1', color: PRESENCE.low }, { state: '2-4', color: PRESENCE.med }, { state: '5+', color: PRESENCE.high } ] };
}

// OCCUPANCY overlay plan (Resource-Assignment slice) from occupancy.lensRows ([{zone, state, party, to}]).
// SAME plan shape as computeOverlay → applyOverlay reuses the EXISTING MeshPort seam. Unlike tenancy/presence
// this is DENSE on purpose — vacant rooms are tinted grey (the availability picture wants the whole floor).
// NON-INVENT: opts.knownGuids GATES — a room tints ONLY when it resolves to a real mesh; else unlinked.
function computeOccupancy(rows, opts) {
  opts = opts || {}; var gate = opts.knownGuids ? B.knownGuidSet(opts.knownGuids) : null;
  var tints = {}, unlinked = [];
  (rows || []).forEach(function (r) {
    if (!r || !r.zone) return;
    if (gate && !gate.has(r.zone)) { unlinked.push(r.zone); return; }
    var st = r.state || 'vacant';
    tints[r.zone] = { state: st, color: COLORS[st] || COLORS.vacant, party: r.party || null,
      detail: 'Room ' + r.zone + ' · ' + st + (r.party ? ' · ' + r.party : '') + (r.to ? ' · to ' + r.to : '') };
  });
  return { mode: 'occupancy', period: opts.period || null, tints: tints, linked: Object.keys(tints), unlinked: unlinked,
    legend: ['occupied', 'vacant', 'expiring', 'unavailable'].map(function (s) { return { state: s, color: COLORS[s] }; }) };
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

var O = { COLORS: COLORS, PRESENCE: PRESENCE, presenceBucket: presenceBucket, computeOverlay: computeOverlay,
          computePresence: computePresence, computeOccupancy: computeOccupancy, applyOverlay: applyOverlay, clearOverlay: clearOverlay };
if (typeof module === 'object' && module.exports) module.exports = O;
else (typeof self !== 'undefined' ? self : this).HbaOverlay = O;
