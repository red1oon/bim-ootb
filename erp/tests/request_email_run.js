#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — the email -> Request folder runner (bim-compiler prompts/SQLiteIDEMPIERE.md §EMAIL-REQ-R3 SPEC). READ THE LOG after every run: the §EMAILREQ lines are the evidence.
// A folder of .eml files stands in for the IMAP Inbox (the IMAP reader + folder moves are R4, not built). Every .eml, in name order, goes through
//   request_email.processMailbox on a fresh headless kernel (ws_kernel.js: ad_seed.db in memory - nothing is persisted by this runner).
// Run: node erp/tests/request_email_run.js <folder> '{"R_RequestType_ID":101,"AD_User_ID":50001,"C_BPartner_ID":118}' > <log>
'use strict';
const fs = require('fs'), path = require('path');
if (!global.window) global.window = {};
const ERP = path.join(__dirname, '..');
// Node < 21.2 has (De)CompressionStream without 'deflate-raw', which ad_attachment.js zipBuild/zipParse use (the browser has it). This shell edge adds just that format from zlib.
(function rawDeflateShim() {
  const zlib = require('zlib');
  function shim(Orig, fn) { return function (fmt) { if (fmt !== 'deflate-raw') return new Orig(fmt); const parts = [];
    return new TransformStream({ transform(c) { parts.push(Buffer.from(c)); }, flush(ctl) { ctl.enqueue(new Uint8Array(fn(Buffer.concat(parts)))); } }); }; }
  try { new CompressionStream('deflate-raw'); } catch (e) { global.CompressionStream = shim(CompressionStream, zlib.deflateRawSync); }
  try { new DecompressionStream('deflate-raw'); } catch (e) { global.DecompressionStream = shim(DecompressionStream, zlib.inflateRawSync); }
})();

// runFolder(dir, params, opts) -> Promise<{ k, session, out }> (shared with the witness)
async function runFolder(dir, params, opts) {
  opts = opts || {};
  const K = require(path.join(ERP, 'ws_kernel.js')), k = opts.kernel || await K.load(), RE = require(path.join(ERP, 'request_email.js'));
  const A = require(path.join(ERP, 'ad_callout.js'));
  const session = { clientId: 11, orgId: 11, userId: 100, roleId: 102, actor: 'process:RequestEMailProcessor' };
  const emails = fs.readdirSync(dir).filter((f) => /\.eml$/.test(f)).sort().filter((f) => !opts.only || opts.only.indexOf(f) >= 0)
    .map((f) => ({ name: f, raw: fs.readFileSync(path.join(dir, f), 'latin1') }));
  const ctx = { q: k.q, clientId: session.clientId, params: params || {}, stamp: (ms) => A.Env.stamp(ms).now, idSet: k.ML.idSet, mutant: opts.mutant || null };
  const out = await RE.processMailbox(k, session, emails, ctx);
  return { k, session, out, emails };
}

if (require.main === module) {
  const _log = console.log; console.log = function () {};   // the kernel's own boot chatter; every line this runner prints goes through say()
  const say = (s) => _log(s);
  const dir = process.argv[2], params = process.argv[3] ? JSON.parse(process.argv[3]) : {};
  if (!dir) { say('usage: request_email_run.js <folder> [paramsJson]'); process.exit(2); }
  runFolder(path.resolve(dir), params).then(({ out }) => {
    out.results.forEach((r) => { say('§EMAILREQ ' + r.name + ' folder=' + r.folder + ' route=' + r.route + ' request=' + r.requestId + ' attachment=' + r.attachmentId + ' reason=' + r.reason); r.log.forEach((l) => say('    ' + l)); });
    say('§EMAILREQ-RUN processInBox - Total=' + out.total + ' - Requests=' + out.requests + ' - Errors=' + out.errors + ' (RequestEMailProcessor.doIt :161-164 text)');
  }).catch((e) => { say('§EMAILREQ-RUN threw ' + (e && e.stack || e)); process.exit(1); });
}
module.exports = { runFolder };
