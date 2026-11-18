// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — the PAGE'S side of the ONE LEDGER FILE (bim-compiler prompts/CLI_ERP_IVR.md §54, §53 option A; witness W-LEDGER-FILE). Read the §LEDGERFILE lines after every run.
// WHAT IT IS: reads and appends the JSONL of kernel_ops rows the door also writes (common/door/ledger_sign.js, §52), through a File System Access DIRECTORY handle (or a fake with the same shape:
//   getFileHandle(name,{create}) · handle.getFile() · handle.createWritable({keepExistingData}) · dir.removeEntry(name)). Browser and Node; no `window`, no KernelOps.
// WHY THE LOCK: createWritable() writes a swap copy and close() replaces the WHOLE file, so a door line appended while the page's writable is open is LOST. The page cannot create a file
//   exclusively (no O_EXCL), so it uses the door's own lock file `<name>.lock`: it waits while one exists (a door's holds `pid:<n>`), creates its own token, reads it back, and holds it only if it
//   reads back as its own. A door and a page creating it within the same millisecond can both believe they hold it: LIMIT STATED, the post-write check below catches damage to the page's own rows only.
//   readRows(dir, name)                    the rows (a missing file is [])
//   appendRows(dir, name, rows, {tip})     lock · compare the last row's op_hash with `tip` · write · re-read and verify (old text byte-identical, new lines present in order) · release
//                                          -> {ok:true, tip} | {ok:false, why:'tip moved'|'lost'|'lock'}; a refusal leaves the file as found
// Breaks (witness falsifiers): LEDGER_FILE_BREAK=nolock | nocompare
(function (root) {
  'use strict';
  var GENESIS = '0000000000000000000000000000000000000000000000000000000000000000';
  var STALE_MS = 10000;
  function _brk() { try { return (typeof process !== 'undefined' && process.env && process.env.LEDGER_FILE_BREAK) || ''; } catch (e) { return ''; } }
  function _say(s) { try { console.log('§LEDGERFILE ' + s); } catch (e) { /* no console */ } }
  function _sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function _missing(e) { return !!e && (e.name === 'NotFoundError' || e.code === 'ENOENT' || /not\s*found/i.test(String(e.message || ''))); }
  function _readText(dir, name) {
    return dir.getFileHandle(name).then(function (h) { return h.getFile(); }).then(function (f) { return f.text(); }).catch(function (e) { if (_missing(e)) return ''; throw e; });
  }
  function _rows(text) { return text.split('\n').filter(Boolean).map(function (l) { return JSON.parse(l); }); }
  function readRows(dir, name) { return _readText(dir, name).then(_rows); }
  function _tipOf(rows) { return rows.length ? rows[rows.length - 1].op_hash : GENESIS; }

  function _token() { return 'page:' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  async function lockAcquire(dir, name, opts) {
    if (_brk() === 'nolock') return { release: function () { return Promise.resolve(); }, waited: 0 };
    var ln = name + '.lock', t0 = Date.now(), waited = 0, limit = (opts && opts.waitMs) || 15000;
    for (;;) {
      var held = null;
      try { var fh0 = await dir.getFileHandle(ln); held = await fh0.getFile(); } catch (e) { if (!_missing(e)) throw e; }
      if (held) {
        if (Date.now() - held.lastModified > STALE_MS) { try { await dir.removeEntry(ln); } catch (e) { /* gone */ } continue; }
      } else {
        var fh = await dir.getFileHandle(ln, { create: true }), f = await fh.getFile();
        if (!(await f.text())) {   // nothing in it: not a door's (it writes pid:<n> at once); claim it with our token
          var tok = _token(), w = await fh.createWritable({ keepExistingData: false }); await w.write(tok); await w.close();
          if ((await (await fh.getFile()).text()) === tok) { if (waited) _say('lock waited=' + waited + ' ms=' + (Date.now() - t0)); return { token: tok, waited: waited, release: function () { return _release(dir, ln, tok); } }; }
        }
      }
      waited++;
      if (Date.now() - t0 > limit) throw new Error('ledger lock held for ' + limit + ' ms: ' + ln);
      await _sleep(15);
    }
  }
  async function _release(dir, ln, tok) {
    try { var txt = await (await (await dir.getFileHandle(ln)).getFile()).text(); if (txt === tok) await dir.removeEntry(ln); } catch (e) { /* gone */ }
  }

  async function appendRows(dir, name, rows, opts) {
    if (!rows || !rows.length) return { ok: true, tip: opts && opts.tip };
    var tip = (opts && opts.tip) || GENESIS, lock;
    if (opts && opts.locked) lock = { release: function () { return Promise.resolve(); } };   // the caller (crud_overlay _withFreshSide) already holds the lock across hydrate -> seal -> append
    else try { lock = await lockAcquire(dir, name, opts); } catch (e) { _say('append refused lock: ' + e.message); return { ok: false, why: 'lock' }; }
    try {
      var text = await _readText(dir, name), have = _rows(text), last = _tipOf(have);
      if (_brk() !== 'nocompare' && last !== tip) { _say('append refused tip moved rows=' + have.length + ' last=' + String(last).slice(0, 12) + ' known=' + String(tip).slice(0, 12)); return { ok: false, why: 'tip moved', tip: last, rows: have.length }; }
      var added = rows.map(function (r) { return JSON.stringify(r) + '\n'; }).join(''), lead = (text && text.charAt(text.length - 1) !== '\n') ? '\n' : '';
      var fh = await dir.getFileHandle(name, { create: true }), w = await fh.createWritable({ keepExistingData: true });
      await w.seek(text.length); await w.write(lead + added); await w.close();
      var after = await _readText(dir, name);
      if (after !== text + lead + added) {
        var got = _rows(after), mine = {}; rows.forEach(function (r) { mine[r.op_uuid] = 1; }); var gotMine = got.filter(function (r) { return mine[r.op_uuid]; }).length;
        _say('append LOST before=' + have.length + ' after=' + got.length + ' mine_present=' + gotMine + '/' + rows.length);
        return { ok: false, why: 'lost', before: have.length, after: got.length };
      }
      var newTip = rows[rows.length - 1].op_hash; _say('append ok rows=' + rows.length + ' id=' + rows[0].id + '..' + rows[rows.length - 1].id + ' tip=' + String(newTip).slice(0, 12));
      return { ok: true, tip: newTip };
    } finally { await lock.release(); }
  }

  var API = { readRows: readRows, appendRows: appendRows, lockAcquire: lockAcquire, GENESIS: GENESIS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.LedgerFile = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
