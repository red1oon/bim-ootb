#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — sign_bundle.js: the BUILD STEP that signs a plugin bundle (TEAMWORK_FRAMEWORK §46.5 F6, Stage 2). Witness: erp/tests/witness_team_keys.js (B10).
//   node erp/tools/sign_bundle.js sign <entry.js> <private.jwk> <public.jwk> [<private2.jwk> <public2.jwk> ...] [--id X --version Y]   -> prints the signature JSON on stdout
//   The signature = {kind:'bundle', id, version, digest: sha256(entry bytes), bytes, signer, sig, cosigs?}; sig = ECDSA P-256 / SHA-256 over canonical(the object minus sig/signer/cosigs).
//   id / version come from --id/--version, else from `id:` / `version:` string literals of the entry's `manifest`. Private keys are read from the paths given and never written anywhere.
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto'), subtle = crypto.webcrypto.subtle;
var ENV = require(path.join(__dirname, '..', '..', 'common', 'comm', 'comm_envelope.js'));
var ALG = { name: 'ECDSA', namedCurve: 'P-256' };
async function sigHex(body, priv) { var key = await subtle.importKey('jwk', priv, ALG, false, ['sign']); return Buffer.from(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(ENV.canonical(body)))).toString('hex'); }
async function main(argv) {
  var a = argv.slice(), flags = {}; for (var i = a.length - 1; i >= 0; i--) if (/^--(id|version)$/.test(a[i])) { flags[a[i].slice(2)] = a[i + 1]; a.splice(i, 2); }
  if (a[0] !== 'sign' || a.length < 4 || (a.length - 2) % 2) { console.error('usage: sign_bundle.js sign <entry.js> <private.jwk> <public.jwk> [<private2.jwk> <public2.jwk> ...] [--id X --version Y]'); process.exit(2); }
  var bytes = fs.readFileSync(a[1]), src = bytes.toString('utf8');
  var id = flags.id || (/manifest\s*[=:]\s*\{[^}]*?\bid\s*:\s*["']([^"']+)["']/.exec(src) || [])[1], version = flags.version || (/manifest\s*[=:]\s*\{[^}]*?\bversion\s*:\s*["']([^"']+)["']/.exec(src) || [])[1];
  if (!id || !version) { console.error('cannot read id / version from the entry: pass --id and --version'); process.exit(2); }
  var body = { kind: 'bundle', id: id, version: version, digest: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }, keys = [];
  for (var j = 2; j < a.length; j += 2) keys.push({ priv: JSON.parse(fs.readFileSync(a[j], 'utf8')), pub: JSON.parse(fs.readFileSync(a[j + 1], 'utf8')) });
  var pubOf = function (k) { return { kty: k.pub.kty, crv: k.pub.crv, x: k.pub.x, y: k.pub.y }; };
  var out = Object.assign({}, body, { signer: pubOf(keys[0]), sig: await sigHex(body, keys[0].priv) });
  if (keys.length > 1) out.cosigs = await Promise.all(keys.slice(1).map(async function (k) { return { signer: pubOf(k), sig: await sigHex(body, k.priv) }; }));
  process.stdout.write(JSON.stringify(out) + '\n');
}
main(process.argv.slice(2)).catch(function (e) { console.error(e && e.message || e); process.exit(1); });
