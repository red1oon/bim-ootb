// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — team_keys.js: ONE library for the Team trust list's key ROLES, the signing THRESHOLD, BUNDLE signature checks and the TIME ANCHOR.
// Spec: prompts/TEAMWORK_FRAMEWORK.md §46.5 F5/F6/F7 (Stage 2). Witness: erp/tests/witness_team_keys.js (W-KEYS). It adds NO second chain: the roster (comm_roster.js) still folds the POLICY epoch /
// planTrust / executors chains by `prev`; this file only answers "may THIS key do THAT, and are there ENOUGH of them" for the roster, the upcaster-set verifier, the plugin registry and (Stage 3) the update list.
//   ROLES  a trust-list key entry may carry `role`: absent or 'owner' = rotate + publish (every space founded before roles existed) · 'rotate-only' = may sign a plan-trust rotation only (the offline
//          recovery key) · 'publish' = may sign executors maps, translation sets, update lists and bundles, not a rotation.
//   QUORUM a statement carries `signer`+`sig` (the first signature) and optional `cosigs:[{signer,sig}]` (<=2), every one over the SAME body = the statement minus sig/signer/cosigs.
//          Distinct listed keys holding the needed ability are counted; unlisted / role-lacking / badly signed cosigs just do not count; the PRIMARY must itself be valid.
//   ANCHOR the only "now" a device may use is the latest admin-signed anchor (POLICY.anchor_ts, bounded by ANCHOR_MAX_SKEW_MS per step). isExpired() NEVER reads the device clock.
(function (global) {
  'use strict';
  var ENV = global.CommEnvelope || (typeof require === 'function' ? require('./comm_envelope.js') : null);
  var ROLES = { owner: ['rotate', 'publish'], 'rotate-only': ['rotate'], publish: ['publish'] };
  var ANCHOR_MAX_SKEW_MS = 366 * 86400000;
  function roleOf(k) { return k && k.role !== undefined ? k.role : 'owner'; }
  function knownRole(r) { return Object.prototype.hasOwnProperty.call(ROLES, r); }
  /*KW:CAN*/ function can(key, need) { var a = ROLES[roleOf(key)]; return !!a && a.indexOf(need) >= 0; }
  function sameKey(a, b) { return !!a && !!b && a.kty === b.kty && a.crv === b.crv && a.x === b.x && a.y === b.y; }
  function bodyOf(st) { var b = {}; for (var k in st) if (Object.prototype.hasOwnProperty.call(st, k) && k !== 'sig' && k !== 'signer' && k !== 'cosigs') b[k] = st[k]; return b; }
  function pairs(st) { var out = [{ signer: st.signer, sig: st.sig }]; (Array.isArray(st.cosigs) ? st.cosigs : []).forEach(function (c) { out.push({ signer: c && c.signer, sig: c && c.sig }); }); return out; }
  var MEMO = Object.create(null);
  // -> [{signer, ok}] one entry per signature, in order (entry 0 = the primary). Signature verdicts never change, so they are remembered.
  async function verifyAll(st) {
    var body = bodyOf(st), out = [];
    var ps = pairs(st);
    for (var i = 0; i < ps.length; i++) {
      var e = ps[i], key = ENV.canonical(body) + '|' + e.sig + '|' + (e.signer && e.signer.x);
      if (MEMO[key] === undefined) {
        var ok = false;
        try { ok = !!e.signer && typeof e.sig === 'string' && await ENV.verify(Object.assign({}, body, { sig: e.sig }), { kty: e.signer.kty, crv: e.signer.crv, x: e.signer.x, y: e.signer.y }); } catch (x) { ok = false; }
        MEMO[key] = ok;
      }
      out.push({ signer: e.signer, ok: MEMO[key] });
    }
    return out;
  }
  // list = trust-list entries; entries = verifyAll() result; need = 'rotate' | 'publish'
  // -> { n: distinct valid listed signers holding `need`, primary: null | 'untrusted-signer' | 'role' | 'signature' (why the PRIMARY signature does not count) }
  function count(list, entries, need) {
    var seen = {}, n = 0, primary = null;
    (entries || []).forEach(function (e, i) {
      var idx = -1; (list || []).forEach(function (k, j) { if (idx < 0 && sameKey(k, e.signer)) idx = j; });
      var why = idx < 0 ? 'untrusted-signer' : (!can(list[idx], need) ? 'role' : (!e.ok ? 'signature' : null));
      if (i === 0) primary = why;
      if (why) return;
      /*KW:DISTINCT*/ if (seen[idx]) return;
      seen[idx] = 1; n++;
    });
    return { n: n, primary: primary };
  }
  // the verdict of a quorum check as one word: null = enough, else the first reason ('untrusted-signer' | 'role' | 'signature' | 'threshold')
  function quorumReason(list, entries, need, T) { var c = count(list, entries, need); if (c.primary) return c.primary; return c.n >= T ? null : 'threshold'; }
  function abilityCount(list, need) { return (list || []).filter(function (k) { return can(k, need); }).length; }

  // ── bundles (F6) ──
  async function sha256hex(bytes) {
    var u = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    return Array.prototype.map.call(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', u)), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }
  var BUNDLE_WHY = { 'untrusted-signer': 'bundle-signer', role: 'bundle-role', signature: 'bundle-signature', threshold: 'bundle-threshold' };
  // signature = {kind:'bundle', id, version, digest, bytes, signer, sig, cosigs?}; trust = {keys, threshold}; loadedDigest = sha256 of the bytes about to be loaded (or null when the host cannot read them)
  // -> null (accepted) | 'bundle-unsigned' | 'bundle-identity' | 'bundle-signer' | 'bundle-role' | 'bundle-signature' | 'bundle-threshold' | 'bundle-digest-mismatch'
  async function checkBundle(signature, manifest, trust, loadedDigest) {
    if (!signature || typeof signature !== 'object' || signature.kind !== 'bundle' || !signature.signer || typeof signature.sig !== 'string') return 'bundle-unsigned';
    if (signature.id !== manifest.id || signature.version !== manifest.version) return 'bundle-identity';
    var r = quorumReason(trust.keys, await verifyAll(signature), 'publish', trust.threshold || 1);
    if (r) return BUNDLE_WHY[r];
    if (loadedDigest != null && loadedDigest !== signature.digest) return 'bundle-digest-mismatch';
    return null;
  }

  // ── the time anchor (F7) ──
  // A device's clock is NEVER an input. expiresTs is a time an admin-signed object named; anchor is the latest admin-signed anchor (roster.anchor), or null.
  function isExpired(expiresTs, anchor) {
    return typeof anchor === 'number' && isFinite(anchor) && typeof expiresTs === 'number' && expiresTs < anchor;
  }

  var API = { ROLES: ROLES, ANCHOR_MAX_SKEW_MS: ANCHOR_MAX_SKEW_MS, roleOf: roleOf, knownRole: knownRole, can: can, sameKey: sameKey, bodyOf: bodyOf, verifyAll: verifyAll, count: count,
              quorumReason: quorumReason, abilityCount: abilityCount, sha256hex: sha256hex, checkBundle: checkBundle, isExpired: isExpired };
  global.TeamKeys = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
