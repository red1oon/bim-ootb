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
  var DB = 'bim_erp_ledger', ST = 'h', RS = 'roster', KEY = 'handle', state = 'off', pill = null, trust = null, handle = null, keysBtn = null, panel = null;
  function brk() { return global.__LEDGER_UI_BREAK || ''; }
  function say(s) { try { console.log('§LEDGERUI ' + s); } catch (e) {} }
  function idb() { return new Promise(function (res, rej) { var q = indexedDB.open(DB, 2); q.onupgradeneeded = function () { if (!q.result.objectStoreNames.contains(ST)) q.result.createObjectStore(ST); if (!q.result.objectStoreNames.contains(RS)) q.result.createObjectStore(RS); }; q.onsuccess = function () { res(q.result); }; q.onerror = function () { rej(q.error); }; }); }
  function keep(h) { if (brk() === 'nostore') return Promise.resolve(); return idb().then(function (d) { return new Promise(function (res) { var t = d.transaction(ST, 'readwrite'); t.objectStore(ST).put(h, KEY); t.oncomplete = function () { res(); }; t.onerror = function () { res(); }; }); }).catch(function () {}); }
  function forget() { return idb().then(function (d) { return new Promise(function (res) { var t = d.transaction(ST, 'readwrite'); t.objectStore(ST).delete(KEY); t.oncomplete = function () { res(); }; t.onerror = function () { res(); }; }); }).catch(function () {}); }
  function stored() { return idb().then(function (d) { return new Promise(function (res) { var g = d.transaction(ST, 'readonly').objectStore(ST).get(KEY); g.onsuccess = function () { res(g.result || null); }; g.onerror = function () { res(null); }; }); }).catch(function () { return null; }); }
  // the roster of pinned keys (§58): the door's key is trusted only after the owner clicked "Trust key ..." on a fingerprint they compared with `node common/door/ledger_sign.js key`
  function loadRoster() { return idb().then(function (d) { return new Promise(function (res) { var g = d.transaction(RS, 'readonly').objectStore(RS).get('keys'); g.onsuccess = function () { res(g.result || []); }; g.onerror = function () { res([]); }; }); }).catch(function () { return []; }); }
  function saveRoster(list) { return idb().then(function (d) { return new Promise(function (res) { var t = d.transaction(RS, 'readwrite'); t.objectStore(RS).put(list, 'keys'); t.oncomplete = function () { res(); }; t.onerror = function () { res(); }; }); }).catch(function () {}); }
  function unpinned() { var i = global.__crud && global.__crud.ledgerInfo ? global.__crud.ledgerInfo() : null; return (i && i.unpinned) || []; }
  function text() {
    if (state === 'on') { var i = global.__crud && global.__crud.ledgerInfo ? global.__crud.ledgerInfo() : {}, ex = i.excluded && i.excluded.rows ? ' · ' + i.excluded.rows + ' rows not trusted' : ''; return 'Ledger: ' + (handle && handle.name) + ' · ' + (i.rows == null ? '?' : i.rows) + ' rows' + ex; }
    if (state === 'regrant') return 'Ledger: click to re-grant';
    return 'Ledger: off';
  }
  function paint() {
    if (trust) { var u = state === 'on' ? unpinned() : []; trust.style.display = u.length ? '' : 'none'; if (u.length) { trust.textContent = 'Trust key ' + u[0].fp + '? (' + u[0].rows + ' rows)'; trust.title = 'Compare with: node common/door/ledger_sign.js key'; } }
    if (keysBtn) { keysBtn.style.display = state === 'on' ? '' : 'none'; if (state !== 'on' && panel) panel.style.display = 'none'; }
    if (pill) { pill.textContent = text(); pill.setAttribute('data-state', state); pill.title = state === 'on' ? 'Click to detach (the file stays)' : state === 'regrant' ? 'The browser needs your OK to use ' + (handle && handle.name) + ' again' : 'Choose the folder the door (red1>) writes to, so both share one ledger file'; } }
  function mount() {
    if (pill || !document.body) return;
    pill = document.createElement('button'); pill.id = 'erp-ledger-pill'; pill.type = 'button';
    pill.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;font:12px system-ui,sans-serif;padding:4px 10px;border-radius:12px;border:1px solid #888;background:#fff;color:#222;cursor:pointer;opacity:.85';
    pill.addEventListener('click', onClick); document.body.appendChild(pill);
    trust = document.createElement('button'); trust.id = 'erp-ledger-trust'; trust.type = 'button'; trust.style.cssText = 'position:fixed;left:12px;bottom:44px;z-index:9999;font:12px system-ui,sans-serif;padding:4px 10px;border-radius:12px;border:1px solid #c60;background:#fff4e5;color:#222;cursor:pointer;display:none';
    trust.addEventListener('click', function () { var u = unpinned()[0]; if (!u) return; global.__crud.ledgerPin(u.kid).then(function (r) { if (r && r.ok) return saveRoster(r.roster).then(function () { say('trusted key fp=' + u.fp); paint(); }); }); });
    document.body.appendChild(trust);
    // §62 (bim-compiler prompts/CLI_ERP_IVR.md): the Keys panel = this browser's own fingerprint (compare it with `node common/door/ledger_sign.js keys` before `trust` at the door) and each trusted key with Untrust
    keysBtn = document.createElement('button'); keysBtn.id = 'erp-ledger-keys'; keysBtn.type = 'button'; keysBtn.textContent = 'Keys';
    keysBtn.style.cssText = 'position:fixed;left:12px;bottom:76px;z-index:9999;font:12px system-ui,sans-serif;padding:4px 10px;border-radius:12px;border:1px solid #888;background:#fff;color:#222;cursor:pointer;display:none';
    keysBtn.addEventListener('click', function () { if (panel.style.display === 'none') showKeys(); else panel.style.display = 'none'; });
    panel = document.createElement('div'); panel.id = 'erp-ledger-keypanel';
    panel.style.cssText = 'position:fixed;left:12px;bottom:108px;z-index:9999;font:12px system-ui,sans-serif;padding:8px 10px;border-radius:8px;border:1px solid #888;background:#fff;color:#222;display:none;max-width:360px';
    document.body.appendChild(keysBtn); document.body.appendChild(panel); paint();
  }
  function showKeys() {
    var C = global.__crud, own = global.ErpSigner && global.ErpSigner.pubKeyHex, list = C && C.ledgerRoster ? C.ledgerRoster() : [];
    Promise.all([own].concat(list).map(function (k) { return k && C.ledgerFp ? C.ledgerFp(k) : Promise.resolve('?'); })).then(function (fps) {
      panel.innerHTML = '';
      var me = document.createElement('div'); me.id = 'erp-ledger-ownfp'; me.textContent = 'This browser: ' + fps[0]; me.title = 'Before you trust this browser at the door, compare: node common/door/ledger_sign.js keys'; panel.appendChild(me);
      if (!list.length) { var none = document.createElement('div'); none.textContent = 'No other key is trusted.'; panel.appendChild(none); }
      list.forEach(function (kid, i) {
        var row = document.createElement('div'), b = document.createElement('button');
        row.textContent = 'Trusted: ' + fps[i + 1] + ' '; b.type = 'button'; b.className = 'erp-ledger-untrust'; b.setAttribute('data-fp', fps[i + 1]); b.textContent = 'Untrust';
        b.addEventListener('click', function () {
          if (brk() === 'nounpin') { say('untrust skipped (falsifier)'); return; }
          C.ledgerUnpin(kid).then(function (r) { if (r && r.ok) return saveRoster(r.roster).then(function () { say('untrusted key fp=' + fps[i + 1]); paint(); showKeys(); }); });
        });
        row.appendChild(b); panel.appendChild(row);
      });
      panel.style.display = '';
      say('keys panel own=' + fps[0] + ' trusted=' + list.length);
    });
  }
  function ready() { return new Promise(function (res) { var n = 0; (function poll() { if (global.__crud && global.__crud.attachLedger && global.ErpSigner && global.ErpSigner.pubKeyHex && global.LedgerFile) return res(true); if (++n > 300) return res(false); setTimeout(poll, 200); })(); }); }
  function attach(h) {
    return ready().then(function (ok) {
      if (!ok) { say('attach skipped: the page is not ready'); return false; }
      return loadRoster().then(function (list) { global.__crud.ledgerSetRoster(list); return global.__crud.attachLedger(h, NAME); }).then(function (r) {
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
  global.LedgerUi = { state: function () { return state; }, text: text, name: NAME, click: onClick, showKeys: function () { showKeys(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : this);
