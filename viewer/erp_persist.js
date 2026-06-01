// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// erp_persist.js — W-PERSIST (A4): durable-local + the recoverable-signed-snapshot hook. Spec:
// scripts/poc_persist.js + ERP.md §9-A, §5.2b. Doctrine: "secure the FACT, not the container" — the
// local DB is DISPOSABLE (export→import round-trips byte-for-byte), and the recoverable log is a
// SIGNED full snapshot (e.g. emailed), chosen by signed seq (not arrival order), forgery-rejecting.
// Browser-pure (window-only, like kernel_ops.js). The full recovery flow is proven in poc_persist.js;
// here the snapshot EMIT is a stub hook (the transport/sink is the caller's choice).
(function () {
  'use strict';

  // requestPersist — ask the browser to make storage durable (survive eviction). erp.html never called
  // this before (only scene.js did). Logs §PERSIST persisted=<granted|unsupported|error>.
  function requestPersist() {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.persist) {
      console.log('§PERSIST persisted=unsupported');
      return Promise.resolve(false);
    }
    return navigator.storage.persist().then(function (granted) {
      console.log('§PERSIST persisted=' + granted);
      return granted;
    }).catch(function () { console.log('§PERSIST persisted=error'); return false; });
  }

  // ── disposable container: export → (wipe) → import round-trips ──
  function exportBytes(db) { return db.export(); }                 // what goes to IndexedDB / a file
  function importBytes(SQL, bytes) { return new SQL.Database(bytes); }

  // roundTrip — export the live DB, drop it, re-import; logs sizes. The caller compares projection
  // hashes (the local copy is disposable iff pre==post). Returns the re-imported DB.
  function roundTrip(SQL, db) {
    var bytes = exportBytes(db);
    var restored = importBytes(SQL, bytes);
    console.log('§PERSIST roundtrip size=' + (bytes.length / 1024).toFixed(1) + 'KB reimported=' + (!!restored));
    return restored;
  }

  // ── the recoverable signed snapshot (the email hook) ──
  // snapshotPayload(rows, seq) — the durable, signable state payload. recover() picks the highest-seq
  // VALID snapshot (poc_persist.js proves the full seq-not-arrival, single-snapshot, forgery-rejecting
  // recovery). Here emit is a STUB: sign the payload and hand {seq,snap,hash,sig} to a sink.
  function _sha256Hex(str) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
        return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      });
    }
    return Promise.reject(new Error('crypto.subtle unavailable'));
  }

  // emitSnapshot(snapJson, seq, signer, sink) — STUB recovery hook. signer = ErpSigner.makeSigner(kp)
  // (or any {sign}); sink defaults to a §-log line. Returns the signed envelope {seq,snap,hash,sig}.
  function emitSnapshot(snapJson, seq, signer, sink) {
    return _sha256Hex(seq + '|' + snapJson).then(function (hash) {
      var signP = (signer && signer.sign) ? signer.sign(hash) : Promise.resolve(null);
      return signP.then(function (sig) {
        var env = { seq: seq, snap: snapJson, hash: hash, sig: sig };
        if (typeof sink === 'function') sink(env);
        else console.log('§PERSIST snapshot emitted seq=' + seq + ' hash=' + hash.slice(0, 12) + '… signed=' + (!!sig));
        return env;
      });
    });
  }

  var API = { requestPersist: requestPersist, exportBytes: exportBytes, importBytes: importBytes,
              roundTrip: roundTrip, emitSnapshot: emitSnapshot };
  if (typeof window !== 'undefined') window.ErpPersist = API;   // browser-pure (window-only, no `module` global — keeps no-undef CI gate green)
  console.log('§PERSIST_LOADED erp_persist.js (W-PERSIST durable + signed-snapshot hook)');
})();
