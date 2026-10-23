// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* comm_envelope.js — the v3 op envelope of the local comm layer.
 * Implementing prompts/TEAMWORK_FRAMEWORK.md §11.3 + §12.1 (CL1) — Witness: W-UU-NO-COLLIDE.
 *
 * An envelope is self-identifying (hash of its canonical form), self-ordering (author seq + prev + deps,
 * ordered by comm_order.js) and self-authorising (ECDSA P-256 signature, same curve as erp/erp_signer.js).
 * It references records by <table>_uu ONLY (D2, user 2026-10-23) — never a device-local integer id, because
 * crud_core.listTip's synthetic pk is -opId (a LOCAL row id) and rebase() re-numbers every row.
 *
 * PURE: no DOM, no storage. Crypto is injected (WebCrypto subtle) so node and browser run the same bytes.
 */
(function (global) {
  'use strict';

  var HEX64 = /^[0-9a-f]{64}$/;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function _subtle() {
    var c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || !c.subtle) throw new Error('comm_envelope: WebCrypto subtle unavailable');
    return c.subtle;
  }

  // canonical — JSON with keys sorted at every level. Refuses values JSON would silently change or drop.
  function canonical(v) {
    if (v === null) return 'null';
    var t = typeof v;
    if (t === 'number') { if (!isFinite(v)) throw new Error('canonical: non-finite number'); return JSON.stringify(v); }
    if (t === 'string' || t === 'boolean') return JSON.stringify(v);
    if (t === 'undefined' || t === 'function' || t === 'symbol' || t === 'bigint') throw new Error('canonical: unsupported ' + t);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    var keys = Object.keys(v).filter(function (k) { return v[k] !== undefined; }).sort();
    return '{' + keys.map(function (k) { return JSON.stringify(k) + ':' + canonical(v[k]); }).join(',') + '}';
  }

  function _strip(env) { var o = {}; for (var k in env) if (Object.prototype.hasOwnProperty.call(env, k) && k !== 'sig') o[k] = env[k]; return o; }
  function _bytes(s) { return new TextEncoder().encode(s); }
  function _hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join(''); }
  function _unhex(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }

  async function hashHex(env) { return _hex(await _subtle().digest('SHA-256', _bytes(canonical(_strip(env))))); }

  // V8 — walk params; any negative integer is a device-local synthetic pk (crud_core.listTip: synth = -opId).
  function _localRefs(v, path, out) {
    if (typeof v === 'number' && Number.isInteger(v) && v < 0) out.push(path);
    else if (v && typeof v === 'object') for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) _localRefs(v[k], path + '.' + k, out);
    return out;
  }

  function validate(env) {
    var e = [];
    if (!env || typeof env !== 'object') return { ok: false, errors: ['not-an-object'] };
    if (env.v !== 3) e.push('V1 v!=3');
    if (!HEX64.test(String(env.space || ''))) e.push('V2 space');
    if (typeof env.author !== 'string' || !env.author) e.push('V3 author');
    if (!Number.isInteger(env.seq) || env.seq < 1) e.push('V4 seq');
    if (env.seq === 1 ? env.prev !== null : !HEX64.test(String(env.prev || ''))) e.push('V5 prev');
    var d = env.deps;
    if (!Array.isArray(d) || d.some(function (h, i) { return !HEX64.test(String(h)) || (i > 0 && d[i - 1] >= h); })) e.push('V6 deps');
    var t = env.target || {};
    if (typeof t.table !== 'string' || t.table !== t.table.toLowerCase() || !t.table) e.push('V7 target.table');
    if (!UUID.test(String(t.uu || ''))) e.push('V7 target.uu');
    var p = (env.body && env.body.params) || {};
    if (!env.body || typeof env.body.op_type !== 'string') e.push('V8 body.op_type');
    if (Object.prototype.hasOwnProperty.call(p, 'id')) e.push('V8 local-pk-ref params.id');
    _localRefs(p, 'params', []).forEach(function (path) { if (path !== 'params.id') e.push('V8 local-pk-ref ' + path); });
    return { ok: e.length === 0, errors: e };
  }

  // signer = { kid, privateKey (CryptoKey) }. Signature = hex of ECDSA P-256/SHA-256 over canonical(env).
  async function sign(env, signer) {
    var body = _strip(env); body.author = body.author || signer.kid;
    var sig = await _subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, signer.privateKey, _bytes(canonical(body)));
    body.sig = _hex(sig); return body;
  }

  async function verify(env, pubJwk) {
    if (!env || typeof env.sig !== 'string') return false;
    try {
      var key = await _subtle().importKey('jwk', pubJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return await _subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, key, _unhex(env.sig), _bytes(canonical(_strip(env))));
    } catch (e) { return false; }
  }

  // toKernelParams — v3 → the params today's kernel + crud_core.listTip fold. The target is addressed by its
  // <table>_uu through listTip's existing idCol path (crud_core.js:485-486), so no fold change is needed.
  function toKernelParams(env) {
    var p = {}, src = env.body.params || {};
    for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) p[k] = src[k];
    p.table = env.target.table;
    if (env.body.op_type !== 'CRUD_CREATE') { p.idCol = env.target.table + '_uu'; p.id = env.target.uu; }
    return p;
  }

  // wrapKernelOp — D2's one-time import of an existing kernel row into a v3 body + target.
  //   row = { op_type, op_uuid, parameters (object) } ; uuOf(table, localId) → the local row's _uu or null.
  // A CREATE's record UU IS its op_uuid (crud_core.js:475-477 stamps it). Anything unresolvable is refused.
  function wrapKernelOp(row, uuOf) {
    var p = row.parameters || {}, table = String(p.table || '').toLowerCase(), uu, params = {};
    for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k) && k !== 'table' && k !== 'id' && k !== 'idCol') params[k] = p[k];
    if (!table) return { ok: false, reason: 'no-table' };
    if (row.op_type === 'CRUD_CREATE') uu = row.op_uuid;
    else if (p.idCol && String(p.idCol).toLowerCase() === table + '_uu') uu = p.id;
    else uu = uuOf ? uuOf(table, p.id) : null;
    if (!UUID.test(String(uu || ''))) return { ok: false, reason: 'uu-unresolved table=' + table + ' id=' + p.id };
    var refs = _localRefs(params, 'params', []);
    if (refs.length) return { ok: false, reason: 'local-pk-ref ' + refs.join(',') };
    return { ok: true, target: { table: table, uu: String(uu).toLowerCase() }, body: { op_type: row.op_type, params: params } };
  }

  var API = { canonical: canonical, hashHex: hashHex, validate: validate, sign: sign, verify: verify,
              toKernelParams: toKernelParams, wrapKernelOp: wrapKernelOp };
  global.CommEnvelope = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
