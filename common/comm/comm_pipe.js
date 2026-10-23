// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
/* comm_pipe.js — the whole relay contract: put / get / list. Nothing else.
 * Implementing prompts/TEAMWORK_FRAMEWORK.md §11.2 + §12.4 (CL3) — Witnesses: W-STORE-NODE, W-FOLDER-2CTX.
 *
 * A pipe stores and lists bytes. It assigns no id, no order, checks no auth, merges nothing — every reader
 * verifies (comm_store.ingest). Names are written by their author under its own prefix, so one writer per name.
 *   memPipe()        — in memory (tests, same-process).
 *   httpPipe(base)   — PUT|GET <base>/f/<name>, GET <base>/list?prefix=… — any writable static host / dumb folder server.
 *   folderPipe(dir)  — node fs directory (node only).
 * Every pipe counts its calls (stats) so a witness can log the noise a visit makes.
 */
(function (global) {
  'use strict';

  function _stats() { return { put: 0, get: 0, list: 0, bytesPut: 0, bytesGet: 0 }; }

  function memPipe(id) {
    var m = new Map(), s = _stats(), drop = Object.create(null);
    return {
      id: id || 'mem', stats: s,
      put: async function (name, bytes) { s.put++; s.bytesPut += bytes.length; m.set(name, new Uint8Array(bytes)); return true; },
      get: async function (name) { s.get++; if (drop[name] || !m.has(name)) return null; var b = m.get(name); s.bytesGet += b.length; return new Uint8Array(b); },
      list: async function (prefix) { s.list++; var out = []; m.forEach(function (_, k) { if (k.indexOf(prefix) === 0 && !drop[k]) out.push(k); }); return out.sort(); },
      // test seams — a pipe that withholds / restores an object (its only real power, §11.9)
      _withhold: function (name) { drop[name] = 1; }, _restore: function (name) { delete drop[name]; },
      _names: function () { return Array.from(m.keys()).sort(); }
    };
  }

  function httpPipe(base, id) {
    var s = _stats(); base = String(base).replace(/\/+$/, '');
    return {
      id: id || base, stats: s,
      put: async function (name, bytes) { s.put++; s.bytesPut += bytes.length;
        var r = await fetch(base + '/f/' + name, { method: 'PUT', body: bytes, headers: { 'Content-Type': 'application/octet-stream' } }); return r.ok; },
      get: async function (name) { s.get++; var r = await fetch(base + '/f/' + name, { cache: 'no-store' }); if (!r.ok) return null;
        var b = new Uint8Array(await r.arrayBuffer()); s.bytesGet += b.length; return b; },
      list: async function (prefix) { s.list++; var r = await fetch(base + '/list?prefix=' + encodeURIComponent(prefix), { cache: 'no-store' });
        return r.ok ? (await r.json()).sort() : []; }
    };
  }

  function folderPipe(dir, id) {
    var fs = require('fs'), path = require('path'), s = _stats();
    function fp(name) { var p = path.join(dir, name); if (p.indexOf(path.resolve(dir)) !== 0) throw new Error('folderPipe: name escapes dir'); return p; }
    function walk(d, rel, out) { if (!fs.existsSync(d)) return out; fs.readdirSync(d).forEach(function (n) { var p = path.join(d, n), r = rel ? rel + '/' + n : n;
      if (fs.statSync(p).isDirectory()) walk(p, r, out); else out.push(r); }); return out; }
    return {
      id: id || 'folder', stats: s,
      put: async function (name, bytes) { s.put++; s.bytesPut += bytes.length; var p = fp(name); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, Buffer.from(bytes)); return true; },
      get: async function (name) { s.get++; var p = fp(name); if (!fs.existsSync(p)) return null; var b = new Uint8Array(fs.readFileSync(p)); s.bytesGet += b.length; return b; },
      list: async function (prefix) { s.list++; return walk(path.resolve(dir), '', []).filter(function (n) { return n.indexOf(prefix) === 0; }).sort(); }
    };
  }

  var API = { memPipe: memPipe, httpPipe: httpPipe, folderPipe: folderPipe };
  global.CommPipe = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
