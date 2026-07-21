// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// erp_key_epochs.js — T1 trust root (bim-compiler prompts/KERNEL_HARDENING_BATCH1_SPEC.md §NEXT SESSION)
// — Witness: W-ROSTER-VERIFY. PORTED from bim-compiler build/erp/erp_key_epochs.js (W-ROTATE, witnessed
// §ROTATE-OP/§HISTORY-VALID/§FUTURE-GATED/§REVOKE in scripts/poc_rotate.js) — excavated doctrine
// (DistributedERP.md §228/§290/§445), NOT fresh design. Two upgrades over the POC module:
//
//   1. CONTENT-AWARE MESSAGES (composes on T2/W-CONTENT-SIGN): a v2 row's sig attests the CONTENT hash
//      (KernelOps._contentHash — no id, no prev), a v1 row's sig attests op_hash. So roster verification
//      works across a MERGE (ids renumbered) for v2 rows — the property T1 needs and v1 could never give.
//   2. DEVICE-LEVEL CENTRAL ROSTER: a signed { devices: {device_id → pubJwk}, genesisKid } list, HQ-signed
//      under a PINNED key (the erp_snapshot_sign.js PINNED_PUBKEY pattern — the verifier trusts the pinned
//      HQ key out-of-band, never a key carried inside the payload). Epoch verification draws pubByKid +
//      genesisKid from the VERIFIED roster only.
//
// Model (unchanged from the witnessed POC — burn-not-reattribute, DECIDED):
//   • The genesis device key is active from the first op.
//   • ROTATE {kind:'ROTATE', newKid, signed_by} must be COUNTER-SIGNED by the OUTGOING (active) key;
//     it installs newKid for ops AFTER it. History keeps verifying under the old key — never re-signed.
//   • REVOKE {kind:'REVOKE', revokedKid, newKid?, signed_by} kills the revoked key's FUTURE ops; its PAST
//     ops stay valid (it really did author them). Optional newKid installs the successor.
//   • A normal op {signed_by} is valid iff that kid is ACTIVE at its seq, not revoked, sig verifies.
// This module COMPOSES on the kernel (like erp_period_close.js): KernelOps.verifyChain = integrity+order
// (key-independent); this is the AUTHENTICITY layer. It does not bloat kernel_ops.js.
(function () {
  'use strict';

  function _kernel() {
    if (typeof window !== 'undefined' && window.KernelOps) return window.KernelOps;
    if (typeof global !== 'undefined' && global.window && global.window.KernelOps) return global.window.KernelOps;
    return null;
  }
  function _snapSign() {
    if (typeof module !== 'undefined' && module.exports) { try { return require('./erp_snapshot_sign.js'); } catch (e) {} }
    if (typeof window !== 'undefined' && window.ErpSnapshotSign) return window.ErpSnapshotSign;
    return null;
  }

  // ── ROSTER — the HQ-signed device list (T1's central trust root) ──────────────────────────────
  // payload = { devices: { device_id/kid → pubJwk }, genesisKid, note? } — serialized with the kernel's
  // stableStringify (the T2 canonical) so the signed bytes are deterministic and delimiter-safe.
  function _rosterMessage(payload) {
    var K = _kernel();
    if (!K || !K.stableStringify) throw new Error('erp_key_epochs: KernelOps.stableStringify required (load kernel_ops.js ≥ v11)');
    return 'roster1|' + K.stableStringify(payload);   // domain-separated from op/content hashes
  }
  // signRoster — HQ signs the roster payload (opts.sign defaults to ErpSnapshotSign.signTip).
  async function signRoster(payload, hqPrivJwk, opts) {
    opts = opts || {};
    var sign = opts.sign || (_snapSign() && _snapSign().signTip);
    if (!sign) throw new Error('erp_key_epochs: no sign fn (erp_snapshot_sign.js not loaded?)');
    return { payload: payload, sig: await sign(hqPrivJwk, _rosterMessage(payload)) };
  }
  // verifyRoster — verify the roster under the PINNED HQ key (opts.hqPub, default = the pinned key in
  // erp_snapshot_sign.js). A tampered roster (any swapped device key) fails — the key list is not advisory.
  async function verifyRoster(signedRoster, opts) {
    opts = opts || {};
    var S = _snapSign();
    var verify = opts.verify || (S && function (msg, sig, pub) { return S.verifyTip(msg, sig, pub); });
    var hqPub = opts.hqPub || (S && S.PINNED_PUBKEY);
    if (!verify || !hqPub) return { ok: false, why: 'no verify fn / HQ pubkey' };
    if (!signedRoster || !signedRoster.payload || !signedRoster.sig) return { ok: false, why: 'roster missing payload/sig' };
    var ok = await verify(_rosterMessage(signedRoster.payload), signedRoster.sig, hqPub);
    if (!ok) { console.log('§ROSTER verify FAIL — signature invalid under the pinned HQ key'); return { ok: false, why: 'roster signature invalid' }; }
    console.log('§ROSTER verify OK devices=' + Object.keys(signedRoster.payload.devices || {}).length +
                ' genesis=' + signedRoster.payload.genesisKid);
    return { ok: true, roster: signedRoster.payload };
  }

  // ── EPOCH VERIFICATION ─────────────────────────────────────────────────────────────────────────
  // _sigMessage(op) — what this op's sig attests: v2 rows → the T2 content hash; v1 rows → op_hash.
  async function _sigMessage(op, opts) {
    var K = _kernel();
    var isV2 = (opts && opts.isV2) || (K && K._isV2);
    var contentHash = (opts && opts.contentHash) || (K && K._contentHash);
    if (isV2 && contentHash && isV2(op.parameters)) return contentHash(op);
    return op.op_hash;
  }

  // verifyEpochSigsOps(ops, opts) — the CORE walk, over an ARRAY (the transport/merge unit — same rows
  // exportBranch emits). Applies ROTATE/REVOKE transitions in seq order, verifying every op under the key
  // valid AT ITS seq (DistributedERP.md §290 — the key-epoch map).
  //   opts = { roster: signedRoster (HQ-verified here) | pubByKid + genesisKid (direct, tests),
  //            verify: async(msgHex, sigHex, pubJwk)->bool, hqPub?, contentHash?, isV2? }
  //   returns { ok, len, brokeAt?, why?, activeKid }
  async function verifyEpochSigsOps(ops, opts) {
    opts = opts || {};
    var S = _snapSign();
    var verify = opts.verify || (S && function (msg, sig, pub) { return S.verifyTip(msg, sig, pub); });
    if (!verify) return { ok: false, why: 'no verify fn' };
    var pubByKid = opts.pubByKid, activeKid = opts.genesisKid;
    if (opts.roster) {                                   // the central-roster path (production)
      var rv = await verifyRoster(opts.roster, opts);
      if (!rv.ok) return { ok: false, why: rv.why, brokeAt: null };
      pubByKid = rv.roster.devices; activeKid = rv.roster.genesisKid;
    }
    if (!pubByKid || !activeKid) return { ok: false, why: 'no roster/pubByKid+genesisKid' };
    var revoked = {};                                    // kid → the id at/after which it is rejected
    ops = ops || [];
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i], id = o.id;
      if (o.op_hash == null) return _fail(id, 'unsealed (hash chain not sealed)');
      var p = o.parameters; try { p = JSON.parse(p); } catch (e) { p = {}; }
      var signer = p.signed_by, kind = p.kind || 'NORMAL';
      var msg = await _sigMessage(o, opts);
      var pendingActive = null;

      if (kind === 'ROTATE') {
        // must be counter-signed by the OUTGOING (currently-active) key.
        if (signer !== activeKid) return _fail(id, 'ROTATE not counter-signed by outgoing key (signer=' + signer + ' active=' + activeKid + ')');
        if (!(await verify(msg, o.sig, pubByKid[activeKid]))) return _fail(id, 'ROTATE counter-signature invalid under outgoing key ' + activeKid);
        if (!pubByKid[p.newKid]) return _fail(id, 'ROTATE installs unknown key ' + p.newKid + ' (not in the roster)');
        pendingActive = p.newKid;
      } else if (kind === 'REVOKE') {
        // signed by the current authority (the active key) — graceful offboarding / compromise recovery.
        if (signer !== activeKid) return _fail(id, 'REVOKE not authorised by active key (signer=' + signer + ' active=' + activeKid + ')');
        if (!(await verify(msg, o.sig, pubByKid[activeKid]))) return _fail(id, 'REVOKE signature invalid under active key ' + activeKid);
        revoked[p.revokedKid] = id;                      // burn-not-reattribute: future rejected, past kept
        if (p.newKid) {
          if (!pubByKid[p.newKid]) return _fail(id, 'REVOKE installs unknown key ' + p.newKid + ' (not in the roster)');
          pendingActive = p.newKid;
        }
      } else {
        // normal op: the signer must be the ACTIVE key, not revoked, with a valid signature.
        if (!pubByKid[signer]) return _fail(id, 'op signed by key ' + signer + ' NOT in the roster (forged foreign key)');
        if (revoked[signer] != null && id >= revoked[signer]) return _fail(id, 'op signed by REVOKED key ' + signer + ' (revoked at ' + revoked[signer] + ')');
        if (signer !== activeKid) return _fail(id, 'op signed by non-active key ' + signer + ' (active=' + activeKid + ') — superseded key cannot sign new ops');
        if (!(await verify(msg, o.sig, pubByKid[signer]))) return _fail(id, 'signature invalid under ' + signer);
      }
      if (pendingActive) activeKid = pendingActive;
    }
    console.log('§EPOCH verifyEpochSigs OK len=' + ops.length + ' finalActiveKid=' + activeKid);
    return { ok: true, len: ops.length, activeKid: activeKid };
  }

  // verifyEpochSigs(db, opts) — the db-side variant (the kernel verify path): SELECT then delegate.
  async function verifyEpochSigs(db, opts) {
    var r = db.exec('SELECT id, op_uuid, timestamp, op_type, parameters, input_guids, output_guid, op_hash, sig, user_tag FROM kernel_ops ORDER BY id');
    if (!r.length) return { ok: true, len: 0, activeKid: (opts && opts.genesisKid) || null };
    var cols = r[0].columns;
    var ops = r[0].values.map(function (v) { var o = {}; cols.forEach(function (c, i) { o[c] = v[i]; }); return o; });
    return verifyEpochSigsOps(ops, opts);
  }

  function _fail(id, why) { console.log('§EPOCH verify FAIL at id=' + id + ' why=' + why); return { ok: false, brokeAt: id, why: why }; }

  // verifyMultiDeviceOps(ops, opts) — Implementing ERP_MULTIUSER_CONCURRENCY_POC.md §DocAction
  // Cross-Device Attribution S8 (corrected) — Witness: W-MULTI-DEVICE-VERIFY.
  //
  // verifyEpochSigsOps (above) enforces a SINGLE `activeKid` at every position — correct for its own
  // job (one device rotating/revoking its OWN key over time, the Teams importBranch path) but WRONG
  // for N devices that are all simultaneously, independently valid signers with no rotation between
  // them (confirmed by probe 2026-07-21: two concurrent devices with no ROTATE op between them —
  // verifyEpochSigsOps REJECTS the second one outright, "superseded key cannot sign new ops"). That
  // would break the exact N-device concurrent convergence witness_e2e_n_converge.js/W-N10-CONCURRENT-
  // TODAY already proved works.
  //
  // This is the correct model for THAT case: each op's `signed_by` kid is looked up directly in a flat
  // roster and its sig verified against THAT kid's own pubkey, INDEPENDENT of every other op's signer —
  // no state carried between ops, no rotation/revocation semantics (a device that wants those uses
  // verifyEpochSigsOps on its OWN single-writer branch instead — this function does not replace that).
  // Only v2 (content-signed) rows are attributable at all (a v1 sig can't survive a rebase/renumber
  // regardless, per kernel_ops.js _sigBase) — a v1 row or one with no `signed_by` is skipped (counted,
  // not failed): pre-S8 ops and rows from a device that never installed a kid stay valid but anonymous.
  //   opts = { roster: {kid→pubJwk} (direct — a witness/test roster; HQ-signed DISTRIBUTION over the
  //            relay is Phase 3, not this), verify: async(msgHex,sigHex,pubJwk)->bool, contentHash?,
  //            isV2? }
  //   returns { ok, len, attributed:{id→kid}, anonymous:[id,...], brokeAt?, why? }
  async function verifyMultiDeviceOps(ops, opts) {
    opts = opts || {};
    var S = _snapSign();
    var verify = opts.verify || (S && function (msg, sig, pub) { return S.verifyTip(msg, sig, pub); });
    if (!verify) return { ok: false, why: 'no verify fn' };
    var pubByKid = opts.roster || opts.pubByKid;
    if (!pubByKid) return { ok: false, why: 'no roster/pubByKid' };
    var attributed = {}, anonymous = [];
    ops = ops || [];
    for (var i = 0; i < ops.length; i++) {
      var o = ops[i], id = o.id;
      if (o.op_hash == null) return _fail(id, 'unsealed (hash chain not sealed)');
      var K = _kernel();
      var isV2 = (opts.isV2) || (K && K._isV2);
      if (!(isV2 && isV2(o.parameters))) { anonymous.push(id); continue; }   // v1 or no content-sign: skip, don't fail
      var p = o.parameters; try { p = JSON.parse(p); } catch (e) { p = {}; }
      var signer = p.signed_by;
      if (!signer) { anonymous.push(id); continue; }   // v2 but no kid stamped (signer never installed one)
      if (!pubByKid[signer]) return _fail(id, 'op signed by key ' + signer + ' NOT in the roster (forged/unknown device)');
      var msg = await _sigMessage(o, opts);
      if (!(await verify(msg, o.sig, pubByKid[signer]))) return _fail(id, 'signature invalid under ' + signer + ' (forged or wrong key)');
      attributed[id] = signer;
    }
    console.log('§EPOCH verifyMultiDevice OK len=' + ops.length + ' attributed=' + Object.keys(attributed).length + ' anonymous=' + anonymous.length);
    return { ok: true, len: ops.length, attributed: attributed, anonymous: anonymous };
  }

  // singleKeyVerify — the NO-EPOCH baseline (the §FALSIFIER straw man): one fixed key forges forever.
  // Kept from the POC only to witness the contrast against verifyEpochSigs.
  async function singleKeyVerify(db, opts) {
    var r = db.exec('SELECT id, op_hash, sig FROM kernel_ops ORDER BY id');
    if (!r.length) return { ok: true, len: 0 };
    var rows = r[0].values;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][1] == null) return { ok: false, brokeAt: rows[i][0], why: 'unsealed' };
      if (!(await opts.verify(rows[i][1], rows[i][2], opts.pub))) return { ok: false, brokeAt: rows[i][0], why: 'signature invalid' };
    }
    return { ok: true, len: rows.length };
  }

  var _api = { signRoster: signRoster, verifyRoster: verifyRoster,
    verifyEpochSigs: verifyEpochSigs, verifyEpochSigsOps: verifyEpochSigsOps, singleKeyVerify: singleKeyVerify,
    verifyMultiDeviceOps: verifyMultiDeviceOps };   // S8: N concurrently-valid devices, no rotation state
  if (typeof module !== 'undefined' && module.exports) { module.exports = _api; }
  if (typeof window !== 'undefined') { window.ErpKeyEpochs = _api; }
  if (typeof console !== 'undefined') { console.log('§EPOCH_LOADED v3 (roster + key-epoch verification + multi-device concurrent verify, content-aware — T1/W-ROSTER-VERIFY/W-MULTI-DEVICE-VERIFY)'); }
})();
