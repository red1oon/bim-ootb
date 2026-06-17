// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// erp_snapshot_sign.js — ERP.md §0.20 W-SIGN / HolyGrail "signed checkpoint" — Witness: W-REPLICA-SIGN
// Signs/verifies a snapshot's chain-head tip with the controller's ECDSA P-256 key (same scheme as
// scripts/poc_sign.js + the kernel's W-SIGN). This is the HolyGrail §"hard parts" primitive: a signed
// checkpoint carrying the fingerprint of the chain head, signed by the controller (docs/HolyGrail.md
// lines ~333-342). The verifier PINS the controller public key OUT-OF-BAND (the constant below) — it
// does NOT trust a key carried inside the snapshot, so a tamperer who rewrites the tip + sig + an
// embedded key still fails: they cannot forge a signature under the pinned key.
(function () {
  'use strict';
  var subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;

  // PINNED controller public key (JWK). Distributed out-of-band, NOT taken from the snapshot.
  // (Demo key for the POC; rotate via an old-key-signs-new ceremony — see poc_email_dr rotation.)
  var PINNED_PUBKEY = { kty: 'EC', crv: 'P-256',
    x: 'fPaLtHSAmkdyRbJJGh72Mye_viJx4kYLFZmhUa_WqRQ', y: 'jjF9NHrS-yeGcN0BvmbD-3h_ngzO8uHfd45B94D1SJc' };

  function _hex(buf) { return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  function _bytes(hex) { var a = new Uint8Array(hex.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16); return a; }

  async function importPriv(jwk) { return subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']); }
  async function importPub(jwk)  { return subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); }

  // signTip — controller signs the tip (hex string). Returns sig hex (raw r||s, 64 bytes).
  async function signTip(privKeyOrJwk, tipHex) {
    if (!subtle) throw new Error('no crypto.subtle');
    var key = (privKeyOrJwk && privKeyOrJwk.kty) ? await importPriv(privKeyOrJwk) : privKeyOrJwk;
    var sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(tipHex));
    return _hex(sig);
  }

  // verifyTip — verify a tip's signature under the PINNED controller key (or an explicit one).
  async function verifyTip(tipHex, sigHex, pubJwk) {
    if (!subtle) throw new Error('no crypto.subtle');
    if (!sigHex || !tipHex) return false;
    var key = await importPub(pubJwk || PINNED_PUBKEY);
    try { return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, _bytes(sigHex), new TextEncoder().encode(tipHex)); }
    catch (e) { return false; }
  }

  var _api = { PINNED_PUBKEY: PINNED_PUBKEY, signTip: signTip, verifyTip: verifyTip };
  if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }
  if (typeof window !== 'undefined') { window.ErpSnapshotSign = _api; }
  if (typeof console !== 'undefined') { console.log('§SNAP_SIGN_LOADED v1 (ECDSA P-256, pinned controller key)'); }
})();
