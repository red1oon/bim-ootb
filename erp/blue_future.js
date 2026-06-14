/**
 * BIM OOTB — Frictionless BIM. Two DBs. One browser. Zero install.
 * Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
 * SPDX-License-Identifier: MIT
 *
 * blue_future.js — the VISUAL/BROWSER legs of FRONTEND_LANE_MASTER.md §OUTSTANDING item 0 (BLUE FUTURE).
 *   The ENGINE is shipped (kernel_ops.js v9: branch_id ∉ _canonical · replayOps official-default ·
 *   branchOps/discardBranch/acceptBranchUpTo; W-BLUE-FUTURE 9/9). This module is the SKIN over it:
 *
 *   THE METAPHOR (NON-INVENT — it falls out of "state IS a fold of an append-only log"):
 *     The PAST is immutable (read-only). The FUTURE is a discardable sandbox — a speculative branch of the
 *     WHOLE transactional state. Enter blue → ordinary edits + the full CompleteIt fan-out commit with a
 *     {branch_id} and are INVISIBLE to every official read. Then either ACCEPT-UP-TO a dot (those ops turn
 *     white/permanent, the chain still verifies because the tag is not hashed) or DISCARD (shirk the blues —
 *     fold the whole branch away; official state never moved).
 *
 *   FIVE LEGS (this file + small idempiere.html/crud_overlay.js seams):
 *     1. Branch mode + dot gestures: long-press the WHITE anchor dot → enter blue (no blue yet) OR
 *        discard-all (blue exists → CONFIRM, destructive); long-press a BLUE dot → accept-up-to-here.
 *     2. PERVASIVE UNOFFICIAL treatment (SAFETY, not cosmetic): blue rim on every window incl. the GL,
 *        an "UNOFFICIAL" banner on top, an "UNOFFICIAL" watermark on every print/export.
 *     3. Zoom/drill into the blue children (M_InOut/C_Invoice raised by a blue CompleteIt).
 *     4. The official chrome read-sites filter the branch out (done in crud_overlay.js: tipDocs/listTip/
 *        readTip/tipValues/fieldLineage gain an optional `branch`; the controller's readBranch() seam feeds
 *        the active branch only while in blue mode).
 *     5. Full CompleteIt: while blue, the EXISTING DocAction fan-out (crud_overlay commitProcess → commitGroup,
 *        now routed through _commitMeta() → {branch_id}) lands speculative — zero new fan-out code.
 *
 *   SEAMS consumed by crud_overlay.js (never a fork):
 *     window.BlueFuture.readBranch()  → active branch id while blue, else null (read VIEW).
 *     window.BlueFuture.groupMeta()   → {branch_id} while blue, else {} (every signed commit).
 *
 *   DETERMINISM (NON-INVENT): no Date.now / Math.random anywhere — the branch id is a monotonic counter
 *   seeded from the official tip, and accept/discard are pure folds of the op-log via the shipped engine.
 *
 * Implementing FRONTEND_LANE_MASTER.md §OUTSTANDING item 0 (browser legs) — Witness: W-BLUE-FUTURE-LIVE
 */
