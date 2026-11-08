/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 */
// ⚠ DO NOT REMOVE — common/file_store.js, prompts/BIMDOC_OPEN_FILE_STORE.md §2-§3 (W-FILESTORE). Read the §FILESTORE-* lines after every run.
// ONE shared browser file store for attachment bytes: OPFS `bim_files/<sha256>`, bytes only (name/size/kind stay on the caller's row).
// Shared by hash, so shared across rows and across clients in one browser: a row's delete never deletes bytes; sweep(referenced) removes
// only entries no row references. Same-origin only (OPFS is per origin) — logged once, not a silent failure.
(function (global) {
  'use strict';
  var DIR = 'bim_files', TAG = '§FILESTORE', HEX64 = /^[0-9a-f]{64}$/, _originLogged = false, _persistP = null;
  function s12(h) { return String(h || '').slice(0, 12); }
  function heapMB() { try { return global.performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 'na'; } catch (e) { return 'na'; } }
  function hasOpfs() { return !!(global.navigator && navigator.storage && typeof navigator.storage.getDirectory === 'function'); }
  function noteOrigin() {
    if (_originLogged) return; _originLogged = true;
    console.log(TAG + '-ORIGIN origin=' + (global.location ? location.origin : '?') + ' (same-origin only: another origin sees an empty store)');
  }
  async function dir(create) { noteOrigin(); return (await navigator.storage.getDirectory()).getDirectoryHandle(DIR, create ? { create: true } : undefined); }
  async function sha256Hex(buf) {
    var d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), s = '';
    for (var i = 0; i < d.length; i++) s += (d[i] < 16 ? '0' : '') + d[i].toString(16);
    return s;
  }
  async function entry(sha) { try { return await (await (await dir(false)).getFileHandle(sha)).getFile(); } catch (e) { return null; } }

  // put(blob) → {sha256, size, dedup}. ONE ArrayBuffer copy for the digest (the native SHA-256 cannot hash a stream); the write is
  // streamed from the Blob itself, so a 300 MB IFC is never held twice.
  async function put(blob) {
    if (!hasOpfs()) { console.log(TAG + '-PUT REFUSED reason=no-opfs'); throw new Error('no OPFS in this browser'); }
    var t0 = Date.now(), sha = await sha256Hex(await blob.arrayBuffer()), size = blob.size;
    var have = await entry(sha);
    if (have && have.size === size) {
      console.log(TAG + '-PUT sha=' + s12(sha) + ' size=' + size + ' ms=' + (Date.now() - t0) + ' heapMB=' + heapMB() + ' dedup=1');
      return { sha256: sha, size: size, dedup: true };
    }
    var w = await (await (await dir(true)).getFileHandle(sha, { create: true })).createWritable();
    await w.write(blob); await w.close();
    console.log(TAG + '-PUT sha=' + s12(sha) + ' size=' + size + ' ms=' + (Date.now() - t0) + ' heapMB=' + heapMB() + ' dedup=0');
    return { sha256: sha, size: size, dedup: false };
  }
  // get(sha, name) → File, or throws {refused:reason}. The bytes are re-hashed: the name is a claim, the digest is the check.
  async function get(sha, name) {
    var refuse = function (r) { console.log(TAG + '-GET REFUSED sha=' + s12(sha) + ' reason=' + r); var e = new Error(r); e.refused = r; throw e; };
    if (!HEX64.test(String(sha || ''))) refuse('bad-sha');
    if (!hasOpfs()) refuse('no-opfs');
    var f = await entry(sha); if (!f) refuse('absent');
    var got = await sha256Hex(await f.arrayBuffer());
    if (got !== sha) refuse('mismatch');
    console.log(TAG + '-GET sha=' + s12(sha) + ' size=' + f.size + ' ok');
    return new File([f], name || sha, { type: 'application/octet-stream' });
  }
  async function has(sha) { return !!(await entry(sha)); }
  async function list() {
    if (!hasOpfs()) return [];
    var d; try { d = await dir(false); } catch (e) { return []; }
    var out = []; for await (var k of d.keys()) out.push(k); return out.sort();
  }
  // sweep(referenced: Set of sha256 any row still points at) → removes only the rest.
  async function sweep(referenced) {
    var names = await list(), removed = 0, kept = 0, d = names.length ? await dir(false) : null;
    for (var i = 0; i < names.length; i++) {
      if (referenced && referenced.has(names[i])) { kept++; continue; }
      await d.removeEntry(names[i]); removed++;
    }
    console.log(TAG + '-SWEEP entries=' + names.length + ' kept=' + kept + ' removed=' + removed);
    return { entries: names.length, kept: kept, removed: removed };
  }
  function persist() {
    if (_persistP) return _persistP;
    _persistP = (global.navigator && navigator.storage && navigator.storage.persist ? navigator.storage.persist() : Promise.resolve('unsupported'))
      .then(function (g) { console.log(TAG + '-PERSIST granted=' + g); return g; }, function () { console.log(TAG + '-PERSIST granted=unsupported'); return 'unsupported'; });
    return _persistP;
  }
  // openFromUrl(routes, say): ?open=store:<sha256>&name=<file> → get → routes[ext](file). Absent param = nothing at all.
  async function openFromUrl(routes, say) {
    var q; try { q = new URLSearchParams(global.location.search); } catch (e) { return null; }
    var o = q.get('open'); if (!o) return null;
    var tell = function (t) { try { if (say) say(t); } catch (e) { /* status only */ } };
    var m = /^store:(.*)$/.exec(o), sha = m ? m[1].toLowerCase() : '', name = q.get('name') || '';
    var kind = (/\.([a-z0-9]+)$/i.exec(name) || [])[1]; kind = kind ? kind.toLowerCase() : '';
    var refuse = function (r) { console.log(TAG + '-OPEN REFUSED sha=' + s12(sha) + ' name=' + name + ' kind=' + (kind || '-') + ' reason=' + r); tell('Could not open the attachment: ' + r); return { refused: r }; };
    if (!m) return refuse('not-store');
    if (!name) return refuse('no-name');
    if (!HEX64.test(sha)) return refuse('bad-sha');
    var fn = routes && routes[kind];
    if (typeof fn !== 'function') return refuse('no-route kind=' + (kind || '-') + (routes && routes._noRouteHint && routes._noRouteHint[kind] ? ' (' + routes._noRouteHint[kind] + ')' : ''));
    persist();
    var file; try { file = await get(sha, name); } catch (e) { return refuse(e.refused || e.message); }
    console.log(TAG + '-OPEN sha=' + s12(sha) + ' name=' + name + ' kind=' + kind + ' route=' + kind + ' size=' + file.size);
    await fn(file);
    return { sha256: sha, name: name, kind: kind, size: file.size };
  }
  var api = { DIR: DIR, put: put, get: get, has: has, list: list, sweep: sweep, persist: persist, openFromUrl: openFromUrl, sha256Hex: sha256Hex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.FileStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
