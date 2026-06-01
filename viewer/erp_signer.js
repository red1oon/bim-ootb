// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// erp_signer.js — W-SIGN (A2): the edge signer that turns the live W-CHAIN from tamper-EVIDENT
// into un-FORGEABLE. Spec: scripts/poc_sign.js (ECDSA P-256 / SHA-256, present-but-not-forge) +
// docs/ERP.md §0.20 / §9-B. The kernel (kernel_ops.js) only ever sees {sign, verify}; the private
// key custody lives HERE, at the edge — a NON-EXTRACTABLE CryptoKey in IndexedDB, never serialised.
//
// Layering (matches poc_sign §CASE4): the signature attests OVER op_hash and is NOT part of the
// hash, so the deterministic chain stays byte-identical across devices while sigs are per-issuer.
// Keys are edge-minted INPUTS (§7) — one keypair per device, minted once, reused after reload.
(function () {
  'use strict';
  var subtle = (typeof crypto !== 'undefined' && crypto.subtle) ? crypto.subtle : null;
  var GEN_ALG  = { name: 'ECDSA', namedCurve: 'P-256' };
  var SIGN_ALG = { name: 'ECDSA', hash: 'SHA-256' };
  var DB_NAME = 'bim_erp_signer', STORE = 'keys', KEY_ID = 'edge';

  // We sign over the op_hash HEX STRING's bytes (TextEncoder), mirroring poc_sign's
  // Buffer.from(opHash) — ECDSA then SHA-256-hashes that input internally. sealChain hands us the
  // hex op_hash; verifyChain hands us (hex, sigHex). Keep both ends identical.
  function _bytes(hex) { return new TextEncoder().encode(hex); }
  function _hex(buf) { return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join(''); }
  function _unhex(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }

  // mintKeypair — fresh edge keypair. extractable=false → the PRIVATE key is non-extractable
  // (custody never leaves the device); per WebCrypto the generated PUBLIC key is still exportable
  // (a shareable verifier). Returns a CryptoKeyPair.
  function mintKeypair() {
    if (!subtle) return Promise.reject(new Error('crypto.subtle unavailable — cannot mint signer key'));
    return subtle.generateKey(GEN_ALG, false, ['sign', 'verify']);
  }

  // makeSigner — bind a keypair (or any {privateKey, publicKey}) to the kernel's signer contract.
  // sign(hashHex) -> Promise<sigHex> ; verify(hashHex, sigHex) -> Promise<bool>.
  function makeSigner(keyPair) {
    return {
      sign: function (hashHex) {
        return subtle.sign(SIGN_ALG, keyPair.privateKey, _bytes(hashHex)).then(_hex);
      },
      verify: function (hashHex, sigHex) {
        if (!sigHex) return Promise.resolve(false);
        return subtle.verify(SIGN_ALG, keyPair.publicKey, _unhex(sigHex), _bytes(hashHex))
                     .catch(function () { return false; });
      }
    };
  }

  // loadOrMint — edge custody: return the stored keypair, or mint+persist one. The CryptoKeyPair is
  // stored by structured-clone (IDB stores CryptoKey objects natively); the non-extractable private
  // key survives reload still unusable for export — only sign/verify. Mints exactly once per device.
  function loadOrMint(dbName) {
    dbName = dbName || DB_NAME;
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onerror = function () { reject(req.error || new Error('idb open failed')); };
      req.onsuccess = function () {
        var db = req.result;
        var get = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID);
        get.onsuccess = function () {
          if (get.result) { resolve(get.result); return; }   // {publicKey, privateKey}
          mintKeypair().then(function (kp) {
            var pair = { publicKey: kp.publicKey, privateKey: kp.privateKey };
            var wtx = db.transaction(STORE, 'readwrite');
            wtx.objectStore(STORE).put(pair, KEY_ID);
            wtx.oncomplete = function () { resolve(kp); };
            wtx.onerror = function () { reject(wtx.error || new Error('idb put failed')); };
          }).catch(reject);
        };
        get.onerror = function () { reject(get.error || new Error('idb get failed')); };
      };
    });
  }

  // installSigner — the one call the page makes on load: load-or-mint the edge key and hand the
  // kernel its signer. After this, sealChain signs each op_hash and verifyChain checks it.
  function installSigner(KernelOps, opts) {
    opts = opts || {};
    return loadOrMint(opts.dbName).then(function (kp) {
      KernelOps.setSigner(makeSigner(kp));
      return subtle.exportKey('spki', kp.publicKey).then(function (pub) {
        console.log('§SIGN installed alg=ECDSA-P256 pubkey=' + _hex(pub).slice(0, 16) + '… custody=idb-nonextractable');
        return kp;
      }).catch(function () { console.log('§SIGN installed alg=ECDSA-P256 custody=idb-nonextractable'); return kp; });
    });
  }

  var API = { mintKeypair: mintKeypair, makeSigner: makeSigner, loadOrMint: loadOrMint, installSigner: installSigner };
  if (typeof window !== 'undefined') window.ErpSigner = API;   // browser-pure (window-only, like kernel_ops.js — no `module` global, keeps the no-undef CI gate green)
  console.log('§SIGN_LOADED erp_signer.js (W-SIGN edge keypair, ECDSA P-256)');
})();
