// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/MOBILE_PERF.md WO-28 "site progress is a fold over the Requests, shown in the model". Witness: viewer/tests/witness_site_progress.js (W-SITE-PROGRESS).
//   READ THE LOG after every run: §SITE_PROGRESS  §SITE_PROGRESS_FOLD  §SITE_PROGRESS_OFF  §SITE_PROGRESS_ERR.
// ISSUE: the Find "› ERP" panel's "Show site progress" toggle. It computes NOTHING itself: erp/site_progress.js folds the Request rows (siteProgress), the processor's own resolver
//   (viewer/mission_processor.js A.requestResolver) says which elements each Request covers. This file only SHOWS the result, desktop only (flagged phone:false phoneGroup hq, loaded with the `missionproc`
//   row of APP.lazy; nothing at boot):
//   * the elements are coloured through the viewer's ONE existing tint path, A.showRuleModeTint / A.exitRuleModeTint (viewer/rule_checklist.js: an InstancedMesh of boxes per colour group from element_transforms; the
//     Sanity / Egress / clash-film findings use it) - no second colouring engine, no new material beyond that path's own one per colour group.
//   * COLOURS are the palette that path is already handed by the Structural / Egress Sanity checklists (rule_checklist.js colorMap, :824 / :889): OPTIMIZED '#44cc44' (good) = done, WARNING '#ffaa33' = open,
//     CRITICAL '#cc4444' (bad) = can't proceed; Verified = the Find highlight's own blue '#4fc3f7' (nf_highlight_cost.js _highlightGuids); New = the path's own unjudged fallback '#888888' (rule_checklist.js: colorMap
//     has no entry -> '#888888').
//   * the per-line table (planned / done / can't proceed / open / new / not issued) is drawn in #find-progress-result of the same panel.
//   * turning it off calls A.exitRuleModeTint and compares the scene with the state recorded before it was turned on (every mesh: visible flag + material colour; the scene's mesh count) -> §SITE_PROGRESS_OFF diff=
//   * A.siteProgressRefresh() re-runs fold + colouring when the toggle is on ("Get from team" calls it after it applied reports).
// Nothing is written to any table.
(function (root) {
  'use strict';
  var COLORS = { verified: '#4fc3f7', done: '#44cc44', open: '#ffaa33', cannot: '#cc4444' };   // `new` has no entry on purpose: the tint path's own '#888888'
  var NEW_COLOR = '#888888';
  function log(s) { console.log(s); }

  function setupSiteProgressView(A) {
    if (A.siteProgressToggle) return;
    var on = false, before = null, mine = null, last = null;

    // ONE record of what the tint path can change: every mesh's visible flag and material colour, and how many meshes the scene holds
    function snapshot() {
      var m = {}, n = 0;
      (A.collectMeshes ? A.collectMeshes(function (o) { return !!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh || o.isLineSegments); }) : []).forEach(function (o) {
        var c = o.material && o.material.color && o.material.color.getHexString ? o.material.color.getHexString() : (Array.isArray(o.material) ? 'multi' : 'none');
        m[o.uuid] = (o.visible ? 'v' : 'h') + ':' + c; n++;
      });
      return { by: m, n: n };
    }
    function compare(a, b) {
      var diff = 0, same = 0, k;
      for (k in a.by) { if (b.by[k] === a.by[k]) same++; else diff++; }
      for (k in b.by) if (!(k in a.by)) diff++;
      return { diff: diff, restored: same };
    }

    async function compute() {
      var db = await A._siteStore(), proj = (function () { var r = db.exec('SELECT c_project_id, note, value FROM c_project WHERE value = ?', [A.activeBuilding]); return r.length ? { id: r[0].values[0][0], note: r[0].values[0][1], value: r[0].values[0][2] } : null; })();
      if (!proj) return { proj: null };
      var SP = root.SiteProgress; if (!SP) throw new Error('erp/site_progress.js is not loaded');
      var fold = SP.siteProgress(db, proj.id, A.requestResolver(db, proj));
      return { proj: proj, fold: fold };
    }

    function paint(fold) {
      var map = {}, g;
      for (g in fold.elements) map[g] = fold.elements[g].state;
      var any = Object.keys(map).length;
      if (!any) { mine = null; return 0; }
      A.showRuleModeTint(map, COLORS, { shineThrough: true, filled: true });
      mine = (A._ruleTintMeshes || []).slice();
      return mine.reduce(function (n, m) { return n + ((m.userData && m.userData.ruleTintGuids) ? m.userData.ruleTintGuids.length : 0); }, 0);
    }

    function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function table(fold) {
      var out = document.getElementById('find-progress-result'); if (!out) return;
      var T = fold.totals, h = '<div style="margin-bottom:4px">';
      [['verified', 'Verified'], ['done', 'Done'], ['open', 'Open'], ['cannot', "Can't proceed"], ['new', 'New']].forEach(function (s) {
        h += '<span style="margin-right:10px"><span style="display:inline-block;width:9px;height:9px;background:' + (s[0] === 'new' ? NEW_COLOR : COLORS[s[0]]) + ';margin-right:3px"></span>' + s[1] + ' ' + T[s[0]] + '</span>';
      });
      h += '</div><table id="find-progress-table" style="border-collapse:collapse;width:100%"><tr style="text-align:left;color:#9aa4b2"><th>Line</th><th>Product</th><th>Planned</th><th>Done</th><th>Can\'t proceed</th><th>Open</th><th>New</th><th>Not issued</th></tr>';
      fold.lines.forEach(function (l) {
        h += '<tr data-line="' + (l.line == null ? 'none' : esc(l.line)) + '"><td>' + (l.line == null ? '(no line)' : esc(l.line)) + '</td><td>' + esc(l.product == null ? '' : l.product) + '</td><td>' + esc(l.planned) + '</td><td>' + l.done +
          '</td><td>' + l.cannot + '</td><td>' + l.open + '</td><td>' + l.new + '</td><td>' + esc(l.not_issued) + (l.excess !== '0' ? ' (+' + esc(l.excess) + ' over)' : '') + '</td></tr>';
      });
      out.innerHTML = h + '</table>';
      out.style.display = '';
    }

    function button(label) { var b = document.getElementById('find-progress-btn'); if (b) b.textContent = label; }

    async function show() {
      var out = document.getElementById('find-progress-result');
      before = snapshot();
      var r = await compute();
      if (!r.proj) { if (out) { out.style.display = ''; out.textContent = 'No Project Order for this model yet - push one with › ERP first.'; } log('§SITE_PROGRESS project=none'); before = null; return null; }
      var coloured = paint(r.fold), T = r.fold.totals;
      last = r; on = true; button('Hide site progress'); table(r.fold);
      log('§SITE_PROGRESS project=' + r.proj.value + ' requests=' + T.requests + ' elements=' + T.elements + ' verified=' + T.verified + ' done=' + T.done + ' cannot=' + T.cannot + ' open=' + T.open + ' new=' + T.new + ' lines=' + T.lines + ' coloured=' + coloured);
      return r;
    }
    function hide() {
      var removed = 0;
      if (mine && mine.length && A._ruleTintMeshes && A._ruleTintMeshes[0] === mine[0]) { removed = mine.length; A.exitRuleModeTint(); }   // R2 marker: the restore step
      mine = null; on = false; button('Show site progress');
      var out = document.getElementById('find-progress-result'); if (out) { out.style.display = 'none'; out.innerHTML = ''; }
      var c = before ? compare(before, snapshot()) : { diff: 0, restored: 0 };
      log('§SITE_PROGRESS_OFF restored=' + c.restored + ' diff=' + c.diff + ' overlay_removed=' + removed);
      before = null; last = null;
      return c;
    }

    A.siteProgressToggle = async function () {
      try { return on ? hide() : await show(); }
      catch (e) { log('§SITE_PROGRESS_ERR ' + (e && e.message)); if (A.status) A.status.textContent = 'Site progress: ' + (e && e.message); on = false; return null; }
    };
    // "Get from team" applied reports -> the same fold again, same colouring path, same table
    A.siteProgressRefresh = async function () {
      if (!on) return null;
      try {
        var r = await compute(); if (!r.proj) return null;
        var coloured = paint(r.fold), T = r.fold.totals; last = r; table(r.fold);
        log('§SITE_PROGRESS project=' + r.proj.value + ' requests=' + T.requests + ' elements=' + T.elements + ' verified=' + T.verified + ' done=' + T.done + ' cannot=' + T.cannot + ' open=' + T.open + ' new=' + T.new + ' lines=' + T.lines + ' coloured=' + coloured + ' refresh=1');
        return r;
      } catch (e) { log('§SITE_PROGRESS_ERR refresh ' + (e && e.message)); return null; }
    };
    A.siteProgressLast = function () { return last && last.fold; };
    A.siteProgressOn = function () { return on; };
    log('§SITE_PROGRESS_READY');
  }
  if (root) root.setupSiteProgressView = setupSiteProgressView;
})(typeof window !== 'undefined' ? window : null);
