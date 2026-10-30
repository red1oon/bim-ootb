// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// reg_report_ui.js — Export ▸ Regulatory Report… in the Modeller (prompts/DXF2BIM_ARCHITECT_REVIEW.md RR.6). Lazy: nothing loads at boot.
// The converted bodies (DxfImportUI.state.gate.R) -> the IFC (Dxf2Ifc.build, the same call the CLI's writeIfc makes) -> RegReport.fromModel, the ONE composition the
// CLI's --report also runs (extract with ifc_extract_core into sql.js, the shipped structural / egress engines + RuleReport, LoadSummary + Dxf2Bill via billAndLoad).
// This file owns only the form (the facts the model cannot give: one input per RegReport.FACTS key, and the rate pack) and the download. Logs §REG_REPORT_UI.
// assemble(deps, inp) is pure of the DOM so W-REG-REPORT-UI runs it in Node against the CLI's page (byte parity).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RegReportUI = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TAG = '§REG_REPORT_UI', FACTS_KEY = 'dagevu_reg_facts';
  // the owners, in load order (RoomGraph needs its four helpers before it, hallway_backbone after it: viewer/main.js's own order)
  var SCRIPTS = ['reg_report.js', 'load_summary.js', 'dxf2bim/ifc_extract_core.js', '../common/storey_raster.js', '../common/storey_footprint.js', '../common/room_habitability.js',
    '../common/room_graph.js', '../common/hallway_backbone.js', '../common/room_coverage.js', '../viewer/structural_sanity.js', '../viewer/egress_sanity.js', '../viewer/rule_report.js'];
  // the globals assemble() reads, each from the script that defines it (Dxf2Ifc, Dxf2Bill, WebIFC, SQL come with the page / the importer)
  var GLOBALS = ['RegReport', 'LoadSummary', 'IfcExtractCore', 'StoreyRaster', 'StoreyFootprint', 'RoomHabitability', 'RoomGraph', 'HallwayBackbone', 'RoomCoverage', 'StructuralSanity', 'EgressSanity', 'RuleReport'];

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // an empty input is not a fact: it is left out, so the page says "not stated"
  function factsFrom(o) { var f = {}; Object.keys(o || {}).forEach(function (k) { var v = String(o[k] == null ? '' : o[k]).trim(); if (v) f[k] = v; }); return f; }
  function formHtml(FACTS, facts, packs, pack) {
    return FACTS.map(function (f) { return '<label class="rr-f"><span>' + esc(f[1]) + '</span><input data-fact="' + esc(f[0]) + '" value="' + esc((facts || {})[f[0]] || '') + '" placeholder="not stated"></label>'; }).join('') +
      '<label class="rr-f"><span>Rate pack (the shipped file, as the CLI reads it)</span><select id="rr-pack">' + packs.map(function (p) { return '<option' + (p === pack ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select></label>';
  }

  // deps: { WebIFC, ifcApi (initialised), SQL, Core, Dxf2Ifc, RegReport, LoadSummary, Dxf2Bill, SS, ES, RRp, SR, ER, ref, packJ, sha256 }
  // inp: { gate (DxfImportUI.state.gate), sheets (DxfImportUI.state.sheets: the reader's sheets, desc.set = the drawings' @SET), facts, packName, date, tool, log }
  async function assemble(D, inp) {
    var say = inp.log || function () {}, g = inp.gate, R = g && g.R;
    if (!R || !R.els || !R.els.length) { say('§REG_REPORT refused no_bodies'); return { refused: 'no_bodies' }; }
    var RG = D.RegReport, bl = RG.billAndLoad(R.els, R.defaults_table, { LS: D.LoadSummary, BL: D.Dxf2Bill, ref: D.ref, pack: D.packJ, packName: inp.packName });
    if (bl.bill) say(bl.bill.log);
    var built = D.Dxf2Ifc.build(D.Dxf2Ifc.fromEls(R.els, R.ST), { api: D.ifcApi, WebIFC: D.WebIFC, name: 'dxf2bim.ifc', buildingType: RG.statedType(R) }), bytes = new Uint8Array(built.bytes);
    var out = await RG.fromModel({ ifcBytes: bytes, WebIFC: D.WebIFC, ifcApi: D.ifcApi, SQL: D.SQL, Core: D.Core, SR: D.SR, ER: D.ER, SS: D.SS, ES: D.ES, RRp: D.RRp,
      R: R, bill: bl.bill, loadSummary: bl.loadSummary, measures: D.Dxf2Bill.measures, facts: factsFrom(inp.facts),
      sets: (inp.sheets || []).map(function (s) { return s.desc && s.desc.set; }), sheets: (inp.sheets || []).map(function (s) { return s.name; }), setPlaceholder: D.setPlaceholder,
      date: inp.date, tool: inp.tool, packJ: D.packJ, sha256: D.sha256, leftOut: g.structure ? g.structure.left_out : null, log: say });
    out.log.forEach(say);
    say(TAG + ' built bodies=' + R.els.length + ' pack=' + (inp.packName || '-') + ' bytes=' + out.html.length + ' ifc=' + bytes.length);
    return out;
  }

  // ---- browser only below ----
  var _base = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || (typeof location !== 'undefined' ? location.href : '');
  var _loaded = null, panel = null, _last = null;   // _last: the page's last built report (W-REG-REPORT-UI U7 reads it; nothing else does)
  function loadScripts() {
    if (_loaded) return _loaded;
    var list = SCRIPTS.slice(); if (!window.LOCALE_RATE_MAP) list.push('../viewer/rates.js?v=12');   // the locale -> pack map lives in rates.js (its one owner)
    _loaded = list.reduce(function (p, src) {
      return p.then(function () { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = new URL(src, _base).href; s.onload = res; s.onerror = function () { rej(new Error('load failed ' + src)); }; document.head.appendChild(s); }); });
    }, Promise.resolve()).then(function () { var miss = GLOBALS.filter(function (k) { return !window[k]; }); if (miss.length) throw new Error('missing after load: ' + miss.join(',')); console.log(TAG + ' modules loaded n=' + list.length); })
      .catch(function (e) { _loaded = null; console.error(TAG + ' ' + e.message); throw e; });
    return _loaded;
  }
  function json(u) { return fetch(new URL(u, _base).href).then(function (r) { if (!r.ok) throw new Error(u + ' HTTP ' + r.status); return r.json(); }); }
  function packDefault() {
    var n = window.RATE_TEMPLATE_NAME, M = window.LOCALE_RATE_MAP || {}, L = window._TRL_LOADER;
    if (n && !/^hardcoded/.test(n)) return n;
    return (L && M[L.detectLocale()]) || 'cidb2024_my';   // the CLI's default when no locale maps
  }
  function savedFacts() { try { return JSON.parse(localStorage.getItem(FACTS_KEY) || '{}'); } catch (e) { return {}; } }
  function close() { if (panel) { panel.remove(); panel = null; } }

  async function open(setStat) {
    var stat = setStat || function () {}, U = window.DxfImportUI && window.DxfImportUI.state, R = U && U.gate && U.gate.R;
    if (!R || !R.els || !R.els.length) { stat('Regulatory Report: open a 2D set and Convert first — the report states the facts of the converted model'); console.log('§REG_REPORT refused no_bodies'); return null; }
    stat('Regulatory Report: loading…');
    await loadScripts();
    close();
    var packs = Object.keys(window.LOCALE_RATE_MAP || {}).map(function (k) { return window.LOCALE_RATE_MAP[k]; }).filter(function (p, i, a) { return a.indexOf(p) === i; }).sort(), pack = packDefault();
    if (packs.indexOf(pack) < 0) packs.unshift(pack);
    panel = document.createElement('div'); panel.id = 'm-regrep-panel';
    panel.style.cssText = 'position:fixed;bottom:74px;right:330px;z-index:42;width:330px;max-height:70vh;overflow:auto;padding:12px;background:rgba(20,22,30,0.96);border:1px solid #2c303a;' +
      'border-radius:12px;color:#c7cdd8;font:12px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,0.5)';
    panel.innerHTML = '<style>#m-regrep-panel .rr-f{display:block;margin:0 0 6px}#m-regrep-panel .rr-f span{display:block;color:#8a93a0;font-size:10.5px;margin-bottom:2px}' +
      '#m-regrep-panel input,#m-regrep-panel select{width:100%;box-sizing:border-box;background:#11131a;color:#e6e9ef;border:1px solid #2c303a;border-radius:6px;padding:4px 6px}' +
      '#m-regrep-panel button{background:#2b3140;color:#e6e9ef;border:1px solid #3a4152;border-radius:6px;padding:5px 10px;cursor:pointer}</style>' +
      '<div style="font-size:10px;letter-spacing:.14em;color:#5b6473;margin:0 0 6px">REGULATORY REPORT</div>' +
      '<div style="color:#8a93a0;margin-bottom:8px">Facts the model cannot give. Leave a box empty and the report says "not stated" — it never guesses one.</div>' +
      formHtml(window.RegReport.FACTS, savedFacts(), packs, pack) +
      '<div style="display:flex;gap:8px;margin-top:8px"><button id="rr-build">Build report</button><button id="rr-close">Close</button></div><div id="rr-msg" style="margin-top:6px;color:#8a93a0"></div>';
    document.body.appendChild(panel);
    panel.querySelector('#rr-close').onclick = close;
    panel.querySelector('#rr-build').onclick = function () {
      var facts = {}; panel.querySelectorAll('input[data-fact]').forEach(function (i) { facts[i.getAttribute('data-fact')] = i.value; });
      try { localStorage.setItem(FACTS_KEY, JSON.stringify(facts)); } catch (e) { /* the report still builds; the form just won't remember */ }
      var msg = panel.querySelector('#rr-msg'); msg.textContent = 'Building: the IFC, the checks, the loads, the bill…';
      build({ facts: facts, packName: panel.querySelector('#rr-pack').value }).then(function (o) { msg.textContent = o && o.html ? 'Downloaded regulatory_report.html (opened in a new tab)' : 'Not built (see the log)'; stat(msg.textContent); })
        .catch(function (e) { msg.textContent = 'Failed: ' + (e && e.message || e); console.warn(TAG + ' fail ' + (e && e.stack || e)); });
    };
    console.log(TAG + ' form facts=' + window.RegReport.FACTS.length + ' pack=' + pack + ' packs=' + packs.length);
    stat('Regulatory Report: fill the facts you have, then Build');
    return panel;
  }

  async function build(o) {
    await loadScripts();
    var U = window.DxfImportUI.state, api = new window.WebIFC.IfcAPI(); await api.Init(function (p) { return new URL('lib/' + p, _base).href; });
    var SQL = window.SQL || await window.initSqlJs({ locateFile: function (f) { return new URL('lib/' + f, _base).href; } });
    var rs = await Promise.all([json('../viewer/rates/structural_rules.json'), json('../viewer/rates/egress_rules.json'), json('../viewer/rates/' + o.packName + '.json').catch(function () { return null; }),
      U.ref ? Promise.resolve(U.ref) : json('synthetic_ref.json')]);
    var sw = await fetch(new URL('sw.js', _base).href).then(function (r) { return r.text(); }).catch(function () { return ''; }), ver = (/CACHE_VERSION = '([^']+)'/.exec(sw) || [])[1] || '?';
    var D = { WebIFC: window.WebIFC, ifcApi: api, SQL: SQL, Core: window.IfcExtractCore, Dxf2Ifc: window.Dxf2Ifc, RegReport: window.RegReport, LoadSummary: window.LoadSummary, Dxf2Bill: window.Dxf2Bill,
      setPlaceholder: window.Dxf2Suggest && window.Dxf2Suggest.SET_PLACEHOLDER, SS: window.StructuralSanity, ES: window.EgressSanity, RRp: window.RuleReport, SR: rs[0], ER: rs[1], packJ: rs[2], ref: rs[3],
      sha256: function (b) { return crypto.subtle.digest('SHA-256', b).then(function (h) { return Array.prototype.map.call(new Uint8Array(h), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }); } };
    if (!rs[2]) console.log(TAG + ' pack ' + o.packName + ' not found: the bill is left out');
    var out = await assemble(D, { gate: U.gate, sheets: U.sheets, facts: o.facts, packName: o.packName, date: window.RegReport.today(new Date()), tool: 'BIMCompiler Modeller DXF2BIM (sw ' + ver + ', Modeller)', log: function (m) { console.log(m); } });
    if (!out || !out.html) return out;
    _last = out;
    var url = URL.createObjectURL(new Blob([out.html], { type: 'text/html' })), a = document.createElement('a');
    a.href = url; a.download = 'regulatory_report.html'; document.body.appendChild(a); a.click(); a.remove();
    window.open(url, '_blank'); setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return out;
  }

  return { SCRIPTS: SCRIPTS, GLOBALS: GLOBALS, assemble: assemble, factsFrom: factsFrom, formHtml: formHtml, open: open, build: build, last: function () { return _last; } };
});
