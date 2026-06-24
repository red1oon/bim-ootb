// schedule_editor_ui.js — §SE-1 step 1+2: the MSP-grade Gantt editor's NEW-TAB surface (§SE-C).
//
// A SEPARATE surface from the TM what-if showpiece: WBS outline (collapsible) on the left, dependency
// view/EDIT on the right. Pure DOM glue over viewer/schedule_author.js (window.ScheduleAuthor) — all
// graph logic + the cycle guard live in that node-tested engine (W-SCHED-EDIT). This file only loads a
// building DB, renders the engine's reads, and routes user edits back through the engine's verbs.
//
// DB resolution mirrors config.js: ?db= param → OCI bucket base → buildings/Duplex_extracted.db.
// Each successful edit broadcasts on the already-live BroadcastChannel('bim_4d') (main.js S240 listens)
// — the §SE-D edit→watch rail; an open viewer reacts, a later slice teaches it to re-fold.
(function (global) {
  'use strict';

  var SA = function () { return global.ScheduleAuthor; };
  var db = null, schedId = null, sync = null;
  var collapsed = {};   // task_id -> true when its subtree is collapsed
  var critSet = {};     // task_id -> true after a CPM run (drives the red rail + bold links)

  function $(id) { return document.getElementById(id); }
  function status(msg) { var s = $('se-status'); if (s) s.textContent = msg; console.log('§SE_UI ' + msg); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  // UTC day arithmetic (timezone-independent, matches the engine's _addDays).
  function addDays(base, n) { return new Date(Date.parse(base + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

  // ── DB resolution (config.js parity) ─────────────────────────────────────────
  function resolveDbUrl() {
    var params = new URLSearchParams(location.search);
    var ociMatch = location.href.match(/(https:\/\/objectstorage\.[^/]+\/n\/[^/]+\/b\/[^/]+\/o\/)/);
    var base = ociMatch ? ociMatch[1] : '';
    var last = null; try { last = localStorage.getItem('pwa_last_db'); } catch (e) {}
    return params.get('db') || last || (base ? base + 'Duplex_extracted.db' : 'buildings/Duplex_extracted.db');
  }

  // §SE-4: emit each signed op on the shared bus so peer surfaces (a 2nd editor tab, the Viewer TM)
  // replay it and re-fold live ("both are folds of one log"). Routed through ScheduleSync.
  function broadcast(detail) {
    if (sync) sync.emit(Object.assign({ schedule: schedId }, detail));
  }

  // a peer surface broadcast an op → ScheduleSync already replayed it on our db; re-render to reflect it.
  function onSynced(op, res) {
    if (!res || res.ok === false) { status('↻ peer ' + op.op + ' (not applicable here)'); return; }
    if (op.op === 'cpm') {
      critSet = {}; (res.criticalIds || []).forEach(function (id) { critSet[id] = true; });
      var o = $('se-cpm-out');
      if (o && res.projectDuration != null) o.textContent = 'project ' + res.projectDuration + 'd · critical ' +
        (res.criticalIds || []).length + '/' + (res.tasks || []).length + ' (synced)';
      renderWbs(); renderDeps(); renderGantt();
    } else {
      status('↻ synced ' + op.op + ' from peer');
      refreshFold();                                   // invalidate stale CPM + re-render all
    }
  }

  // ── STEP 1: collapsible WBS outline ──────────────────────────────────────────
  function renderWbs() {
    var host = $('se-wbs'); if (!host) return;
    host.innerHTML = '';
    var roots = SA().wbsTree(db, schedId);
    if (!roots.length) { host.appendChild(el('div', 'se-empty', 'No schedule tasks.')); return; }
    function walk(node, depth) {
      var row = el('div', 'se-wbs-row' + (node.critical ? ' se-critical' : ''));
      row.style.paddingLeft = (depth * 18 + 6) + 'px';
      row.dataset.task = node.id;
      var hasKids = node.children && node.children.length;
      var tw = el('span', 'se-twisty', hasKids ? (collapsed[node.id] ? '▸' : '▾') : ' ');
      if (hasKids) tw.onclick = function () { collapsed[node.id] = !collapsed[node.id]; renderWbs(); };
      row.appendChild(tw);
      var nm = el('span', 'se-wbs-name' + (node.isSummary ? ' se-summary' : ''), node.name);
      row.appendChild(nm);
      if (!node.isSummary && node.guidCount) row.appendChild(el('span', 'se-badge', node.guidCount + ' el'));
      if (!node.isSummary && node.totalFloat != null) {
        var tf = parseFloat(node.totalFloat);
        row.appendChild(el('span', 'se-float ' + (tf <= 0 ? 'crit' : 'slack'),
          tf <= 0 ? 'critical' : ('float ' + tf + 'd')));
      }
      if (node.start) row.appendChild(el('span', 'se-dates', node.start + (node.finish ? ' → ' + node.finish : '')));
      host.appendChild(row);
      if (hasKids && !collapsed[node.id]) node.children.forEach(function (c) { walk(c, depth + 1); });
    }
    roots.forEach(function (r) { walk(r, 0); });
  }

  // ── STEP 2: dependency view + edit ───────────────────────────────────────────
  function taskOptions() {
    // Leaf tasks (real work) are the linkable nodes; summaries roll up.
    var roots = SA().wbsTree(db, schedId), leaves = [];
    (function flat(ns) { ns.forEach(function (n) { if (!n.isSummary) leaves.push(n); flat(n.children || []); }); })(roots);
    return leaves;
  }

  function renderDeps() {
    var host = $('se-deps'); if (!host) return;
    host.innerHTML = '';
    var deps = SA().listDependencies(db, schedId);
    if (!deps.length) { host.appendChild(el('div', 'se-empty', 'No dependencies yet — add one below.')); }
    deps.forEach(function (d) {
      // a "critical link" = both endpoints critical after a CPM run.
      var crit = critSet[d.predId] && critSet[d.succId];
      var row = el('div', 'se-dep-row' + (crit ? ' se-dep-crit' : ''));
      row.appendChild(el('span', 'se-dep-pred', d.predName));
      // type selector
      var sel = el('select', 'se-dep-type');
      SA().SEQ_TYPES.forEach(function (t) { var o = el('option', null, t); o.value = t; if (t === d.type) o.selected = true; sel.appendChild(o); });
      sel.onchange = function () {
        var r = SA().updateDependency(db, d.predId, d.succId, { type: sel.value });
        if (r.ok) { broadcast({ op: 'retype', predId: d.predId, succId: d.succId, value: sel.value }); status('Retyped ' + d.predName + ' → ' + d.succName + ' = ' + sel.value); refreshFold(); }
      };
      row.appendChild(sel);
      // lag input
      var lag = el('input', 'se-dep-lag'); lag.type = 'number'; lag.value = d.lag; lag.title = 'lag (days)';
      lag.onchange = function () {
        var r = SA().updateDependency(db, d.predId, d.succId, { lag: lag.value });
        if (r.ok) { broadcast({ op: 'lag', predId: d.predId, succId: d.succId, value: r.lag }); status('Lag ' + d.predName + ' → ' + d.succName + ' = ' + r.lag + 'd'); refreshFold(); }
      };
      row.appendChild(lag);
      row.appendChild(el('span', 'se-dep-arrow', '→'));
      row.appendChild(el('span', 'se-dep-succ', d.succName));
      var del = el('button', 'se-dep-del', '✕'); del.title = 'remove link';
      del.onclick = function () {
        SA().removeDependency(db, d.predId, d.succId);
        broadcast({ op: 'remove', predId: d.predId, succId: d.succId });
        status('Removed ' + d.predName + ' → ' + d.succName); refreshFold();
      };
      row.appendChild(del);
      host.appendChild(row);
    });
    // refresh the add-form selects
    fillAddForm();
  }

  function fillAddForm() {
    var leaves = taskOptions();
    ['se-add-pred', 'se-add-succ'].forEach(function (id) {
      var s = $(id); if (!s) return; var keep = s.value; s.innerHTML = '';
      leaves.forEach(function (n) { var o = el('option', null, n.name); o.value = n.id; s.appendChild(o); });
      if (keep) s.value = keep;
    });
    var ts = $('se-add-type');
    if (ts && !ts.options.length) SA().SEQ_TYPES.forEach(function (t) { var o = el('option', null, t); o.value = t; ts.appendChild(o); });
  }

  // ── STEP 5: interactive Gantt — bars on a day-axis, drag-to-reschedule + drag-to-link ────────
  function renderGantt() {
    var host = $('se-gantt'); if (!host) return;
    host.innerHTML = '';
    var leaves = taskOptions().filter(function (n) { return n.start && n.finish; });
    if (!leaves.length) {
      host.appendChild(el('div', 'gantt-empty', 'No dated tasks — schedule the WBS first, then drag the bars here.'));
      return;
    }
    // shared day-axis over all bars
    var min = leaves[0].start, max = leaves[0].finish;
    leaves.forEach(function (n) { if (n.start < min) min = n.start; if (n.finish > max) max = n.finish; });
    var totalDays = Math.max(1, daysBetween(min, max));
    var labelW = 152;
    var chartW = Math.max(240, (host.clientWidth || 700) - labelW - 8);
    var pxPerDay = chartW / totalDays;

    // axis: a tick roughly every ~7 days (snap to weeks), labelled with the date.
    var axis = el('div', 'g-axis');
    var stepDays = Math.max(7, Math.ceil(totalDays / 8 / 7) * 7);
    for (var d = 0; d <= totalDays; d += stepDays) {
      var tick = el('div', 'g-tick', addDays(min, d));
      tick.style.left = (d * pxPerDay) + 'px';
      axis.appendChild(tick);
    }
    host.appendChild(axis);

    leaves.forEach(function (n) {
      var dur = daysBetween(n.start, n.finish);
      var off = daysBetween(min, n.start);
      var row = el('div', 'g-row');
      row.appendChild(el('div', 'g-label', n.name));
      var track = el('div', 'g-track');
      var bar = el('div', 'g-bar' + (n.critical ? ' crit' : ''), dur + 'd');
      bar.style.left = (off * pxPerDay) + 'px';
      bar.style.width = Math.max(8, dur * pxPerDay) + 'px';
      bar.dataset.task = n.id;
      bar.title = n.name + '  ' + n.start + ' → ' + n.finish + (n.totalFloat != null ? '  (float ' + n.totalFloat + 'd)' : '');
      _wireBarDrag(bar, n, off, pxPerDay);
      var handle = el('div', 'g-handle', '▸');
      handle.title = 'drag onto another bar to link (FS)';
      _wireLinkDrag(handle, n);
      bar.appendChild(handle);
      track.appendChild(bar);
      row.appendChild(track);
      host.appendChild(row);
    });
    console.log('§SE_GANTT bars=' + leaves.length + ' span=' + min + '..' + max + ' days=' + totalDays);
  }

  // drag a bar horizontally → reschedule (snap to whole days, duration locked).
  function _wireBarDrag(bar, node, offDays, pxPerDay) {
    bar.addEventListener('mousedown', function (e) {
      if (e.target.className === 'g-handle') return;       // handle owns link-drag
      e.preventDefault();
      var startX = e.clientX, origLeft = offDays * pxPerDay;
      bar.classList.add('dragging');
      function mv(ev) { bar.style.left = (origLeft + (ev.clientX - startX)) + 'px'; }
      function up(ev) {
        document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up);
        bar.classList.remove('dragging');
        var deltaDays = Math.round((ev.clientX - startX) / pxPerDay);
        if (deltaDays === 0) { bar.style.left = origLeft + 'px'; return; }
        var newStart = addDays(node.start, deltaDays);
        var r = SA().moveTask(db, node.id, newStart);
        if (r.ok) {
          broadcast({ op: 'move', taskId: node.id, start: r.start, finish: r.finish });
          status('Moved ' + node.name + ' ' + (deltaDays > 0 ? '+' : '') + deltaDays + 'd → ' + r.start);
          refreshFold();                                   // invalidate stale CPM + re-render all
        }
      }
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
    });
  }

  // drag from a bar's handle onto another bar → addDependency(FS) (cycle-guarded inline).
  function _wireLinkDrag(handle, node) {
    handle.addEventListener('mousedown', function (e) {
      e.preventDefault(); e.stopPropagation();
      var host = $('se-gantt'); if (host) host.classList.add('g-link-mode');
      function up(ev) {
        document.removeEventListener('mouseup', up);
        if (host) host.classList.remove('g-link-mode');
        var tgt = document.elementFromPoint(ev.clientX, ev.clientY);
        while (tgt && tgt !== document.body && !(tgt.classList && tgt.classList.contains('g-bar'))) tgt = tgt.parentNode;
        if (!tgt || !tgt.dataset || !tgt.dataset.task || tgt.dataset.task === node.id) { status('Link cancelled'); return; }
        var r = SA().addDependency(db, node.id, tgt.dataset.task, 'FS', 0);
        if (!r.ok) {
          var why = { cycle: 'would create a CYCLE', duplicate: 'link already exists', self_loop: 'same task' }[r.reason] || r.reason;
          status('⚠ Link refused — ' + why); return;
        }
        broadcast({ op: 'add', predId: node.id, succId: tgt.dataset.task, value: 'FS' });
        status('Linked ' + node.id + ' → ' + tgt.dataset.task + ' (FS)');
        refreshFold();
      }
      document.addEventListener('mouseup', up);
    });
  }

  function onAdd() {
    var pred = $('se-add-pred').value, succ = $('se-add-succ').value;
    var type = $('se-add-type').value, lag = $('se-add-lag').value;
    var r = SA().addDependency(db, pred, succ, type, lag);
    if (!r.ok) {
      var why = { self_loop: 'a task cannot depend on itself', cycle: 'that link would create a CYCLE (refused)',
        duplicate: 'that link already exists', no_such_task: 'unknown task', missing_id: 'pick both tasks' }[r.reason] || r.reason;
      status('⚠ Not added — ' + why);
      return;
    }
    broadcast({ op: 'add', predId: pred, succId: succ, value: r.type });
    status('Added ' + r.predId + ' → ' + r.succId + ' (' + r.type + ')');
    refreshFold();
  }

  // §SE step 3 — Compute CPM over the authored DAG, then re-render with critical rail + float.
  function onComputeCpm() {
    if (!SA().computeCpm) return;
    var r = SA().computeCpm(db, schedId, { start: '2026-01-01' });
    var out = $('se-cpm-out');
    if (r.error) {
      critSet = {};
      if (out) out.textContent = r.error === 'cycle' ? '⚠ graph has a cycle' : '⚠ no tasks to compute';
    } else {
      critSet = {}; r.criticalIds.forEach(function (id) { critSet[id] = true; });
      if (out) out.textContent = 'project ' + r.projectDuration + 'd · critical ' + r.criticalIds.length + '/' + r.tasks.length;
      broadcast({ op: 'cpm', projectDuration: r.projectDuration, criticalIds: r.criticalIds });
    }
    renderWbs(); renderDeps(); renderGantt();
  }

  // After a graph edit the prior CPM is INVALID — null the computed columns (everywhere) until the
  // user recomputes, so a stale critical path can never linger on a changed graph.
  function refreshFold() {
    critSet = {};
    try {
      if (db && schedId) db.run('UPDATE tasks SET early_start=NULL, early_finish=NULL, late_start=NULL, ' +
        'late_finish=NULL, free_float=NULL, total_float=NULL, is_critical=NULL WHERE schedule_id=?', [schedId]);
    } catch (e) {}
    var o = $('se-cpm-out'); if (o) o.textContent = '';
    renderWbs(); renderDeps(); renderGantt();
  }

  // Reuse the viewer's IndexedDB cache (bim_ootb_cache / store 'dbs', keyed by URL — scene.js A.cachedFetch)
  // so the Editor does NOT re-download a whole building the viewer already streamed. The ↗ Editor button
  // passes ?db=<APP.DB_URL>, the exact key the viewer wrote, so this hits. Read-only; a miss falls through
  // to network. Opened WITHOUT a version so we never clobber the viewer's schema. (W-SE-DB-CACHE)
  function _idbGetDb(url) {
    return new Promise(function (resolve) {
      try {
        var rq = indexedDB.open('bim_ootb_cache');
        rq.onsuccess = function () {
          var idb = rq.result;
          if (!idb.objectStoreNames.contains('dbs')) { resolve(null); return; }
          try {
            var g = idb.transaction('dbs', 'readonly').objectStore('dbs').get(url);
            g.onsuccess = function () { resolve(g.result || null); };
            g.onerror = function () { resolve(null); };
          } catch (e) { resolve(null); }
        };
        rq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  // ── boot ─────────────────────────────────────────────────────────────────────
  function init() {
    if (!SA() || !SA().wbsTree) { status('engine not loaded'); return; }
    var url = resolveDbUrl();
    status('Loading ' + url.split('/').pop() + ' …');
    var initSqlJs = global.initSqlJs;
    initSqlJs({ locateFile: function (f) { return 'https://cdn.jsdelivr.net/npm/rtree-sql.js@1.7.0/dist/' + f; } })
      .then(function (SQL) {
        return _idbGetDb(url).then(function (cached) {
          if (cached) {
            console.log('§SE_DB_CACHE_HIT ' + url.split('/').pop() + ' size=' + (cached.byteLength / 1024).toFixed(0) + 'KB — skipped re-download');
            return cached;
          }
          console.log('§SE_DB_CACHE_MISS ' + url.split('/').pop() + ' — fetching');
          return fetch(url).then(function (r) {
            if (!r.ok) throw new Error('fetch ' + r.status);
            return r.arrayBuffer();
          });
        }).then(function (buf) {
          db = new SQL.Database(new Uint8Array(buf));
          console.log('§SE_DB_OPEN size=' + (buf.byteLength / 1024).toFixed(0) + 'KB url=' + url.split('/').pop());
        });
      })
      .then(function () {
        var act = SA().activeSchedule(db);
        if (!act) {
          // Blank model → seed the smart default so there's a schedule to edit (rates.js globals).
          var resM = SA().materializeDefault(db, global.SEQUENCE_RULES, { start: '2026-01-01', phaseDays: 30 });
          schedId = 'SCH_AUTHORED';
          status('Seeded default schedule (' + resM.phases.length + ' phases) — ' + url.split('/').pop());
        } else {
          schedId = act.id;
          status('Editing ' + (act.name || act.id) + ' (' + act.taskCount + ' tasks)' + (act.captured ? ' — imported' : ''));
        }
        var b = $('se-bld'); if (b) b.textContent = url.split('/').pop() + '  •  ' + (schedId);
        // §SE-4: live cross-surface sync — emit our ops + replay peers' ops on our db.
        if (global.ScheduleSync) { sync = global.ScheduleSync.create(); sync.listen(db, onSynced); }
        renderWbs(); renderDeps(); renderGantt();
        var addBtn = $('se-add-btn'); if (addBtn) addBtn.onclick = onAdd;
        var cpmBtn = $('se-cpm-btn'); if (cpmBtn) cpmBtn.onclick = onComputeCpm;
        window.addEventListener('resize', renderGantt);
      })
      .catch(function (e) { status('⚠ ' + e.message); console.error('§SE_UI ERROR', e); });
  }

  global.ScheduleEditor = { init: init, renderWbs: renderWbs, renderDeps: renderDeps, renderGantt: renderGantt, computeCpm: onComputeCpm };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
