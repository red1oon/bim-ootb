// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// door_handover.js - the HAND-OVER of a sheet's ledger to the ERP page. Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §10 (slice S3c) -
//   Witness: W-DOOR-ERP (erp/tests/witness_door_erp.js).
// offer(K, name, lines): the page that filed keeps the workbook's VERIFIED ledger in same-origin storage (one record per workbook chain, keyed by its first entry's hash).
// take(db, env): the ERP page applies every kept ledger entry it has not applied yet, ONCE, through the kernel's one replay (ws_kernel replayInto: verify, digest,
//   guard, one SQL transaction per ledger). The applied entry hashes are rows of door_ledger_applied in the SAME database and the same transaction, so "applied" travels
//   with the books. A ledger that does not verify, or whose records would collide with or overwrite what these books hold, is REFUSED whole and said so in plain words.
// No document logic and no table of the books is named here: the ledger's ops say what they touch. Nothing leaves the device.
(function (global) {
  'use strict';
  var KEY = 'door_handover_v1', APPLIED = 'door_ledger_applied';
  var BASE = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src || '').replace(/[^/]*$/, '');   // erp/, wherever the page sits
  function store() { try { return global.localStorage || null; } catch (e) { return null; } }
  function read(st) {
    var raw = null; try { raw = st && st.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) return { books: {} };
    try { var o = JSON.parse(raw); if (o && o.books && typeof o.books === 'object') return o; } catch (e) { /* below */ }
    return { books: {}, broken: true };
  }
  function pending(st) { var a = read(st || store()); return !!a.broken || Object.keys(a.books).length > 0; }
  function hashOf(line) { try { return String(JSON.parse(line).hash || ''); } catch (e) { return ''; } }

  function offer(K, name, lines, st) {
    st = st || store();
    if (!st) return { ok: false, why: 'this browser gives the page no storage to hand the ledger over' };
    if (!lines || !lines.length) return { ok: false, why: 'the workbook holds no ledger line' };
    var v = K.verifyJournal(lines.join('\n'));
    if (!v.ok) return { ok: false, why: 'the workbook\'s ledger does not verify (line ' + v.brokenAt + ')' };
    var all = read(st); if (all.broken) all = { books: {} };
    all.books[hashOf(lines[0])] = { name: String(name || ''), at: new Date().toISOString(), lines: lines.slice() };
    try { st.setItem(KEY, JSON.stringify(all)); } catch (e) { return { ok: false, why: 'the browser\'s storage for this site is full' }; }
    return { ok: true, entries: lines.length, books: Object.keys(all.books).length };
  }

  function seenIn(db) {
    var seen = {}, st = null;
    try { st = db.prepare('SELECT hash FROM ' + APPLIED); while (st.step()) seen[st.get()[0]] = 1; } catch (e) { /* no entry applied yet: the table is made with the first one */ } finally { if (st) st.free(); }
    return seen;
  }
  // take(db, env): env = { K: WsKernel, persist: function | null, storage?, say? }. Returns { applied, skipped, refused, ops, why: [{book, why}], ms }.
  function take(db, env) {
    var st = env.storage || store(), K = env.K, perf = global.performance || { now: function () { return Date.now(); } }, t0 = perf.now();
    var all = read(st), out = { applied: 0, skipped: 0, refused: 0, ops: 0, books: 0, why: [], took: [], applyMs: 0, persistMs: 0 };
    if (all.broken) { out.refused++; out.why.push({ book: '(kept hand-over)', why: 'it cannot be read' }); }
    Object.keys(all.books).forEach(function (k) {
      var b = all.books[k] || {}, name = String(b.name || k.slice(0, 12)), seen = seenIn(db), n = 0;
      out.books++;
      try {
        if (!Array.isArray(b.lines) || !b.lines.length) throw new Error('it holds no ledger line');
        var r = K.replayInto(db, b.lines.join('\n'), { atomic: true, guard: true, skip: function (e) { return !!seen[e.hash]; },
          onApplied: function (e) {
            db.run('CREATE TABLE IF NOT EXISTS ' + APPLIED + ' (hash TEXT PRIMARY KEY, book TEXT, seq INTEGER, ops INTEGER, applied TEXT)');
            db.run('INSERT INTO ' + APPLIED + ' (hash, book, seq, ops, applied) VALUES (?,?,?,?,?)', [e.hash, name, e.seq, e.payload.ops.length, new Date().toISOString()]); n++;
          } });
        out.applied += r.replayed; out.skipped += r.skipped; out.ops += r.ops;
        if (r.replayed) out.took.push({ book: name, entries: r.replayed });
      } catch (x) { out.refused++; out.why.push({ book: name, why: String(x && x.message || x) }); }
    });
    out.applyMs = Math.round(perf.now() - t0);
    if (out.applied && env.persist) { var t1 = perf.now(); try { env.persist(); out.persisted = true; } catch (e) { out.persisted = false; out.why.push({ book: '(these books)', why: 'applied, but could not be kept for the next visit: ' + (e && e.message) }); } out.persistMs = Math.round(perf.now() - t1); }
    out.ms = Math.round(perf.now() - t0);
    if (out.books || out.refused) {
      console.log('§DOOR-HANDOVER applied=' + out.applied + ' skipped=' + out.skipped + ' refused=' + out.refused + ' books=' + out.books + ' ops=' + out.ops + ' persisted=' + (out.persisted === true ? 'Y' : out.applied ? 'N' : '-'));
      out.why.forEach(function (w) { console.log('§DOOR-HANDOVER-REFUSED book="' + w.book + '" why="' + w.why + '"'); });
    }
    return out;
  }
  // words(out): what the user is told, or null when there is nothing to tell (a hand-over already in the books is silent)
  function words(out) {
    var s = [];
    out.took.forEach(function (t) { s.push(t.entries + (t.entries === 1 ? ' document' : ' documents') + ' filed from your sheet ' + t.book + (t.entries === 1 ? ' is' : ' are') + ' now in these books.'); });
    out.why.forEach(function (w) { s.push('Not taken into these books: ' + w.book + ' (' + w.why + '). Nothing was changed.'); });
    return s.length ? s.join(' ') : null;
  }
  function tell(text) {
    if (!text || typeof document === 'undefined') return null;
    var d = document.createElement('div'), x = document.createElement('button');
    d.id = 'door-handover-note'; d.setAttribute('role', 'status'); d.textContent = text;
    d.style.cssText = 'position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:200;max-width:min(680px,92vw);padding:9px 34px 9px 14px;border-radius:6px;background:#1d2733;color:#fff;font:13px/1.45 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.3)';
    x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Close'); x.style.cssText = 'position:absolute;right:6px;top:4px;border:0;background:transparent;color:#fff;font-size:18px;cursor:pointer';
    x.addEventListener('click', function () { d.remove(); }); d.appendChild(x); document.body.appendChild(d);
    return d;
  }
  // boot(db, env): the ERP page's whole hook. env = { load(url) -> Promise, persist }. Loads the verifier (ws_kernel.js + its browser shell, no kernel is built), takes, tells.
  function boot(db, env) {
    var t0 = global.performance.now(), need = ['ws_kernel_web.js?v=cc8a919f', 'ws_kernel.js?v=dd8ff337'].filter(function (f) { return !global[f.indexOf('_web') > 0 ? 'WsKernelWeb' : 'WsKernel']; });
    return need.reduce(function (p, f) { return p.then(function () { return env.load(BASE + f); }); }, Promise.resolve()).then(function () {
      if (!global.WsKernel || !global.WsKernelWeb) throw new Error('the ledger verifier could not be loaded');
      global.WsKernelWeb.shellOnly();
      var scriptsMs = Math.round(global.performance.now() - t0), mv = global.AdModelVal, h0 = mv ? mv.registeredCount() : null;
      var out = take(db, { K: global.WsKernel, persist: env.persist });
      console.log('§DOOR-HANDOVER-COST ms=' + (scriptsMs + out.ms) + ' scriptsMs=' + scriptsMs + ' applyMs=' + out.applyMs + ' persistMs=' + out.persistMs + ' entries=' + out.applied + ' ops=' + out.ops + ' saveHooks=' + h0 + '->' + (mv ? mv.registeredCount() : null));
      out.note = tell(words(out)); global.__doorHandover = out;
      return out;
    });
  }

  var api = { KEY: KEY, APPLIED: APPLIED, pending: pending, offer: offer, take: take, words: words, boot: boot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.DoorHandover = api;
})(typeof window !== 'undefined' ? window : this);
