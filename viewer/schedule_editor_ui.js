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
  var db = null, schedId = null, bc = null;
  var collapsed = {};   // task_id -> true when its subtree is collapsed

  function $(id) { return document.getElementById(id); }
  function status(msg) { var s = $('se-status'); if (s) s.textContent = msg; console.log('§SE_UI ' + msg); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  // ── DB resolution (config.js parity) ─────────────────────────────────────────
  function resolveDbUrl() {
    var params = new URLSearchParams(location.search);
    var ociMatch = location.href.match(/(https:\/\/objectstorage\.[^/]+\/n\/[^/]+\/b\/[^/]+\/o\/)/);
    var base = ociMatch ? ociMatch[1] : '';
    var last = null; try { last = localStorage.getItem('pwa_last_db'); } catch (e) {}
    return params.get('db') || last || (base ? base + 'Duplex_extracted.db' : 'buildings/Duplex_extracted.db');
  }

  function broadcast(detail) {
    try {
      if (!bc && typeof BroadcastChannel !== 'undefined') bc = new BroadcastChannel('bim_4d');
      if (bc) { bc.postMessage(Object.assign({ type: '4D_SCHED_EDIT', from: 'schedule_editor', schedule: schedId }, detail)); }
    } catch (e) {}
  }

  // ── STEP 1: collapsible WBS outline ──────────────────────────────────────────
  function renderWbs() {
    var host = $('se-wbs'); if (!host) return;
    host.innerHTML = '';
    var roots = SA().wbsTree(db, schedId);
    if (!roots.length) { host.appendChild(el('div', 'se-empty', 'No schedule tasks.')); return; }
    function walk(node, depth) {
      var row = el('div', 'se-wbs-row');
      row.style.paddingLeft = (depth * 18 + 6) + 'px';
      row.dataset.task = node.id;
      var hasKids = node.children && node.children.length;
      var tw = el('span', 'se-twisty', hasKids ? (collapsed[node.id] ? '▸' : '▾') : ' ');
      if (hasKids) tw.onclick = function () { collapsed[node.id] = !collapsed[node.id]; renderWbs(); };
      row.appendChild(tw);
      var nm = el('span', 'se-wbs-name' + (node.isSummary ? ' se-summary' : ''), node.name);
      row.appendChild(nm);
      if (!node.isSummary && node.guidCount) row.appendChild(el('span', 'se-badge', node.guidCount + ' el'));
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
      var row = el('div', 'se-dep-row');
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
        if (r.ok) { broadcast({ op: 'lag', predId: d.predId, succId: d.succId, value: r.lag }); status('Lag ' + d.predName + ' → ' + d.succName + ' = ' + r.lag + 'd'); }
      };
      row.appendChild(lag);
      row.appendChild(el('span', 'se-dep-arrow', '→'));
      row.appendChild(el('span', 'se-dep-succ', d.succName));
      var del = el('button', 'se-dep-del', '✕'); del.title = 'remove link';
      del.onclick = function () {
        SA().removeDependency(db, d.predId, d.succId);
        broadcast({ op: 'remove', predId: d.predId, succId: d.succId });
        status('Removed ' + d.predName + ' → ' + d.succName); renderDeps(); refreshFold();
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
    renderDeps(); refreshFold();
  }

  // Re-run cost fold if available (dependency edits don't change cost, but keep the readout live).
  function refreshFold() { /* CPM/date ripple = §SE step 3+; this slice only edits the graph. */ }

  // ── boot ─────────────────────────────────────────────────────────────────────
  function init() {
    if (!SA() || !SA().wbsTree) { status('engine not loaded'); return; }
    var url = resolveDbUrl();
    status('Loading ' + url.split('/').pop() + ' …');
    var initSqlJs = global.initSqlJs;
    initSqlJs({ locateFile: function (f) { return 'https://cdn.jsdelivr.net/npm/rtree-sql.js@1.7.0/dist/' + f; } })
      .then(function (SQL) {
        return fetch(url).then(function (r) {
          if (!r.ok) throw new Error('fetch ' + r.status);
          return r.arrayBuffer();
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
        renderWbs(); renderDeps();
        var addBtn = $('se-add-btn'); if (addBtn) addBtn.onclick = onAdd;
      })
      .catch(function (e) { status('⚠ ' + e.message); console.error('§SE_UI ERROR', e); });
  }

  global.ScheduleEditor = { init: init, renderWbs: renderWbs, renderDeps: renderDeps };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : this);
