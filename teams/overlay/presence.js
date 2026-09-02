// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — TEAMS UNIFIED PRESENCE (teams/ROADMAP.md §S11, Phase F — THE MOAT, off-by-default).
//   Cross-product BIM↔ERP presence (IDEAS.md §B, DESIGN.md scope axis): ONE presence/identity fabric over
//   the SAME shared bus + facilitator both products already ride. Colour = signer is universal, so a
//   person is ONE identity with ONE colour across the WHOLE suite — "Alice is in the Viewer on Level 3"
//   reads while you're in ERP, and a QS in ERP reads to the engineer in the model. **Nobody has unified
//   BIM+ERP presence** — this is the moat, not a me-too.
//
//   ADDITIVE + ISOLATED (ROADMAP §R5): touches ZERO modeller/erp code. The BIM-side and ERP-side simply
//   emit a fixed-schema `presence` heartbeat onto the existing `BroadcastChannel('bim_teams')` bus (the
//   connector seam) — no host file is edited; this module only FOLDS what the bus carries. Heartbeats are
//   awareness (who/where/when), never ops (ops travel the signed log). PURE + deterministic (no Date.now /
//   Math.random — `ts`/`now` are INPUTS). NON-INVENT: every identity ← a heartbeat. Reuses dot_layer's
//   colour=signer so BIM & ERP paint the same person the same colour. Witness: teams/tests/poc_teams_presence.js.
'use strict';
var D = (typeof require !== 'undefined') ? require('./dot_layer') : self.TeamsDotLayer;

var PRODUCTS = ['bim', 'erp'];

// makePresence(o) — a fixed-schema presence heartbeat. o = { user, signer?, product, location?, branch?, ts }.
//   signer defaults to user (the IDENTITY = the colour key). product ∈ {bim,erp}. location is product-shaped:
//   BIM { discipline, level, space } · ERP { role, org, doc }. NON-INVENT — unknown product / missing user throw.
function makePresence(o) {
  o = o || {};
  if (PRODUCTS.indexOf(o.product) < 0) throw new Error('presence: unknown product ' + o.product);
  if (o.user == null || o.user === '') throw new Error('presence: user required');
  return { kind: 'presence', user: String(o.user), signer: String(o.signer != null ? o.signer : o.user),
           product: o.product, location: o.location || null, branch: o.branch != null ? o.branch : null, ts: o.ts };
}

// a readable location string per product (deterministic; the dot blurb + whereIs use it).
function locationText(product, loc) {
  loc = loc || {};
  if (product === 'bim') return [loc.discipline, loc.level != null ? ('L' + loc.level) : null, loc.space].filter(Boolean).join(' · ') || '—';
  return [loc.role, loc.org, loc.doc].filter(Boolean).join(' · ') || '—';      // erp
}

// foldPresence(beats, opts) — unify heartbeats per IDENTITY across products. opts = { now, activeMs(=60000) }.
//   Per user: the latest (max ts) per product AND overall, one colour (= signer), an active flag (within the
//   presence window of `now`). Order-invariant + deterministic. Returns { byUser, list (sorted by user), now }.
function foldPresence(beats, opts) {
  opts = opts || {};
  var now = opts.now, activeMs = opts.activeMs != null ? opts.activeMs : 60000;
  var by = {};
  (beats || []).forEach(function (h) {
    if (!h || h.kind !== 'presence') return;
    var u = by[h.user] || (by[h.user] = { user: h.user, signer: h.signer, color: D.colorOf(h.signer),
      initials: D.initialsOf(h.signer), perProduct: {}, latest: null, active: false, products: [] });
    var pp = u.perProduct[h.product];
    if (!pp || h.ts > pp.ts) u.perProduct[h.product] = { product: h.product, location: h.location,
      locText: locationText(h.product, h.location), ts: h.ts, branch: h.branch };
  });
  var list = Object.keys(by).sort().map(function (k) {
    var u = by[k], latest = null, ordered = {};
    PRODUCTS.forEach(function (p) {                              // canonical key order → arrival-invariant serialization
      var pp = u.perProduct[p];
      if (!pp) return;
      ordered[p] = pp;
      if (!latest || pp.ts > latest.ts) latest = pp;            // latest = max ts across products (ties: stable order)
    });
    u.perProduct = ordered;
    u.latest = latest;
    u.active = (now != null && latest) ? (now - latest.ts) <= activeMs : false;
    u.products = PRODUCTS.filter(function (p) { return !!u.perProduct[p]; });
    return u;
  });
  return { byUser: by, list: list, now: now != null ? now : null };
}

// whereIs(folded, user) — the unified "where is this person now" across the WHOLE suite (latest product+location).
function whereIs(folded, user) {
  var u = folded.byUser[user];
  if (!u || !u.latest) return null;
  return { user: user, product: u.latest.product, location: u.latest.location, locText: u.latest.locText,
           ts: u.latest.ts, active: u.active, color: u.color };
}

// crossProduct(folded, viewer) — THE MOAT: from product X you read peers in product Y. viewer = { user, product }.
//   Returns every other present identity with its unified location, tagged sameProduct vs crossProduct — so an
//   ERP user sees "alice · BIM · STR · L3" and a BIM user sees "bob · ERP · AP · INV-9". Sorted active-first, then user.
function crossProduct(folded, viewer) {
  viewer = viewer || {};
  return folded.list.filter(function (u) { return u.user !== viewer.user && u.latest; }).map(function (u) {
    return { user: u.user, color: u.color, initials: u.initials, product: u.latest.product, locText: u.latest.locText,
             ts: u.latest.ts, active: u.active,
             sameProduct: viewer.product != null && u.latest.product === viewer.product,
             crossProduct: viewer.product != null && u.latest.product !== viewer.product };
  }).sort(function (a, b) { return a.active !== b.active ? (a.active ? -1 : 1) : (a.user < b.user ? -1 : a.user > b.user ? 1 : 0); });
}

// presenceDots(folded) — a dot model (colour=signer, initials, blurb, faded when stale). Same dot conventions
//   as dot_layer so the SAME person paints the SAME colour in BIM and ERP. NON-INVENT (one dot per identity).
function presenceDots(folded) {
  return folded.list.filter(function (u) { return !!u.latest; }).map(function (u) {
    return { user: u.user, color: u.color, initials: u.initials, product: u.latest.product, locText: u.latest.locText,
             blurb: u.user + ' · ' + u.latest.product.toUpperCase() + ' · ' + u.latest.locText + ' · ' + u.latest.ts,
             faded: !u.active };
  });
}

var PR = { PRODUCTS: PRODUCTS, makePresence: makePresence, locationText: locationText,
           foldPresence: foldPresence, whereIs: whereIs, crossProduct: crossProduct, presenceDots: presenceDots };
if (typeof module === 'object' && module.exports) module.exports = PR;
else (typeof self !== 'undefined' ? self : this).TeamsPresence = PR;
