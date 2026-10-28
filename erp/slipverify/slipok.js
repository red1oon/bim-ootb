// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// slipok.js — the REFERENCE adapter of the slip-verify interface (slipverify.js): SlipOK, a Thai bank-slip verification service. Class: org.kernel.slipverify.SlipOK.
//
// SlipOK's request/response as documented by its public client libraries (slipok.com's own docs answered HTTP 403 to this build, so the shape is taken from the typed SDK github.com/Khaomi/node-slipok
// src/index.ts + src/types.ts, and github.com/maythiwat/slipverify src/providers/slipok.ts; READ THEM before trusting this file):
//   POST https://api.slipok.com/api/line/apikey/<branchId>   header x-authorization: <api key>   body JSON { data: <the QR text of the slip>, log?: true, amount?: <number> }
//   200 { success: true, data: { success, message, transRef, transDate, transTime, transTimestamp, sendingBank, receivingBank, sender, receiver, amount, ... } }
//   a refusal carries { code: 1000..1014, message } (1012/1013/1014 also carry data: the slip's own fields); 1010 = bank data not ready yet (data.delay seconds) -> try later.
// MAPPING     approved  <- success:true : ref = data.transRef, authCode = sendingBank-receivingBank, amount = data.amount, at = data.transTimestamp, message = data.message
//             refused   <- any {code, message} the service gives about THIS slip (duplicate, amount mismatch, not a slip ...): the service's own message, shown as is
//             unreached <- no answer at all (fetch rejects / timeout), HTTP 5xx or 429, a body that is not JSON, code 1010 (bank data not ready: ask again later)
// cfg = { host, port, branch, key, name, fetch }   branch = C_BankAccount_Processor.UserID, key = .Password, host/port = C_PaymentProcessor.HostAddress/HostPort. No key or branch id is in this repository.
(function (global) {
  'use strict';
  var SV = (typeof module !== 'undefined' && module.exports) ? require('./slipverify.js') : global.SlipVerify;
  var TIMEOUT_MS = 8000;
  SV.register('org.kernel.slipverify.SlipOK', function (cfg) {
    var f = cfg.fetch || (global.fetch && global.fetch.bind(global));
    return {
      verify: function (slip) {
        var url = 'https://' + (cfg.host || 'api.slipok.com') + (cfg.port && Number(cfg.port) !== 443 ? ':' + cfg.port : '') + '/api/line/apikey/' + encodeURIComponent(cfg.branch || ''),
            body = { data: String(slip.qr), log: true }; if (slip.amount != null && Number(slip.amount) > 0) body.amount = Number(slip.amount);
        var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
        return f(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-authorization': cfg.key || '' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
          .then(function (resp) {
            if (timer) clearTimeout(timer);
            if (resp.status >= 500 || resp.status === 429) return { status: 'unreached', message: 'SlipOK is busy (HTTP ' + resp.status + ')' };
            return resp.json().then(function (j) {
              if (j && j.success === true && j.data) { var d = j.data; return { status: 'approved', ref: d.transRef, authCode: [d.sendingBank, d.receivingBank].filter(Boolean).join('-'), amount: d.amount, at: d.transTimestamp || null, message: d.message || 'Slip verified' }; }
              if (j && j.code === 1010) return { status: 'unreached', message: 'SlipOK: bank data not ready yet' };
              if (j && (j.code != null || j.message)) return { status: 'refused', message: String(j.message || ('SlipOK code ' + j.code)) };
              return { status: 'unreached', message: 'SlipOK gave an answer this phone does not understand' };
            }, function () { return { status: 'unreached', message: 'SlipOK gave an answer this phone does not understand' }; });
          }, function () { if (timer) clearTimeout(timer); return { status: 'unreached', message: 'SlipOK could not be reached' }; });
      }
    };
  });
})(typeof window !== 'undefined' ? window : globalThis);
