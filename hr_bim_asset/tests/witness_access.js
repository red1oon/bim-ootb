// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-HBA-ACCESS witness (§RESUME NEXT#3 — signed capability token, offline verify). Each
//   check NAMES the issue it proves. Load-bearing claims: a capability is SIGNED + scoped to a REAL building
//   zone (a phantom zone → REFUSE); a door reader verifies it OFFLINE (pure crypto + local trust + local CRL,
//   no network/db); a forged scope, expired/early, out-of-scope, wrong-holder, untrusted-grantor, or revoked
//   token is DENIED with an honest reason; a grant is returned ONLY when every check passes.
//   Run: node hr_bim_asset/tests/witness_access.js
'use strict';
var fs = require('fs'), path = require('path');
var Ac = require('../access'), C = require('../connectors'), B = require('../binding');
var checks = [];
function ok(tag, cond, msg) { checks.push(!!cond); console.log('§HBA-ACCESS ' + (cond ? 'PASS' : 'FAIL') + ' ' + tag + ' — ' + msg); }

var FX = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/hhs_rooms.json'), 'utf8'));
var ZONE_A = FX.rooms[0].guid, ZONE_B = FX.rooms[1].guid, FAKE = 'GUID-NOT-IN-BUILDING';
var MID = '2026-06-15T08:00:00Z';   // inside the validity window

// ---- X0: GRANT → a signed capability token scoped to a real zone; integrity verifies -----------------------
var g = Ac.grant({ holder: 'EMP001', grantor: 'HR-ADMIN', zones: [ZONE_A], notBefore: '2026-06-01', notAfter: '2026-06-30', ts: '2026-06-01T00:00:00Z' }, FX);
var token = g.token;
ok('X0-signed-grant', token && token.sig && token.op_hash && token.verb === 'GRANT' && C.verifyChain([token]).ok,
  'grant to a real zone → a signed capability token; standalone integrity verifies');

// ---- X1: a grant over a NON-EXISTENT zone is REFUSED (spatial non-invent gate) -----------------------------
var gf = Ac.grant({ holder: 'EMP001', grantor: 'HR-ADMIN', zones: [FAKE], notBefore: '2026-06-01', notAfter: '2026-06-30', ts: '2026-06-01T00:00:00Z' }, FX);
ok('X1-refuse-phantom', gf.refused === 'unlocated-zone' && gf.zone === FAKE && B.resolveGuid(FAKE, FX) === false,
  'cannot grant access to a zone not in the building → REFUSE (never a phantom door)');

// ---- the door reader: OFFLINE state — trusts HR-ADMIN, no revocations yet ----------------------------------
var reader = Ac.buildReader({ trustedGrantors: ['HR-ADMIN'], revokeOps: [] });

// ---- X2: the reader GRANTS a valid token at its zone, in-window, right holder — OFFLINE --------------------
var d = reader.verify(token, ZONE_A, MID, 'EMP001');
ok('X2-offline-grant', d.granted === true && d.reason === 'granted' && d.holder === 'EMP001' && d.zone === ZONE_A,
  'reader verifies OFFLINE (pure crypto + local sets) → GRANTED at the scoped zone, in window');

// ---- X3: a door OUTSIDE the token's zone scope is DENIED ----------------------------------------------------
ok('X3-zone-scope', reader.verify(token, ZONE_B, MID, 'EMP001').reason === 'zone-out-of-scope',
  'same token at a different zone → DENIED zone-out-of-scope (capability is spatially scoped)');

// ---- X4: time window — early = not-yet-valid, late = expired ------------------------------------------------
ok('X4-window', reader.verify(token, ZONE_A, '2026-05-20T08:00:00Z', 'EMP001').reason === 'not-yet-valid'
  && reader.verify(token, ZONE_A, '2026-07-05T08:00:00Z', 'EMP001').reason === 'expired',
  'before notBefore → not-yet-valid; after notAfter → expired');

