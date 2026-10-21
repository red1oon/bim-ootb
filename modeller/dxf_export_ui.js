// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// dxf_export_ui.js — DXF2BIM lane L5 in the Modeller (prompts/DXF2BIM_MODELLER_LANE.md §L5.1): Export ▸ "2D drawings (DXF)".
// The user's IFC (the one just opened, or picked) is read by the SAME extractor core the Node tool runs (dxf2bim/ifc_extract_core.js, web-ifc wasm + sql.js),
// the standard 2D set is written by the JS port of std2d (dxf2bim/std2d.js), the markings are derived from the model (dxf2bim/std2d_marks.js, @BY=model), and a
// "drawable?" report shows what the model states and what could not be drawn, before anything is downloaded. The download is a .zip of the .dxf sheets and nothing else
// (markings live inside the DXF; no sidecar). Re-opening the sheets with Open ▸ 2D drawings (.dxf) is the round trip (witness_dxf_export_roundtrip.js).
// No unicode glyphs: Lucide line icons inline. Loads its scripts lazily on first use (none at boot). Logs §DXF-EXPORT.
(function () {
  'use strict';
  var TAG = '§DXF-EXPORT', V = '1';
  var SCRIPTS = ['lib/dxf-parser.js', 'dxf2bim/dxf2bim.js', 'dxf2bim/dxf2marks.js', 'dxf2bim/dxf2shell_config.js', 'dxf2bim_import.js', 'dxf2bim/polygon-clipping.js',
    'dxf2bim/std2d_geom.js', 'dxf2bim/std2d_dxf.js', 'dxf2bim/std2d_scopes.js', 'dxf2bim/std2d.js', 'dxf2bim/std2d_marks.js', 'dxf2bim/ifc_extract_core.js'];
  var _base = (document.currentScript && document.currentScript.src) || location.href;
  var _loaded = null;
  function loadScripts() {
    if (_loaded) return _loaded;
    _loaded = SCRIPTS.reduce(function (p, src) {
      return p.then(function () {
        if (src === 'lib/dxf-parser.js' && window.DxfParser) return null;   // already there (the importer loaded it)
        return new Promise(function (res, rej) {
          var s = document.createElement('script'); s.src = new URL(src + '?v=' + V, _base).href;
          s.onload = res; s.onerror = function () { rej(new Error('load failed ' + src)); }; document.head.appendChild(s);
        });
      });
    }, Promise.resolve()).then(function () { console.log(TAG + ' modules loaded n=' + SCRIPTS.length); return true; })
      .catch(function (e) { _loaded = null; console.error(TAG + ' ' + e.message); throw e; });
    return _loaded;
  }

  // ---- minimal ZIP (STORE) writer: CRC32 0xEDB88320, the same standard bcf_export.js uses; no compression, no library ----
  var CRC_T = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {   // files: [{name, bytes:Uint8Array}] -> Uint8Array
    var enc = new TextEncoder(), parts = [], cd = [], off = 0;
    function u16(v) { return [v & 255, (v >>> 8) & 255]; } function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }
    files.forEach(function (f) {
      var nm = enc.encode(f.name), crc = crc32(f.bytes), sz = f.bytes.length;
      var lh = [0x50, 0x4b, 3, 4].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(sz), u32(sz), u16(nm.length), u16(0));
      parts.push(new Uint8Array(lh), nm, f.bytes);
      cd.push([0x50, 0x4b, 1, 2].concat(u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(sz), u32(sz), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off)), nm);
      off += lh.length + nm.length + sz;
    });
    var cdLen = 0; cd.forEach(function (p) { cdLen += p.length; });
    var end = [0x50, 0x4b, 5, 6].concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(cdLen), u32(off), u16(0));
    var all = parts.concat(cd.map(function (p) { return new Uint8Array(p); }), [new Uint8Array(end)]), n = 0; all.forEach(function (p) { n += p.length; });
    var out = new Uint8Array(n), o = 0; all.forEach(function (p) { out.set(p, o); o += p.length; }); return out;
  }

  // ---- the pipeline: IFC bytes -> model DB (browser path) -> std set -> markings -> report ----
  var _db = null;
  function closeDb() { try { if (_db) _db.close(); } catch (e) { } _db = null; }
  // (re)write the set for a scope choice: scopes = null (one sheet per storey) | [{name, rect}] (§L6: KEY + wing sheets per storey)
  // wing (§L1.16): null | {angle, name}: the set is ONE wing drawn in its own frame (markings carry @FRAME; the importer turns it back)
  // §F7: `north` = { angle, source } from the georef, or null = not stated (undefined = not asked)
  function make(q, prefix, scopes, step, wing, north, extra) {
    var wo = {}; if (extra && extra.scaleBar === true) wo.scaleBar = true; if (extra && extra.sectionAt !== undefined) wo.sectionAt = extra.sectionAt; if (extra && extra.extent) wo.extent = extra.extent; if (extra && typeof extra.depth === 'number') wo.depth = extra.depth; if (north !== undefined) wo.north = north; if (scopes && scopes.length > 1) wo.scopes = scopes; if (wing) { wo.wing = { angle: wing.angle, name: wing.name }; if (typeof wing.turn === 'number') wo.wing.turn = wing.turn; if (wing.pivot) wo.wing.pivot = wing.pivot; }   // §F7: the 2D wand's full-circle turn and stated pivot
    var R = window.Std2d.writeStdSet(q, prefix, wo), report = window.Std2d.drawableReport(R), D = null;
    if (report.drawable) { if (step) step('Deriving markings from the model'); D = window.Std2dMarks.deriveMarks(R, { B: window.Dxf2Bim, DxfParser: window.DxfParser, hashHex: window.Dxf2BimImport.sha256Hex, MK: window.Dxf2Marks, SHC: window.Dxf2ShellConfig, SCOPES: window.Std2dScopes }, { set: prefix }); }
    return { R: R, report: report, marked: D ? D.files : null, markLog: D ? D.log : [], wings: wing ? undefined : window.Std2d.wingAngles(R.model) };
  }
  async function build(file, step, extras) {   // extras: [File] — second IFCs (e.g. the structural model) contributing only their columns (grid evidence)
    await loadScripts();
    var prefix = (file.name || 'MODEL').replace(/\.ifc$/i, '').split(/[_\s.-]/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '') || 'MODEL';
    var isDb = /\.(db|sqlite)$/i.test(file.name || '');
    step('Reading ' + file.name);
    var data = new Uint8Array(await file.arrayBuffer());
    if (isDb) {   // §L5.9: a Node-schema model .db (scripts/extractIFC2DB.js [--also structure.ifc]) skips extraction
      var ddb = new window.SQL.Database(data), has = ddb.exec("SELECT count(*) FROM sqlite_master WHERE name='element_world_bbox'")[0].values[0][0];
      if (!has) { ddb.close(); throw new Error('This .db has no element_world_bbox (not a model made by scripts/extractIFC2DB.js). Run: node scripts/extractIFC2DB.js --ifc <file.ifc> [--also <structure.ifc>] -o model.db'); }
      var qd = function (sql) { var r = ddb.exec(sql); if (!r.length) return []; return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }); };
      step('Drawing the standard set'); closeDb(); _db = ddb;
      var Md = make(qd, prefix, null, step);
      console.log(TAG + ' built (.db) file=' + file.name + ' sheets=' + Object.keys(Md.R.files).length + ' drawable=' + Md.report.drawable);
      return Object.assign({ prefix: prefix, extras: [], q: qd, scopes: null, exLog: [] }, Md);
    }
    var api = new window.WebIFC.IfcAPI(); await api.Init(function (p) { return new URL('lib/' + p, _base).href; });
    var Core = window.IfcExtractCore, sdb = new window.SQL.Database(), exLog = [];
    step('Extracting the model (web-ifc)');
    await Core.extractToDb({ WebIFC: window.WebIFC, ifcApi: api, ifcData: data, db: Core.sqljsDb(sdb), Buf: Core.browserBuf, buildingName: prefix, sourceName: file.name,
      log: function (m) { exLog.push(m); }, progress: function (m) { step(m); } });
    var qOf = function (db) { return function (sql) { var r = db.exec(sql); if (!r.length) return []; return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }); }; };
    for (var xi = 0; xi < (extras || []).length; xi++) {
      step('Reading ' + extras[xi].name + ' (columns for the grid)');
      var xdb = new window.SQL.Database(), xapi = new window.WebIFC.IfcAPI(); await xapi.Init(function (p) { return new URL('lib/' + p, _base).href; });
      await Core.extractToDb({ WebIFC: window.WebIFC, ifcApi: xapi, ifcData: new Uint8Array(await extras[xi].arrayBuffer()), db: Core.sqljsDb(xdb), Buf: Core.browserBuf, buildingName: extras[xi].name, sourceName: extras[xi].name, log: function () {}, progress: function () {} });
      Core.mergeElements(Core.sqljsDb(sdb), qOf(sdb), qOf(xdb), ['IfcColumn'], function (m) { exLog.push(m); }); xdb.close();
    }
    var q = function (sql) { var r = sdb.exec(sql); if (!r.length) return []; return r[0].values.map(function (v) { var o = {}; r[0].columns.forEach(function (c, i) { o[c] = v[i]; }); return o; }); };
    step('Drawing the standard set'); closeDb(); _db = sdb;
    var Mi = make(q, prefix, null, step);
    console.log(TAG + ' built file=' + file.name + ' sheets=' + Object.keys(Mi.R.files).length + ' drawable=' + Mi.report.drawable + ' gaps=' + Mi.R.gaps.length);
    return Object.assign({ prefix: prefix, extras: (extras || []).map(function (f) { return f.name; }), q: q, scopes: null, exLog: exLog }, Mi);
  }
  // §L6 scope operations on the current partition (always a partition of the building: split cuts one rectangle at a grid line, merge unites two that share a full edge)
  function rebuild(B, scopes) { var keep = B.wings; B.scopes = scopes && scopes.length > 1 ? scopes : null; Object.assign(B, make(B.q, B.prefix, B.scopes, null, B.wing)); if (!B.wings) B.wings = keep; return B; }
  function setWing(B, deg) { B.wing = deg === null || deg === '' || deg === undefined ? null : { angle: Number(deg), name: 'W' + Number(deg) }; return rebuild(B, null); }
  function suggestScopes(B, budget) { var sc = window.Std2dScopes.suggest(B.R, budget); return rebuild(B, sc); }
  function nameAll(B, list) { var used = new Set(); return list.map(function (s) { return { name: window.Std2dScopes.nameOf(B.R.grid, s.rect, used), rect: s.rect }; }); }
  function splitScope(B, i, axis, label) {
    var g = (axis === 'x' ? B.R.grid.x : B.R.grid.y).filter(function (l) { return l[0] === label; })[0]; if (!g) return B;
    var cut = Math.round(g[1] * 1000 * 1000) / 1000, r = B.scopes[i].rect, k = axis === 'x' ? 0 : 1; if (!(cut > r[k] && cut < r[k + 2])) return B;
    var a = r.slice(), b = r.slice(); a[k + 2] = cut; b[k] = cut;
    var list = B.scopes.slice(); list.splice(i, 1, { rect: a }, { rect: b }); return rebuild(B, nameAll(B, list));
  }
  function mergeScope(B, i, j) {
    var a = B.scopes[i].rect, b = B.scopes[j].rect, same = function (p, q) { return Math.abs(p - q) < 1e-6; }, r = null;
    if (same(a[1], b[1]) && same(a[3], b[3]) && (same(a[2], b[0]) || same(b[2], a[0]))) r = [Math.min(a[0], b[0]), a[1], Math.max(a[2], b[2]), a[3]];
    else if (same(a[0], b[0]) && same(a[2], b[2]) && (same(a[3], b[1]) || same(b[3], a[1]))) r = [a[0], Math.min(a[1], b[1]), a[2], Math.max(a[3], b[3])];
    if (!r) return B;
    var list = B.scopes.filter(function (s, n) { return n !== i && n !== j; }); list.splice(Math.min(i, j), 0, { rect: r }); return rebuild(B, nameAll(B, list));
  }
  function scopeCounts(B, name) { var n = 0; Object.keys(B.R.scoped || {}).forEach(function (v) { B.R.scoped[v].sheets.forEach(function (s) { if (s.name === name) n = Math.max(n, s.owned); }); }); return n; }

  // ---- timer (real, not an overlay): a running clock while work runs, a per-step list when it is done; shown in the panel header ----
  var TM = { t0: 0, steps: [], cur: null, total: null, iv: null, last: null };
  function tmFmt(ms) { var s = ms / 1000, m = Math.floor(s / 60); return m ? m + ':' + ('0' + (s - m * 60).toFixed(1)).slice(-4) : s.toFixed(1) + ' s'; }
  function tmStart() { TM.t0 = performance.now(); TM.steps = []; TM.cur = null; TM.total = null; TM.last = null; }
  function tmStep(label) { var now = performance.now(); if (TM.cur) TM.steps.push({ label: TM.cur.label, ms: now - TM.cur.t }); TM.cur = { label: label, t: now }; }
  function tmEnd() { var now = performance.now(); if (TM.cur) { TM.steps.push({ label: TM.cur.label, ms: now - TM.cur.t }); TM.cur = null; } TM.total = now - TM.t0; }
  function tmClockHtml() {
    var run = TM.total === null && TM.t0 > 0;
    return '<span id="dxfexp-clock" style="margin-left:auto;margin-right:10px;font:600 13px ui-monospace,monospace;color:' + (run ? '#f59e0b' : '#4ade80') + '" title="elapsed">' + CLOCK + ' ' + tmFmt(TM.total === null ? performance.now() - TM.t0 : TM.total) + '</span>';
  }
  function tmTick() { clearInterval(TM.iv); TM.iv = setInterval(function () { var el = document.getElementById('dxfexp-clock'); if (el && TM.total === null) el.lastChild.textContent = ' ' + tmFmt(performance.now() - TM.t0); else if (TM.total !== null) clearInterval(TM.iv); }, 100); }
  function tmListHtml() {
    var rows = TM.steps.concat(TM.cur ? [{ label: TM.cur.label + ' ...', ms: performance.now() - TM.cur.t }] : []);
    return '<div id="dxfexp-times" style="margin:2px 0 8px;font:11px ui-monospace,monospace;color:#8b94a5">' + rows.map(function (r) { return '<div style="display:flex;justify-content:space-between"><span>' + esc(r.label) + '</span><span>' + tmFmt(r.ms) + '</span></div>'; }).join('') +
      (TM.last ? '<div style="display:flex;justify-content:space-between;color:#c7cdd8"><span>' + esc(TM.last.label) + '</span><span>' + tmFmt(TM.last.ms) + '</span></div>' : '') + '</div>';
  }

  // ---- panel (same small-panel idiom as the Export chooser) ----
  var COL = { ok: '#4ade80', gap: '#f59e0b', info: '#64748b' };
  var CLOCK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
  var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>';
  var panel = null;
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function ensurePanel() {
    if (panel) return panel;
    panel = document.createElement('div'); panel.id = 'm-dxfexp-panel';
    panel.style.cssText = 'position:fixed;bottom:74px;right:70px;z-index:42;width:470px;max-height:80vh;overflow:auto;display:none;padding:12px;background:rgba(20,22,30,0.96);' +
      'border:1px solid #2c303a;border-radius:12px;color:#c7cdd8;font:12px system-ui,sans-serif;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 8px 30px rgba(0,0,0,0.5)';
    document.body.appendChild(panel); return panel;
  }
  function show(html) { var p = ensurePanel(); p.innerHTML = html; p.style.display = 'block'; return p; }
  function close() { if (panel) panel.style.display = 'none'; closeDb(); }
  function headHtml() { return '<div style="display:flex;align-items:center;gap:8px;margin:0 2px 8px;color:#8b94a5;letter-spacing:.12em;font-size:10px">' + ICON + '<span>2D DRAWINGS (DXF)</span>' + tmClockHtml() + '<span id="dxfexp-x" style="cursor:pointer;font-size:14px">&times;</span></div>'; }
  function bindX(p) { var x = p.querySelector('#dxfexp-x'); if (x) x.onclick = close; }
  function renderBusy(msg) { var p = show(headHtml() + '<div style="padding:6px 2px">' + esc(msg) + '...</div>' + tmListHtml()); bindX(p); tmTick(); }

  function renderReport(B, file, extras) {
    var r = B.report, h = headHtml() + '<div style="margin:0 2px 8px;color:' + (r.drawable ? '#4ade80' : '#f59e0b') + '">' + (r.drawable ? 'Drawable: the standard set was written from the model.' : 'Not drawable as a standard set: ' + esc(r.reasons.join('; ')) + '.') + '</div>';
    h += '<div style="display:flex;gap:8px;margin:0 0 10px;justify-content:flex-end">';
    h += '<button id="dxfexp-add" title="A federated set\'s structural IFC: its columns give the building grid" style="background:#23262e;color:#c7cdd8;border:1px solid #2c303a;border-radius:8px;padding:6px 10px;cursor:pointer">Add structure IFC (columns)</button>';
    h += '<button id="dxfexp-log" style="background:#23262e;color:#c7cdd8;border:1px solid #2c303a;border-radius:8px;padding:6px 10px;cursor:pointer">Copy log</button>';
    if (B.marked) h += '<button id="dxfexp-dl" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer">Download .zip (' + Object.keys(B.marked).length + ' sheets)</button>';
    h += '</div>';
    h += tmListHtml();   // per-step times of this run (+ the last action)
    var tbl = '';
    tbl += '<table style="width:100%;border-collapse:collapse">';
    r.rows.forEach(function (x) {
      tbl += '<tr><td style="vertical-align:top;padding:3px 6px 3px 2px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + COL[x.status] + '"></span></td>' +
        '<td style="padding:3px 6px 3px 0;white-space:pre">' + esc(x.label) + '</td><td style="padding:3px 6px;text-align:right;color:#e5e7eb">' + esc(x.value) + '</td></tr>' +
        '<tr><td></td><td colspan="2" style="padding:0 6px 4px 0;color:#5b6473;font-size:10.5px">' + esc(x.source) + '</td></tr>';
    });
    tbl += '</table>';
    // §L6 Sheets: one sheet per storey (default) or the building split into wings; the writer SUGGESTS a split by grid line, the user accepts or edits it (split / merge keep a partition)
    var btn = 'background:#23262e;color:#c7cdd8;border:1px solid #2c303a;border-radius:6px;padding:3px 7px;cursor:pointer;font-size:11px', sel = 'background:#14161c;color:#c7cdd8;border:1px solid #2c303a;border-radius:6px;padding:2px 4px;font-size:11px';
    h += '<div id="dxfexp-scopes" style="margin-top:12px;padding-top:10px;border-top:1px solid #2c303a"><div style="color:#8b94a5;letter-spacing:.12em;font-size:10px;margin-bottom:6px">SHEETS</div>';
    h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">Max elements per sheet <input id="dxfexp-budget" type="number" min="10" value="' + (B.budget || window.Std2dScopes.BUDGET) + '" style="width:64px;' + sel + '"> <button id="dxfexp-suggest" style="' + btn + '">Suggest a split</button>' + (B.scopes ? ' <button id="dxfexp-nosplit" style="' + btn + '">One sheet per storey</button>' : '') + '</div>';
    if (B.scopes) {
      h += '<div style="color:#5b6473;font-size:10.5px;margin-bottom:4px">' + B.scopes.length + ' wings by grid line; every element is drawn once, in the wing that owns its centre; a KEY sheet per storey carries the grid, dimensions and markings.</div>';
      B.scopes.forEach(function (sc, i) {
        var gx = B.R.grid.x.filter(function (g) { return g[1] * 1000 > sc.rect[0] && g[1] * 1000 < sc.rect[2]; }), gy = B.R.grid.y.filter(function (g) { return g[1] * 1000 > sc.rect[1] && g[1] * 1000 < sc.rect[3]; });
        var nb = B.scopes.map(function (o, j) { return j; }).filter(function (j) { if (j === i) return false; var a = sc.rect, b = B.scopes[j].rect; return (a[1] === b[1] && a[3] === b[3] && (a[2] === b[0] || b[2] === a[0])) || (a[0] === b[0] && a[2] === b[2] && (a[3] === b[1] || b[3] === a[1])); });
        h += '<div style="display:flex;gap:6px;align-items:center;padding:3px 0"><span style="min-width:132px;color:#e5e7eb">' + esc(sc.name) + '</span><span style="color:#5b6473;min-width:58px">' + scopeCounts(B, sc.name) + ' el.</span>';
        h += gx.length ? '<select data-act="sx" data-i="' + i + '" style="' + sel + '"><option value="">split at X…</option>' + gx.map(function (g) { return '<option>' + esc(g[0]) + '</option>'; }).join('') + '</select>' : '';
        h += gy.length ? '<select data-act="sy" data-i="' + i + '" style="' + sel + '"><option value="">split at Y…</option>' + gy.map(function (g) { return '<option>' + esc(g[0]) + '</option>'; }).join('') + '</select>' : '';
        h += nb.length ? '<select data-act="mg" data-i="' + i + '" style="' + sel + '"><option value="">merge with…</option>' + nb.map(function (j) { return '<option value="' + j + '">' + esc(B.scopes[j].name) + '</option>'; }).join('') + '</select>' : '';
        h += '</div>';
      });
    }
    h += '</div>';   // end of the SHEETS section; the wing section is its own block (its select must not get the sheets handlers)
    var wingsHere = (B.wings || []).filter(function (w) { return B.wings.length > 1 || w.deg !== 0; });
    if (wingsHere.length || B.wing) {   // §L1.16: a building whose walls are not on X/Y: one wing at a time, drawn in its own frame
      h += '<div id="dxfexp-wings" style="margin-top:12px;padding-top:10px;border-top:1px solid #2c303a"><div style="color:#8b94a5;letter-spacing:.12em;font-size:10px;margin-bottom:6px">WING (ROTATED FRAME)</div>';
      h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">Draw <select id="dxfexp-wing" style="' + sel + '"><option value="">the whole building</option>' + (B.wings || []).map(function (w) { return '<option value="' + w.deg + '"' + (B.wing && B.wing.angle === w.deg ? ' selected' : '') + '>wing at ' + w.deg + '\u00b0 (' + w.n + ' walls)</option>'; }).join('') + '</select></div>';
      h += '<div style="color:#5b6473;font-size:10.5px">' + (B.R.wing ? 'Wing at ' + B.R.wing.angle + '\u00b0: ' + B.R.wing.framed + ' of ' + B.R.wing.total + ' framed elements drawn straight; the rest is left out and counted, never snapped. Every sheet carries @FRAME so the importer turns the wing back into place.' : 'The walls of this building are not on X/Y. Pick a wing to draw it straight in its own frame.') + '</div></div>';
    }
    h += tbl;   // the sheets section first (the decision), the model facts below
    var p = show(h); bindX(p);
    var redo = function (fn, label) { var t0 = performance.now(); try { fn(); } catch (e) { console.error(TAG + ' ' + (e && e.stack || e)); } TM.last = { label: label || 'Update', ms: performance.now() - t0 }; renderReport(B, file, extras); };
    p.querySelector('#dxfexp-suggest').onclick = function () { B.budget = Number(p.querySelector('#dxfexp-budget').value) || window.Std2dScopes.BUDGET; renderBusy('Suggesting a split'); setTimeout(function () { redo(function () { suggestScopes(B, B.budget); }, 'Suggest a split + redraw'); }, 20); };
    var wsel = p.querySelector('#dxfexp-wing'); if (wsel) wsel.onchange = function () { var v = wsel.value; redo(function () { setWing(B, v === '' ? null : Number(v)); }, v === '' ? 'Whole building + redraw' : 'Wing ' + v + ' + redraw'); };
    var ns = p.querySelector('#dxfexp-nosplit'); if (ns) ns.onclick = function () { redo(function () { rebuild(B, null); }, 'One sheet per storey + redraw'); };
    p.querySelectorAll('#dxfexp-scopes select').forEach(function (el) {
      el.onchange = function () {
        var act = el.getAttribute('data-act'), i = Number(el.getAttribute('data-i')), v = el.value; if (v === '') return;
        redo(function () { if (act === 'mg') mergeScope(B, i, Number(v)); else splitScope(B, i, act === 'sx' ? 'x' : 'y', v); }, act === 'mg' ? 'Merge wings + redraw' : 'Split wing + redraw');
      };
    });
    p.querySelector('#dxfexp-log').onclick = function () { var t = B.R.log.concat(B.markLog).join('\n'); if (navigator.clipboard) navigator.clipboard.writeText(t); console.log(TAG + ' log lines=' + t.split('\n').length); };
    p.querySelector('#dxfexp-add').onclick = async function () {
      var f = await new Promise(function (res) { var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.ifc'; inp.onchange = function () { res(inp.files && inp.files[0] || null); }; inp.click(); });
      if (f) run(file, (extras || []).concat([f]));
    };
    var dl = p.querySelector('#dxfexp-dl');
    if (dl) dl.onclick = function () {
      var enc = new TextEncoder(), names = Object.keys(B.marked).sort(), z = zip(names.map(function (n) { return { name: n, bytes: enc.encode(B.marked[n]) }; }));
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([z], { type: 'application/zip' })); a.download = B.prefix + (B.wing ? '_W' + B.wing.angle : '') + '_2D_std.zip';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      console.log(TAG + ' downloaded ' + a.download + ' bytes=' + z.length + ' files=' + names.length);
    };
  }

  async function run(file, extras) {
    if (!file) file = window.__lastIfcFile || null;
    if (!file) {   // no IFC opened in this session: pick one (no fallback download of anything else)
      file = await new Promise(function (res) {
        var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.ifc,.db,.sqlite'; inp.onchange = function () { res(inp.files && inp.files[0] || null); }; inp.click();
      });
      if (!file) return null;
    }
    try {
      tmStart(); tmTick();
      var B = await build(file, function (m) { if (!/^tessellating/.test(m)) tmStep(m); renderBusy(m); }, extras); tmEnd(); renderReport(B, file, extras); return B;
    }
    catch (e) { console.error(TAG + ' ' + (e && e.stack || e)); var p = show(headHtml() + '<div style="color:#f59e0b">Could not read this file: ' + esc(e && e.message || e) + '</div>'); bindX(p); return null; }
  }
  window.DxfExportUI = { timer: TM, run: run, build: build, make: make, suggestScopes: suggestScopes, splitScope: splitScope, mergeScope: mergeScope, rebuild: rebuild, setWing: setWing, zip: zip, crc32: crc32, loadScripts: loadScripts, close: close };
})();
