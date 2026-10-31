#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — sign_updatelist.js: the BUILD STEP that signs an update list (TEAMWORK_FRAMEWORK §46.3/§46.5 F8, Stage 3). Witness: erp/tests/witness_team_updates.js.
//   node erp/tools/sign_updatelist.js sign <list-body.json> <private.jwk> <public.jwk> [<private2.jwk> <public2.jwk> ...]   -> prints the signed list JSON on stdout
//   node erp/tools/sign_updatelist.js hash <release-file>                                                                -> prints sha256 and byte size (for an entry's hash / size)
//   sig = ECDSA P-256 / SHA-256 over canonical(the list minus sig/signer/cosigs); a second key pair adds a cosignature (threshold). Private keys are read, never written.
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto'), subtle = crypto.webcrypto.subtle;
var ENV = require(path.join(__dirname, '..', '..', 'common', 'comm', 'comm_envelope.js')), TK = require(path.join(__dirname, '..', '..', 'common', 'comm', 'team_keys.js')), TU = require(path.join(__dirname, '..', '..', 'common', 'comm', 'team_updates.js'));
var ALG = { name: 'ECDSA', namedCurve: 'P-256' };
async function sigHex(body, priv) { var key = await subtle.importKey('jwk', priv, ALG, false, ['sign']); return Buffer.from(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(ENV.canonical(body)))).toString('hex'); }
async function main(a) {
  if (a[0] === 'hash' && a[1]) { var b = fs.readFileSync(a[1]); console.log(JSON.stringify({ hash: crypto.createHash('sha256').update(b).digest('hex'), size: b.length })); return; }
  if (a[0] !== 'sign' || a.length < 4 || (a.length - 2) % 2) { console.error('usage: sign_updatelist.js sign <list-body.json> <private.jwk> <public.jwk> [...] | hash <release-file>'); process.exit(2); }
  var body = TK.bodyOf(JSON.parse(fs.readFileSync(a[1], 'utf8'))), keys = [];
  for (var j = 2; j < a.length; j += 2) keys.push({ priv: JSON.parse(fs.readFileSync(a[j], 'utf8')), pub: JSON.parse(fs.readFileSync(a[j + 1], 'utf8')) });
  var pubOf = function (k) { return { kty: k.pub.kty, crv: k.pub.crv, x: k.pub.x, y: k.pub.y }; };
  var out = Object.assign({}, body, { signer: pubOf(keys[0]), sig: await sigHex(body, keys[0].priv) });
  if (keys.length > 1) out.cosigs = await Promise.all(keys.slice(1).map(async function (k) { return { signer: pubOf(k), sig: await sigHex(body, k.priv) }; }));
  var pb = TU.listProblem(out); if (pb) { console.error('refused: the list is malformed (' + pb + ')'); process.exit(1); }
  for (var i = 0; i < out.entries.length; i++) { var ep = TU.entryProblem(out.entries[i]); if (ep) { console.error('refused: entry ' + out.entries[i].id + ': ' + ep); process.exit(1); } }
  process.stdout.write(JSON.stringify(out) + '\n');
}
main(process.argv.slice(2)).catch(function (e) { console.error(e && e.message || e); process.exit(1); });