// ---- X5: a FORGED scope is rejected OFFLINE (tamper breaks the signature) -----------------------------------
var forged = JSON.parse(JSON.stringify(token));
forged.params.zones = [ZONE_B];                          // try to widen the capability after signing
ok('X5-tamper', reader.verify(forged, ZONE_B, MID, 'EMP001').reason === 'bad-signature',
  'editing the token scope after signing → bad-signature (offline crypto catches it, no widening)');

// ---- X6: an UNTRUSTED grantor is denied even with a valid self-signature -----------------------------------
var rogue = Ac.grant({ holder: 'EMP001', grantor: 'IMPOSTER', zones: [ZONE_A], notBefore: '2026-06-01', notAfter: '2026-06-30', ts: '2026-06-01T00:00:00Z' }, FX).token;
ok('X6-untrusted', C.verifyChain([rogue]).ok && reader.verify(rogue, ZONE_A, MID, 'EMP001').reason === 'untrusted-grantor',
  'a token validly signed by an UNTRUSTED grantor → DENIED (reader trust anchor) — self-signing is not enough');

// ---- X7: REVOCATION is offline — a signed revoke denies the token; a forged revoke is ignored --------------
var rev = Ac.revoke({ tokenId: token.id, grantor: 'HR-ADMIN', ts: '2026-06-10T00:00:00Z' }).op;
var reader2 = Ac.buildReader({ trustedGrantors: ['HR-ADMIN'], revokeOps: [rev] });
ok('X7a-revoked', reader2.verify(token, ZONE_A, MID, 'EMP001').reason === 'revoked',
  'a signed revoke folds into the reader CRL → the token is DENIED revoked (offline)');
var forgedRev = JSON.parse(JSON.stringify(rev)); forgedRev.params.tokenId = token.id; forgedRev.params.reason = 'forged';
var reader3 = Ac.buildReader({ trustedGrantors: ['HR-ADMIN'], revokeOps: [forgedRev] });
ok('X7b-forged-revoke-ignored', reader3.verify(token, ZONE_A, MID, 'EMP001').granted === true,
  'a forged/edited revoke op fails its own signature → ignored (cannot deny by forgery)');

// ---- X8: holder mismatch — presenting another person's token is denied -------------------------------------
ok('X8-holder', reader.verify(token, ZONE_A, MID, 'EMP999').reason === 'holder-mismatch',
  'a token presented by the wrong holder → DENIED holder-mismatch');

// ---- X9: an issued pass is a WATERMARKED artifact (§DISCLAIMER) ---------------------------------------------
var p = Ac.pass(token, 'ms');
ok('X9-watermark', p._watermark === 'CONTOH — TIDAK RASMI' && p.holder === 'EMP001' && p.zones[0] === ZONE_A,
  'access pass carries the locale watermark (ms) + the real holder/zone');

// ---- X10: incomplete grant/revoke are REFUSED (no fabricated capability) ------------------------------------
ok('X10-refuse-incomplete', Ac.grant({ holder: 'EMP001' }).refused === 'incomplete' && Ac.revoke({}).refused === 'incomplete',
  'a grant/revoke missing required fields is REFUSED (never a fabricated token)');

// ---- X11: verify is PURE/DETERMINISTIC — same inputs → same decision (replay == live) ----------------------
ok('X11-deterministic', JSON.stringify(reader.verify(token, ZONE_A, MID, 'EMP001')) === JSON.stringify(reader.verify(token, ZONE_A, MID, 'EMP001')),
  'offline verify is a pure function of (token, local CRL, clock) — deterministic');

var pass = checks.filter(Boolean).length, fail = checks.length - pass;
console.log('\n§HBA-ACCESS ' + pass + '/' + checks.length + ' PASS' + (fail ? (' — ' + fail + ' FAIL') : ''));
process.exit(fail ? 1 : 0);
