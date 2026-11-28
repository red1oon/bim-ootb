// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/MOBILE_PERF.md WO-24 "The phone runs a mission" + REVIEW LOG "SHAPE REVIEW". Witness: viewer/tests/witness_task_mission.js (W-TASK-MISSION).
// ISSUE: HQ computes, the phone receives. A mission file (v1) lists tasks in order, each aligned to ONE element with its walking path already computed;
//        the phone draws the path to the NEXT task, opens that task's card on arrival, takes the form, queues the report for HQ, moves on.
// Read the log after every run: §MISSION_LOAD  §MISSION_REFUSED  §MISSION_TASK_REFUSED  §MISSION_STEP  §MISSION_ARRIVE  §TASK_FORM  §TASK_REPORT  §MISSION_COMPLETE
// THE FILE: { v:1, mission:{ id, name, project, model:{ db, version } }, types:{ "<type id>":{ name, radius_m (number|null), form (ADUI JSON|null) } },
//             tasks:[ { id, documentno, type, summary, guid, storey, x, y, seq, path:[ [x,y,"storey"], … ] } ] }      x,y: IFC plane (task_arrival.js frame)
// ENTRY: URL  #mission=<url of a mission file>  (same origin, or a team-folder base the viewer is configured with — _teamBases below; any other origin
//        is refused with §MISSION_REFUSED origin=) and  APP.loadMission(obj). Loaded on demand by the `tasks` row of APP.lazy; nothing of it at boot.
// ONE CURRENT TASK: the lowest `seq` not finished (and not skipped, until all are). A._tasks holds ONLY that task (task_arrival.js judges arrival for the
//        current step; radius_m null = never by distance, QR (the task id) and "I'm here" still work).
// THE PATH is drawn by the room path's own drawer (viewer/route_line.js A.drawRoutePoints, owner 'mission'), z = the storey's floorZ from A.walkStoreyLevels.
// SHEET: the strip (top, thin) is NOT a sheet — like the walk controls it must stay while walking. The card + form + reason + code prompt are ONE sheet,
//        #mission-sheet (an adapter this module adds to A.sheets.adapters, viewer/panels.js), so the sheet manager's one-at-a-time / swipe / Back rules apply to it.
// HOOKS WITHOUT BOOT BYTES: the walk's arrival record A._taskArrivalShow (viewer/walk.js writes it) gets a setter here; the Site Camera's Share/Save buttons are
//        pointed at the form for the one photo it asked for and restored when the camera closes (_takePhoto).
// REPORT: { v:1, mission, task, type, guid, outcome:"done"|"cannot", reason, answers, photos:[names], model_version, by, at } as one JSON file + the photo files,
//        handed to A.queueHqFiles (below: the Send-to-HQ outbox of issues.js through A._hq, kept offline, flushed by A.flushHqOutbox when paired + online). Progress (finished tasks) is kept in IndexedDB
//        'bim_mission_progress' (a separate database: the outbox's own database is version 1 and must not be reopened at another version).
(function (root) {
  'use strict';

  // ── the mission file's validator: ONE owner (WO-25 note 3: moved here from inside setupTaskMission so HQ's processor can call it without loading a mission) ──────────────────
  // TaskMission.validate(obj, levels) -> { ok, why, tasks, refused:[{id,why}], types, meta } = exactly what loadMission would load / refuse. `levels` = A.walkStoreyLevels ([{storey, floorZ}]); empty = storeys are not judged.
  function log(s) { console.log(s); }
  function _num(v) { return typeof v === 'number' && isFinite(v); }
  function _str(v) { return typeof v === 'string' && v !== ''; }
  function floorZ(levels, storey) {
    var lv = levels || [];
    for (var i = 0; i < lv.length; i++) if (String(lv[i].storey) === String(storey)) return lv[i].floorZ;
    return null;
  }
  function validate(obj, levels) {
    levels = levels || [];
    var out = { ok: false, why: '', tasks: [], refused: [], types: {}, meta: null };
    if (!obj || typeof obj !== 'object' || obj.v !== 1) { out.why = 'v'; return out; }
    var m = obj.mission;
    if (!m || !_str(m.id) || !_str(m.name) || !m.model || typeof m.model !== 'object') { out.why = 'mission'; return out; }
    if (!obj.types || typeof obj.types !== 'object' || Array.isArray(obj.types)) { out.why = 'types'; return out; }
    if (!Array.isArray(obj.tasks)) { out.why = 'tasks'; return out; }
    Object.keys(obj.types).forEach(function (k) {
      var t = obj.types[k];
      if (t && typeof t === 'object' && _str(t.name) && (t.radius_m === null || _num(t.radius_m))) out.types[k] = t;
    });
    var seen = {};
    obj.tasks.forEach(function (t, i) {
      var id = t && _str(t.id) ? t.id : ('#' + i), why = '';
      if (!t || typeof t !== 'object') why = 'task';
      else if (!_str(t.id)) why = 'id';
      else if (seen[t.id]) why = 'id_duplicate';
      else if (!_str(t.type) || !out.types[t.type]) why = 'type';
      else if (!_str(t.guid)) why = 'guid';
      else if (!_str(t.storey)) why = 'storey';
      else if (levels.length && floorZ(levels, t.storey) == null) why = 'storey_unknown';
      else if (!_num(t.x)) why = 'x';
      else if (!_num(t.y)) why = 'y';
      else if (!_num(t.seq)) why = 'seq';
      else if (!Array.isArray(t.path) || t.path.length < 2) why = 'path';
      else {
        for (var p = 0; p < t.path.length && !why; p++) {
          var q = t.path[p];
          if (!Array.isArray(q) || !_num(q[0]) || !_num(q[1])) why = 'path_point';
          else if (!_str(q[2]) || (levels.length && floorZ(levels, q[2]) == null)) why = 'path_storey:' + q[2];
        }
      }
      if (why) { out.refused.push({ id: id, why: why }); log('§MISSION_TASK_REFUSED task=' + id + ' why=' + why); return; }   // R2 marker
      seen[t.id] = 1; out.tasks.push(t);
    });
    out.tasks.sort(function (a, b) { return a.seq - b.seq; });
    out.ok = true; out.meta = m;
    return out;
  }
  var TaskMission = { validate: validate };
  if (root) root.TaskMission = TaskMission;

  function setupTaskMission(A) {
    if (A.loadMission) return;
    var M = null;            // the loaded mission (see _load)
    var CAM = null;          // photo-capture watcher
    var QR = null;           // running camera scan { stream, raf }

    // the walk records an arrival by assigning A._taskArrivalShow (walk.js, WO-13); the mission opens the card on that assignment
    var _arrived = null;
    Object.defineProperty(A, '_taskArrivalShow', { configurable: true, get: function () { return _arrived; }, set: function (v) { _arrived = v; if (M) _onArrive(v); } });
    // the card / form is one phone sheet: the sheet manager (A.sheets, panels.js) learns it through its adapter list
    if (A.sheets && A.sheets.adapters) A.sheets.adapters.push({ id: 'mission-sheet', get: function () { return document.getElementById('mission-sheet'); }, close: function () { A.missionSheetClosed(); } });
    // reports go into the Send-to-HQ outbox of issues.js (A._hq): the same queue and flush as the Issue Log bundle; returns { id, sent, reason }
    A.queueHqFiles = async function (files) {
      var qid = await A._hq.outbox('put', { files: files }), fr = { sent: [], reason: '' };
      console.log('§HQ_QUEUE id=' + qid + ' files=' + files.length + ' (mission report)');
      try { fr = await A.flushHqOutbox(); } catch (e) { fr.reason = 'error'; }
      return { id: qid, sent: fr.sent.indexOf(qid) >= 0, reason: fr.reason || '' };
    };
    // the team-folder bases this viewer is configured with (?pipe=, or the paired team's GitHub repo). The public default is EMPTY: unpaired = [] = same origin only.
    async function _teamBases() {
      var out = [], pipe = A._hq.pipeUrl(), cfg = (await A._hq.kv('cfg')) || {};
      if (pipe) out.push(pipe.replace(/\/+$/, '') + '/');
      if (cfg.owner && cfg.repo) { out.push('https://raw.githubusercontent.com/' + cfg.owner + '/' + cfg.repo + '/'); out.push('https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/'); }
      return out;
    }
    function _safe(s) { return String(s == null ? '' : s).replace(/[^A-Za-z0-9_-]+/g, '_'); }
    function _status(t) { if (A.status) A.status.textContent = t; }

    // ── progress store ───────────────────────────────────────────────────────────────────────────────────────────────
    function _idb() {
      return new Promise(function (res) {
        try {
          var r = indexedDB.open('bim_mission_progress', 1);
          r.onupgradeneeded = function () { r.result.createObjectStore('m', { keyPath: 'id' }); };
          r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); };
        } catch (e) { res(null); }
      });
    }
    function _put(rec) { return _idb().then(function (db) { return !db ? false : new Promise(function (res) {
      var t = db.transaction('m', 'readwrite'); t.objectStore('m').put(rec); t.oncomplete = function () { db.close(); res(true); }; t.onerror = function () { db.close(); res(false); }; }); }); }
    function _get(id) { return _idb().then(function (db) { return !db ? null : new Promise(function (res) {
      var q = db.transaction('m').objectStore('m').get(id); q.onsuccess = function () { db.close(); res(q.result || null); }; q.onerror = function () { db.close(); res(null); }; }); }); }
    function _save() { return M ? _put({ id: M.id, mission: M.obj, finished: M.finished, skipped: M.skipped }) : Promise.resolve(false); }

    // ── validation: ONE owner, TaskMission.validate (module level, above); loadMission calls it ──
    function _floorZ(storey) { return floorZ(A.walkStoreyLevels, storey); }
    function _validate(obj) { return TaskMission.validate(obj, A.walkStoreyLevels); }
    function _modelName() {
      var db = new URLSearchParams(location.search).get('db') || A.DB_URL || '';
      return String(db).split('/').pop().replace(/\.db$/i, '');
    }

    // ── the mission ──────────────────────────────────────────────────────────────────────────────────────────────────
    function _dbReady() {
      return new Promise(function (res) { var n = 0; (function poll() {
        if (A.db && A.dbQuery && A.guidMap && Object.keys(A.guidMap).length && A.streaming === false) return res(true);
        if (++n > 480) return res(!!A.db); setTimeout(poll, 250); })(); });
    }
    A.loadMission = async function (obj, opts) {
      await _dbReady();
      if (!(A.walkStoreyLevels && A.walkStoreyLevels.length) && typeof A.cacheStoreyLevels === 'function') A.cacheStoreyLevels();
      var v = _validate(obj);
      if (!v.ok) { log('§MISSION_LOAD tasks=0 refused=-1 model_match=false invalid=' + v.why); _status('Mission file is not valid (' + v.why + ').'); return null; }
      var saved = await _get(v.meta.id);
      var want = String(v.meta.model.db || '').split('/').pop().replace(/\.db$/i, '');
      var match = want !== '' && want === _modelName();
      _stopQr(); _clearSheet();
      _arrived = null;
      M = { id: v.meta.id, name: v.meta.name, obj: obj, types: v.types, tasks: v.tasks, finished: {}, skipped: [], cur: null, arrived: null,
        model_version: v.meta.model.version == null ? null : v.meta.model.version, model_match: match, url: (opts && opts.url) || null };
      if (saved) { v.tasks.forEach(function (t) { if (saved.finished && saved.finished[t.id]) M.finished[t.id] = saved.finished[t.id]; });
        M.skipped = (saved.skipped || []).filter(function (id) { return v.tasks.some(function (t) { return t.id === id; }); }); }
      log('§MISSION_LOAD tasks=' + v.tasks.length + ' refused=' + v.refused.length + ' model_match=' + match + ' mission=' + M.id +
        ' types=' + Object.keys(v.types).length + ' restored=' + Object.keys(M.finished).length +
        (v.refused.length ? ' refused_tasks=' + v.refused.map(function (r) { return r.id + ':' + r.why; }).join(',') : ''));
      _strip(true);
      _step();
      _save();
      return M;
    };

    A.loadMissionFromUrl = async function (url) {
      var u; try { u = new URL(url, location.href); } catch (e) { log('§MISSION_REFUSED origin=invalid url=' + String(url).slice(0, 80)); _status('Mission link is not valid.'); return null; }
      var ok = u.origin === location.origin;
      if (!ok) { var bases = await _teamBases(); ok = bases.some(function (b) { return u.href.indexOf(b) === 0; }); }
      if (!ok) { log('§MISSION_REFUSED origin=' + u.origin + ' (not this page\'s origin and not the configured team folder)'); _status('Mission link refused: another origin.'); return null; }
      var obj = null, via = 'net';
      try { var r = await fetch(u.href, { cache: 'no-store' }); if (!r.ok) throw new Error('http ' + r.status); obj = await r.json(); }
      catch (e) {
        var last = await _get('@url:' + u.href), rec = last && await _get(last.mission_id);
        if (rec && rec.mission) { obj = rec.mission; via = 'stored'; log('§MISSION_FETCH_FAIL ' + (e && e.message) + ' — using the stored copy'); }
        else { log('§MISSION_FETCH_FAIL ' + (e && e.message) + ' — nothing stored'); _status('Mission file could not be loaded.'); return null; }
      }
      var m = await A.loadMission(obj, { url: u.href, via: via });
      if (m && via === 'net') _put({ id: '@url:' + u.href, mission_id: m.id });
      return m;
    };

    function _current() {
      var open = M.tasks.filter(function (t) { return !M.finished[t.id]; });
      if (!open.length) return null;
      var avail = open.filter(function (t) { return M.skipped.indexOf(t.id) < 0; });
      if (!avail.length) { M.skipped = []; avail = open; }
      return avail[0];
    }
    function _counts() {
      var d = 0, c = 0; M.tasks.forEach(function (t) { var f = M.finished[t.id]; if (f) { if (f.outcome === 'done') d++; else c++; } });
      return { done: d, cannot: c };
    }
    function _pathPoints(t) { return t.path.map(function (q) { var z = _floorZ(q[2]); return { x: q[0], y: q[1], z: z == null ? 0 : z }; }); }

    function _step() {
      A.clearRoutePoints && A.clearRoutePoints('mission');
      var t = M.cur = _current(); M.arrived = null; A._taskArrivalState = {};
      if (!t) {
        A._tasks = []; var c = _counts();
        _stripText('Mission complete — ' + c.done + ' done, ' + c.cannot + ' can\'t proceed'); _stripButtons(false);
        log('§MISSION_COMPLETE mission=' + M.id + ' done=' + c.done + ' cannot=' + c.cannot + ' of=' + M.tasks.length);
        return;
      }
      var type = M.types[t.type];
      A._tasks = [{ id: t.id, radius_m: type.radius_m, qr: t.id, elements: [{ guid: t.guid, storey: t.storey, x: t.x, y: t.y }] }];   // R1 marker: current task only
      var pts = _pathPoints(t), drawn = A.drawRoutePoints ? A.drawRoutePoints(pts, pts, { owner: 'mission' }) : 0;
      var n = M.tasks.indexOf(t) + 1;
      _stripText('task ' + n + ' of ' + M.tasks.length + ' — ' + (t.summary || t.documentno || t.id)); _stripButtons(true);
      log('§MISSION_STEP n=' + n + ' of=' + M.tasks.length + ' task=' + t.id + ' path_pts=' + t.path.length + ' meshes=' + drawn);
    }

    // ── arrival ──────────────────────────────────────────────────────────────────────────────────────────────────────
    function _onArrive(show) {
      var s = Array.isArray(show) ? show[0] : show;
      if (!M || !M.cur || !s) return;   // A._tasks holds only the current task, so an arrival is always for it
      M.arrived = { by: s.by, guid: s.guid, d_m: s.d_m };
      log('§MISSION_ARRIVE task=' + M.cur.id + ' by=' + s.by + ' d_m=' + (s.d_m == null ? 'null' : s.d_m.toFixed(3)));
      _view('card');
    }
    function _arriveBy(kind, payload) {
      if (!M || !M.cur || !window.TaskArrival) return false;
      var r = window.TaskArrival.arriveBy(kind, payload, A._tasks, A._taskArrivalState || {});
      A._taskArrivalState = r.state;
      if (r.show.length) { _onArrive(r.show); return true; }
      return false;
    }

    // ── the strip (top, not a sheet) ───────────────────────────────────────────────────────────────────────────────────
    var BTN = 'flex:1 1 auto;min-height:40px;padding:6px 10px;border:0;border-radius:8px;background:#4fc3f7;color:#000;font-size:14px;font-weight:600;';
    function _btn(parent, id, text, fn, css) { var b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = text; b.style.cssText = BTN + (css || ''); b.onclick = fn; parent.appendChild(b); return b; }
    function _strip(show) {
      var el = document.getElementById('mission-strip');
      if (!el) {
        el = document.createElement('div'); el.id = 'mission-strip';
        el.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px) + 6px);left:8px;right:56px;z-index:30;background:rgba(20,20,24,.92);color:#fff;border-radius:10px;padding:8px;font:14px sans-serif;display:none;';
        var tx = document.createElement('div'); tx.id = 'mission-strip-text'; tx.style.cssText = 'margin-bottom:6px;font-weight:600;'; el.appendChild(tx);
        var warn = document.createElement('div'); warn.id = 'mission-strip-warn'; warn.style.cssText = 'color:#ffb74d;font-size:12px;margin-bottom:4px;display:none;'; el.appendChild(warn);
        var row = document.createElement('div'); row.id = 'mission-strip-row'; row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;'; el.appendChild(row);
        _btn(row, 'mission-walk', 'Start walk', function () { if (!A.walkModeActive && A.toggleWalkMode) A.toggleWalkMode(); });
        _btn(row, 'mission-here', 'I\'m here', function () { _arriveBy('manual', M && M.cur && M.cur.id); });
        _btn(row, 'mission-scan', 'Scan QR', function () { _view('scan'); });
        _btn(row, 'mission-skip', 'Skip', function () { if (!M || !M.cur) return; log('§MISSION_SKIP task=' + M.cur.id); M.skipped.push(M.cur.id); _clearSheet(); _save(); _step(); }, 'background:#555;color:#fff;');
        _btn(row, 'mission-cant', 'Can\'t proceed', function () { _view('cant'); }, 'background:#ef9a9a;');
        document.body.appendChild(el);
      }
      el.style.display = show ? 'block' : 'none';
      var w = document.getElementById('mission-strip-warn');
      if (w) { w.style.display = M && !M.model_match ? 'block' : 'none'; w.textContent = M && !M.model_match ? 'This mission names another model (' + (M.obj.mission.model.db || '?') + ').' : ''; }
    }
    function _stripText(t) { var e = document.getElementById('mission-strip-text'); if (e) e.textContent = t; }
    function _stripButtons(on) { var r = document.getElementById('mission-strip-row'); if (r) r.style.display = on ? 'flex' : 'none'; }

    // ── the sheet: card / form / cant / scan ─────────────────────────────────────────────────────────────────────────
    function _sheet() {
      var el = document.getElementById('mission-sheet');
      if (!el) {
        el = document.createElement('div'); el.id = 'mission-sheet';
        el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:70vh;overflow:auto;z-index:1500;box-sizing:border-box;padding:18px 14px calc(14px + env(safe-area-inset-bottom,0px));background:#1c1c20;color:#eee;font:15px sans-serif;border-radius:14px 14px 0 0;box-shadow:0 -4px 18px rgba(0,0,0,.5);display:none;';
        document.body.appendChild(el);
      }
      return el;
    }
    function _clearSheet() { _stopQr(); var el = document.getElementById('mission-sheet'); if (el) { el.style.display = 'none'; el.removeAttribute('data-view'); el.innerHTML = ''; } }
    A.missionSheetClosed = function () { _stopQr(); var el = document.getElementById('mission-sheet'); if (el) el.style.display = 'none'; };
    function _h(parent, tag, css, text) { var e = document.createElement(tag); e.style.cssText = css || ''; if (text != null) e.textContent = text; parent.appendChild(e); return e; }

    function _view(name) {
      if (!M || !M.cur) return;
      _stopQr();
      var t = M.cur, type = M.types[t.type], el = _sheet(); el.innerHTML = ''; el.setAttribute('data-view', name);
      var head = _h(el, 'div', 'font-size:13px;color:#9ad;margin-bottom:2px;', (t.documentno ? t.documentno + ' · ' : '') + type.name);
      _h(el, 'div', 'font-size:17px;font-weight:700;margin-bottom:10px;', t.summary || t.id);
      var acts = document.createElement('div'); acts.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;';
      if (name === 'card') {
        _btn(acts, 'mission-open-form', 'Fill in the form', function () { _view('form'); });
        _btn(acts, 'mission-card-cant', 'Can\'t proceed', function () { _view('cant'); }, 'background:#ef9a9a;');
        _btn(acts, 'mission-card-close', 'Later', function () { A.missionSheetClosed(); }, 'background:#555;color:#fff;');
        el.appendChild(acts);
      } else if (name === 'form') {
        var pl = window.TaskForm.plan(type), host = document.createElement('div'); host.id = 'mission-form'; el.appendChild(host);
        var form = window.TaskForm.mount(host, pl, { typeId: t.type, photoPrefix: 'photo', takePhoto: _takePhoto });
        var msg = _h(el, 'div', 'color:#ef9a9a;font-size:13px;min-height:16px;margin-top:6px;'); msg.id = 'mission-form-msg';
        _btn(acts, 'mission-done', 'Done', function () {
          var chk = form.check();
          if (!chk.ok) { msg.textContent = 'Required: ' + chk.missing.join(', '); log('§TASK_FORM_REFUSED task=' + t.id + ' missing=' + chk.missing.join(',')); return; }
          _finish('done', '', form.collect(), form.photoFiles());
        });
        _btn(acts, 'mission-form-cant', 'Can\'t proceed', function () { _view('cant'); }, 'background:#ef9a9a;');
        _btn(acts, 'mission-form-back', 'Back', function () { _view('card'); }, 'background:#555;color:#fff;');
        el.appendChild(acts);
      } else if (name === 'cant') {
        _h(el, 'div', 'margin-bottom:4px;', 'Why can\'t this be done?');
        var ta = _h(el, 'textarea', 'width:100%;box-sizing:border-box;min-height:80px;padding:8px;border-radius:8px;border:1px solid #666;background:#111;color:#eee;font-size:15px;'); ta.id = 'mission-reason';
        var cm = _h(el, 'div', 'color:#ef9a9a;font-size:13px;min-height:16px;margin-top:6px;'); cm.id = 'mission-cant-msg';
        _btn(acts, 'mission-cant-send', 'Send', function () {
          var r = ta.value.trim(); if (!r) { cm.textContent = 'A reason is needed.'; return; }
          _finish('cannot', r, {}, []);
        });
        _btn(acts, 'mission-cant-back', 'Back', function () { A.missionSheetClosed(); }, 'background:#555;color:#fff;');
        el.appendChild(acts);
      } else if (name === 'scan') {
        _h(el, 'div', 'margin-bottom:4px;', 'Scan the task\'s QR code, or type the code.');
        var vid = _h(el, 'video', 'width:100%;max-height:30vh;background:#000;border-radius:8px;display:none;'); vid.id = 'mission-scan-video'; vid.setAttribute('playsinline', '');
        var inp = _h(el, 'input', 'width:100%;box-sizing:border-box;min-height:44px;padding:8px;margin-top:8px;border-radius:8px;border:1px solid #666;background:#111;color:#eee;font-size:15px;'); inp.id = 'mission-scan-code'; inp.type = 'text';
        var sm = _h(el, 'div', 'color:#ef9a9a;font-size:13px;min-height:16px;margin-top:6px;'); sm.id = 'mission-scan-msg';
        var check = function (code) {
          if (_arriveBy('qr', String(code || '').trim())) return true;
          sm.textContent = 'Not this task\'s code.'; log('§MISSION_QR_REFUSED task=' + M.cur.id); return false;
        };
        _btn(acts, 'mission-scan-check', 'Check', function () { check(inp.value); });
        _btn(acts, 'mission-scan-back', 'Back', function () { A.missionSheetClosed(); }, 'background:#555;color:#fff;');
        el.appendChild(acts);
        _startQr(vid, function (code) { return check(code); });
      }
      el.style.display = 'block';
      log('§MISSION_VIEW task=' + t.id + ' view=' + name);
    }

    // camera QR: BarcodeDetector + getUserMedia when the browser has both; otherwise only the typed code (the honest fallback)
    function _startQr(video, onCode) {
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { log('§MISSION_QR camera=unsupported (typed code only)'); return; }
      var det; try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { return; }
      var me = QR = { stream: null, raf: 0, on: true };
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (s) {
        if (QR !== me) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        me.stream = s; video.srcObject = s; video.style.display = 'block'; if (video.play) video.play();
        (function tick() { if (!me.on) return;
          det.detect(video).then(function (codes) { if (codes && codes.length && onCode(codes[0].rawValue || '')) return; if (me.on) me.raf = requestAnimationFrame(tick); })
            .catch(function () { if (me.on) me.raf = requestAnimationFrame(tick); }); })();
      }).catch(function () { log('§MISSION_QR camera=denied (typed code only)'); });
    }
    function _stopQr() { if (!QR) return; QR.on = false; if (QR.raf) cancelAnimationFrame(QR.raf); try { if (QR.stream) QR.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} QR = null; }

    // ── photo: the Site Camera path (viewer/sitecam.js). For the one photo the form asked for, the camera's Share and Save buttons hand the photo to the
    //    form instead of the Issue Log (the same hand-over shape as the clash snag); both are restored when the camera closes, however it closes. ──
    function _takePhoto(cb) {
      if (typeof A.openSiteCamera !== 'function') { _status('Camera is not available.'); return; }
      var sheet = document.getElementById('mission-sheet'), strip = document.getElementById('mission-strip'), keepS = A.shareSitePhoto, keepD = A.downloadSitePhoto;
      if (sheet) sheet.style.display = 'none'; if (strip) strip.style.display = 'none';
      var restore = function () { if (CAM) { clearInterval(CAM); CAM = null; } A.shareSitePhoto = keepS; A.downloadSitePhoto = keepD; if (sheet) sheet.style.display = 'block'; if (strip) strip.style.display = 'block'; };
      A.shareSitePhoto = A.downloadSitePhoto = async function () {
        var blob = await A._getMarkupBlob(); A.closeSitePreview(); A.closeSiteCamera(); restore();
        log('§MISSION_PHOTO bytes=' + (blob ? blob.size : 0)); cb(blob);
      };
      Promise.resolve(A.openSiteCamera()).then(function () {
        var ov = document.getElementById('site-cam-overlay');
        if (!ov || !ov.classList.contains('active')) { restore(); return; }   // the camera could not open
        CAM = setInterval(function () { if (!ov.classList.contains('active')) restore(); }, 300);   // closed any other way (Back, ✕): bring the form back
      });
    }

    // ── the report ───────────────────────────────────────────────────────────────────────────────────────────────────
    async function _finish(outcome, reason, answers, photoFiles) {
      var t = M.cur;
      if (typeof A.queueHqFiles !== 'function') { _status('Send to HQ is not available.'); log('§TASK_REPORT task=' + t.id + ' outcome=' + outcome + ' photos=' + photoFiles.length + ' queued=false'); return; }
      var rep = { v: 1, mission: M.id, task: t.id, type: t.type, guid: t.guid, outcome: outcome, reason: reason, answers: answers,
        photos: photoFiles.map(function (p) { return p.name; }), model_version: M.model_version, by: M.arrived ? M.arrived.by : null, at: new Date().toISOString() };
      var base = 'mission_' + _safe(M.id).slice(0, 24) + '_' + _safe(t.documentno || t.id);
      var files = [new File([JSON.stringify(rep, null, 1)], base + '_report.json', { type: 'application/json' })];
      photoFiles.forEach(function (p) { files.push(new File([p.blob], base + '_' + p.name, { type: p.blob.type || 'image/jpeg' })); });
      var q = null; try { q = await A.queueHqFiles(files); } catch (e) { log('§TASK_REPORT_ERR ' + (e && e.message)); }
      log('§TASK_REPORT task=' + t.id + ' outcome=' + outcome + ' photos=' + photoFiles.length + ' queued=' + !!(q && q.id));
      if (!q || !q.id) { _status('Could not keep the report on this phone.'); return; }
      M.finished[t.id] = { outcome: outcome, at: rep.at };
      await _save(); _clearSheet(); _step();
    }

    // state for witnesses and debugging: plain data, no DOM
    A.missionState = function () {
      if (!M) return null;
      var c = _counts();
      return { id: M.id, step: M.cur ? M.tasks.indexOf(M.cur) + 1 : null, of: M.tasks.length, task: M.cur ? M.cur.id : null, done: c.done, cannot: c.cannot,
        finished: Object.keys(M.finished), complete: !M.cur, model_match: M.model_match };
    };
    log('§MISSION_READY');
  }

  if (root) root.setupTaskMission = setupTaskMission;
})(typeof window !== 'undefined' ? window : null);
