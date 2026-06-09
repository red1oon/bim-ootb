// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// common/whole_history.js — the WHOLE-history substrate: ONE cross-page, cross-tab log that EVERY
// surface (viewer · idempiere · glassbowl · gravity · landing) contributes to, and ONE reader that
// renders the aggregate ("what page was I on before") + the TIME scroller (day → stretch).
//
// HISTORY_WHOLE_TIMELINE.md §INVARIANTS: ADDITIVE (each page KEEPS its own local bar + recording;
// this is a READER layered on top — no bar is removed); READ-ONLY restore (navigate + best-effort
// view restore, NEVER mutate any kernel op-log); DETERMINISTIC (`ts` is the real recorded Date.now()
// at record time — the witness injects test ts via the entry, never calls Date.now in the record path);
// SHARED engine, no fork (this generalises history_bar.js `_mirror` + the landing's renderDocHistory
// onto ONE shape so glassbowl/gravity view-logs become CONTRIBUTORS, not rewrites).
//
// THE SHARED ENTRY SHAPE (W1):  { page, ts, label, kind, ref }
//   page ∈ {viewer, idempiere, glassbowl, gravity, landing}
//   ts   = real recorded Date.now() (INTEGER ms; entry may carry its own — witness injects it)
//   kind = 'op' | 'view' | 'nav' | 'pick'  (render hint only)
//   ref  = the page's own re-open key:  viewer building+view · idempiere {window,tab,table,recordId}
//          · glassbowl/gravity the captured view  (carried on cross-page restore, read-only)
// Backward-compat: we ALSO stamp `source` (=page) + `type` (=kind) so the EXISTING landing reader
// (index.html renderDocHistory, which reads e.source/e.type/e.label) keeps working unchanged.
//
// Node-testable: the witness loads this in node with a localStorage shim + injected ts (no browser).
(function (root) {
  'use strict';

  var KEY = 'bim.docHistory';   // the ONE shared log (same key history_bar.js + landing already use)
  var CH = 'bim_history';       // the cross-tab BroadcastChannel
  var MAX = 200;                // keep the last N (multi-day stretches need more than the old 50)
  var PAGES = { viewer: 1, idempiere: 1, glassbowl: 1, gravity: 1, landing: 1 };

  function _ls() { try { return (typeof localStorage !== 'undefined') ? localStorage : (root && root.localStorage) || null; } catch (e) { return null; } }
  function _now() { return (typeof Date !== 'undefined') ? Date.now() : 0; }

  function all() {
    var ls = _ls(); if (!ls) return [];
    try { var a = JSON.parse(ls.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }

  // Normalise any stored row (old {source,type,label} OR new {page,kind,ref}) to the unified shape.
  function _norm(e) {
    if (!e) return null;
    var page = e.page || e.source || 'landing';
    return { page: page, ts: (e.ts == null ? 0 : Math.floor(e.ts)), label: String(e.label || ''),
      kind: e.kind || e.type || 'nav', ref: (e.ref != null ? e.ref : null),
      source: page, type: e.type || e.kind || 'nav' };
  }

  // record(entry) — the SINGLE writer every surface mirrors through. entry: {page, ts?, label, kind?, ref?}.
  // ADDITIVE + best-effort: never throws, never replaces a local bar. Returns the stored row (or null).
  function record(entry) {
    try {
      if (!entry || !entry.page) return null;
      var ls = _ls(); if (!ls) return null;
      var rec = { page: entry.page, ts: (entry.ts != null ? Math.floor(entry.ts) : _now()),
        label: String(entry.label || ''), kind: entry.kind || 'nav',
        ref: (entry.ref != null ? entry.ref : null),
        source: entry.page, type: entry.type || entry.kind || 'nav' };     // ← landing back-compat
      var arr = all();
      arr.push(rec);
      if (arr.length > MAX) arr = arr.slice(-MAX);
      ls.setItem(KEY, JSON.stringify(arr));
      try { new BroadcastChannel(CH).postMessage('sync'); } catch (e) {}
      console.log('§WHOLE-REC page=' + rec.page + ' kind=' + rec.kind + ' ts=' + rec.ts + ' label="' + rec.label + '"');
      return rec;
    } catch (err) { return null; }
  }

  // entries() — the normalised, TIME-ORDERED merged view every reader consumes.
  function entries() {
    return all().map(_norm).filter(Boolean).sort(function (a, b) { return (a.ts - b.ts) || 0; });
  }
  function pages() { var s = {}; entries().forEach(function (e) { s[e.page] = 1; }); return Object.keys(s); }

  function clear() { var ls = _ls(); if (ls) { try { ls.removeItem(KEY); } catch (e) {} } }

  // ════════════════════════════════════════════════════════════════════════
  // W2 — CROSS-PAGE BAR (the aggregate reader) + the deep-link handoff.
  // Pure logic (buildItems / urlFor / onEntryClick) is node-witnessable; the DOM render() wraps it.
  // ════════════════════════════════════════════════════════════════════════
  var RESTORE_KEY = 'bim.wholeRestore';   // the cross-page restore handoff (read once by the target page)
  var MODE_KEY = 'bim.whole.mode';        // 'whole' | 'this'
  // root-relative path to each surface (resolved against the mounting page's rootPrefix).
  var PATHS = { viewer: 'viewer/viewer.html', idempiere: 'erp/idempiere.html',
    glassbowl: 'erp/glassbowl.html', gravity: 'erp/glassbowl_gravity.html', landing: 'index.html' };
  var PAGE_LABEL = { viewer: 'Viewer', idempiere: 'iDempiere', glassbowl: 'Glassbowl', gravity: 'Gravity', landing: 'Home' };

  var _page = null;        // this surface's page id (set in mount)
  var _rootPrefix = '';    // relative path from this page to the site root ('' landing, '../' nested)
  var _mode = 'whole';
  var _localRestore = null; // optional same-page restore fn (best-effort)
  function _readMode() { var ls = _ls(); try { var m = ls && ls.getItem(MODE_KEY); _mode = (m === 'this' || m === 'whole') ? m : 'whole'; } catch (e) { _mode = 'whole'; } }

  function urlFor(page) { return _rootPrefix + (PATHS[page] || PATHS.landing); }

  // buildItems(mode, page) — the rows the bar renders, time-ordered. mode 'this' filters to `page`.
  function buildItems(mode, page) {
    var es = entries();
    if (mode === 'this' && page) es = es.filter(function (e) { return e.page === page; });
    return es.map(function (e) {
      return { page: e.page, label: e.label, kind: e.kind, ts: e.ts, ref: e.ref,
        pageLabel: PAGE_LABEL[e.page] || e.page, foreign: (e.page !== page), url: urlFor(e.page) };
    });
  }

  // ── W3 — TIME SCROLLER (day → stretch) — pure logic (node-witnessable) ──
  // Bucket entries by DAY from ts; long-press-back steps DAY→DAY; landing on a day expands its STRETCH
  // = every page's entries in that day window, time-ordered + horizontally scrollable.
  var _selDay = null;        // selected day key (null → the latest populated day)
  function _dayKey(ts) { var d = new Date(ts); function p(n) { return (n < 10 ? '0' : '') + n; } return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  var _MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function _dayLabel(key) { var p = String(key).split('-'); return _MON[(+p[1] || 1) - 1] + ' ' + (+p[2] || 1); }

  // buildDays(mode,page) — ascending [{key,label,items}], one bucket per calendar day that has entries.
  function buildDays(mode, page) {
    var items = buildItems(mode, page);
    var by = {}, order = [];
    items.forEach(function (it) { var k = _dayKey(it.ts); if (!by[k]) { by[k] = []; order.push(k); } by[k].push(it); });
    order.sort();
    return order.map(function (k) { return { key: k, label: _dayLabel(k), items: by[k] }; });
  }
  function _dayKeys(mode, page) { return buildDays(mode, page).map(function (d) { return d.key; }); }
  function selectedDay(mode, page) {
    var keys = _dayKeys(mode, page); if (!keys.length) return null;
    if (_selDay && keys.indexOf(_selDay) >= 0) return _selDay;
    return keys[keys.length - 1];       // default = the latest populated day
  }
  function setSelDay(k) { _selDay = k; _render(); }
  // stepBackDay / stepFwdDay — the long-press-back (and forward) jump, restricted to POPULATED days.
  function stepBackDay(mode, page) {
    var keys = _dayKeys(mode, page); if (!keys.length) return null;
    var cur = selectedDay(mode, page); var i = keys.indexOf(cur);
    _selDay = keys[Math.max(0, i - 1)]; _render();
    console.log('§WHOLE-DAYBACK from=' + cur + ' to=' + _selDay);
    return _selDay;
  }
  function stepFwdDay(mode, page) {
    var keys = _dayKeys(mode, page); if (!keys.length) return null;
    var cur = selectedDay(mode, page); var i = keys.indexOf(cur);
    _selDay = keys[Math.min(keys.length - 1, i + 1)]; _render();
    return _selDay;
  }
  // stretch(mode,page) — the selected day's entries (the scrollable strip).
  function stretch(mode, page) {
    var k = selectedDay(mode, page); if (!k) return [];
    var d = buildDays(mode, page).filter(function (x) { return x.key === k; })[0];
    return d ? d.items : [];
  }

  // onEntryClick(item) — READ-ONLY cross-page restore. Foreign page → stash the handoff + navigate;
  // same page → best-effort local restore (registered by the host). Returns the target url (for witness).
  function onEntryClick(item) {
    if (!item) return null;
    if (item.foreign) {
      var ls = _ls();
      try { if (ls) ls.setItem(RESTORE_KEY, JSON.stringify({ page: item.page, ref: item.ref, ts: item.ts })); } catch (e) {}
      console.log('§WHOLE-NAV to=' + item.page + ' url=' + item.url + ' ref=' + JSON.stringify(item.ref));
      try { if (typeof location !== 'undefined') location.href = item.url; } catch (e) {}
      return item.url;
    }
    if (_localRestore) { try { _localRestore(item.ref, item); } catch (e) {} }
    console.log('§WHOLE-NAV local page=' + item.page + ' ref=' + JSON.stringify(item.ref));
    return null;
  }

  // consumeRestore(page, applyFn) — the target page calls this on load: if a pending handoff targets
  // THIS page, hand its ref to applyFn (read-only restore) and clear it (consumed once). Returns the ref.
  function consumeRestore(page, applyFn) {
    var ls = _ls(); if (!ls) return null;
    var raw; try { raw = ls.getItem(RESTORE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    var h; try { h = JSON.parse(raw); } catch (e) { return null; }
    if (!h || h.page !== page) return null;
    try { ls.removeItem(RESTORE_KEY); } catch (e) {}
    console.log('§WHOLE-RESTORE page=' + page + ' ref=' + JSON.stringify(h.ref));
    if (applyFn) { try { applyFn(h.ref, h); } catch (e) { console.warn('§WHOLE-RESTORE-ERR', e); } }
    return h.ref;
  }
  function registerLocalRestore(fn) { _localRestore = fn; }

  function setMode(m) { if (m !== 'whole' && m !== 'this') return; _mode = m; try { var ls = _ls(); if (ls) ls.setItem(MODE_KEY, m); } catch (e) {} _render(); console.log('§WHOLE-MODE ' + _mode); }
  function getMode() { return _mode; }

  // ── DOM (browser only) — a clean, self-contained launcher + overlay panel ──
  var _panel = null, _strip = null, _launch = null, _opened = false;
  var GOLD = '#ffd479';
  var _PAGE_COLOR = { viewer: '#4fc3f7', idempiere: '#66bb6a', glassbowl: '#b388ff', gravity: '#ff8a65', landing: '#9aa4b8' };
  function _clockSvg(px) {
    var inner = (typeof window !== 'undefined' && window.ICONS && window.ICONS.clock) ? window.ICONS.clock.svg
      : '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';
    return '<svg width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function _hhmm(ts) { try { var d = new Date(ts); function p(n) { return (n < 10 ? '0' : '') + n; } return p(d.getHours()) + ':' + p(d.getMinutes()); } catch (e) { return ''; } }

  function _ensureDom() {
    if (_launch || typeof document === 'undefined') return;
    var st = document.createElement('style'); st.id = 'whole-hist-style';
    st.textContent =
      '#whole-hist-launch{position:fixed;left:14px;bottom:16px;z-index:60;width:38px;height:38px;border-radius:50%;' +
        'display:flex;align-items:center;justify-content:center;background:rgba(20,35,60,0.82);color:#9ecbff;' +
        'border:1px solid rgba(255,255,255,0.15);cursor:pointer;backdrop-filter:blur(6px);box-shadow:0 2px 8px rgba(0,0,0,0.3)}' +
      '#whole-hist-launch:hover{color:#cfe8ff;border-color:#4fc3f7}' +
      '#whole-hist-panel{position:fixed;inset:0;z-index:61;display:none;background:rgba(6,10,16,0.55);backdrop-filter:blur(2px)}' +
      '#whole-hist-panel.show{display:block}' +
      '#whole-hist-card{position:absolute;left:50%;bottom:64px;transform:translateX(-50%);width:min(560px,92vw);max-height:62vh;' +
        'display:flex;flex-direction:column;background:#0f1622;border:1px solid #2b3744;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.5)}' +
      '#whole-hist-hd{display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,0.07)}' +
      '#whole-hist-hd .title{font:600 13px system-ui;color:#cfe8ff;flex:1}' +
      '.whole-seg{display:flex;border:1px solid #2b3744;border-radius:8px;overflow:hidden}' +
      '.whole-seg button{background:transparent;color:#8aa;border:0;padding:5px 11px;font:12px system-ui;cursor:pointer}' +
      '.whole-seg button.on{background:rgba(79,195,247,0.18);color:#cfe8ff}' +
      '#whole-hist-x{background:transparent;border:0;color:#8aa;cursor:pointer;display:flex;padding:4px}' +
      '#whole-hist-body{overflow-y:auto;padding:8px 6px}' +
      '.whole-row{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;cursor:pointer}' +
      '.whole-row:hover{background:rgba(255,255,255,0.05)}' +
      '.whole-badge{flex:0 0 auto;font:600 10px system-ui;padding:2px 7px;border-radius:9px;letter-spacing:.3px}' +
      '.whole-lbl{flex:1;font:13px system-ui;color:#dfe7f2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.whole-time{flex:0 0 auto;font:11px ui-monospace,monospace;color:#6c7a8c}' +
      '.whole-here{font-size:10px;color:#6c7a8c;margin-left:4px}' +
      '.whole-empty{padding:18px;text-align:center;color:#6c7a8c;font:13px system-ui}' +
      // W3 — day axis + stretch
      '.whole-dayaxis{display:flex;align-items:center;gap:6px;padding:4px 8px 8px;border-bottom:1px solid rgba(255,255,255,0.06);overflow-x:auto}' +
      '.whole-dayback,.whole-dayfwd{flex:0 0 auto;background:rgba(255,255,255,0.05);border:1px solid #2b3744;color:#9ecbff;border-radius:7px;padding:4px 9px;font:13px system-ui;cursor:pointer;user-select:none}' +
      '.whole-dayback:active{background:rgba(79,195,247,0.25)}' +
      '.whole-daybtn{flex:0 0 auto;background:transparent;border:1px solid transparent;color:#8aa;border-radius:7px;padding:4px 9px;font:12px system-ui;cursor:pointer;white-space:nowrap}' +
      '.whole-daybtn.on{background:rgba(255,212,121,0.16);border-color:#ffd47955;color:#ffd479}' +
      '.whole-daycount{font-size:9px;opacity:0.7;margin-left:3px}' +
      '#whole-stretch{display:flex;gap:8px;align-items:stretch;overflow-x:auto;padding:10px 8px 4px}' +
      '#whole-stretch::-webkit-scrollbar{height:6px}' +
      '.whole-chip{flex:0 0 auto;min-width:120px;max-width:200px;display:flex;flex-direction:column;gap:4px;cursor:pointer;' +
        'background:rgba(20,35,60,0.55);border:1px solid #2b3744;border-radius:10px;padding:8px 10px}' +
      '.whole-chip:hover{border-color:#4fc3f7}' +
      '.whole-chip .whole-lbl{white-space:normal}';
    document.head.appendChild(st);

    _launch = document.createElement('button');
    _launch.id = 'whole-hist-launch'; _launch.title = 'Whole history — across pages'; _launch.innerHTML = _clockSvg(19);
    _launch.addEventListener('click', function () { toggleOpen(); });
    document.body.appendChild(_launch);

    _panel = document.createElement('div'); _panel.id = 'whole-hist-panel';
    _panel.innerHTML =
      '<div id="whole-hist-card">' +
        '<div id="whole-hist-hd">' +
          '<span class="title">History — across pages</span>' +
          '<div class="whole-seg" id="whole-seg">' +
            '<button data-mode="whole">Whole</button><button data-mode="this">This page</button>' +
          '</div>' +
          '<button id="whole-hist-x" title="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>' +
        '</div>' +
        '<div id="whole-hist-body"></div>' +
      '</div>';
    document.body.appendChild(_panel);
    _strip = _panel.querySelector('#whole-hist-body');
    _panel.addEventListener('click', function (e) { if (e.target === _panel) toggleOpen(); }); // backdrop closes
    _panel.querySelector('#whole-hist-x').addEventListener('click', function () { toggleOpen(); });
    Array.prototype.forEach.call(_panel.querySelectorAll('#whole-seg button'), function (b) {
      b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); });
    });
  }

  function _render() {
    if (!_strip) return;
    Array.prototype.forEach.call(_panel.querySelectorAll('#whole-seg button'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === _mode);
    });
    _renderBody();
  }

  // W3 — the panel body IS the TIME scroller: a day axis (long-press-back steps DAY→DAY) over the
  // selected day's STRETCH = every page's entries that day, time-ordered + horizontally scrollable.
  function _renderBody() {
    _strip.innerHTML = '';
    var days = buildDays(_mode, _page);
    if (!days.length) { _strip.innerHTML = '<div class="whole-empty">No history yet — move around and it shows here.</div>'; return; }
    var sel = selectedDay(_mode, _page);

    // ── day axis ──
    var axis = document.createElement('div'); axis.className = 'whole-dayaxis';
    var back = document.createElement('button'); back.className = 'whole-dayback'; back.title = 'Earlier day (hold to scrub back)';
    back.innerHTML = '‹ day';
    _wireLongPressBack(back);
    axis.appendChild(back);
    days.forEach(function (d) {
      var b = document.createElement('button'); b.className = 'whole-daybtn' + (d.key === sel ? ' on' : '');
      b.innerHTML = _esc(d.label) + '<span class="whole-daycount">' + d.items.length + '</span>';
      b.addEventListener('click', function () { setSelDay(d.key); });
      axis.appendChild(b);
    });
    var fwd = document.createElement('button'); fwd.className = 'whole-dayfwd'; fwd.title = 'Later day';
    fwd.innerHTML = 'day ›';
    fwd.addEventListener('click', function () { stepFwdDay(_mode, _page); });
    axis.appendChild(fwd);
    _strip.appendChild(axis);

    // ── the selected day's STRETCH (horizontal, scrollable) ──
    var strip = document.createElement('div'); strip.id = 'whole-stretch';
    var items = stretch(_mode, _page);
    items.forEach(function (it) {
      var col = _PAGE_COLOR[it.page] || '#9aa4b8';
      var chip = document.createElement('div'); chip.className = 'whole-chip';
      chip.innerHTML = '<span class="whole-badge" style="color:' + col + ';background:' + col + '22;border:1px solid ' + col + '55">' + _esc(it.pageLabel) + '</span>' +
        '<span class="whole-lbl">' + _esc(it.label) + (it.foreign ? '' : '<span class="whole-here">· here</span>') + '</span>' +
        '<span class="whole-time">' + _hhmm(it.ts) + '</span>';
      chip.addEventListener('click', function () { onEntryClick(it); });
      strip.appendChild(chip);
    });
    _strip.appendChild(strip);
  }

  // Long-press-back = the time-jump gesture (KNOB press model). Tap = one day back; hold = scrub back
  // repeatedly. Pointer-based so it works on touch + mouse.
  function _wireLongPressBack(btn) {
    var timer = null, repeat = null, fired = false;
    function start() {
      fired = false;
      timer = setTimeout(function () {           // long-press → begin scrubbing back, day by day
        fired = true; stepBackDay(_mode, _page);
        repeat = setInterval(function () { stepBackDay(_mode, _page); }, 480);
      }, 350);
    }
    function end() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (repeat) { clearInterval(repeat); repeat = null; }
      if (!fired) stepBackDay(_mode, _page);     // short tap → one day back
    }
    btn.addEventListener('pointerdown', function (e) { e.preventDefault(); start(); });
    btn.addEventListener('pointerup', function () { end(); });
    btn.addEventListener('pointerleave', function () { if (timer || repeat) { if (timer) clearTimeout(timer); if (repeat) clearInterval(repeat); timer = repeat = null; } });
  }

  function open() { _ensureDom(); _opened = true; if (_panel) _panel.classList.add('show'); _render(); console.log('§WHOLE-OPEN page=' + _page + ' mode=' + _mode); }
  function close() { _opened = false; if (_panel) _panel.classList.remove('show'); }
  function toggleOpen() { if (_opened) close(); else open(); }

  // mount({page, rootPrefix, autoLaunch}) — each surface calls this once. ADDITIVE: it adds ONLY the
  // launcher + overlay; it never touches the page's own local bar.
  function mount(opts) {
    opts = opts || {};
    _page = opts.page || _page || 'landing';
    _rootPrefix = (opts.rootPrefix != null) ? opts.rootPrefix : _rootPrefix;
    _readMode();
    if (typeof document !== 'undefined') {
      if (document.body) { _ensureDom(); }
      else document.addEventListener('DOMContentLoaded', function () { _ensureDom(); });
      try { var bc = new BroadcastChannel(CH); bc.onmessage = function () { if (_opened) _render(); }; } catch (e) {}
      try { window.addEventListener('storage', function (e) { if (e.key === KEY && _opened) _render(); }); } catch (e) {}
    }
    console.log('§WHOLE-MOUNT page=' + _page + ' rootPrefix="' + _rootPrefix + '" mode=' + _mode);
    return API;
  }

  var API = { KEY: KEY, CH: CH, PATHS: PATHS, PAGES: PAGES,
    record: record, all: all, entries: entries, pages: pages, clear: clear, _norm: _norm,
    mount: mount, open: open, close: close, toggleOpen: toggleOpen,
    buildItems: buildItems, urlFor: urlFor, onEntryClick: onEntryClick,
    consumeRestore: consumeRestore, registerLocalRestore: registerLocalRestore,
    setMode: setMode, getMode: getMode,
    // W3 — time scroller
    buildDays: buildDays, selectedDay: selectedDay, setSelDay: setSelDay,
    stepBackDay: stepBackDay, stepFwdDay: stepFwdDay, stretch: stretch };
  if (root) root.WholeHistory = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
