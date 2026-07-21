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
  var db = null, schedId = null, sync = null, _dbUrl = null;
  var collapsed = {};   // task_id -> true when its subtree is collapsed
  var critSet = {};     // task_id -> true after a CPM run (drives the red rail + bold links)
  // §SE-5b: Gantt tick-density zoom (Day/Week/Month). The chart always fits the WHOLE project span into
  // the available width (no pan/scroll) — "zoom" here changes how granular the axis ticks/labels are,
  // not the visible time range. Honest framing: a scale-zoom (with panning) is the natural next slice.
  var _zoom = 'week';
  var ZOOM_MIN_STEP = { day: 1, week: 7, month: 30 };

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

  // ── §SE-5b WBS tree lookups (indent/outdent need "where does this node sit") ────────────────
  function _findNode(roots, id) {
    for (var i = 0; i < roots.length; i++) {
      if (roots[i].id === id) return roots[i];
      var f = _findNode(roots[i].children || [], id);
      if (f) return f;
    }
    return null;
  }
  function _siblingsAndIndex(roots, node) {
    var container = node.parent ? ((_findNode(roots, node.parent) || {}).children || []) : roots;
    return { siblings: container, index: container.indexOf(node) };
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
      // §SE-WBS deepen-the-tree actions: outdent/indent · add a sub-task (any node) · break a leaf down
      var act = el('span', 'se-row-actions');
      if (node.parent) {
        var si = _siblingsAndIndex(roots, node);
        var outBtn = el('button', 'se-indent-btn', '⇤'); outBtn.title = 'Outdent (promote one level)';
        outBtn.onclick = function (ev) { ev.stopPropagation(); doOutdent(node.id); };
        act.appendChild(outBtn);
        var inBtn = el('button', 'se-indent-btn', '⇥'); inBtn.title = 'Indent (nest under the previous row)';
        inBtn.disabled = si.index <= 0;
        inBtn.onclick = function (ev) { ev.stopPropagation(); doIndent(node.id); };
        act.appendChild(inBtn);
      }
      var addBtn = el('button', 'se-add-sub-btn', '+'); addBtn.title = 'Add a sub-task under ' + node.name;
      addBtn.onclick = function (ev) { ev.stopPropagation(); doAddTask(node.id, node.name); };
      act.appendChild(addBtn);
      if (!node.isSummary && node.guidCount > 1) {
        var sel = el('select'); sel.title = 'Break this phase into sub-tasks grouped by…';
        sel.appendChild(new Option('break by…', ''));
        ['storey', 'type', 'discipline'].forEach(function (o) { sel.appendChild(new Option(o, o)); });
        sel.onclick = function (ev) { ev.stopPropagation(); };
        sel.onchange = function () { if (sel.value) doBreakdown(node.id, sel.value); };
        act.appendChild(sel);
      }
      row.appendChild(act);
      host.appendChild(row);
      if (hasKids && !collapsed[node.id]) node.children.forEach(function (c) { walk(c, depth + 1); });
    }
    roots.forEach(function (r) { walk(r, 0); });
  }

  // §SE-5b indent/outdent — reparent one WBS node relative to its current position, broadcast the
  // signed op so peer surfaces converge, then refreshFold() (invalidates stale CPM, re-renders all).
  function doIndent(taskId) {
    var roots = SA().wbsTree(db, schedId);
    var node = _findNode(roots, taskId); if (!node) return;
    var si = _siblingsAndIndex(roots, node);
    if (si.index <= 0) { status('Cannot indent - no preceding row at this level to nest under'); return; }
    var newParent = si.siblings[si.index - 1].id;
    var r = SA().reparentTask(db, schedId, taskId, newParent);
    if (!r.ok) { status('Indent refused - ' + r.reason); return; }
    broadcast({ op: 'reparent', schedId: schedId, taskId: taskId, wbsParent: newParent });
    collapsed[newParent] = false;
    status('Indented "' + node.name + '" under "' + si.siblings[si.index - 1].name + '"');
    refreshFold();
  }
  function doOutdent(taskId) {
    var roots = SA().wbsTree(db, schedId);
    var node = _findNode(roots, taskId); if (!node || !node.parent) { status('Cannot outdent - already at top level'); return; }
    var parentNode = _findNode(roots, node.parent);
    var newParent = parentNode ? parentNode.parent : null;
    var r = SA().reparentTask(db, schedId, taskId, newParent);
    if (!r.ok) { status('Outdent refused - ' + r.reason); return; }
    broadcast({ op: 'reparent', schedId: schedId, taskId: taskId, wbsParent: newParent });
    status('Outdented "' + node.name + '"');
    refreshFold();
  }

  // §SE-WBS — deepen the WBS: add a sub-task, or auto-split a phase by an element attribute. Each edit runs
  // the engine verb on our db, broadcasts a deterministic op so peer surfaces (2nd tab, the Viewer TM) converge,
  // then refreshFold() invalidates any stale CPM and re-renders. New leaves inherit the parent's date window.
  function doAddTask(parentId, parentName) {
    var name = (window.prompt('New sub-task under "' + parentName + '":', 'New task') || '').trim();
    if (!name) return;
    var r = SA().addTask(db, schedId, { name: name, wbsParent: parentId });
    if (!r || !r.ok) { status('add sub-task failed: ' + (r && r.reason)); return; }
    broadcast({ op: 'addtask', schedId: schedId, taskId: r.taskId, name: name, wbsParent: parentId });
    status('added "' + name + '" under ' + parentName);
    collapsed[parentId] = false;   // reveal the new child
    refreshFold();
  }
  function doBreakdown(taskId, attr) {
    var r = SA().breakdownByAttribute(db, schedId, taskId, attr);   // 'type' maps to ifc_class in the engine
    if (!r || !r.ok) {
      status('break down: ' + (r && r.reason === 'single_group' ? ('only one ' + attr + ' here — nothing to split')
        : (r && r.reason === 'no_elements' ? 'no elements on this task' : (r && r.reason))));
      renderWbs(); return;
    }
    broadcast({ op: 'breakdown', schedId: schedId, taskId: taskId, attr: attr });
    status('split into ' + r.groups.length + ' sub-tasks by ' + attr);
    collapsed[taskId] = false;
    refreshFold();
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

    // axis: tick DENSITY follows the Day/Week/Month zoom pick (whole span always fits — no pan yet).
    var axis = el('div', 'g-axis');
    var baseStep = ZOOM_MIN_STEP[_zoom] || 7;
    var stepDays = Math.max(baseStep, Math.ceil(totalDays / 8 / baseStep) * baseStep);
    for (var d = 0; d <= totalDays; d += stepDays) {
      var tick = el('div', 'g-tick', addDays(min, d));
      tick.style.left = (d * pxPerDay) + 'px';
      axis.appendChild(tick);
    }
    host.appendChild(axis);

    // §SE-5b today marker — a vertical line at "now" if it falls inside the rendered span.
    var todayISO = new Date().toISOString().slice(0, 10);
    if (todayISO >= min && todayISO <= max) {
      var todayLine = el('div', 'g-today-line');
      todayLine.style.left = (daysBetween(min, todayISO) * pxPerDay) + 'px';
      todayLine.title = 'Today (' + todayISO + ')';
      host.appendChild(todayLine);
    }

    leaves.forEach(function (n) {
      var dur = daysBetween(n.start, n.finish);
      var off = daysBetween(min, n.start);
      var row = el('div', 'g-row');
      row.appendChild(el('div', 'g-label', n.name));
      var track = el('div', 'g-track');
      // §SE-5b milestone — a 0-day task (start===finish) renders as a diamond, not a bar.
      if (dur === 0) {
        var ms = el('div', 'g-milestone' + (n.critical ? ' crit' : ''));
        ms.style.left = (off * pxPerDay) + 'px';
        ms.dataset.task = n.id;
        ms.title = n.name + '  ' + n.start + ' (milestone)';
        track.appendChild(ms);
      } else {
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
      }
      row.appendChild(track);
      host.appendChild(row);
    });
    console.log('§SE_GANTT bars=' + leaves.length + ' span=' + min + '..' + max + ' days=' + totalDays + ' zoom=' + _zoom);
  }

  // §SE-5b — switch tick-density zoom and re-render; keeps the active button highlighted.
  function setZoom(z) {
    if (!ZOOM_MIN_STEP[z] || z === _zoom) return;
    _zoom = z;
    document.querySelectorAll('.zoom-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.zoom === z); });
    renderGantt();
    console.log('§SE_ZOOM ' + z);
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
    persist();
  }

  // §SE-6: debounced write-back to the SAME IndexedDB cache slot the building was loaded from — the
  // gap that made every schedule edit vanish on tab close (see schedule_author.js persistDb doc).
  // Called from BOTH mutation choke points below (refreshFold covers WBS/dep/date/reparent edits;
  // onComputeCpm doesn't route through refreshFold, so it calls persist() directly above).
  function persist(opts) {
    if (!SA().persistDb || !db || !_dbUrl) return;
    SA().persistDb(db, _dbUrl, opts);
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
    persist();
  }

  // Reuse the viewer's IndexedDB cache (bim_ootb_cache / store 'dbs', keyed by URL — scene.js A.cachedFetch)
  // so the Editor does NOT re-download a whole building the viewer already streamed. The ↗ Editor button
  // passes ?db=<APP.DB_URL>, the exact key the viewer wrote, so this hits. Read-only; a miss falls through
  // to network. §SE-6: routed through ScheduleAuthor.openBuildingCache — a bare unversioned open used
  // to silently create a store-less db if the Editor was the FIRST surface to ever touch it in a fresh
  // profile (caught live by W-SCHED-PERSIST); the shared opener self-heals that via a versioned
  // onupgradeneeded, so read and write now use the exact same, robust opener.
  function _idbGetDb(url) {
    return SA().openBuildingCache().then(function (idb) {
      return new Promise(function (resolve) {
        if (!idb || !idb.objectStoreNames.contains('dbs')) { resolve(null); return; }
        try {
          var g = idb.transaction('dbs', 'readonly').objectStore('dbs').get(url);
          g.onsuccess = function () { resolve(g.result || null); };
          g.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    }).catch(function () { return null; });
  }

  // ── §X5: import a Primavera P6 programme (.xer / PMXML .xml) into THIS editor's db ──────────────
  // Adopt via ForeignSchedule into the live in-memory db, switch the editor to the adopted schedule,
  // and re-render — the imported WBS, dependencies, CPM and Gantt appear immediately. task_elements
  // stays empty (P6 carries no model guids); binding is the separate ✎ Author / assignElement craft.
  function doImportP6(file) {
    var FSx = global.ForeignSchedule;
    if (!FSx) { status('⚠ foreign_schedule.js not loaded'); return; }
    if (!db) { status('⚠ no model db open yet'); return; }
    var rdr = new FileReader();
    rdr.onload = function () {
      try {
        var txt = String(rdr.result);
        var det = FSx.parseForeign(txt, file.name);   // sniff P6-XER / P6-XML(PMXML) / MS Project(MSPDI)
        var data = FSx.toScheduleData(det.parsed);
        FSx.adoptIntoDb(db, data);
        schedId = data.schedules[0].id;
        var b = $('se-bld'); if (b) b.textContent = (file.name) + '  •  ' + schedId;
        // §B3 — auto-bind by convention (opt-in, reviewable). If the file carried @disc:class tokens
        // (data.tasks[].bindSelector → stored task_bind_selectors) AND the checkbox is on, resolve them
        // now and report the pre-bound counts. The binding is the signed task_elements (rename-proof) and
        // the user can adjust/clear it per task — a deterministic SUGGESTION, never a silent assertion.
        var tokened = data.tasks.filter(function (t) { return t.bindSelector; }).length;
        var ab = $('se-autobind-cb'); var bindMsg = '';
        if (tokened && (!ab || ab.checked) && FSx.autoBind) {
          var r = FSx.autoBind(db, schedId);
          bindMsg = ' Pre-bound ' + r.bound + ' elements across ' + r.perActivity.length +
            ' activities by convention' + (r.unresolved.length ? ' (' + r.unresolved.length + ' selector(s) matched nothing — review)' : '') +
            ' — review/clear per task in ✎ Author. ';
          console.log('§SE_AUTOBIND schedule=' + schedId + ' bound=' + r.bound +
            ' activities=' + r.perActivity.length + ' unresolved=' + r.unresolved.length);
        } else if (tokened) {
          bindMsg = ' (' + tokened + ' activities carry a bind token — tick "auto-bind by convention" to resolve.) ';
        }
        collapsed = {}; critSet = {};
        renderWbs(); renderDeps(); renderGantt(); fillAddForm();
        persist();   // §SE-6 — an imported P6 programme is a real edit, save it
        status('Imported ' + det.format + ' "' + file.name + '" → ' +
          data._meta.summaryCount + ' WBS / ' + data._meta.leafCount + ' activities / ' +
          data.taskSequences.length + ' links — press ▶ Compute CPM for the critical path.' + bindMsg +
          (bindMsg ? '' : ' Bind tasks to elements in the viewer ✎ Author to make it 4D.'));
        console.log('§SE_IMPORT_P6 file=' + file.name + ' format=' + det.format +
          ' schedule=' + schedId + ' wbs=' + data._meta.summaryCount + ' activities=' + data._meta.leafCount +
          ' tokened=' + tokened);
      } catch (e) { status('⚠ import failed: ' + e.message); console.error('§SE_IMPORT_P6 ERROR', e); }
    };
    rdr.readAsText(file);
  }

  // ── Generate/Regenerate — the Editor's own entry point to the smart default (mirrors the ✎ Author
  // wizard's "Generate first draft"/"Regenerate" button; §SE-5a's idempotent-rebuild transaction wrap
  // already makes materializeDefault safe to re-run). Same captured-schedule guard as Author: never
  // overwrite an imported P6/Bonsai/Revit programme with the rule-generated default.
  function doGenerate() {
    if (!db) { status('⚠ no model db open yet'); return; }
    if (!SA()) { status('⚠ engine not loaded'); return; }
    var act = SA().activeSchedule(db);
    if (act && act.captured) {
      status('This model already carries an imported schedule (' + act.name + ') — editing it in place, not regenerating.');
      return;
    }
    status('Materializing default schedule — please wait…');
    setTimeout(function () {
      var res = SA().materializeDefault(db, global.SEQUENCE_RULES, { start: '2026-01-01', phaseDays: 30 });
      schedId = res.scheduleId;
      collapsed = {}; critSet = {};
      renderWbs(); renderDeps(); renderGantt(); fillAddForm();
      persist();   // §SE-6 — a (re)generated default is itself an edit worth saving
      status('Generated default schedule (' + res.phases.length + ' phases, ' + res.assignmentCount + ' elements assigned).');
      console.log('§SE_GENERATE schedule=' + schedId + ' phases=' + res.phases.length + ' assignments=' + res.assignmentCount);
    }, 30);
  }

  // ── §X6: export the current schedule to MS Project XML (MSPDI) — the write-side counterpart to
  // doImportP6's MSPDI read path (foreign_schedule.js parseMSPDI). Schema/units verified AGAINST that
  // parser (not invented): OutlineLevel-encoded hierarchy (no parent-id field in MSPDI — hierarchy is
  // walked pre-order from wbsTree and re-derived from nesting on read), Duration = 'PT{hours}H0M0S',
  // LinkLag = integer TENTHS OF A MINUTE, PredecessorLink/Type = 0=FF/1=FS/2=SF/3=SS (MSP_TYPE reverse).
  // 8h/day calendar (MinutesPerDay=480) — the same convention doImportP6's default hpd=8 fallback uses.
  function exportMSProject() {
    if (!db || !schedId || !SA() || !SA().wbsTree) { status('⚠ no schedule to export'); return; }
    var tree = SA().wbsTree(db, schedId);
    if (!tree.length) { status('⚠ no tasks to export'); return; }
    var deps = SA().listDependencies ? SA().listDependencies(db, schedId) : [];
    var predByTask = {};
    deps.forEach(function (d) { (predByTask[d.succId] = predByTask[d.succId] || []).push(d); });

    var HPD = 8, MPD = HPD * 60;
    var TYPE_CODE = { FS: 1, SS: 3, FF: 0, SF: 2 };
    function xmlEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function durTag(start, finish) {
      if (!start || !finish) return 'PT0H0M0S';
      var days = Math.max(1, daysBetween(start, finish));
      return 'PT' + (days * HPD) + 'H0M0S';
    }

    var uid = {}, seq = 1, rows = [];
    (function walk(nodes, level) {
      nodes.forEach(function (n) {
        uid[n.id] = seq++;
        rows.push({ n: n, level: level });
        if (n.children && n.children.length) walk(n.children, level + 1);
      });
    })(tree, 1);

    var xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
      '<Project xmlns="http://schemas.microsoft.com/project">',
      '<Name>' + xmlEsc((_dbUrl || 'schedule').split('/').pop()) + '</Name>',
      '<MinutesPerDay>' + MPD + '</MinutesPerDay>',
      '<Tasks>'];
    rows.forEach(function (r) {
      var n = r.n, u = uid[n.id];
      var links = predByTask[n.id] || [];
      xml.push('<Task>' +
        '<UID>' + u + '</UID><ID>' + u + '</ID>' +
        '<Name>' + xmlEsc(n.name) + '</Name>' +
        '<OutlineLevel>' + r.level + '</OutlineLevel>' +
        '<Summary>' + (n.isSummary ? 1 : 0) + '</Summary>' +
        (n.start ? '<Start>' + n.start + 'T08:00:00</Start>' : '') +
        (n.finish ? '<Finish>' + n.finish + 'T17:00:00</Finish>' : '') +
        '<Duration>' + durTag(n.start, n.finish) + '</Duration>' +
        (n.critical ? '<Critical>1</Critical>' : '') +
        links.map(function (l) {
          var lagTenths = Math.round((l.lag || 0) * HPD * 60 * 10);
          return '<PredecessorLink><PredecessorUID>' + uid[l.predId] + '</PredecessorUID>' +
            '<Type>' + (TYPE_CODE[l.type] != null ? TYPE_CODE[l.type] : 1) + '</Type>' +
            '<LinkLag>' + lagTenths + '</LinkLag></PredecessorLink>';
        }).join('') +
        '</Task>');
    });
    xml.push('</Tasks></Project>');

    var blob = new Blob([xml.join('')], { type: 'application/xml' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (_dbUrl || 'schedule').split('/').pop().replace(/\.[a-z0-9]+$/i, '') + '_schedule.xml';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    status('Exported ' + rows.length + ' tasks / ' + deps.length + ' links to MS Project XML (' + a.download + ').');
    console.log('§SE_EXPORT_MSP tasks=' + rows.length + ' links=' + deps.length + ' file=' + a.download);
  }

  // ── §X7: export the current schedule to Primavera P6 PMXML / XER (prompts/XER_PMXML_WRITER_LANE.md)
  // — the write-side counterpart to doImportP6's PMXML/XER read path (foreign_schedule.js parsePMXML/
  // parseXER). SAME (tree, deps) input exportMSProject already reads — ForeignSchedule.toPMXML/toXER
  // are pure serializers, no new data plumbing. W-XER-ROUNDTRIP/W-PMXML-ROUNDTRIP (erp/tests/
  // xer_pmxml_writer_witness.js) prove mismatch=0 re-parsing the writer's own output with our reader.
  function _exportP6(kind, writeFn, ext, mime, label) {
    if (!db || !schedId || !SA() || !SA().wbsTree) { status('⚠ no schedule to export'); return; }
    var FSx = global.ForeignSchedule;
    if (!FSx || !FSx[writeFn]) { status('⚠ foreign_schedule.js not loaded'); return; }
    var tree = SA().wbsTree(db, schedId);
    if (!tree.length) { status('⚠ no tasks to export'); return; }
    var deps = SA().listDependencies ? SA().listDependencies(db, schedId) : [];
    var name = (_dbUrl || 'schedule').split('/').pop().replace(/\.[a-z0-9]+$/i, '');
    var out = FSx[writeFn](tree, deps, { hpd: 8, projectId: schedId, projectName: name });

    var blob = new Blob([out], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name + '_schedule.' + ext;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

    var leafCount = 0; (function walk(ns) { (ns || []).forEach(function (n) { if (!n.isSummary) leafCount++; walk(n.children); }); })(tree);
    status('Exported ' + leafCount + ' tasks / ' + deps.length + ' links to ' + label + ' (' + a.download +
      '). Some fields (WBS code, EPS-level activity codes, resource assignments, global calendars, ' +
      'baselines) are not carried — P6 itself drops most of these on cross-DB import.');
    console.log('§SE_EXPORT_' + kind + ' tasks=' + leafCount + ' links=' + deps.length + ' file=' + a.download);
  }
  function exportPMXML() { _exportP6('PMXML', 'toPMXML', 'xml', 'application/xml', 'Primavera PMXML'); }
  function exportXER() { _exportP6('XER', 'toXER', 'xer', 'text/plain', 'Primavera XER'); }

  // ── boot ─────────────────────────────────────────────────────────────────────
  function init() {
    if (!SA() || !SA().wbsTree) { status('engine not loaded'); return; }
    var url = resolveDbUrl();
    _dbUrl = url;
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
        if (act) {
          schedId = act.id;
          status('Editing ' + (act.name || act.id) + ' (' + act.taskCount + ' tasks)' + (act.captured ? ' — imported' : ''));
          return;
        }
        // Blank model → seed the smart default so there's a schedule to edit (rates.js globals).
        // §SE-5a fixed the multi-second freeze (transaction-wrapped bulk write), but a large building
        // is still real work (~1-2s) — paint a "please wait" status FIRST (setTimeout yields one frame
        // to the renderer) so the tab visibly acknowledges the load instead of looking frozen.
        status('Materializing default schedule for ' + url.split('/').pop() + ' — please wait…');
        return new Promise(function (resolve) {
          setTimeout(function () {
            var resM = SA().materializeDefault(db, global.SEQUENCE_RULES, { start: '2026-01-01', phaseDays: 30 });
            schedId = 'SCH_AUTHORED';
            status('Seeded default schedule (' + resM.phases.length + ' phases) — ' + url.split('/').pop());
            persist();   // §SE-6 — the freshly-seeded schedule is itself an edit worth saving
            resolve();
          }, 30);
        });
      })
      .then(function () {
        var b = $('se-bld'); if (b) b.textContent = url.split('/').pop() + '  •  ' + (schedId);
        // §SE-4: live cross-surface sync — emit our ops + replay peers' ops on our db.
        if (global.ScheduleSync) { sync = global.ScheduleSync.create(); sync.listen(db, onSynced); }
        renderWbs(); renderDeps(); renderGantt();
        var addBtn = $('se-add-btn'); if (addBtn) addBtn.onclick = onAdd;
        var cpmBtn = $('se-cpm-btn'); if (cpmBtn) cpmBtn.onclick = onComputeCpm;
        var genBtn = $('se-generate-btn'); if (genBtn) genBtn.onclick = doGenerate;
        var expBtn = $('se-export-msp-btn'); if (expBtn) expBtn.onclick = exportMSProject;
        var expPmxmlBtn = $('se-export-pmxml-btn'); if (expPmxmlBtn) expPmxmlBtn.onclick = exportPMXML;
        var expXerBtn = $('se-export-xer-btn'); if (expXerBtn) expXerBtn.onclick = exportXER;
        var impBtn = $('se-import-btn'), impFile = $('se-import-file');
        if (impBtn && impFile) {
          impBtn.onclick = function () { impFile.click(); };
          impFile.onchange = function () { if (impFile.files && impFile.files[0]) doImportP6(impFile.files[0]); impFile.value = ''; };
        }
        document.querySelectorAll('.zoom-btn').forEach(function (b) {
          b.classList.toggle('active', b.dataset.zoom === _zoom);
          b.onclick = function () { setZoom(b.dataset.zoom); };
        });
        window.addEventListener('resize', renderGantt);
        // §SE-6: an immediate (non-debounced) flush when the tab is backgrounded/closed — the
        // debounced 1.2s save covers the common case, this is the safety net for "closed right after
        // an edit." visibilitychange (not beforeunload) per Chrome's own guidance — more reliably
        // fires before a tab actually goes away (bfcache/close), and the write can still complete.
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'hidden') persist({ immediate: true });
        });
      })
      .catch(function (e) { status('⚠ ' + e.message); console.error('§SE_UI ERROR', e); });
  }

  global.ScheduleEditor = { init: init, renderWbs: renderWbs, renderDeps: renderDeps, renderGantt: renderGantt, computeCpm: onComputeCpm, setZoom: setZoom, exportMSProject: exportMSProject, exportPMXML: exportPMXML, exportXER: exportXER };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
