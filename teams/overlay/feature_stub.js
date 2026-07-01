// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS FEATURE STUB (teams/ROADMAP.md §S12·H, Phase F — a HONEST placeholder).
//   A VISIBLE "new feature" placeholder now, built later (IDEAS.md §H): the blue-branch "propose changes /
//   PR for ERP docs" (draft-vs-craft, RESUME_DISTRIBUTED_BRANCHES). The surface shows a disabled chip so
//   the roadmap is visible — but invoking it returns an honest `not-implemented`; it NEVER fakes the action
//   (NON-INVENT: a stub must not pretend to work). Deterministic descriptor (no Date.now / Math.random).
//   Witness: teams/tests/poc_teams_s12.js (W-FEATURE-STUB).
'use strict';

// the placeholder registry — declared features that are NOT built yet (each carries its spec pointer).
var STUBS = {
  'propose-changes': {
    id: 'propose-changes', label: 'Propose changes (PR for docs)', status: 'stub', blueBranch: true,
    note: 'Draft changes on a blue branch; the owner accepts → folds in (a GitHub-style PR for ERP docs).',
    spec: 'IDEAS.md §H · RESUME_DISTRIBUTED_BRANCHES (draft-vs-craft)'
  }
};

function listFeatures() {
  return Object.keys(STUBS).sort().map(function (k) { return STUBS[k]; });
}
function feature(id) { return STUBS[id] || null; }

// descriptor(id) — the deterministic UI chip for the placeholder (always DISABLED while a stub).
function descriptor(id) {
  var f = feature(id);
  if (!f) return null;
  return { id: f.id, label: f.label, enabled: false, badge: 'soon', tooltip: 'New feature — coming soon', blueBranch: !!f.blueBranch };
}

// invoke(id) — the honest no-op: a stub NEVER performs the action (never invents a result).
function invoke(id) {
  var f = feature(id);
  if (!f) return { ok: false, status: 'unknown-feature', feature: id };
  return { ok: false, status: 'not-implemented', feature: id,
           message: f.label + ' is a placeholder — lands in a later slice (' + f.spec + ').' };
}

var F = { listFeatures: listFeatures, feature: feature, descriptor: descriptor, invoke: invoke };
if (typeof module === 'object' && module.exports) module.exports = F;
else (typeof self !== 'undefined' ? self : this).TeamsFeatureStub = F;
