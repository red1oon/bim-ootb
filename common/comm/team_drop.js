// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* ⚠ DO NOT REMOVE — team_drop.js: a FILE DROP in the team folder — files (a report, its photos) sealed with the team key and signed by the device,
 * in the device's own drawer `s/<space>/pub/<kid>/drop-<id>/…`. NOT folded into the log (no op, no merge): the comm layer carries record changes,
 * and a photo in an op would sit on every paired device forever (bim-compiler prompts/MOBILE_PERF.md §P5 F3 STEP 3 BUILD SPEC, owner decision 2026-11-27).
 * Precedent for the drawer: team_updates.js (signed files under pub/<kid>/, relay contract unchanged: put / get / list, one writer per name).
 * Witness: viewer/tests/witness_send_hq_team.js (W-SEND-HQ-TEAM). Read the log after every run.
 *
 *   seal(files, ctx) -> { id, entries:[{name, bytes}], manifest }   files = [{ name, type, bytes:Uint8Array }]; ctx = { space, epoch, key (AES-GCM CryptoKey), signer:{kid, privateKey}, label? }
 *   open(pipe, ctx)  -> { ok:true, files, manifest } | { ok:false, reason }   ctx = { space, kid, id, roster (folded, store.order().roster), ring (store.keyring()), metaOnly? }
 *     metaOnly: the manifest is verified and the sealed meta opened (label + file names), no part is read -> { ok:true, files:[], names, label, manifest }
 *   list(pipe, space) -> [{ kid, id }]
 *   newestKey(ring) -> { epoch, key } | null
 * Names: m.json = the signed manifest (plaintext: no file name, no building, only part sizes + hashes); <n>.bin = part n = iv(12) ‖ AES-GCM ciphertext,
 * AAD 'bim-drop|<space>|<epoch>|<n>'. The file list (names, types) is itself sealed in manifest.meta. No key → no drop (never plaintext).
 * Refusal reasons (open): unknown-author · revoked · bad-signature · wrong-space · part-missing · part-hash · no-key · tampered.
 */
