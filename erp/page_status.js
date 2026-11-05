// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — page_status.js: ONE status line for till.html, kitchen.html and branch_admin.html (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §40.4, W-UI-FEEDBACK). READ THE LOG (§PSTATUS lines).
// A page is never blank: from first paint a visible line says what it is doing (Starting... loading the shop's data (Ns)), when it is not ready within the limit it says so with a Retry button and the likely cause,
// and every failure the page logs (a line starting with the red dot, a window error, an unhandled rejection) also shows as a readable message with what to do next. The public trial address says it is a trial.
(function () {
  'use strict';
  var GUIDE = 'https://red1oon.github.io/BIMCompiler/TillUserGuide/#install-at-a-shop-air-gapped';
  var S = { kind: '', t0: Date.now(), ready: false, err: null, hint: '', timer: null, el: null, limit: 60, dock: false };
  function qs() { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } }
  function isTrial() { var h = location.hostname; if (/^(localhost|127\.|\[?::1\]?$)/.test(h) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === '') return false; return !qs().get('relay'); }
  function relayUrl() { var r = qs().get('relay'); try { r = r || localStorage.getItem('branchrelay.url'); } catch (e) { /* none */ } return r || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function draw() {
    var el = S.el; if (!el) return; var sec = Math.round((Date.now() - S.t0) / 1000), cls = 'ok', html;
    if (S.err) { cls = 'err'; html = '<b>Problem:</b> ' + esc(S.err.msg) + ' <span class="ps-next">' + esc(S.err.next) + '</span> <button type="button" id="ps-retry">Retry</button>'; }
    else if (!S.ready && sec >= S.limit) { cls = 'warn'; html = '<b>Still starting after ' + sec + ' s.</b> Likely cause: the first download of the shop data is slow, or this device went offline before the first install. Check the connection, then press Retry. <button type="button" id="ps-retry">Retry</button>'; }
    else if (!S.ready) html = 'Starting… loading the shop’s data (' + sec + ' s)';
    else html = S.hint;
    if (isTrial() && !S.err) html += ' <span class="ps-trial">Trial: one browser, GardenWorld demo data, no branch relay. For a real shop see <a href="' + GUIDE + '" target="_blank" rel="noopener">the guide: Install at a shop</a>.</span>';
    el.className = 'ps-' + cls + (S.dock && S.ready && !S.err ? ' ps-dock' : ''); el.innerHTML = html; el.title = el.innerText || '';
    var b = el.querySelector('#ps-retry'); if (b) b.onclick = function () { location.reload(); };
  }
  function start(kind) {
    S.kind = kind; S.t0 = Date.now(); var lim = Number(qs().get('pslimit')); if (lim > 0) S.limit = lim;
    var css = document.createElement('style'); css.textContent = '#ps-status{padding:6px 10px;font:13px system-ui,sans-serif;border-bottom:1px solid #ccc}.ps-ok{background:#eef4fb;color:#234}.ps-warn{background:#fff6dd;color:#5a4300}.ps-err{background:#fde8e8;color:#7a1010}.ps-trial{display:block;margin-top:2px;opacity:.85}#ps-status button{margin-left:6px}.ps-dock{position:fixed;top:3px;left:50%;transform:translateX(-50%);max-width:44vw;padding:1px 8px!important;border:1px solid #ccc!important;border-radius:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px!important;z-index:50}.ps-dock .ps-trial{display:inline!important;margin-left:6px}.ps-empty{padding:18px;color:#456;font:14px system-ui,sans-serif}'; document.head.appendChild(css);
    var el = document.createElement('div'); el.id = 'ps-status'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.insertBefore(el, document.body.firstChild); S.el = el;
    S.hint = ''; draw(); S.timer = setInterval(draw, 1000);
    window.addEventListener('error', function (e) { fail('The page hit an error (' + (e.message || 'unknown') + ').', 'Press Retry; if it repeats, the files did not load completely: reopen the page while online once.'); });
    window.addEventListener('unhandledrejection', function (e) { fail('The page hit an error (' + String(e.reason && e.reason.message || e.reason || 'unknown').slice(0, 160) + ').', 'Press Retry; if it repeats, see Troubleshooting in the guide.'); });
    console.log('§PSTATUS start kind=' + kind + ' limit=' + S.limit + ' trial=' + isTrial());
  }
  function ready(hint) { S.ready = true; S.err = null; S.hint = hint || 'Ready.'; draw(); console.log('§PSTATUS ready kind=' + S.kind + ' after_s=' + Math.round((Date.now() - S.t0) / 1000)); }
  // a page with a fixed-height layout (the till) docks the line as a small chip once the user is working, so the layout loses no height; an error or a stall undocks it into the full bar
  function dock(on) { S.dock = !!on; draw(); }
  function setHint(hint) { S.hint = hint; if (S.ready && !S.err) draw(); }
  function fail(msg, next) { S.err = { msg: msg, next: next || 'Press Retry.' }; draw(); console.log('§PSTATUS error kind=' + S.kind + ' msg=' + String(msg).slice(0, 120)); }
  // the pages route their log() through here: a red-dot line becomes a message on screen, with what to do next
  function fromLog(line) {
    var s = String(line); if (s.indexOf('🔴') !== 0) return;
    var next = /BOOT/.test(s) ? 'The shop data did not load. Press Retry. Offline before the first install? Open the page once while online.' : /LAN|RELAY|PIPE/i.test(s) ? 'The branch relay could not be reached. Selling continues on this till; check the relay box and the address, then press Retry.' : 'Press Retry; if it repeats, see Troubleshooting in the guide.';
    fail(s.replace(/^🔴\s*/, '').split('\n')[0].slice(0, 200), next);
  }
  function relayWords() { var r = relayUrl(); return r ? 'Branch relay: ' + r : 'Not joined to a branch relay — see the guide: <a href="' + GUIDE + '" target="_blank" rel="noopener">Install at a shop</a>.'; }
  window.PageStatus = { dock: dock, start: start, ready: ready, hint: setHint, fail: fail, fromLog: fromLog, relayWords: relayWords, relayUrl: relayUrl, isTrial: isTrial, state: function () { return S; }, GUIDE: GUIDE };
})();
