// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// erp_attrib.js — T1 (employee attribution): PIN/login as AUDIT METADATA on the op, NOT a signing key.
// Spec: bim-compiler prompts/FABLE5_WRAPUP_2026-07-03.md §Item 3 (user-locked 2026-07-03) +
//       prompts/KERNEL_TIMEBOMB_AUDIT_2026-07-03.md §T1 (the employee-attribution sub-gap).
// Witness: W-T1-ATTRIB (teams/tests/poc_teams_t1_attrib.js).
//
// The device already holds the REAL cryptographic identity (#630: erp_key_epochs HQ-signed roster —
// the device key signs every op). What was still open is EMPLOYEE-grain attribution: `actor` was a
// self-minted localStorage tag and maker-checker compared self-asserted name strings — two typed
// names defeated four-eyes. This module closes that WITHOUT re-opening multi-signer key management:
//   • the employee identifies at ACTION time (PIN) against an ORG-SUPPLIED directory — NON-INVENT:
//     an unknown PIN resolves to null (refused), never a guessed identity;
//   • the resolved identity is recorded ALONGSIDE the op (rich parameters `attrib` / cosign
//     params.attrib) — content-signed BY THE DEVICE KEY, so attribution cannot be rewritten after
//     the fact without breaking the signature;
//   • the signature chain is UNCHANGED — still one device key, zero per-PIN keys (W-T1-ATTRIB §d).
// PINs are never stored, transported, or logged raw: the directory holds sha256(pin) only.
(function () {
  'use strict';
  var subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;

  function _hex(buf) {
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  // hashPin(pin) -> Promise<sha256 hex>. The ONLY form a PIN ever takes at rest or in a directory.
  function hashPin(pin) {
    if (!subtle) return Promise.reject(new Error('erp_attrib: crypto.subtle unavailable'));
    if (typeof pin !== 'string' || pin.length === 0) return Promise.reject(new Error('erp_attrib: empty PIN'));
    return subtle.digest('SHA-256', new TextEncoder().encode('erpattrib1|' + pin)).then(_hex);
  }

  // makeDirectory(entries) — entries = [{ empId, name, pinHash }] (ORG-supplied roster of employees).
  // Returns { <pinHash>: {emp, name} }. Deterministic + strict: a duplicate pinHash is AMBIGUOUS
  // identity and throws (two employees may not share a PIN); empId must be a plain token.
  function makeDirectory(entries) {
    var dir = {};
    (entries || []).forEach(function (e) {
      if (!e || typeof e.empId !== 'string' || !/^[\w.@-]+$/.test(e.empId)) throw new Error('erp_attrib: bad empId');
      if (typeof e.pinHash !== 'string' || !/^[0-9a-f]{64}$/.test(e.pinHash)) throw new Error('erp_attrib: bad pinHash for ' + e.empId);
      if (dir[e.pinHash]) throw new Error('erp_attrib: duplicate PIN (ambiguous identity: ' + dir[e.pinHash].emp + ' vs ' + e.empId + ')');
      dir[e.pinHash] = { emp: e.empId, name: e.name != null ? String(e.name) : e.empId };
    });
    return dir;
  }

  // identify(pin, directory) -> Promise<{emp, name, m:'pin'} | null>. NON-INVENT: null when unknown.
  function identify(pin, directory) {
    return hashPin(pin).then(function (h) {
      var hit = directory && directory[h];
      return hit ? { emp: hit.emp, name: hit.name, m: 'pin' } : null;
    });
  }

  // attrib(identity, deviceActor) — the metadata object recorded on ops: WHO (employee, from PIN)
  // on WHICH device (the signing identity's actor tag). Both are recorded INPUTS, never derived.
  function attrib(identity, deviceActor) {
    if (!identity || !identity.emp) throw new Error('erp_attrib: no identity');
    return { emp: identity.emp, name: identity.name, m: identity.m || 'pin', dev: String(deviceActor || '') };
  }

  var API = { hashPin: hashPin, makeDirectory: makeDirectory, identify: identify, attrib: attrib };
  if (typeof window !== 'undefined') window.ErpAttrib = API;   // window-only, like kernel_ops.js/erp_signer.js
  console.log('§T1_ATTRIB_LOADED erp_attrib.js (PIN → audit metadata; device key still the only signer)');
})();
