// The carry file `.oplogpic`: gzip of JSON {format:'oplogpic', v:1, W, saved, app, ops, blobs?, check:{n, head, picture}}; opened and VERIFIED by refolding.
// Spec: prompts/OPLOGPIC_CARRY_FILE.md C.1; witness_log/HYPOTHESES.md "Level 1m" (CF1-CF5). Container logic only: the caller supplies the fold (env.fold) and the blob unpacker, so the page and Node share this code.
(function (root) {
  const node = typeof require !== 'undefined', zlib = node ? require('zlib') : null;
  const MSG = {
    verified: 'Verified: this is the identical picture', log: 'The file is damaged: the log hash differs', picture: 'The log is intact but renders differently on this device (the picture hash differs)',
    cut: 'The file is damaged or cut short', newer: 'This file was made by a newer version of OplogPic', notours: 'Not an OplogPic file', old: 'Opened (old format: not verified)',
    size: (w, n) => 'This file is for a ' + w + ' x ' + w + ' canvas; this page is ' + n + ' x ' + n, dropped: 'Not an OplogPic file or a picture' };
  class CarryError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const WARN_BYTES = 15 * 1048576, HEX64 = /^[0-9a-f]{64}$/;
  // every op name an editor log may contain. The engine's apply() IGNORES an unknown op silently, so a file with an op this build does not know would open with that edit missing: it is refused as "newer" instead. editor_carry CF4 keeps this list equal to the op names found in the source.
  const KNOWN_OPS = new Set(['adjset', 'adjust', 'amend', 'blur', 'clip', 'dab', 'del', 'fill', 'fx', 'grad', 'group', 'hdab', 'img', 'imgset', 'layer', 'mask', 'mdab', 'mv', 'name', 'parent', 'sel', 'set', 'shape', 'smudge', 'stroke', 'ungroup', 'vis', 'xform']);
  async function gz(u8) { if (node) return new Uint8Array(zlib.gzipSync(Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength), { level: 9 })); const cs = new CompressionStream('gzip'), w = cs.writable.getWriter(); w.write(u8).catch(() => {}); w.close().catch(() => {}); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
  async function gunz(u8) {
    try { if (node) return new Uint8Array(zlib.gunzipSync(Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength))); const ds = new DecompressionStream('gzip'), w = ds.writable.getWriter(); w.write(u8).catch(() => {}); w.close().catch(() => {}); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); }
    catch (e) { throw new CarryError('damaged', MSG.cut); }
  }
  const isGzip = (u8) => u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b;
  const text = (u8) => (node ? Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('utf8') : new TextDecoder().decode(u8)), bytesOf = (s) => (node ? new Uint8Array(Buffer.from(s, 'utf8')) : new TextEncoder().encode(s));
  const pad = (n) => String(n).padStart(2, '0'), fileName = (d = new Date()) => 'oplogpic-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.oplogpic';
  // info: { W, ops, blobs (object sha -> base64) | undefined, app, check: { n, head, picture } } -> gzip bytes
  async function encode(info) {
    const c = info.check; if (!c || c.n !== info.ops.length || !HEX64.test(c.head) || !HEX64.test(c.picture)) throw new Error('carry: check must be {n, head, picture} for these ops');
    const o = { format: 'oplogpic', v: 1, W: info.W, saved: (info.saved || new Date()).toISOString(), app: info.app || 'dev', ops: info.ops, ...(info.blobs && Object.keys(info.blobs).length ? { blobs: info.blobs } : {}), check: { n: c.n, head: c.head, picture: c.picture } };
    return gz(bytesOf(JSON.stringify(o)));
  }
  // -> { kind: 'new' | 'old', obj } or throws CarryError (code: damaged | newer | notours)
  async function decode(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); let obj;
    if (isGzip(u8)) { const raw = await gunz(u8); try { obj = JSON.parse(text(raw)); } catch (e) { throw new CarryError('damaged', MSG.cut); }
      if (!obj || obj.format !== 'oplogpic') throw new CarryError('notours', MSG.notours); if (obj.v !== 1) throw new CarryError(Number.isInteger(obj.v) && obj.v > 1 ? 'newer' : 'notours', Number.isInteger(obj.v) && obj.v > 1 ? MSG.newer : MSG.notours);
      const c = obj.check; if (!Number.isInteger(obj.W) || !Array.isArray(obj.ops) || !obj.ops.length || !c || !Number.isInteger(c.n) || !HEX64.test(c.head || '') || !HEX64.test(c.picture || '') || (obj.blobs !== undefined && (typeof obj.blobs !== 'object' || obj.blobs === null))) throw new CarryError('damaged', MSG.cut);
      return { kind: 'new', obj }; }
    let s; try { s = text(u8).replace(/^﻿/, '').trim(); if (s[0] !== '{') throw 0; obj = JSON.parse(s); } catch (e) { throw new CarryError('notours', MSG.notours); }
    if (!obj || obj.format !== 'psd-oplog-editor') throw new CarryError('notours', MSG.notours); if (obj.v !== 1) throw new CarryError(Number.isInteger(obj.v) && obj.v > 1 ? 'newer' : 'notours', Number.isInteger(obj.v) && obj.v > 1 ? MSG.newer : MSG.notours);
    if (!Number.isInteger(obj.W) || !Array.isArray(obj.ops)) throw new CarryError('notours', MSG.notours); return { kind: 'old', obj };
  }
  function compare(check, actual) {
    if (check.n !== actual.n || check.head !== actual.head) return { verdict: 'log', message: MSG.log };
    if (check.picture !== actual.picture) return { verdict: 'picture', message: MSG.picture };
    return { verdict: 'verified', message: MSG.verified };
  }
  // env: { W (the page's canvas, or null), unpackBlobs(obj) -> Map (throws on a bad blob), fold(ops, W, blobsMap) -> { n, head, picture } (throws on an unknown op) }. Nothing is changed in the caller's document here.
  async function open(bytes, env) {
    const { kind, obj } = await decode(bytes);
    if (env.W != null && obj.W !== env.W) throw new CarryError('size', MSG.size(obj.W, env.W));
    if (obj.ops.some((o) => !o || typeof o.op !== 'string' || !KNOWN_OPS.has(o.op))) throw new CarryError('newer', MSG.newer);
    let blobs; try { blobs = env.unpackBlobs(obj.blobs); } catch (e) { throw new CarryError('damaged', MSG.cut); }
    let actual; try { actual = await env.fold(obj.ops, obj.W, blobs); } catch (e) { const m = String(e && e.message); throw new CarryError(/unknown|unsupported|not supported|cannot be amended/i.test(m) ? 'newer' : 'damaged', /unknown|unsupported|not supported|cannot be amended/i.test(m) ? MSG.newer : MSG.cut); }
    if (kind === 'old') return { kind, W: obj.W, ops: obj.ops, blobs, verdict: 'old', message: MSG.old };
    const c = compare(obj.check, actual); return { kind, W: obj.W, ops: obj.ops, blobs, verdict: c.verdict, message: c.message, check: obj.check, actual, saved: obj.saved, app: obj.app };
  }
  const api = { MSG, CarryError, KNOWN_OPS, WARN_BYTES, encode, decode, open, compare, fileName, isGzip };
  if (node) module.exports = api; else root.CarryFile = api;
})(this);
