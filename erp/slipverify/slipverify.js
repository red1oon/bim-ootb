// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// slipverify.js — the ONE standard slip-verify interface (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §40.2, Witness: W-MF-SEED erp/tests/witness_mf_seed.js arms V1-V4).
//
// Modelled on legacy's seam for an external payment service (MPayment.java:540-560 PaymentProcessor.create(...)): a C_PaymentProcessor row NAMES the adapter class (PayProcessorClass) and a
// C_BankAccount_Processor row binds it to a bank account and holds its credentials (UserID = the service's branch id, Password = its API key; the key lives in the phone's own local row, never in code).
// So a second provider is ONE adapter file + ONE pair of rows; nothing else changes.
//
// CONTRACT   adapter = { verify(slip) -> Promise<{ service, status, ref, authCode, amount, at, message }> }
//   slip     { qr: <the text of the e-slip's QR code>, amount: <the amount the borrower says was paid>, invoice: <InvoiceDocumentNo> }
//   status   'approved' | 'refused' | 'unreached'   ('unreached' = the service did not answer; the slip is NOT judged)
//   ref      the bank's transaction reference (-> I_Payment.R_PnRef)   authCode -> R_AuthCode   amount -> PayAmt   at -> DateTrx   message -> R_RespMsg   service -> the name shown to the borrower
// LOADING    an adapter class 'a.b.Name' is the file slipverify/<name lowercased>.js next to this one (convention, so a new provider needs no change here). A file registers itself with SlipVerify.register(class, factory).
//   factory(cfg) -> adapter, cfg = { host, port, branch, key, name, fetch } read from the two rows by the caller.
(function (global) {
  'use strict';
  var registry = {};
  function register(cls, factory) { registry[cls] = factory; }
  function fileOf(cls) { return 'slipverify/' + String(cls).split('.').pop().toLowerCase() + '.js'; }
  function load(cls, base) {                                                   // -> Promise<factory>; a registered class is not loaded twice
    if (registry[cls]) return Promise.resolve(registry[cls]);
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = (base || '') + fileOf(cls);
      s.onload = function () { registry[cls] ? res(registry[cls]) : rej(new Error('adapter file ' + fileOf(cls) + ' did not register ' + cls)); };
      s.onerror = function () { rej(new Error('no adapter file ' + fileOf(cls))); };
      document.head.appendChild(s);
    });
  }
  // answer shape check: a reply that breaks the contract is 'unreached' with a plain message, never a thrown error into the page
  function norm(service, r) {
    var ok = r && (r.status === 'approved' || r.status === 'refused' || r.status === 'unreached');
    if (!ok) return { service: service, status: 'unreached', ref: null, authCode: null, amount: null, at: null, message: service + ' gave an answer this phone does not understand' };
    return { service: r.service || service, status: r.status, ref: r.ref == null ? null : String(r.ref), authCode: r.authCode == null ? null : String(r.authCode), amount: r.amount == null ? null : Number(r.amount), at: r.at || null, message: r.message || '' };
  }
  function create(cls, cfg, base) {                                            // -> Promise<{ service, verify(slip) }>
    return load(cls, base).then(function (factory) {
      var a = factory(cfg), name = cfg.name || cls;
      return { service: name, verify: function (slip) { return Promise.resolve().then(function () { return a.verify(slip); }).then(function (r) { return norm(name, r); }, function () { return norm(name, { status: 'unreached', message: name + ' could not be reached' }); }); } };
    });
  }
  var API = { register: register, create: create, fileOf: fileOf, norm: norm, _registry: registry };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.SlipVerify = API;
})(typeof window !== 'undefined' ? window : globalThis);
