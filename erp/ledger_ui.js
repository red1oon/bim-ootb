// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — the "Ledger" pill (bim-compiler prompts/CLI_ERP_IVR.md §56; witness W-LEDGER-UI). Read the §LEDGERUI lines after every run.
// WHAT IT IS: a small pill that attaches a FOLDER as the page's op-log (crud_overlay.attachLedger, §55), so the door (`red1>`) and this page write ONE signed ledger file. Click "off": the browser's folder
//   picker; the handle is kept in IndexedDB (bim_erp_ledger) so the next load re-attaches by itself when the browser still grants the folder (queryPermission), or offers "click to re-grant".
//   The file is `ad_seed.db.ops.jsonl` (the door's own default name for the ERP seed): choose the folder the door writes to and it is the same file. ?ledger=<name> overrides.
//   Only in a browser with showDirectoryPicker (Chrome / Edge, desktop). A click on an attached pill detaches and forgets the handle; the file stays.
// Breaks (witness falsifiers): window.__LEDGER_UI_BREAK = 'noperm' (attach without checking permission) | 'nostore' (do not keep the handle)
(function (global) {
  'use strict';
  if (typeof global.showDirectoryPicker !== 'function') { try { console.log('§LEDGERUI no showDirectoryPicker (this browser keeps the IndexedDB log)'); } catch (e) {} return; }
  var NAME = (function () { try { return new URLSearchParams(location.search).get('ledger') || 'ad_seed.db.ops.jsonl'; } catch (e) { return 'ad_seed.db.ops.jsonl'; } })();
  var DB = 'bim_erp_ledger', ST = 'h', KEY = 'handle', state = 'off', pill = null, handle = null;
  function brk() { return global.__LEDGER_UI_BREAK || ''; }
  function say(s) { try { console.log('§LEDGERUI ' + s); } catch (e) {} }
  function idb() { return new Promise(function (res, rej) { var q = indexedDB.open(DB, 1); q.onupgradeneeded = function () { q.result.createObjectStore(ST); }; q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; }); }
  function keep(h) { if (brk() === 'nostore') return Promise.resolve(); return idb().then(function (d) { return new Promise(function (res) { var t = d.transaction(ST, 'readwrite'); t.objectStore(ST).put(h, KEY); t.oncomplete = function () { res(); }; t.onerror = function () { res(); }; }); }).catch(function () {}); }
  function forget() { return idb().then(function (d) { return new Promise(function (res) { var t = d.transaction(ST, 'readwrite'); t.objectStore(ST).delete(KEY); t.oncomplete = function () { res(); }; t.onerror = function () { res(); }; }); }).catch(function () {}); }
  function stored() { return idb().then(function (d) { return new Promise(function (res) { var g = d.transaction(ST, 'readonly').objectStore(ST).get(KEY); g.onsuccess = function () { res(g.result || null); }; g.onerror = function () { res(null); }; }); }).catch(function () { return null; }); }
  function text() {
    if (state === 'on') { var i = global.__crud && global.__crud.ledgerInfo ? global.__crud.ledgerInfo() : {}; return 'Ledger: ' + (handle && handle.name) + ' · ' + (i.rows == null ? '?' : i.rows) + ' rows'; }
    if (state === 'regrant') return 'Ledger: click to re-grant';
    return 'Ledger: off';
  }
  function paint() { if (pill) { pill.textContent = text(); pill.setAttribute('data-state', state); pill.title = state === 'on' ? 'Click to detach (the file stays)' : state === 'regrant' ? 'The browser needs your OK to use ' + (handle && handle.name) + ' again' : 'Choose the folder the door (red1>) writes to, so both share one ledger file'; } }
  function mount() {
    if (pill || !document.body) return;
    pill = document.createElement('button'); pill.id = 'erp-ledger-pill'; pill.type = 'button';
    pill.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;font:12px system-ui,sans-serif;padding:4px 10px;border-radius:12px;border:1px solid #888;background:#fff;color:#222;cursor:pointer;opacity:.85';
    pill.addEventListener('click', onClick); document.body.appendChild(pill); paint();
  }
  function ready() { return new Promise(function (res) { var n = 0; (function poll() { if (global.__crud && global.__crud.attachLedger && global.ErpSigner && global.ErpSigner.pubKeyHex && global.LedgerFile) return res(true); if (++n > 300) return res(false); setTimeout(poll, 200); })(); }); }
  function attach(h) {
    return ready().then(function (ok) {
      if (!ok) { say('attach skipped: the page is not ready'); return false; }
      return global.__crud.attachLedger(h, NAME).then(function (r) {
        if (!r || !r.ok) { say('attach failed ' + (r && r.reason)); state = 'off'; paint(); return false; }
        handle = h; state = 'on'; paint(); say('attached folder=' + h.name + ' file=' + NAME + ' fileRows=' + r.fileRows + ' joined=' + r.joined); return true;
      });
    });
  }
  function onClick() {
    if (state === 'on') { global.__crud.detachLedger(); forget().then(function () { var n = handle && handle.name; handle = null; state = 'off'; paint(); say('detached folder=' + n + ' (the file stays)'); }); return; }
    if (state === 'regrant' && handle) {
      Promise.resolve(handle.requestPermission({ mode: 'readwrite' })).then(function (p) { if (p === 'granted') return attach(handle); say('re-grant answered ' + p); }).catch(function (e) { say('re-grant refused ' + (e && e.name)); }); return;
    }
    Promise.resolve(global.showDirectoryPicker({ mode: 'readwrite', id: 'red1-ledger' })).then(function (h) { return keep(h).then(function () { return attach(h); }); })
      .catch(function (e) { say('pick refused ' + (e && e.name)); state = 'off'; paint(); });
  }
  function boot() {
    mount();
    stored().then(function (h) {
      if (!h) { say('no kept folder'); return; }
      handle = h;
      var q = (brk() === 'noperm') ? Promise.resolve('granted') : Promise.resolve(h.queryPermission ? h.queryPermission({ mode: 'readwrite' }) : 'granted');
      return q.then(function (p) { say('kept folder=' + h.name + ' permission=' + p); if (p === 'granted') return attach(h); state = 'regrant'; paint(); });
    });
    global.addEventListener('overlay:committed', function () { if (state === 'on') setTimeout(paint, 600); });
  }
  global.LedgerUi = { state: function () { return state; }, text: text, name: NAME, click: onClick };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : this);
