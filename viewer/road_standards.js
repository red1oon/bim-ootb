// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// road_standards.js — §SIGN_CHECK (bim-compiler prompts/CIVIL_HIGHWAY_JELAPANG.md §SIGN_CHECK): model sign codes vs the
// ATJ 2A/85 table in std_values.json. PORTABLE like road_check.js / structural_sanity.js: dbQuery(sql, params) -> row
// objects in, plain rows out, no DOM. NO model names, GUIDs or codes live here: the table AND the "where is the code in
// the model" map (discipline + property name) both come from std_values.json (`_model_map`).
// Verdict per element: OK (code in table) · UNKNOWN (code not in table) · MISSING (no code property).
// Row shape = rule_checklist rows {guid, ifc_class, name, storey, rule, severity, ratio} + {code, detail, verdict}.
// Witness: tests/witness_sign_check.js
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.RoadStandards = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  // spacing / case / full stops only — "WD. 39a" == "wd.39A" == "WD39A"
  function norm(c) { return String(c == null ? '' : c).toUpperCase().replace(/[\s.]/g, ''); }
  // one property may name several signs ("WD. 23 & WD. 36"); each part is checked on its own
  function parts(c) { return String(c).split('&').map(norm).filter(function (x) { return x.length; }); }

  var RULE = { OK: 'sign_ok', UNKNOWN: 'sign_unknown', MISSING: 'sign_missing' };
  var SEV = { OK: 'OPTIMIZED', UNKNOWN: 'CRITICAL', MISSING: 'WARNING' };

  function checkSigns(dbQuery, std, opts) {
    var log = (opts && opts.log) || function () {};
    var mm = std && std._model_map, signs = std && std.signs;
    if (!mm || !mm.discipline || !mm.code_prop || !Array.isArray(signs)) {
      log('§SIGN_CHECK NO_DATA std_values.json has no signs / _model_map — nothing judged');
      return { rows: [], counts: { OK: 0, UNKNOWN: 0, MISSING: 0 }, vacuous: true, reason: 'no-std-data', tableSize: 0 };
    }
    var table = {};
    signs.forEach(function (s) { table[norm(s.code)] = s; });
    var els = dbQuery('SELECT guid, ifc_class, element_name AS name, storey FROM elements_meta WHERE discipline = ?', [mm.discipline]);
    if (!els.length) {
      log('§SIGN_CHECK VACUOUS no ' + mm.discipline + ' elements in this model — 0 judged (not a pass)');
      return { rows: [], counts: { OK: 0, UNKNOWN: 0, MISSING: 0 }, vacuous: true, reason: 'no-elements', tableSize: signs.length };
    }
    var codeOf = {};
    dbQuery('SELECT guid, value FROM element_psets WHERE name = ?', [mm.code_prop]).forEach(function (r) {
      if (r.value != null && String(r.value).trim() !== '' && codeOf[r.guid] == null) codeOf[r.guid] = String(r.value);
    });
    var rows = [], counts = { OK: 0, UNKNOWN: 0, MISSING: 0 };
    els.forEach(function (e) {
      var raw = codeOf[e.guid], v, detail, std1 = null;
      if (raw == null) { v = 'MISSING'; detail = 'No ' + mm.code_prop + ' property on this ' + mm.discipline + ' element'; }
      else {
        var ps = parts(raw), bad = ps.filter(function (p) { return !table[p]; });
        std1 = table[ps[0]] || null;
        if (!ps.length || bad.length) { v = 'UNKNOWN'; detail = 'Model ' + mm.code_prop + ' "' + raw + '"' + (ps.length ? ' — not in ATJ 2A/85 table: ' + bad.join(', ') : ' — empty after normalising'); }
        else {
          v = 'OK';
          detail = ps.map(function (p) { var t = table[p]; return t.code + ' ' + (t.name || '') + ' (ATJ 2A/85 p.' + t.page + ')'; }).join(' + ') + ' · model ' + mm.code_prop + ' "' + raw + '"';
        }
      }
      counts[v]++;
      rows.push({ guid: e.guid, ifc_class: e.ifc_class, name: (raw != null ? raw + ' · ' : '') + (e.name || ''), storey: e.storey || '',
        rule: RULE[v], severity: SEV[v], ratio: null, code: raw == null ? null : raw, verdict: v, detail: detail,
        stdName: std1 ? std1.name : null, stdPage: std1 ? std1.page : null });
    });
    log('§SIGN_CHECK judged=' + rows.length + ' OK=' + counts.OK + ' UNKNOWN=' + counts.UNKNOWN + ' MISSING=' + counts.MISSING +
        ' table=' + signs.length + ' codeProp=' + mm.code_prop + ' discipline=' + mm.discipline);
    return { rows: rows, counts: counts, vacuous: false, tableSize: signs.length };
  }

  // ── Pure: 4-level tree  verdict (problems first) > ATJ group (OK only) > code ×n > sign rows.
  // Group names come from std_values.json (the PDF's own grouping); UNKNOWN / MISSING have none, so skip level 2 for them.
  function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var VCOL = { UNKNOWN: '#cc4444', MISSING: '#ffaa33', OK: '#44cc44' };
  function buildTree(res, std) {
    var byNorm = {};
    ((std && std.signs) || []).forEach(function (s) { byNorm[norm(s.code)] = s; });
    var order = ['UNKNOWN', 'MISSING', 'OK'], html = '', tree = {};
    order.forEach(function (v) {
      var rows = res.rows.filter(function (r) { return r.verdict === v; });
      if (!rows.length) return;
      var inner = '';
      function codeNodes(rs) {
        var by = {}, ord = [];
        rs.forEach(function (r) { var k = r.code == null ? '(no code)' : norm(r.code); if (!by[k]) { by[k] = []; ord.push(k); } by[k].push(r); });
        return ord.map(function (k) {
          var g = by[k], label = g[0].code == null ? '(no code)' : g[0].code;
          return '<details data-lvl="3" style="margin-left:10px"><summary style="cursor:pointer;font-size:11px;color:#ddd">' + esc(label) + ' &times;' + g.length + '</summary>' +
            g.map(function (r) {
              return '<div class="rs-row" data-guid="' + esc(r.guid) + '" style="margin:2px 0 2px 14px;padding:3px 6px;border-left:3px solid ' + VCOL[v] + ';background:rgba(255,255,255,0.03);cursor:pointer;font-size:12px;color:#aaa;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(r.ifc_class + ' · ' + r.name) + '">' +
                esc(String(r.name).substring(0, 48)) + '</div>';
            }).join('') + '</details>';
        }).join('');
      }
      var groups = null;
      if (v === 'OK') {
        var gm = {}, go = [];
        rows.forEach(function (r) {
          var st = byNorm[parts(r.code)[0]], gn = (st && st.group) || '(no group)';
          if (!gm[gn]) { gm[gn] = []; go.push(gn); }
          gm[gn].push(r);
        });
        groups = go.map(function (g) { return { group: g, n: gm[g].length }; });
        inner = go.map(function (g) {
          return '<details data-lvl="2" style="margin-left:6px"><summary style="cursor:pointer;font-size:11px;color:#9ad">' + esc(g) + ' (' + gm[g].length + ')</summary>' + codeNodes(gm[g]) + '</details>';
        }).join('');
      } else inner = codeNodes(rows);
      tree[v] = { n: rows.length, groups: groups };
      html += '<details data-lvl="1" data-verdict="' + v + '"' + (v === 'OK' ? '' : ' open') + '><summary style="cursor:pointer;font-weight:600;font-size:12px;color:' + VCOL[v] + ';margin:6px 0 2px">' + v + ' (' + rows.length + ')</summary>' + inner + '</details>';
    });
    return { html: html, tree: tree };
  }

  // ── Browser glue: A.showRoadStandards() — civil-only panel, click a sign → zoom + detail card.
  function setupRoadStandards(A) {
    var PANEL = 'road-standards-panel';
    // A.dbQuery returns arrays; checkSigns reads row OBJECTS (same adapter as cpe_road_panels.js _objQuery).
    function objQuery(q, params) {
      var st = A.db.prepare(q), out = [];
      try { if (params && params.length) st.bind(params); while (st.step()) out.push(st.getAsObject()); } finally { st.free(); }
      return out;
    }
    // §RS_TOGGLE (user 2026-10-08: "the Road signs panel has no close or toggle off from the Inspect menu"): the menu row and `j` toggle;
    //   closing (any route) also clears what the panel put on the road — speed-zone colours + discs — so nothing is left behind.
    function _clearOverlays(why) {
      var n = 0; try { if (A.speedZones && A.speedZones.active && A.speedZones.active()) n = A.speedZones.revert(); } catch (e) {}
      try { if (A.chainage && A.chainage.active()) A.chainage.hide(why); } catch (e) {}   // §CHAINAGE_GRID: ribbon, tags, strip go with the panel
      console.log('§RS_TOGGLE closed via=' + why + ' zonesReverted=' + n);
    }
    A.roadStandardsOpen = function () { var p = document.getElementById(PANEL); return !!(p && p.style.display !== 'none'); };
    A.hideRoadStandards = function (why) { var p = document.getElementById(PANEL); if (p) p.style.display = 'none'; _clearOverlays(why || 'api'); };
    A.toggleRoadStandards = function () {
      if (A.roadStandardsOpen()) { A.hideRoadStandards('toggle'); return null; }
      console.log('§RS_TOGGLE open'); return A.showRoadStandards();
    };
    A.showRoadStandards = function () {
      if (!(A.isCivilModel && A.isCivilModel())) { console.log('§SIGN_CHECK VACUOUS not a civil model — Road standards is civil-only'); return null; }
      var loader = (typeof window.loadJsonWithOverrides === 'function') ? window.loadJsonWithOverrides('std_values.json?v=3', 'json_std_values') : fetch('std_values.json?v=3').then(function (r) { return r.json(); });
      return loader.then(function (std) {
        var res = checkSigns(objQuery, std, { log: console.log });
        A._roadStdResult = res; A._roadStdStd = std;
        var old = document.getElementById(PANEL); if (old) old.remove();
        var body = document.createElement('div'); body.style.cssText = 'font-size:12px;color:#ccc;max-height:60vh;overflow-y:auto';
        var bt = res.vacuous ? { html: '<div style="color:#888;padding:6px 0">Nothing to judge (' + esc(res.reason) + ').</div>', tree: {} } : buildTree(res, std);
        // layout rule (user 2026-10-08): prominent title, facts as short one-line rows, long text in a collapsed "Why / sources"
        body.innerHTML = '<div class="rs-title" style="color:#4fc3f7;font-weight:700;font-size:16px;margin-bottom:4px">Signs vs ATJ 2A/85</div>' +
          '<div class="rs-counts" style="font-size:12px;color:#ccc;display:flex;flex-wrap:wrap;gap:4px 10px"><span>' + res.rows.length + ' signs</span><span style="color:' + VCOL.OK + '">OK ' + res.counts.OK + '</span><span style="color:' + VCOL.UNKNOWN + '">UNKNOWN ' + res.counts.UNKNOWN + '</span><span style="color:' + VCOL.MISSING + '">MISSING ' + res.counts.MISSING + '</span></div>' +
          '<details class="rs-why-top" style="margin:2px 0"><summary style="cursor:pointer;font-size:12px;color:#9ad">Why / sources</summary><div style="font-size:12px;color:#aaa">Each SIGNAGE element\'s code (property ' + esc((std._model_map || {}).code_prop) + ') is looked up in the ATJ 2A/85 (Pindaan 2019) sign table in std_values.json (' + (std.signs || []).length + ' codes, page refs per code). OK = code in the table; UNKNOWN = code not in it; MISSING = no code property. Click a sign to zoom.</div></details>' +
          bt.html + '<div class="rs-card" style="margin-top:8px;padding:6px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:11px;color:#aaa;display:none"></div>';
        body.addEventListener('click', function (ev) {
          var el = ev.target.closest && ev.target.closest('.rs-row'); if (!el) return;
          var guid = el.getAttribute('data-guid'), r = res.rows.filter(function (x) { return x.guid === guid; })[0]; if (!r) return;
          var card = body.querySelector('.rs-card'); card.style.display = '';
          var kvr = function (k, v) { return '<div class="rs-kv" style="display:flex;justify-content:space-between;gap:8px;font-size:12px;padding:1px 0;border-bottom:1px solid rgba(255,255,255,0.06)"><span style="color:#888">' + k + '</span><span style="text-align:right">' + v + '</span></div>'; };
          card.innerHTML = '<div style="max-width:340px"><div class="rs-card-title" style="font-size:16px;font-weight:700;color:' + VCOL[r.verdict] + ';margin-bottom:4px">' + r.verdict + ' &middot; ' + esc(r.code || '(no code)') + '</div>' +
            kvr('Standard', esc(r.stdName || '\u2014')) + kvr('ATJ 2A/85 page', r.stdPage != null ? esc(r.stdPage) : '\u2014') + kvr('Element', esc(String(r.name).substring(0, 28))) + kvr('Class', esc(r.ifc_class)) + kvr('Verdict', esc(r.verdict)) +
            '<details class="rs-why" style="margin-top:4px"><summary style="cursor:pointer;font-size:12px;color:#9ad">Why / sources</summary><div style="font-size:12px;color:#aaa">' + esc(r.detail) + '</div></details></div>';
          console.log('§SIGN_CHECK_CLICK guid=' + guid + ' verdict=' + r.verdict + ' code=' + r.code);
          // Signs are batched/instanced (no per-guid mesh), so A.zoomToGuid would ZOOM_MISS: use the shared focus primitive
          // (Find / 3D-pick / history-restore all route through it; it frames from element_transforms).
          if (typeof A.focusElement === 'function') A.focusElement(guid);
          else if (typeof A.loadNavigate === 'function') A.loadNavigate().then(function () { if (A.focusElement) A.focusElement(guid); else if (A.zoomToGuid) A.zoomToGuid(guid); });
          else if (A.zoomToGuid) A.zoomToGuid(guid);
        });
        if (A.chainage && std._chainage_map) { try { A.chainage.read(std); } catch (e) { console.warn('§CHAINAGE_READ failed: ' + e.message); } }   // §CHAINAGE_EVERYWHERE: before Speed, so its labels are the model's chainage
        var szP = (A.speedZones && std.geometric) ? A.speedZones.mount(std, body, body.querySelector('.rs-card')) : null;   // §SPEED_ZONES section (civil-only, same panel)
        // §CHAINAGE_GRID section after Speed (it colours by the speed zones when they exist)
        if (A.chainage && std._chainage_map) Promise.resolve(szP).then(function () { try { A.chainage.mount(std, body, body.querySelector('.rs-card')); } catch (e) { console.warn('§CHAINAGE_PANEL failed: ' + e.message); } });
        var p = A.createPanel(PANEL, { closable: true, onClose: function () { _clearOverlays('close-button'); }, style: { position: 'fixed', top: '70px', left: '16px', zIndex: '1101', width: '340px', padding: '12px 14px' }, content: body });
        document.body.appendChild(p); p.style.display = '';
        console.log('§SIGN_CHECK_PANEL verdicts=' + JSON.stringify(res.counts) + ' tree=' + JSON.stringify(bt.tree));
        return res;
      });
    };
  }

  var api = { checkSigns: checkSigns, norm: norm, RULE: RULE, buildTree: buildTree, setupRoadStandards: setupRoadStandards };
  if (typeof window !== 'undefined') window.setupRoadStandards = setupRoadStandards;
  return api;
});
