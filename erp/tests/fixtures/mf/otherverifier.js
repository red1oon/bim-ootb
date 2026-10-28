// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// otherverifier.js — TEST DOUBLE of a SECOND slip-verify provider (W-MF-SEED arm V4). It is served by the witness as /erp/slipverify/otherverifier.js ONLY while V4 runs, to prove that a new provider is
// one adapter file + one pair of rows. Its (invented) API differs from SlipOK's on purpose: the whole mapping to the standard contract lives in this file.
//   POST https://<host>/v1/slips/check   X-Verifier-Key: <key>   body { branch, qr, amount }
//   200 { ok:true, reference, approval, paid:{ amount }, when }   |   200 { ok:false, error }   |   5xx or no answer = unreached
(function (global) {
  'use strict';
  global.SlipVerify.register('org.kernel.slipverify.OtherVerifier', function (cfg) {
    var f = cfg.fetch || global.fetch.bind(global);
    return { verify: function (slip) {
      return f('https://' + cfg.host + '/v1/slips/check', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Verifier-Key': cfg.key }, body: JSON.stringify({ branch: cfg.branch, qr: slip.qr, amount: slip.amount }) })
        .then(function (r) { if (r.status >= 500) return { status: 'unreached', message: 'OtherVerifier is busy' };
          return r.json().then(function (j) { return j.ok ? { status: 'approved', ref: j.reference, authCode: j.approval, amount: j.paid && j.paid.amount, at: j.when, message: 'OtherVerifier confirmed' } : { status: 'refused', message: String(j.error || 'refused') }; }); },
          function () { return { status: 'unreached', message: 'OtherVerifier could not be reached' }; });
    } };
  });
})(typeof window !== 'undefined' ? window : globalThis);
