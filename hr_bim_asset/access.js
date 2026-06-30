// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — HR_BIM_ASSET T&A ACCESS (RESUME_HR_BIM_ASSET.md §RESUME NEXT#3 — signed capability token).
//   A grantor issues a SIGNED capability token scoping a holder to REAL building zone(s) for a time window; a
//   door reader VERIFIES it OFFLINE — pure crypto + a local trust anchor + a local revocation set, NO network,
//   NO chain/db lookup. Reuses the connector W-SIGN seam (C.sign/verifyChain) + binding.resolveGuid (spatial
//   gate) + the watermark. Honest boundary (§PILLAR 2): the ONLY external piece is the physical reader/turnstile
//   hardware — every software primitive is here. NON-INVENT GATES:
//     • GRANT refuses a zone that does not resolve to a REAL building guid (can't gate a phantom door)
//     • the reader never FABRICATES a grant — a malformed/forged/expired/out-of-scope/revoked/untrusted token
//       is DENIED with an honest reason; a grant is returned ONLY when every check passes
//     • the caller supplies `ts` (no Date.now) → verification is deterministic + replayable
//   Read the log after every run.
'use strict';
var _r = (typeof require !== 'undefined'), _g = (typeof self !== 'undefined' ? self : this);
var C = _r ? require('./connectors') : _g.HrConnectors;
var B = _r ? require('./binding') : _g.HbaBinding;
var W = _r ? require('./watermark') : _g.HbaWatermark;

function _ts(v) { return v == null ? null : (typeof v === 'number' ? v : Date.parse(v)); }
function deny(reason) { return { granted: false, reason: reason }; }

// GRANT — mint a signed capability token. Every zone must resolve to a REAL building guid (when knownGuids is
// supplied) else honest REFUSE (no token). The token is a self-contained, single-op signed leaf (prev=GENESIS).
function grant(ev, knownGuids) {
  if (!ev || !ev.holder || !ev.grantor || ev.ts == null || !Array.isArray(ev.zones) || !ev.zones.length) return { refused: 'incomplete' };
  if (knownGuids != null) { for (var i = 0; i < ev.zones.length; i++) if (!B.resolveGuid(ev.zones[i], knownGuids)) return { refused: 'unlocated-zone', zone: ev.zones[i] }; }
  var op = { id: 'CAP:' + ev.holder + '@' + ev.ts, ts: ev.ts, period: String(ev.ts).slice(0, 7),
    actor: ev.grantor, cls: 'ACCESS', verb: 'GRANT', target: ev.holder,
    params: { zones: ev.zones.slice(), notBefore: ev.notBefore || null, notAfter: ev.notAfter || null, scope: ev.scope || 'door' } };
  return { token: C.sign(op, 'GENESIS') };
}

// REVOKE — a signed op naming the token id. A reader folds verified revoke ops into its local revocation set.
function revoke(ev) {
  if (!ev || !ev.tokenId || !ev.grantor || ev.ts == null) return { refused: 'incomplete' };
  var op = { id: 'REV:' + ev.tokenId + '@' + ev.ts, ts: ev.ts, period: String(ev.ts).slice(0, 7),
    actor: ev.grantor, cls: 'ACCESS', verb: 'REVOKE', target: ev.tokenId, params: { tokenId: ev.tokenId, reason: ev.reason || null } };
  return { op: C.sign(op, 'GENESIS') };
}

// VERIFY — the OFFLINE decision. Pure function of (token, ctx); touches NO network/db. ctx = { doorZone, atTs,
// trusted:Set<grantor>, revoked:Set<tokenId>, holder }. Order: integrity → trust → revoked → holder → window → zone.
function verify(token, ctx) {
  ctx = ctx || {};
  if (!token || !token.op_hash || !token.sig || token.verb !== 'GRANT') return deny('malformed');
  if (!C.verifyChain([token]).ok) return deny('bad-signature');                       // forged param/sig → reject
  if (ctx.trusted && !ctx.trusted.has(token.actor)) return deny('untrusted-grantor');  // trust anchor
  if (ctx.revoked && ctx.revoked.has(token.id)) return deny('revoked');                // local CRL
  if (ctx.holder != null && ctx.holder !== token.target) return deny('holder-mismatch');
  var now = _ts(ctx.atTs), nb = _ts(token.params.notBefore), na = _ts(token.params.notAfter);
  if (nb != null && now != null && now < nb) return deny('not-yet-valid');
  if (na != null && now != null && now > na) return deny('expired');
  if (ctx.doorZone != null && token.params.zones.indexOf(ctx.doorZone) < 0) return deny('zone-out-of-scope');
  return { granted: true, reason: 'granted', holder: token.target, grantor: token.actor, zone: ctx.doorZone };
}

// buildReader — a door reader's OFFLINE state: a trust anchor (trusted grantors) + a revocation set folded from
// SIGNED revoke ops (an unsigned/forged revoke is ignored — can't deny by forgery). Returns a bound verify().
function buildReader(cfg) {
  cfg = cfg || {};
  var trusted = new Set(cfg.trustedGrantors || []);
  var revoked = new Set();
  (cfg.revokeOps || []).forEach(function (rop) { if (rop && rop.verb === 'REVOKE' && C.verifyChain([rop]).ok) revoked.add(rop.params.tokenId); });
  return { trusted: trusted, revoked: revoked,
    verify: function (token, doorZone, atTs, holder) { return verify(token, { doorZone: doorZone, atTs: atTs, trusted: trusted, revoked: revoked, holder: holder }); } };
}

// a watermarked access pass (an issued/printed artifact → §DISCLAIMER).
function pass(token, locale) {
  var out = { tokenId: token.id, holder: token.target, grantor: token.actor, zones: token.params.zones,
    validFrom: token.params.notBefore, validTo: token.params.notAfter, scope: token.params.scope, sig: token.sig };
  return W ? W.stamp(out, locale || 'en') : out;
}

var A = { grant: grant, revoke: revoke, verify: verify, buildReader: buildReader, pass: pass };
if (typeof module === 'object' && module.exports) module.exports = A;
else (typeof self !== 'undefined' ? self : this).HbaAccess = A;