(function () {
  'use strict';

  var _blue = false;          // in blue mode?
  var _branch = null;         // active branch id while blue (null otherwise)
  var _seq = 0;               // monotonic — deterministic branch ids, no Date.now/Math.random
  var _rail = null, _style = null, _banner = null;
  var _LONG = 480;            // long-press threshold (ms) — common HMI

  function _db() { try { return (window.__crud && typeof window.__crud.kernelDb === 'function') ? window.__crud.kernelDb() : null; } catch (e) { return null; } }
  function _KO() { return window.KernelOps || null; }

  // ── SEAMS (crud_overlay.js consumes these) ──────────────────────────────────────────────────────────
  function readBranch() { return _blue ? _branch : null; }
  function groupMeta()  { return _blue ? { branch_id: _branch } : {}; }
  function isBlue()     { return _blue; }
  function branchId()   { return _branch; }

  // ── branch ops, grouped by gid → one dot per speculative "moment" (id order) ──────────────────────────
  // Each dot carries the MAX op id of its group → accept-up-to passes exactly that id (leg 1).
  function _groups() {
    var KO = _KO(), db = _db(); if (!KO || !db || !_branch) return [];
    var ops = KO.branchOps(db, _branch);   // [{id, gid, op_type}] id order, undone=0
    var byGid = {}, order = [];
    ops.forEach(function (o) {
      var g = o.gid || ('op-' + o.id);
      if (!byGid[g]) { byGid[g] = { gid: g, maxId: o.id, types: [] }; order.push(g); }
      byGid[g].maxId = Math.max(byGid[g].maxId, o.id);
      byGid[g].types.push(o.op_type);
    });
    return order.map(function (g) { return byGid[g]; });
  }

  // ── enter / accept / discard ─────────────────────────────────────────────────────────────────────────
  function enter() {
    if (_blue) return _branch;
    var KO = _KO(), db = _db();
    // deterministic id seeded from the official tip (collision-free within a session, discardable across).
    var tip = 0;
    try { if (db) { var r = db.exec('SELECT MAX(id) FROM kernel_ops'); if (r.length && r[0].values.length && r[0].values[0][0] != null) tip = r[0].values[0][0]; } } catch (e) {}
    _branch = 'blue-' + tip + '-' + (++_seq);
    _blue = true;
    _applyTreatment(true);
    console.log('§BLUE-LIVE enter branch=' + _branch + ' tip=' + tip);
    _render(); _refreshChrome();
    return _branch;
  }

  // acceptUpTo(maxId) — long-press a BLUE dot: ops with id <= maxId go official; later blue stays blue.
  function acceptUpTo(maxId) {
    if (!_blue) return null;
    var KO = _KO(), db = _db(); if (!KO || !db) return null;
    return Promise.resolve(KO.acceptBranchUpTo(db, _branch, maxId)).then(function (res) {
      console.log('§BLUE-LIVE accept-up-to id=' + maxId + ' accepted=' + (res && res.accepted) + ' remainingBlue=' + (res && res.remaining) + ' chainOk=' + (res && res.chain && res.chain.ok));
      if (res && res.remaining === 0) _exit('all-accepted');   // nothing blue left → drop the unofficial skin
      else { _render(); }
      _refreshChrome();
      return res;
    });
  }

  // discardAll() — long-press the WHITE anchor while blue exists: shirk EVERY blue op (destructive, CONFIRM).
  function discardAll(skipConfirm) {
    if (!_blue) return null;
    var groups = _groups();
    if (groups.length && !skipConfirm) {
      var n = groups.length;
      if (!window.confirm('Discard the whole blue branch? ' + n + ' speculative ' + (n === 1 ? 'step' : 'steps') + ' will be folded away. Official records are untouched. This cannot be undone.')) {
        console.log('§BLUE-LIVE discard cancelled');
        return null;
      }
    }
    var KO = _KO(), db = _db();
    var res = (KO && db) ? KO.discardBranch(db, _branch) : { discarded: 0 };
    console.log('§BLUE-LIVE discard-all discarded=' + (res && res.discarded));
    _exit('discarded');
    _refreshChrome();
    return res;
  }

  function _exit(why) {
    _blue = false; _branch = null;
    _applyTreatment(false);
    _render();
    console.log('§BLUE-LIVE exit reason=' + why);
  }

  // ── leg 3: Zoom — the blue children (CREATE_DOCUMENT ops) raised under a record, from the branch view ──
  function zoomChildren(sourceTable, sourceId) {
    var db = _db(); if (!db || !_branch) return [];
    var KO = _KO();
    // engine path: CREATE_DOCUMENT ops carry source_id; read from the BRANCH projection.
    var docs = KO.replayOps(db, 'CREATE_DOCUMENT', _branch)
      .filter(function (o) { return o.parameters && (sourceId == null || Number(o.parameters.source_id) === Number(sourceId)); })
      .map(function (o) { return { table: o.parameters.table, id: o.parameters.id || o.parameters.output_id || null, opId: o.id }; });
    console.log('§BLUE-LIVE zoom source=' + sourceTable + ':' + sourceId + ' children=' + JSON.stringify(docs.map(function (d) { return d.table; })));
    return docs;
  }

  // ── leg 5: stampExport — the UNOFFICIAL safety mark for any print/export filename while blue ──
  function stampExport(name) { return _blue ? ('UNOFFICIAL-' + (name || 'export')) : (name || 'export'); }

  // ── refresh the chrome after a branch change (re-open active window like overlay:committed does) ───────
  function _refreshChrome() {
    try { window.dispatchEvent(new CustomEvent('bluefuture:changed', { detail: { blue: _blue, branch: _branch } })); } catch (e) {}
  }

  // ── leg 2: PERVASIVE UNOFFICIAL treatment — rim (body class) + banner + print/export watermark ─────────
  function _applyTreatment(on) {
    _injectStyle();
    document.body.classList.toggle('blue-future', !!on);
    if (on) {
      if (!_banner) {
        _banner = document.createElement('div');
        _banner.id = 'blue-banner';
        _banner.innerHTML = '<span class="bf-dot"></span> UNOFFICIAL — speculative blue branch · official records unchanged';
        document.body.appendChild(_banner);
      }
      _banner.style.display = 'flex';
    } else if (_banner) { _banner.style.display = 'none'; }
  }

  function _injectStyle() {
    if (_style) return;
    _style = document.createElement('style');
    _style.id = 'blue-future-style';
    _style.textContent =
      // PERVASIVE blue rim — every window/panel/canvas while blue (incl. the GL viewer canvas).
      'body.blue-future #idmp-main, body.blue-future #idmp-content, body.blue-future canvas,' +
      'body.blue-future .idmp-form, body.blue-future .idmp-grid, body.blue-future .kb-board {' +
        'box-shadow: inset 0 0 0 3px rgba(108,159,255,0.85), 0 0 14px rgba(108,159,255,0.35) !important;' +
        'border-radius:6px;}' +
      // the UNOFFICIAL top banner.
      '#blue-banner{display:none;position:fixed;top:0;left:0;right:0;z-index:99999;height:26px;' +
        'align-items:center;justify-content:center;gap:8px;font:600 12px/26px system-ui,sans-serif;' +
        'letter-spacing:.04em;color:#eaf1ff;background:linear-gradient(90deg,#1c5fa8,#6c9fff);' +
        'box-shadow:0 1px 6px rgba(0,0,0,.4);text-transform:uppercase;}' +
      '#blue-banner .bf-dot{width:9px;height:9px;border-radius:50%;background:#eaf1ff;' +
        'box-shadow:0 0 8px #eaf1ff;animation:bf-pulse 1.4s ease-in-out infinite;}' +
      '@keyframes bf-pulse{0%,100%{opacity:.5;}50%{opacity:1;}}' +
      'body.blue-future{padding-top:26px;}' +     // make room for the banner
      // the blue dot rail (sits just above the history scrubber / status bar).
      '#blue-rail{display:flex;align-items:center;gap:10px;height:30px;padding:0 12px;' +
        'background:#0b1322;border-top:1px solid rgba(108,159,255,0.12);opacity:.6;transition:opacity .2s;}' +
      '#blue-rail:hover{opacity:1;}' +
      '#blue-rail.blue{opacity:1;border-top-color:rgba(108,159,255,0.4);}' +
      '#blue-rail .bf-label{font:600 10px/1 system-ui,sans-serif;letter-spacing:.06em;color:#6c9fff;' +
        'text-transform:uppercase;flex:0 0 auto;}' +
      '#blue-rail .bf-anchor{flex:0 0 auto;width:11px;height:11px;border-radius:50%;background:#e8edf6;' +
        'box-shadow:0 0 0 2px rgba(232,237,246,0.25);cursor:pointer;transition:transform .15s;}' +
      '#blue-rail .bf-anchor:hover{transform:scale(1.2);}' +
      '#blue-rail .bf-anchor.armed{background:#ffd479;box-shadow:0 0 10px rgba(255,212,121,.8);}' +
      '#blue-rail .bf-dot2{flex:0 0 auto;width:11px;height:11px;border-radius:50%;background:#6c9fff;' +
        'box-shadow:0 0 8px rgba(108,159,255,.7);cursor:pointer;transition:transform .15s;}' +
      '#blue-rail .bf-dot2:hover{transform:scale(1.25);}' +
      '#blue-rail .bf-dot2.armed{background:#9cc0ff;box-shadow:0 0 12px rgba(156,192,255,.95);}' +
      '#blue-rail .bf-hint{font:400 11px/1 system-ui,sans-serif;color:#7e8aa3;flex:1;min-width:0;' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      // print/export watermark — SAFETY: a blue print/export must scream UNOFFICIAL.
      'body.blue-future::after{content:"";}' +     // (placeholder so the rule exists in screen too)
      '@media print{body.blue-future::before{content:"UNOFFICIAL";position:fixed;top:40%;left:0;right:0;' +
        'text-align:center;font:900 120px/1 system-ui,sans-serif;color:rgba(28,95,168,.18);' +
        'transform:rotate(-24deg);z-index:99999;pointer-events:none;letter-spacing:.1em;}}';
    document.head.appendChild(_style);
  }

  // ── the dot rail + long-press gestures (leg 1) ────────────────────────────────────────────────────────
  function _ensureRail() {
    if (_rail) return _rail;
    _injectStyle();
    _rail = document.createElement('div');
    _rail.id = 'blue-rail';
    var main = document.getElementById('idmp-main') || document.body;
    main.appendChild(_rail);
    return _rail;
  }

  // attach a long-press handler that distinguishes a TAP (short) from a long-press.
  function _bindPress(elm, onLong, onTap) {
    var t = null, fired = false;
    function start(ev) {
      if (ev.button != null && ev.button !== 0) return;
      fired = false; elm.classList.add('armed');
      t = setTimeout(function () { fired = true; elm.classList.remove('armed'); try { onLong(); } catch (e) { console.warn('§BLUE-LIVE press err ' + e.message); } }, _LONG);
    }
    function end() { if (t) { clearTimeout(t); t = null; } elm.classList.remove('armed'); if (!fired && onTap) { try { onTap(); } catch (e) {} } }
    function cancel() { if (t) { clearTimeout(t); t = null; } elm.classList.remove('armed'); }
    elm.addEventListener('pointerdown', start);
    elm.addEventListener('pointerup', end);
    elm.addEventListener('pointerleave', cancel);
    elm.addEventListener('pointercancel', cancel);
  }

  function _render() {
    _ensureRail();
    _rail.classList.toggle('blue', _blue);
    var groups = _blue ? _groups() : [];
    _rail.innerHTML = '';
    var lbl = document.createElement('span'); lbl.className = 'bf-label'; lbl.textContent = 'Blue future';
    _rail.appendChild(lbl);
    // WHITE anchor = official "now". Long-press: ENTER blue (not blue yet) OR discard-all (blue exists, confirm).
    var anchor = document.createElement('div'); anchor.className = 'bf-anchor';
    anchor.title = _blue
      ? (groups.length ? 'Long-press: discard the whole blue branch (destructive)' : 'Official tip')
      : 'Long-press to enter the blue future (a discardable sandbox)';
    _bindPress(anchor, function () { if (_blue) discardAll(false); else enter(); }, null);
    _rail.appendChild(anchor);
    if (!_blue) {
      var off = document.createElement('span'); off.className = 'bf-hint';
      off.textContent = 'Long-press the dot to explore a speculative future — edits stay private until you accept.';
      _rail.appendChild(off);
      return;
    }
    // BLUE dots — one per speculative group. Long-press: accept-up-to-here. Tap: Zoom the children.
    groups.forEach(function (g, i) {
      var d = document.createElement('div'); d.className = 'bf-dot2'; d.setAttribute('data-maxid', g.maxId);
      d.title = (i + 1) + '. ' + g.types.join('+') + '  ·  long-press = accept up to here · tap = zoom children';
      _bindPress(d, function () { acceptUpTo(g.maxId); }, function () { _zoomTap(g); });
      _rail.appendChild(d);
    });
    var hint = document.createElement('span'); hint.className = 'bf-hint';
    hint.textContent = groups.length
      ? (groups.length + ' speculative step' + (groups.length > 1 ? 's' : '') + ' — long-press a blue dot to accept, the white dot to discard')
      : 'Blue mode on — your edits are speculative (invisible to official). Run actions, then accept or discard.';
    _rail.appendChild(hint);
    console.log('§BLUE-LIVE render blue=' + _blue + ' branch=' + _branch + ' groups=' + groups.length);
  }

  function _zoomTap(g) {
    // best-effort Zoom: surface the blue children this group raised (leg 3). The host may render a panel;
    // here we log + dispatch so the chrome can open the child window.
    var KO = _KO(), db = _db(); if (!KO || !db) return;
    var kids = KO.replayOps(db, 'CREATE_DOCUMENT', _branch)
      .filter(function (o) { return o.gid === g.gid && o.parameters && o.parameters.table; })
      .map(function (o) { return { table: o.parameters.table, id: o.parameters.id || null, source: o.parameters.source_id || null }; });
    console.log('§BLUE-LIVE zoom-tap gid=' + g.gid + ' children=' + JSON.stringify(kids.map(function (k) { return k.table; })));
    try { window.dispatchEvent(new CustomEvent('bluefuture:zoom', { detail: { gid: g.gid, children: kids } })); } catch (e) {}
  }

  // public render hook so the host can repaint the rail after a blue commit (the chrome calls this).
  function refresh() { if (_blue) _render(); }

  window.BlueFuture = {
    enter: enter, acceptUpTo: acceptUpTo, discardAll: discardAll,
    readBranch: readBranch, groupMeta: groupMeta, isBlue: isBlue, branchId: branchId,
    zoomChildren: zoomChildren, stampExport: stampExport, refresh: refresh,
    groups: _groups
  };

  // mount the rail once the static shell (#idmp-main, line ~377) is parsed.
  function _init() { try { _render(); } catch (e) { console.warn('§BLUE-LIVE init ' + e.message); } }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _init); else _init();
  }
  console.log('§BLUE_FUTURE_LOADED v1 (item 0 browser legs — rim/banner/watermark + dot gestures + zoom)');
})();