(function (global) {
  'use strict';
  var ENV = global.CommEnvelope || (typeof require === 'function' ? require('./comm_envelope.js') : null);
  var HEX64 = /^[0-9a-f]{64}$/;
  function sub() { var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null; if (!c || !c.subtle) throw new Error('team_drop: WebCrypto subtle unavailable'); return c.subtle; }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }
  async function sha(bytes) { return hex(await sub().digest('SHA-256', bytes)); }
  function b64(bytes) { if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64'); var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
  function unb64(t) { if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(String(t), 'base64')); var s = atob(String(t)), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  var enc = function (s) { return new TextEncoder().encode(s); }, dec = function (b) { return new TextDecoder().decode(b); };
  function aad(space, epoch, n) { return enc('bim-drop|' + space + '|' + epoch + '|' + n); }
  function dir(space, kid, id) { return 's/' + space + '/pub/' + kid + '/drop-' + id + '/'; }

  async function sealOne(bytes, key, space, epoch, n) {
    var iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    var ct = new Uint8Array(await sub().encrypt({ name: 'AES-GCM', iv: iv, additionalData: aad(space, epoch, n) }, key, bytes));
    var out = new Uint8Array(12 + ct.length); out.set(iv, 0); out.set(ct, 12); return out;
  }
  async function openOne(part, key, space, epoch, n) {
    if (!part || part.length < 28) return null;
    try { return new Uint8Array(await sub().decrypt({ name: 'AES-GCM', iv: part.slice(0, 12), additionalData: aad(space, epoch, n) }, key, part.slice(12))); } catch (e) { return null; }
  }

  function newestKey(ring) {
    var es = Object.keys(ring || {}).map(Number).filter(function (e) { return ring[e] && ring[e].length; }).sort(function (a, b) { return b - a; });
    return es.length ? { epoch: es[0], key: ring[es[0]][0] } : null;
  }

  async function seal(files, ctx) {
    if (!ctx || !HEX64.test(String(ctx.space || '')) || !ctx.key || !Number.isInteger(ctx.epoch) || !ctx.signer || !ctx.signer.kid) throw new Error('team_drop.seal: space, epoch, key and signer are required');
    var parts = [], list = [];
    for (var i = 0; i < files.length; i++) {
      var p = await sealOne(files[i].bytes, ctx.key, ctx.space, ctx.epoch, i);
      parts.push(p); list.push({ n: i, name: String(files[i].name), type: String(files[i].type || 'application/octet-stream') });
    }
    var meta = await sealOne(enc(JSON.stringify({ files: list, label: ctx.label || '' })), ctx.key, ctx.space, ctx.epoch, 'meta');
    var body = { v: 1, kind: 'bim-drop', space: ctx.space, author: ctx.signer.kid, epoch: ctx.epoch, made_at: ctx.made_at || new Date().toISOString(), meta: b64(meta), parts: [] };
    for (var j = 0; j < parts.length; j++) body.parts.push({ n: j, bytes: parts[j].length, sha256: await sha(parts[j]) });
    var manifest = await ENV.sign(body, ctx.signer);
    var id = (await sha(enc(ENV.canonical(body)))).slice(0, 16), d = dir(ctx.space, ctx.signer.kid, id);
    var entries = [{ name: d + 'm.json', bytes: enc(JSON.stringify(manifest)) }];
    parts.forEach(function (p, k) { entries.push({ name: d + k + '.bin', bytes: p }); });
    return { id: id, entries: entries, manifest: manifest };
  }

  async function list(pipe, space) {
    var out = [], re = /^s\/[0-9a-f]{64}\/pub\/([^/]+)\/drop-([0-9a-f]{16})\/m\.json$/;
    (await pipe.list('s/' + space + '/pub/')).forEach(function (n) { var m = re.exec(n); if (m) out.push({ kid: m[1], id: m[2] }); });
    return out;
  }

  async function open(pipe, ctx) {
    function no(r) { return { ok: false, reason: r }; }
    var d = dir(ctx.space, ctx.kid, ctx.id), mb = await pipe.get(d + 'm.json'); if (!mb) return no('part-missing');
    var man; try { man = JSON.parse(dec(mb)); } catch (e) { return no('bad-signature'); }
    var R = ctx.roster || {}, dev = (R.devices || {})[ctx.kid];
    if (!dev || man.author !== ctx.kid) return no('unknown-author');
    if ((R.revokes || {})[ctx.kid] != null) return no('revoked');   // the value is the last good seq, and 0 is a revoke too (found by W-HQ-VIEW V6)
    if (!(await ENV.verify(man, dev.jwk))) return no('bad-signature');
    if (man.space !== ctx.space || man.kind !== 'bim-drop' || man.v !== 1) return no('wrong-space');
    var keys = (ctx.ring || {})[man.epoch]; if (!keys || !keys.length) return no('no-key');
    var key = null, metaB = unb64(man.meta), meta = null;
    for (var k = 0; k < keys.length && !meta; k++) { var mp = await openOne(metaB, keys[k], ctx.space, man.epoch, 'meta'); if (mp) { key = keys[k]; try { meta = JSON.parse(dec(mp)); } catch (e) { return no('tampered'); } } }
    if (!meta) return no('tampered');
    if (ctx.metaOnly) return { ok: true, files: [], names: meta.files, manifest: man, label: meta.label, metaOnly: true };   // WO-26: list a drawer by its sealed label without fetching or decrypting a part
    var files = [];
    for (var i = 0; i < man.parts.length; i++) {
      var pd = man.parts[i], part = await pipe.get(d + pd.n + '.bin'); if (!part) return no('part-missing');
      if ((await sha(part)) !== pd.sha256) return no('part-hash');
      var pt = await openOne(part, key, ctx.space, man.epoch, pd.n); if (!pt) return no('tampered');
      var f = meta.files.filter(function (x) { return x.n === pd.n; })[0] || { name: 'part_' + pd.n, type: 'application/octet-stream' };
      files.push({ name: f.name, type: f.type, bytes: pt });
    }
    return { ok: true, files: files, manifest: man, label: meta.label };
  }

  var API = { seal: seal, open: open, list: list, newestKey: newestKey, dir: dir };
  global.TeamDrop = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
