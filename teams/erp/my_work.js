// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS MY-WORK + FIELD-LINEAGE (teams/ROADMAP.md §S6, Phase C — read-only, zero impact).
//   Two folds of the SAME seeded op-log, ZERO edits to erp/ runtime:
//     myWork       — the Activities "waiting-for-me" per-role inbox (ERP_CONTEXT §5.1; SAP My Inbox /
//                    Odoo Activities / iDempiere Workflow Activities pattern) = open docs whose NEXT
//                    responsible role is yours + explicit assignments + unresolved @mentions.
//     fieldLineage — field-grain hover-blame (TEAM_OPTICS §3.1, the deeper grain after record-blame):
//                    dwell on a field → reverse-chron `value · who · when` from a filtered log fold
//                    (table,id,column). Always-on, zero setup, ZERO extra writes — the log IS the history.
//   ⚠ We ADD the lineage fold; we do NOT remove AD_ChangeLog (removal = a separate, gated future — §R4).
//   PURE + deterministic (no Date.now / Math.random — `now`/`ts` are INPUTS). NON-INVENT (every row ← an op).
//   Witness: teams/tests/poc_teams_my_work.js (W-ERP-MYWORK + W-FIELD-LINEAGE).
'use strict';

function _order(ops) {
  return (ops || []).slice().sort(function (a, b) {
    return a.ts !== b.ts ? a.ts - b.ts : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}

// ═══ 1) myWork — the per-role "waiting for me" inbox (W-ERP-MYWORK) ════════════
//   opts = { viewer, role, responsible:{status: role-that-must-act}, terminal:[statuses] }.
//   Three item kinds, all NON-INVENT folds of the log:
//     action   — an open doc whose CURRENT status maps (responsible[status]) to the viewer's role.
//     assigned — the viewer is the last ASSIGN target of an open doc.
//     mention  — an UNRESOLVED post-it (annot) @mentioning the viewer.
//   Sorted by `since` ascending (oldest-waiting first = the most urgent), then doc.
function myWork(ops, opts) {
  opts = opts || {};
  var viewer = opts.viewer, role = opts.role;
  var responsible = opts.responsible || {}, terminal = opts.terminal || [];
  var ordered = _order(ops);

  // fold current doc status (last status-bearing op per doc) + last assignee.
  var status = {}, assigned = {};
  ordered.forEach(function (op) {
    var p = op.params || {};
    var st = p.to != null ? p.to : (p.status != null ? p.status : null);
    if (st != null) status[op.target] = { status: st, since: op.ts };
    if (op.verb === 'ASSIGN' && p.assignee != null) assigned[op.target] = { assignee: p.assignee, since: op.ts };
  });

  // fold post-its (annot) for unresolved @mentions of the viewer.
  var pins = {};
  ordered.forEach(function (op) {
    if (op.cls !== 'annot') return;
    var p = op.params || {}, pinId = p.pinId != null ? p.pinId : op.id;
    if (op.verb === 'PIN' || !pins[pinId])
      pins[pinId] = { anchor: op.target, ts: op.ts, resolved: false, mentions: (p.mentions || []).slice() };
    if (op.verb === 'RESOLVE') pins[pinId].resolved = true;
    else if (op.verb === 'REOPEN') pins[pinId].resolved = false;
    if (p.mentions) p.mentions.forEach(function (m) { if (pins[pinId].mentions.indexOf(m) < 0) pins[pinId].mentions.push(m); });
  });

  var items = [];
  Object.keys(status).forEach(function (doc) {
    var s = status[doc];
    if (terminal.indexOf(s.status) >= 0) return;                       // closed → not waiting
    if (role != null && responsible[s.status] === role)
      items.push({ doc: doc, kind: 'action', status: s.status, waitingFor: role, since: s.since,
                   why: 'status ' + s.status + ' awaits ' + role });
    if (assigned[doc] && assigned[doc].assignee === viewer)
      items.push({ doc: doc, kind: 'assigned', status: s.status, waitingFor: viewer, since: assigned[doc].since,
                   why: 'assigned to ' + viewer });
  });
  Object.keys(pins).forEach(function (k) {
    var pin = pins[k];
    if (!pin.resolved && pin.mentions.indexOf(viewer) >= 0)
      items.push({ doc: pin.anchor, kind: 'mention', status: null, waitingFor: viewer, since: pin.ts,
                   why: '@mention awaiting reply' });
  });
  items.sort(function (a, b) { return a.since !== b.since ? a.since - b.since : (a.doc < b.doc ? -1 : 1); });
  return { viewer: viewer, role: role, items: items, count: items.length };
}

// ═══ 2) fieldLineage — field-grain hover-blame (W-FIELD-LINEAGE) ═══════════════
//   Filter the log to (table,id,column) and return reverse-chron `value · who · when`. An op carries
//   field changes in params.fields = { column: newValue } (and op.table / op.target = the record id).
//   ZERO extra writes — pure fold of the existing signed log (we ADD this; AD_ChangeLog stays).
function fieldLineage(ops, sel) {
  sel = sel || {};
  var table = sel.table, id = sel.id, column = sel.column;
  return _order(ops).filter(function (op) {
    if (table != null && op.table !== table) return false;
    if (id != null && op.target !== id) return false;
    var f = (op.params || {}).fields;
    return f && Object.prototype.hasOwnProperty.call(f, column);
  }).map(function (op) {
    return { value: op.params.fields[column], who: op.author, when: op.ts };
  }).reverse();                                                          // reverse-chron (newest first)
}

// current field values of a record (last value per column) — the "as-of-now" snapshot, derived.
function recordFields(ops, sel) {
  sel = sel || {};
  var out = {};
  _order(ops).forEach(function (op) {
    if (sel.table != null && op.table !== sel.table) return;
    if (sel.id != null && op.target !== sel.id) return;
    var f = (op.params || {}).fields;
    if (f) Object.keys(f).forEach(function (c) { out[c] = { value: f[c], who: op.author, when: op.ts }; });
  });
  return out;
}

var M = { myWork: myWork, fieldLineage: fieldLineage, recordFields: recordFields };
if (typeof module === 'object' && module.exports) module.exports = M;
else (typeof self !== 'undefined' ? self : this).TeamsMyWork = M;
