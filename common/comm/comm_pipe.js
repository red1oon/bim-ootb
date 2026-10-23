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
 *   ghPipe(opts)     — a GitHub repo: one branch per device (dev/<kid>), one commit per visit (putMany), no LFS (§12.11).
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

  // ── GitHub repo pipe (TEAMWORK_FRAMEWORK §11.16 / §12.11 — Witness: W-GH-PIPE-2DEV) ─────────────────────────────
  // opts = { owner, repo, token, self (my kid), minGapMs?, fetch?, api? }. Each device writes ONLY its own branch dev/<kid>
  // and only names under its own prefix (s/<space>/o/<kid>/…, s/<space>/h/<kid>, s/<space>/r/<kid>) — the one-writer rule, enforced here. putMany = ONE commit
  // (blobs → tree on the previous tree → commit → forward-only ref update). Reads: one matching-refs call (ETag) +
  // one recursive tree per CHANGED branch (cached by commit sha) + one blob per new object (cached forever).
  function _b64(bytes) { if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
  function _unb64(t) { t = String(t).replace(/\s/g, ''); if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(t, 'base64'));
    var s = atob(t), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  // §13.6: names are s/<space>/<o|h|r>/<kid>[/…] — o = bundles, h = signed head, r = a join request (phone pairing). Anything else → null (refused).
  function _kidOfName(name) { var p = String(name).split('/');
    return (p.length >= 4 && p[0] === 's' && /^[0-9a-f]{64}$/.test(p[1]) && (p[2] === 'o' || p[2] === 'h' || p[2] === 'r') && p[3]) ? p[3] : null; }

  function ghPipe(opts) {
    var f = opts.fetch || fetch, base = (opts.api || 'https://api.github.com') + '/repos/' + opts.owner + '/' + opts.repo;
    var s = _stats(); s.reqs = 0; s.writes = 0; s.notModified = 0; s.commits = 0; s.rateRemaining = null;
    var etags = {}, cacheBody = {}, trees = {}, blobs = {}, where = {}, lastPut = 0, branchOf = function (kid) { return 'dev/' + kid; };
    async function api(method, path, body) {
      var h = { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + opts.token, 'X-GitHub-Api-Version': '2022-11-28' };
      if (method === 'GET' && etags[path]) h['If-None-Match'] = etags[path];
      if (body) h['Content-Type'] = 'application/json';
      // cache:'no-store' — a browser's HTTP cache otherwise serves a stale branch pointer (GitHub sends max-age=60), and
      // every commit after the first looks like it goes backwards (W-PHONE-PAGE found it). Our own ETag keeps unchanged reads free.
      var r = await f(base + path, { method: method, headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
      s.reqs++; if (method !== 'GET') s.writes++;
      var rem = r.headers.get('x-ratelimit-remaining'); if (rem != null) s.rateRemaining = Number(rem);
      if (r.status === 304) { s.notModified++; return { status: 304, json: cacheBody[path] }; }
      var j = null; try { j = await r.json(); } catch (e) {}
      if (method === 'GET' && r.ok && r.headers.get('etag')) { etags[path] = r.headers.get('etag'); cacheBody[path] = j; }
      return { status: r.status, json: j };
    }
    async function refs() {
      var r = await api('GET', '/git/matching-refs/heads/dev/');
      return (r.status === 200 || r.status === 304) && Array.isArray(r.json) ? r.json.map(function (x) { return { branch: x.ref.replace('refs/heads/', ''), sha: x.object.sha }; }) : [];
    }
    async function treeOf(commitSha) {
      if (trees[commitSha]) return trees[commitSha];
      var r = await api('GET', '/git/trees/' + commitSha + '?recursive=1'), m = {};
      ((r.json && r.json.tree) || []).forEach(function (e) { if (e.type === 'blob') m[e.path] = { sha: e.sha, size: e.size }; });
      return (trees[commitSha] = m);
    }
    async function list(prefix) {
      s.list++; var out = [];
      for (var b of await refs()) { var t = await treeOf(b.sha);
        Object.keys(t).forEach(function (n) { where[n] = t[n]; if (n.indexOf(prefix) === 0) out.push(n); }); }
      return out.sort();
    }
    async function get(name) {
      s.get++; if (!where[name]) await list(name);
      var w = where[name]; if (!w) return null;
      if (!blobs[w.sha]) { var r = await api('GET', '/git/blobs/' + w.sha); if (r.status !== 200 || !r.json) return null; blobs[w.sha] = _unb64(r.json.content); }
      s.bytesGet += blobs[w.sha].length; return new Uint8Array(blobs[w.sha]);
    }
    async function putMany(entries) {
      entries.forEach(function (e) { if (_kidOfName(e.name) !== opts.self) throw new Error('ghPipe: ' + e.name + ' is not under my prefix (' + opts.self + ')'); });
      var wait = (opts.minGapMs || 0) - (Date.now() - lastPut); if (wait > 0) await new Promise(function (r) { setTimeout(r, wait); });
      for (var attempt = 0; attempt < 2; attempt++) {
        var ref = await api('GET', '/git/ref/heads/' + branchOf(opts.self)), parent = ref.status === 200 || ref.status === 304 ? ref.json.object.sha : null, baseTree = null;
        if (parent) { var pc = await api('GET', '/git/commits/' + parent); baseTree = pc.json && pc.json.tree ? pc.json.tree.sha : null; }
        var tree = [];
        for (var e of entries) { var b = await api('POST', '/git/blobs', { content: _b64(e.bytes), encoding: 'base64' }); if (b.status !== 201) throw new Error('ghPipe blob ' + b.status);
          tree.push({ path: e.name, mode: '100644', type: 'blob', sha: b.json.sha }); s.put++; s.bytesPut += e.bytes.length; }
        var tr = await api('POST', '/git/trees', baseTree ? { base_tree: baseTree, tree: tree } : { tree: tree }); if (tr.status !== 201) throw new Error('ghPipe tree ' + tr.status);
        var cm = await api('POST', '/git/commits', { message: 'visit ' + opts.self + ' ' + entries.map(function (x) { return x.name; }).join(' '), tree: tr.json.sha, parents: parent ? [parent] : [] });
        if (cm.status !== 201) throw new Error('ghPipe commit ' + cm.status);
        var up = parent ? await api('PATCH', '/git/refs/heads/' + branchOf(opts.self), { sha: cm.json.sha, force: false })
                        : await api('POST', '/git/refs', { ref: 'refs/heads/' + branchOf(opts.self), sha: cm.json.sha });
        if (up.status === 200 || up.status === 201) { s.commits++; lastPut = Date.now(); delete etags['/git/ref/heads/' + branchOf(opts.self)];
          entries.forEach(function (x, i) { where[x.name] = { sha: tree[i].sha, size: x.bytes.length }; });   // NOT cached locally: a read-back must come from GitHub
          return true; }
        delete etags['/git/ref/heads/' + branchOf(opts.self)];       // someone moved my branch (my other tab): re-read, retry once
      }
      throw new Error('ghPipe: ref update refused twice');
    }
    return { id: 'gh:' + opts.owner + '/' + opts.repo, stats: s, list: list, get: get, putMany: putMany,
             put: function (name, bytes) { return putMany([{ name: name, bytes: bytes }]); },
             _api: api, _refs: refs, branchOf: branchOf };
  }

  var API = { memPipe: memPipe, httpPipe: httpPipe, folderPipe: folderPipe, ghPipe: ghPipe };
  global.CommPipe = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
